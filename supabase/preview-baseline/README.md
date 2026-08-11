# Preview-v2 sanitized baseline

> **Preview-v2 専用 / Production へ適用禁止**
>
> このディレクトリは通常の `supabase/migrations/` から意図的に分離している。`supabase db push`、Production migration ledger の repair、Production への適用に使用してはならない。今回の監査では Preview-v2 にも適用しない。

## 目的と安全境界

このbaselineは、Production (`dhfecpymvmursozfgjlr`) の2026-08-11時点のschema/catalog metadataをread-onlyでinventoryし、空のSupabase環境へ現行`main`互換のアプリ所有objectを再構築するためのもの。対象はPreview-v2 (`qskeezefmvnutuzpevbc`) だが、現在のPreview-v2は空ではないため、このSQLをそのまま重ねて実行してはいけない。

含むもの:

- `public` / `app_private` のDDL、constraints、indexes、functions/RPC、triggers、grants、RLS、policies
- `avatars`、`meteor-media`、`meteor-video` bucket設定と`storage.objects` policies
- アプリ動作に不可欠な非個人・非機密catalog seed
- 空DBで必要な内部revision singleton（値は初期値のみ）

含まないもの:

- `auth.users`、identity、credential、password、session
- 実ユーザーのprofile、post、星文、message、notification、report、block、event、subscription、AI job
- ProductionのユーザーUUID、メールアドレス、operator ID、profile ID
- Storage object
- API key、service-role key、JWT、AI/Push secret
- Production migration ledger、H-3 drift repair

Productionの実ユーザーrowは取得・保存していない。metadataと、以下に明示する非機密catalogのみを比較対象にした。

## Production schema inventory

read-only catalog inventoryの集計は次のとおり。

| 区分 | Production |
| --- | ---: |
| `public` tables | 36 |
| `public` columns | 310 |
| constraints | 234 |
| indexes | 152 |
| custom enums | 1 |
| views / materialized views | 0 / 0 |
| functions (`public` / `app_private`) | 59 / 46 |
| app triggers (`public` / `auth`) | 39 |
| managed Storage triggers | 4 |
| RLS-enabled `public` tables | 36 / 36 |
| RLS policies (`public` / `storage.objects`) | 66 / 9 |
| app-role relation / function / column grants | 392 / 121 / 41 |

`public` tables:

```text
ai_observation_jobs, app_admins, app_open_events, archives,
chia_daily_meteor_runs, chia_first_post_welcomes, content_reports, feedbacks,
guide_entries, guide_sections, legal_consents, meteor_tags, notifications,
observations, post_media, post_meteor_tags, post_tags, posts, profile_blocks,
profile_cohorts, profile_frame_ownerships, profile_frames, profile_kinds,
profile_roles, profile_tags, profile_titles, profiles, push_notification_jobs,
push_subscriptions, resonances, signup_open_events, star_letter_archives,
star_letter_resonances, star_letters, titles, user_onboarding_progress
```

custom enumは`public.ai_observation_job_status`（`queued`, `processing`, `succeeded`, `failed`, `cancelled`）。全column/default/generated expression、PK/FK/unique/check、index definition、function body/ACL、trigger definition、grant、RLS/policyは [`production-inventory.sql`](./production-inventory.sql) で再取得できる。[`metadata-fingerprints.sql`](./metadata-fingerprints.sql) は同じmetadataと許可済みcatalogを決定的fingerprintへ集約する。両スクリプトともtransactionをread-onlyに固定し、ユーザーtableのrowを読まない。

許可したcatalog比較は次の4種だけ。

| catalog | Production count | 内容 |
| --- | ---: | --- |
| `profile_frames` | 2 | `chia_guide` active、`opening_memorial_beta` inactive |
| `titles` | 2 | `celestial_guide`、`beta_tester` |
| `guide_sections` | 12 | Village guide構造 |
| `guide_entries` | 67 | Village guide本文 |

## ファイルと適用順

この順序を固定する。各ファイルは`ON_ERROR_STOP`相当で、**承認済みの空Preview専用DB**にだけ適用する。

