import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import type { SessionManager } from '../../session/manager.js';
import { renderIndex } from '../render-index.js';
import { webDistDir } from '../../plugin-paths.js';

export function mountStatic(app: Hono, _manager: SessionManager) {
  // serveStatic resolves `root` against process.cwd(), but the plugin is
  // launched from the user's workspace — not the plugin install dir. Resolve
  // web/dist against CLAUDE_PLUGIN_ROOT (with an import.meta.url fallback for
  // dev/test) and convert to a cwd-relative path so serveStatic can traverse
  // out of the user's workspace.  T-07 stays defended: only the web/dist tree
  // is exposed regardless of what process.cwd() points to.
  const dist = webDistDir();
  const cwdRelative = path.relative(process.cwd(), dist);
  app.use('/assets/*', serveStatic({
    root: cwdRelative === '' ? '.' : cwdRelative,
    mimes: {
      css: 'text/css',
      js: 'application/javascript',
      map: 'application/json',
    },
  }));

  // GET / — bootstrap HTML with nonce substitution
  app.get('/', (c) => {
    const nonce = c.get('secureHeadersNonce') ?? '';
    return c.html(renderIndex(nonce));
  });
}
