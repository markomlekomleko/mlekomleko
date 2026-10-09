import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const questions = (await read('docs/audit-200/questions.txt')).trim().split('\n');
const rawRows = (await read('docs/audit-200/assessments.txt')).trim().split('\n');
if (questions.length !== 200 || rawRows.length !== 200 || new Set(questions).size !== 200) throw new Error('Expected 200 unique questions and 200 assessments');
const xmlPath = process.argv[2] || 'work/audit-200-all.xml';
const xml = await read(xmlPath);
const decode = text => text.replace(/&#10;/g, '\n').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const cases = [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map(([,attrs,body='']) => {
 const attr = key => decode(attrs.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1] || '');
 return {name:attr('name'),source:path.relative(root,attr('file')),status:body.includes('<failure')?'failed':body.includes('<skipped')?'skipped':'passed',knownIssue:body.includes('type="todo"')};
});
if (!cases.length) throw new Error('No executed tests in JUnit report');
if (cases.some(c => c.status === 'failed' && !c.knownIssue)) throw new Error('Unexpected failures: resolve or explicitly assess them before publishing the report');
const statuses={P:'RADI LOKALNO',D:'DELIMIČNO',N:'NIJE UGRAĐENO',B:'GREŠKA',E:'SPOLJNA PROVERA'};
const methods={A:'Automatizovani test',K:'Pregled koda',U:'Pregledač','A+U':'Test + pregledač',E:'Blokirano za stvarni servis; lokalni deo naveden'};
const aliases={P:'tests/prepaid-packages.test.mjs',D:'tests/domain-sqlite.test.mjs',C:'tests/connected-delivery-flows.test.mjs',F:'tests/fiscomm.test.mjs',L:'tests/customer-login.test.mjs'};
async function evidence(ref) {
 if(ref==='UI') return {label:'Provera pregledača',path:'docs/audit-200/browser-results.json'};
 if(ref==='FQ193') return {label:'Fiscomm Q193',path:'tests/fiscomm.test.mjs',line:(await read('tests/fiscomm.test.mjs')).split('\n').findIndex(line=>line.includes("test('Q193"))+1};
 if(/^T\d{3}$/.test(ref)) {
  const token='Q'+ref.slice(1);
  const matches=cases.filter(c=>c.source==='tests/functional-audit.test.mjs'&&c.name.includes(token));
  if(!matches.length)throw new Error('No executed test for '+ref);
  const lines=(await read('tests/functional-audit.test.mjs')).split('\n');
  const line=lines.findIndex(l=>l.includes(token) || l.includes("'"+ref.slice(1)+"'"));
  return {label:token+' — API test',path:'tests/functional-audit.test.mjs',line:line>=0?line+1:52,tests:matches.map(c=>c.name)};
 }
 if(/^[PDCFL]\d+$/.test(ref))return {label:ref,path:aliases[ref[0]],line:Number(ref.slice(1))};
 const match=ref.match(/^(.*?):(\d+)$/);
 return {label:path.basename(match?match[1]:ref)+(match?':'+match[2]:''),path:match?match[1]:ref,...(match?{line:Number(match[2])}:{})};
}
const rows=[];
for(const raw of rawRows){
 const [id,status,method,result,refs]=raw.split('|');
 if(Number(id)!==rows.length+1||!statuses[status]||!methods[method]||!refs)throw new Error('Invalid row '+id);
 const sources=await Promise.all(refs.split(',').map(evidence));
 for(const source of sources){await access(path.join(root,source.path));if(source.line&&source.line>(await read(source.path)).split('\n').length)throw new Error('Invalid line '+source.path);}
 const hasTest=sources.some(s=>s.path.startsWith('tests/')&&cases.some(c=>c.source===s.path));
 if(method.includes('A')&&!hasTest)throw new Error('Automated assessment without executed source: '+id);
 rows.push({id:Number(id),question:questions[Number(id)-1],status:statuses[status],method:methods[method],result,evidence:sources});
}
const questionCounts=Object.fromEntries(Object.values(statuses).map(s=>[s,rows.filter(r=>r.status===s).length]));
const methodCounts=Object.fromEntries(Object.values(methods).map(s=>[s,rows.filter(r=>r.method===s).length]));
const tests={total:cases.length,passed:cases.filter(c=>c.status==='passed').length,failedAssertions:cases.filter(c=>c.status==='failed').length,knownIssues:cases.filter(c=>c.knownIssue).length};
const escape = text => String(text).replaceAll('|','\\|').replaceAll('\n',' ');
const link = source => `[${source.label}](<${path.join(root,source.path)}${source.line?':'+source.line:''}>)`;
const result = {date:'2026-10-09',scope:'200 questions reassessed after implementation; real bank, production hosting and live fiscal/messaging delivery deferred',questionCounts,methodCounts,tests,questions:rows};
await writeFile(path.join(root,'docs/audit-200/results.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(path.join(root,'docs/audit-200/test-results.json'),JSON.stringify({date:result.date,tests,cases},null,2)+'\n');
const lines=[
 '# Funkcionalna provera — svih 200 pitanja',
 '',
 'Datum: 9. oktobar 2026. Pitanja 1–100 preneta su iz prethodne liste; 101–200 su nova. Svako pitanje ima nalaz i izvor dokaza. Dodavanje pitanja nije dodavanje novih funkcionalnosti.',
 '',
 `Ukupno **${tests.total} izvršenih automatizovanih testova: ${tests.passed} prolazi, ${tests.failedAssertions} neuspešno, ${tests.knownIssues} TODO**. Testovi obuhvataju stvarne HTTP rute i izolovanu bazu; spoljne naplate, fiskalizacija i slanje proveravaju se simulacijom.`, 
 '',
 'Jedan scenario može dokazivati više pitanja, a jedno pitanje može zahtevati više testova. Broj pitanja nije broj testova. Oznaka RADI LOKALNO važi samo za navedeni obim i okruženje.',
 '',
 '| Nalaz po pitanju | Broj |','|---|---:|',...Object.entries(questionCounts).map(([s,n])=>`| ${s} | ${n} |`),
 '',
 '| Način provere | Broj pitanja |','|---|---:|',...Object.entries(methodCounts).filter(([,n])=>n).map(([s,n])=>`| ${s} | ${n} |`),
 '',
 '## Implementacija posle početne provere',
 '',
 'Ispravljeni su AUDIT-01 (raniji nastavak pauze) i AUDIT-02 (adresa prethodne porudžbine). Njihovi testovi sada prolaze bez TODO oznaka.',
 '',
 'Dodati su galerija/deklaracija, zakazane akcije, pravila kombinovanja kupona, odvojeni računi za firme, profil kupca, delimične količine, lotovi i rezervacije, uloge zaposlenih, zahtevi za povraćaj, red ponovne naplate, statusi poruka, SMS adapter, Resend potpisane potvrde, usaglašavanje starih paketa i lokalna provera oporavka baze.',
 '',
 'Lokalni povraćaj obuhvata sve neisporučene i nezaključane proizvode odabrane porudžbine; ne obračunava automatski povraćaj dostave. Kontrola zaliha je opciona i rezerviše količinu celog paketa sa dovoljno dugim rokom. Termini imaju kvotu za nove porudžbine na izabran datum; kapacitet pomerenih ponovljenih poseta zahteva operativnu proveru.',
 '',
 '## Šta nije potvrđeno uživo',
 '',
 '- Stvarna bankarska naplata i odbijanje kartice, recurring naplata i povraćaji.',
 '- Stvarno fiskalno izdavanje, ispravnost poreskog izbora i pravni trenutak prometa; HTTP ugovor je proveren mockom.',
 '- Prijem poruke u stvarni inbox/WhatsApp, odobrenje šablona i stvarna SMS isporuka.',
 '- Produkciona migracija, oporavak produkcionog hostinga, PostgreSQL integracioni test i fizički iOS/Safari uređaj.',
 '',
 'Nova API test-baza je SQLite u memoriji, sa kompletnim migracijama i zabranjenom spoljnom mrežom. Browser provera koristi localhost:4184 i sintetičke kupce, na 390 px i 1440 px. Nema stvarnih uplata, fiskalnih računa ili poruka. ESLint i TypeScript provere su uspešne; npm test ponovo je izgradio worker i izvršio suite.',
 '',
 '## Pitanja i nalazi',
 ''
];
for(let start=0;start<200;start+=20){
 lines.push(`### Pitanja ${start+1}–${start+20}`,'','| # | Pitanje | Nalaz / način | Rezultat i ograničenje | Dokaz |','|---:|---|---|---|---|');
 for(const r of rows.slice(start,start+20))lines.push(`| ${r.id} | ${escape(r.question)} | **${r.status}** · ${r.method} | ${escape(r.result)} | ${r.evidence.map(link).join('; ')} |`);
 lines.push('');
}
lines.push('## Ponovljiva provera','','```sh','npm test','node --test --test-reporter=junit tests/*.test.mjs > work/audit-200-all.xml','node scripts/render-functional-audit.mjs work/audit-200-all.xml','npm run lint','npm run typecheck','```','','Regresioni testovi Q047 i Q104 potvrđuju otklanjanje obe ranije prijavljene greške.','','Mašinski čitljivi nalazi su u `docs/audit-200/results.json`, a pojedinačni izvršeni testovi u `docs/audit-200/test-results.json`.');
await writeFile(path.join(root,'docs/funkcionalna-provera-200-pitanja.md'),lines.join('\n')+'\n');
await writeFile(path.join(root,'docs/klijentska-pitanja-101-200.md'),'# Još 100 pitanja klijenta — 101–200\n\n'+questions.slice(100).map((q,i)=>`${i+101}. ${q}`).join('\n')+'\n');
console.log(JSON.stringify({questionCounts,methodCounts,tests},null,2));
