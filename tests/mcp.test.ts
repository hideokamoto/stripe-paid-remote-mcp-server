import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPaymentStateCodec, getMcpHandler } from '../src/mcp/handler.ts';
import { validateMcpEnv } from '../src/mcp/request-state.ts';
import type { Env } from '../src/types.ts';
import app from '../src/index.ts';
import { createMockKV } from './helpers/mock-kv.ts';
import { MCP_META, mcpPost } from './helpers/mcp-client.ts';

const TEST_SECRET = 'dev-only-request-state-secret-32bytes!!';

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENTITLEMENTS: createMockKV(),
    REQUEST_STATE_SECRET: TEST_SECRET,
    ...overrides,
  };
}

describe('validateMcpEnv (C3)', () => {
  test('returns null when REQUEST_STATE_SECRET is valid', () => {
    assert.equal(validateMcpEnv(testEnv()), null);
  });

  test('returns actionable reason when REQUEST_STATE_SECRET is missing', () => {
    const reason = validateMcpEnv(testEnv({ REQUEST_STATE_SECRET: undefined }));
    assert.ok(reason);
    assert.match(reason!, /REQUEST_STATE_SECRET/);
  });

  test('returns actionable reason when REQUEST_STATE_SECRET is too short', () => {
    const reason = validateMcpEnv(testEnv({ REQUEST_STATE_SECRET: 'short' }));
    assert.ok(reason);
    assert.match(reason!, /32/);
  });
});

describe('HTTP readiness (C3)', () => {
  test('/health exposes mcp.ready=false when secret is missing', async () => {
    const res = await app.fetch(new Request('http://test/health'), testEnv({
      REQUEST_STATE_SECRET: undefined,
    }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; mcp: { ready: boolean; reason?: string } };
    assert.equal(body.ok, true);
    assert.equal(body.mcp.ready, false);
    assert.match(body.mcp.reason ?? '', /REQUEST_STATE_SECRET/);
  });

  test('/mcp returns 503 with clear configuration error when secret is missing', async () => {
    const res = await app.fetch(
      new Request('http://test/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      testEnv({ REQUEST_STATE_SECRET: undefined }),
    );
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, 'MCP_NOT_CONFIGURED');
    assert.match(body.error, /REQUEST_STATE_SECRET/);
  });
});

describe('requestState bind (C2)', () => {
  test('rejects requestState minted for premium_report when replayed on roll_dice', async () => {
    const env = testEnv();
    const codec = createPaymentStateCodec(env);
    const requestState = await codec.mint(
      { handle: '11111111-1111-4111-8111-111111111111', sessionId: 'cs_test' },
      {
        mcpReq: {
          method: 'tools/call',
          params: { name: 'premium_report' },
        },
      },
    );

    const handler = getMcpHandler(env);
    const { body } = await mcpPost(handler, {
      rpcMethod: 'tools/call',
      mcpName: 'roll_dice',
      params: {
        name: 'roll_dice',
        arguments: {},
        requestState,
        _meta: MCP_META,
      },
    });

    const error = body.error as { code?: number } | undefined;
    assert.equal(error?.code, -32602);
  });
});

describe('payment decline (C1)', () => {
  test('returns isError when client declines payment on retry', async () => {
    const handle = '11111111-1111-4111-8111-111111111111';
    const env = testEnv();
    const kv = env.ENTITLEMENTS;
    await kv.put(
      `entitlement:${handle}`,
      JSON.stringify({
        status: 'paid',
        sessionId: 'cs_test_paid',
        createdAt: Date.now(),
      }),
    );

    const codec = createPaymentStateCodec(env);
    const requestState = await codec.mint(
      { handle, sessionId: 'cs_test_paid' },
      {
        mcpReq: {
          method: 'tools/call',
          params: { name: 'premium_report' },
        },
      },
    );

    const handler = getMcpHandler(env);
    const { body } = await mcpPost(handler, {
      rpcMethod: 'tools/call',
      mcpName: 'premium_report',
      params: {
        name: 'premium_report',
        arguments: { topic: 'Q3 Revenue' },
        inputResponses: {
          payment: { action: 'decline' },
        },
        requestState,
        _meta: {
          ...MCP_META,
          'io.modelcontextprotocol/clientCapabilities': { elicitation: { url: {} } },
        },
      },
      id: 42,
    });

    const result = body.result as { isError?: boolean; content?: Array<{ text: string }> } | undefined;
    const error = body.error as { code?: number; message?: string } | undefined;
    assert.ok(result ?? error, `unexpected body: ${JSON.stringify(body)}`);
    assert.equal(result?.isError, true);
    assert.match(result?.content?.[0]?.text ?? '', /declined/i);
  });
});
