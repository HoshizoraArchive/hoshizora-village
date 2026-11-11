# ちあ｜過去の流星便を覚える・再訪を認識する（段階2、レビュー待ち）

作成日: 2026-11-11／対象: `feat/chia-memory-source-and-revisit-20261111`

## 目的

第1段階の読み取り専用の候補抽出（PR #328）の次に、公開済みの人間住人の流星便を、出典を偽装せずちあの既存の住人別記憶へ登録できる**DB基礎**を用意する。再訪した住人を見分ける純粋な判定処理も用意する。実際のデータ取り込み、再訪時の星文生成、7役の本番接続は**含まない**。

## DB変更：星文と流星便の出典を分離

`20261110155216_chia_historical_post_memory_sources.sql`

- `chia_person_memories` に `source_post_id` を追加。既存 `source_star_letter_id` と排他的にし、既存の星文由来記憶を維持。
- 流星便から保存する記憶は、**作者本人の未削除・現在公開中の投稿の本文から切り取った500文字以内の実際の引用だけ**に限る。`memory_key` は元投稿IDと結合。出典IDと更新時刻が一致することをDB側で再検証。
- 投稿本文が編集・非公開化・削除・作者変更された時点で、その投稿の記憶を無効化。元の星文由来記憶の無効化も維持。
- 本人が記憶を削除した場合、公開由来か星文由来かを区別して `chia_memory_source_exclusions` に除外履歴を残す。除外履歴は、ユーザーがその後来なくなっても同一出典が自動再登録されないよう保持。アカウント削除時にはFKで消去。
- 除外履歴のSELECTは本人のみ。他人の記憶へのアクセスは元のRLSで禁止。新しい公開API・AI送信経路は設けない。
- `chia_person_memory_partitions.revision` の既存トリガーは維持され、所有者による記憶変更が進行中のCoS返信へ反映される。

**注:** 元投稿ID以外の人物像・趣味・経歴を推測して自動記憶する仕組みではない。既存の「ちあの記憶管理」画面で住人が削除・内容編集可能。レビュー前に自動INSERTを起こすコードは追加しない。

## 安全な取込準備

- `prepareReviewedHistoricalPostMemory` は、候補の人間UUID・元投稿ID・更新日時が一致し、引用文字列が**現在の本文の部分文字列そのもの**である場合にのみ、INSERT用の値を返す**書き込みをしない**純粋関数。
- 投稿に音楽・画像・動画のメディアが付く場合、投稿文の引用はできても、メディアを実際に観測したという断定はしない。
- `historical_post_...` というキーで重複防止し、引用内容が編集されたら再審査が必要。実際の候補抽出でのブロック・除外・本人の編集削除チェックを別途維持。

## 再訪の判定

- `assessChiaReturnVisit` は本人の `app_open_events.opened_at` を使用する純粋関数。直近7日以内の入村記録に、直前から14日以上の空白があるときだけ再訪候補とする。
- Production の `app_open_events` は、`app_private.enforce_app_open_create_rate()` のBEFORE INSERTトリガーが認証ユーザーの `user_id` と `opened_at` を強制的に設定することを読み取り専用で確認済み。ユーザー指定の `client_opened_at` は根拠にしない。
- **まだUIやちあの投稿送信にはつなげていない。** 再訪したことを理由に本人の意図なく通知・星文を送らない。今後、本人が新たに交流を開始した場面で、過去の公開投稿と星文の根拠を照合した上で人格の自然な反応に使う。
- 本番観測(2026-11-11): `app_open_events` 累計371件、11アカウント、直近7日17件。これは「再訪者が17人いる」という意味ではない。

## CoS・Obsidian

- Mac Obsidian 正本資料: `~/Library/Application Support/GapukunMemory/vault/notes/星空Village_ちあ過去交流記憶と再訪体験_実装計画_20261106.md`
- **住人別記憶の正本はSupabase**。個人の会話内容を Obsidian の運営知識ノートに複製しない。
- `cos_to_dots.help(memory_search/memory_write)` は取得できたが、`memory_search`、`team_status` は `COS_FOUNDATION_EXACT_CALLER_REQUIRED` の権限拒否。これはCoS 7役の本番実読込成功を意味しない。認証や既存ゲートを迂回しない。

## 実施済みの検証

