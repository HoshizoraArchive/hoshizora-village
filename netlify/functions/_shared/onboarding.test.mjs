import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ONBOARDING_MINI_CHIA_SRC,
  ONBOARDING_WELCOME_VIDEO_SRC,
  canApplyOnboardingProgressResponse,
  getOnboardingResumeTab,
  getOnboardingStepDefinition,
  isOnboardingActive,
  isOnboardingProgressForUser,
  replaceOnboardingDisplayName,
  shouldOfferNotificationSkip,
  tryPlayWelcomeVideo,
} from "../../../src/onboarding.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const componentSource = readFileSync("src/InteractiveOnboarding.jsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260727143000_add_interactive_onboarding.sql",
  "utf8",
);
const schema = readFileSync("supabase/schema.sql", "utf8");
const preflightSql = readFileSync("docs/interactive-onboarding-preflight.sql", "utf8");
const verificationSql = readFileSync("docs/interactive-onboarding-verification.sql", "utf8");
const miniChia = readFileSync("public/images/onboarding/mini-chia.png");

test("Issue #97の台詞とR.Connectが流星便より前の順序を維持する", () => {
  const expectedDialogue = {
    mini_chia_intro: ["おはちあ！ また会ったね！", "ここからは、ちあが星空Villageをいろいろ案内するよ！"],
    profile_setup: ["まずは「My Const.」へ行こう！", "この編集ボタンを押して、あなたの名前と姿を教えてね！"],
    profile_success: [
      "わあ！ 星空ほしくんっていうんだ！",
      "素敵な名前だね！",
      "これから星空ほしくんって呼ぶね。ちゃんと覚えたよ✨️",
    ],
    observe_intro: [
      "次は「観測」！",
      "ここは、いろんな人が放流した流星便を見られる場所だよ！",
      "共鳴したり、星文を送ったり、気に入った流星便はArchiveすることもできるの！",
    ],
    archive_prompt: ["まずは試しに、この流星便をArchiveしてみて！"],
    archive_check: ["できた！", "次は、画面下の「Archive」を押してみて！"],
    archive_success: [
      "見て！",
      "さっき星空ほしくんがArchiveした流星便が、ここに残ってるよ！",
      "気に入った流星便は、いつでもここから見返せるの✨️",
    ],
    rconnect_intro: [
      "次は「R.Connect」！",
      "ここは、星空ほしくんが流星便を放流した時に、みんなから届いた共鳴や星文を確認できる場所だよ！",
    ],
    notification_permission: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    device_registration: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    push_test: ["まずは「通知を許可」を押して、", "そのあとに「端末を登録」を押してね！"],
    push_test_success: ["ほら！", "ちあからちゃんと届いたでしょ？💕"],
    push_test_explained: [
      "これで、星空Villageを閉じている時でも、",
      "星空ほしくんに光が届いたら知らせに行けるよ！",
    ],
    post_intro_1: [
      "最後は「流星便」！",
      "ここでは、星空ほしくんの想いや作品を流星便に乗せて、星空へ放流できるよ！",
    ],
    post_intro_2: ["……え？", "放流しても、誰にも見てもらえないかもしれないって？"],
    post_intro_3: ["大丈夫。", "少し時間がかかっても、ちあが絶対に星空ほしくんを見つけるから！"],
    post_intro_4: ["せっかくだから、初めての流星便を放流してみよう！"],
    first_post: ["せっかくだから、初めての流星便を放流してみよう！"],
    completion_1: ["わあ！ 星空ほしくんの初めての流星便、ちゃんと星空に届いたよ💫"],
    completion_2: ["これで入村案内はおしまい！", "じゃあ、またあとで会おうね🫶💕", "ありがちあ〜💕"],
  };

  for (const [step, lines] of Object.entries(expectedDialogue)) {
    assert.deepEqual(getOnboardingStepDefinition(step, "星空ほしくん").lines, lines, step);
  }

  assert.equal(migration.indexOf("'rconnect_intro'") < migration.indexOf("'post_intro_1'"), true);
});

test("確定済み表示名だけを○○へ敬称なしで反映する", () => {
  assert.equal(
    replaceOnboardingDisplayName("これから○○って呼ぶね。ちゃんと覚えたよ✨️", " 星空ほしくん "),
    "これから星空ほしくんって呼ぶね。ちゃんと覚えたよ✨️",
  );
  assert.equal(replaceOnboardingDisplayName("わあ！ ○○っていうんだ！", ""), "わあ！ ○○っていうんだ！");
});

