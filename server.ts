import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApp, createDeps } from './server/createApp';

async function main() {
  const port = Number(process.env.PORT || 3000);
  const deps = await createDeps();
  const app = createApp(deps, process.env.NODE_ENV === 'production' ? { staticDir: path.join(process.cwd(), 'dist') } : {});

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Domain Expansion server running on http://0.0.0.0:${port}`);
  });
}

main();
