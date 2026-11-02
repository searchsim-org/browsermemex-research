// Offline candidate regression. No browser access, external connections or installed-profile reads.
// Usage: node regression.mjs SOURCE_CHECKOUT CANDIDATE_STAGE
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
const [source,stage]=process.argv.slice(2);
assert(source&&stage,'supply source checkout and isolated candidate stage');
const out=path.dirname(new URL(import.meta.url).pathname);
const before=await fs.readFile(path.join(source,'bm-plugin/chrome/dist/service-worker.js'),'utf8');
const built=await fs.readFile(path.join(stage,'apps/chrome/dist/dist/service-worker.js'),'utf8');
const sourcemap=JSON.parse(await fs.readFile(path.join(stage,'apps/chrome/dist/dist/service-worker.js.map'),'utf8'));
const writeCase=built.slice(built.indexOf('case "memory.write"'),built.indexOf('case "skills.list"',built.indexOf('case "memory.write"')));
assert(before.includes('import("./chunks/nugget-memory-'),'baseline contains separate dynamically imported memory chunk');
assert.match(writeCase,/return captureFact\(/);
assert(!writeCase.includes('import(')&&!writeCase.includes('__vitePreload'),'candidate write route has no dynamic import/preloader');
assert(!built.includes('import("./chunks/nugget-memory-'),'no separate memory chunk remains');
assert(!sourcemap.sources.some(x=>/sidepanel-preact/.test(x)),'worker source graph excludes sidepanel entry');
// Reproduce the baseline helper's masking of a rejected import in a DOM-free context.
const helper=before.slice(before.indexOf('const scriptRel ='),before.indexOf('const DOMAIN_SKILLS ='));
const context=vm.createContext({Event,Promise,URL});
const masked=vm.runInContext(helper+`\n__vitePreload(()=>Promise.reject(new Error('synthetic import rejection')),[], 'file:///fixture.js')`,context);
await assert.rejects(masked,/window is not defined/);
const {build}=await import(pathToFileURL(path.join(source,'node_modules/esbuild/lib/main.js')));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'bmex-memory-worker-'));
const bridge=path.join(stage,'packages/extension/src/background/modules/mcp-bridge.js');
await build({entryPoints:[bridge],outfile:path.join(tmp,'bridge.mjs'),bundle:true,format:'esm',platform:'node',plugins:[{
 name:'isolated-fixture-services',setup(b){
  b.onResolve({filter:/extension-services\.js$/},()=>({path:'fixture-services',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const services=()=>globalThis.__fixture.services;
export const activeProfileId=()=>globalThis.__fixture.profileId;
export const isBooted=()=>true;
export const bootProfiles=async()=>({profileStore:{getActive:async()=>({privacy:globalThis.__fixture.privacy})}});
export const runSkill=()=>{throw new Error('not part of memory regression')};`,loader:'js'}));
  b.onLoad({filter:/mcp-bridge\.js$/},async args=>({contents:await fs.readFile(args.path,'utf8')+'\nexport { dispatchMemexOp };',loader:'js'}));
 }}]});
const workerSource=`import {parentPort} from 'node:worker_threads';
import assert from 'node:assert/strict';
import sqlite3InitModule from ${JSON.stringify(pathToFileURL(path.join(source,'node_modules/@sqlite.org/sqlite-wasm/dist/node.mjs')).href)};
import {NuggetStore} from ${JSON.stringify(pathToFileURL(path.join(source,'packages/core/src/memory/nugget-store.js')).href)};
import {SqliteStore} from ${JSON.stringify(pathToFileURL(path.join(source,'packages/core/src/memory/storage/sqlite.js')).href)};
assert.equal(typeof window,'undefined');assert.equal(typeof document,'undefined');
const store=new NuggetStore({storage:new SqliteStore({initModule:sqlite3InitModule,vfs:'memory'})});await store.open();
globalThis.__fixture={services:{nuggetStore:store},profileId:'connector-smoke-synthetic',privacy:{memoryEnabled:true,disabledDomains:[]}};
const {dispatchMemexOp}=await import('./bridge.mjs');
const writes=[],reads=[];
for(let i=0;i<3;i++){
 const subject='connectorfixture'+i;
 const r=await dispatchMemexOp('memory.write',{fact:{subject,predicate:'status',object:'fixtureok'+i},sourceUrl:'https://example.invalid/fixture/'+i,agentId:'offline-regression'});
 assert(r&&!r.dropped,JSON.stringify(r));writes.push(r);
 const hits=await dispatchMemexOp('memory.query',{text:subject,options:{topK:10}});
 assert(hits.some(h=>h.nugget.fact.subject===subject&&h.nugget.fact.object==='fixtureok'+i));reads.push(hits.length);
}
globalThis.__fixture.privacy.memoryEnabled=false;
const blocked=await dispatchMemexOp('memory.write',{fact:{subject:'privacyfixture',predicate:'status',object:'blocked'},sourceUrl:'https://example.invalid/blocked'});
assert.match(blocked.dropped,/memory disabled/);
globalThis.__fixture.privacy={memoryEnabled:true,disabledDomains:['blocked.invalid']};
const domainBlocked=await dispatchMemexOp('memory.write',{fact:{subject:'privacyfixture',predicate:'status',object:'blocked'},sourceUrl:'https://sub.blocked.invalid/blocked'});
assert.match(domainBlocked.dropped,/host blocked/);
assert.equal(store.count('connector-smoke-synthetic'),3);
store.close();parentPort.postMessage({workerContext:{window:typeof window,document:typeof document},writes,queryHitCounts:reads,privacyDisabledDrop:blocked,domainBlockedDrop:domainBlocked,count:3});`;
await fs.writeFile(path.join(tmp,'worker.mjs'),workerSource);
const workerResult=await new Promise((resolve,reject)=>{
 const w=new Worker(path.join(tmp,'worker.mjs'));w.on('message',resolve);w.on('error',reject);w.on('exit',code=>{if(code)reject(new Error('worker exit '+code));});
});
const result={scope:'offline Node worker smoke of actual dispatch/capture/core with injected synthetic services; NOT installed extension results',source,stage,baselineErrorMaskReproduced:true,productionGraph:{writeRouteDirectCapture:true,memoryDynamicChunk:false,sidepanelSources:[],otherDynamicImportsRemain:true},workerResult};
await fs.writeFile(path.join(out,'offline-regression-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
