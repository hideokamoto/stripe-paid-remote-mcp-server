export interface Env {
  ENTITLEMENTS: KVNamespace;
  /** HMAC key for MRTR requestState (spec 2026-07-28); must be >= 32 bytes */
  REQUEST_STATE_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_METER_EVENT_NAME?: string;
  CHECKOUT_SUCCESS_URL?: string;
  CHECKOUT_CANCEL_URL?: string;
}
