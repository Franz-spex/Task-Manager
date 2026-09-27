import { z } from 'zod';

export const statuses = ['To Do', 'In Progress', 'In Review', 'Completed'] as const;
export const priorities = ['High', 'Medium', 'Low'] as const;
export const taskSchema = z.object({
  id: z.string().min(1), workspaceId: z.literal('personal'), title: z.string().trim().min(1).max(200),
  description: z.string().max(5000), project: z.string().trim().min(1).max(100),
  status: z.enum(statuses), priority: z.enum(priorities), due: z.string().refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && dateKey(new Date(v+'T12:00:00'))===v)),
  tags: z.array(z.string().max(50)).max(20), checklist: z.array(z.object({ title: z.string().max(200), done: z.boolean() })).max(50),
  estimate: z.number().min(0).max(1000), dependencies: z.array(z.string()),
});
export type Task = z.infer<typeof taskSchema>;
export const storeSchema = z.object({ version: z.literal(1), tasks: z.array(taskSchema), name: z.string().max(60), applied: z.array(z.string()) });
export type Store = z.infer<typeof storeSchema>;
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function dayAfter(n:number) { const d=new Date(); d.setDate(d.getDate()+n); return dateKey(d); }
export const uid = () => crypto.randomUUID();
export function blankTask(status: Task['status']='To Do', project='Website Launch'): Task { return {id:uid(),workspaceId:'personal',title:'',description:'',project,status,priority:'Medium',due:'',tags:[],checklist:[],estimate:0,dependencies:[]}; }
export function seed():Store {
 const rows: [string,string,Task['status'],Task['priority'],number,string[]][] = [
  ['Refine onboarding UX microcopy & empty states','Product Design','To Do','High',1,['Design']],
  ['Prepare Q3 growth review slides','Growth Review','To Do','Medium',4,['Strategy']],
  ['Review the website launch checklist','Website Launch','To Do','Medium',6,['Planning']],
  ['Design system token spec for dark mode','Product Design','In Progress','High',0,['UI/UX']],
  ['Build reusable task card components','Website Launch','In Progress','Medium',2,['Development']],
  ['Interactive prototype user testing findings report','Product Design','In Review','High',0,['Research']],
  ['Set up project workspace','Website Launch','Completed','Low',-2,['Planning']],
  ['Gather brand inspiration','Brand Refresh','Completed','Medium',-1,['Research']],
  ['Define website goals','Website Launch','Completed','High',-3,['Strategy']],
 ];
 return {version:1,name:'Kent',applied:[],tasks:rows.map((r,i)=>({...blankTask(r[2],r[1]),id:`sample-${i}`,title:r[0],priority:r[3],due:dayAfter(r[4]),tags:r[5],description:i===0?'Ensure friendly reassurance during first workspace creation steps.':i===1?'':'Review the requirements, complete the work, and share the result.',estimate:[2,1,3][i%3],checklist:[{title:'Prepare a first draft',done:r[2]==='In Progress'||r[2]==='Completed'},{title:'Review and refine',done:i===3||r[2]==='Completed'},{title:'Finalize the deliverable',done:r[2]==='Completed'}]}))};
}
export type Proposal = { key:string; summary:string; assumptions:string; tasks:Task[]; updates:boolean; before?:Task[] };
const normalize = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function propose(prompt:string,tasks:Task[],revision=0):Proposal {
 const p=prompt.toLowerCase(); const active=tasks.filter(t=>t.status!=='Completed');
 const key=normalize(prompt); const base={key,before:tasks,summary:'Review your proposed plan',assumptions:'Demo mode uses local rules, not an AI model. Dates and time estimates are suggestions. Nothing changes until you apply.',updates:false};
 if(/summari[sz]e|progress/.test(p))return {...base,summary:`${tasks.filter(t=>t.status==='Completed').length} of ${tasks.length} tasks completed. ${active.filter(t=>t.due&&t.due<dateKey()).length} open tasks are overdue. ${tasks.filter(t=>t.status==='In Review').length} tasks await review.`,tasks:[]};
 if(/focus|today/.test(p)&& !/launch/.test(p))return {...base,summary:'Suggested focus for today',updates:true,tasks:[...active].sort((a,b)=>priorities.indexOf(a.priority)-priorities.indexOf(b.priority)||(a.due||'9999').localeCompare(b.due||'9999')).slice(0,3).map(t=>({...t,due:dateKey()}))};
 if(/unfinished|next week|this week|organize my tasks/.test(p)&& !/launch/.test(p)) {
  const d=new Date();const nextMonday=(8-d.getDay())%7||7;
  return {...base,summary:/unfinished|next week/.test(p)?'Move unfinished tasks to next week':'A suggested schedule for your open tasks',updates:true,tasks:active.map((t,i)=>({...t,due:dayAfter(/next week/.test(p)?nextMonday+i%5:Math.min(i%5,(7-d.getDay())%7))}))};
 }
 if(/break|smaller/.test(p)) {
  const match=active.find(t=>p.includes(t.title.toLowerCase()));
  if(!match) return {...base,summary:'Which task should I break down? Include its exact title in your next message.',tasks:[]};
  return {...base,summary:`Suggested checklist for “${match.title}”`,updates:true,tasks:[{...match,checklist:[...match.checklist,{title:'Clarify the outcome and acceptance criteria',done:false},{title:'Complete a focused first pass',done:false},{title:'Check the result against the acceptance criteria',done:false}]}]};
 }
 const website=/website|homepage|mobile|analytics|contact form/.test(p);
 const titles=website?['Finalize the homepage','Write website content','Check the mobile layout','Set up analytics','Test the contact form']:
 prompt.replace(/^.*?(?:i need to|tasks:|plan:)/i,'').split(/,|;|\n|\band\b/).map(s=>s.trim().replace(/[.!]$/,'')).filter(Boolean).slice(0,12);
 const d=new Date();const friday=(5-d.getDay()+7)%7||7;
 const deadline=/next friday/.test(p)?((8-d.getDay())%7||7)+4:/friday/.test(p)?friday:7;
 const project=website?'Website Launch':'Personal Plan';
 const planned=titles.map((title,i)=>({...blankTask('To Do',project),title:title[0].toUpperCase()+title.slice(1),description:`Complete ${title.toLowerCase()} and verify it is ready for ${project.toLowerCase()}.`,priority:(i<2?'High':'Medium') as Task['priority'],due:dayAfter(Math.min(deadline,Math.max(1,i+1+revision%2))),tags:[website?'Website':'Planning'],estimate:i<2?3:1,checklist:[{title:'Define the requirements',done:false},{title:'Complete the work',done:false},{title:'Review and verify the result',done:false}]}));
 if(website) { planned[2].dependencies=[planned[0].id,planned[1].id];planned[4].dependencies=[planned[0].id]; }
 return {...base,assumptions:base.assumptions+(website?' Grouped under Website Launch. “Next Friday” means Friday of next week.':' Split your request into steps; edit the project and checklist to fit your work.'),tasks:planned};
}
export function applyProposal(store:Store,proposal:Proposal,selected:Set<string>):Store {
 if(store.applied.includes(proposal.key)) throw new Error('This request has already been applied. Undo it before trying again.');
 const chosen=proposal.tasks.filter(t=>selected.has(t.id)).map(t=>taskSchema.parse(t));
 if(!chosen.length) throw new Error('Select at least one task.');
 const result=store.tasks.map(t=>({...t}));const remap=new Map<string,string>();
 for(const t of chosen) {const existing=proposal.updates?result.find(e=>e.id===t.id):result.find(e=>normalize(e.title)===normalize(t.title)&&normalize(e.project)===normalize(t.project));if(existing)remap.set(t.id,existing.id);}
 for(const t of chosen) {
  if(proposal.updates) {const i=result.findIndex(e=>e.id===t.id);if(i<0)throw new Error('A task in this proposal no longer exists. Regenerate the plan.'); const before=proposal.before?.find(e=>e.id===t.id);if(before&&JSON.stringify(before)!==JSON.stringify(result[i]))throw new Error('A task changed after this proposal was generated. Regenerate the plan to review the latest details.');result[i]=t;}
  else if(!remap.has(t.id))result.push(t);
 }
 const ids=new Set(result.map(t=>t.id));
 for(const t of result) t.dependencies=t.dependencies.map(id=>remap.get(id)||id).filter(id=>ids.has(id)&&id!==t.id);
 return storeSchema.parse({...store,tasks:result,applied:[...store.applied,proposal.key]});
}
