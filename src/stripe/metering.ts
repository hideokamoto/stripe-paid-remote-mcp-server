import type Stripe from 'stripe';
import { DEFAULT_METER_EVENT_NAME } from './client';
import type { Env } from '../types';

export async function recordPremiumReportExecution(
  stripe: Stripe,
  env: Env,
  customerId: string,
  idempotencyKey: string,
): Promise<void> {
  const eventName = env.STRIPE_METER_EVENT_NAME ?? DEFAULT_METER_EVENT_NAME;

  await stripe.billing.meterEvents.create({
    event_name: eventName,
    identifier: idempotencyKey,
    payload: {
      stripe_customer_id: customerId,
      value: '1',
    },
  });
}
