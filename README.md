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
| 従量課金 | Stripe Billing Meters（`premium_report_executed`） |

## アーキテクチャ

```
┌─────────┐     POST /mcp      ┌──────────────────────────────────────────┐
│  Client │ ─────────────────► │ Cloudflare Worker (Hono)                 │
│ (MCP)   │                    │                                          │
└─────────┘                    │  1. Header validation                    │
     ▲                         │     MCP-Protocol-Version: 2026-07-28     │
     │                         │     Mcp-Method / Mcp-Name                │
     │  input_required         │                                          │
     │  (checkout URL)         │  2. MCP handler (createMcpHandler)       │
     │                         │     server/discover / tools/list / call  │
     │                         │                                          │
     │  inputResponses retry   │  3. Entitlement check (Workers KV)       │
     └─────────────────────────│     pending → input_required (MRTR)      │
                               │     paid    → execute + consume handle   │
                               │     used    → reject                     │
                               │                                          │
                               │  4. Stripe fallback (KV miss/pending)    │
                               │     checkout.sessions.retrieve           │
                               │                                          │
                               │  5. Meter event (Billing Meters API)     │
                               └──────────┬───────────────────────────────┘
                                          │
                    POST /stripe/webhook  │  checkout.sessions.create
                                          ▼
                               ┌──────────────────────┐
                               │ Stripe               │
                               │ - Checkout Sessions  │
                               │ - Customers          │
                               │ - Billing Meters     │
                               └──────────────────────┘
```

### 状態の所在

| 状態 | 保存先 | 用途 |
|---|---|---|
| payment handle | KV (`entitlement:{uuid}`) | 未払い/支払い済み/使用済みのキャッシュ |
| customer ID | KV（entitlement レコード内） | Billing Meters の payer 識別 |
| 決済の真実 | Stripe Checkout Session | webhook / フォールバック照会の source of truth |
| 従量カウント | Stripe Billing Meter | ツール実行ごとの meter event |

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars
# .dev.vars に Stripe テストキーを設定
bash scripts/setup-meter.sh   # Billing Meter 作成（初回のみ）
npm run dev
```

`GET /health` は `{ ok: true, mcp: { ready: true } }` を返します。`REQUEST_STATE_SECRET` 未設定時は `mcp.ready: false` と理由が含まれます。

### 必要な環境変数（`.dev.vars`）

```
REQUEST_STATE_SECRET=<32+ byte HMAC key for MRTR requestState>
STRIPE_SECRET_KEY=sk_test_...   # または rk_test_...（制限付きキー）
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_METER_EVENT_NAME=premium_report_executed
CHECKOUT_SUCCESS_URL=http://localhost:8787/health?paid=1
CHECKOUT_CANCEL_URL=http://localhost:8787/health?paid=0
```

### Stripe Webhook（ローカル）

`stripe listen` は restricted key では `stripecli_session_write` 権限が必要です。`sk_test_` キーを使うか、KV シミュレーションで検証してください。

```bash
stripe listen --forward-to http://localhost:8787/stripe/webhook
stripe trigger checkout.session.completed
```

## ツール

| ツール | 種別 | 説明 |
|---|---|---|
| `roll_dice` | 無料 | N 面ダイスを振る |
| `premium_report` | 有料 | プレミアム分析レポート（MRTR ペイウォール + meter event） |

## 検証スクリプト

| Gate | コマンド | 内容 |
|---|---|---|
| G1 | `bash scripts/g1-test.sh` | ヘッダー検証（-32020）、roll_dice、server/discover、tools/list、legacy 拒否（-32022） |
| G2 | `bash scripts/g2-test.sh` | MRTR ペイウォール 4 パターン |
| G3 | `bash scripts/g3-test.sh <customer_id>` | Billing Meter event 計上確認 |

```bash
npm run test:g1
npm run test:g2
npm run test:g3 <customer_id>
npm test               # node:test ユニットテスト（C1/C2/C3）
```

G2-1 には `_meta.clientCapabilities` に `elicitation: { url: {} }` が必要です。

## デプロイ

```bash
# 1. KV Namespace を作成し wrangler.jsonc の id を更新
wrangler kv namespace create ENTITLEMENTS
# → 出力された id を wrangler.jsonc の kv_namespaces[0].id に設定

# 2. シークレットと本番 URL を設定
wrangler secret put REQUEST_STATE_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
# wrangler.jsonc vars または secret で CHECKOUT_SUCCESS_URL / CHECKOUT_CANCEL_URL を設定

# 3. デプロイ
npm run deploy
```

`wrangler.jsonc` の `local-dev-placeholder` はローカル開発用です。本番デプロイ前に実際の KV Namespace ID へ置き換えてください。

## プロジェクト構成

```
src/
├── index.ts                    # Hono app エントリ
├── mcp/
│   ├── handler.ts              # createMcpHandler（legacy: reject, requestState codec）
│   └── tools/premium-report.ts # MRTR ペイウォール
├── kv/entitlement.ts           # payment handle ライフサイクル
└── stripe/
    ├── client.ts               # Checkout / フォールバック照会
    ├── webhook.ts              # constructEventAsync
    └── metering.ts             # Billing Meters
scripts/
├── g1-test.sh                  # G1 gate
├── g2-test.sh                  # G2 gate
├── g3-test.sh                  # G3 gate
├── mint-request-state.mjs        # G2 用 signed requestState ミント
└── setup-meter.sh              # Meter 初回作成
article-harvest/
└── paid-mcp-poc.md             # 記事化シード
DECISIONS.md                    # 設計判断と一次情報
```

## 未着手（追跡課題）

- **Phase 4 OAuth**: `workers-oauth-provider`、entitlement キーを `sub` に移行、CIMD 対応（`DECISIONS.md` D-009 参照）

## 設計判断

詳細は [DECISIONS.md](./DECISIONS.md) を参照。

## ライセンス

MIT
