import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup as mimeTypeOf } from 'mime-types';
import type { Plugin } from 'vite';

// getPostFiles returns absolute paths; some consumers need the path relative
// to the posts dir (prerender URLs, emitted asset names).
const rel = (postsDir: string, p: string) => p.slice(postsDir.length + 1);

/**
 * Vite plugin that makes non-markdown post assets (images, etc.) available.
 * In dev it serves them from the posts/ dir via a middleware (so they load
 * under their posts-relative URLs); in the build it emits them as static
 * assets so they're deployable alongside the prerendered pages.
 */
export function postAssetsPlugin(postsDir: string, postFiles: string[]): Plugin {
  return {
    name: 'post-assets-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        // Only handle paths that don't belong to Vite/app code. App code
        // lives under /src, /@fs, /@id, /node_modules and known routes.
        if (!url.startsWith('/') || url.startsWith('/@') || url.startsWith('/src/') || url.startsWith('/node_modules/')) {
          return next();
        }
        const relPath = decodeURIComponent(url.replace(/^\//, ''));
        if (!relPath || relPath.includes('..')) return next();
        try {
          const data = readFileSync(join(postsDir, relPath));
          res.setHeader('Content-Type', mimeTypeOf(relPath) || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      // Only the client build produces deployable static assets.
      if (this.environment.name !== 'client') return;
      for (const absPath of postFiles.filter((f) => !f.endsWith('.md'))) {
        this.emitFile({
          type: 'asset',
          fileName: rel(postsDir, absPath),
          source: readFileSync(absPath),
        });
      }
    },
  };
}
