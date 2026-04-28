import { secureHeaders, NONCE } from 'hono/secure-headers';
import type { MiddlewareHandler } from 'hono';

export function secureHeadersMw(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", NONCE],
      styleSrc: ["'self'", "'unsafe-inline'"],   // Tailwind 4 runtime custom props (UI-SPEC)
      imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
      connectSrc: ["'self'"],                      // D-01: WebSocket removed from Phase 1
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  });
}
