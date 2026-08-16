import { createRequestStateCodec, type RequestStateCodec } from '@modelcontextprotocol/server';
import type { PaymentRequestState } from './tools/premium-report';
import type { Env } from '../types';

export const REQUEST_STATE_TTL_SECONDS = 1_800;
export const DEV_REQUEST_STATE_SECRET = 'dev-only-request-state-secret-32bytes!!';

/** Bind tag for MRTR requestState — must stay in sync with scripts/mint-request-state.mjs */
export function requestStateBindTag(ctx: {
  mcpReq: { method: string; params?: unknown };
  http?: { req?: Request };
}): string {
  const params = ctx.mcpReq.params as { name?: string } | undefined;
  const headerName = ctx.http?.req?.headers.get('Mcp-Name') ?? '';
  const toolName = params?.name ?? headerName;
  return `${ctx.mcpReq.method}\0${toolName}`;
}

export function validateMcpEnv(env: Env): string | null {
  const key = env.REQUEST_STATE_SECRET;
  if (!key) {
    return 'REQUEST_STATE_SECRET is not configured';
  }
  if (key.length < 32) {
    return 'REQUEST_STATE_SECRET must be at least 32 characters';
  }
  return null;
}

export function requireRequestStateSecret(env: Env): string {
  const reason = validateMcpEnv(env);
  if (reason) {
    throw new Error(reason);
  }
  return env.REQUEST_STATE_SECRET!;
}

export function createPaymentStateCodec(env: Env): RequestStateCodec<PaymentRequestState> {
  return createRequestStateCodec<PaymentRequestState>({
    key: requireRequestStateSecret(env),
    ttlSeconds: REQUEST_STATE_TTL_SECONDS,
    bind: requestStateBindTag,
  });
}
