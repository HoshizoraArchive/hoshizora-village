# Deploy Preview 運用ルール

星空VillageのDeploy Previewは、Pull Requestの未マージコードを、本番と同じアカウント・プロフィール・投稿・現在状態の上で確認するために使います。

## 基本原則

Deploy Previewの標準構成は次の通りです。

- フロントエンド: 対象Pull Requestの未マージコード
- Netlify Functions: 対象Pull Requestの未マージコード
- Supabaseのブラウザ接続先: Productionと同じSupabase project
- ブラウザ認証: Productionと同じアカウント
- ブラウザから参照するデータ: Productionと同じプロフィール・流星便・共鳴・星文・Archive・通知など
- サーバー側秘密権限: Deploy PreviewにはProductionの強い秘密値を渡さない

つまり、Deploy Previewは「別のテストSNS」ではなく、**Productionの公開クライアント権限で実データを参照しながら、PR差分のフロントエンドとFunctionsを確認する環境**として扱います。

## 重要: 未マージFunctionsへProduction秘密権限を渡さない

Deploy PreviewではPR版のNetlify Functionsもデプロイされます。そのため、未マージコードへRLSを迂回できる権限や外部サービスの秘密鍵を渡してはいけません。

Deploy Previewでは、少なくとも次の秘密値を空または未設定にします。

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AI_WORKER_SHARED_SECRET`
- `PUSH_VAPID_PRIVATE_KEY`

一方、ブラウザからProduction Supabaseへ通常のRLS付きアクセスを行うため、次の公開接続情報はDeploy PreviewでもProductionと同じ値を使用できます。

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`（publishable key）
- 必要に応じた公開用途のSupabase URL

秘密値を必要とするNetlify Functionsは、Deploy Previewでは実行不能または安全に失敗することを許容します。Preview確認のためにProduction秘密値を一時的にコピーしてはいけません。

Productionの秘密値をDeploy Previewへ再追加する変更は、通常の環境調整ではなく**セキュリティ境界の変更**として扱い、明示的な確認なしに行いません。

## やらないこと

通常のDeploy Preview確認のために、次のことはしません。

- Productionのservice roleや秘密鍵をDeploy Previewへ渡す
- Preview確認の都合だけで秘密値を一時的に復活させる
- Productionと異なるデータ環境へ無言で切り替える
- ダミーアカウントだけのPreview DBを標準環境として扱う
- 古いseedデータをProduction相当として扱う

本番と異なるSupabase projectや独立データセットが必要な検証は、Deploy Previewの標準運用とは分けて明示的に行います。

## Preview上のブラウザ操作は本番データを変更する

Deploy PreviewのブラウザはProduction Supabaseへ公開キーで接続するため、RLS/RPCで許可された書き込み操作は本番へ反映されます。

例:

- 流星便の投稿・編集・削除
- 共鳴
- 星文
- Archive
- プロフィール変更
- ブラックホール登録・解除
- 観測局への通報
- 通知設定などの保存

そのため、UI差分の目視確認では**読み取り中心・非破壊操作を優先**します。

本番データを変更するテストを行う場合は、「Previewだから安全」と考えず、Production上で同じ操作をする場合と同じ扱いにしてください。

なお、これは「PreviewのFunctionsがProduction service roleを持つ」ことを意味しません。ブラウザの通常ユーザー権限と、サーバー側の強い秘密権限は分離します。

## E2Eテストとの役割分担

GitHub ActionsのPlaywright smoke testはSupabase通信をモックし、本番データを書き換えません。

- 自動E2E: 画面起動、主要ナビ、基本レイアウトなどを安全に継続確認
- Deploy Preview: 実データ・実認証を含むPR差分の最終確認。ただしProduction秘密権限は持たない
- 実機確認: iPhone / Android / PC固有の表示・操作問題を確認

この3つを同じ目的として混同しないでください。

## Netlify環境変数

NetlifyのDeploy Preview contextでは、ブラウザ用Supabase接続先はProductionと同じになるよう維持します。

一方で、Production専用のservice role、AI APIキー、worker secret、Push private keyなどはDeploy Preview contextで空または未設定にします。

**秘密値そのものはGitHub、README、PR本文、ログへ記載しません。**

ログインできない、プロフィールが違う、投稿が古いなど「本番と状態が一致しない」症状が出た場合は、まずブラウザ用のSupabase URL / publishable keyを確認します。秘密値を復活させることで解決しません。

Netlifyの環境変数を変更する場合は、ProductionとDeploy Previewのcontextを明確に分け、Production値をPreviewへコピーしないでください。

## DB migrationを含むPull Request

Deploy Previewのコードは未マージですが、ブラウザ接続先DBはProductionです。

そのため、PRがまだProductionへ存在しないDB schema / RPC / columnを必須とする場合、その機能はPreviewだけでは完全動作しません。

この場合は次のどちらかにします。

1. migration未適用でも既存機能が壊れないfail-soft状態でUIだけ確認する
2. 本番DBへのmigration適用が明示的に承認された後で、Production Supabaseへmigrationを適用して確認する

**Deploy Previewを動かすためだけにProduction migrationを無断適用しません。**

migrationをProductionへ先行適用する場合は、既存Productionコードとの後方互換性、失敗時の戻し方、適用順序を確認します。

また、別Preview Supabaseを標準接続先へ戻すことでこの問題を黙って回避しません。

## PR確認チェック

Deploy Previewを使うPRでは、必要に応じて以下を確認します。

1. Netlify Deploy PreviewがReadyになっている
2. Productionと同じアカウントでログインできる
3. Productionと同じプロフィール・投稿・状態が見える
4. PR差分のUI / 挙動だけが変わっている
5. Deploy PreviewにProductionのservice roleや秘密鍵が渡っていない
6. 不要な本番データ変更を行っていない
7. DB差分がある場合、Production migrationの適用状態を明確にする
8. 自動E2Eと実機確認の結果を必要に応じて確認する

## Production deployとの違い

- Deploy Preview: PRの未マージfrontend / Functions + Production Supabaseの公開クライアント権限 + Production秘密権限なし
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
