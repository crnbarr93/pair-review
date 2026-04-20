import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { SessionManager } from '../session/manager.js';
import { registerStartReview } from './tools/start-review.js';
import { registerListFiles } from './tools/list-files.js';
import { registerGetHunk } from './tools/get-hunk.js';
import { registerSetPrSummary } from './tools/set-pr-summary.js';
import { registerRunSelfReview } from './tools/run-self-review.js';

export function registerAllTools(mcp: McpServer, manager: SessionManager): void {
  registerStartReview(mcp, manager);
  registerListFiles(mcp, manager);
  registerGetHunk(mcp, manager);
  registerSetPrSummary(mcp, manager);
  registerRunSelfReview(mcp, manager);
}

export async function startMcp(manager: SessionManager): Promise<McpServer> {
  const mcp = new McpServer(
    { name: 'git-review-plugin', version: '0.1.0' },
    { capabilities: { logging: {} } }
  );
  registerAllTools(mcp, manager);
  await mcp.connect(new StdioServerTransport());
  return mcp;
}
