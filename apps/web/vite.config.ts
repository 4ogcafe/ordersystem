import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000'

const BRAND_FILES = new Set([
  'adarsha-log.webp',
  'site-logo-01.webp',
  'logo-white-01.png.webp',
  'new-logo.webp',
  'web-logo-01-01.png.webp',
])

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
}

/** All site images (food + logos) from the single monorepo-root `uploads/` folder. */
function serveRootUploads(): Plugin {
  return {
    name: 'serve-root-uploads',
    configureServer(server) {
      const uploadsDir = path.resolve(import.meta.dirname ?? __dirname, '../../uploads');
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        const cleanUrl = req.url.split('?')[0];

        let filename = '';
        if (cleanUrl.startsWith('/uploads/')) {
          filename = path.basename(cleanUrl.slice('/uploads/'.length));
          if (!filename || filename !== cleanUrl.slice('/uploads/'.length)) return next();
        } else if (cleanUrl.startsWith('/') && !cleanUrl.slice(1).includes('/')) {
          // Legacy root brand URLs → same file in uploads/
          const candidate = cleanUrl.slice(1);
          if (!BRAND_FILES.has(candidate)) return next();
          filename = candidate;
        } else {
          return next();
        }

        const targetFile = path.join(uploadsDir, filename);
        if (!targetFile.startsWith(uploadsDir) || !fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
          return next();
        }
        const ext = path.extname(targetFile).toLowerCase();
        if (MIME[ext]) res.setHeader('Content-Type', MIME[ext]);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(targetFile).pipe(res);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), serveRootUploads()],
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
