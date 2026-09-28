import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeSchema } from '../lib/taskline.ts';

import { HttpError, validateStore } from './store-contract.mjs';
export { HttpError } from './store-contract.mjs';

// Each authenticated subject owns a separate personal workspace. Client-supplied
// workspace IDs never select a database partition.
export class TaskStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces(owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, expires INTEGER NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS receipts(owner TEXT NOT NULL, request_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner, request_id));`);
  }
  read(owner) {
    const row = this.db.prepare('SELECT revision, body FROM workspaces WHERE owner=?').get(owner);
    return row ? { revision: Number(row.revision), store: storeSchema.parse(JSON.parse(row.body)) }
      : { revision: 0, store: { version: 1, name: 'Kent', tasks: [], applied: [] } };
  }
  save(owner, revision, input, requestId, inTransaction = false) {
    const store = validateStore(input);
    if (!inTransaction) this.db.exec('BEGIN IMMEDIATE');
    try {
      const receipt = this.db.prepare('SELECT body FROM receipts WHERE owner=? AND request_id=?').get(owner, requestId);
      if (receipt) { if (!inTransaction) this.db.exec('COMMIT'); return JSON.parse(receipt.body); }
      const current = this.read(owner);
      if (current.revision !== revision) throw new HttpError(409, 'Your board changed in another session. Refresh the shared board and review your changes before saving again.');
      const result = { revision: revision + 1, store };
      this.db.prepare('INSERT INTO workspaces VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(owner, result.revision, JSON.stringify(store));
      this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(owner, requestId, JSON.stringify(result));
      if (!inTransaction) this.db.exec('COMMIT');
      return result;
    } catch (e) { if (!inTransaction) this.db.exec('ROLLBACK'); throw e; }
  }
  preview(owner, revision, store) {
    this.db.prepare('DELETE FROM proposals WHERE expires < ?').run(Date.now());
    const id = randomUUID();
    this.db.prepare('INSERT INTO proposals VALUES(?,?,?,?,?,NULL)').run(id, owner, revision, JSON.stringify(storeSchema.parse(store)), Date.now() + 30 * 60_000);
    return id;
  }
  apply(owner, id) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
    const row = this.db.prepare('SELECT * FROM proposals WHERE id=? AND owner=?').get(id, owner);
    if (!row || Number(row.expires) < Date.now()) throw new HttpError(404, 'This preview expired or belongs to another workspace. Create a new preview.');
    if (row.result) { this.db.exec('COMMIT'); return JSON.parse(row.result); }
    const current = this.read(owner);
    const result = this.save(owner, Number(row.revision), JSON.parse(row.body), id, true);
    const undoId = this.preview(owner, result.revision, current.store);
    const response = { ...result, undoId };
    this.db.prepare('UPDATE proposals SET result=? WHERE id=? AND owner=?').run(JSON.stringify(response), id, owner);
    this.db.exec('COMMIT');
    return response;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  close() { this.db.close(); }
}
