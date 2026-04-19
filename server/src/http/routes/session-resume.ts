import type { Hono } from 'hono';
import { z } from 'zod';
import type { SessionManager, SourceArg } from '../../session/manager.js';
import { ingestGithub } from '../../ingest/github.js';
import { ingestLocal } from '../../ingest/local.js';
import { toDiffModel } from '../../ingest/parse.js';
import { highlightHunks } from '../../highlight/shiki.js';
import { logger } from '../../logger.js';
import type { ShikiFileTokens } from '@shared/types';

const ChooseResumeInput = z
  .object({
    prKey: z.string().min(1),
    choice: z.enum(['adopt', 'reset', 'viewBoth']),
    // `source` is needed so `adopt` can re-run ingest. Client passes it back;
    // the zod discriminated union validates the shape.
    source: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('github'),
        url: z.string().min(1).optional(),
        number: z.number().int().positive().optional(),
      }),
      z.object({
        kind: z.literal('local'),
        base: z.string().min(1),
        head: z.string().min(1),
      }),
    ]),
  })
  .strict();

export function mountSessionResume(app: Hono, manager: SessionManager) {
  app.post('/api/session/choose-resume', async (c) => {
    const parseResult = ChooseResumeInput.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parseResult.success) return c.text('Bad request', 400);
    const { prKey, choice, source } = parseResult.data;

    // Coerce source into SessionManager's SourceArg union
    let src: SourceArg;
    if (source.kind === 'github') {
      if (source.url) src = { kind: 'github', url: source.url };
      else if (typeof source.number === 'number')
        src = { kind: 'github', number: source.number };
      else return c.text('Bad request: github source needs url or number', 400);
    } else {
      src = { kind: 'local', base: source.base, head: source.head };
    }

    const existing = manager.get(prKey);
    if (!existing) return c.text('Unknown session', 404);

    try {
      switch (choice) {
        case 'adopt': {
          // Re-run ingest, then apply session.adoptNewDiff with fresh artifacts.
          let diffText: string;
          let newHeadSha: string;
          if (src.kind === 'github') {
            const id = 'url' in src ? src.url : String(src.number);
            const { meta, diffText: dt } = await ingestGithub(id);
            diffText = dt;
            newHeadSha = meta.headRefOid;
          } else {
            const res = await ingestLocal(src.base, src.head, process.cwd());
            diffText = res.diffText;
            newHeadSha = res.headSha;
          }
          const newDiff = toDiffModel(diffText);
          const newShikiTokens: Record<string, ShikiFileTokens> = {};
          for (const file of newDiff.files) {
            if (file.binary) continue;
            newShikiTokens[file.id] = await highlightHunks(
              file.path,
              newHeadSha || 'HEAD',
              file.hunks
            );
          }
          await manager.applyEvent(prKey, {
            type: 'session.adoptNewDiff',
            newDiff,
            newHeadSha,
            newShikiTokens,
          });
          return c.json({ ok: true });
        }
        case 'reset': {
          await manager.resetSession(prKey, src);
          return c.json({ ok: true });
        }
        case 'viewBoth': {
          await manager.applyEvent(prKey, { type: 'session.viewBoth' });
          return c.json({ ok: true });
        }
      }
    } catch (err) {
      logger.warn('choose-resume failed', err);
      return c.text('Resume failed', 500);
    }
  });
}
