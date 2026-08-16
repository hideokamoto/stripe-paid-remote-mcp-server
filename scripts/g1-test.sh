#!/usr/bin/env bash
# G1 gate: stateless MCP core verification (2026-07-28)
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
META='{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"g1-test","version":"1.0.0"}}'

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

assert_http_and_jsonrpc_error() {
  local label="$1"
  local expected_http="$2"
  local expected_code="$3"
  shift 3

  local response http body actual_code
  response=$(curl -s -w $'\n%{http_code}' "$@")
  http="${response##*$'\n'}"
  body="${response%$'\n'*}"
  actual_code=$(echo "$body" | jq -r '.error.code // empty')

  if [[ "$http" != "$expected_http" ]]; then
    echo "FAIL [$label]: expected HTTP $expected_http, got $http"
    echo "$body"
    exit 1
  fi

  if [[ "$actual_code" != "$expected_code" ]]; then
    echo "FAIL [$label]: expected error.code $expected_code, got ${actual_code:-<missing>}"
    echo "$body"
    exit 1
  fi

  echo "PASS [$label]: HTTP $http, error.code $actual_code"
  echo "$body"
}

echo "=== G1-1: tools/call roll_dice (headers complete) ==="
mcp_call tools/call roll_dice \
  "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"roll_dice\",\"arguments\":{},\"_meta\":${META}}}"
echo ""

echo "=== G1-2: Mcp-Method missing → 400 / -32020 ==="
assert_http_and_jsonrpc_error "G1-2" 400 -32020 \
  -X POST "$BASE_URL/mcp" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Name: roll_dice' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"roll_dice\",\"arguments\":{},\"_meta\":${META}}}"
echo ""

echo "=== G1-3: server/discover ==="
mcp_call server/discover discover \
  "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"server/discover\",\"params\":{\"_meta\":${META}}}"
echo ""

echo "=== G1-4: tools/list (ttlMs / cacheScope) ==="
mcp_call tools/list list \
  "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/list\",\"params\":{\"_meta\":${META}}}"
echo ""

echo "=== G1-5: legacy initialize (no envelope) → -32022 ==="
assert_http_and_jsonrpc_error "G1-5" 400 -32022 \
  -X POST "$BASE_URL/mcp" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -H 'Mcp-Method: initialize' \
  -H 'Mcp-Name: initialize' \
  -d '{"jsonrpc":"2.0","id":5,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"legacy","version":"1.0.0"}}}'
echo ""
