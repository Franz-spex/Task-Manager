import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createVercelHandler } from '../server/vercel.mjs';

async function fixture(env = {}, options = {}) {
  const server = createServer(createVercelHandler(env, options)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Vercel without a database preserves browser mode and fails closed on shared routes', async () => {
  const f = await fixture({ VERCEL: '1' });
  try {
    for (const path of ['/api/taskline/config', '/api/backend?taskblocRoute=config']) {
      const res = await fetch(f.base + path);
      assert.equal(res.status, 200);
      const config = await res.json();
      assert.equal(config.browserOnly, true); assert.equal(config.authReady, false);
      assert.equal(config.aiPaused, true); assert.equal(config.aiReady, false);
      assert(config.missing.includes('Hosted database'));
      assert(!config.missing.includes('OpenAI API key'));
    }
    for (const path of ['/api/taskline/store', '/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      assert.equal((await fetch(f.base + path)).status, 503);
    }
    assert.equal((await fetch(f.base + '/api/backend?taskblocRoute=__proto__')).status, 404);
    assert.equal((await fetch(f.base + '/api/backend?taskblocRoute=unknown')).status, 404);
  } finally { await f.close(); }
});

test('Vercel rewrite exposes OAuth metadata and challenges anonymous requests without reading tasks', async () => {
  let reads = 0;
  const f = await fixture({ VERCEL: '1', TASKLINE_AUTH_ISSUER: 'https://auth.example/',
    TASKLINE_PUBLIC_URL: 'https://taskbloc.example', TASKLINE_WEB_ORIGIN: 'https://taskbloc.example',
    TASKLINE_AUTH_CLIENT_ID: 'web', TASKLINE_ALLOWED_SUBJECTS: 'kent' }, {
    store: { read: async () => { reads++; throw new Error('Private database'); } },
  });
  try {
    const metadata = await (await fetch(f.base + '/api/backend?taskblocRoute=metadata')).json();
    assert.equal(metadata.resource, 'https://taskbloc.example/mcp');
    const response = await fetch(f.base + '/api/backend?taskblocRoute=mcp', { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate'), /oauth-protected-resource/);
    assert.equal(reads, 0);
    const config = await (await fetch(f.base + '/api/taskline/config')).json();
    assert.equal(config.authReady, true); assert.equal(config.aiReady, false);
    assert(!JSON.stringify(config).includes('DATABASE_URL'));
  } finally { await f.close(); }
});
