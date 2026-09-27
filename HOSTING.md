# Permanent hosting preparation

The hosted build now serves the same Taskline interface, authenticated API, MCP endpoint and persistent SQLite store from one Node service. It does not need the local Vite server or temporary tunnel.

```sh
npm run install:ci
npm run build:host
npm run start:host
```

Set `PORT` for the service's listening port. Without it the default is 8788. The production server serves only `dist/web`, never project files, env files or the task database.

## Proposed Render deployment

`render.yaml` prepares one `0.5c-512mb` web service and a 1 GB persistent disk. This is a paid configuration; it has not been deployed or purchased. Review the current service, disk and usage charges in the Render dashboard before approving deployment. See [compute plans](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), and [persistent disk guidance](https://render.com/docs/disks).

Use a private Git repository with the contents of this folder at its root. Connect it to a Render Blueprint, review the plan, and supply the environment variables requested by the Blueprint. Do not commit `.env.local` or `.taskline/`. One service instance must own the disk; do not add replicas using independent SQLite files.

For the assigned permanent HTTPS URL:

1. Set both `TASKLINE_PUBLIC_URL` and `TASKLINE_WEB_ORIGIN` to that origin.
2. Register a new Auth0 API identifier matching the permanent origin plus `/mcp`. The current test API identifier is tied to the temporary Cloudflare URL and cannot be edited.
3. Add the permanent frontend URL to the Taskline Auth0 application's callback, logout and web-origin lists.
4. Grant its Taskline API scopes and configure the ChatGPT OAuth client using ChatGPT's exact callback URI.
5. Set the issuer, public web client ID and the actual signed-in owner's Auth0 subject. `__pending_owner_sign_in__` is a setup placeholder, not an authorized account.
6. Add the securely provisioned server-side API key for live in-app AI. An API key is not required for external task tools.

After deployment, test `/healthz`, sign-in, browser task import, task saving across service restarts, external MCP preview/apply/undo, and a live AI proposal. A successful build alone does not verify those external account connections.

Back up the persistent disk and keep workspace JSON exports. The current UI refreshes the shared board on request; automatic background synchronization is not included.
