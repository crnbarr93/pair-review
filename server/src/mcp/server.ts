import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { SessionManager } from '../session/manager.js';
import { registerStartReview } from './tools/start-review.js';
import { registerListFiles } from './tools/list-files.js';
import { registerGetHunk } from './tools/get-hunk.js';
import { registerSetPrSummary } from './tools/set-pr-summary.js';
import { registerRunSelfReview } from './tools/run-self-review.js';
import { registerSetWalkthrough } from './tools/set-walkthrough.js';
import { registerReplyInThread } from './tools/reply-in-thread.js';
import { registerDraftComment } from './tools/draft-comment.js';
import { registerResolveThread } from './tools/resolve-thread.js';
import { registerSubmitReview } from './tools/submit-review.js';
import { registerAwaitUserRequest } from './tools/await-user-request.js';
import { registerRespondChat } from './tools/respond-chat.js';
import type { RequestQueueManager } from '../session/request-queue.js';

export function registerAllTools(mcp: McpServer, manager: SessionManager, queueManager: RequestQueueManager): void {
  registerStartReview(mcp, manager);
  registerListFiles(mcp, manager);
  registerGetHunk(mcp, manager);
  registerSetPrSummary(mcp, manager);
  registerRunSelfReview(mcp, manager);
  registerSetWalkthrough(mcp, manager);
  registerReplyInThread(mcp, manager);
  registerDraftComment(mcp, manager);
  registerResolveThread(mcp, manager);
  registerSubmitReview(mcp, manager);
  registerAwaitUserRequest(mcp, manager, queueManager);
  registerRespondChat(mcp, manager);
}

export async function startMcp(manager: SessionManager, queueManager: RequestQueueManager): Promise<McpServer> {
  const mcp = new McpServer(
    { name: 'git-review-plugin', version: '0.1.0' },
    { capabilities: { logging: {} } }
  );
  registerAllTools(mcp, manager, queueManager);
  await mcp.connect(new StdioServerTransport());
  return mcp;
}