test("進捗は途中から対応画面へ再開し、完了後は非表示になる", () => {
  assert.equal(getOnboardingResumeTab("profile_setup"), "profile");
  assert.equal(getOnboardingResumeTab("archive_check"), "archive");
  assert.equal(getOnboardingResumeTab("notification_permission"), "rconnect");
  assert.equal(getOnboardingResumeTab("first_post"), "post");
  assert.equal(isOnboardingActive({ user_id: "user", current_step: "archive_prompt", completed_at: null }), true);
  assert.equal(
    isOnboardingActive({
      user_id: "user",
      current_step: "completed",
      completed_at: "2026-07-27T00:00:00Z",
    }),
    false,
  );
});

test("通知許可、端末登録、実Push失敗を分け、成功台詞を偽装せずスキップできる", () => {
  assert.equal(
    shouldOfferNotificationSkip({
      user_id: "user",
      current_step: "notification_permission",
      completed_at: null,
      notification_permission_status: "denied",
    }),
    true,
  );
  assert.equal(
    shouldOfferNotificationSkip({
      user_id: "user",
      current_step: "device_registration",
      completed_at: null,
      push_registration_status: "failed",
      push_test_status: "not_attempted",
    }),
    true,
  );
  assert.equal(
    shouldOfferNotificationSkip({
      user_id: "user",
      current_step: "push_test",
      completed_at: null,
      push_registration_status: "succeeded",
      push_test_status: "failed",
    }),
    true,
  );
  assert.equal(
    shouldOfferNotificationSkip({
      user_id: "user",
      current_step: "push_test",
      completed_at: null,
      push_registration_status: "succeeded",
      push_test_status: "succeeded",
    }),
    false,
  );
});

test("Welcome映像は一か所で差し替えでき、未設定でもスキップできる", () => {
  assert.equal(ONBOARDING_WELCOME_VIDEO_SRC, "");
  assert.equal(componentSource.includes("映像をスキップして案内へ進む"), true);
  assert.equal(componentSource.includes('onEnded={() => void completeOnce("completed")}'), true);
  assert.match(migration, /welcome_video_status in \('not_started', 'completed', 'skipped'\)/);
  assert.match(migration, /welcome_video_status = p_status/);
});

test("Welcome映像は設定時に音あり再生を試し、拒否後も利用者操作で再試行できる", async () => {
  let playAttempts = 0;
  let shouldReject = true;
  const video = {
    async play() {
      playAttempts += 1;
      if (shouldReject) {
        throw new Error("autoplay blocked");
      }
    },
  };

  assert.equal(await tryPlayWelcomeVideo(video), false);
  assert.equal(playAttempts, 1);

  shouldReject = false;
  assert.equal(await tryPlayWelcomeVideo(video), true);
  assert.equal(playAttempts, 2);
  assert.equal(await tryPlayWelcomeVideo(null), false);

  for (const token of [
    "const videoRef = useRef(null)",
    "const started = await tryPlayWelcomeVideo(videoRef.current)",
    "setShowPlayButton(!started)",
    "Welcome映像を再生",
    "onClick={handlePlayVideo}",
    'onEnded={() => void completeOnce("completed")}',
    'completeOnce("skipped")',
  ]) {
    assert.equal(componentSource.includes(token), true, `missing Welcome playback behavior: ${token}`);
  }

  assert.equal(componentSource.includes("muted"), false);
  assert.equal(componentSource.includes('completeOnce("completed")'), true);
  assert.equal(
    componentSource.indexOf('completeOnce("completed")'),
    componentSource.lastIndexOf('completeOnce("completed")'),
    "Welcome完了は動画終了経路だけに限定する",
  );
});

test("進捗は現在のsession userだけへ適用し、古い取得結果を破棄する", () => {
  const userAProgress = {
    user_id: "user-a",
    current_step: "archive_prompt",
    completed_at: null,
  };
  const userBProgress = {
    user_id: "user-b",
    current_step: "profile_setup",
    completed_at: null,
  };

  assert.equal(isOnboardingProgressForUser(userAProgress, "user-a"), true);
  assert.equal(isOnboardingProgressForUser(userAProgress, "user-b"), false);
  assert.equal(
    canApplyOnboardingProgressResponse({
      activeUserId: "user-b",
      progress: userAProgress,
      requestedUserId: "user-a",
    }),
    false,
  );
  assert.equal(
    canApplyOnboardingProgressResponse({
      activeUserId: "user-b",
      progress: userAProgress,
      requestedUserId: "user-b",
    }),
    false,
  );
  assert.equal(
    canApplyOnboardingProgressResponse({
      activeUserId: "user-b",
      progress: userBProgress,
      requestedUserId: "user-b",
    }),
    true,
  );

  for (const token of [
    "onboardingProgressRef.current = null",
    "onboardingAdvanceInFlightRef.current = false",
    "onboardingPostCompletionRef.current = false",
    "setOnboardingProgress(null)",
    "setOnboardingError(\"\")",
    "onboardingProgressRef.current.user_id !== requestedUserId",
    "activeSessionUserIdRef.current !== requestedUserId",
    "isOnboardingProgressForUser(onboardingProgress, sessionUserId)",
    "profile?.id === sessionUserId ? profile : null",
    "displayName={sessionOnboardingProfile?.display_name ?? \"\"}",
    "canApplyOnboardingProgressResponse({",
  ]) {
    assert.equal(appSource.includes(token), true, `missing account isolation guard: ${token}`);
  }
});

