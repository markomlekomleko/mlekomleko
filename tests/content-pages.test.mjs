import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
const env = { APP_ENV:'local',APP_ORIGIN:'http://localhost',ADMIN_LEGACY_ACCESS:'true',ADMIN_SECRET:'content-test',EMAIL_MODE:'console',BADI_MODE:'disabled',PAYMENT_MODE:'disabled' };
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker=(await import('../dist/server/index.js')).default;
let database;
beforeEach(()=>{database=createDatabase();env.DB=database;});
afterEach(()=>database.close());
async function api(path, data, {admin=true, origin='http://localhost', method='POST'}={}) {
 return worker.fetch(new Request('http://localhost'+path,{method,headers:{'content-type':'application/json',...(origin?{Origin:origin}:{}),...(admin?{'x-admin-secret':'content-test'}:{})},...(method==='GET'?{}:{body:JSON.stringify(data)})}),env,{waitUntil(){},passThroughOnException(){}});
}
const page=()=>({slug:'test-'+randomUUID(),title:'Sveže mleko',description:'Dostava mleka.',intro:'Od farme do doma.',sections:[{heading:'Dostava',text:'Jednom nedeljno.'}],status:'draft'});
const save=data=>api('/api/admin/content-pages',data);
test('SEO page permission, CSRF, validation and draft visibility',async()=>{
 const data=page();
 assert.equal((await api('/api/admin/content-pages',null,{admin:false,method:'GET'})).status,403);
 assert.equal((await api('/api/admin/content-pages',data,{origin:'https://other.test'})).status,403);
 assert.equal((await save({...data,slug:'../admin'})).status,422);
 assert.equal((await save({...data,status:'any'})).status,422);
 assert.equal((await save({...data,sections:[{heading:'missing body'}]})).status,422);
 const response=await save(data);assert.equal(response.status,200,await response.clone().text());
 assert.equal((await api('/informacije/'+data.slug,null,{admin:false,method:'GET'})).status,404);
});
test('concurrent SEO updates keep exactly one version and one audit record',async()=>{
 const data=page(),created=(await (await save(data)).json()).page;
 const results=await Promise.all([save({...data,title:'Prva',expectedVersion:created.version}),save({...data,title:'Druga',expectedVersion:created.version})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(database.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='content_page.saved'").get().n,2);
 assert.equal(database.raw.prepare('SELECT COUNT(*) AS n FROM mutation_guards').get().n,0);
 assert.equal((await save({...data,expectedVersion:created.version})).status,409);
});
test('publish adds canonical, escaped content and sitemap; unpublish removes route',async()=>{
 const data={...page(),status:'published',sections:[{heading:'Podnaslov',text:'<script>window.evil=true</script>'}]};
 const created=await save(data);assert.equal(created.status,200,await created.clone().text());
 const current=(await created.json()).page;
 const publicResponse=await api('/informacije/'+data.slug,null,{admin:false,method:'GET'});
 assert.equal(publicResponse.status,200);
 const html=await publicResponse.text();assert.ok(html.includes('<h1>Sveže mleko</h1>'));assert.ok(html.includes('<h2>Podnaslov</h2>'));assert.ok(!html.includes('<script>window.evil=true</script>'));
 assert.ok((await (await api('/sitemap.xml',null,{admin:false,method:'GET'})).text()).includes('/informacije/'+data.slug));
 assert.equal((await save({...data,status:'draft',expectedVersion:current.version})).status,200);
 assert.equal((await api('/informacije/'+data.slug,null,{admin:false,method:'GET'})).status,404);
 assert.ok(!(await (await api('/sitemap.xml',null,{admin:false,method:'GET'})).text()).includes('/informacije/'+data.slug));
});
