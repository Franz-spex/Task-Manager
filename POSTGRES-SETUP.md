# Activate hosted shared tasks

Repository: https://github.com/Franz-spex/Task-Manager

Production website: https://task-manager-spex3.vercel.app

The Vite website and Node API deploy together. Without `DATABASE_URL`, the website keeps browser storage and the demo assistant; shared task routes are disabled. Vercel never stores private tasks in a temporary SQLite file.

With Postgres and Auth0 configured, website saves and ChatGPT tools use the same durable, per-account workspace. Live in-app AI remains paused by default.

## Database and server configuration

1. In this Vercel project's **Storage** section, connect a Neon Postgres database. Use a separate database for preview deployments; do not connect previews to production task data.
2. Set the following server environment variables for **Production**. Store the database connection string only in Vercel or a private ignored `.env.local`; never paste it into chat, frontend variables, GitHub, or screenshots.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Provider's pooled Postgres connection string, with its required TLS settings |
| `TASKLINE_PUBLIC_URL` | `https://task-manager-spex3.vercel.app` |
| `TASKLINE_WEB_ORIGIN` | `https://task-manager-spex3.vercel.app` |
| `TASKLINE_AUTH_ISSUER` | Your Auth0 HTTPS issuer, including its trailing `/` |
| `TASKLINE_AUTH_CLIENT_ID` | Auth0 browser application's client ID |
| `TASKLINE_ALLOWED_SUBJECTS` | Your exact Auth0 account ID; comma-separated for multiple allowed accounts |
| `TASKLINE_AI_ENABLED` | `false` |

3. Initialize the database once with `npm run db:migrate:postgres` in a trusted environment containing `DATABASE_URL`. The migration only creates missing tables/indexes; rerunning it does not replace existing tasks. It is deliberately separate from the build so preview builds cannot migrate production data.
4. Configure Auth0 as below, then redeploy Production to load the environment variables.

The pool is reused by warm Vercel invocations and registered with Vercel's pool lifecycle helper. Transactions lock the workspace row before updates, enforce revisions, and keep retry receipts and undo previews in Postgres.

## Auth0 production configuration

- Create/use an API with the exact identifier `https://task-manager-spex3.vercel.app/mcp`, RS256 signing, and permissions `tasks:read` and `tasks:write`. The old temporary tunnel's API identifier does not match this production audience.
- Grant the existing taskbloc browser application these two permissions under **User-delegated access**. Keep automatic grants for future permissions disabled.
- Add `https://task-manager-spex3.vercel.app` to that browser application's allowed callback URLs, logout URLs, and web origins. Keep localhost entries if still developing locally.
- Keep the provider's MCP resource/audience and S256 PKCE configuration enabled. For ChatGPT, authorize the actual OAuth client used by that connection under the API's per-application access policy. Browser application grants do not authorize a different ChatGPT OAuth client.
- Use the exact callback URL and client-registration method shown by ChatGPT. Do not assume dynamic registration alone grants access to a per-application API.

No OpenAI API key is needed for the task tools. `ai:plan` is only needed if in-app AI is enabled later.

## Existing tasks

Localhost and the hosted website have separate browser storage. Export tasks from the original app, then restore that JSON in the hosted app. A GitHub push never transfers private task data.

After signing in on the hosted site, select **Import browser tasks** to copy tasks to the shared board. Existing shared task IDs are retained. Export old SQLite-backed shared tasks while signed in before moving them; this deployment does not automatically upload local databases.

## Verify before calling the connection complete

1. `/api/taskline/config` returns JSON, `authReady: true`, and `aiPaused: true` after configuration. This confirms configuration presence, not database connectivity.
2. `/.well-known/oauth-protected-resource` reports the exact production `/mcp` resource. An anonymous `/mcp` request gets `401` and a `WWW-Authenticate` metadata challenge.
3. Sign in on the website; create a task and refresh/reconnect to confirm it persists.
4. In ChatGPT developer mode, add `https://task-manager-spex3.vercel.app/mcp` with OAuth, using the same permitted account. Verify a real task read, preview an edit, approve/apply it, refresh the website, then request undo.
5. Confirm separate accounts cannot read each other's tasks and competing edits produce a conflict. Local PGlite tests cover SQL and rollback; a hosted multi-connection check is still required.

Local checks: `npm run test:backend`, `node --experimental-strip-types --test tests/model.test.mjs`, `npx tsc --noEmit`, and `npm run build:vercel`. Use `npm run build:browser` for an intentionally static-only build.

Sources: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions), [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth), [ChatGPT connection testing](https://developers.openai.com/plugins/deploy/connect-chatgpt).
