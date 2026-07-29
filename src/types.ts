export interface Env {
  ENTITLEMENTS: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  CHECKOUT_SUCCESS_URL?: string;
  CHECKOUT_CANCEL_URL?: string;
}
