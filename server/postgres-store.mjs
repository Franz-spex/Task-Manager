import { randomUUID } from 'node:crypto';
import { storeSchema } from '../lib/taskline.ts';
import { emptyStore, validateStore, HttpError } from './store-contract.mjs';

// Separate tables avoid interfering with the existing Drizzle/Cloudflare schema.
export const schemaSql = `
CREATE TABLE IF NOT EXISTS taskbloc_workspaces (
  owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, body JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS taskbloc_proposals (
  id UUID PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL,
  body JSONB NOT NULL, expires BIGINT NOT NULL, result JSONB
);
CREATE INDEX IF NOT EXISTS taskbloc_proposals_expiry ON taskbloc_proposals(owner, expires);
CREATE TABLE IF NOT EXISTS taskbloc_receipts (
  owner TEXT NOT NULL, request_id UUID NOT NULL, body JSONB NOT NULL,
  PRIMARY KEY (owner, request_id)
);`;

export class PostgresStore {
  constructor(pool) { this.pool = pool; }
  async read(owner, client = this.pool) {
    const { rows } = await client.query('SELECT revision, body FROM taskbloc_workspaces WHERE owner=$1', [owner]);
    return rows[0] ? { revision: Number(rows[0].revision), store: storeSchema.parse(rows[0].body) }
      : { revision: 0, store: emptyStore() };
  }
  async transaction(owner, callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15s'");
      // Lock a workspace row before receipts/proposals, including the first save.
      // This works across concurrent requests and separate Vercel instances.
      await client.query('INSERT INTO taskbloc_workspaces VALUES ($1,0,$2) ON CONFLICT(owner) DO NOTHING', [owner, JSON.stringify(emptyStore())]);
      await client.query('SELECT owner FROM taskbloc_workspaces WHERE owner=$1 FOR UPDATE', [owner]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async save(owner, revision, input, requestId, client) {
    const store = validateStore(input);
    if (!client) return this.transaction(owner, tx => this.save(owner, revision, store, requestId, tx));
    const { rows } = await client.query('SELECT body FROM taskbloc_receipts WHERE owner=$1 AND request_id=$2', [owner, requestId]);
    if (rows[0]) return rows[0].body;
    const current = await this.read(owner, client);
    if (current.revision !== revision) throw new HttpError(409, 'Your board changed in another session. Refresh the shared board and review your changes before saving again.');
    const result = { revision: revision + 1, store };
    await client.query('UPDATE taskbloc_workspaces SET revision=$2, body=$3 WHERE owner=$1', [owner, result.revision, JSON.stringify(store)]);
    await client.query('INSERT INTO taskbloc_receipts VALUES ($1,$2,$3)', [owner, requestId, JSON.stringify(result)]);
    return result;
  }
  async preview(owner, revision, input, client = this.pool) {
    const store = validateStore(input);
    await client.query('DELETE FROM taskbloc_proposals WHERE owner=$1 AND expires < $2', [owner, Date.now()]);
    const id = randomUUID();
    await client.query('INSERT INTO taskbloc_proposals VALUES ($1,$2,$3,$4,$5,NULL)', [id, owner, revision, JSON.stringify(store), Date.now() + 30 * 60_000]);
    return id;
  }
  async apply(owner, id) {
    return this.transaction(owner, async client => {
      const { rows } = await client.query('SELECT * FROM taskbloc_proposals WHERE id=$1 AND owner=$2', [id, owner]);
      const row = rows[0];
      if (!row || Number(row.expires) < Date.now()) throw new HttpError(404, 'This preview expired or belongs to another workspace. Create a new preview.');
      if (row.result) return row.result;
      const current = await this.read(owner, client);
      const result = await this.save(owner, Number(row.revision), row.body, id, client);
      const undoId = await this.preview(owner, result.revision, current.store, client);
      const response = { ...result, undoId };
      await client.query('UPDATE taskbloc_proposals SET result=$3 WHERE id=$1 AND owner=$2', [id, owner, JSON.stringify(response)]);
      return response;
    });
  }
  close() { return this.pool.end(); }
}
