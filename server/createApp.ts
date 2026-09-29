import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createLiveMail, createGeminiPort, createMemoryDirectory, createAdminDirectory, scrubLog } from './adapters.js';
import { loadConfig, type Config } from './config.js';
import { handleApi, prepareDeps, type AppDeps } from './http.js';
import { MemoryStore, createFirestoreStore } from './store.js';

export async function createDeps(overrides: Partial<AppDeps> & { config?: Config } = {}): Promise<AppDeps> {
  const config = overrides.config ?? loadConfig();
  const store = overrides.store ?? (config.dataStore === 'firestore' ? await createFirestoreStore() : new MemoryStore());
  const deps: AppDeps = {
    store,
    config,
    mail: overrides.mail ?? createLiveMail(config),
    ai: overrides.ai ?? createGeminiPort(),
    directory: overrides.directory ?? (config.dataStore === 'firestore' ? createAdminDirectory() : createMemoryDirectory()),
    now: overrides.now ?? (() => new Date()),
    log: overrides.log ?? ((level, message, fields) => {
      if (level === 'error') console.error(message, scrubLog(fields ?? {}));
    }),
  };
  await prepareDeps(deps);
  return deps;
}

export function createApp(deps: AppDeps, options: { staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    await handleApi(req, res, deps, (work) => { void work; });
  });
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(options.staticDir!, 'index.html'));
    });
  }
  return app;
}

export function staticDirExists(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'index.html'));
}
