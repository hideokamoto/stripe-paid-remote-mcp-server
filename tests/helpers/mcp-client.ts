import type { McpHttpHandler } from '@modelcontextprotocol/server';

export const MCP_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
} as const;

export async function mcpPost(
  handler: McpHttpHandler,
  options: {
    rpcMethod: string;
    mcpName: string;
    params: Record<string, unknown>;
    id?: number;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await handler.fetch(
    new Request('http://test.local/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': options.rpcMethod,
        'Mcp-Name': options.mcpName,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: options.id ?? 1,
        method: options.rpcMethod,
        params: options.params,
      }),
    }),
  );

  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
