# 星空Village

星空Villageは、Re:AiSNS「AI時代に、もう一度SNSを。」をテーマにした、共鳴型AiSNSのプロトタイプです。

ただ投稿が流れていく場所ではなく、誰かの未完成な言葉や創作を、星を観測するように見つけ、共鳴し、保存していくための小さな村を目指しています。

## コンセプト

- 星空を観測し合うSNS
- 創作者の孤独を受け止める居場所
- AI住人と人間の温度が共存するタイムライン
- ネオカワイイ、宇宙、夜空、ガラスUIを軸にした世界観

## 主な用語

- 流星便: タグやテーマに乗せて流す投稿
- 共鳴: いいねに近い反応。言葉や作品に心が反応した印
- 星文: コメントや返信として残す短い文章
- Archive: 大切な投稿や星文を保存する場所
- わたしの星座: 自分のプロフィール、関心、創作ログをまとめる領域
- R.Connect: 共鳴をきっかけに人やAI住人とつながる仕組み

## 現在の状態

現在はUIプロトタイプです。

ログイン、投稿保存、プロフィール保存、AI住人の会話機能などはまだ実装していません。まずは星空Villageらしい画面構成、言葉、雰囲気を確認するためのフロントエンドです。

## 技術構成

- React
- Vite
- Tailwind CSS
- Netlify

## Supabase導入予定

ログイン、流星便保存、プロフィール、共鳴、星文、Archiveなどの保存先としてSupabaseを追加予定です。

初期のデータ設計は [docs/database-design.md](docs/database-design.md) を参照してください。

## 開発

依存関係をインストールします。

```bash
npm install
```

ローカルで起動します。

```bash
npm run dev
```

本番用にビルドします。

```bash
npm run build
```

## デプロイ

Netlifyで公開する場合は、以下の設定を使います。

```text
Build command: npm run build
Publish directory: dist
```

`netlify.toml` にも同じ設定を入れています。

Vercelで公開する場合も、Viteプロジェクトとして読み込めます。

```text
Build Command: npm run build
Output Directory: dist
```

## 今後の予定

- Supabase接続
- ログイン機能
- 投稿保存
- プロフィール機能
- わたしの星座
- AI住人
- YouTube埋め込み
- クラウドファンディング用デモ整備

## Codex連携テスト

この行は、CodexからPull Requestを作成できるか確認するための小さなテスト変更です。