- PGlite隔離PostgreSQL: 現行のベース＋記憶/原子性/ソース更新ガード各migrationに今回のmigrationを適用。昔の星文から記憶できること、公開流星便の引用、変更/非公開化による無効化、所有者削除後の再登録禁止、本人・他人のRLS、記憶revisionを確認。**合成UUID/合成テキストのみ・ネット接続なし**。
- 専用node:testは候補抽出・引用準備・再訪判定を検証。既存の`npm test`と`npm run build`も実行する。
- PGlite再実行例: `CHIA_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/chia-historical-post-memory-pglite-harness.mjs`

## 依存する次工程・GOゲート

1. **Codex独立READ ONLYレビュー（このPRの正確なSHA）**。SQLの競合・ロック順序、所有者削除後の再取込防止、RLS/権限/スキーマ再現性を確認。Blocking指摘なら本体は修正し再レビュー。
2. 過去の公開投稿のうち内容を引用に使えるものを、実データで**read-only dry-run**。住人の権利・削除/訂正・メディア観測有無・引用の品質を点検。
3. Productionへのschema変更と記憶の一括投入は別途明示承認。実施前に対象件数、差分、復旧方法、Preview環境と本番が混ざらないことを証明。
4. 1住人分の本番投入確認→既存記憶画面で本人の表示・訂正・削除と反映を確認→段階的取り込み。
5. 同じ記憶を再訪時のちあの既存星文返信に渡し、繰り返し挨拶しないための送達記録・クールダウンを設計し実機試験。単なる来訪だけで投稿/通知しない。
6. CoS 7役が正式なCallerとして認可された後、Obsidian知識の正規読込と業務知識の範囲を監査。7役とちあの住人別私的記憶を混合しない。

このPRは第2段階の安全基盤を準備するもので、まだ公開中のちあが昔の投稿を認識できるようになったとは評価しない。

## 2026-11-11 15:30 JST｜独立監査HOLD #1 を踏まえた修正（再監査待ち）

- 対象：前回の監査Dot `05466bff-b917-4ac8-b0f9-87e5ef920457` が PR #329 head `28fe3f2` に対して **P1 2件、P2 3件、HOLD** を返した。
- **P1-a 解消案**：`auth.uid()` ベースの DELETE トリガーから tombstone を作る方法を廃止。投稿・星文の編集/削除/非公開化時の自動失効は除外履歴を作らない。明示的なユーザー削除だけ、Owner認可済み RPC `delete_own_chia_memory` で `exclusions` と `DELETE` を同一DBトランザクションにする。認証ユーザーからの直接 DELETE 権限は revoke。画面 `ChiaMemorySettings.jsx` は RPC に変更。
- **P1-b 解消案**：入庫前と明示的な削除RPCの両方で、ちあ・本人・source type・source IDを元にした同一 advisory transaction lock を取得。Deleteはメモリー行ロックの前に取得し、insertはユニークキー競合の前に取得。**同一星文に別キーの記憶を記録する場合でも**順序を揃える。
- P2：再訪判定 `assessChiaReturnVisit` は、本人ID・時刻範囲・全記録であることを申告した `verifiedWindow` がない場合に fail closed。再訪には全履歴から該当範囲を網羅したサーバー検索が前提。旧migration件数のピンを、90件・新latest SHAの固定検証に戻した。
- PGlite合成DBで、旧星文記憶、Owner RPCによる明示的忘却、直DELETE拒否、本人認証下での投稿編集（誤tombstone禁止）、非公開化、物理削除、作者変更、星文本文変更、別memory_keyからの再取り込み拒否、RLS、revisionを試験。
- **未実施**：実際の並列二トランザクション競合試験（PGlite単一接続では証明できない）。新コミットの独立監査GOまでは本番反映しない。

## 2026-11-11 15:35 JST｜独立再監査・追加入庫競合レビューの指摘対応（ローカル検証中）

- レビュアーの途中経過で、新たなP1候補：同一星文から2件の記憶が存在する時にownerが1件削除しても他の記憶が残る、複数出典の同時INSERTがsource advisory lock→person profile lock順序でdeadlockしうる。
- Owner RPCは選んだ記憶の**出典全体**を削除し、同じ星文の全memory_keyが消える。UI確認文も「この流星便・星文に由来する記憶を、まとめて削除」に変更。
- INSERT guardは、全候補に共通する **person profile `FOR NO KEY UPDATE` を先に取得**し、その後各source advisory lockを取得する順序へ。Owner RPCではsource advisory→memory rowの順序を保持。Profile KEY SHARE（exclusion FK）との互換性を維持し、異なるsource順のmulti-row insertが互いにsource lockを保持してからperson lockを待つ循環を解消する。
- 合成PGliteで同じ星文の別memory_key 2件→ownerの1件忘却で両件消失・再取込両キー拒否を検証。**別セッションの同時INSERT/DELETEによる実競合試験は未実施**。
- 旧HEAD `6afcf11` への監査結果は旧コミットだけに対するもの。変更後の新SHAについて独立レビューを取り直す。

