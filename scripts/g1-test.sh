#!/usr/bin/env bash
# G1 gate: stateless MCP core verification
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

echo "=== G1-1: tools/call roll_dice (headers complete) ==="
mcp_call tools/call roll_dice \
  "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"roll_dice\",\"arguments\":{},\"_meta\":${META}}}"
echo ""

echo "=== G1-2: Mcp-Method missing → 400 ==="
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$BASE_URL/mcp" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Name: roll_dice' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"roll_dice"}}'
echo ""

echo "=== G1-3: server/discover ==="
mcp_call server/discover discover \
  "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"server/discover\",\"params\":{\"_meta\":${META}}}"
echo ""

echo "=== G1-4: tools/list (ttlMs / cacheScope) ==="
mcp_call tools/list list \
  "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/list\",\"params\":{\"_meta\":${META}}}"
