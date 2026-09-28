import { configuration, createApp } from './app.mjs';
import { PostgresStore } from './postgres-store.mjs';
import { createPostgresPool } from './postgres-pool.mjs';

const routes = {
  config: '/api/taskline/config', store: '/api/taskline/store', plan: '/api/taskline/plan',
  mcp: '/mcp', metadata: '/.well-known/oauth-protected-resource',
};

// Keep the pool and Express app across warm invocations. No local filesystem
// storage is imported by this serverless entrypoint.
export function createVercelHandler(env = process.env, options = {}) {
  const store = Object.hasOwn(options, 'store') ? options.store
    : env.DATABASE_URL ? new PostgresStore(createPostgresPool(env.DATABASE_URL)) : null;
  const { app } = createApp(configuration(env), { ...options, store });
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Rewrites can retain the original path or expose the function path.
    if (url.pathname === '/api/backend') {
      const name = url.searchParams.get('taskblocRoute');
      const route = Object.hasOwn(routes, name) ? routes[name] : null;
      if (!route) { res.statusCode = 404; return res.end('Not found'); }
      req.url = route;
    }
    return app(req, res);
  };
}
