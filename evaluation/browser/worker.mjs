import sqlite3InitModule from './sqlite/index.mjs';
import {makeDataset,summarizeRows,toCandidate,T0,DAY} from '../benchmark.mjs';
import {createReplay,METHODS,score} from '../adapters.mjs';
import {SqliteStore} from '../vendor/core/src/memory/storage/sqlite.js';
import {NuggetStore} from '../vendor/core/src/memory/nugget-store.js';
const sqlite=await sqlite3InitModule({locateFile:file=>new URL('./sqlite/'+file,import.meta.url).href});const initModule=async()=>sqlite;
onmessage=async({data})=>{try{
 if(data.action==='run'){
  const dataset=makeDataset({seed:27006,entities:50,noise:.05,metadata:'ttl'}),replay=await createReplay(initModule);
  const results=Object.fromEntries(METHODS.map(m=>[m,[]]));let cursor=0;const begin=performance.now();
  for(const q of dataset.queries){while(cursor<dataset.observations.length&&dataset.observations[cursor].observedAt<=q.knowledgeTime)replay.insert(dataset.observations[cursor++]);for(const method of METHODS)results[method].push(score(q,replay.retrieve(method,q)));}
  const summary=Object.fromEntries(METHODS.map(m=>[m,summarizeRows(results[m])]));
  // Disable application fetch after loading code and WASM. This is not an OS disconnect.
  replay.memory.insert(toCandidate({id:'network-fixture',subject:'networkfixture',predicate:'status',value:'available',validFrom:T0,validUntil:T0+365*DAY,observedAt:T0,sources:1,writer:'local',url:'https://synthetic.example.invalid/offline',domain:'documentation'}));
  const originalFetch=globalThis.fetch;let blockedFetch=0;globalThis.fetch=()=>{blockedFetch++;throw Error('network denied in test');};
  const offlineHits=replay.memory.query('networkfixture',{time:T0+32*DAY,scope:'shared'}).length;
  globalThis.fetch=originalFetch;
  postMessage({action:'run',runtime:navigator.userAgent,sqlite:sqlite.capi.sqlite3_libversion(),seed:27006,observations:dataset.observations.length,queries:dataset.queries.length,elapsedMs:performance.now()-begin,summary,applicationNetworkDenial:{passed:offlineHits===1,blockedFetch,offlineHits},raw:results});replay.close();return;
 }
 const storage=new SqliteStore({initModule,vfs:'opfs-sahpool',path:'bmtr-persistence.sqlite3',sahPoolOpts:{directory:'.bmtr-research-fixture',initialCapacity:12}});
 const store=new NuggetStore({storage});await store.open();
 if(data.action==='write')store.insert(toCandidate({id:'persistence-fixture',subject:'persistentfixture',predicate:'status',value:'verified',validFrom:T0,validUntil:T0+365*DAY,observedAt:T0,sources:2,writer:'writer-a',url:'https://synthetic.example.invalid/persistent',domain:'documentation'}));
 const hits=store.query('persistentfixture',{time:T0+32*DAY,scope:'shared'}),passed=hits.some(x=>x.nugget.fact.object==='verified');
 const bytes=sqlite.capi.sqlite3_js_db_export(storage.db.pointer);
 postMessage({action:data.action,persistencePassed:passed,records:store.count(),vfs:'opfs-sahpool',schema:3,runtime:navigator.userAgent,exportBytes:Array.from(bytes)});store.close();
}catch(e){postMessage({action:data.action,error:e.stack??String(e)});}};
postMessage({action:'ready'});
