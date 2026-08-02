import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTH_CONFIRMATION_KIND,
  AUTH_CONFIRMATION_RESEND_COOLDOWN_MS,
  finishAuthAction,
  getAuthCallbackIntent,
  getAuthConfirmationCooldownSeconds,
  getSanitizedAuthCallbackPath,
  isAuthEmailRateLimitError,
  isEmailNotConfirmedError,
  tryStartAuthAction,
} from "../../../src/authConfirmation.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const confirmationPanelSource = readFileSync("src/AuthConfirmationPanel.jsx", "utf8");

test("signup confirmation callbacks and invalid links are distinguished from password recovery", () => {
  assert.deepEqual(
    getAuthCallbackIntent({ hash: "#type=signup&access_token=secret", search: "" }),
    { kind: "signup_callback", shouldCleanUrl: true },
  );
  assert.deepEqual(
    getAuthCallbackIntent({
      hash: "",
      search: "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    }),
    { kind: AUTH_CONFIRMATION_KIND.INVALID_LINK, shouldCleanUrl: true },
  );
  assert.deepEqual(
    getAuthCallbackIntent({ hash: "#type=recovery&access_token=secret", search: "" }),
    { kind: "password_recovery", shouldCleanUrl: false },
  );
});

test("auth callback cleanup removes credentials while preserving application routing params", () => {
  assert.equal(
    getSanitizedAuthCallbackPath({
      hash: "#type=signup&access_token=secret&refresh_token=secret-too",
      pathname: "/meteor/post-id",
      search: "?star_letter=letter-id",
    }),
    "/meteor/post-id?star_letter=letter-id",
  );
});

test("email confirmation errors and cooldowns use stable safe classifications", () => {
  assert.equal(isEmailNotConfirmedError({ code: "email_not_confirmed", status: 400 }), true);
  assert.equal(isEmailNotConfirmedError({ code: "invalid_credentials", status: 400 }), false);
  assert.equal(isAuthEmailRateLimitError({ code: "over_email_send_rate_limit", status: 400 }), true);
  assert.equal(isAuthEmailRateLimitError({ code: "unexpected", status: 429 }), true);
  assert.equal(AUTH_CONFIRMATION_RESEND_COOLDOWN_MS, 60_000);
  assert.equal(getAuthConfirmationCooldownSeconds(70_001, 10_001), 60);
  assert.equal(getAuthConfirmationCooldownSeconds(10_000, 10_001), 0);
});

test("auth actions reject a second concurrent signup or resend operation", () => {
  const inFlightRef = { current: false };

  assert.equal(tryStartAuthAction(inFlightRef), true);
  assert.equal(tryStartAuthAction(inFlightRef), false);
  finishAuthAction(inFlightRef);
  assert.equal(tryStartAuthAction(inFlightRef), true);
});

test("signup success without a session enters an exclusive confirmation-pending screen", () => {
  const signUpHandler = appSource.match(/async function handleSignUp[\s\S]*?\n  async function handleLogin/)?.[0] ?? "";

  assert.match(signUpHandler, /if \(data\.session\)/);
  assert.match(signUpHandler, /kind: AUTH_CONFIRMATION_KIND\.PENDING/);
  assert.match(signUpHandler, /resendAvailableAt: Date\.now\(\) \+ AUTH_CONFIRMATION_RESEND_COOLDOWN_MS/);
  assert.match(appSource, /hasConfirmationState \? \([\s\S]*?<AuthConfirmationPanel/);
  assert.match(confirmationPanelSource, /会員登録できました！/);
  assert.match(confirmationPanelSource, /メール内のリンクを開いて、メールアドレスを確認してください。/);
});

test("initial signup rate limits remain an incomplete signup instead of confirmation pending", () => {
  const signUpHandler = appSource.match(/async function handleSignUp[\s\S]*?\n  async function handleLogin/)?.[0] ?? "";
  const rateLimitBranch = signUpHandler.match(
    /if \(isAuthEmailRateLimitError\(error\)\) \{[\s\S]*?\n          return;/,
  )?.[0] ?? "";

  assert.match(rateLimitBranch, /setAuthStatus\("未ログイン"\)/);
  assert.match(rateLimitBranch, /会員登録を完了できませんでした。少し待ってから、もう一度お試しください。/);
  assert.doesNotMatch(rateLimitBranch, /setAuthConfirmation/);
  assert.doesNotMatch(rateLimitBranch, /AUTH_CONFIRMATION_KIND\.EMAIL_NOT_CONFIRMED/);
});

test("confirmation resend uses auth.resend instead of creating another signup", () => {
  const resendHandler = appSource.match(/async function handleResendConfirmation[\s\S]*?\n  function handleCloseAuthConfirmation/)?.[0] ?? "";

  assert.match(resendHandler, /supabase\.auth\.resend\(\{[\s\S]*type: "signup",[\s\S]*email: normalizedEmail/);
  assert.doesNotMatch(resendHandler, /\.signUp\(/);
  assert.match(confirmationPanelSource, /確認メールを再送する/);
  assert.match(confirmationPanelSource, /秒後に再送できます/);
});

test("email_not_confirmed and expired callbacks offer dedicated recovery while normal login remains", () => {
  const loginHandler = appSource.match(/async function handleLogin[\s\S]*?\n  async function handleResendConfirmation/)?.[0] ?? "";

  assert.match(loginHandler, /isEmailNotConfirmedError\(error\)/);
  assert.match(loginHandler, /kind: AUTH_CONFIRMATION_KIND\.EMAIL_NOT_CONFIRMED/);
  assert.match(confirmationPanelSource, /メールアドレスの確認がまだ完了していません。/);
  assert.match(confirmationPanelSource, /この確認リンクは古いか、期限切れになっています。/);
  assert.match(appSource, /supabase\.auth\.signInWithPassword/);
});

test("successful signup callback shows confirmation success without confusing normal sign-in", () => {
  assert.match(appSource, /const authCallbackResolvedRef = useRef\(false\)/);
  assert.match(appSource, /if \(authCallbackResolvedRef\.current\) \{[\s\S]*?return;/);
  assert.match(
    appSource,
    /event === "SIGNED_IN" &&[\s\S]*?initialAuthCallback\.kind === "signup_callback"/,
  );
  assert.match(appSource, /!authCallbackResolvedRef\.current/);
  assert.match(appSource, /kind: AUTH_CONFIRMATION_KIND\.CONFIRMED/);
  assert.match(
    appSource,
    /const shouldShowInteractiveOnboarding =[\s\S]*?authConfirmation\?\.kind !== AUTH_CONFIRMATION_KIND\.CONFIRMED/,
  );
  assert.match(confirmationPanelSource, /メールアドレスを確認しました/);
  assert.match(confirmationPanelSource, /案内へ進む/);
});
