import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackup } from '../lib/backup.ts';
import { seed } from '../lib/taskline.ts';

test('backup transfer preserves tasks, profile and proposal history',()=>{
 const original=seed();original.name='Backup owner';original.applied=['previous-proposal'];
 assert.deepEqual(readBackup(JSON.stringify(original)),original);
});
test('backup rejects malformed tasks, duplicate IDs and missing dependencies',()=>{
 assert.throws(()=>readBackup('invalid JSON'));
 assert.throws(()=>readBackup(JSON.stringify({version:1,name:'Test',tasks:[{}],applied:[]})));
 const duplicate=seed();duplicate.tasks[1].id=duplicate.tasks[0].id;
 assert.throws(()=>readBackup(JSON.stringify(duplicate)),/duplicate/);
 const broken=seed();broken.tasks[0].dependencies=['missing-task'];
 assert.throws(()=>readBackup(JSON.stringify(broken)),/dependencies/);
});
