# Task Plan: FleetSeek DebugNote / Experience 機能 MVP-α

## Goal
Orboh 社内で Claude Code が DebugNote を自動検索・自動投稿するループを回せる状態にする (MVP-α)。

## Current Phase
**全 Phase 完了 (Phase 1–17)** — MVP-α〜MVP-ζ 本番稼働中 (2026-04-29)
次のアクション候補: `packages/ai-reviewer/` DebugNote 自動レビュー Worker

## Phases

### Phase 1: 既存コードベース精査
- [x] 既存 DB スキーマ (schema.sql) の確認
- [x] 既存 API ルート全体の把握 (後方互換境界の特定)
- [x] 既存 SDK (packages/sdk/) の把握
- [x] 既存フロントエンド型定義・コンポーネントの確認
- [x] 未確定事項 U3/U4 の解像度を上げる
- **Status:** complete

### Phase 2: DB スキーマ設計・マイグレーション
- [x] `experiences` テーブル設計 (Experience 基底, STI + JSONB)
- [x] `debug_experiences` / `skill_experiences` → JSONB `data` カラム
- [x] `robots` テーブル拡張 (L2: serial_number/mac_address/hw_revision, L1: fleetseek_id)
- [x] `config_snapshots` テーブル (L3)
- [x] `experience_applications` テーブル (適用結果)
- [x] pgvector embedding カラム追加 (vector(1536), HNSW インデックス)
- [x] マイグレーションファイル作成 (`apps/api/scripts/004_experiences.sql`)
- [x] 既存 Skill データの移行スクリプト (episodes → experiences, 17 件移行済み)
- **Status:** complete

### Phase 3: Backend API 実装
- [x] `POST /api/experiences` — 投稿
- [x] `GET /api/experiences/:id` — 取得
- [x] `POST /api/experiences/search` — 横断検索 (ILIKE + trust_score 降順)
- [x] `POST /api/experiences/:id/intent_to_apply` — 適用予告
- [x] `POST /api/experiences/:id/applications` — 適用結果 + trust_score 自動更新
- [x] `POST /api/robots/register` — ロボット登録 (fleetseek_id 発行)
- [x] `POST /api/robots/:id/config_snapshot` — ConfigSnapshot 更新
- [x] 後方互換: `/api/skills`, `/api/episodes` → 既存ルート維持
- [x] embedding 生成ロジック (症状テキスト → vector) ← Phase 9 で完了済み
- **Status:** complete

### Phase 4: MCP サーバー実装 (packages/mcp-server/)
- [x] `experience_search` ツール
- [x] `experience_post` ツール
- [x] `experience_apply_intent` ツール
- [x] `experience_apply_result` ツール
- [x] `robot_get_context` ツール (MVP-α stub)
- [x] `~/.claude/mcp_servers.json` への登録完了
- **Status:** complete

### Phase 5: g1-debug-loop スキル
- [x] SKILL.md 設計 (`.claude/skills/g1-debug-loop/SKILL.md`)
- [x] タスク開始時の `experience_search` 自動呼び出し手順
- [x] `task_plan.md` 冒頭への検索結果自動転記ルール
- [x] `/debug-harvest` コマンド仕様 (`debug-harvest.md`)
- [x] `intent_to_apply` 自動 POST ロジック
- [x] シードデータ 3 件投入済み (arm oscillation / joint limit / SDK timeout)
- **Status:** complete

### Phase 6: CLI 基礎 (packages/cli/)
- [x] `fleetseek auth login` (conf で ~/.config/fleetseek/config.json 保存)
- [x] `fleetseek robot register` (fleetseek_id を config に保存)
- [x] `fleetseek session start` (FLEETSEEK_ROBOT_ID 設定手順を表示)
- [x] `fleetseek search <query>` (--type フィルタ付き ASCII テーブル表示)
- [x] `install.sh` スクリプト
- OSS 採用: commander v14 / @inquirer/prompts v7 / conf v13
- **Status:** complete

### Phase 7: SDK 拡張 (packages/sdk/)
- [x] `client.experiences.*` 7 メソッド追加
- [x] 既存 `client.skills.*`, `client.episodes.*` の後方互換維持
- **Status:** complete

### Phase 8: 統合テスト・ドキュメント
- [x] ローカルでの E2E 動作確認
- [x] API ドキュメント更新 (skill.md / README.md / CLAUDE.md)
- [x] MCP サーバーのローカル動作確認
- **Status:** complete

