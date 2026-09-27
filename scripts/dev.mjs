import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const port of [8788,5173]) {
 await new Promise((resolve,reject)=>{
  const probe=createServer();
  probe.once('error',()=>reject(new Error(`Port ${port} is already occupied. Stop the previous Taskline service before starting this copy.`)));
  probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
 });
}
const backend=spawn(process.execPath,['--experimental-strip-types','server/start.mjs'],{stdio:'inherit',windowsHide:true});
const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','vite.web.config.ts'],{stdio:'inherit',windowsHide:true});
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;backend.kill();frontend.kill();process.exitCode=code;}
for(const processHandle of [backend,frontend]){
 processHandle.on('error',()=>{console.error('Could not start Taskline. Check Node.js and the local ports.');stop(1)});
 processHandle.on('exit',code=>{if(!stopping)console.error('Taskline service exited unexpectedly. See the startup error above.');stop(code||1)});
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
