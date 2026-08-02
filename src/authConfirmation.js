export const AUTH_CONFIRMATION_KIND = Object.freeze({
  CONFIRMED: "confirmed",
  EMAIL_NOT_CONFIRMED: "email_not_confirmed",
  INVALID_LINK: "invalid_link",
  PENDING: "pending",
});

export const AUTH_CONFIRMATION_RESEND_COOLDOWN_MS = 60_000;

const AUTH_CALLBACK_QUERY_KEYS = [
  "code",
  "error",
  "error_code",
  "error_description",
  "token_hash",
  "type",
];
const AUTH_CALLBACK_HASH_KEYS = [
  "access_token",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_type",
  "type",
];
const INVALID_CONFIRMATION_CODES = new Set([
  "bad_code_verifier",
  "flow_state_expired",
  "flow_state_not_found",
  "otp_expired",
  "token_expired",
]);
const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

function toSearchParams(value) {
  const normalizedValue = String(value ?? "").replace(/^[?#]/, "");
  return new URLSearchParams(normalizedValue);
}

export function getAuthErrorCode(error) {
  return typeof error?.code === "string" ? error.code.trim().toLowerCase() : "";
}

export function isAuthEmailRateLimitError(error) {
  return Number(error?.status) === 429 || RATE_LIMIT_CODES.has(getAuthErrorCode(error));
}

export function isEmailNotConfirmedError(error) {
  return getAuthErrorCode(error) === "email_not_confirmed";
}

export function getAuthConfirmationCooldownSeconds(availableAt, now = Date.now()) {
  const remainingMs = Number(availableAt) - Number(now);
  return Number.isFinite(remainingMs) && remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export function tryStartAuthAction(inFlightRef) {
  if (inFlightRef?.current) {
    return false;
  }

  inFlightRef.current = true;
  return true;
}

export function finishAuthAction(inFlightRef) {
  if (inFlightRef) {
    inFlightRef.current = false;
  }
}

export function getAuthCallbackIntent(locationLike) {
  const searchParams = toSearchParams(locationLike?.search);
  const hashParams = toSearchParams(locationLike?.hash);
  const type = String(hashParams.get("type") ?? searchParams.get("type") ?? "").toLowerCase();
  const errorCode = String(
    hashParams.get("error_code") ?? searchParams.get("error_code") ?? "",
  ).toLowerCase();
  const error = String(hashParams.get("error") ?? searchParams.get("error") ?? "").toLowerCase();
  const errorDescription = String(
    hashParams.get("error_description") ?? searchParams.get("error_description") ?? "",
  ).toLowerCase();

  if (type === "recovery") {
    return { kind: "password_recovery", shouldCleanUrl: false };
  }

  const hasInvalidConfirmationError =
    INVALID_CONFIRMATION_CODES.has(errorCode) ||
    (error === "access_denied" && /confirm|email|expired|invalid|link|token/.test(errorDescription));

  if (hasInvalidConfirmationError) {
    return { kind: AUTH_CONFIRMATION_KIND.INVALID_LINK, shouldCleanUrl: true };
  }

  if (type === "signup") {
    return { kind: "signup_callback", shouldCleanUrl: true };
  }

  return { kind: "none", shouldCleanUrl: false };
}

export function getSanitizedAuthCallbackPath(locationLike) {
  const searchParams = toSearchParams(locationLike?.search);
  const hashParams = toSearchParams(locationLike?.hash);

  for (const key of AUTH_CALLBACK_QUERY_KEYS) {
    searchParams.delete(key);
  }

  for (const key of AUTH_CALLBACK_HASH_KEYS) {
    hashParams.delete(key);
  }

  const pathname = String(locationLike?.pathname ?? "/") || "/";
  const search = searchParams.toString();
  const hash = hashParams.toString();

  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
