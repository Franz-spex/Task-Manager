import { Auth0Client } from '@auth0/auth0-spa-js';
import { storeSchema, type Store, type Proposal, dateKey } from './taskline';

export type ConnectionConfig = { authReady:boolean; aiReady:boolean; aiPaused?:boolean; browserOnly?:boolean; issuer:string; clientId:string; resource:string; model:string; missing:string[] };
export type Snapshot = { revision:number; store:Store };
let client: Auth0Client | null = null;
declare const __TASKBLOC_BROWSER_ONLY__: boolean;
export async function getConfig():Promise<ConnectionConfig> {
  if (typeof __TASKBLOC_BROWSER_ONLY__ !== 'undefined' && __TASKBLOC_BROWSER_ONLY__) return {authReady:false,aiReady:false,aiPaused:true,browserOnly:true,issuer:'',clientId:'',resource:'',model:'',missing:['Hosted shared backend']};
  const response = await fetch('/api/taskline/config');
  if (!response.ok) throw new Error('The shared connection is unavailable. Your browser tasks are still saved on this device. Try checking the connection again shortly.');
  return response.json();
}
function makeClient(config:ConnectionConfig) {
  if (!config.authReady) throw new Error('Complete the connection settings before signing in.');
  client = new Auth0Client({ domain:new URL(config.issuer).host, clientId:config.clientId,
    authorizationParams:{ audience:config.resource, scope:'openid profile tasks:read tasks:write'+(config.aiReady?' ai:plan':''), redirect_uri:window.location.origin },
    cacheLocation:'memory', useRefreshTokens:false });
  return client;
}
export async function signIn(config:ConnectionConfig):Promise<Snapshot> {
  await makeClient(config).loginWithRedirect();
  return new Promise<Snapshot>(()=>{});
}
let redirectCompletion:Promise<Snapshot>|null=null;
export function finishSignIn(config:ConnectionConfig):Promise<Snapshot> {
  if(!redirectCompletion)redirectCompletion=(async()=>{
    try{await makeClient(config).handleRedirectCallback();}
    finally{window.history.replaceState({},'',window.location.pathname);}
    return readRemote();
  })();
  return redirectCompletion;
}
export async function signOut() { const current=client; client=null; if(current)await current.logout({logoutParams:{returnTo:window.location.origin}}); }
export async function api<T>(path:string, body?:unknown, method='POST'):Promise<T> {
  if(!client)throw new Error('Sign in again to reconnect your shared workspace.');
  const token=await client.getTokenSilently();
  const response=await fetch('/api/taskline/'+path,{method:body===undefined?'GET':method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(75_000)});
  const result=await response.json() as T & {error?:string};
  if(!response.ok)throw new Error(result.error||'The request could not be completed. Your changes are still available to retry.');
  return result;
}
export async function readRemote():Promise<Snapshot>{const snapshot=await api<Snapshot>('store');return {...snapshot,store:storeSchema.parse(snapshot.store)};}
export async function saveRemote(store:Store,revision:number,requestId:string){return api<Snapshot>('store',{store,revision,requestId},'PUT');}
export async function livePlan(prompt:string,revision:number){return api<Proposal>('plan',{prompt,revision,today:dateKey()});}
