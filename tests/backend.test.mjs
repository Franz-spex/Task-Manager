import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TaskStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { validatePlan } from '../server/planner.mjs';
import { seed } from '../lib/taskline.ts';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const issuer='https://taskline-test.example/';
const resource='https://taskline-test.example/mcp';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);
const jwks=createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]});
async function token(sub='kent',scope='tasks:read tasks:write ai:plan',aud=resource,expired=false){return new SignJWT({scope}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(sub).setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(expired?'0s':'5m').sign(privateKey)}

async function fixture(options={}){
 const store=new TaskStore(':memory:');
 const config={issuer,resource,webOrigin:'http://localhost:5173',users:['kent','other'],clientId:'test',authReady:true,aiEnabled:true,key:'test-not-a-real-key',model:'gpt-4o-mini',...options.config};
 const {app}=createApp(config,{store,jwks,...options});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const auth=await token();
 async function request(path,body,credential=auth,method='POST'){return fetch(url+path,{method:body===undefined?'GET':method,headers:{...(credential?{Authorization:`Bearer ${credential}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
 return {store,url,request,auth,close:async()=>{await new Promise(r=>server.close(r));store.close()}};
}

test('paused AI blocks provider requests while workspace access remains available',async()=>{
 let providerCalls=0;
 const f=await fixture({config:{aiEnabled:false},fetcher:async()=>{providerCalls++;throw new Error('Provider must not be called')}});
 try{
  const config=await(await f.request('/api/taskline/config')).json();
  assert.equal(config.aiReady,false);assert.equal(config.aiPaused,true);
  const response=await f.request('/api/taskline/plan',{prompt:'Organize tasks',revision:0,today:'2026-09-26'});
  assert.equal(response.status,503);assert.match((await response.json()).error,/paused/);
  assert.equal(providerCalls,0);assert.equal((await f.request('/api/taskline/store')).status,200);
 }finally{await f.close()}
});

test('JWT authorization rejects anonymous, forged, wrong audience, expired and nonmember requests',async()=>{
 const f=await fixture();try{
  for(const credential of ['', 'forged',await token('kent','tasks:read','wrong'),await token('kent','tasks:read',resource,true)])assert.equal((await f.request('/api/taskline/store',undefined,credential)).status,401);
  assert.equal((await f.request('/api/taskline/store',undefined,await token('outsider'))).status,403);
  assert.equal((await f.request('/api/taskline/store',undefined,await token('kent','ai:plan'))).status,403);
  const response=await f.request('/mcp',{},'');assert.match(response.headers.get('www-authenticate'),/oauth-protected-resource/);
  const metadata=await(await f.request('/.well-known/oauth-protected-resource',undefined,'')).json();assert.equal(metadata.resource,resource);
 }finally{await f.close()}
});

test('shared stores isolate users, reject conflicts, validate dependencies and deduplicate retries',async()=>{
 const f=await fixture();try{
  const data=seed(),requestId=crypto.randomUUID();
  const put=()=>f.request('/api/taskline/store',{revision:0,store:data,requestId},undefined,'PUT');
  assert.equal((await put()).status,200);assert.equal((await(await put()).json()).revision,1);
  assert.equal((await(await f.request('/api/taskline/store')).json()).store.tasks.length,9);
  assert.equal((await(await f.request('/api/taskline/store',undefined,await token('other'))).json()).store.tasks.length,0);
  assert.equal((await f.request('/api/taskline/store',{revision:0,store:data,requestId:crypto.randomUUID()},undefined,'PUT')).status,409);
  data.tasks[0].dependencies=['unknown'];
  assert.equal((await f.request('/api/taskline/store',{revision:1,store:data,requestId:crypto.randomUUID()},undefined,'PUT')).status,400);
  assert.equal((await f.request('/api/taskline/store',{revision:1,store:seed(),requestId:crypto.randomUUID()},await token('kent','tasks:read'),'PUT')).status,403);
 }finally{await f.close()}
});

test('MCP initializes and executes preview → apply → retry → undo without leaking other users',async()=>{
 const f=await fixture();const client=new Client({name:'test',version:'1'});
 try{
  f.store.save(`${issuer}|kent`,0,seed(),crypto.randomUUID());
  await client.connect(new StreamableHTTPClientTransport(new URL(f.url+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${f.auth}`}}}));
  assert.equal((await client.listTools()).tools.length,5);
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert(!r.isError,JSON.stringify(r));return r.structuredContent};
  const listing=await call('list_tasks');assert.equal(listing.tasks.length,9);
  const task={...listing.tasks[0],title:'Updated through MCP'};
  const preview=await call('preview_changes',{revision:listing.revision,upsert:[task]});
  assert.notEqual(f.store.read(`${issuer}|kent`).store.tasks[0].title,task.title);
  const applied=await call('apply_changes',{previewId:preview.previewId});assert.equal(applied.revision,2);
  assert.deepEqual(await call('apply_changes',{previewId:preview.previewId}),applied);
  assert.throws(()=>f.store.apply(`${issuer}|other`,preview.previewId),/another workspace/);
  const undone=await call('undo_changes',{undoId:applied.undoId});assert.equal(undone.revision,3);
  assert.notEqual(undone.store.tasks.find(t=>t.id===task.id).title,task.title);
  const stale=await client.callTool({name:'preview_changes',arguments:{revision:1,upsert:[task]}});assert(stale.isError);
 }finally{await client.close();await f.close()}
});

