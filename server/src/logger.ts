const prefix = (level: string) => `[${new Date().toISOString()}] [${level}] `;

export const logger = {
  info: (msg: string, ...rest: unknown[]) =>
    process.stderr.write(prefix('info') + msg + (rest.length ? ' ' + JSON.stringify(rest) : '') + '\n'),
  warn: (msg: string, ...rest: unknown[]) =>
    process.stderr.write(prefix('warn') + msg + (rest.length ? ' ' + JSON.stringify(rest) : '') + '\n'),
  error: (msg: string, err?: unknown) =>
    process.stderr.write(
      prefix('error') + msg + (err ? ' ' + (err instanceof Error ? err.stack : JSON.stringify(err)) : '') + '\n'
    ),
};
