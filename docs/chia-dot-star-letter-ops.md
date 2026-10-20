# 星空ちあ：CoS Dot 星文返信の運用

この機能は **CoS Durable Dot で生成した返信**を署名付きで投稿する。Netlify Functions は会話内容を取得・検証して DB に反映する。Netlify 側でモデル API を呼ぶ実装ではない。

## 本番切替の順序

1. `feat/chia-dot-reply-memory` のテスト・独立監査・PR・合成データE2Eを通す。標準Deploy PreviewではUIを確認し、未マージFunctionsへservice roleや署名秘密鍵を渡さない。返信endpointはpublished Production専用のままとする。署名付き書込は下記の隔離ローカルharnessで検証する。Productionのデータ・秘密情報をコピーしない。
2. 別途承認されたリリースで、DBのmigration ledgerと実定義を先に照合する。未適用分だけを順序どおり適用する（`20260908123500_add_chia_star_letter_reply_runs.sql` → `20261010213000_chia_reply_memory_and_fencing.sql` → `20261020120000_chia_dot_reply_atomic_guards.sql`）。重複migrationを新設したり適用済みの旧migrationを書き換えない。本人RLS、RPC ACL、旧返信機能の互換性を検査する。新migrationはトランザクション単位。
3. Production へ新機能を deploy する。この段階で `CHIA_DOT_STAR_LETTER_ENABLED` は未設定（false）のまま。
4. `CHIA_FOUNDER_PROFILE_ID` に Production で `auth.users.id`、`profiles.id`、`profile_roles.role_key=founder` を突き合わせた開村者 UUID を設定する。プロフィール表示名は権限判断に利用しない。
5. flagがfalseの間はProductionの `discover` / claim / wake / complete / remember / failは404で拒否される。切替前のpoller・署名付きdiscovery・実CoS adapterの個人隔離、固定invocation IDによる永続結果照会、token/cost上限は、隔離した合成環境で受け入れ検証する。Productionでflag-off discoveryが成功すると想定しない。認証済みstatusだけは停止中の照合用に使用できる。七役のscope membershipだけでは投稿権限・署名鍵アクセスを与えない。poller/adapterが未接続・未検証ならflagを有効にしない。
6. 上記受け入れと別途リリース承認後に `CHIA_DOT_STAR_LETTER_ENABLED=true` を Production に設定して deploy する。そこで初めてモデルを起こさないpollerの署名付き `discover` を確認する。候補なし・claim不成立では終了し、毎分のモデルDot起動を使わない。旧 `chia-star-letter-reply-scheduled` は実行されても旧Gemini処理に入らない。Schedulerの有効化は、その経路の受け入れ後に行う。
7. 実際の新着星文が届いたら、同一ソースの二重返信がないこと、`chia_star_letter_reply_runs` の `status/attempts/reply_star_letter_id`、星文親子関係、`star_letter_reply` 通知、および push を確認する。自分以外の実利用者へ試験投稿は送らない。

## Dot の1回の仕事

`scripts/chia-dot-star-letter-client.mjs` は Ed25519 署名用秘密鍵を読み、署名検証済みの API のみ呼ぶ。コマンドはプロジェクトルートで実行する。

```sh
node scripts/chia-dot-star-letter-client.mjs discover --output /tmp/chia-dot-discovery.json
node scripts/chia-dot-star-letter-client.mjs claim --source-id <UUID> --output /tmp/chia-dot-claim.json
node scripts/chia-dot-star-letter-client.mjs prepare --snapshot-file /tmp/chia-dot-claim.json --output /tmp/chia-dot-generation.json
node scripts/chia-dot-star-letter-client.mjs status --source-id <UUID> --output /tmp/chia-dot-status.json
node scripts/chia-dot-star-letter-client.mjs complete --snapshot-file /tmp/chia-dot-claim.json --decision reply --body-file /tmp/chia-dot-reply.txt
```

`discover` はDBで終端・retry待ち・有効lease・予算切れの人物を除外してから最大5件を返す。`claim` が `claimed` のときだけsnapshotを読む。モデルを起こすにはさらに `wake --snapshot-file ...` が `authorized` を返す必要がある。`prepare` は入力ファイルを作るだけでモデルもwakeも実行しない。実adapterは[個人別生成契約](chia-dot-person-generation-contract.md)のtoken計数・費用見積もり・wake・生成を一体で実装し、手動wakeとadapterのwakeを二重実行しない。

