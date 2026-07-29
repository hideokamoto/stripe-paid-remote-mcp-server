import {
  acceptedContent,
  inputRequired,
  type McpServer,
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
import type { Env } from '../../types';

interface PaymentRequestState {
  handle: string;
  sessionId: string;
}

const paymentHandleSchema = z.object({
  handle: z.string().uuid(),
});

function parseRequestState(raw: string | undefined): PaymentRequestState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaymentRequestState;
  } catch {
    return null;
  }
}

export function registerPremiumReportTool(server: McpServer, env: Env): void {
  server.registerTool(
    'premium_report',
    {
      description: 'Generate a premium analytics report (paid tool)',
      inputSchema: z.object({
        topic: z.string().min(1).describe('Report topic'),
      }),
    },
    async ({ topic }, ctx) => {
      const requestState = parseRequestState(ctx.mcpReq.requestState());

      // Retry path: client returned with inputResponses after payment
      if (requestState) {
        const { handle, sessionId } = requestState;

        const handleFromResponse = acceptedContent(
          ctx.mcpReq.inputResponses,
          'payment',
          paymentHandleSchema,
        );
        const activeHandle = handleFromResponse?.handle ?? handle;

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

        // status === 'paid' — consume and execute
        const consumed = await consumeEntitlement(env.ENTITLEMENTS, activeHandle);
        if (!consumed) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `Failed to consume payment handle: ${activeHandle}` }],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Premium Report: "${topic}"\n\n📊 Analysis complete.\n- Trend: upward\n- Confidence: 94%\n- Payment handle ${activeHandle} consumed.`,
            },
          ],
        };
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
        requestState: JSON.stringify(state),
      });
    },
  );
}
