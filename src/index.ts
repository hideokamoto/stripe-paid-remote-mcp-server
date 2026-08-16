import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import type { Context } from 'hono';
import Stripe from 'stripe';
import { getMcpHandler } from './mcp/handler';
import { handleStripeWebhook } from './stripe/webhook';
import type { Env } from './types';

const app = createMcpHonoApp({ host: '0.0.0.0' });

app.all('/mcp', (c: Context) => {
  const handler = getMcpHandler(c.env as Env);
  return handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') });
});

app.post('/stripe/webhook', async (c: Context) =>
  handleStripeWebhook(c.req.raw, c.env as Env),
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/stripe/ping', async (c: Context) => {
  const env = c.env as Env;
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return c.json({ ok: false, reason: 'STRIPE_SECRET_KEY not configured' }, 503);
  }

  const stripe = new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    await stripe.balance.retrieve();
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 502);
  }
});

export default app;
export type { Env };