**別のアカウントの文脈は使わない**。`context.isFounder` がtrueのときのみ開村者として話す（設定UUIDとDBのfounder roleが両方必要）。投稿後に本人が明示した非センシティブな事実がある場合だけ、原文の短い証拠引用と安定キーを含む `remember` を送る。例のbody JSONは `{"memoryKey":"preferred_topic","evidenceQuote":"本人の原文の短い引用"}`。`remember` は任意で、reply確定前には使えない。本人による訂正・削除後に同一rememberを再送しても上書き・復元しない。

再送では元のclaimToken、attempt、snapshot hash、`generationInvocationId`、生成済み本文を保持する。署名のtimestamp/nonceのみ再発行できる。新しいclaimが成立した場合だけDBがtokenとinvocation IDを更新する。`status` はflagがfalseでも署名認証を要求し、返信ID・処理状態・invocation ID・wake時刻を読取専用で返す。返信完了の応答が不明なら先にstatusで照合する。wakeが `already_woken` / 不明なら同じinvocationの永続結果をadapterへ照会し、保存済み結果だけを使う。不明な間に再生成・fail・別claimを行わない。確定した生成失敗は署名付き `fail` で解放でき、source編集後もfailできる。秘密鍵、claimToken、本文、記憶をログ・PR・七役共有artifactへ記載しない。

## DBでの予算と実行境界

wake済みのprocessingは15分を過ぎても自動reclaimしない。`generation_reconciliation_required` の場合は元invocationの結果照会を続ける。wake前の停止だけを従来の15分lease回収で再試行できる。

claimはsource/postだけでなく直接の親星文のrevisionもDBで記録する。親の本文編集・削除・移動があればwake、completion、初回rememberを拒否する。既存remember receiptの再送は新規書込を行わない。

個人記憶は `(chia_profile_id, person_profile_id)` の単調増加partition revisionでもfenceする。claimがrevisionを保存し、snapshot RPCは同じMVCC statementでrevisionと記憶を読み、hashへ含める。claim後にrevisionが変わったsnapshotは返さない。completionはDB transaction内でclaimのrevisionと現行値をロックして比較し、異なれば `stale_memory`（endpointは409 `stale_snapshot`）として本文・返信・通知を一切保存しない。本人の訂正/削除、編集後の復元、別投稿の出典/親/投稿の無効化、FK cascade、DELETE/TRUNCATE cleanup、別セッションのrememberを含む変更がrevisionを進める。別人のrevisionは影響しない。空になっても本文を含まないpartition tombstoneを保持し、revisionをゼロへ戻さない。一般ユーザーとservice_roleはrevision metadataをINSERT/UPDATE/DELETE/TRUNCATEできず、RLSを有効にする。service_roleの読取とserver-only snapshot RPC以外へ公開しない。

ロック順序はsource freshnessのrun→source/post/parent→profile FK用KEY SHARE→partition SHAREとし、partitionは最後に取得する。completionは記憶行やremember receiptをロックしない。rememberはpartitionを先取りせず、従来のsource検証→profile/記憶行→partition更新にする。bulk invalidation/cleanupはtransition tableからpartition UUID順にrevisionを更新する。これにより、本人の記憶行ロックやrememberのprofileロックとpublicationのpartitionロックの逆転を避ける。実PostgreSQLの複数connectionによる競合確認は別途リリース条件であり、PGliteの直列検証を同等と呼ばない。

候補は条件を満たすものだけをfilterして、作成日時・UUIDの昇順（oldest due first）で最大5件を返す。次回も最古の未処理候補から始めるため、新しい候補が続いても古いdue候補を後回しにしない。cursorを使う場合もこの昇順へ進む。SQL側でも48時間を超える候補を除外する。retry cooldown、消費済みwake、既存reply、rolling予算上限は維持する。予算不足で処理できない間の48時間失効は引き続きあり、全候補への応答を保証するものではない。


