const OLD_HEADER_EDIT = `          {profile.canEdit && (
            <button
              className="min-h-9 rounded-full border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
              data-onboarding-target={profile.onboardingTarget === "profile-edit" ? "profile-edit" : undefined}
              disabled={profile.loading}
              onClick={profile.onStartEdit}
              type="button"
            >
              {profile.loading ? "読込中" : "編集"}
            </button>
          )}
`;

const OLD_SHARE = `        {profile.canEdit && (
          <button
            className="mt-4 min-h-10 w-full rounded-2xl border border-comet/30 bg-comet/10 px-4 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canShareStarProfile}
            onClick={() => profile.onShareProfile(profile.data?.username)}
            type="button"
          >
            星座URLを共有
          </button>
        )}
`;

const NEW_ACTIONS = `        {profile.canEdit && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-3 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canShareStarProfile}
              onClick={() => profile.onShareProfile(profile.data?.username)}
              type="button"
            >
              プロフィールを共有
            </button>
            <button
              className="min-h-10 rounded-2xl border border-comet/30 bg-comet/10 px-3 text-xs font-black text-comet transition hover:bg-comet/15 disabled:cursor-not-allowed disabled:opacity-60"
              data-onboarding-target={profile.onboardingTarget === "profile-edit" ? "profile-edit" : undefined}
              disabled={profile.loading}
              onClick={profile.onStartEdit}
              type="button"
            >
              {profile.loading ? "読込中" : "プロフィールを編集"}
            </button>
          </div>
        )}
`;

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

export function applyProfileActionLayout(source) {
  const headerCount = occurrenceCount(source, OLD_HEADER_EDIT);
  const shareCount = occurrenceCount(source, OLD_SHARE);

  if (headerCount !== 1 || shareCount !== 1) {
    throw new Error(
      `Profile action layout source changed unexpectedly (header=${headerCount}, share=${shareCount}). Refusing to transform.`,
    );
  }

  return source.replace(OLD_HEADER_EDIT, "").replace(OLD_SHARE, NEW_ACTIONS);
}
