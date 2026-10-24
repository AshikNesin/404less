import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  publicDir: 'public',
  plugins: [
    // generates src/routeTree.gen.ts from src/routes/* (must run before react())
    tanstackRouter({ target: 'react', autoCodeSplitting: true, routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
    react(),
    tailwindcss(),
    // dev server: the SPA lives under /app; the marketing site (site/) is built separately
    {
      name: 'app-shell',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' ) { req.url = '/app.html'; }
          else if (req.url?.startsWith('/app') && !req.url.startsWith('/app.html')) req.url = '/app.html';
          next();
        });
        return () => server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/app.html') return next();
          const html = await server.transformIndexHtml('/app', await (await import('node:fs/promises')).readFile(new URL('./app.html', import.meta.url), 'utf8'));
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        });
      },
    },
  ],
  appType: 'custom',
  build: { outDir: '../dist/web', emptyOutDir: true, rollupOptions: { input: 'app.html' } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/auth': 'http://127.0.0.1:8787',
      '/embed.js': 'http://127.0.0.1:8787',
    },
  },
});