claim時に1attemptにつき5,000 microusdを原子的に予約し、失敗・skipでも返却しない。rolling 24時間で全体50attempt / 250,000 microusd、人物ごと10attempt / 50,000 microusdを上限にする。旧未予約返信も保守的に数える。UTC日別counterは監査用で、上限判定は日付切替でリセットしない。wakeは同じattemptで一度だけ、全体60秒・人物120秒間隔とし、前日claimの有効な予約を日付跨ぎでも認める。

消費済みreservationはsource/runやprofileの削除に連動して消さない。削除で利用上限をリセットできないようにする。保持するのはUUID・attempt・モデル・予約額・時刻だけで、本文・記憶は保持しない。24時間は集計窓であり自動削除TTLではない。保存期間と古い会計メタデータのpruneは別途運用で決める（今回prune処理は追加しない）。

モデルは `cos-chatgpt`、入力8,000 token、出力512 tokenまで。DBの予約は実providerの課金制御そのものではない。実adapterの入力全体計数・見積もり・出力上限・永続idempotency、モデルを使わないpollerが未検証ならProduction activationは保留する。

## 安全なローカル検証

```sh
node --test netlify/functions/_shared/chiaDot*.test.mjs netlify/functions/_shared/chiaPersonGenerationContract.test.mjs netlify/functions/_shared/chiaStarLetterReply*.test.mjs netlify/functions/_shared/chiaDailyMeteor*.test.mjs
node --test netlify/functions/_shared/serviceWorkerPushDedupe.test.mjs
CHIA_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/chia-dot-star-letter-pglite-harness.mjs
npm test
npm --ignore-scripts run build -- --outDir .local/chia-independent-build-dist
npx playwright test e2e/chia-memory-isolation.spec.mjs e2e/smoke.spec.mjs
```

PGlite harnessは実メモリ内PostgreSQLへ必要最小の合成baselineと既存2件＋新1件のmigrationを適用し、新migrationの再適用も検証する。従来の3 SQL/RLS suiteに加え、oldest-due順序のrollback suiteと、commit済みの記憶変更をsnapshot確認後・SQL completion前へ差し込む署名付きjourneyを実行する。旧実装のRED（claim後編集を旧completionが受理）と修正後GREEN、署名認証→endpoint→実型RPC→返信・記憶・本人RLS・応答消失照合を実行する。外部fetchは拒否し、実キー・実モデル・実Supabaseは使わない。これは全Supabase migration replay、PostgREST実配信、Web Push配信や実CoS runtimeの検証とは区別する。

フルDB replay環境が別途ある場合、`scripts/chia-dot-star-letter-harness.sh` はloopbackの廃棄可能なローカルDBだけを許可し、fixtureをrollbackする。Preview-v2やProductionにこのfixtureを送らない。ブラウザE2Eは合成Auth/REST応答で記憶の訂正・削除とA→B→A切替を確認する。環境権限で起動不能なら未実施として記録し、通常環境での再確認をリリース条件に残す。

## 障害と巻き戻し

旧運用に戻す場合、**まず CoS Scheduler の当該 Dot 実行を停止**し、次に `CHIA_DOT_STAR_LETTER_ENABLED=false` に変更して Production を再 deploy する。これで既存の `CHIA_STAR_LETTER_REPLY_ENABLED=true` が有効なら従来の返信へ戻る。旧Gemini、定期流星便 Dot、既存の初回返信監視のジョブはこの機能の切替で勝手に停止しない。

記憶は `(chia_profile_id, person_profile_id)` で隔離し、本人のみ自分の記憶を閲覧・訂正・削除できる。出典星文の編集・削除や元投稿の変更・非公開化では該当記憶を消す。最大30項目、各1200文字である。DB書込・本人RLS・署名認証を弱めてトラブルを回避しない。


## Pushの配信・表示保証

DBのreply・notification・push jobの一意性と、Web Pushのtransport保証は別である。dispatchは送信後に成功を記録するため、provider ACK喪失やprocess停止では同じ通知IDを外部transportへ再送しうる（at-least-once）。ネットワーク上のexactly-onceは保証しない。

