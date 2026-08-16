import {
  acceptedContent,
  inputRequired,
  type McpServer,
  type RequestStateCodec,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  consumeEntitlement,
  createPendingEntitlement,
} from '../../kv/entitlement';
import {
  createCheckoutSession,
  createStripeClient,
  resolveEntitlementStatus,
  resolveEntitlementStatusKvOnly,
} from '../../stripe/client';
import { recordPremiumReportExecution } from '../../stripe/metering';
import type { Env } from '../../types';

export interface PaymentRequestState {
  handle: string;
  sessionId: string;
}

async function executePremiumReport(
  env: Env,
  stripe: ReturnType<typeof createStripeClient> | null,
  activeHandle: string,
  topic: string,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const consumed = await consumeEntitlement(env.ENTITLEMENTS, activeHandle);
  if (!consumed) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to consume payment handle: ${activeHandle}` }],
    };
  }

  let meterNote = '';
  if (stripe && consumed.customerId) {
    try {
      await recordPremiumReportExecution(stripe, env, consumed.customerId, activeHandle);
      meterNote = `\n- Meter event recorded for customer ${consumed.customerId}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      meterNote = `\n- Meter event failed: ${message}`;
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `Premium Report: "${topic}"\n\n📊 Analysis complete.\n- Trend: upward\n- Confidence: 94%\n- Payment handle ${activeHandle} consumed.${meterNote}`,
      },
    ],
  };
}

export function registerPremiumReportTool(
  server: McpServer,
  env: Env,
  stateCodec: RequestStateCodec<PaymentRequestState>,
): void {
  server.registerTool(
    'premium_report',
    {
      description: 'Generate a premium analytics report (paid tool)',
      inputSchema: z.object({
        topic: z.string().min(1).describe('Report topic'),
      }),
    },
    async ({ topic }, ctx) => {
      try {
        const requestState = ctx.mcpReq.requestState<PaymentRequestState>();

        // Retry path: client returned with inputResponses after payment
        if (requestState) {
          const { handle: activeHandle, sessionId } = requestState;

          // Log client payment acknowledgement; handle authority stays in signed requestState.
          acceptedContent(ctx.mcpReq.inputResponses, 'payment');

          const secretKey = env.STRIPE_SECRET_KEY;
          const stripe = secretKey ? createStripeClient(secretKey) : null;

          const status = stripe
            ? await resolveEntitlementStatus(env.ENTITLEMENTS, stripe, activeHandle)
            : await resolveEntitlementStatusKvOnly(env.ENTITLEMENTS, activeHandle);

          if (status === 'used') {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `Payment handle already used: ${activeHandle}` }],
            };
          }

          if (status === 'expired' || status === 'missing') {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: `Payment handle expired or invalid: ${activeHandle}` }],
            };
          }

          if (status === 'pending') {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Payment not yet confirmed for handle ${activeHandle}. Complete checkout at session ${sessionId} and retry.`,
                },
              ],
            };
          }

          return executePremiumReport(env, stripe, activeHandle, topic);
        }

        // First call: issue payment handle and checkout URL
        const secretKey = env.STRIPE_SECRET_KEY;
        if (!secretKey) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'Payment system not configured' }],
          };
        }

        const stripe = createStripeClient(secretKey);
        const paymentHandle = crypto.randomUUID();
        const session = await createCheckoutSession(stripe, env, paymentHandle);
        const checkoutUrl = session.url;

        if (!checkoutUrl || !session.id) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'Failed to create Stripe Checkout session' }],
          };
        }

        await createPendingEntitlement(env.ENTITLEMENTS, paymentHandle, session.id);

        const state: PaymentRequestState = { handle: paymentHandle, sessionId: session.id };

        return inputRequired({
          inputRequests: {
            payment: inputRequired.elicitUrl({
              url: checkoutUrl,
              message: `Payment required for premium report. Use payment_handle: ${paymentHandle}`,
            }),
          },
          requestState: await stateCodec.mint(state, ctx),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `premium_report failed: ${message}` }],
        };
      }
    },
  );
}
