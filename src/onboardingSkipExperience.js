import { supabase } from "./lib/supabaseClient";

export const ONBOARDING_SKIP_LABEL = "案内をすべてスキップ";
export const ONBOARDING_SKIP_LOADING_LABEL = "案内を終了中...";
export const ONBOARDING_SKIP_HELPER = "あとから「はじめての入村案内」で見返せます";
export const ONBOARDING_SKIP_ERROR_MESSAGE = "案内を終了できませんでした。もう一度お試しください。";
export const ONBOARDING_SKIP_CONFIRM_MESSAGE =
  "ちあの入村案内をすべてスキップして、星空Villageを始めますか？\n\n案内はあとからMy Universeの「はじめての入村案内」で見返せます。";

export function isSuccessfulOnboardingSkipResult(data) {
  return Boolean(
    data?.progress && ["advanced", "already_completed"].includes(data?.outcome),
  );
}

export async function requestSkipAllOnboarding({ confirm = window.confirm } = {}) {
  if (!confirm(ONBOARDING_SKIP_CONFIRM_MESSAGE)) {
    return { outcome: "cancelled" };
  }

  const { data, error } = await supabase.rpc("advance_initial_onboarding", {
    p_action: "skip_all",
    p_status: null,
    p_target_id: null,
  });

  if (error || !isSuccessfulOnboardingSkipResult(data)) {
    return { outcome: "failed" };
  }

  return { outcome: "succeeded" };
}
