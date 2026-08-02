import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTH_CONFIRMATION_KIND,
  AUTH_PASSWORD_RECOVERY_COOLDOWN_MS,
  AUTH_PASSWORD_RECOVERY_KIND,
  getAuthCallbackIntent,
  getPasswordRecoveryRedirectUrl,
  isPasswordRecoveryAccountLookupError,
  isPasswordRecoverySessionError,
  validatePasswordRecoveryPasswords,
} from "../../../src/authConfirmation.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const recoveryPanelSource = readFileSync("src/PasswordRecoveryPanel.jsx", "utf8");

test("password recovery callbacks remain distinct from signup confirmation callbacks", () => {
  assert.deepEqual(
    getAuthCallbackIntent({
      hash: "#access_token=secret&refresh_token=secret-too&type=recovery",
      pathname: "/auth/recovery",
      search: "",
    }),
    { kind: "password_recovery", shouldCleanUrl: true },
  );
  assert.deepEqual(
    getAuthCallbackIntent({
      hash: "",
      pathname: "/auth/recovery",
      search: "?error=access_denied&error_code=otp_expired&error_description=Link+expired",
    }),
    { kind: "password_recovery_invalid", shouldCleanUrl: true },
  );
  assert.deepEqual(
    getAuthCallbackIntent({
      hash: "",
      pathname: "/auth/recovery",
      search: "?error=unexpected_callback_failure",
    }),
    { kind: "password_recovery_invalid", shouldCleanUrl: true },
  );
  assert.deepEqual(
    getAuthCallbackIntent({
      hash: "",
      pathname: "/",
      search: "?error=access_denied&error_code=otp_expired&error_description=Email+link+expired",
    }),
    { kind: AUTH_CONFIRMATION_KIND.INVALID_LINK, shouldCleanUrl: true },
  );
});

test("password reset requests use a dedicated same-origin redirect URL", () => {
  assert.equal(
    getPasswordRecoveryRedirectUrl({ origin: "https://hoshizora-village.netlify.app/" }),
    "https://hoshizora-village.netlify.app/auth/recovery",
  );
  assert.equal(
    getPasswordRecoveryRedirectUrl({ origin: "https://deploy-preview-169--hoshizora-village.netlify.app" }),
    "https://deploy-preview-169--hoshizora-village.netlify.app/auth/recovery",
  );
  assert.match(
    appSource,
    /supabase\.auth\.resetPasswordForEmail\(normalizedEmail, \{[\s\S]*?redirectTo: getPasswordRecoveryRedirectUrl\(window\.location\)/,
  );
});

test("password requirements match signup and reject confirmation mismatches", () => {
  assert.equal(validatePasswordRecoveryPasswords("short", "short"), "パスワードは6文字以上で入力してください。");
  assert.equal(
    validatePasswordRecoveryPasswords("new-password", "different-password"),
    "新しいパスワードが一致していません。",
  );
  assert.equal(validatePasswordRecoveryPasswords("new-password", "new-password"), "");
  assert.match(recoveryPanelSource, /minLength=\{6\}/);
  assert.match(recoveryPanelSource, /void onUpdate\(newPassword, passwordConfirmation\)/);
});

test("password recovery request and update operations remain single-flight and rate limited", () => {
  const requestHandler = appSource.match(
    /async function handlePasswordRecoveryRequest[\s\S]*?\n  async function handlePasswordRecoveryUpdate/,
  )?.[0] ?? "";
  const updateHandler = appSource.match(
    /async function handlePasswordRecoveryUpdate[\s\S]*?\n  function handleClosePasswordRecovery/,
  )?.[0] ?? "";

  assert.equal(AUTH_PASSWORD_RECOVERY_COOLDOWN_MS, 60_000);
  assert.match(requestHandler, /authActionInFlightRef\.current/);
  assert.match(requestHandler, /tryStartAuthAction\(authActionInFlightRef\)/);
  assert.match(requestHandler, /isAuthEmailRateLimitError\(error\)/);
  assert.match(requestHandler, /少し待ってからもう一度お試しください。/);
  assert.match(updateHandler, /validatePasswordRecoveryPasswords\(password, confirmation\)/);
  assert.match(updateHandler, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(updateHandler, /tryStartAuthAction\(authActionInFlightRef\)/);
});

test("account lookup failures do not disclose whether an email is registered", () => {
  assert.equal(isPasswordRecoveryAccountLookupError({ code: "email_not_found" }), true);
  assert.equal(isPasswordRecoveryAccountLookupError({ code: "user_not_found" }), true);
  assert.equal(isPasswordRecoveryAccountLookupError({ code: "unknown_lookup_error", status: 400 }), true);
  assert.equal(isPasswordRecoveryAccountLookupError({ code: "unexpected" }), false);

  const requestHandler = appSource.match(
    /async function handlePasswordRecoveryRequest[\s\S]*?\n  async function handlePasswordRecoveryUpdate/,
  )?.[0] ?? "";

  assert.match(requestHandler, /error && !isPasswordRecoveryAccountLookupError\(error\)/);
  assert.match(requestHandler, /kind: AUTH_PASSWORD_RECOVERY_KIND\.SENT/);
  assert.match(recoveryPanelSource, /パスワード再設定メールを送信しました。/);
  assert.doesNotMatch(recoveryPanelSource, /登録されていません|ユーザーが存在しません/);
});

test("invalid recovery sessions return to resend while successful updates keep their session", () => {
  assert.equal(isPasswordRecoverySessionError({ code: "otp_expired" }), true);
  assert.equal(isPasswordRecoverySessionError({ code: "session_not_found" }), true);
  assert.equal(isPasswordRecoverySessionError({ code: "weak_password" }), false);
  assert.match(recoveryPanelSource, /このパスワード再設定リンクは古いか、期限切れになっています。/);
  assert.match(recoveryPanelSource, /再設定メールをもう一度送ってください。/);
  assert.match(recoveryPanelSource, /パスワードを変更しました。/);
  assert.match(recoveryPanelSource, /星空Villageへ進む/);

  const updateHandler = appSource.match(
    /async function handlePasswordRecoveryUpdate[\s\S]*?\n  function handleClosePasswordRecovery/,
  )?.[0] ?? "";

  assert.doesNotMatch(updateHandler, /signOut/);
});

test("recovery state is exclusive from onboarding and normal authenticated UI", () => {
  assert.match(appSource, /event === "PASSWORD_RECOVERY"/);
  assert.match(appSource, /const isPasswordRecoveryVisible = Boolean\(passwordRecovery\)/);
  assert.match(
    appSource,
    /const shouldShowInteractiveOnboarding =[\s\S]*?!passwordRecovery/,
  );
  assert.match(appSource, /\{isPasswordRecoveryVisible \? \([\s\S]*?<PasswordRecoveryPanel/);
  assert.match(appSource, /kind: AUTH_PASSWORD_RECOVERY_KIND\.UPDATED/);
  assert.equal(AUTH_PASSWORD_RECOVERY_KIND.ACTIVE, "active");
});
