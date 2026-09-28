import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createPostgresPool } from '../server/postgres-pool.mjs';
import { schemaSql } from '../server/postgres-store.mjs';

if (existsSync('.env.local')) loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in the server environment before migrating.');
const pool = createPostgresPool(process.env.DATABASE_URL);
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(schemaSql);
  await client.query('COMMIT');
  console.log('taskbloc Postgres tables are ready. Existing tasks were preserved.');
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error('Migration failed. Check database access and try again.');
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
