import { vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from '../../../session/manager.js';
import { registerAllTools } from '../../../mcp/server.js';
import { toDiffModel } from '../../../ingest/parse.js';
import type { Fixture } from './fixture-type.js';
import type { ReviewSession } from '@shared/types';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface DriveSessionHandle {
  prKey: string;
  getSession(): ReviewSession | undefined;
  callListFiles(args: Record<string, unknown>): Promise<ToolResult>;
  callGetHunk(args: Record<string, unknown>): Promise<ToolResult>;
  callSetPrSummary(args: Record<string, unknown>): Promise<ToolResult>;
  callRunSelfReview(args: Record<string, unknown>): Promise<ToolResult>;
}

export async function driveSession(fixture: Fixture): Promise<DriveSessionHandle> {
  const prKey = `eval:${fixture.id}`;
  const diff = toDiffModel(fixture.diffUnified);

  const session: ReviewSession = {
    prKey,
    pr: {
      source: 'github',
      title: fixture.prTitle,
      description: fixture.prBody,
      author: 'eval-author',
      baseBranch: 'main',
      headBranch: `fixture/${fixture.id}`,
      baseSha: '0000000',
      headSha: '0000001',
      additions: 0,
      deletions: 0,
      filesChanged: diff.files.length,
      number: 0,
      owner: 'eval',
      repo: fixture.id,
    },
    diff,
    shikiTokens: {},
    createdAt: new Date().toISOString(),
    headSha: '0000001',
    error: null,
    lastEventId: 0,
  };

  const manager = new SessionManager({ sessionToken: 'eval-token' });
  manager.adoptSyntheticSession(prKey, session);

  const handlers = new Map<string, ToolHandler>();
  const mcp = {
    registerTool: vi.fn((name: string, _meta: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;

  registerAllTools(mcp, manager);

  const call = (name: string) => async (args: Record<string, unknown>): Promise<ToolResult> => {
    const h = handlers.get(name);
    if (!h) throw new Error(`Tool "${name}" not registered`);
    return h(args);
  };

  return {
    prKey,
    getSession: () => manager.get(prKey),
    callListFiles: call('list_files'),
    callGetHunk: call('get_hunk'),
    callSetPrSummary: call('set_pr_summary'),
    callRunSelfReview: call('run_self_review'),
  };
}
