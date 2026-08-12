# 初期β ちあ自動観測・星文方針

この文書は、星空Villageの初期βで適用する一時的なAI住人「星空ちあ」の自動観測方針を記録します。

## 現在の方針

街の投稿量がまだ少ない初期βでは、村人が放流した流星便を誰にも見つけられない状態にしないことを優先します。

- 通常の `text` / `image` / `video` / `youtube` 流星便を、ちあの自動観測対象とする。
- 安全に内容を実観測でき、validator条件を満たす星文を生成できた場合は、通常流星便にも **100% 星文を返す**。
- 画像・星映・YouTubeは、実メディアを観測できたことを根拠にする。観測できない内容を本文やタイトルから推測して星文を作らない。
- 自動観測が正常完了した場合は、ちあのサイレント共鳴を残す。
- provider障害、メディア取得不能、安全性・validator違反などの場合は、100%方針より捏造防止を優先し、星文を生成しない。

## 反応タイミング

機械的な即レスに見えないよう、放流後の観測開始は次の3帯からランダムに選びます。

- 2〜3分
- 8〜12分
- 25〜35分

2〜3分帯を成立させるため、due dispatcherは1分間隔で実行します。実際の表示時刻には、schedulerとGemini処理時間ぶんの小さな追加遅延が生じることがあります。

## 初期β設定

Productionの初期β設定は次を基準とします。

- `AI_AUTO_OBSERVATION_MIN_DELAY_SECONDS=120`
- `AI_AUTO_OBSERVATION_MAX_DELAY_SECONDS=2100`
- `AI_AUTO_STAR_LETTER_PROBABILITY_PERCENT=100`
- `AI_AUTO_STAR_LETTER_MIN_CONFIDENCE_PERCENT=75`
- `AI_AUTO_STAR_LETTER_DAILY_LIMIT=100`
- `AI_AUTO_STAR_LETTER_AUTHOR_COOLDOWN_SECONDS=0`

## 見直し条件

この100%方針は恒久仕様ではありません。アクティブに投稿する村人が増え、人間同士の共鳴・星文が自然に回り始めた段階で、実利用データを見ながら星文確率、cooldown、反応タイミングを再調整します。