1. `00_core_schema.sql`
2. `20260616000001_normalize_post_media_constraints.sql`
3. `20260702000001_normalize_text_constraints.sql`
4. `20260719000001_normalize_guide_visibility_function.sql`
5. `20260722143000_update_village_guide_philosophy.sql`
6. `20260722145500_fix_village_philosophy_line_breaks.sql`
7. `20260727173000_guard_onboarding_existing_posts.sql`
8. `20260728174500_add_chia_daily_meteor_runs.sql`
9. `20260803111500_allow_optional_avatar_in_initial_onboarding.sql`
10. `20260804153000_add_causal_data_revisions.sql`
11. `20260804154500_fix_archive_snapshot_ambiguity.sql`
12. `20260805130000_add_onboarding_skip_all.sql`
13. `20260807063919_add_profile_identity_roles_and_beta_cohorts.sql`
14. `20260807103108_add_beta_opening_memorial_frame_catalog.sql`
15. `20260807150000_add_app_open_events.sql`
16. `20260809123000_add_beta_usage_dashboard.sql`
17. `20260809150000_add_signup_open_tracking.sql`
18. `20260809154500_auto_enroll_new_beta_residents.sql`
19. `20260810090000_add_chia_post_notifications.sql`

例（今回実行しない）:

```sh
psql '<EMPTY_PREVIEW_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/preview-baseline/00_core_schema.sql
# 上記リストの残りを同じ接続先へ順番に実行する。
psql '<EMPTY_PREVIEW_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/preview-baseline/production-inventory.sql
```

接続前にproject refが`qskeezefmvnutuzpevbc`であり、`dhfecpymvmursozfgjlr`ではないことを別経路で確認する。現在のPreview-v2を利用する場合は、次段階で既存schemaを破壊せずreconcileするか、明示承認を得て空環境へresetするかを先に決める。

## Production ledger由来DDLの扱い

Production ledgerの`20260807063919_add_profile_identity_roles_and_beta_cohorts`はGitにDDLが存在しなかったため、Production catalog/ledgerからread-onlyで確認したDDLだけを専用ファイルへ復元した。次は意図的に除外した。

- 既存profileの`profile_kinds` backfill
- 特定usernameのAI分類
- founder/admin/guide roleの実アカウント割当
- 実ユーザーの`beta_resident` cohort/serial割当
- `auth.users.created_at`を使う既存ユーザーbackfill

Gitの`20260807102000_add_beta_opening_memorial_frame.sql`も、frame catalogだけを安全に再構成した。Productionの現行catalogに合わせ`opening_memorial_beta.is_active = false`とし、実profileへのownership付与と`active_frame_id`更新は除外した。Gitの`20260807071000_rename_rconnect_to_reconnect.sql`はcomment-onlyで構造差がないためbaselineには重複収録していない。

## 前回不足objectの収録確認

| 不足項目 | baseline |
| --- | --- |
| 5 tables | `app_open_events`, `profile_cohorts`, `profile_kinds`, `profile_roles`, `signup_open_events` |
| profile列 | `profiles.notify_chia_posts boolean not null default true` |
| dashboard RPC | `get_beta_usage_dashboard(date)`, `get_signup_open_dashboard(date)` |
| beta triggers | `ensure_default_profile_kind_after_profile_insert`, `profile_kinds_sync_beta_resident` |
| memorial frame | catalog schema/seedのみ。ユーザーownershipは除外 |
| avatar DELETE | `avatars_delete_own_unreferenced`（core schema内） |
| Chia notification | type constraint、partial unique index、notification/push functions、post trigger |

加えて、Production互換に必要なVillage guide 67 entries、guide visibility RPC、オンボーディング既存投稿guard、`chia_daily_meteor_runs`とclaim/complete RPC、`user_onboarding_progress.skipped_at` / `skipped_from_step`、causal data revision objectsも含む。Village guide更新、既存投稿guard、`chia_daily_meteor_runs`は現行`supabase/schema.sql`から欠落していたため、既存のreview済みGit migrationを明示的に収録した。`post_media`のsize check、profile/post tag・星文の非空check、guide visibility RPCはProduction catalogへ正規化する。

## Preview専用synthetic data

baseline適用後に別手順で作る必要がある。Production値は流用しない。

1. Preview Authで専用テストユーザーを新規作成し、その新しいIDでsynthetic `profiles`を作る。
2. Chia相当のsynthetic profileを作り、`username = 'chia_hoshizora'`、`profile_kinds.kind = 'ai_resident'`、必要なguide role/title/frameを新しいIDへ割り当てる。
3. operator/adminはPreview専用IDだけを`app_admins` / `profile_roles`へ登録する。
4. human beta resident、memorial ownership、active frameはPreview専用profileに限り明示的に作る。catalogがinactiveの間は公開表示されない。