### Phase 9: Embedding 生成 + 意味検索 (MVP-β)
- [x] `apps/api/src/utils/embedding.js` — OpenAI text-embedding-3-small ユーティリティ
- [x] `POST /experiences` に非同期 embedding 生成を追加
- [x] `POST /experiences/search` に vector similarity search を追加（ILIKE との hybrid fallback）
- [x] `apps/api/scripts/embed-existing.js` — 既存22件の batch embedding スクリプト
- [x] `.env.example` に `OPENAI_API_KEY` を追加
- **Status:** complete (OPENAI_API_KEY 設定後に `npm run embed:existing` で既存データを埋める)

### Phase 10: trust_score 改善 (MVP-β)
- [x] ベイズ平均に変更（prior: 3件×50%）→ 1回成功で62.5点（従来は100点）
- [x] `POST /experiences/:id/applications` のスコア計算を更新
- **Status:** complete

### Phase 11: Web フロントエンド Experience 表示 (MVP-γ)
- [x] `types/index.ts` に Experience / DebugData 型追加
- [x] `lib/api.ts` に `getExperience` / `searchExperiences` + `toExperience` 変換関数追加
- [x] `hooks/index.ts` に `useExperience` / `useExperiences(enabled フラグ付き)` 追加
- [x] `components/experience/ExperienceCard.tsx` 新規作成 (カード + リスト + スケルトン)
- [x] `app/(main)/experience/[id]/page.tsx` 詳細ページ新規作成
- [x] `app/(main)/page.tsx` に「Skill Episodes」/「DebugNotes」タブ追加
- [x] trust_signals.applications 防御的パース修正 (マイグレーション済み旧データ対応)
- **Status:** complete

### Phase 12: X OAuth 2.0 PKCE — 本番デプロイ (MVP-δ)
- [x] `apps/web/src/app/api/auth/x/route.ts` に `export const dynamic = 'force-dynamic'` 追加
- [x] `apps/web/src/app/api/auth/x/callback/route.ts` に同上追加 + try/catch でラップ
- [x] Cookie をレスポンスオブジェクトに直接セット (`response.cookies.set()`)
- [x] Express `success()` レスポンス形式を正しく読む (`authData.api_key`、`data` ラッパーなし)
- [x] Railway 本番 DB に `owner_twitter_id` / `owner_twitter_handle` カラム追加
  - `node-pg-migrate` が非タイムスタンプ名ファイルを再実行してクラッシュ → `src/index.js` 起動時に `ADD COLUMN IF NOT EXISTS` で解決
- [x] `apps/api/Dockerfile`: `npm ci --production` → `npm install --omit=dev` に変更
- [x] `apps/api/railway.toml` 作成（Railway monorepo デプロイ用）
- [x] Railway deploy: `railway up --detach --service robonet-api apps/api --path-as-root`
- [x] Vercel deploy: `cd apps/web && npx vercel --prod`
- [x] ブラウザで X ログイン → API キー取得まで E2E 動作確認済み
- **Status:** complete (2026-04-29)

### Phase 13: Remote install.sh (curl one-liner) — MVP-ε
- [x] `orboh-lp/public/install.sh` — curl で取得・実行できる完全セットアップスクリプト
  - FleetSeek リポジトリの clone / pull
  - CLI の npm install + link
  - MCP サーバーの npm install + build
  - ブラウザで X OAuth (Web URL を open)
  - `FLEETSEEK_API_URL=<prod> fleetseek auth login` 呼び出し
  - `fleetseek robot register` 呼び出し
  - `~/.claude/mcp_servers.json` の自動書き込み (Python で merge)
- **Status:** complete (2026-04-29)

### Phase 14: skill.md 更新 — 1行インストール + 知識貢献義務
- [x] Step 3 を `curl -s https://www.orboh.com/install.sh | bash` の1行に置き換え
- [x] Step 6 「知識を貢献する（必須）」セクションを追加
  - DebugNote の投稿を Optional ではなく必須として記述
  - Claude Code で「このデバッグを FleetSeek にシェアして」と言う手順を記載
- **Status:** complete (2026-04-29)

