import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TaskStore, HttpError } from './store.mjs';
import { generatePlan } from './planner.mjs';
import { createMcp } from './mcp.mjs';
import { storeSchema } from '../lib/taskline.ts';

export function configuration(env = process.env) {
  const issuer = env.TASKLINE_AUTH_ISSUER || '';
  const resource = env.TASKLINE_PUBLIC_URL ? new URL('/mcp', env.TASKLINE_PUBLIC_URL).href : '';
  const webOrigin = new URL(env.TASKLINE_WEB_ORIGIN || 'http://localhost:5173').origin;
  if (issuer && (new URL(issuer).protocol !== 'https:' || !issuer.endsWith('/'))) throw new Error('TASKLINE_AUTH_ISSUER must be an HTTPS issuer ending in /.');
  if (resource && new URL(resource).protocol !== 'https:') throw new Error('TASKLINE_PUBLIC_URL must use HTTPS.');
  const users = (env.TASKLINE_ALLOWED_SUBJECTS || '').split(',').map(s => s.trim()).filter(Boolean);
  const clientId = env.TASKLINE_AUTH_CLIENT_ID || '';
  return { issuer, resource, webOrigin, users, clientId, authReady: !!(issuer && resource && clientId && users.length),
    aiEnabled: env.TASKLINE_AI_ENABLED === 'true',
    key: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || 'gpt-4o-mini', database: env.TASKLINE_DATABASE || '.taskline/tasks.sqlite' };
}

export function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  const store = options.store || new TaskStore(config.database);
  const jwks = options.jwks || (config.issuer ? createRemoteJWKSet(new URL('.well-known/jwks.json', config.issuer)) : null);
  const verify = options.verify || (async token => {
    const { payload } = await jwtVerify(token, jwks, { issuer: config.issuer, audience: config.resource, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
    return payload;
  });
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && origin !== config.webOrigin) return res.status(403).json({ error: 'Origin not allowed.' });
    if (origin) { res.set('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/taskline/config', (_req, res) => res.json({
    authReady: config.authReady, aiReady: config.aiEnabled === true && config.authReady && !!config.key, aiPaused: config.aiEnabled !== true, issuer: config.issuer, clientId: config.clientId,
    resource: config.resource, model: config.model,
    missing: [!config.issuer && 'OAuth issuer', !config.clientId && 'Web sign-in client', !config.resource && 'Public HTTPS endpoint', !config.users.length && 'Workspace member', !config.key && 'OpenAI API key'].filter(Boolean)
  }));
  app.get('/.well-known/oauth-protected-resource', (_req, res) => config.authReady
    ? res.json({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: ['tasks:read', 'tasks:write'], bearer_methods_supported: ['header'] })
    : res.status(503).json({ error: 'Connector authentication is not configured.' }));
  const challenge = `Bearer resource_metadata="${config.resource ? new URL('/.well-known/oauth-protected-resource', config.resource).href : ''}"`;
  async function authenticate(req, res, next) {
    if (!config.authReady) return res.status(503).json({ error: 'Configure the OAuth provider and workspace membership first.' });
    try {
      const match = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
      if (!match) throw new Error('Missing token');
      const payload = await verify(match[1]);
      if (!payload.sub || !config.users.includes(payload.sub)) return res.status(403).json({ error: `This signed-in account is not allowed in this workspace. Account ID: ${payload.sub || 'unavailable'}. Ask the workspace owner to add this exact ID, then restart the backend.` });
      req.owner = `${config.issuer}|${payload.sub}`;
      req.scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
      next();
    } catch (error) {
      const code = error.cause?.code || error.code;
      if (['EACCES', 'EPERM', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ERR_JWKS_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
        return res.status(503).json({ error: 'Taskline could not reach the sign-in provider to verify your login. Restore backend network access, then reconnect.' });
      }
      res.set('WWW-Authenticate', challenge).status(401).json({ error: 'Your sign-in could not be verified. Reconnect to your Taskline workspace.' });
    }
  }
  const requireScope = scope => (req, res, next) => req.scopes.includes(scope) ? next()
    : res.set('WWW-Authenticate', `${challenge}, error="insufficient_scope", scope="${scope}"`).status(403).json({ error: `Reconnect with ${scope} permission.` });
  const buckets = new Map();
  function limit(req, _res, next) {
    const now = Date.now();
    for (const [key, value] of buckets) if (now - value.start > 60_000) buckets.delete(key);
    const bucket = buckets.get(req.owner) || { start: now, count: 0 };
    buckets.set(req.owner, bucket); bucket.count++;
    if (bucket.count > 10) return next(new HttpError(429, 'Please wait a minute before asking for another plan.'));
    next();
  }
  app.get('/api/taskline/store', authenticate, requireScope('tasks:read'), (req, res) => res.json(store.read(req.owner)));
  app.put('/api/taskline/store', authenticate, requireScope('tasks:write'), (req, res) => {
    const input = z.object({ revision: z.number().int().nonnegative(), store: storeSchema, requestId: z.string().uuid() }).parse(req.body);
    res.json(store.save(req.owner, input.revision, input.store, input.requestId));
  });
  app.post('/api/taskline/plan', authenticate, requireScope('ai:plan'), limit, async (req, res) => {
    if (config.aiEnabled !== true) throw new HttpError(503, 'Live AI is paused. Use the demo assistant for now.');
    const input = z.object({ prompt: z.string().trim().min(1).max(6000), revision: z.number().int().nonnegative(), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const snapshot = store.read(req.owner);
    if (snapshot.revision !== input.revision) throw new HttpError(409, 'The shared board changed. Refresh it before planning.');
    res.json(await generatePlan({ key: config.key, model: config.model, prompt: input.prompt, today: input.today, tasks: snapshot.store.tasks }, options.fetcher));
  });
  app.all('/mcp', authenticate, requireScope('tasks:read'), async (req, res) => {
    if (req.method !== 'POST') { res.set('Allow', 'POST'); return res.status(405).json({ error: 'Use MCP Streamable HTTP POST requests.' }); }
    const server = createMcp(store, req.owner, req.scopes);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.use((error, _req, res, _next) => {
    const status = error instanceof z.ZodError ? 400 : error.status || 500;
    res.status(status).json({ error: error instanceof z.ZodError ? 'Invalid input. Check the task fields and try again.' : status < 500 || error instanceof HttpError ? error.message : 'The server could not save this request. Your input is preserved.' });
  });
  return { app, store };
}
