#!/usr/bin/env node
/**
 * Mint a signed requestState for G2 retry scenarios (2026-07-28 MRTR).
 * Usage: node scripts/mint-request-state.mjs <handle> <sessionId>
 */
import { createRequestStateCodec } from '@modelcontextprotocol/server';

const TOOL_NAME = 'premium_report';

const [handle, sessionId] = process.argv.slice(2);
if (!handle || !sessionId) {
  console.error('Usage: node scripts/mint-request-state.mjs <handle> <sessionId>');
  process.exit(1);
}

const key = process.env.REQUEST_STATE_SECRET;
if (!key || key.length < 32) {
  console.error('REQUEST_STATE_SECRET must be set and at least 32 characters');
  process.exit(1);
}

function requestStateBindTag(ctx) {
  const params = ctx.mcpReq.params;
  const headerName = ctx.http?.req?.headers?.get?.('Mcp-Name') ?? '';
  const toolName =
    params && typeof params === 'object' && 'name' in params ? params.name : headerName;
  return `${ctx.mcpReq.method}\0${toolName ?? ''}`;
}

const codec = createRequestStateCodec({
  key,
  ttlSeconds: 1_800,
  bind: requestStateBindTag,
});

const wire = await codec.mint(
  { handle, sessionId },
  {
    mcpReq: {
      method: 'tools/call',
      params: { name: TOOL_NAME },
    },
  },
);
process.stdout.write(wire);
