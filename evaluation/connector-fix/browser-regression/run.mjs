// Fresh headless bundled Chromium only. No user Chrome, page actions, worker evaluation or CDP.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const out=path.dirname(new URL(import.meta.url).pathname);
const evaluation=path.resolve(out,'../..');
const stage=process.argv[2]??'/private/tmp/browsermemex-connector-browser-stage';
const checkout=process.argv[3]??'/Users/dndesign/Downloads/browser-memex';
const extension=path.join(stage,'apps/chrome/dist');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'browsermemex-empty-test-profile-'));
const fixture={run:'bmrepro'+crypto.randomBytes(7).toString('hex'),facts:[]};
fixture.facts=[0,1,2].map(i=>({subject:fixture.run+i,value:['amber2714','violet6381','cobalt9052'][i]}));
const fixtureFile=path.join(out,'fixture.json');await fs.writeFile(fixtureFile,JSON.stringify(fixture,null,2)+'\n');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const result={started:new Date().toISOString(),scope:'fresh-profile headless Chromium candidate test through actual MCP bridge; not user-installed Chrome or autonomous runtimes',relayPort:7863,profileFresh:true,profileWasPreexisting:false,extensionManifest:JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')),candidateSourceSha256:await hash(path.join(stage,'packages/extension/src/background/modules/mcp-bridge.js')),builtWorkerSha256:await hash(path.join(extension,'dist/service-worker.js')),testManifestSha256:await hash(path.join(extension,'manifest.json')),changesFromCandidate:['default relay port 7862 -> 7863','test manifest omits nativeMessaging permission to prevent host inbox access'],fixture,writer:null,reader:null,pass:false};
let relay,context;
try{
 const log=await fs.open(path.join(out,'relay.log'),'w');
 relay=spawn(process.execPath,[path.join(evaluation,'scripts/bridge-relay.mjs')],{env:{...process.env,BMEX_RELAY_PORT:'7863'},stdio:['ignore',log.fd,log.fd]});
 await new Promise((r,j)=>{relay.once('error',j);setTimeout(r,500);});
 const initial=await(await fetch('http://127.0.0.1:7863')).json();if(initial.extensionConnected)throw Error('Unexpected extension already connected to isolated relay');
 const {chromium}=await import(pathToFileURL(path.join(checkout,'node_modules/playwright-core/index.mjs')));
 result.playwrightVersion=JSON.parse(await fs.readFile(path.join(checkout,'node_modules/playwright-core/package.json'),'utf8')).version;
 result.executable=chromium.executablePath();
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking','--disable-component-update','--no-first-run']});
 result.browserVersion=context.browser()?.version()??'unknown';
 result.loadedServiceWorkerUrls=context.serviceWorkers().map(x=>x.url());
 const deadline=Date.now()+180000;
 let connected=false;
 while(Date.now()<deadline){
  const status=await(await fetch('http://127.0.0.1:7863')).json();
  if(status.extensionConnected){connected=true;result.relayStatus=status;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 if(!connected)throw Error('Fresh candidate did not register with isolated relay within 180 seconds');
 result.extensionConnectedAt=new Date().toISOString();
 result.loadedServiceWorkerUrls=context.serviceWorkers().map(x=>x.url());
 const runClient=role=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(out,'sdk-client.mjs'),role,fixtureFile],{env:{...process.env,BMEX_RELAY_PORT:'7863'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.once('error',reject);p.once('exit',code=>{let decoded;try{decoded=JSON.parse(stdout.trim());}catch{decoded=null;}resolve({exitCode:code,stdout,stderr,data:decoded});});
 });
 result.writer=await runClient('writer');
 // Client A's process has exited before client B starts.
 result.reader=await runClient('reader');
 result.pass=result.writer.exitCode===0&&result.reader.exitCode===0&&Boolean(result.writer.data?.pass)&&Boolean(result.reader.data?.pass);
}catch(error){result.error=error.stack??String(error);}
finally{
 if(context)await context.close().catch(e=>result.closeError=String(e));
 if(relay)relay.kill('SIGTERM');
 result.finished=new Date().toISOString();
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({pass:result.pass,error:result.error??null,browserVersion:result.browserVersion,writer:result.writer?.data,reader:result.reader?.data},null,2));
}
process.exitCode=result.pass?0:1;
