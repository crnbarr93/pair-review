import { createHighlighter, type Highlighter } from 'shiki';
import type { Hunk, ShikiFileTokens, ShikiHunkTokens, ShikiToken } from '@shared/types';

let hl: Highlighter | null = null;
const cache = new Map<string, ShikiFileTokens>();

async function getHighlighter(): Promise<Highlighter> {
  if (!hl) {
    hl = await createHighlighter({
      themes: ['github-light'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'json',
        'md',
        'css',
        'html',
        'bash',
        'python',
        'go',
        'rust',
        'yaml',
      ],
    });
  }
  return hl;
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  md: 'md',
  css: 'css',
  html: 'html',
  sh: 'bash',
  bash: 'bash',
  py: 'python',
  go: 'go',
  rs: 'rust',
  yaml: 'yaml',
  yml: 'yaml',
};

function detectLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

export async function highlightHunks(
  filePath: string,
  headSha: string,
  hunks: Hunk[]
): Promise<ShikiFileTokens> {
  const key = filePath + '@' + headSha;
  const cached = cache.get(key);
  if (cached) return cached;

  const h = await getHighlighter();
  const lang = detectLang(filePath);

  const tokens: ShikiFileTokens = hunks.map((hunk): ShikiHunkTokens => {
    return hunk.lines.map((line): ShikiToken[] => {
      try {
        // codeToTokensBase returns ThemedToken[][] — one inner array per line
        // Our text is one line, so we take the first row
        const rows = h.codeToTokensBase(line.text, {
          lang: lang as Parameters<typeof h.codeToTokensBase>[1]['lang'],
          theme: 'github-light',
        });
        const row = (rows?.[0] ?? []) as Array<{
          content: string;
          color?: string;
          fontStyle?: number;
        }>;
        return row.map((tok) => ({
          content: tok.content,
          color: tok.color,
          fontStyle: tok.fontStyle,
        }));
      } catch {
        // Unknown lang or highlighting error — fall back to single plaintext token
        return [{ content: line.text }];
      }
    });
  });

  cache.set(key, tokens);
  return tokens;
}

/** Test-only: clears cache and resets highlighter singleton so each test starts fresh. */
export function resetHighlighterForTests(): void {
  hl = null;
  cache.clear();
}
