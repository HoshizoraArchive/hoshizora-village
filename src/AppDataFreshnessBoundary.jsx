import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeActiveTabLabel,
  shouldRefreshAfterForeground,
  shouldRefreshForObserveStatus,
  shouldRestoreUiSnapshot,
} from "./appDataFreshness";

const FOREGROUND_SETTLE_DELAY_MS = 180;
const RESTORE_NAVIGATION_DELAY_MS = 120;
const RESTORE_SCROLL_DELAY_MS = 80;
const DRAFT_INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

function getActiveBottomNavigationButton() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector(
    'nav[aria-label="星空Village bottom navigation"] button[aria-current="page"]',
  );
}

function getActiveBottomNavigationLabel() {
  const button = getActiveBottomNavigationButton();
  return normalizeActiveTabLabel(button?.getAttribute("aria-label") || button?.textContent || "");
}

function findBottomNavigationButton(label) {
  if (!label || typeof document === "undefined") {
    return null;
  }

  return [...document.querySelectorAll('nav[aria-label="星空Village bottom navigation"] button')].find(
    (button) =>
      normalizeActiveTabLabel(button.getAttribute("aria-label") || button.textContent || "") === label,
  ) ?? null;
}

function hasVisibleOnboardingUi() {
  if (typeof document === "undefined") {
    return false;
  }

  if (document.querySelector(".onboarding-welcome, .onboarding-guide")) {
    return true;
  }

  return [...document.querySelectorAll("button")].some(
    (button) => button.textContent?.trim() === "ちあの案内を見る",
  );
}

function hasUnsavedLocalDraft() {
  if (typeof document === "undefined") {
    return false;
  }

  for (const control of document.querySelectorAll('input, textarea, [contenteditable="true"]')) {
    if (control.disabled || control.readOnly || control.getAttribute("aria-disabled") === "true") {
      continue;
    }

    if (control.matches('[contenteditable="true"]')) {
      if (control.textContent?.trim()) {
        return true;
      }
      continue;
    }

    if (control.tagName === "TEXTAREA") {
      if (control.value?.trim()) {
        return true;
      }
      continue;
    }

    const inputType = String(control.getAttribute("type") || "text").toLowerCase();
    if (DRAFT_INPUT_TYPES.has(inputType) && control.value?.trim()) {
      return true;
    }
  }

  return false;
}

function hasUnsafeLocalInteraction() {
  if (typeof document === "undefined") {
    return false;
  }

  const activeTabLabel = getActiveBottomNavigationLabel();
  if (activeTabLabel === "流星便") {
    return true;
  }

  if (
    document.querySelector('[aria-label="星影を切り取る"], [role="dialog"]') ||
    [...document.querySelectorAll("form")].some((form) => form.textContent?.includes("プロフィール編集"))
  ) {
    return true;
  }

  if (hasUnsavedLocalDraft()) {
    return true;
  }

  const activeElement = document.activeElement;
  return Boolean(
    activeElement?.matches?.('input, textarea, select, [contenteditable="true"]'),
  );
}

function captureUiSnapshot() {
  return {
    activeTabLabel: getActiveBottomNavigationLabel(),
    href: window.location.href,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

export default function AppDataFreshnessBoundary({ AppComponent }) {
  const [revision, setRevision] = useState(0);
  const hiddenAtRef = useRef(null);
  const pendingSnapshotRef = useRef(null);
  const refreshQueuedRef = useRef(false);
  const observeRefreshActiveRef = useRef(false);
  const foregroundTimerRef = useRef(null);

  const requestSoftRefresh = useCallback(() => {
    if (
      refreshQueuedRef.current ||
      hasVisibleOnboardingUi() ||
      hasUnsafeLocalInteraction()
    ) {
      return false;
    }

    refreshQueuedRef.current = true;
    pendingSnapshotRef.current = captureUiSnapshot();
    setRevision((current) => current + 1);
    return true;
  }, []);

  useEffect(() => {
    if (revision === 0) {
      return undefined;
    }

    refreshQueuedRef.current = false;
    const snapshot = pendingSnapshotRef.current;
    pendingSnapshotRef.current = null;

    if (!snapshot) {
      return undefined;
    }

    let scrollTimerId = null;
    const navigationTimerId = window.setTimeout(() => {
      if (
        !shouldRestoreUiSnapshot({
          beforeHref: snapshot.href,
          afterHref: window.location.href,
        })
      ) {
        return;
      }

      const targetButton = findBottomNavigationButton(snapshot.activeTabLabel);
      if (targetButton && targetButton.getAttribute("aria-current") !== "page") {
        targetButton.click();
      }

      scrollTimerId = window.setTimeout(() => {
        if (snapshot.href === window.location.href) {
          window.scrollTo({
            behavior: "auto",
            left: snapshot.scrollX,
            top: snapshot.scrollY,
          });
        }
      }, RESTORE_SCROLL_DELAY_MS);
    }, RESTORE_NAVIGATION_DELAY_MS);

    return () => {
      window.clearTimeout(navigationTimerId);
      if (scrollTimerId !== null) {
        window.clearTimeout(scrollTimerId);
      }
    };
  }, [revision]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const inspectObserveRefreshState = () => {
      const statusText = document.querySelector(".observe-timeline-refresh-status")?.textContent ?? "";
      const isRefreshing = shouldRefreshForObserveStatus(statusText);

      if (isRefreshing) {
        observeRefreshActiveRef.current = true;
        return;
      }

      if (!observeRefreshActiveRef.current) {
        return;
      }

      observeRefreshActiveRef.current = false;

      if (getActiveBottomNavigationLabel() === "観測") {
        requestSoftRefresh();
      }
    };

    const observer = new MutationObserver(inspectObserveRefreshState);
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    inspectObserveRefreshState();

    return () => observer.disconnect();
  }, [requestSoftRefresh]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const markHidden = () => {
      hiddenAtRef.current = Date.now();
      window.clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = null;
    };

    const scheduleForegroundRefresh = () => {
      if (document.visibilityState !== "visible" || hiddenAtRef.current === null) {
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      window.clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = window.setTimeout(() => {
        foregroundTimerRef.current = null;

        if (
          shouldRefreshAfterForeground({
            hiddenAt,
            now: Date.now(),
            visibilityState: document.visibilityState,
            onboardingVisible: hasVisibleOnboardingUi(),
            unsafeInteraction: hasUnsafeLocalInteraction(),
          })
        ) {
          requestSoftRefresh();
        }
      }, FOREGROUND_SETTLE_DELAY_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markHidden();
      } else if (document.visibilityState === "visible") {
        scheduleForegroundRefresh();
      }
    };

    const handlePageHide = () => markHidden();
    const handlePageShow = () => scheduleForegroundRefresh();
    const handleFocus = () => scheduleForegroundRefresh();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      window.clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = null;
    };
  }, [requestSoftRefresh]);

  return <AppComponent key={`app-data-freshness-${revision}`} />;
}
