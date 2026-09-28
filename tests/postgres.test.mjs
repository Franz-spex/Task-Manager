import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PostgresStore, schemaSql } from '../server/postgres-store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../lib/taskline.ts';

// PGlite runs PostgreSQL locally. These tests validate SQL and transactions, not
// hosted TLS/pooling or locks across separate database connections.
test('Postgres persistence, rollback, owner isolation and HTTP/MCP integration', async t => {
  const db = new PGlite();
  await db.exec(schemaSql);
  await db.exec(schemaSql); // A rerun must preserve the schema and data.
  let failReceipt = false;
  const query = (sql, params) => {
    if (failReceipt && sql.startsWith('INSERT INTO taskbloc_receipts')) throw new Error('Injected storage failure');
    return db.query(sql, params);
  };
  const pool = { query, connect: async () => ({ query, release() {} }), end: () => db.close() };
  let store = new PostgresStore(pool);
  try {
    await t.test('save survives adapter recreation; retries, conflicts and ownership are enforced', async () => {
      const requestId = crypto.randomUUID();
      const saved = await store.save('a', 0, seed(), requestId);
      store = new PostgresStore(pool);
      assert.deepEqual(await store.read('a'), saved);
      assert.deepEqual(await store.save('a', 0, seed(), requestId), saved);
      assert.equal((await store.read('b')).store.tasks.length, 0);
      await assert.rejects(store.save('a', 0, seed(), crypto.randomUUID()), { status: 409 });
      const invalid = seed(); invalid.tasks[0].dependencies = ['foreign-task'];
      await assert.rejects(store.save('a', 1, invalid, crypto.randomUUID()), { status: 400 });
      assert.equal((await store.read('a')).revision, 1);
    });
    await t.test('preview, repeated apply and undo are durable; stale undo and expired previews fail', async () => {
      const id = await store.preview('a', 1, { ...seed(), name: 'Updated' });
      assert.equal((await store.read('a')).store.name, 'Kent');
      await assert.rejects(store.apply('b', id), { status: 404 });
      const applied = await store.apply('a', id);
      assert.equal(applied.revision, 2);
      store = new PostgresStore(pool);
      assert.deepEqual(await store.apply('a', id), applied);
      assert.equal((await store.apply('a', applied.undoId)).store.name, 'Kent');
      const next = await store.apply('a', await store.preview('a', 3, { ...seed(), name: 'Next' }));
      await store.save('a', 4, { ...seed(), name: 'Later' }, crypto.randomUUID());
      await assert.rejects(store.apply('a', next.undoId), { status: 409 });
      assert.equal((await store.read('a')).store.name, 'Later');
      const expired = await store.preview('a', 5, seed());
      await db.query('UPDATE taskbloc_proposals SET expires=0 WHERE id=$1', [expired]);
      await assert.rejects(store.apply('a', expired), { status: 404 });
    });
    await t.test('failed save rolls back the workspace update and can be retried', async () => {
      const requestId = crypto.randomUUID();
      failReceipt = true;
      await assert.rejects(store.save('a', 5, { ...seed(), name: 'After retry' }, requestId));
      failReceipt = false;
      assert.equal((await store.read('a')).revision, 5);
      assert.equal((await store.read('a')).store.name, 'Later');
      assert.equal((await store.save('a', 5, { ...seed(), name: 'After retry' }, requestId)).revision, 6);
    });
    await t.test('website and MCP use the same async database and keep AI paused', async () => {
      const issuer = 'https://test.example/';
      let aiCalls = 0;
      const { app } = createApp({ issuer, resource: issuer + 'mcp', webOrigin: 'http://localhost:5173',
        users: ['kent'], clientId: 'test', authReady: true, aiEnabled: false }, {
        store, verify: async () => ({ sub: 'kent', scope: 'tasks:read tasks:write ai:plan' }),
        fetcher: async () => { aiCalls++; throw new Error('Must not call OpenAI'); },
      });
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };
      const client = new Client({ name: 'postgres-test', version: '1' });
      try {
        const saved = await fetch(base + '/api/taskline/store', { method: 'PUT', headers,
          body: JSON.stringify({ revision: 0, store: seed(), requestId: crypto.randomUUID() }) });
        assert.equal(saved.status, 200);
        await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers } }));
        const call = async (name, args = {}) => {
          const result = await client.callTool({ name, arguments: args });
          assert(!result.isError, JSON.stringify(result)); return result.structuredContent;
        };
        const listing = await call('list_tasks');
        assert.equal(listing.tasks.length, 9);
        const changed = { ...listing.tasks[0], title: 'Shared from ChatGPT' };
        const preview = await call('preview_changes', { revision: 1, upsert: [changed] });
        const applied = await call('apply_changes', { previewId: preview.previewId });
        assert.deepEqual(await call('apply_changes', { previewId: preview.previewId }), applied);
        const board = await (await fetch(base + '/api/taskline/store', { headers })).json();
        assert.equal(board.store.tasks.find(task => task.id === changed.id).title, changed.title);
        assert.equal((await call('get_task', { id: changed.id })).task.title, changed.title);
        await call('undo_changes', { undoId: applied.undoId });
        assert.notEqual((await call('get_task', { id: changed.id })).task.title, changed.title);
        const paused = await fetch(base + '/api/taskline/plan', { method: 'POST', headers, body: '{}' });
        assert.equal(paused.status, 503); assert.equal(aiCalls, 0);
      } finally { await client.close(); await new Promise(resolve => server.close(resolve)); }
    });
  } finally { await db.close(); }
});
