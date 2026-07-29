import Stripe from 'stripe';
import { markEntitlementPaid } from '../kv/entitlement';
import type { Env } from '../types';
import { createStripeClient } from './client';

export async function handleStripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const secretKey = env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !secretKey) {
    return Response.json({ error: 'Stripe webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const body = await request.text();
  const stripe = createStripeClient(secretKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const handle = session.client_reference_id;
    if (handle) {
      await markEntitlementPaid(env.ENTITLEMENTS, handle);
    }
  }

  return Response.json({ received: true });
}
