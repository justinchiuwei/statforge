import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {apiHandler} from '../server/local-router.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),publicRoot=path.join(root,'public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||3000);
const server=http.createServer(async(req,res)=>{
 try{
  const base=`http://${req.headers.host||'localhost:'+port}`,url=new URL(req.url,base),handler=apiHandler(url.pathname);
  if(url.pathname.startsWith('/api/')){
   if(!handler){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'Unknown API endpoint'}));return;}
   const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((s,c)=>s+c.length,0)>4096){res.writeHead(413);res.end('Request too large');return;}}
   const body=Buffer.concat(chunks),headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!=null)headers.set(name,Array.isArray(value)?value.join(','):value);
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{} )});
   const result=await handler.fetch(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return;}
  const file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
 }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end(error.code==='ENOENT'?'Not found':'Request could not complete');}
});
server.listen(port,'127.0.0.1',()=>console.log(`StatForge running at http://localhost:${server.address().port} — no Odds API key required.`));
