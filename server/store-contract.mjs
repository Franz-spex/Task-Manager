import { storeSchema } from '../lib/taskline.ts';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const emptyStore = () => ({ version: 1, name: 'Kent', tasks: [], applied: [] });

export function validateStore(input) {
  const store = storeSchema.parse(input);
  const ids = new Set(store.tasks.map(task => task.id));
  if (store.tasks.length > 2000 || ids.size !== store.tasks.length)
    throw new HttpError(400, 'Task IDs must be unique; a workspace supports up to 2,000 tasks.');
  if (store.tasks.some(task => task.dependencies.some(id => !ids.has(id) || id === task.id)))
    throw new HttpError(400, 'Dependencies must refer to other tasks in this workspace.');
  return store;
}
