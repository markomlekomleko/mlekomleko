import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function runtime(){
 const scripts=[],calls=[],exports={};let reloads=0;
 const window={location:{search:'',hash:'',reload(){reloads++;}}};
 const document={createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}};
 const ctx=vm.createContext({window,document,exports,process:{env:{NEXT_PUBLIC_CLARITY_PROJECT_ID:'test12345'}}});
 vm.runInContext(ts.transpileModule(readFileSync('app/lib/session-replay.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 return {api:exports,window,scripts,calls,reloads:()=>reloads};
}
test('replay needs consent, skips private/localized routes and queries, stops before entering a private document',()=>{
 const r=runtime();
 for(const path of ['/admin','/en/admin','/prijava','/nalog','/ru/nalog','/checkout','/kontakt']){assert.equal(r.api.replayAllowed(path),false);r.api.syncSessionReplay(true,false,path);}
 r.api.syncSessionReplay(false,false,'/prodavnica');assert.equal(r.scripts.length,0);
 r.window.location.search='?email=private@example.test';r.api.syncSessionReplay(true,false,'/prodavnica');assert.equal(r.scripts.length,0);r.window.location.search='';
 r.api.syncSessionReplay(true,false,'/prodavnica');assert.equal(r.scripts.length,1);
 const queue=r.window.clarity.q;assert.equal(queue[0][0],'consentv2');assert.equal(queue[0][1].analytics_Storage,'granted');assert.equal(queue[0][1].ad_Storage,'denied');
 r.api.syncSessionReplay(true,false,'/en/nalog');assert.equal(queue.at(-1)[0],'stop');assert.equal(r.reloads(),1);
 r.api.updateReplayConsent(false,false);assert.equal(queue.at(-1)[0],'stop');
});
