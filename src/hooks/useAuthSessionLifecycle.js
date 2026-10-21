import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { ERROR_OPERATION, getUserFacingError } from "../safeErrors";
import { AUTH_CONFIRMATION_KIND, AUTH_PASSWORD_RECOVERY_KIND, getSanitizedAuthCallbackPath } from "../authConfirmation";

export function useAuthSessionLifecycle({
  initialAuthCallback,
  authCallbackCleanedRef,
  authCallbackResolvedRef,
  passwordRecoveryVerifiedUserIdRef,
  setAuthConfirmation,
  setAuthError,
  setAuthMessage,
  setPasswordRecovery,
  setAuthStatus,
  activeSessionUserIdRef,
  setSession,
}) {
useEffect(() => {
    let isMounted = true;
    let recoveryResolutionTimer = null;
    let hasAuthStateEvent = false;
    let latestAuthStateEventType = null;
    let latestAuthStateEventSession = null;

    function cleanAuthCallbackUrl(force = false) {
      if ((!initialAuthCallback.shouldCleanUrl && !force) || authCallbackCleanedRef.current) {
        return;
      }

      authCallbackCleanedRef.current = true;
      window.history.replaceState(
        window.history.state,
        "",
        getSanitizedAuthCallbackPath(window.location),
      );
    }

    function markPasswordRecoveryInvalid() {
      authCallbackResolvedRef.current = true;
      passwordRecoveryVerifiedUserIdRef.current = null;
      setAuthConfirmation(null);
      setAuthError("");
      setAuthMessage("");
      setPasswordRecovery({
        email: "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.INVALID,
        resendAvailableAt: 0,
      });
      setAuthStatus("再設定リンクエラー");
      cleanAuthCallbackUrl(true);
    }

    function applyPasswordRecoveryEventSession(currentSession) {
      const recoveryUserId = currentSession?.user?.id ?? null;

      if (!recoveryUserId) {
        markPasswordRecoveryInvalid();
        return;
      }

      if (recoveryResolutionTimer) {
        window.clearTimeout(recoveryResolutionTimer);
        recoveryResolutionTimer = null;
      }

      authCallbackResolvedRef.current = true;
      passwordRecoveryVerifiedUserIdRef.current = recoveryUserId;
      setAuthConfirmation(null);
      setAuthError("");
      setAuthMessage("");
      setPasswordRecovery({
        email: currentSession.user?.email ?? "",
        kind: AUTH_PASSWORD_RECOVERY_KIND.ACTIVE,
        resendAvailableAt: 0,
        userId: recoveryUserId,
      });
      setAuthStatus("パスワード再設定中");
      cleanAuthCallbackUrl(true);
    }

    function waitForPasswordRecoveryEvent() {
      // A recovery pathname is only a candidate. Give detectSessionInUrl's queued
      // PASSWORD_RECOVERY event time to verify the session before failing closed.
      recoveryResolutionTimer = window.setTimeout(() => {
        recoveryResolutionTimer = null;

        if (isMounted && !authCallbackResolvedRef.current) {
          markPasswordRecoveryInvalid();
        }
      }, 100);
    }

    function applyInitialAuthCallback(currentSession) {
      if (authCallbackResolvedRef.current) {
        return;
      }

      if (initialAuthCallback.kind === "password_recovery_invalid") {
        markPasswordRecoveryInvalid();
        return;
      }

      if (initialAuthCallback.kind === "password_recovery") {
        waitForPasswordRecoveryEvent();
        return;
      }

      if (initialAuthCallback.kind === AUTH_CONFIRMATION_KIND.INVALID_LINK) {
        authCallbackResolvedRef.current = true;
        setAuthConfirmation({
          email: "",
          kind: AUTH_CONFIRMATION_KIND.INVALID_LINK,
          resendAvailableAt: 0,
        });
        setAuthStatus("メール確認エラー");
        cleanAuthCallbackUrl();
        return;
      }

      if (initialAuthCallback.kind !== "signup_callback") {
        return;
      }

      authCallbackResolvedRef.current = true;

      if (currentSession) {
        setAuthConfirmation({
          email: currentSession.user?.email ?? "",
          kind: AUTH_CONFIRMATION_KIND.CONFIRMED,
          resendAvailableAt: 0,
        });
        setAuthError("");
        setAuthMessage("");
        setAuthStatus("メール確認完了");
      } else {
        setAuthConfirmation({
          email: "",
          kind: AUTH_CONFIRMATION_KIND.INVALID_LINK,
          resendAvailableAt: 0,
        });
        setAuthStatus("メール確認エラー");
      }

      cleanAuthCallbackUrl();
    }

    async function readSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      // Supabase can emit a newer INITIAL_SESSION, SIGNED_IN or SIGNED_OUT
      // before the initial getSession() promise settles. Never overwrite the
      // event with an earlier snapshot (including an obsolete error).
      if (hasAuthStateEvent) {
        // Auth JS emits INITIAL_SESSION(null) even when its initial read fails.
        // Only that still-authoritative initial event may surface its error.
        // A later SIGNED_IN/SIGNED_OUT/recovery event must never be overwritten.
        if (error && latestAuthStateEventType === "INITIAL_SESSION" && !latestAuthStateEventSession) {
          if (initialAuthCallback.kind === "password_recovery") {
            markPasswordRecoveryInvalid();
            return;
          }

          setAuthStatus("確認エラー");
          setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SESSION));
          return;
        }

        // Signup/recovery URL processing was previously completed by this
        // initial read. Keep that callback work, using the latest event
        // session rather than the stale response.
        applyInitialAuthCallback(latestAuthStateEventSession);
        return;
      }

      if (error) {
        if (initialAuthCallback.kind === "password_recovery") {
          markPasswordRecoveryInvalid();
          return;
        }

        setAuthStatus("確認エラー");
        setAuthError(getUserFacingError(error, ERROR_OPERATION.AUTH_SESSION));
        return;
      }

      activeSessionUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setAuthStatus(
        data.session
          ? "ログイン中"
          : [AUTH_CONFIRMATION_KIND.INVALID_LINK, "password_recovery_invalid"].includes(
                initialAuthCallback.kind,
              )
            ? "メール確認エラー"
            : "未ログイン",
      );
      applyInitialAuthCallback(data.session);
    }

    readSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      hasAuthStateEvent = true;
      latestAuthStateEventType = event;
      latestAuthStateEventSession = session;
      activeSessionUserIdRef.current = session?.user?.id ?? null;
      setSession(session);
      setAuthStatus(
        session
          ? "ログイン中"
          : [AUTH_CONFIRMATION_KIND.INVALID_LINK, "password_recovery_invalid"].includes(
                initialAuthCallback.kind,
              )
            ? "メール確認エラー"
            : "未ログイン",
      );

      if (event === "PASSWORD_RECOVERY") {
        applyPasswordRecoveryEventSession(session);
        return;
      }

      if (
        passwordRecoveryVerifiedUserIdRef.current &&
        passwordRecoveryVerifiedUserIdRef.current !== (session?.user?.id ?? null)
      ) {
        markPasswordRecoveryInvalid();
        return;
      }

      if (
        event === "SIGNED_IN" &&
        initialAuthCallback.kind === "signup_callback" &&
        !authCallbackResolvedRef.current
      ) {
        applyInitialAuthCallback(session);
      }
    });

    return () => {
      isMounted = false;
      if (recoveryResolutionTimer) {
        window.clearTimeout(recoveryResolutionTimer);
      }
      subscription.unsubscribe();
    };
  }, [initialAuthCallback.kind, initialAuthCallback.shouldCleanUrl]);

}