test('undo refuses to overwrite later changes and storage validates workspace IDs',()=>{
 const db=new TaskStore(':memory:');try{
  const data=seed();db.save('a',0,data,crypto.randomUUID());
  const id=db.preview('a',1,{...data,name:'New'});const applied=db.apply('a',id);
  db.save('a',2,{...data,name:'Later'},crypto.randomUUID());assert.throws(()=>db.apply('a',applied.undoId),/board changed/);
  const invalid=seed();invalid.tasks[0].workspaceId='someone-else';assert.throws(()=>db.save('a',3,invalid,crypto.randomUUID()));
 }finally{db.close()}
});

test('live AI uses Responses structured output, validates plans and never auto-applies',async()=>{
 let captured;
 const data=seed();const proposed={...data.tasks[0],title:'AI suggestion'};delete proposed.workspaceId;
 const raw={summary:'One task',assumptions:'Review the date',updates:true,tasks:[proposed]};
 const f=await fixture({fetcher:async(url,init)=>{captured={url,body:JSON.parse(init.body)};return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw)}]}]})}});
 try{
  f.store.save(`${issuer}|kent`,0,data,crypto.randomUUID());
  const response=await f.request('/api/taskline/plan',{prompt:'Improve this task',revision:1,today:'2026-09-12'});assert.equal(response.status,200);
  const plan=await response.json();assert.equal(plan.tasks[0].title,'AI suggestion');assert.deepEqual(plan.before[0],data.tasks[0]);
  assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.body.store,false);assert.equal(captured.body.text.format.strict,true);
  assert.equal(f.store.read(`${issuer}|kent`).revision,1);
  assert.throws(()=>validatePlan({...raw,tasks:[{...proposed,id:'foreign'}]},data.tasks),/unknown task/);
  assert.throws(()=>validatePlan({...raw,tasks:[{...proposed,due:'2026-02-31'}]},data.tasks));
 }finally{await f.close()}
});

test('AI failures preserve the board and browser origins are enforced',async()=>{
 const f=await fixture({fetcher:async()=>Response.json({error:'quota'},{status:429})});try{
  f.store.save(`${issuer}|kent`,0,seed(),crypto.randomUUID());
  const response=await f.request('/api/taskline/plan',{prompt:'Plan today',revision:1,today:'2026-09-12'});assert.equal(response.status,429);
  assert.equal(f.store.read(`${issuer}|kent`).revision,1);
  assert.equal((await fetch(f.url+'/api/taskline/store',{headers:{Origin:'https://attacker.example',Authorization:`Bearer ${f.auth}`}})).status,403);
 }finally{await f.close()}
});

test('tasks and proposal receipts survive a backend restart',()=>{
 const folder=mkdtempSync(join(tmpdir(),'taskline-db-test-'));const path=join(folder,'tasks.sqlite');
 let db=new TaskStore(path);
 try{
  db.save('kent',0,seed(),crypto.randomUUID());
  const preview=db.preview('kent',1,{...seed(),name:'Persisted'});const applied=db.apply('kent',preview);
  db.close();db=new TaskStore(path);
  assert.equal(db.read('kent').store.name,'Persisted');assert.deepEqual(db.apply('kent',preview),applied);
  assert.equal(db.read('another-user').store.tasks.length,0);
 }finally{db.close();rmSync(path);for(const suffix of ['-wal','-shm']){try{rmSync(path+suffix)}catch{}}rmdirSync(folder);}
});
