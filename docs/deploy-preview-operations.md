# Deploy Preview 運用ルール

星空VillageのDeploy Previewは、Pull Requestの未マージコードを、Productionから分離されたPreview-v2 Supabase上で安全に確認するために使います。

## 基本原則

Deploy Previewの標準構成は次の通りです。

- フロントエンド: 対象Pull Requestの未マージコード
- Netlify Functions: 対象Pull Requestの未マージコード
- Supabaseのブラウザ接続先: Preview-v2 (`qskeezefmvnutuzpevbc`)
- SupabaseのFunctions接続先: Preview-v2 (`qskeezefmvnutuzpevbc`)
- ブラウザ認証: synthetic Preview identityのみ
- ブラウザから参照するデータ: Preview専用の廃棄可能なテストデータのみ
- サーバー側秘密権限: Deploy PreviewにはProductionの強い秘密値を渡さない

つまり、Deploy Previewは**Productionのアカウント・データ・強い秘密権限から分離して、PR差分のフロントエンドとFunctionsを確認する環境**として扱います。

## 重要: 未マージFunctionsへProduction秘密権限を渡さない

Deploy PreviewではPR版のNetlify Functionsもデプロイされます。そのため、未マージコードへRLSを迂回できる権限や外部サービスの秘密鍵を渡してはいけません。

Deploy Previewでは、少なくとも次の秘密値を空または未設定にします。

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AI_WORKER_SHARED_SECRET`
- `PUSH_VAPID_PRIVATE_KEY`

一方、ブラウザとFunctionsからPreview-v2 Supabaseへ接続するため、次の公開接続情報はDeploy Preview専用値を使用します。

- `VITE_SUPABASE_URL=https://qskeezefmvnutuzpevbc.supabase.co`
- `SUPABASE_URL=https://qskeezefmvnutuzpevbc.supabase.co`
- `VITE_SUPABASE_ANON_KEY`（Preview-v2の有効なpublishable key）

秘密値を必要とするNetlify Functionsは、Deploy Previewでは実行不能または安全に失敗することを許容します。Preview確認のためにProduction秘密値を一時的にコピーしてはいけません。

Productionの秘密値をDeploy Previewへ再追加する変更は、通常の環境調整ではなく**セキュリティ境界の変更**として扱い、明示的な確認なしに行いません。

## やらないこと

通常のDeploy Preview確認のために、次のことはしません。

- Productionのservice roleや秘密鍵をDeploy Previewへ渡す
- Preview確認の都合だけで秘密値を一時的に復活させる
- Preview-v2へProductionのアカウントや実データをコピーする
- Preview用にProduction固有のprofile/operator UUIDを架空UUIDへ置き換えて経路を無理に有効化する
- 古いseedデータをProduction相当として扱う

Production Supabaseへ接続する例外運用は認めません。Production相当の検証が必要な場合も、Preview-v2へsanitized baselineを適用し、synthetic Preview dataだけを使います。

## Preview上のブラウザ操作はPreview-v2だけを変更する

Deploy PreviewのブラウザはPreview-v2 Supabaseへ公開キーで接続するため、RLS/RPCで許可された書き込み操作はPreview-v2だけへ反映されます。

例:

- 流星便の投稿・編集・削除
- 共鳴
- 星文
- Archive
- プロフィール変更
- ブラックホール登録・解除
- 観測局への通報
- 通知設定などの保存

テストデータはsynthetic identityに限定し、Production由来の個人データを入力・コピーしません。Preview-v2のテストデータはclean再構築時に廃棄される前提で扱います。

なお、これは「PreviewのFunctionsがProduction service roleを持つ」ことを意味しません。ブラウザの通常ユーザー権限と、サーバー側の強い秘密権限は分離します。

## E2Eテストとの役割分担

GitHub ActionsのPlaywright smoke testはSupabase通信をモックし、本番データを書き換えません。

