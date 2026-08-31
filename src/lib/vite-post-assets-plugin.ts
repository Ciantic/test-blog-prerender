import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup as mimeTypeOf } from 'mime-types';
import type { Plugin } from 'vite';

/**
 * Vite plugin that makes post assets (images, etc.) available. In dev it
 * serves exactly the assets passed in (posts-relative paths resolved from
 * each post's markdown refs by the caller) via a middleware, so they load
 * under their posts-relative URLs; in the build it emits the same set as
 * static files. Unreferenced files in posts/ are never served or bundled.
 */
export function postAssetsPlugin(postsDir: string, assetPaths: string[]): Plugin {
  const assetSet = new Set(assetPaths);
  return {
    name: 'post-assets-server',

    hotUpdate({ file, server }) {
      if (this.environment.name !== 'client') return;
      if (!file.startsWith(postsDir)) return;
      console.log("[post-assets-server] file changed:", file);
      server.environments.client.hot.send({ type: 'full-reload' });
      return [];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        // Only handle paths that don't belong to Vite/app code. App code
        // lives under /src, /@fs, /@id, /node_modules and known routes.
        if (!url.startsWith('/') || url.startsWith('/@') || url.startsWith('/src/') || url.startsWith('/node_modules/')) {
          return next();
        }
        const relPath = decodeURIComponent(url.replace(/^\//, ''));
        // Serve only referenced assets — the same allow-list the build emits.
        if (!assetSet.has(relPath)) return next();
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
      for (const fileName of assetPaths) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(join(postsDir, fileName)),
        });
      }
    },
  };
}
