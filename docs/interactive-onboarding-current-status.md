# Interactive onboarding current status

- PR: #98
- Latest verified preview commit: pending after environment repair
- Deploy Preview: https://deploy-preview-98--hoshizora-village.netlify.app
- PR state: Draft / mergeable

## Latest implementation

- Step-by-step My Const. guidance
- Avatar crop-specific guidance
- Optional biography and My Star Chart guidance
- Compact operation dialogue and collapse control
- Target-aware top/bottom placement
- iPhone Safari Home Screen installation instructions
- Deferred notification setup option

## Verification

- Netlify build passed before the environment repair.
- JSX transpile syntax check passed.
- Three new focused guide regression tests passed.
- Preview test account reset to the Welcome step.
- The Deploy Preview `SUPABASE_URL`, `VITE_SUPABASE_URL`, publishable key, and service-role key now belong to the same isolated Preview Supabase project.
- The prior `INVALID_TOKEN` during iOS PWA device registration was caused by a Production service-role key paired with the Preview Supabase URL.
- Temporary key-transfer storage and functions were removed or locked immediately after the Preview-only repair.
- Production database, Production environment values, and Production deployment were not changed.

## Still manual

- Retest the revised layout on iPhone.
- Confirm device registration after the Preview environment repair.
- Confirm real Push from the installed iOS PWA.
- Confirm Android notification behavior.
- Confirm the completed Welcome video once its asset is available.
