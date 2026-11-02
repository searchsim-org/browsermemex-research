import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));const port=Number(process.argv[2]??process.env.BMTR_PORT??8770);
const types={'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.md':'text/plain','.sqlite3':'application/octet-stream'};
http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method==='POST'&&['/record','/sqlite-export'].includes(pathname)){
  let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>20e6)throw Error('oversize');chunks.push(part);}const body=Buffer.concat(chunks);
  if(pathname==='/record'){const data=JSON.parse(body);if(data.exportBytes)delete data.exportBytes;const p=path.join(root,'results/browser-results.json');let existing=[];try{existing=JSON.parse(await fs.readFile(p,'utf8'));}catch{}existing.push(data);await fs.writeFile(p,JSON.stringify(existing,null,2));}
  else await fs.writeFile(path.join(root,'results/browser-export.sqlite3'),body);
  res.writeHead(200);res.end('saved');return;
 }
 const target=path.resolve(root,'.'+(pathname==='/'?'/browser/index.html':decodeURIComponent(pathname)));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'});res.end(bytes);
}catch(e){res.writeHead(404);res.end(String(e.message));}}).listen(port,'127.0.0.1',()=>console.log(`BMTR harness http://127.0.0.1:${port}`));
