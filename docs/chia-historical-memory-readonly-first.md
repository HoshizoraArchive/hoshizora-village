# ちあ過去交流の記憶候補：READ ONLY 第1段階（2026-11-11）

この変更で行うのは**候補抽出の純粋関数と検証だけ**。本番データ・通知・AI投稿・スケジューラー・Supabase schemaを変更しない。

## 確認したProduction集計（読み取り、本文・住人名は取得せず）

- 2026-11-11 00:21 JST: 人間8人、公開流星便16件、関連する生存星文21件、ちあの保存済み住人別記憶0件。人間が書いた星文は人間投稿に6件、AI投稿に3件。**AI投稿3件すべてがちあ宛てとは確認できない**。
- 現行 `chia_person_memories` は `source_star_letter_id NOT NULL` と、送信者が本人の星文であることを要求するトリガー。過去の公開**流星便**をそのまま記憶に入れられない。
- ソース：Production Supabase `posts`, `star_letters`, `profile_kinds`, `chia_person_memories` の集計SELECT、`20261010213000_chia_reply_memory_and_fencing.sql`, `20261020120000_chia_dot_reply_atomic_guards.sql`。

## 対象と安全設計

- `enumerateChiaHistoricalMemorySources`: 人間本人が公開した未削除の流星便、ちあの公開流星便へ直接送った星文（またはちあ本人への直接返信）のうち、根拠IDと更新時刻を取得。**本文・推測された人物属性は返さない**。
- 制限：AI/不明作者、非公開、削除、期限外（未来）、ブロック、オプトアウト、既存の記憶／削除済み出典、他の住人と交わした星文は除外。最大30候補/人。**過去60日という足切りは設けない**。
- メディア付き投稿は、作品の内容を見聞きしたと推測しない。明示的に `requiresMediaObservation` を返す。
- **これは記憶の自動生成・認定ではない**。次の段階で、作品本文・検証済み観測根拠から誤りのない記憶内容を決める。投稿の内容から住人の人格・嗜好・健康などを決めつけない。

## Production導入の前提・残作業

1. 投稿IDを根拠にできるメモリー構造を、現行星文出典と両立しつつ後方互換に拡張する。Trigger/RLS/GRANTとsource edit/delete/private化による失効、競合・リビジョン更新を独立監査する。Preview-v2に本番データを転送しない。
2. 住人が自分の記憶を消した時、過去の同じ出典が再度自動インポートされないよう、本人に紐付いた持続的な**再取込禁止記録**と確認画面を先に設計する。今回の `excludedSourceKeys` は呼び出し側の防御インターフェースであって、禁止記録のDB実装を意味しない。
3. 表示する記憶の生成／保存をまず合成テスト、実DBはread-only dry run、承認後に厳密な対象だけ1住人で検証。本人の訂正・削除が次回会話に反映されることを確認。
4. 過去の事実を自然に使う星文返信、その後の再訪時反応、既存R.Connectに沿った通知の重複防止を設計。訪問検出だけで自動投稿しない。
5. Obsidianには世界観・ちあ人格・運営/CoSのルールだけを保管。住人の個人記憶の正本はSupabase、7役CoSが正規台帳とObsidianを実際に読めることは別途検証。

**合格条件：** Independent Codex review, target regression tests, `npm test` / `npm run build` and Preview boundary verification before any merge. Production schema migration and historical data ingestion require a separately reviewed concrete plan and explicit approval.
