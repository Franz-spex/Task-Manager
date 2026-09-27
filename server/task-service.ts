/** Optional repository contract. The active HTTP/MCP implementation uses store.mjs. */
import { z } from 'zod';
import { taskSchema } from '../lib/taskline';

export const serverTaskSchema=taskSchema.extend({workspaceId:z.string().min(1)});
export type ServerTask=z.infer<typeof serverTaskSchema>;
export type Session={userId:string;workspaceId:string};
export interface TaskRepository {
  isMember(userId:string,workspaceId:string):Promise<boolean>;
  search(workspaceId:string,query:string):Promise<ServerTask[]>;
  upsert(workspaceId:string,task:ServerTask):Promise<void>;
}
/** Session must be resolved by a trusted server authentication adapter, never request JSON. */
export class WorkspaceTaskService {
 constructor(private repository:TaskRepository){}
 private async authorize(session:Session){if(!session.userId||!session.workspaceId||!await this.repository.isMember(session.userId,session.workspaceId))throw new Error('Forbidden');}
 async search(session:Session,query:string){await this.authorize(session);return (await this.repository.search(session.workspaceId,query)).filter(t=>t.workspaceId===session.workspaceId);}
 async save(session:Session,input:unknown){await this.authorize(session);const task=serverTaskSchema.parse(input);if(task.workspaceId!==session.workspaceId)throw new Error('Forbidden');await this.repository.upsert(session.workspaceId,task);return task;}
}
