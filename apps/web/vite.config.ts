import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000'

/** Serve user-uploaded media directly from the single central root `uploads/` folder */
function serveRootUploads(): Plugin {
  return {
    name: 'serve-root-uploads',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        const cleanUrl = req.url.split('?')[0];
        if (!cleanUrl.startsWith('/uploads/')) return next();

        const filename = cleanUrl.replace(/^\/uploads\//, '');
        const dir = import.meta.dirname ?? __dirname;
        const uploadsDir = path.resolve(dir, '../../uploads');
        const targetFile = path.join(uploadsDir, filename);

        // Security check: ensure path is within uploadsDir and exists
        if (targetFile.startsWith(uploadsDir) && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
          const ext = path.extname(targetFile).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.webp': 'image/webp',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon',
          };
          if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
          }
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return fs.createReadStream(targetFile).pipe(res);
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveRootUploads()],
  // Pre-bundled at startup, so Vite never has to re-optimize it mid-session (the "504 Outdated Optimize Dep" error).
  optimizeDeps: {
    include: ['qrcode-generator', 'jsqr'],
  },
  server: {
    // Listen on the local network too, so phones on the same Wi-Fi can open the site (e.g. table QR codes).
    host: true,
    // Same-origin requests in development, so the admin session cookie just works.
    proxy: {
      '/api': API_TARGET,
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
