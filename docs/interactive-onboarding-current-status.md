# Interactive onboarding current status

- PR: #98
- Latest verified preview commit: `fd63586b7c56f758ef3e1335fff48a48cf151d9c`
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

- Netlify build passed.
- JSX transpile syntax check passed.
- Three new focused guide regression tests passed.
- Preview test account reset to the Welcome step.
- Production database and deployment were not changed.

## Still manual

- Retest the revised layout on iPhone.
- Confirm notification permission and real Push from the installed iOS PWA.
- Confirm Android notification behavior.
- Confirm the completed Welcome video once its asset is available.
