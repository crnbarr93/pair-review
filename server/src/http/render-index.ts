import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIST_INDEX = path.resolve(process.cwd(), 'web', 'dist', 'index.html');
const FALLBACK = `<!doctype html><html><head><meta charset="UTF-8"><title>Git Review</title></head>
<body><div id="root"></div>
<script nonce="__NONCE__">document.getElementById('root').textContent='Run \`pnpm --filter web build\` to produce web/dist/index.html';</script>
</body></html>`;

let template: string | null = null;
export function renderIndex(nonce: string): string {
  if (template == null) {
    template = existsSync(DIST_INDEX) ? readFileSync(DIST_INDEX, 'utf8') : FALLBACK;
  }
  return template.replaceAll('__NONCE__', nonce);
}
