import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { configuration, createApp } from './app.mjs';
import { runtimeStore } from './runtime-store.mjs';
if (existsSync('.env.local')) loadEnvFile('.env.local');
const config = configuration();
const { app, store } = createApp(config, { store: await runtimeStore() });
const server = app.listen(Number(process.env.TASKLINE_API_PORT || 8788), process.env.TASKLINE_BIND || '127.0.0.1', () => {
  console.log(`Taskline backend ready on port ${process.env.TASKLINE_API_PORT || 8788}. Authentication: ${config.authReady ? 'configured' : 'needs setup'}. AI key: ${config.key ? 'present' : 'not configured'}.`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { await store?.close(); process.exit(0); }));