## 2026-11-11｜サービス権限に関する追加検証

- `guard_chia_person_memory` は **SECURITY INVOKER** のため、`service_role`から記憶行をINSERTすると、guard内で呼び出す補助関数にもEXECUTE権限が必要。`chia_memory_source_lock_key(uuid,uuid,text,uuid)` のEXECUTEは `service_role` のみに許可し、`authenticated` と `anon` には付けない。
- Production の既存ACLを SELECT で照合：`service_role` はprofiles SELECT/UPDATE、posts/星文 SELECT/UPDATE、profile_kinds/profile_blocks SELECT、chia_person_memories INSERTを保持。
- オフラインPGlite fixtureでも `SET ROLE service_role` で本物の証拠付きINSERTを実行して成功。`authenticated`にはロック関数EXECUTE権限なしのまま。権限の抜けを合成テストで再現可能にした。
- 投稿の編集に伴う自動失効と、ownerが明示的に記憶を忘れるRPCの副作用は独立して保持。

## 2026-11-11｜競合・アカウント削除の最後の事前整備（監査待ち）

- `delete_own_chia_memory` RPC: source advisory lockの後、メモリー行をロックする**前**に、ちあ／本人の `public.profiles` 行にID順 `FOR KEY SHARE` を取得する。Profile DELETE のFOR UPDATE→FK cascade DELETEと、owner忘却RPCの memory row→profile FKの逆順で発生する循環を防止する。投稿の自動無効化は除外履歴を残さない。
- INSERT guard: 同じ人のprofile FOR NO KEY UPDATEを最初に取得してからsource advisoryを取る。2つの出典を一回の SQL INSERT で導入する合成PGliteケースを追加。**別の本物のDB接続2セッションでのrace実測は未実施**なので、追加の独立レビューによって静的ロック順序を点検する。
- SQL補助関数 `chia_memory_source_lock_key` の `service_role EXECUTE` を付与。PGliteで `SET ROLE service_role` の1 statement・2 source INSERT成功を確認。Browser authenticatedからの EXECUTE は認めない。

## 2026-11-12 02時台｜PostgreSQL 17実並列試験と残る監査

- 独立監査（HEAD `9e0b24d`）の結果はHOLD：P1①メモリINSERT時の `source FOR SHARE → profile FOR NO KEY UPDATE` の逆順とprofile DELETE間で死活停止しうる、P1②元投稿の失効DELETEがowner RPCの事前読込後・行ロック前に入ると明示的な忘却が消える。
- 修正：memory INSERT guardは**本人プロフィール行を最初に `FOR NO KEY UPDATE`** でロックし、出典（公開投稿／星文）を `FOR SHARE` で検証し、その後source advisory lock。owner RPCは、事前の本人所属メモリの読み取りからsourceを確定し、source lock＋profile KEY SHAREの後、元の記憶行が編集・自動失効済みでも**source exclusionを確実に記録**。存在しないアカウントは`account_gone`。明示的本人削除と自動失効の区別は保持。
- 真の PostgreSQL 17.10 Mac localhost限定の一時テストDB（`embedded-postgres@17.10.0-beta.17`）を実行。本物の5接続・合成UUIDのみ。①sourceの非公開化（未コミット）の最中にowner忘却RPC→保存禁止が生き残る、②owner忘却（未コミット）の最中にservice_role再取込→ownerの忘却を尊重、③同じ人の2出典が異なる挿入順で並列取込→person行で直列化しdeadlockなし、④アカウント削除とowner忘却の競合→両トランザクション完結、を確認。新規取込された引用が実際の`public.snapshot_chia_person_memory()`で返ることも確認。テスト中のDBは**本番とは全く別のMacのlocalhostの合成クラスタ**、停止後に消去。
- 再実行コマンド（Macのみ、プロジェクト外テストツール）：`npm install --prefix /tmp/chia-embedded-postgres-20261112 --no-save --no-audit --no-fund embedded-postgres@17.10.0-beta.17` / `CHIA_EMBEDDED_PG_MODULE=/tmp/chia-embedded-postgres-20261112/node_modules/embedded-postgres/dist/index.js node scripts/chia-memory-real-postgres-races.mjs`。
- 既存PGlite/Node suite/Build再検証・新しいexact SHAでの**Codex独立READ ONLY監査**とProduction migration適用判断は別ゲート。
