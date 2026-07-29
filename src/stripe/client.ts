import Stripe from 'stripe';
import { getEntitlement, markEntitlementPaid } from '../kv/entitlement';
import type { Env } from '../types';

export const DEFAULT_METER_EVENT_NAME = 'premium_report_executed';

export async function resolveEntitlementStatusKvOnly(
  kv: KVNamespace,
  handle: string,
): Promise<'paid' | 'pending' | 'used' | 'expired' | 'missing'> {
  const record = await getEntitlement(kv, handle);
  if (!record) return 'missing';
  if (record.status === 'used') return 'used';
  if (record.status === 'expired') return 'expired';
  if (record.status === 'paid') return 'paid';
  if (record.status === 'pending') return 'pending';
  return 'missing';
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | undefined {
  if (!customer) return undefined;
  if (typeof customer === 'string') return customer;
  if ('deleted' in customer && customer.deleted) return undefined;
  return customer.id;
}

export async function createCheckoutSession(
  stripe: Stripe,
  env: Env,
  paymentHandle: string,
): Promise<Stripe.Checkout.Session> {
  const priceId = env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID is not configured');
  }

  const successUrl = env.CHECKOUT_SUCCESS_URL ?? 'http://localhost:8787/health?paid=1';
  const cancelUrl = env.CHECKOUT_CANCEL_URL ?? 'http://localhost:8787/health?paid=0';

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_creation: 'always',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: paymentHandle,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export async function isCheckoutSessionPaid(
  stripe: Stripe,
  sessionId: string,
): Promise<{ paid: boolean; customerId?: string }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === 'paid',
    customerId: extractCustomerId(session.customer),
  };
}

export async function resolveEntitlementStatus(
  kv: KVNamespace,
  stripe: Stripe,
  handle: string,
): Promise<'paid' | 'pending' | 'used' | 'expired' | 'missing'> {
  const record = await getEntitlement(kv, handle);

  if (record?.status === 'used') return 'used';
  if (record?.status === 'expired') return 'expired';
  if (record?.status === 'paid') return 'paid';

  if (record?.status === 'pending' && record.sessionId) {
    const { paid, customerId } = await isCheckoutSessionPaid(stripe, record.sessionId);
    if (paid) {
      await markEntitlementPaid(kv, handle, customerId);
      return 'paid';
    }
    return 'pending';
  }

  return 'missing';
}
