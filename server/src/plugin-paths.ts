import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function pluginRoot(): string {
  const fromEnv = process.env.CLAUDE_PLUGIN_ROOT;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return path.resolve(moduleDir, '..', '..');
}

export function webDistDir(): string {
  return path.join(pluginRoot(), 'web', 'dist');
}

export function webDistIndexHtml(): string {
  return path.join(webDistDir(), 'index.html');
}
