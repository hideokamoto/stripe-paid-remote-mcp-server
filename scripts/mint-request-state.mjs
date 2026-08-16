#!/usr/bin/env node
/**
 * Mint a signed requestState for G2 retry scenarios (2026-07-28 MRTR).
 * Usage: node scripts/mint-request-state.mjs <handle> <sessionId>
 */
import { createRequestStateCodec } from '@modelcontextprotocol/server';

const [handle, sessionId] = process.argv.slice(2);
if (!handle || !sessionId) {
  console.error('Usage: node scripts/mint-request-state.mjs <handle> <sessionId>');
  process.exit(1);
}

const key =
  process.env.REQUEST_STATE_SECRET ?? 'dev-only-request-state-secret-32bytes!!';
const codec = createRequestStateCodec({
  key,
  ttlSeconds: 1_800,
  bind: () => 'tools/call',
});

const wire = await codec.mint(
  { handle, sessionId },
  { mcpReq: { method: 'tools/call' } },
);
process.stdout.write(wire);
