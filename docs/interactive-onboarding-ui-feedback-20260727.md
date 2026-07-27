# Interactive onboarding UI feedback — 2026-07-27

Implemented on PR #98 after the first iPhone walkthrough.

## My Const.

- The guide now follows the actual editor state instead of keeping the initial “My Const.へ行こう” message open.
- Guidance order:
  1. Display name
  2. Avatar selection
  3. Avatar crop position and zoom
  4. Biography
  5. My Star Chart
  6. Save
- Biography and My Star Chart can be deferred.
- Display name and avatar remain required before the onboarding can advance because the server-side transition verifies both saved values.

## Guide size and placement

- Operation steps use a compact layout.
- The guide is positioned opposite the highlighted target when possible.
- The user can collapse the guide to a small Chia button and restore it later.
- Archive confirmation now uses the archived post as the target while keeping the guide compact.

## iPhone notification guidance

- Normal iPhone Safari no longer tells the user to press disabled notification buttons.
- Chia explains Safari Share → “ホーム画面に追加” → launch the added 星空Village icon.
- The user may view a three-step instruction card or defer notification setup.
- Installed iOS PWA continues to use the normal notification permission → device registration → test notification flow.

## Verification

- JSX transpile syntax check: passed.
- New focused regression tests: 3 passed.
- Netlify Deploy Preview build: passed at commit `24bddac2d8462189d79cc22242f9041e8fb0751c`.
- The preview-only walkthrough account was reset to `welcome_video` after removing its profile, Archive, post, push registration, and completion data.
- Production Supabase and Production deploy were not changed.
