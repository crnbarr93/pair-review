import { describe, it, expect } from 'vitest';
import { isGeneratedFile } from '../generated-file-detection.js';

describe('isGeneratedFile — positives', () => {
  const positives: string[] = [
    'package-lock.json',
    'apps/web/package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'poetry.lock',
    'Gemfile.lock',
    'composer.lock',
    'Package.resolved',
    'foo.min.js',
    'bar.min.css',
    'x.min.anything',
    'app.map',
    'vendor/bundle.js.map',
    'dist/index.js',
    'dist/subdir/x.js',
    'build/app.js',
    'node_modules/lodash/index.js',
    'vendor/lib.js',
    '.next/static/chunks/main.js',
    '.nuxt/app.js',
    'coverage/lcov.info',
    '__generated__/schema.ts',
    'proto/v1.pb.go',
  ];
  it.each(positives)('detects %s as generated', (p) => {
    expect(isGeneratedFile(p)).toBe(true);
  });
});

describe('isGeneratedFile — negatives', () => {
  const negatives: string[] = [
    'src/app.ts',
    'pages/index.tsx',
    'README.md',
    'package.json', // the non-lock file
    'my-dist-plans/notes.md', // "dist" substring NOT at path start
    'src/coverage-report.ts', // not under coverage/
    'lib.rs',
    'Cargo.toml', // not Cargo.lock
    'src/vendor-integration.ts', // "vendor" substring NOT at path start
    'spec/foo.spec.ts',
    'testing.min.notjs.source.ts', // .min. must be followed by extension-only
  ];
  it.each(negatives)('does not detect %s as generated', (p) => {
    expect(isGeneratedFile(p)).toBe(false);
  });
});
