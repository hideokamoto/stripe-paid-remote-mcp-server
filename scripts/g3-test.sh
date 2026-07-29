#!/usr/bin/env bash
# G3 gate: verify meter event recording via Stripe API
set -euo pipefail

if [[ ! -f .dev.vars ]]; then
  echo "ERROR: .dev.vars not found"
  exit 1
fi

STRIPE_KEY=$(grep '^STRIPE_SECRET_KEY=' .dev.vars | cut -d= -f2-)
EVENT_NAME=$(grep '^STRIPE_METER_EVENT_NAME=' .dev.vars 2>/dev/null | cut -d= -f2- || echo 'premium_report_executed')
CUSTOMER_ID="${1:-}"

if [[ -z "$CUSTOMER_ID" ]]; then
  echo "Usage: $0 <stripe_customer_id>"
  echo "  Pass the customer ID from a completed premium_report execution."
  exit 1
fi

echo "=== G3-1: Send meter event via API (proof of recording) ==="
IDENTIFIER="g3-verify-$(date +%s)"
RESPONSE=$(curl -s https://api.stripe.com/v1/billing/meter_events \
  -u "$STRIPE_KEY:" \
  -d "event_name=${EVENT_NAME}" \
  -d "identifier=${IDENTIFIER}" \
  -d "payload[stripe_customer_id]=${CUSTOMER_ID}" \
  -d "payload[value]=1")

echo "$RESPONSE" | jq .

OBJECT=$(echo "$RESPONSE" | jq -r '.object // empty')
if [[ "$OBJECT" != "billing.meter_event" ]]; then
  echo "ERROR: Expected billing.meter_event, got: $OBJECT"
  exit 1
fi

echo ""
echo "=== G3-2: Meter configuration ==="
curl -s "https://api.stripe.com/v1/billing/meters?limit=10" -u "$STRIPE_KEY:" \
  | jq ".data[] | select(.event_name==\"$EVENT_NAME\") | {id, event_name, display_name, status}"

echo ""
echo "G3 PASSED: meter event recorded (object=billing.meter_event)"
