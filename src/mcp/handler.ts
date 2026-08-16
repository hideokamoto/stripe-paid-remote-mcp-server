import {
  createMcpHandler,
  createRequestStateCodec,
  McpServer,
  type RequestStateCodec,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { registerPremiumReportTool, type PaymentRequestState } from './tools/premium-report';
import type { Env } from '../types';

const TOOLS_LIST_TTL_MS = 86_400_000;
const PROTOCOL_VERSION = '2026-07-28';

function requireRequestStateSecret(env: Env): string {
  const key = env.REQUEST_STATE_SECRET;
  if (!key || key.length < 32) {
    throw new Error(
      'REQUEST_STATE_SECRET must be set and at least 32 characters (spec 2026-07-28 requestState integrity)',
    );
  }
  return key;
}

function createPaymentStateCodec(env: Env): RequestStateCodec<PaymentRequestState> {
  return createRequestStateCodec<PaymentRequestState>({
    key: requireRequestStateSecret(env),
    ttlSeconds: 1_800,
    bind: (ctx) => ctx.mcpReq.method ?? '',
  });
}

function buildServer(env: Env): McpServer {
  const stateCodec = createPaymentStateCodec(env);

  const server = new McpServer(
    { name: 'stripe-paid-mcp', version: '0.1.0' },
    {
      capabilities: { tools: { listChanged: true } },
      cacheHints: {
        'tools/list': { ttlMs: TOOLS_LIST_TTL_MS, cacheScope: 'public' },
      },
      requestState: { verify: stateCodec.verify },
    },
  );

  server.registerTool(
    'roll_dice',
    {
      description: 'Roll an N-sided die (default 6)',
      inputSchema: z.object({
        sides: z.number().int().min(2).max(100).optional(),
      }),
    },
    async ({ sides = 6 }) => {
      const value = Math.floor(Math.random() * sides) + 1;
      return {
        content: [{ type: 'text' as const, text: `Rolled ${value} on a ${sides}-sided die` }],
      };
    },
  );

  registerPremiumReportTool(server, env, stateCodec);

  return server;
}

let cachedHandler: ReturnType<typeof createMcpHandler> | null = null;
let cachedEnv: Env | null = null;

export function getMcpHandler(env: Env) {
  if (!cachedHandler || cachedEnv !== env) {
    cachedEnv = env;
    cachedHandler = createMcpHandler(() => buildServer(env), {
      responseMode: 'json',
      legacy: 'reject',
    });
  }
  return cachedHandler;
}

export { TOOLS_LIST_TTL_MS, PROTOCOL_VERSION, createPaymentStateCodec };
