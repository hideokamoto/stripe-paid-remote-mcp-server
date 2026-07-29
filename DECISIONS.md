# DECISIONS.md

Paid MCP PoC の設計判断と一次情報の記録。

## 完了予定日

| Phase | 完了予定日 |
|---|---|
| 0 | 2026-07-29 |
| 1 | 2026-07-30 |
| 2 | 2026-08-01 |
| 3 | 2026-08-02（任意） |
| 5 | 2026-08-03 |

---

## D-001: MCP 2026-07-28 主要変更点

**参照**: https://modelcontextprotocol.io/specification/2026-07-28/changelog

**要点**:

1. **プロトコルレベルセッション廃止** — `Mcp-Session-Id` ヘッダーと per-connection の list 差分がなくなる。クロスコール状態はサーバー発行の明示的ハンドルをツール引数で渡す（SEP-2567）。
2. **ステートレス化** — `initialize` / `notifications/initialized` ハンドシェイク廃止。各リクエストの `_meta` に `protocolVersion` / `clientCapabilities` / `clientInfo` を載せる（SEP-2575）。
3. **`server/discover` 必須** — サポートするプロトコルバージョン・capabilities・identity を返す RPC。`initialize` の代替プローブとしても使える。
4. **MRTR（Multi Round-Trip Requests）** — サーバー発信リクエスト（sampling, elicitation, roots/list）を `resultType: "input_required"` + `inputResponses` リトライに置換（SEP-2322）。
5. **`resultType` 必須** — `"complete"` または `"input_required"`。旧サーバーは省略を `"complete"` とみなす。
6. **キャッシュヒント** — `tools/list` 等の結果に `ttlMs` と `cacheScope`（`"public"` | `"private"`）必須（SEP-2549）。
7. **標準ヘッダー** — Streamable HTTP POST に `Mcp-Method` / `Mcp-Name` 必須（SEP-2243）。

**判断への影響**:

- Durable Object / `McpAgent` は不要。`POST /mcp` 1 本のステートレス Workers で実装可能。
- ペイウォールは MRTR の `input_required` で表現する（Phase 2）。
- `initialize` は実装しない。`server/discover` のみ実装（Phase 1）。
- payment handle は SEP-2567 の「サーバー発行ハンドルをツール引数で戻す」パターンに従う。

---

## D-002: MRTR（SEP-2322）

**参照**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322

**要点**:

- サーバーが追加情報を必要とする場合、`InputRequiredResult`（`resultType: "input_required"`）を返す。
- `inputRequests` フィールドに必要なリクエストを載せる。
- クライアントは元リクエストを `inputResponses` 付きでリトライする。
- `inputResponses` は**ラウンドごと**（累積しない）。複数ラウンドは `requestState` でフェーズ管理。
- 旧方式（`elicitation/create`, `sampling/createMessage`, `roots/list`）は legacy shim で互換可能だが、新実装は `inputRequired()` API を使う。

**判断への影響**:

- 未払い時: `inputRequired({ inputRequests: { payment: inputRequired.elicitUrl({ url: checkoutUrl }) } })` 相当のレスポンスを返す。
- 支払い後リトライ: `inputResponses` 内の `payment_handle` を KV で照合し、paid ならツール実行。
- PoC では都度課金（consume）モデルを採用。

---

## D-003: TypeScript SDK v2 パッケージ構成

**参照**:

- https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html
- https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.md
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md

**要点**:

- v1 の単一パッケージ `@modelcontextprotocol/sdk`（npm 最新 1.30.0）は v2 で分割:
  - `@modelcontextprotocol/core` — 型・プロトコル
  - `@modelcontextprotocol/server` — サーバー実装
  - `@modelcontextprotocol/client` — クライアント実装
  - `@modelcontextprotocol/hono` — Hono アダプタ
- v2 は Node.js 20+ / ESM のみ（Workers は web-standard `fetch` で動作）。
- 2026-07-28 対応は**明示的オプトイン**:
  - HTTP: `createMcpHandler(factory)` from `@modelcontextprotocol/server`
  - Hono: `createMcpHonoApp()` + `handler.fetch(c.req.raw, { parsedBody })`
- Workers では `WebStandardStreamableHTTPServerTransport` を使う（Node 用 `StreamableHTTPServerTransport` ではない）。
- JSON Schema バリデーションは Workers 上で `@cfworker/json-schema` を自動選択（明示設定不要）。
- MRTR: `inputRequired()` / `acceptedContent()` from `@modelcontextprotocol/server`。

**採用バージョン**: `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/hono@2.0.0`

**判断への影響**:

- 計画書の `@modelcontextprotocol/sdk` v2 系は、実際には `@modelcontextprotocol/server` + `@modelcontextprotocol/hono` を使用する。
- 手組み JSON-RPC は G0 スパイクで不要と判断（下記 D-004）。

---

## D-004: G0 スパイク — SDK v2 on Workers + Hono（G0-b 判断）

**判断**: **SDK v2 `createMcpHandler` を採用。手組み JSON-RPC には切り替えない。**

**根拠**:

1. `createMcpHandler` は web-standard `{ fetch }` を返し、Cloudflare Workers に `export default app` でそのまま載る（公式ドキュメント: https://ts.sdk.modelcontextprotocol.io/v2/serving/http.md）。
2. `@modelcontextprotocol/hono` の `createMcpHonoApp` + `handler.fetch(c.req.raw)` で Hono 統合が確認済み（https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.md）。
3. ファクトリはリクエストごとに新しい `McpServer` を生成するため、ステートレス要件を満たす。
4. `legacy: 'stateless'` デフォルトで 2025 クライアントも同一エンドポイントで処理可能。
5. G0 Gate（`tools/list` → JSON-RPC レスポンス）を wrangler dev で実証済み（下記 Gate 出力）。

---

## D-005: Stripe SDK on Workers

**参照**: https://github.com/stripe/stripe-node#configuring-an-http-client

**要点**:

- Workers では `Stripe.createFetchHttpClient()` を `httpClient` オプションに指定する必要がある（Node の `http`/`https` モジュールが使えないため）。
- Webhook 署名検証は `constructEventAsync` を使う（同期版 `constructEvent` は Workers で動作しない）。

**採用バージョン**: `stripe@22.3.2`

**判断への影響**:

- Phase 0 スパイク: `/stripe/ping` エンドポイントで `balance.retrieve()` 疎通確認（`STRIPE_SECRET_KEY` 未設定時は 503）。
- Phase 2: webhook は `constructEventAsync`、Checkout Session フォールバック照会は `checkout.sessions.retrieve`。

---

## D-006: 認証方針（Phase 4 まで）

- Phase 0–3: Bearer 等の認証なし。`_meta.clientInfo` はリクエストから読むのみ。
- payer 識別: サーバー発行 `payment_handle` をツール引数 / `inputResponses` で往復（SEP-2567 推奨パターン）。
- OAuth（`workers-oauth-provider`）は Phase 4 stretch。DCR は非推奨だが 12 ヶ月互換窓あり。CIMD 対応は追跡課題。

---

## D-007: KV 結果整合（Phase 2）

- webhook 到達前のリトライを前提とする。
- KV miss / pending 時は `stripe.checkout.sessions.retrieve(client_reference_id)` で直接照会してから判定。
- handle TTL: 30 分（pending）。paid → consume（一回性）で used に遷移。