`public/sw.js` はpayloadの `notificationId` / `data.notificationId` が有効な非空文字列の場合だけ、ブラウザorigin内のIndexedDBでIDを原子的にclaimしてから `showNotification` する。通知を閉じた後やservice worker再起動後も、同じIDは再表示しない。重複抑止期間は30日、保存件数は最大500 IDとし、新しいIDのclaim時に期限切れ・超過分をevictする（無通信時に自動削除するtimerはない）。同一IDの並行pushもreadwrite transactionで直列化する。安定IDがないlegacy payloadは従来どおり表示する。

これは保持中のIDについて、ブラウザstorage単位の **at-most-once表示試行** である。端末間共有、storage削除、30日経過・500件超のeviction後は重複を抑止できない。IDは表示前に永続化するため、永続化後のworker停止やshowNotification失敗では通知が表示されないことがある。IndexedDB失敗時も新規表示せずfail-closedとする。再配信で必ず表示する保証やexactly-once表示成功の保証はない。storage durabilityはブラウザ実装の保証範囲に従う。

## 2026-10-20 独立NO-GO修正の受領記録

対象はdirty `feat/chia-dot-reply-memory`、開始HEAD `7e7f68671a0c71cf1721920138fa9a80bf76bd88`。既存のhardeningに上記3件をSOURCEのみで追記し、flag-off discovery手順を訂正した。既存のpending migration `20261020120000_chia_dot_reply_atomic_guards.sql` を修正し、適用済みmigrationの書換え・別の重複migration追加は行っていない。既存のuntracked dist/node_modules/background WebPは変更対象外。buildはprebuildの画像再生成を避け、環境guardを個別実行した上で別の `.local` 出力先へ実行する。

修正前に、owner DELETEがendpointのsnapshot再確認後・completion直前にcommitしても200/repliedとなるREDを再現した。修正後は同じ位置でのowner削除/訂正/復元、別投稿source編集/削除・非公開化、cleanup DELETE/TRUNCATE、別セッション記憶追加の9ケースを409で拒否し、古い本文を保存しないことを確認した。署名付きsession Aのreply/rememberがsession Bのcompletionを拒否する経路、別人の記憶変更では自分のfresh replyが成功する経路も確認した。

| ローカル検証 | 結果 |
| --- | --- |
| 既存102件を含むChia focused Node | 104/104 PASS |
| 既存759件を含む全Node | 768/768 PASS（追加9件、削除なし） |
| Push SW Node VM + IndexedDB fake | 7/7 PASS（全Nodeの内数） |
| PGlite | 既存3 SQL/RLS suite＋fairness suite、migration replay、署名付きendpoint・revision journey PASS |
| frontend production build | PASS、`.local/chia-independent-build-dist`、既存chunk-size警告のみ |
| 構文・差分 | 10 Node構文、bash構文、git diff/new SQL whitespace PASS、build SWとのbyte一致 |
| ブラウザE2E | BLOCKED: local server listen `EPERM 127.0.0.1:4173`。ブラウザ/SW/実IndexedDBの合格証拠はない |

buildは `node scripts/validate-deploy-preview-env.mjs` と `npm --ignore-scripts run build -- --outDir .local/chia-independent-build-dist` で実行した。通常prebuildの画像writeは実行しない。WebPおよび既存dirty `src/App.jsx` のSHA256、dist/node_modulesのroot mtimeとresolved pathは開始時と一致（両directoryの再帰hashは取得していない）。

全検証log、保持確認、残るrelease gateは `.local/chia-reply-independent-fix-result.txt` に記録する。本記録はSOURCE検証であり、Production完了やactivationを表さない。今回Supabase/Netlify/CoS/Scheduler/SNSへのlive呼出し、実キー利用、commit/push/PR/deployは行わない。

リリース前には、全migration replayと実PostgreSQL/PostgRESTでの競合・ACL（既存のsource/run/profile hard-delete cascadeのlock順を含む）、ブラウザA→B→Aの隔離と実IndexedDB/SWでのlost-ACK再配信、実CoS ephemeral session/library/team隔離・durable receipts・費用上限、trusted founder Auth/profile/role一致を受け入れる。その後に別途承認されたProduction反映と、管理された返信/通知/Pushのreadbackが必要。残るgateが未確認の間はProduction NO-GOを維持する。
