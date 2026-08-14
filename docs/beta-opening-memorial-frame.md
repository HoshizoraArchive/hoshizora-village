# Beta Opening Memorial profile frame

- Target: profiles in `profile_cohorts` with `cohort_key = 'beta_resident'`.
- Asset: `/profile-frames/opening-memorial.png`.
- Frame key: `opening_memorial_beta`.
- Ownership source: `beta_resident`.
- Existing `active_frame_id` values are preserved; only profiles with no active frame are auto-equipped.
- Existing profile-frame ownership and active-frame validation remain unchanged.
- The supplied 1024x1024 RGBA artwork is normalized by cropping only its excess transparent canvas (`x=89`, `y=30`, `869x869`) and resizing that crop back to 1024x1024. The artwork itself is not redrawn or regenerated.
- The normalized artwork uses the same `frame_scale = 1.22` and zero offsets as `chia_guide`; `AvatarFrame` keeps the avatar at 100% size and overlays the frame outside it.
- Future cohort members are granted safely by invoking `grant_opening_memorial_to_beta_residents()` with `service_role`. The RPC is idempotent and is not executable by browser roles.
- The source artwork SHA-256 is `c1cc264c0fd73fe0d30a1ab9496c01dbad721fb132466249799e9c51343b4391`; the normalized public asset SHA-256 is `243bf8a5dc65ef6db9087c26ee2027c878c2e817540fd87c119dde2ca332b0e3`.
