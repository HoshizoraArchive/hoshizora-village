# Beta Opening Memorial profile frame

- Target: profiles in `profile_cohorts` with `cohort_key = 'beta_resident'`.
- Asset: `/profile-frames/opening-memorial.png`.
- Frame key: `opening_memorial_beta`.
- Ownership source: `beta_resident`.
- Existing `active_frame_id` values are preserved; only profiles with no active frame are auto-equipped.
- Existing profile-frame ownership and active-frame validation remain unchanged.
- The supplied 1024x1024 RGBA artwork is normalized by cropping only its excess transparent canvas (`x=89`, `y=30`, `869x869`) and resizing that crop back to 1024x1024. The artwork itself is not redrawn or regenerated.
- The normalized artwork uses one shared `frame_scale = 1.15` with zero offsets across every avatar size. `AvatarFrame` keeps the avatar at 100% size and overlays the frame at its outer edge; no size-specific CSS is used. The existing `chia_guide` metadata remains unchanged at `1.22`.
- Future cohort members are granted safely by invoking `grant_opening_memorial_to_beta_residents()` with `service_role`. The RPC is idempotent and is not executable by browser roles.
- The source artwork SHA-256 is `c1cc264c0fd73fe0d30a1ab9496c01dbad721fb132466249799e9c51343b4391`; the normalized public asset SHA-256 is `243bf8a5dc65ef6db9087c26ee2027c878c2e817540fd87c119dde2ca332b0e3`.

## Deploy Preview visual evidence

The screenshots below were captured directly from the Draft PR Deploy Preview and use its actual profile/post/star-letter components at a 390x844 iPhone-sized viewport with device scale 3. Only API responses and the portrait are safe synthetic fixtures; no Production profile data is copied into the Preview.

The original 64px and 36px evidence was captured before the frame PNG had completed decode and compositor painting. Direct-Preview verification also requires the Preview-v2 Supabase Auth storage key name; without it the authentication panel remains in front of the fixture and a fixed viewport layer can clip an element-only screenshot. The corrected harness supplies that public storage key name, waits for both images to decode and for two animation frames, and saves both the exact frame-image bounds and an uncropped 390x844 viewport. This proves the overlay detail and the real in-page composition without relying on the faulty capture state.

Reproduce against a ready Draft Deploy Preview with `playwright.deploy-preview.config.mjs`, `DEPLOY_PREVIEW_URL`, `PROFILE_FRAME_AUTH_STORAGE_KEY`, and a temporary `OPENING_MEMORIAL_SCREENSHOT_DIR`. The config rejects Production and non-Deploy-Preview hosts.

- [Profile avatar detail (64px)](assets/opening-memorial/opening-memorial-large-profile.png)
- [Profile at 390x844](assets/opening-memorial/opening-memorial-large-profile-iphone.png)
- [Meteor letter avatar detail (48px)](assets/opening-memorial/opening-memorial-medium-post.png)
- [Star letter avatar detail (36px)](assets/opening-memorial/opening-memorial-small-star-letter.png)
- [Star letter at 390x844](assets/opening-memorial/opening-memorial-small-star-letter-iphone.png)
