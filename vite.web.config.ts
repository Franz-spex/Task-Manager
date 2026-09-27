import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({mode}) => ({
  define:{__TASKBLOC_BROWSER_ONLY__:JSON.stringify(mode === 'browser')},
  plugins:[{
    name:'taskline-local-sign-in-origin',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        if(req.method==='GET' && req.headers.host==='127.0.0.1:5173'){
          res.writeHead(302,{Location:'http://localhost:5173'+(req.url?.startsWith('/')?req.url:'/'),'Cache-Control':'no-store'});
          res.end();
          return;
        }
        next();
      });
    },
  }],
  root:root+'web',publicDir:root+'public',
  resolve:{alias:{'@':root}},
  css:{postcss:root},
  server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api/taskline':'http://127.0.0.1:8788'}},
  build:{outDir:root+'dist/web',emptyOutDir:true},
}));
