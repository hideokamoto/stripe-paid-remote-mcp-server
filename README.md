# stripe-paid-remote-mcp-server

Cloudflare Workers 上で動作する、Stripe 決済付きリモート MCP サーバー（PoC）。

MCP プロトコル **2026-07-28** 対応。ステートレス設計で `POST /mcp` 1 本。MRTR（Multi Round-Trip Requests）によるペイウォールを実装。

## スタック

| レイヤ | 技術 |
|---|---|
| ランタイム | Cloudflare Workers |
| フレームワーク | Hono |
| MCP SDK | `@modelcontextprotocol/server@2.0.0` + `@modelcontextprotocol/hono@2.0.0` |
| 決済 | `stripe@22.3.2`（`createFetchHttpClient()`） |
| 状態 | Workers KV（entitlement キャッシュ）+ Stripe（source of truth） |

## アーキテクチャ

```
Client                    Worker                         Stripe
  │                         │                              │
  │── POST /mcp ──────────►│                              │
  │   (MCP headers + body)  │── header validation          │
  │                         │── entitlement check (KV)     │
  │                         │   ├─ free tool → execute     │
  │                         │   └─ paid tool               │
  │◄── input_required ──────│      ├─ unpaid → Checkout ──►│
  │    (checkout URL)       │      └─ paid → execute        │
  │                         │                              │
  │── retry w/ inputResp ──►│── KV lookup / Stripe fallback│
  │◄── tool result ─────────│                              │
  │                         │                              │
  │                         │◄── POST /stripe/webhook ─────│
  │                         │    (checkout.session.completed)
  │                         │── KV: pending → paid          │
```

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars
# .dev.vars に Stripe テストキーを設定
npm run dev
```

### 必要な環境変数（`.dev.vars`）

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
CHECKOUT_SUCCESS_URL=http://localhost:8787/health?paid=1
CHECKOUT_CANCEL_URL=http://localhost:8787/health?paid=0
```

### Stripe Webhook（ローカル）

```bash
stripe listen --forward-to http://localhost:8787/stripe/webhook
```

## ツール

| ツール | 種別 | 説明 |
|---|---|---|
| `roll_dice` | 無料 | N 面ダイスを振る |
| `premium_report` | 有料 | プレミアム分析レポート（MRTR ペイウォール） |

## 検証コマンド

### G1: ステートレス MCP コア

```bash
# tools/call（ヘッダー完備）
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: roll_dice' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"roll_dice","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"}}}}'

# Mcp-Method 欠落 → 400
curl -s -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Name: roll_dice' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"roll_dice"}}'

# server/discover
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -H 'Mcp-Name: discover' \
  -d '{"jsonrpc":"2.0","id":3,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"}}}}'
```

### G2: MRTR ペイウォール

```bash
bash scripts/g2-test.sh
```

G2-1（未払い → `input_required`）は `.dev.vars` に Stripe テストキーが必要です。

```bash
# Stripe CLI で webhook 転送
stripe listen --forward-to http://localhost:8787/stripe/webhook

# テスト決済トリガー
stripe trigger checkout.session.completed
```

## 設計判断

詳細は [DECISIONS.md](./DECISIONS.md) を参照。

## ライセンス

MIT
