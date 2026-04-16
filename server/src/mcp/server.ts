import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { SessionManager } from '../session/manager.js';
import { registerStartReview } from './tools/start-review.js';

export async function startMcp(manager: SessionManager): Promise<McpServer> {
  const mcp = new McpServer(
    { name: 'git-review-plugin', version: '0.1.0' },
    { capabilities: { logging: {} } }
  );
  registerStartReview(mcp, manager);
  await mcp.connect(new StdioServerTransport());
  return mcp;
}
