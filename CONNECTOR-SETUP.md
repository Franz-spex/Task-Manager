# Activate Taskline connections

The code is implemented. A live connection still needs your OAuth tenant, public HTTPS backend, permitted user, and (for in-app AI only) an OpenAI API key. No accounts, keys, or public deployments are included in this archive.

## 1. Start locally

Use Node.js 22.13 or newer. Run `npm run install:ci`, then `npm run dev`. This starts the UI at http://localhost:5173 and backend at http://127.0.0.1:8788. The backend refuses private data requests until authentication is configured. Browser tasks and the local demo continue working.

## 2. Configure authentication

This implementation uses Auth0 for browser sign-in and MCP authorization, with RS256 JWT access tokens. Follow the [official OpenAI MCP authentication guide](https://developers.openai.com/plugins/build/auth), including its linked Auth0 setup instructions. Use an existing tenant or create one in your own account.

Set up these project-specific values:

| Setting | Value for Taskline |
|---|---|
| API identifier / token audience | Your exact `https://YOUR-BACKEND-DOMAIN/mcp` URL |
| API permissions | `tasks:read`, `tasks:write`, `ai:plan` |
| Browser application | Single Page Application, authorization code with PKCE |
| Browser callback, logout URL and web origin | `http://localhost:5173` for local development; your frontend origin for deployment |
| Browser token scopes | All three Taskline permissions |
| ChatGPT token scopes | `tasks:read` and `tasks:write` |
| Workspace membership | Your Auth0 user ID (`sub`), copied into `TASKLINE_ALLOWED_SUBJECTS` |

Configure Auth0's MCP client registration and per-application grants using the provider guide. Import the exact ChatGPT client metadata URL shown by ChatGPT when using CIMD; otherwise configure the supported OAuth client registration method. The authorization server must advertise S256 PKCE, honor the MCP resource parameter, and issue tokens for the exact API audience above. Configure the exact callback URL shown by ChatGPT. Do not add broad redirect wildcards.

Create `.env.local` from `server-config.example`. Replace the example issuer, web client ID, HTTPS backend origin, frontend origin, and allowed user ID. These are public configuration identifiers; no browser client secret is needed. Keep the file ignored by Git. Restart Taskline after changing server configuration.

Each allowed subject gets its own personal workspace. Sign in with the **same account** in Taskline and ChatGPT. This version does not share tasks between different user accounts.

## 3. Host the backend

Run `npm run backend` as a long-running Node service with a persistent disk and HTTPS reverse proxy. Set `TASKLINE_DATABASE` to a path on that disk. SQLite files contain private task data: keep the disk private and back it up. Run one backend instance; do not deploy its SQLite file to an ephemeral or independently replicated filesystem.

Forward `/mcp`, `/.well-known/oauth-protected-resource`, and `/api/taskline/*` to backend port 8788. For a separately hosted frontend, configure its reverse proxy so `/api/taskline/*` reaches that same backend. The Vite development proxy is already configured. Preserve `Authorization` and MCP protocol headers. `TASKLINE_WEB_ORIGIN` must match the frontend origin. Keep `TASKLINE_BIND=127.0.0.1` behind a same-host proxy; containers may need `0.0.0.0` on a private network.

The endpoint should use the URL configured in `TASKLINE_PUBLIC_URL`; the actual MCP endpoint ends in `/mcp`. No fake deployment URL is supplied. See [OpenAI's MCP deployment guidance](https://developers.openai.com/plugins/build/mcp-server).

## 4. Connect your board

Open Settings → Integrations → Check connection → Sign in & connect. The shared board starts empty. Choose **Import browser tasks** to copy your existing tasks into it; the browser backup is retained. Existing shared IDs are preserved. Import is undoable.

Use **Refresh board** to retrieve edits made from ChatGPT. Saves include a revision so concurrent edits cannot silently overwrite each other. On a conflict, refresh, review your still-open task input, then save again. A refresh clears the old Undo snapshot. Signing out returns to browser mode after the page reloads. Browser authentication tokens stay in memory, so reconnect after a full reload.

## 5. Add the MCP connection

In ChatGPT developer mode, add your HTTPS `/mcp` URL and choose OAuth. Complete the provider sign-in with the same permitted account. Availability depends on your ChatGPT workspace settings. Taskline's “Shared backend connected” label refers to the web app's backend connection; it does not claim that ChatGPT has been linked.

Try: “List my Taskline tasks,” then “Preview moving this task to In Progress.” Review the preview and approve before applying. Ask to undo the change. The tools are `list_tasks`, `get_task`, `preview_changes`, `apply_changes`, and `undo_changes`. Previews expire in 30 minutes, and undo refuses to overwrite later edits.

## 6. Enable the in-app assistant

Complete the secure OpenAI API-key setup and save `OPENAI_API_KEY` only to the confirmed server-side env file. A ChatGPT subscription does not supply an API key. Taskline reads the key on the server and uses the Responses API with validated Structured Outputs and `store:false`. `OPENAI_MODEL` defaults to `gpt-4o-mini` and can be changed to an accessible model supporting Structured Outputs.

After restarting and signing in, the card shows **Live AI ready**. Ask for a plan, edit or deselect proposed tasks, then apply. Undo is available afterward. The prompt and shared task context are sent to OpenAI; browser-only tasks are not sent. API errors preserve the prompt and leave the board unchanged. No key is required for external MCP task tools themselves.

## Verification

Run `npm run test:backend` for authenticated HTTP and actual MCP client/transport tests. The AI test uses a mocked OpenAI response, not a paid API call. A successful mock test does not verify your provider, API quota, deployment, or ChatGPT connection; complete the live steps above to verify those.
