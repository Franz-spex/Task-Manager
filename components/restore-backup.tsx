'use client';
import { useState } from 'react';
import { readBackup } from '@/lib/backup';
import { type Store } from '@/lib/taskline';
import { Button } from './taskline-shared';

export function RestoreBackup({restore,blocked,connected}:{restore:(store:Store)=>Promise<boolean>;blocked:boolean;connected:boolean}) {
  const [preview,setPreview]=useState<Store|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <section><h2>Restore a backup</h2><p>Move your tasks between localhost and the hosted app using an exported JSON backup.</p>
    <label>Choose backup<input type="file" accept=".json,application/json" disabled={busy||blocked} onChange={async event=>{
      const file=event.target.files?.[0];event.target.value='';setPreview(null);setMessage('');if(!file)return;
      setBusy(true);
      try{if(file.size>5_000_000)throw new Error('Choose a backup smaller than 5 MB.');setPreview(readBackup(await file.text()));}
      catch{setMessage('This backup is invalid or too large. Your current tasks are unchanged.');}
      finally{setBusy(false);}
    }}/></label>
    {preview&&<div><p>This backup contains {preview.tasks.length} tasks. Restoring replaces your current {connected?'shared':'browser'} workspace, including your profile. Export a backup first if you want to keep it.</p>
      <Button primary disabled={busy||blocked} onClick={async()=>{setBusy(true);try{if(await restore(preview)){setPreview(null);setMessage('Backup restored.');}else setMessage('Restore failed. Your backup remains ready to retry.');}catch{setMessage('Restore failed. Your backup remains ready to retry.');}finally{setBusy(false);}}}>Replace workspace with backup</Button>
      <Button disabled={busy} onClick={()=>setPreview(null)}>Cancel</Button></div>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
