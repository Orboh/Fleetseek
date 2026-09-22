# Progress Log — FleetSeek DebugNote MVP-α

## Session: 2026-04-29 — installer E2E 動作確認 + UI バグ修正 + Phase 17 完了

### Phase 17: CLI ローカルコールバック認証 (MVP-ζ)
- **Status:** complete (2026-04-29)
- Actions taken:
  - `packages/cli/src/commands/auth.js`: ローカル HTTP サーバー (port 38333) でAPIキーを自動受け取り
  - `apps/web/src/app/auth/login/page.tsx`: `?cli_port` を sessionStorage に保存済み（コミット済み）
  - `apps/web/src/app/auth/x/complete/page.tsx`: cli_port があれば `localhost:38333` にAPIキーを GET 送信済み（コミット済み）
  - install.sh は `fleetseek auth login` 呼び出しのみ (xdg-open は CLI が内部で処理)
  - Vercel は `147947a` デプロイ時にこれらのファイルを含めて本番反映済み

### installer E2E 動作確認 (curl one-liner)
- **Status:** complete (2026-04-29)
- Issues fixed:
  - `curl | bash` で inquirer が "Cancelled." → `< /dev/tty` で解決
  - Railway DB 500 error (missing columns) → `applyMigrations()` に DDL 追加で解決
  - MCP `~/.claude/mcp_servers.json` → `~/.claude.json` の `mcpServers` に変更
  - Robot ID: `rbt_01KQBSVNEBF23YNQY53H41KASG` 発行済み
  - `fleetseek · ✔ connected` を `/mcp` で確認

### UI バグ修正: experience detail page
- **Status:** complete (2026-04-29)
- Bug: `TypeError: v.failed_attempts.map is not a function`
  - Root cause: MCP 経由で投稿した debug_note の `failed_attempts` が文字列
  - Fix: `Array.isArray()` ガード + `typeof === 'string'` フォールバック表示
- Commit: `147947a`, Vercel 本番デプロイ済み

### orboh.jp → www.orboh.com URL 修正
- **Status:** complete (2026-04-29)
- `orboh.jp` が ECONNREFUSED で機能していないことを確認
- `orboh-lp/src/i18n/translations.ts` の `robotInstruction` を2箇所修正
- `orboh-lp` main にプッシュ → Vercel 自動デプロイ (commit: `06e2622`)

---

## Session: 2026-04-29 — MVP-ε: install.sh / skill.md / g1-debug-loop

### Phase 13-15: 実装完了
- `orboh-lp/public/install.sh` 新規作成 (curl one-liner セットアップ)
- `orboh-lp/public/skill.md` 更新 (Step 3 を1行化 + Step 6 知識貢献義務追加)
- `~/.claude/skills/g1-debug-loop/SKILL.md` 新規作成
- Phase 16 (`~/.claude/CLAUDE.md`) はセキュリティフックによりブロック → ユーザーが手動追加

---

## Session: 2026-04-29 — X OAuth 本番デプロイ (MVP-δ)

### Phase 12: X OAuth 2.0 PKCE ログイン
- **Status:** complete
- Actions taken:
  - Next.js 14 静的プリレンダリング問題を発見・修正 (`export const dynamic = 'force-dynamic'`)
  - Cookie をリダイレクトレスポンスに正しくセット (`response.cookies.set()`)
  - Railway 本番 DB に twitter カラム追加（`src/index.js` 起動時 `ADD COLUMN IF NOT EXISTS`）
  - `apps/api/Dockerfile` の `npm ci` → `npm install --omit=dev` 変更
  - `apps/api/railway.toml` 作成
  - Railway + Vercel に本番デプロイ、X ログイン E2E 動作確認
  - Orboh LP の `public/skill.md` を Railway URL・X login フローに合わせて修正
  - LP を `github.com/Orboh/orboh-lp` main にプッシュ → `orboh-lp.vercel.app` 自動デプロイ
