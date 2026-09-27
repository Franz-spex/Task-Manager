import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { configuration, createApp } from './app.mjs';

if(existsSync('.env.local'))loadEnvFile('.env.local');
const directory=resolve('dist/web');
if(!existsSync(resolve(directory,'index.html')))throw new Error('Build the website with npm run build:host first.');
const {app,store}=createApp(configuration());
app.get('/healthz',(_req,res)=>res.json({status:'ok'}));
app.use(express.static(directory,{index:false}));
app.get('/',(_req,res)=>res.sendFile(resolve(directory,'index.html')));
// Unknown API routes must remain errors rather than returning an HTML document.
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
const server=app.listen(Number(process.env.PORT||8788),process.env.TASKLINE_BIND||'127.0.0.1',()=>console.log('Taskline production service ready.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0)}));
