#!/usr/bin/env bash
# One-time setup: create Stripe Billing Meter for premium_report executions
set -euo pipefail

if [[ ! -f .dev.vars ]]; then
  echo "ERROR: Copy .dev.vars.example to .dev.vars and set STRIPE_SECRET_KEY"
  exit 1
fi

STRIPE_KEY=$(grep '^STRIPE_SECRET_KEY=' .dev.vars | cut -d= -f2-)
EVENT_NAME=$(grep '^STRIPE_METER_EVENT_NAME=' .dev.vars 2>/dev/null | cut -d= -f2- || true)
EVENT_NAME="${EVENT_NAME:-premium_report_executed}"

EXISTING=$(curl -s "https://api.stripe.com/v1/billing/meters?limit=20" -u "$STRIPE_KEY:" | jq -r ".data[] | select(.event_name==\"$EVENT_NAME\") | .id" | head -1)

if [[ -n "$EXISTING" && "$EXISTING" != "null" ]]; then
  echo "Meter already exists: $EXISTING (event_name=$EVENT_NAME)"
  exit 0
fi

echo "Creating meter with event_name=$EVENT_NAME ..."
curl -s https://api.stripe.com/v1/billing/meters \
  -u "$STRIPE_KEY:" \
  -d "display_name=Premium MCP Tool Executions" \
  -d "event_name=$EVENT_NAME" \
  -d "default_aggregation[formula]=sum" \
  -d "customer_mapping[event_payload_key]=stripe_customer_id" \
  -d "customer_mapping[type]=by_id" \
  -d "value_settings[event_payload_key]=value" | jq '{id, event_name, status}'