現行コードの`src/contentReports.js`にはProduction固有のChia UUIDが残っている。baselineにはコピーしていないため、次段階でPreview-safeな設定へ分離するまで、synthetic Chiaに関するcontent-report除外判定はProductionと一致しない。これはschemaではなく未解決のアプリ設定残差であり、このPRでは変更しない。

## Storage再現

通常のschema dumpではmanaged `storage` schemaとbucket rowを完全再現できないため、bucket catalog upsertと`storage.objects` policiesを`00_core_schema.sql`へ明示している。Storage object自体は作らない。

| bucket | public | limit | MIME |
| --- | --- | ---: | --- |
| `avatars` | yes | 5 MiB | `image/jpeg`, `image/png`, `image/webp` |
| `meteor-media` | no | 8 MiB | `image/jpeg`, `image/png`, `image/webp` |
| `meteor-video` | no | 100 MiB | `video/mp4`, `video/quicktime`, `video/webm` |

policies:

- `avatars`: public `SELECT`、authenticated own-folder `INSERT`、owner + own-folder + profile未参照の`DELETE`
- `meteor-media`: authenticated own-folder `INSERT` / `DELETE`、visible-post条件の`SELECT`
- `meteor-video`: authenticated own-folder `INSERT` / `DELETE`、visible-post条件の`SELECT`

