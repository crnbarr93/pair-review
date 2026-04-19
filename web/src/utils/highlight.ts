// Lightweight TypeScript-ish syntax highlighter ported from the design bundle.
// Returns HTML-safe markup; callers render via dangerouslySetInnerHTML.

const KW =
  /\b(import|from|export|const|let|var|function|return|if|else|try|catch|throw|new|async|await|as|interface|extends|implements|type|enum|class|public|private|protected|static|this|in|of|for|while|switch|case|break|continue|default|void)\b/g;

const TYPES =
  /\b(Request|Response|NextFunction|Promise|AuthedRequest|TokenError|Redis|Array|string|number|boolean|any|unknown|never|void|null|undefined)\b/g;

export function highlight(line: string): string {
  if (!line) return '';
  let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/(\/\/.*)$/g, '<span class="tok-com">$1</span>');
  s = s.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="tok-str">$1</span>'
  );
  s = s.replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');
  s = s.replace(KW, '<span class="tok-kw">$1</span>');
  s = s.replace(TYPES, '<span class="tok-typ">$1</span>');
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(\()/g, '<span class="tok-fn">$1</span>$2');
  return s;
}

// Light markdown: **bold** and `code`.
export function formatMd(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function cn(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}
