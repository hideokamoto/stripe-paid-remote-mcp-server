# Paid MCP PoC — 記事化シード

> article-harvest 投入用。旧 PaidMcpAgent 構成との対比が核。

## タイトル案

**「MCP 2026-07-28 で作るステートレス Paid Remote MCP — Durable Object なし、POST /mcp 1 本」**

## フック（リード文）

MCP プロトコルが 2026-07-28 でステートレス化し、セッションも `initialize` も不要になった。
これにより、Cloudflare Workers 上で Durable Object なし・`POST /mcp` 1 本の Paid MCP サーバーが現実的になった。
本 PoC では Stripe Checkout + MRTR ペイウォール + Billing Meters を、wrangler + Hono + MCP SDK v2 で実装した。

## 旧構成（PaidMcpAgent）との対比

| 観点 | 旧 PaidMcpAgent | 本 PoC |
|---|---|---|
| トランスポート | Cloudflare `McpAgent` (Durable Object) | 素の `POST /mcp` |
| セッション | DO 内ステートフル | ステートレス（handle をツール引数で往復） |
| ペイウォール | `@stripe/agent-toolkit` | MRTR `input_required` + Checkout URL |
| MCP SDK | v1 系 | `@modelcontextprotocol/server` v2 |
| プロトコル | 2025-11-25（initialize あり） | 2026-07-28（server/discover のみ） |
| payer 識別 | セッション bound | サーバー発行 `payment_handle` |
| 従量課金 | なし | Stripe Billing Meters |

## 記事セクション案

1. **2026-07-28 で何が変わったか** — セッション廃止、MRTR、キャッシュヒント
2. **アーキテクチャ** — request → header 検証 → entitlement (KV) → MRTR / 実行、webhook 経路
3. **SDK v2 on Workers** — `createMcpHandler` + Hono、`createFetchHttpClient()`
4. **MRTR ペイウォール実装** — `inputRequired.elicitUrl()` + `inputResponses` リトライ
5. **KV 結果整合** — webhook 遅延時の `checkout.sessions.retrieve` フォールバック
6. **Billing Meters** — `customer_creation: always` + `meterEvents.create`
7. **検証方法** — curl / MCP Inspector / `scripts/g2-test.sh`
8. **未着手（追跡課題）** — OAuth (Phase 4)、CIMD 対応

## コード参照ポイント

- `src/middleware/mcp-headers.ts` — 2026-07-28 ヘッダー検証
- `src/mcp/tools/premium-report.ts` — MRTR ペイウォール本体
- `src/stripe/webhook.ts` — `constructEventAsync`
- `src/stripe/metering.ts` — meter event 送信

## タグ案

`mcp`, `stripe`, `cloudflare-workers`, `usage-based-billing`, `mrtr`, `paid-mcp`
