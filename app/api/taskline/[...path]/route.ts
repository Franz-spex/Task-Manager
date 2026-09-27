// Vinext's standalone server does not always install Vite's development proxy.
// Keep the same-origin API boundary available in both development and production.
const allowed = new Map([['config', ['GET']], ['store', ['GET', 'PUT']], ['plan', ['POST']]]);
async function forward(request: Request, context: {params: Promise<{path:string[]}>}) {
  const {path} = await context.params;
  const name = path.join('/');
  if (!allowed.has(name)) return Response.json({error:'Unknown Taskline endpoint.'},{status:404});
  if (!allowed.get(name)!.includes(request.method)) return Response.json({error:'Method not allowed.'},{status:405});
  const headers = new Headers();
  for (const key of ['authorization','content-type','origin']) {
    const value=request.headers.get(key); if(value)headers.set(key,value);
  }
  try {
    const response=await fetch(new URL('/api/taskline/'+name,process.env.TASKLINE_BACKEND_URL||'http://127.0.0.1:8788'),{
      method:request.method,headers,body:request.method==='GET'?undefined:await request.text(),
      signal:AbortSignal.timeout(80_000),redirect:'manual'
    });
    if(response.status>=300&&response.status<400)throw new Error('Unexpected backend redirect');
    const outputHeaders=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
    const challenge=response.headers.get('www-authenticate');if(challenge)outputHeaders.set('WWW-Authenticate',challenge);
    return new Response(response.body,{status:response.status,headers:outputHeaders});
  } catch {return Response.json({error:'The Taskline backend is unavailable. Start it with npm run backend, then retry.'},{status:503});}
}
export const GET=forward;
export const PUT=forward;
export const POST=forward;