- 自動E2E: 画面起動、主要ナビ、基本レイアウトなどを安全に継続確認
- Deploy Preview: Preview-v2の実schema/Authとsynthetic dataを使うPR差分の最終確認。ただしProduction秘密権限は持たない
- 実機確認: iPhone / Android / PC固有の表示・操作問題を確認

この3つを同じ目的として混同しないでください。

## Netlify環境変数

NetlifyのDeploy Preview contextでは、`VITE_SUPABASE_URL` と `SUPABASE_URL` をPreview-v2へ向け、両者を一致させます。prebuild guardは未設定、不一致、Production ref、Preview-v2以外のSupabase hostを拒否します。Production contextはProduction projectを引き続き使用します。

一方で、Production専用のservice role、AI APIキー、worker secret、Push private keyなどはDeploy Preview contextで空または未設定にします。

`AI_OBSERVATION_ENABLED=false` を明示し、`CHIA_DAILY_METEOR_ENABLED` はProduction contextだけで有効にします。Production固有のprofile/operator UUIDが共有contextに残っていても、これらの経路を無効のままにしてPreviewでは使用しません。

**秘密値そのものはGitHub、README、PR本文、ログへ記載しません。**

ログインできない、プロフィールがないなどの症状が出た場合は、Preview-v2用URL / publishable key、Auth redirect allowlist、synthetic identityの状態を確認します。Production接続や秘密値の復活で解決しません。

Netlifyの環境変数を変更する場合は、ProductionとDeploy Previewのcontextを明確に分け、Production値をPreviewへコピーしないでください。

## DB migrationを含むPull Request

Deploy Previewのコードは未マージで、ブラウザとFunctionsの接続先DBはPreview-v2です。

そのため、PRがまだPreview-v2へ存在しないDB schema / RPC / columnを必須とする場合、その機能はPreviewだけでは完全動作しません。

この場合は次のどちらかにします。

1. Preview-v2へ対象PRのsanitized baseline / migrationを適用してから確認する
2. migration未適用でも既存機能が壊れないfail-soft状態でUIだけ確認する

**Deploy Previewを動かすためだけにProduction migrationを無断適用しません。**

migrationをProductionへ先行適用する場合は、既存Productionコードとの後方互換性、失敗時の戻し方、適用順序を確認します。

Production migrationの適用状態とPreview-v2の適用状態は別々に管理し、Preview検証を理由にProductionへ先行適用しません。

## PR確認チェック

Deploy Previewを使うPRでは、必要に応じて以下を確認します。

1. Netlify Deploy PreviewがReadyになっている
2. bundleとFunctionsがPreview-v2だけを参照している
3. synthetic Preview identityで必要な認証導線を確認できる
4. PR差分のUI / 挙動だけが変わっている
5. Deploy PreviewにProductionのservice roleや秘密鍵が渡っていない
6. Production Supabaseへ接続・書き込みしていない
7. DB差分がある場合、Preview-v2への適用状態を明確にする
8. 自動E2Eと実機確認の結果を必要に応じて確認する

## Production deployとの違い

- Deploy Preview: PRの未マージfrontend / Functions + Preview-v2 Supabase + synthetic data + Production秘密権限なし
- Production: `main`へマージ済みのfrontend / Functions + Production Supabase + Production用サーバー秘密権限

Deploy PreviewがReadyでも、Productionフロントエンドへ反映されたことにはなりません。

マージ後に本番反映を確認する場合は、Netlify Production deployが対象の`main`コミットを正常にデプロイしたことを別途確認します。

## 変更時のルール

この運用を変更する場合は、単なる環境変数の差し替えとして扱わず、次を明確にします。

- なぜ変更するのか
- Productionとのデータ一致をどう保つか
- 未マージFunctionsへ渡る権限が増えないか
- 認証・投稿・通知・管理機能への影響
- Preview上の書き込みがどこへ保存されるか
- Production秘密値がPreviewへ流入しないか

特にSupabase projectや秘密値のcontextを変更する場合は、Previewのセキュリティ境界そのものが変わるため、意図を確認せず変更しません。
