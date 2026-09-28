export async function runtimeStore(env = process.env) {
  if (env.DATABASE_URL) {
    const { createPostgresPool } = await import('./postgres-pool.mjs');
    const { PostgresStore } = await import('./postgres-store.mjs');
    return new PostgresStore(createPostgresPool(env.DATABASE_URL));
  }
  if (env.VERCEL) return null;
  const { TaskStore } = await import('./store.mjs');
  return new TaskStore(env.TASKLINE_DATABASE || '.taskline/tasks.sqlite');
}
