#!/usr/bin/env bash
# G2 gate tests — scenarios 2-4 use KV seeding; scenario 1 requires Stripe keys in .dev.vars
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
META='{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"elicitation":{"url":{}}},"io.modelcontextprotocol/clientInfo":{"name":"g2-test","version":"1.0.0"}}'

if [[ -f .dev.vars ]]; then
  # shellcheck disable=SC1091
  set -a && source .dev.vars && set +a
fi

mcp_call() {
  local method="$1" name="$2" body="$3"
  curl -s -X POST "$BASE_URL/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -H 'MCP-Protocol-Version: 2026-07-28' \
    -H "Mcp-Method: $method" \
    -H "Mcp-Name: $name" \
    -d "$body"
}

seed_kv() {
  local key="$1" value="$2"
  npx wrangler kv key put "$key" "$value" --binding=ENTITLEMENTS --local 2>/dev/null
}

mint_request_state() {
  local handle="$1" session_id="$2"
  node scripts/mint-request-state.mjs "$handle" "$session_id"
}

HANDLE_PAID="11111111-1111-4111-8111-111111111111"
HANDLE_USED="22222222-2222-4222-8222-222222222222"
HANDLE_EXPIRED="33333333-3333-4333-8333-333333333333"

retry_premium() {
  local handle="$1"
  local session_id="$2"
  local request_state
  request_state="$(mint_request_state "$handle" "$session_id")"
  mcp_call tools/call premium_report \
    "$(jq -n \
      --arg handle "$handle" \
      --arg state "$request_state" \
      --arg meta "$META" \
      '{
        jsonrpc: "2.0",
        id: 99,
        method: "tools/call",
        params: {
          name: "premium_report",
          arguments: { topic: "Q3 Revenue" },
          inputResponses: { payment: { action: "accept", content: { handle: $handle } } },
          requestState: $state,
          _meta: ($meta | fromjson)
        }
      }')"
}

echo "=== G2-1: Unpaid → input_required (requires STRIPE_SECRET_KEY in .dev.vars) ==="
mcp_call tools/call premium_report \
  "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"premium_report\",\"arguments\":{\"topic\":\"Q3 Revenue\"},\"_meta\":${META}}}"
echo ""

echo "=== G2-2: Paid retry → tool success ==="
seed_kv "entitlement:${HANDLE_PAID}" "{\"status\":\"paid\",\"sessionId\":\"cs_test_paid\",\"createdAt\":$(date +%s)}"
retry_premium "$HANDLE_PAID" "cs_test_paid"
echo ""

echo "=== G2-3: Used handle reuse → reject ==="
seed_kv "entitlement:${HANDLE_USED}" "{\"status\":\"used\",\"sessionId\":\"cs_test_used\",\"createdAt\":$(date +%s)}"
retry_premium "$HANDLE_USED" "cs_test_used"
echo ""

echo "=== G2-4: Expired handle → reject ==="
seed_kv "entitlement:${HANDLE_EXPIRED}" "{\"status\":\"expired\",\"sessionId\":\"cs_test_expired\",\"createdAt\":$(date +%s)}"
retry_premium "$HANDLE_EXPIRED" "cs_test_expired"