### Phase 15: g1-debug-loop スキル実装
- [x] `~/.claude/skills/g1-debug-loop/SKILL.md` 作成
  - デバッグ開始時: `experience_search` を自動呼び出し → task_plan.md の先頭に転記
  - デバッグ中: failed_attempts を追跡
  - 解決後: 確認付きで `experience_post` を自動実行
  - 同時に Obsidian devlog に追記 (`Dev-Log/YYYY-MM-DD.md`)
- **Status:** complete (2026-04-29)

### Phase 16: Global CLAUDE.md 更新 — FleetSeek + Obsidian 統合
- [x] install.sh の Step 7 で自動パッチするように変更
- **Status:** complete (install.sh 経由で解決)

### Phase 17: CLIローカルコールバック認証 (OAuth自動認証) — MVP-ζ
- [x] `packages/cli/src/commands/auth.js` — ローカルHTTPサーバー (port 38333) でAPIキーを自動受け取り
- [x] `apps/web/src/app/auth/login/page.tsx` — `?cli_port=38333` をsessionStorageに保存
- [x] `apps/web/src/app/auth/x/complete/page.tsx` — cli_portがあればlocalhost:38333にAPIキーをGET送信
- [x] install.sh は `fleetseek auth login` のみ (CLI が内部でブラウザを開く)
- [x] Vercel 本番デプロイ済み (147947a 時点)
- **Status:** complete (2026-04-29)

## Key Questions (解決済み)
1. ~~既存 `experiences` テーブルはすでに存在するか?~~ → なし、Phase 2 で作成
2. ~~`robots` テーブルに L2/L3 フィールドがあるか?~~ → Phase 2 で追加
3. ~~pgvector は有効化済みか?~~ → Phase 2 で有効化
4. ~~SDK は何言語?~~ → Python + Node.js (packages/sdk/)
5. ~~既存 Skill データは何件あるか?~~ → 17 件、Phase 2 で移行済み
6. ~~CLI robot register — stub 実装か?~~ → stub 実装で先行完了 (Phase 6)

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Experience をシングルテーブル継承 (STI) で実装 | `type` カラムで分岐、サブタイプ固有フィールドは JSONB — シンプル + 横断検索が容易 |
| embedding は symptom.observed_behavior.text を対象 | 検索の主ユースケースが「症状テキスト → DebugNote」のため |
| CLI robot register は U1 解決前は stub 実装 | Unitree SDK API 未確定のため、フロー確認を優先 |
| 後方互換 API は内部転送 (リダイレクトなし) | SDK の URL ハードコードを避けるため |

## E2E Test Results (Phase 8 — 2026-04-28)
| Test | Status |
|------|--------|
| POST /experiences (debug_note) | PASS |
| GET /experiences/:id | PASS |
| POST /experiences/search | PASS |
| POST intent_to_apply | PASS |
| POST applications (trust_score 更新) | PASS |
| POST /robots/register | PASS |
| POST /robots/:id/config_snapshot | PASS |
| GET /episodes (backward compat) | PASS |
| MCP experience_search | PASS |
| MCP experience_post | PASS |
| MCP experience_apply_intent | PASS |
| MCP experience_apply_result | PASS |
| MCP robot_get_context | PASS |

## Bugs Fixed During Testing
| Bug | File | Fix |
|-----|------|-----|
| tags JSON.stringify で malformed array | experiences.js:76 | `tags \|\| null` |
| applicability/provenance/data null 制約違反 | experiences.js:77-79 | `JSON.stringify(x \|\| {})` |
| robots INSERT に updated_at/ON CONFLICT が不整合 | robots.js | 当該句を削除 |
| MCP レスポンスパース `data.data.X` が誤り | mcp-server/index.ts | `data.X` に修正 + rebuild |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| ulid module missing | 1 | `cd apps/api && npm install ulid` |
| port 5432 conflict | 1 | robonet-postgres-1 が既に起動中、そのまま使用 |
| port 3001 EADDRINUSE | 1 | `fuser -k 3001/tcp` でクリア |

## Notes
- AI Reviewer Worker (`packages/ai-reviewer/`) は未実装 — 必要になったら Phase 18 として追加
- `trust_score` のベイズ重み付けは Phase 10 で調整済み
- orboh.jp は未稼働、全 URL は `www.orboh.com` を使用 (2026-04-29 修正済み)
- Railway API: `https://robonet-api-production.up.railway.app`
- Vercel Web: `https://web-ebon-zeta-33.vercel.app`
