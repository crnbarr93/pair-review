import { readFileSync, existsSync } from 'node:fs';
import { webDistIndexHtml } from '../plugin-paths.js';

const FALLBACK = `<!doctype html><html><head><meta charset="UTF-8"><title>Git Review</title></head>
<body><div id="root"></div>
<script nonce="__NONCE__">document.getElementById('root').textContent='Run \`pnpm --filter web build\` to produce web/dist/index.html';</script>
</body></html>`;

export function renderIndex(nonce: string): string {
  const distIndex = webDistIndexHtml();
  const template = existsSync(distIndex) ? readFileSync(distIndex, 'utf8') : FALLBACK;
  return template.replaceAll('__NONCE__', nonce);
}