適用後はStorage APIでもbucketのpublic/private、limit、MIMEを再確認する。Supabase公式の[Storage access control](https://supabase.com/docs/guides/storage/security/access-control)も参照。

## Auth設定（DDL外）

Auth userやcredentialはbaselineに含めない。DashboardのAuthentication設定で次を手動設定する。

1. **Site URL**: Production URLを流用せず、承認済みの安定したPreview専用URLを設定する。現時点ではURL未確定のため推測入力しない。
2. **Redirect URLs**: Netlify Deploy Preview用に`https://**--hoshizora-village.netlify.app/**`を追加する。必要ならlocal専用に`http://localhost:5173/**`も追加する。
3. **Email provider**: email signupを有効にする。
4. **Confirm email**: 有効にし、signup確認とpassword recoveryのreturn先をPreview URLで実機確認する。

wildcardはSupabase公式の[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)にあるNetlify Previewパターンに従う。email設定は[Password-based Auth](https://supabase.com/docs/guides/auth/passwords)を参照する。

## AI / scheduled / Push safety

PreviewでProduction副作用を起こさないため、次をunset/empty（boolean gateは`false`またはunset）に保つ。

| env | Preview方針 |
| --- | --- |
| `AI_OBSERVATION_ENABLED` | `false` / unset |
| `CHIA_DAILY_METEOR_ENABLED` | `false` / unset |
| `AI_HOSHIZORA_CHIA_PROFILE_ID` | unset。Production ID禁止 |
| `CHIA_DAILY_METEOR_PROFILE_ID` | unset。Production ID禁止 |
| `AI_OPERATOR_USER_IDS` | unset。Production ID禁止 |
| `SUPABASE_SERVICE_ROLE_KEY` | unset |
| `GEMINI_API_KEY` | unset |
| `AI_WORKER_SHARED_SECRET` | unset |
| `PUSH_VAPID_PRIVATE_KEY` | unset |
| `PUSH_VAPID_PUBLIC_KEY` | unset |
| `PUSH_VAPID_SUBJECT` | unset |

scheduled AI/Chia postingはboolean gateで止め、Push dispatchはservice-role/VAPID secretを与えず送信不能にする。強いsecretはsynthetic smoke testが別途承認されるまで空のままにする。今回Netlify envは変更しない。

## 2026-08-11 検証結果

### 空DB適用とmetadata比較

ローカルの一時PGlite (PostgreSQL 17互換) に、Supabaseが管理するrole、`auth` / `storage` schema、`pgcrypto`、Realtime publicationの最小stubだけを先に作り、上記19ファイルを順番どおり`ON_ERROR_STOP`相当で適用した。

- 19 / 19 SQL file: 適用成功
- `production-inventory.sql`: 構文・実行成功
- `metadata-fingerprints.sql`: 構文・実行成功
- 前回不足object 12チェック: 12 / 12成功
- object count: tables 36、columns 310、constraints 234、indexes 152、functions 105、app triggers 39、public policies 66、Storage policies 9、RLS enabled 36
- duplicate object: clean DBへの順次適用で衝突なし。後続migrationの`CREATE OR REPLACE` / constraint正規化は意図した最終定義で、最終count/fingerprintもProductionと一致

Productionと空DB baselineのread-only metadata fingerprintは全categoryで一致した。

| category | count | fingerprint |
| --- | ---: | --- |
| buckets | 3 | `b97b4a61fc5626a2d7202c9db2f0371e` |
| column grants | 41 | `fbff28e73cd9b2492a06fe59cf80fb53` |
| columns | 310 | `29e63a41384680bbb7e81872bdcbd45b` |
| constraints | 234 | `5d02daec2554b157fe7d2f300740fdd1` |
| enum labels | 5 | `08c45d6b2c72748be6bc31b1c21d7b6c` |
| function grants | 121 | `d64239426bf907402fa4f3f6291e6d45` |
| functions | 105 | `39494d1814cd79478a0715a80928f2a7` |
| guide entries catalog | 67 | `e02c726f84ca26ca66a10cd249428075` |
| guide sections catalog | 12 | `ac2f0d3cd4e7fa28752807cfc26a11d7` |
| indexes | 152 | `0d8dca2da3354d4556f6a04d4c117268` |
| policies | 75 | `2e38a8d8fe8f92470d90edc4ef09d80d` |
| profile frames catalog | 2 | `db9b4394d16ad7d1b3d2ec9f9ad3f932` |
| relation grants | 392 | `14e5839eabe5aa1ec64baaf9201f0249` |
| tables | 36 | `4af890fffae4db63d6b14b1e47857a07` |
| titles catalog | 2 | `1dc17052811dd08750f41f55ef071488` |
| triggers | 39 | `c494853498b6b0336ea6fa8a7179c0b0` |
| views | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

function fingerprintはcomment、whitespace、冗長な括弧だけを正規化しており、signature、result、volatility、`SECURITY DEFINER`、実行本体を比較する。managed Storage trigger 4件はSupabase platform所有のためbaselineでは作らず、比較表のapp trigger 39件にも含めない。

この検証はSQLのdependency/orderとapp所有catalogを確認するもので、Supabase Auth/Storage/Realtime service全体のintegration testではない。ローカルにDocker、Supabase CLI、system PostgreSQLがなく、有料remote resourceは新規作成していない。次段階では承認済みのclean Supabase targetで同じinventory/fingerprintを再実行する。

### security / privacy scan

- non-zero UUID literal: 0件
- all-zero UUID sentinel: 1件（identityではないfallback値）
- email-like literal: 0件
- JWT / PEM private key / Supabase key形式: 0件
- secret値らしいassignment: 0件
- `auth.users`へのDML: 0件
- `storage.objects`への`INSERT`: 0件
- user/event table向けtop-level seed: 0件
- user/event table向け`INSERT`文字列: 15件。すべてRPC/trigger関数本体であり、baseline適用時には実行されない
- project ref: READMEの対象・誤適用防止表示に4件。project ref自体はsecretではなく、credentialは含まない

### repository checks

| check | result |
| --- | --- |
| `git diff --check` | PASS |
| `npm test` | PASS (539 / 539) |
| `npm run build` | PASS（既存のlarge chunk warningのみ） |
| `npx playwright test --reporter=line` | PASS (44 / 44) |

Playwright runner/browserは検証用に`--no-save --no-package-lock`で一時導入し、package manifestやlockfileへ追加していない。

## 比較残差と適用gate

現在のPreview-v2はProductionに対し、少なくとも5 tables、`profiles.notify_chia_posts`、dashboard RPC、beta triggers、memorial frame、avatar DELETE policy、Chia notification schemaが不足する。baselineはこれらを全て構造として含む。

意図的に残る差は次のとおり。

- Auth/Storageのmanaged内部schema、Auth URL/provider設定
- Production migration ledgerとH-3 drift
- 実ユーザー、イベント、投稿、AI/Push、Storage object等の全データ
- Production profileに紐づくrole/cohort/title/frame ownership
- Preview専用synthetic identityとoperator設定
- 上記Production固有Chia UUIDを持つアプリ設定

したがって、baselineはレビュー用成果物としては完了しても、**現在の非空Preview-v2へそのまま適用可とは判定しない**。次段階では、対象projectの再確認、backup不要なsynthetic-only状態の確認、clean resetまたは差分reconcileの承認、Auth/Storage設定、secret-less smoke test、rollback手順を先に確定する。