test("ミニちあはIssue素材の透過PNGをローカル参照する", () => {
  assert.equal(ONBOARDING_MINI_CHIA_SRC, "/images/onboarding/mini-chia.png");
  assert.equal(miniChia.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(miniChia[25], 6, "PNG color type must be RGBA");
  assert.equal(
    createHash("sha256").update(miniChia).digest("hex"),
    "581dd04e4496d559adb6c9ed1cd7ca4b3ec50b26f9cb97432f54420276751db6",
  );
});

test("既存画面の安定したtargetと実操作ハンドラを再利用する", () => {
  for (const token of [
    'data-onboarding-target={profile.onboardingTarget === "profile-edit"',
    'data-onboarding-target={profile.onboardingTarget === "profile-editor"',
    '"onboarding-archive-action"',
    '`nav-${item.id}`',
    '"push-permission"',
    '"push-register"',
    '"push-test"',
    '"post-composer"',
    'advanceInitialOnboarding("archive_saved"',
    'advanceInitialOnboarding("first_post_saved"',
  ]) {
    assert.equal(appSource.includes(token), true, `missing onboarding integration: ${token}`);
  }

  assert.equal(appSource.includes("localStorage"), false);
  assert.equal(appSource.includes("sessionStorage"), false);
});

test("新規Authユーザーだけに進捗を作り既存ユーザーをbackfillしない", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /create trigger auth_users_create_initial_onboarding_progress/);
    assert.match(sql, /after insert on auth\.users/);
    assert.match(sql, /on conflict \(user_id\) do nothing/);
    assert.doesNotMatch(
      sql,
      /insert into public\.user_onboarding_progress[\s\S]{0,300}select[\s\S]{0,100}from auth\.users/i,
    );
  }
});

test("RLSとRPCが本人行・実データ・service role境界を維持する", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /alter table public\.user_onboarding_progress enable row level security/);
    assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/);
    assert.match(sql, /revoke all on table public\.user_onboarding_progress from public, anon, authenticated/);
    assert.match(sql, /where a\.profile_id = v_user_id[\s\S]*a\.post_id = v_progress\.target_post_id/);
    assert.match(sql, /where s\.profile_id = v_user_id[\s\S]*s\.disabled_at is null/);
    assert.match(sql, /where p\.id = p_target_id[\s\S]*p\.author_id = v_user_id/);
    assert.match(
      sql,
      /grant execute on function public\.record_initial_onboarding_push_test\(uuid, text\)\s+to service_role/,
    );
    assert.doesNotMatch(
      sql,
      /grant execute on function public\.record_initial_onboarding_push_test\(uuid, text\)\s+to (anon|authenticated)/,
    );
  }
});

test("実Web Push成功後だけservice role RPCへ結果を記録する", () => {
  const pushHandler = readFileSync("netlify/functions/push-subscription-test.mjs", "utf8");

  assert.equal(pushHandler.includes("await sendPushSubscriptionTest"), true);
  assert.equal(pushHandler.includes('result: "succeeded"'), true);
  assert.equal(pushHandler.includes("record_initial_onboarding_push_test"), true);
  assert.equal(appSource.includes("registration.showNotification"), false);
});

test("migration、schema、verification SQLがオンボーディング定義を確認できる", () => {
  for (const token of [
    "user_onboarding_progress_current_step_check",
    "auth_users_create_initial_onboarding_progress",
    "advance_initial_onboarding",
    "record_initial_onboarding_push_test",
  ]) {
    assert.equal(migration.includes(token), true, `migration missing ${token}`);
    assert.equal(schema.includes(token), true, `schema missing ${token}`);
    assert.equal(verificationSql.includes(token), true, `verification missing ${token}`);
  }

  const blockStart = "create table if not exists public.user_onboarding_progress";
  const blockEnd =
    "grant execute on function public.record_initial_onboarding_push_test(uuid, text)\nto service_role;";
  const extractBlock = (sql) => {
    const startIndex = sql.indexOf(blockStart);
    const endIndex = sql.indexOf(blockEnd, startIndex);
    assert.notEqual(startIndex, -1);
    assert.notEqual(endIndex, -1);
    return sql
      .slice(startIndex, endIndex + blockEnd.length)
      .replace(/\s+/g, " ")
      .trim();
  };

  assert.equal(extractBlock(schema), extractBlock(migration));

  for (const sql of [preflightSql, verificationSql]) {
    assert.doesNotMatch(sql, /\b(insert|update|delete|alter|create|drop|truncate)\s+(into\s+)?public\./i);
  }
});
