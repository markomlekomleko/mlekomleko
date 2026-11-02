// Encrypted, consistent backup with a real restore rehearsal in a rolled-back schema.
// Never logs row values, credentials or encryption keys; never calls an integration.
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {postgresConfig,postgresUrl,postgresSchema} from '../db/postgres-config.mjs';

const sourceSchema=postgresSchema(),url=postgresUrl(process.env,true);
if(!url)throw new Error('PostgreSQL connection is required.');
const quote=name=>{if(!/^[a-z_][a-z_0-9]*$/.test(name))throw new Error('Unsupported database identifier.');return `"${name}"`;};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hashRows=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(canonical(row))).sort())).digest('hex');
const source=new pg.Client(postgresConfig(url)),restore=new pg.Client(postgresConfig(url));
let sourceOpen=false,restoreOpen=false;
try{
 await source.connect();sourceOpen=true;
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await source.query(`SET LOCAL search_path TO ${quote(sourceSchema)},pg_catalog`);
 await source.query("SET LOCAL TIME ZONE 'UTC'");
 const history=(await source.query('SELECT * FROM __mleko_migrations ORDER BY name')).rows;
 const migrations=[];
 for(const row of history){
  if(!/^[a-zA-Z0-9_-]+\.sql$/.test(row.name))throw new Error('Invalid migration name.');
  const sql=await readFile(new URL(`../migrations/postgres/${row.name}`,import.meta.url),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==row.checksum)throw new Error(`Migration checksum mismatch: ${row.name}`);
  migrations.push({name:row.name,sql});
 }
 const names=(await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",[sourceSchema])).rows.map(row=>row.table_name);
 const tables=[];
 for(const name of names){
  const rows=(await source.query(`SELECT row_to_json(t) AS row FROM ${quote(sourceSchema)}.${quote(name)} t`)).rows.map(r=>r.row);
  tables.push({name,rows,hash:hashRows(rows)});
 }
 const foreignKeys=(await source.query(`SELECT child.relname AS child,parent.relname AS parent
 FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace n ON n.oid=child.relnamespace
 JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND n.nspname=$1`,[sourceSchema])).rows;
 await source.query('COMMIT');
 const snapshot={version:1,createdAt:new Date().toISOString(),sourceSchema,migrations,tables,foreignKeys};
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
 const directory=resolve('.data/backups');await mkdir(directory,{recursive:true});
 const base=resolve(directory,`production-${new Date().toISOString().replace(/[:.]/g,'-')}`);
 await writeFile(base+'.key',key,{mode:0o600,flag:'wx'});
 await writeFile(base+'.encrypted.json',JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}),{mode:0o600,flag:'wx'});
 const saved=JSON.parse(await readFile(base+'.encrypted.json','utf8'));
 const decipher=createDecipheriv('aes-256-gcm',await readFile(base+'.key'),Buffer.from(saved.iv,'base64'));decipher.setAuthTag(Buffer.from(saved.tag,'base64'));
 const recovered=JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.ciphertext,'base64')),decipher.final()]).toString('utf8'));

 // Only a freshly generated schema is written, and the entire rehearsal rolls back.
 const testSchema='mleko_restore_'+randomUUID().replaceAll('-','');
 await restore.connect();restoreOpen=true;await restore.query('BEGIN');
 await restore.query(`CREATE SCHEMA ${quote(testSchema)}`);
 await restore.query(`REVOKE ALL ON SCHEMA ${quote(testSchema)} FROM PUBLIC`);
 await restore.query(`SET LOCAL search_path TO ${quote(testSchema)},pg_catalog`);
 await restore.query("SET LOCAL TIME ZONE 'UTC'");
 await restore.query('CREATE TABLE __mleko_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 for(const migration of recovered.migrations)await restore.query(migration.sql);
 const targetNames=(await restore.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",[testSchema])).rows.map(r=>r.table_name);
 if(JSON.stringify(targetNames)!==JSON.stringify(names))throw new Error('Backup schema has tables not covered by migration history.');
 await restore.query(`TRUNCATE ${names.map(name=>`${quote(testSchema)}.${quote(name)}`).join(',')} CASCADE`);
 const remaining=new Map(recovered.tables.map(t=>[t.name,t])),ordered=[];
 while(remaining.size){
  const ready=[...remaining.values()].filter(t=>!foreignKeys.some(f=>f.child===t.name&&f.parent!==t.name&&remaining.has(f.parent)));
  if(!ready.length)throw new Error('A cross-table foreign key cycle needs a custom restore.');
  for(const table of ready){ordered.push(table);remaining.delete(table.name);}
 }
 for(const table of ordered){
  if(!table.rows.length)continue;
  const columns=Object.keys(table.rows[0]),batchSize=Math.max(1,Math.floor(60000/columns.length));
  for(let i=0;i<table.rows.length;i+=batchSize){
   const rows=table.rows.slice(i,i+batchSize),values=rows.flatMap(row=>columns.map(c=>row[c]));
   await restore.query(`INSERT INTO ${quote(testSchema)}.${quote(table.name)} (${columns.map(quote).join(',')}) VALUES ${rows.map((_,r)=>`(${columns.map((_,c)=>'$'+(r*columns.length+c+1)).join(',')})`).join(',')}`,values);
  }
 }
 await restore.query('SET CONSTRAINTS ALL IMMEDIATE');
 for(const table of recovered.tables){
  const rows=(await restore.query(`SELECT row_to_json(t) AS row FROM ${quote(testSchema)}.${quote(table.name)} t`)).rows.map(r=>r.row);
  if(rows.length!==table.rows.length||hashRows(rows)!==table.hash)throw new Error(`Restored data mismatch: ${table.name}`);
 }
 await restore.query('ROLLBACK');
 const report={verified:true,encrypted:true,backup:base+'.encrypted.json',keyFile:base+'.key',sourceSchema,tableCount:tables.length,rowCounts:Object.fromEntries(tables.map(t=>[t.name,t.rows.length])),restore:'All table hashes and foreign-key constraints verified in a rolled-back isolated schema.',createdAt:snapshot.createdAt};
 await writeFile(base+'.manifest.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});await chmod(base+'.manifest.json',0o600);
 console.log(JSON.stringify(report,null,2));
}catch(error){
 if(sourceOpen)await source.query('ROLLBACK').catch(()=>{});
 if(restoreOpen)await restore.query('ROLLBACK').catch(()=>{});
 console.error(`Backup/restore verification failed (${error.code??'ERROR'}): ${error.message}`);process.exitCode=1;
}finally{if(sourceOpen)await source.end();if(restoreOpen)await restore.end();}
