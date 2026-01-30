import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import http from 'node:http'

// Proxy /@* requests to API only for ActivityPub requests (Accept header) or POST (inbox)
function actorProxyPlugin(): Plugin {
  return {
    name: 'actor-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/@')) {
          const accept = req.headers['accept'] || '';
          const isAP = accept.includes('application/activity+json') || accept.includes('application/ld+json');
          const isPost = req.method === 'POST';
          if (isAP || isPost) {
            const proxyReq = http.request({
              hostname: 'localhost',
              port: 8000,
              path: req.url,
              method: req.method,
              headers: {
                ...req.headers,
                'x-forwarded-proto': 'https',
              },
            }, (proxyRes) => {
              res.writeHead(proxyRes.statusCode!, proxyRes.headers);
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (err) => {
              console.error('[actor-proxy] Error:', err.message);
              res.writeHead(502);
              res.end('Bad Gateway');
            });
            req.pipe(proxyReq);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), actorProxyPlugin()],
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/.well-known': {
        target: 'http://localhost:8000',
        headers: { 'X-Forwarded-Proto': 'https' },
      },
      '/users': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/nodeinfo': {
        target: 'http://localhost:8000',
        headers: { 'X-Forwarded-Proto': 'https' },
      },
      '/inbox': {
        target: 'http://localhost:8000',
        headers: { 'X-Forwarded-Proto': 'https' },
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('bootstrap')) return 'vendor-bootstrap';
          }
        },
      },
    },
  },
})
