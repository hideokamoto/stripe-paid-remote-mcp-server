import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createPaymentStateCodec } from './request-state';
import { registerPremiumReportTool } from './tools/premium-report';
import type { Env } from '../types';

const TOOLS_LIST_TTL_MS = 86_400_000;

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

export { TOOLS_LIST_TTL_MS, createPaymentStateCodec };
