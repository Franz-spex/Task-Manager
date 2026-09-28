import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

export function createPostgresPool(connectionString) {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
  // Do not log connection strings or error objects that can contain credentials.
  pool.on('error', () => console.error('A taskbloc database connection was interrupted.'));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}