- Files created/modified:
  - `apps/web/src/app/api/auth/x/route.ts` (dynamic + cookie fix)
  - `apps/web/src/app/api/auth/x/callback/route.ts` (dynamic + try/catch + response format fix)
  - `apps/api/src/index.js` (applyMigrations 追加)
  - `apps/api/Dockerfile` (npm ci → npm install)
  - `apps/api/railway.toml` (新規)
  - `FleetSeek/CLAUDE.md` (デプロイ手順 + Next.js gotchas 追記)
  - `packages/sdk/README.md` (完全書き直し — 全メソッド文書化)

### バグ修正一覧
| バグ | 原因 | 修正 |
|------|------|------|
| Vercel「このページは動作していません」 | Next.js が `/api/auth/x` を静的プリレンダリング | `export const dynamic = 'force-dynamic'` |
| Cookie が引き継がれない | `cookies().set()` はリダイレクトに乗らない | `response.cookies.set()` に変更 |
| `x_auth_failed`（DB カラムなし） | Railway 本番 DB に twitter カラムが未追加 | `src/index.js` 起動時に `ADD COLUMN IF NOT EXISTS` |
| `x_auth_failed`（レスポンス形式）| `authData.data.api_key` と誤読（`success()` は data ラッパーなし） | `authData.api_key` に修正 |
| Railway ビルド「start command not found」 | モノレポルートから `railway up` → `apps/api` が見つからない | `--path-as-root` + `railway.toml` 追加 |
| Railway npm ci エラー | lock file 非同期 | `npm install --omit=dev` に変更 |

---

## Session: 2026-04-28 (continued)

### Phase 2: DB スキーマ設計・マイグレーション
- **Status:** complete
- Actions taken:
  - `004_experiences.sql` 作成 (experiences, config_snapshots, experience_applications, robots 拡張)
  - pgvector: 既存コンテナに `postgresql-16-pgvector` をインストールして `CREATE EXTENSION vector` 有効化
  - docker-compose.yml を `pgvector/pgvector:pg16` イメージに更新
  - migrate.js を順序付きマイグレーション実行に改修
  - 既存 episodes 17 件を experiences (type='skill') に移行済み
- Files created/modified:
  - `apps/api/scripts/004_experiences.sql` (新規)
  - `apps/api/scripts/migrate.js` (更新)
  - `docker-compose.yml` (postgres イメージ変更)
- 次フェーズ: Phase 3 (Backend API 実装)

---

## Session: 2026-04-28

### Phase 1: 既存コードベース精査
- **Status:** in_progress
- **Started:** 2026-04-28
- Actions taken:
  - 要件定義書 (v0.1) をレビュー、計画ファイル 3 点を作成
  - 既存ルートファイル一覧を確認 (agents/episodes/robots/search/subrobots 等)
  - apps/web/src/app/api/ の BFF ルート構成を確認
  - 既存 CLAUDE.md (api/web/mcp-server) を読み込み
- Files created/modified:
  - `task_plan.md` (新規)
  - `findings.md` (新規)
  - `progress.md` (新規)
- Phase 1 完了:
  - schema.sql 確認 → experiences/config_snapshots/experience_applications テーブルなし、pgvector なし
  - SDK 確認 → Python RoboNetClient, robonet_ prefix, episodes のみ
  - types/index.ts 確認 → Experience 系型なし
  - .claude/rules/ 確認 → backward-compat.md / typescript.md
- 次フェーズ: Phase 2 (DB スキーマ設計)

---

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| (未実施) | — | — | — | — |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| (なし) | — | 1 | — |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1: 既存コードベース精査 |
| Where am I going? | Phase 2: DB スキーマ設計、Phase 3: API 実装、Phase 4: MCP サーバー |
| What's the goal? | Orboh 社内で Claude Code が DebugNote を自動検索・自動投稿するループを回す (MVP-α) |
| What have I learned? | findings.md 参照 |
| What have I done? | 要件書レビュー完了、計画ファイル 3 点作成 |

---
*Update after completing each phase or encountering errors*
