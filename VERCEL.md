# GitHub → Vercel

This deployment publishes **taskbloc's browser workspace**: board, tasks, projects, calendar, local backups and demo assistant. Tasks remain in that browser's local storage. It requires no Auth0 or OpenAI credentials.

The deployment also includes protected API/MCP routes. To activate shared task storage and account sign-in, connect Postgres and configure Auth0 using [POSTGRES-SETUP.md](POSTGRES-SETUP.md). Until then, the app remains in browser mode. Live in-app AI stays paused. Never put a SQLite file in a Vercel function's temporary directory as a persistence workaround.

## Publish

1. Use the existing GitHub repository `Franz-spex/Task-Manager` and Vercel project `task-manager`.
2. Put the contents of this project folder at the repository root (the level containing `package.json` and `vercel.json`). Commit source files only. `.gitignore` excludes environment files, dependencies, build output and the private task database.
3. In Vercel, import that GitHub repository. Select its root directory and Node.js 24.x. `vercel.json` sets Vite, the build command and output directory automatically.
4. Deploy without adding environment variables. Use the assigned HTTPS address. Subsequent pushes to the connected production branch trigger a new deployment.

Settings if entering them manually:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Install command | `npm ci --include=dev --include=optional` |
| Build command | `npm run build:vercel` |
| Output directory | `dist/web` |

Local verification: `npm run build:vercel`. The existing `npm run dev` and `npm run build:host` retain shared-backend support.

## Your existing tasks

Localhost and the new Vercel address have separate browser storage. Export your tasks in the original app's Settings, then import that JSON in the hosted app's Settings. Back up shared tasks while signed in before migrating backend storage. A GitHub push never transfers private task data.

## Finish the shared connector later

The Postgres adapter is implemented. Finish [database and Auth0 activation](POSTGRES-SETUP.md), connect ChatGPT with OAuth, and verify a real task read. The temporary Cloudflare URLs from development are not permanent endpoints.

References: [Vercel Git integration](https://vercel.com/docs/git), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [SQLite limitations](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
