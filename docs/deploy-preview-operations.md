# Deploy Preview 運用ルール

星空VillageのDeploy Previewは、Pull Requestの未マージコードを、本番と同じアカウント・プロフィール・投稿・現在状態の上で確認するために使います。

## 基本原則

Deploy Previewの標準構成は次の通りです。

- フロントエンド: 対象Pull Requestの未マージコード
- Supabase: Productionと同じSupabase project
- 認証: Productionと同じアカウント
- データ: Productionと同じプロフィール・流星便・共鳴・星文・Archive・通知など

つまり、Deploy Previewは「別のテストSNS」ではなく、**本番データの上にPR差分のフロントエンドを重ねて確認する環境**として扱います。

## やらないこと

通常のDeploy Preview確認のために、次の構成へ切り替えないでください。

- 別Supabase project
- ダミーアカウントだけのPreview DB
- 古いseedデータ
- Productionと状態が一致しない独立データセット

本番と異なるデータ環境が必要な検証は、Deploy Previewの標準運用とは分けて明示的に行います。

## 重要: Preview上の操作は本番データを変更する

Deploy PreviewはProduction Supabaseへ接続するため、Preview画面から行う書き込み操作は本番へ反映されます。

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

## E2Eテストとの役割分担

GitHub ActionsのPlaywright smoke testはSupabase通信をモックし、本番データを書き換えません。

- 自動E2E: 画面起動、主要ナビ、基本レイアウトなどを安全に継続確認
- Deploy Preview: 実データ・実認証を含むPR差分の最終確認
- 実機確認: iPhone / Android / PC固有の表示・操作問題を確認

この3つを同じ目的として混同しないでください。

## Netlify環境変数

NetlifyのDeploy Preview contextでは、Supabase接続先がProductionと同じになるよう維持します。

対象には、アプリがSupabaseへ接続するためのURL・公開キー、およびNetlify Functionsが利用する関連環境変数が含まれます。

**秘密値そのものはGitHub、README、PR本文、ログへ記載しません。**

ログインできない、プロフィールが違う、投稿が古いなど「本番と状態が一致しない」症状が出た場合は、まずDeploy Preview contextのSupabase接続先がProductionと一致しているか確認します。

## DB migrationを含むPull Request

Deploy Previewのフロントエンドは未マージコードですが、接続先DBはProductionです。

そのため、PRがまだProductionへ存在しないDB schema / RPC / columnを必須とする場合、その機能はPreviewだけでは完全動作しません。

この場合は次のどちらかにします。

1. migration未適用でも既存機能が壊れないfail-soft状態でUIだけ確認する
2. 本番DBへのmigration適用が明示的に承認された後で、Production Supabaseへmigrationを適用してE2E確認する

**Deploy Previewを動かすためだけにProduction migrationを無断適用しません。**

また、別Preview Supabaseを標準接続先へ戻すことでこの問題を回避しません。

## PR確認チェック

Deploy Previewを使うPRでは、必要に応じて以下を確認します。

1. Netlify Deploy PreviewがReadyになっている
2. Productionと同じアカウントでログインできる
3. Productionと同じプロフィール・投稿・状態が見える
4. PR差分のUI / 挙動だけが変わっている
5. 不要な本番データ変更を行っていない
6. DB差分がある場合、Production migrationの適用状態を明確にする
7. 自動E2Eと実機確認の結果を必要に応じて確認する

## Production deployとの違い

- Deploy Preview: PRの未マージコード + Production Supabase
- Production: `main`へマージ済みのコード + Production Supabase

Deploy PreviewがReadyでも、Productionフロントエンドへ反映されたことにはなりません。

マージ後に本番反映を確認する場合は、Netlify Production deployが対象の`main`コミットを正常にデプロイしたことを別途確認します。

## 変更時のルール

この運用を変更する場合は、単なる環境変数の差し替えとして扱わず、次を明確にします。

- なぜ変更するのか
- Productionとのデータ一致をどう保つか
- 認証・投稿・通知・管理機能への影響
- Preview上の書き込みがどこへ保存されるか

特にSupabase projectを変更する場合は、Previewの意味そのものが変わるため、意図を確認せず変更しません。
