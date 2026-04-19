// Phase 3 D-13 — hardcoded generated-file path allowlist.
// Pure function — no I/O, no async, no external deps.
// Single source of truth: parse.ts imports this; client never recomputes (T-3-02 mitigation).
const GENERATED_PATTERNS: Array<RegExp | string> = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'Package.resolved',
  /\.min\.[^.]+$/, // *.min.js, *.min.css, etc. (extension-only suffix)
  /\.map$/, // *.map source maps
  /^dist\//, // dist/**
  /^build\//, // build/**
  /^node_modules\//, // node_modules/**
  /^vendor\//, // vendor/**
  /^\.next\//, // .next/**
  /^\.nuxt\//, // .nuxt/**
  /^coverage\//, // coverage/**
  /^__generated__\//, // __generated__/**
  /\.pb\.go$/, // *.pb.go protobuf output
];

/**
 * Detect whether a diff path is a generated/lockfile/vendored file.
 * Called during `parse.ts:toDiffModel` for each file; result populates `DiffFile.generated`.
 * Phase 4/5 MCP tools filter on this flag by default (DIFF-04 LLM exclusion).
 */
export function isGeneratedFile(filePath: string): boolean {
  return GENERATED_PATTERNS.some((p) =>
    typeof p === 'string' ? filePath === p || filePath.endsWith('/' + p) : p.test(filePath)
  );
}
