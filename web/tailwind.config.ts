// Tailwind 4 reads tokens from CSS @theme {} block (see web/src/index.css).
// This file is intentionally minimal — present for IDE plugin detection only.
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
export default config;
