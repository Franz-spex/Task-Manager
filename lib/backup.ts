import { storeSchema, type Store } from './taskline.ts';

export function readBackup(text:string):Store {
  const store=storeSchema.parse(JSON.parse(text));
  const ids=new Set(store.tasks.map(task=>task.id));
  if(ids.size!==store.tasks.length)throw new Error('The backup contains duplicate task IDs.');
  if(store.tasks.some(task=>task.dependencies.some(id=>id===task.id||!ids.has(id))))throw new Error('The backup contains invalid task dependencies.');
  return store;
}
