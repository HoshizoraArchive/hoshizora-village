# PR #98 manual retest

Deploy Preview:

- https://deploy-preview-98--hoshizora-village.netlify.app

## 2026-07-27 UI feedback revision

The following behavior was added after the first iPhone Safari walkthrough:

- My Const. editor guidance now advances through display name, avatar, avatar crop, biography, My Star Chart, and save.
- Biography and My Star Chart may be deferred with an “あとで” action.
- Avatar crop guidance replaces the stale “My Const.へ行こう” dialogue while the crop modal is open.
- Operation guidance uses a compact dialogue, automatically moves opposite the highlighted target, and can be collapsed.
- Archive confirmation highlights the archived post while placing the compact guide away from it.
- iPhone Safari explains Share → Add to Home Screen instead of instructing the user to press disabled notification controls.
- iPhone users may defer notification setup and continue; launching the installed PWA resumes the persisted Re:Connect step when it has not been skipped.

## Manual retest account

The existing preview-only account has been reset to `welcome_video` and its profile, Archive, post, push registration, and completed onboarding state were removed from the preview Supabase project. Production data was not changed.

Retest the following:

1. Open the profile editor and confirm each field is highlighted separately.
2. Open avatar crop and confirm the crop-specific message appears at the top without blocking controls.
3. Use “自己紹介はあとで” and “My Star Chartはあとで”.
4. Confirm the save button is the final highlighted profile control.
5. Confirm Archive guidance is compact and does not cover the target post.
6. In normal iPhone Safari, confirm the Home Screen instructions replace the disabled push instruction.
7. Add the Preview to the Home Screen, relaunch it, and confirm notification controls become the main guidance.
8. Confirm “小さく” collapses the guide and “ちあの案内を見る” restores it.
