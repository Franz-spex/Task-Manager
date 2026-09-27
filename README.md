# taskbloc

A working React task manager with self-hosted **Inter**, a responsive board and list, task drawers, filters, calendar, editable AI proposals, and Undo. The interface uses the approved taskbloc logo; see [BRANDING.md](BRANDING.md).

## Open in VS Code

Extract `Taskbloc-VSCode.zip`, open its `taskbloc` folder in VS Code, and run:

```sh
npm run install:ci
npm run dev
```

Requires Node.js 22.13 or newer. Open **http://localhost:5173** and keep the terminal running. `npm run dev` starts the UI and backend together; `npm run dev:ui` and `npm run backend` run them separately. On Kent's computer, `Start-Taskline.ps1` also supports the bundled Codex Node runtime.

## GitHub and Vercel

The Vercel build runs the browser workspace and demo assistant, with live AI paused. See [VERCEL.md](VERCEL.md). It does not deploy the shared SQLite backend or MCP endpoint.

## Permanent hosting

Run `npm run build:host` and `npm run start:host` to serve the interface, protected API and MCP endpoint from one Node service. See [HOSTING.md](HOSTING.md) for the prepared Render configuration and persistent disk setup. Hosting has not been purchased or deployed.

## Connections

| Capability | Implementation and activation |
|---|---|
| Browser task manager | Working immediately; existing browser data is preserved |
| Demo assistant | Working local rules, explicitly labeled; no API calls |
| Live in-app assistant | Responses API endpoint implemented; paused by default; requires `TASKLINE_AI_ENABLED=true`, funded API access and sign-in configuration |
| External ChatGPT MCP | Five working tools with Streamable HTTP; needs OAuth configuration and reachable HTTPS deployment |
| Shared tasks | Persistent SQLite, account isolation, permission checks, conflict detection, retry protection, and Undo |
| Public hosting | Not deployed by this delivery |

Open **Settings → Integrations** for actual connection status. Follow **[CONNECTOR-SETUP.md](CONNECTOR-SETUP.md)** to activate both integrations. No API keys, OAuth credentials, or private task databases are bundled.

The web app signs in with Auth0 using PKCE. The backend verifies JWT signature, issuer, audience, expiry, scopes, and permitted membership. It derives each personal workspace from the authenticated subject; it never uses a request's workspace ID to select another user's data. Sign in to Taskline and ChatGPT with the same account.

Shared boards start empty. Use **Import browser tasks** to copy existing browser tasks into your account without deleting the local copy. Use **Refresh board** to retrieve changes from ChatGPT. A revision conflict keeps task input available for review and retry. Full reloads require reconnecting because tokens stay in memory.

Live AI sends the prompt and shared task context to OpenAI. It produces a validated proposal, which you review, edit, and selectively apply. The server uses `store:false`; task persistence belongs to Taskline. No changes are automatically applied. API errors preserve the prompt. The model is configurable through `OPENAI_MODEL` and defaults to `gpt-4o-mini`.

The external connector implements `list_tasks`, `get_task`, `preview_changes`, `apply_changes`, and `undo_changes`. ChatGPT does not need your OpenAI API key for those tools. Previews expire after 30 minutes. Applying a preview repeatedly is safe; stale previews and undo operations cannot overwrite newer work.

## Daily workflow

1. Create a task from **New Task** or any board column.
2. Open its drawer to edit details, checklist, priority, dates, tags, or project.
3. Drag a task or use its status menu. Completed tasks remain accessible through the **Completed** filter and List view.
4. Use Search, Today, Upcoming, Overdue, project/status/priority filters, and Reset.
5. Open **Organize with AI**, review a proposal, apply selected tasks, or Undo the result.

Mobile starts in List view. Board view provides a column selector; navigation collapses into a menu. Weather is explicitly unconnected, and the header reports local or shared storage accurately.

## Verify

```sh
npm run build
npx tsc --noEmit
npm run test:backend
node --experimental-strip-types --test tests/model.test.mjs
```

Backend tests exercise actual MCP client/HTTP transport, authorization rejection, account isolation, scopes, revision conflicts, retries, preview/apply/undo, validated AI output, and API errors. OpenAI responses are mocked; these tests do not establish live API quota or a connected ChatGPT account. Earlier browser checks covered shared import/save/AI/undo, error recovery and desktop/mobile workflows. Sign-in now uses an OAuth redirect; the final real-account redirect flow still needs verification. The hosted build passes TypeScript and serves its interface while rejecting anonymous task access and requests for private project files.

## Project map

- `app/page.tsx`: board, views, local/shared storage selection and actions
- `components/taskline-ai.tsx`: editable AI conversation and proposal review
- `components/taskline-integrations.tsx`: connection status and setup controls
- `lib/connection.ts`: browser OAuth client and authenticated requests
- `server/app.mjs`: protected HTTP API, discovery metadata and MCP transport
- `server/store.mjs`: durable account-scoped task storage and transactions
- `server/mcp.mjs`: external task tools
- `server/planner.mjs`: OpenAI Responses request and proposal validation
- `app/reference.css`: reference styling and Inter font

Keep `.env.local` and `.taskline/` private. Back up shared data from the backend's persistent disk, and use Settings → Export backup for a workspace JSON export. This release provides separate personal workspaces per account, not multi-member collaboration or automatic background synchronization.
