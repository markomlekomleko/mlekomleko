import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@libsql/client';
import { postgresConfig, postgresSchema, postgresUrl } from '../db/postgres-config.mjs';
import { postgresSql } from '../db/postgres-sql.mjs';
import { deliveryAddressError, deliveryCityForPostalCode, normalizeDeliveryCity } from '../app/lib/delivery-area.ts';
import { prepareCustomerImport, applyCustomerImport, parseCustomerCsv } from '../integrations/customer-import.mjs';

const args=process.argv.slice(2), option=name=>args[args.indexOf(name)+1];
if(!args.includes('--file')||!args.includes('--batch')||!args.includes('--report'))throw new Error('Obavezno: --file kupci.csv|xlsx --batch grupa --report izvestaj.json. Probni režim je podrazumevan. Konačno: --apply --approved-hash HASH.');
const file=option('--file');
let rows;
if(extname(file).toLowerCase()==='.xlsx'){
  const result=spawnSync(process.env.IMPORT_PYTHON||'python3',[fileURLToPath(new URL('./read-customer-xlsx.py',import.meta.url)),file],{encoding:'utf8',maxBuffer:20*1024*1024});
  if(result.status!==0)throw new Error(result.stderr||'Čitanje XLSX fajla nije uspelo.');rows=JSON.parse(result.stdout);
}else if(extname(file).toLowerCase()==='.csv')rows=parseCustomerCsv(await readFile(file,'utf8'));
else throw new Error('Sačuvajte Excel kao XLSX ili UTF-8 CSV.');

let db,close;
const url=postgresUrl();
if(url){
  const client=new pg.Client(postgresConfig(url));await client.connect();const schema=postgresSchema();
  await client.query(`SET search_path TO "${schema}", pg_catalog`);
  db={first:async(sql,...args)=>(await client.query(postgresSql(sql),args)).rows[0],
    batch:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(postgresSql(s.sql),s.bindings??[]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}}};
  close=()=>client.end();
}else{
  const client=createClient({url:process.env.TURSO_DATABASE_URL||process.env.DATABASE_URL||'file:.data/mleko.sqlite',authToken:process.env.TURSO_AUTH_TOKEN});
  db={first:async(sql,...args)=>(await client.execute({sql,args})).rows[0],batch:statements=>client.batch(statements.map(s=>({sql:s.sql,args:s.bindings??[]})),'write')};close=()=>client.close();
}
try{
  const get=async(key,fallback)=>{const row=await db.first('SELECT value_json FROM settings WHERE key=?',key);return row?JSON.parse(row.value_json):fallback;};
  const [weekdays,indjijaEnabled,indjijaDays,holidays,prefixes,regions]=await Promise.all([
    get('deliveryWeekdays',[2,5]),get('indjijaEnabled',false),get('indjijaDeliveryWeekdays',[]),get('holidays',[]),get('servicePostalCodes',[]),get('serviceRegions',[])]);
  const validatePackage=async({city,postalCode,nextDate})=>{
    const normalized=normalizeDeliveryCity(city),extra=regions.some(r=>r.city.toLowerCase()===city.toLowerCase()&&r.postalCodes.includes(postalCode));
    if(deliveryAddressError(city,postalCode)&&!extra)throw new Error('Adresa nije u potvrđenom području dostave.');
    if(deliveryCityForPostalCode(postalCode)==='Inđija'&&(!indjijaEnabled||!indjijaDays.length))throw new Error('Inđija još nije aktivirana.');
    if(!extra&&prefixes.length&&!prefixes.some(p=>postalCode.startsWith(p.replace(/\*$/,''))))throw new Error('Poštanski broj nije aktivan.');
    const days=normalized==='Inđija'?indjijaDays:weekdays.filter(d=>normalized!=='Novi Sad'||d===5);
    if(!days.includes(new Date(nextDate+'T12:00:00Z').getUTCDay())||holidays.includes(nextDate))throw new Error('Datum nije dozvoljeni termin dostave.');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(nextDate<today)throw new Error('Sledeća isporuka ne sme biti u prošlosti.');
  };
  const plan=await prepareCustomerImport(rows,{batchId:option('--batch'),db,validatePackage});
  const {statements,...report}=plan;void statements;
  await writeFile(option('--report'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(plan.errors?.length){console.error(`Uvoz zaustavljen: ${plan.errors.length} grešaka. Pogledajte izveštaj.`);process.exitCode=1;}
  else if(args.includes('--apply')){await applyCustomerImport(plan,{db,approvedHash:option('--approved-hash')});console.log(plan.alreadyImported?'Grupa je već uvezena; nema promena.':'Uvoz je atomarno sačuvan. Nisu poslate poruke niti pokrenute naplate ili izdavanje računa.');}
  else console.log(`Probni uvoz: ${plan.newCustomers} novih kupaca, ${plan.packages} paketa, ${plan.remainingUnits} preostalih jedinica. Pregledajte izveštaj i approvalHash.`);
}finally{await close();}
