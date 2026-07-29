import Stripe from 'stripe';
import { markEntitlementPaid } from '../kv/entitlement';
import type { Env } from '../types';
import { createStripeClient, extractCustomerId } from './client';

async function handleCheckoutSessionPaid(
  session: Stripe.Checkout.Session,
  env: Env,
): Promise<void> {
  if (session.payment_status !== 'paid') {
    return;
  }

  const handle = session.client_reference_id;
  const customerId = extractCustomerId(session.customer);
  if (handle) {
    await markEntitlementPaid(env.ENTITLEMENTS, handle, customerId);
  }
}

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

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutSessionPaid(event.data.object as Stripe.Checkout.Session, env);
      break;
    default:
      break;
  }

  return Response.json({ received: true });
}
