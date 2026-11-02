// Read-only PostgreSQL audit. No customer/contact/message data or connection strings are output.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {postgresConfig,postgresUrl,postgresSchema} from '../db/postgres-config.mjs';
const url=postgresUrl(process.env,true);
if(!url)throw new Error('Podesite PostgreSQL konekciju za proveru.');
const client=new pg.Client(postgresConfig(url));
try{
 await client.connect();await client.query('BEGIN READ ONLY');
 await client.query(`SET LOCAL search_path TO "${postgresSchema()}",pg_catalog`);
 const applied=new Map((await client.query('SELECT name,checksum FROM __mleko_migrations')).rows.map(r=>[r.name,r.checksum]));
 const migrations=[];
 for(const name of (await readdir('migrations/postgres')).filter(n=>n.endsWith('.sql')).sort()){
  const checksum=createHash('sha256').update(await readFile(`migrations/postgres/${name}`)).digest('hex');
  migrations.push({name,status:!applied.has(name)?'pending':applied.get(name)===checksum?'applied':'checksum_mismatch'});
 }
 const registered=(await client.query("SELECT to_regclass('test_scenario_customers') AS name")).rows[0].name;
 const cohorts=registered?(await client.query(`SELECT t.cohort,COUNT(*)::integer customers,
   (SELECT COUNT(*)::integer FROM orders o JOIN test_scenario_customers x ON x.customer_id=o.customer_id WHERE x.cohort=t.cohort) orders,
   (SELECT COUNT(*)::integer FROM fiscal_receipts f JOIN orders o ON o.id=f.order_id JOIN test_scenario_customers x ON x.customer_id=o.customer_id WHERE x.cohort=t.cohort) fiscal_receipts,
   (SELECT COUNT(*)::integer FROM payment_attempts p JOIN orders o ON o.id=p.order_id JOIN test_scenario_customers x ON x.customer_id=o.customer_id WHERE x.cohort=t.cohort) payment_attempts
   FROM test_scenario_customers t GROUP BY t.cohort ORDER BY t.cohort`)).rows:[];
 console.log(JSON.stringify({readOnly:true,migrations,registeredTestCohorts:cohorts,backupVerified:false,productionFiscalFlowVerified:false},null,2));
 await client.query('ROLLBACK');
 process.exitCode=migrations.every(m=>m.status==='applied')?0:1;
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(`Provera baze nije završena (${error.code||'ERROR'}). Nisu izvršene izmene.`);process.exitCode=1;}
finally{await client.end();}
