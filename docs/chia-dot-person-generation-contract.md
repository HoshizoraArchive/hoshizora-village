# 星空ちあ：CoS Dot 個人別生成アダプター契約

この契約は、星文返信の署名・DB反映と、CoS Durable Dot が文章を生成する処理の間に置く。Netlify は文脈取得と検証、署名済み結果の反映を担当する。モデル生成は CoS Dot の担当とし、Gemini の旧定期処理を新しい返信生成へ流用しない。

## 1回の生成に渡す情報

`createChiaPersonGenerationRequest(snapshot, generationBudget)` が返す1オブジェクトだけを、1回限りの生成へ渡す。ローカルで `context` の SHA-256 と全ID形式を再検証し、改ざんされたsnapshotを拒否する。claim応答の `generationInvocationId` が必須で、`prepare` の再実行でも同じ `invocationId` になる。新しいclaim attemptにのみDBが新UUIDを割り当てる。`scope.personProfileId` と `scope.sourceStarLetterId` は対象の境界、`snapshotHash` と `evidence` は署名・完了処理との照合に使う。作者と Chia の会話は対象の流星便上の人間↔Chia星文に限定し、本人用記憶は同じ `(chiaProfileId, personProfileId)` から最大12項目、対話は最大12ターンとする。

スケジューラー／Dot adapter は providerを起こす前に `countInputTokens(request)` で入力全体（固定system instruction、serialization overhead、全contextを含む）を数え、安全な整数で `budget.maxInputTokens` 以下であることを確認する。未知の計数結果や超過は失敗扱いとし、費用見積もりや provider wake に進まない。固定の命令文と形式化コストも上限内に含める。adapter は `outputTokenLimitEnforced=true` を満たし、生成呼出しへ明示的に `maxOutputTokens: request.budget.maxOutputTokens` を渡す。

入力トークンと費用見積もりが各上限内と確認できた後に `authorizeWake(request)` を呼び、RPC `authorize_chia_dot_provider_wake(run_id, chia_id, person_id, claim_token)` が `outcome='authorized'` を返した場合だけ生成を開始する。署名はrun/attempt/tokenに結び付き、DBがそのattemptの固定invocation IDを返す。adapterは `idempotencyEnforced=true` と `lookupGeneration(invocationId)` が必須で、`generate` へ `idempotencyKey: invocationId` を渡す。`already_woken` / `ambiguous` では再生成せず、`lookupGeneration` が `{ outcome: 'completed', result: <元の生成文> }` を返した場合だけその結果を使う。missing/pending/unknownでは `chia_generation_reconciliation_required` で停止する。wake/生成の応答消失を失敗確定とみなして別attemptへ進めない。

各許可済み依頼について新しいephemeral generationを起動する。同じ要求の再送では新sessionを作らず、同じinvocationの結果を照会する。既存チャット履歴、会話スレッド、他人のスナップショット、Workerの個人ライブラリ、七役Village SNSチームの共有コンテキストを添付してはならない。七役は協働チームであり、個人記憶の保存先や読み手ではない。外部チーム機能に渡すのは「対象ID・依頼状態・結果状態」の運用メタデータだけとし、本文、表示名、星文、記憶、プロンプトを含めない。

`persona.isFounder` はサーバー側で設定された開村者UUIDと、DB上の `founder` role が両方一致した場合だけ true になる。表示名、username、Dot入力値、共有チーム内の役割から開村者を推定してはならない。

## Adapter acceptance

実 CoS runtime の受け入れでは、次を接続側で証明する必要がある。ソース側のオブジェクト契約だけでは CoS の永続チャットや Worker memory が無効であることを証明できない。

- 各生成が新規 invocation/session であり、前回 invocation の会話を継承しない。
- personal library / long-term memory の自動取得・保存が無効である。
- 別の person ID に切り替えた生成入力に、前の人物の本文・記憶がない。
- 共有七役team artifact に本人を識別できる値や星文内容が入らない。
- `invocationId` と claim の識別子により、同じ生成依頼の再送は同じ結果を照会し、別依頼は別 invocation になる。
- 署名済み完了要求は同じ source, claim token, snapshot hash と revision evidence を使い、候補文は再生成せず元の結果を status で照合する。

これらはCoS runtime / Schedulerの設定・実行ログ・実際の切替テストで検証する。ローカルNodeテストと署名付きPGlite harnessは入力の形・長さ・speaker・revision evidence、同じclaimの固定ID、異なるclaimの別ID、保存済み結果への照合を確認する。実行環境の隔離・provider側の永続receipt・実課金の証拠にはならない。
