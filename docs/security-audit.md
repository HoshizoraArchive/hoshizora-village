# 星空Village Security Audit

Audit date: 2026-07-01  
Repository: `HoshizoraArchive/hoshizora-village`  
Audit branch: `codex/security-audit-hoshizora-village`  
Base checked: `main` at `9d38429`

## Scope

This PR is audit-only. It does not change application behavior, runtime code, database schema, RLS policies, Storage policies, migrations, dependencies, or Netlify settings.

Reviewed areas:

- React/Vite frontend code in `src/`
- Supabase client usage
- Supabase schema and migration SQL in `supabase/`
- Netlify headers and PWA-facing static config
- File upload, URL rendering, YouTube/Suno embeds, media display, and notification paths
- Dependency and secret-scan evidence available from the local workspace

Not verified live in this environment:

- Supabase Dashboard Auth settings
- Supabase live RLS/policy drift versus repository SQL
- Supabase live Storage object contents and orphan object counts
- Netlify production environment variables and deployed headers
- Abuse/rate-limit settings in provider dashboards

Those items are marked `Needs live verification`.

## Executive Summary

Beta readiness judgment: `BLOCKED`

Reason: the repository SQL contains confirmed high-risk authorization/privacy issues around soft-deleted public posts, public observations, and public media buckets. Even if the UI hides these states, RLS and public Storage URLs can still expose data or allow actions when the caller knows identifiers/URLs.

Finding counts:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Medium | 7 |
| Low | 3 |
| Info / Needs live verification | 6 |

Priority before beta:

1. Fix RLS so deleted posts and child rows are not publicly readable or actionable.
2. Stop exposing AI/internal `observations` columns directly from the public table.
3. Decide whether user media buckets can remain public. If private/deleted media should be protected, move to signed URLs or a gated delivery path.
4. Run `docs/security-verification.sql` against the live Supabase project and record the results before making a release decision.

## Confirmed Findings

### SEC-001: Deleted public posts remain selectable through `posts_select_visible`

Severity: High  
Status: Confirmed from repository SQL  
Beta blocker: Yes

Evidence:

- `public.posts` has a soft delete column: `deleted_at timestamptz`.
- `posts_select_visible` allows read when `visibility = 'public' or author_id = auth.uid()`.
- The policy does not require `deleted_at is null`.
- UI query helpers attempt to filter deleted posts, but RLS is the security boundary.

Impact:

- A deleted public post can still be read directly through the Supabase API if the caller knows or enumerates the post id.
- The detail page behavior and UI hiding are not sufficient security controls.

Recommended fix PR:

- Change `posts_select_visible` to allow public reads only for `visibility = 'public' and deleted_at is null`.
- Keep owner access if the product intentionally lets authors view deleted posts, or deny all deleted reads if not needed.
- Update all child-table policies that depend on post visibility to include `p.deleted_at is null` for public/non-owner access.

### SEC-002: Child-table policies can expose or allow actions on deleted posts

Severity: Medium  
Status: Confirmed from repository SQL  
Beta blocker: Yes if deleted content must be hidden

Affected policies:

- `resonances_select_visible`
- `resonances_insert_logged_in`
- `star_letters_select_visible`
- `star_letters_insert_logged_in`
- `archives_insert_own`
- `observations_select_visible`
- `observations_insert_human_own`
- legacy `post_tags_select_visible`

These policies use post visibility checks that omit `p.deleted_at is null`.

Impact:

- Users may read or create child records against deleted public posts.
- This can re-surface deleted content through related data, counters, notifications, or detail fetches.

Recommended fix PR:

- Add `p.deleted_at is null` to public/non-owner child-table read and insert policies.
- Decide separately whether the original author can still read/delete related data after soft deletion.

### SEC-003: `observations` public policy exposes future AI/internal columns

Severity: High  
Status: Confirmed from repository SQL  
Beta blocker: Yes before AI observation data is stored

Evidence:

- `public.observations` includes internal/future AI-oriented columns such as `ai_resident_key`, `analysis_summary`, `observed_points`, `recommendation_message`, `x_post_draft`, `archive_tags`, and `work_constellation`.
- `observations_select_visible` allows selecting rows linked to visible posts.
- RLS controls rows, not individual columns. The repository comment says the app/API should filter columns, but clients can still select table columns granted by the database unless column privileges or views are used.

Impact:

- Future AI analysis, recommendation drafts, or operational notes could become readable from the browser client.

Recommended fix PR:

- Revoke direct client `select` from `public.observations`, or grant only safe columns.
- Prefer a public read view with an explicit safe column list, plus a private/server-only table for AI internals.
- Add tests that anon/authenticated users cannot select internal observation columns.

### SEC-004: Public media buckets bypass post/media RLS once URLs are known

Severity: High  
Status: Confirmed from repository SQL  
Beta blocker: Yes if private/deleted media must not remain accessible by URL

Evidence:

- `avatars`, `meteor-media`, and `meteor-video` buckets are configured as public buckets.
- `meteor_media_public_read` and `meteor_video_public_read` allow public object reads by bucket.
- `post_media_select_visible` correctly checks `p.visibility = 'public' and p.deleted_at is null`, but Storage object reads do not consult `post_media` or `posts`.

Impact:

- Media from deleted posts, private posts, or orphaned rows may still be accessible to anyone who has the object URL.
- Soft-deleting a post hides app UI but does not revoke public object access.

Recommended fix PR:

- If public permalink behavior is intended, document it clearly to users.
- If deletion/private visibility should protect media, make `meteor-media` and `meteor-video` private and use signed URLs or a server-side delivery path.
- Add cleanup or access-revocation behavior for soft-deleted posts.

### SEC-005: `post_media` RLS does not bind metadata paths to the user's Storage folder

Severity: Medium  
Status: Confirmed from repository SQL  
Beta blocker: No, but should be fixed before wider beta

Evidence:

- Storage object insert policies enforce `(storage.foldername(name))[1] = auth.uid()::text`.
- `post_media_insert_own_post` checks `uploader_id = auth.uid()` and that the post is authored by the caller.
- It does not check that `storage_path` or `thumbnail_storage_path` starts with the caller's user id folder.

Impact:

- A caller can create a post_media metadata row pointing at another known public object path, because the metadata policy does not validate path ownership.
- With public buckets, this can re-publish or misattribute media the caller did not upload.

Recommended fix PR:

- Add check constraints or RLS `with check` predicates that require the first path segment of `storage_path` and `thumbnail_storage_path` to match `auth.uid()::text`.
- Consider separate constraints for image and video buckets.

### SEC-006: File validation is mostly client-side and MIME-based

Severity: Medium  
Status: Confirmed from frontend and Storage SQL  
Beta blocker: No

Evidence:

- Frontend checks `file.type` and size before upload.
- Storage bucket `allowed_mime_types` and `file_size_limit` help enforce MIME and size.
- Meteor image uploads are stored raw. Avatar crops and generated video covers are re-encoded, but image post attachments are not re-encoded or metadata-stripped.

Impact:

- Browser-provided MIME types and Storage metadata are useful but not a full content validation layer.
- EXIF metadata, polyglot files, or malformed files may be accepted depending on Storage behavior and browser rendering.

Recommended fix PR:

- For beta, document accepted file types and keep current limits.
- Before broad release, add server-side validation/re-encoding for image uploads and stricter video processing checks.
- Consider stripping metadata from image attachments.

### SEC-007: Important content limits are UI-only

Severity: Medium  
Status: Confirmed from frontend constants and schema constraints  
Beta blocker: No

Evidence:

- Frontend limits posts to 500 chars and star letters to 500 chars.
- `public.posts.body` has no 500-character check.
- `public.star_letters.body` only checks non-empty content.
- `feedbacks.body` correctly has a 1000-character DB constraint.

Impact:

- Direct API clients can create oversized posts or star letters, causing rendering, moderation, and database-growth issues.

Recommended fix PR:

- Add DB constraints for the same limits enforced in the UI.
- Add safe truncation/error behavior for clients receiving legacy oversized content.

### SEC-008: Abuse controls are incomplete for beta traffic

Severity: Medium  
Status: Confirmed in repository for app/DB; Dashboard rate limits need live verification  
Beta blocker: Conditional

Evidence:

- `resonances` intentionally allows repeated rows for the same `(post_id, profile_id)`.
- No DB-level rate limits or cooldown tables exist for posts, star letters, feedbacks, archives, tag creation, or uploads.
- Supabase Auth rate limits and CAPTCHA settings are Dashboard-only and were not live-verified.

Impact:

- A logged-in user can generate high-volume data, notifications, and Storage usage.
- Repeated resonance can inflate counts and notification volume unless controlled elsewhere.

Recommended fix PR:

- Add unique or throttle controls for resonance behavior if "one user, one resonance per post" is desired.
- Add beta operational runbook limits: account invite gating, Supabase Auth rate limits, Storage quotas, and moderation process.

### SEC-009: Netlify headers lack CSP and other browser hardening headers

Severity: Medium  
Status: Confirmed from `netlify.toml`; deployed headers need live verification  
Beta blocker: No

Evidence:

- `netlify.toml` sets `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.
- There is no Content-Security-Policy, Permissions-Policy, or HSTS header in repo config.

Impact:

- XSS impact would be larger without CSP.
- Current code avoids direct HTML injection, but CSP is still a useful defense-in-depth control for user-generated content and embeds.

Recommended fix PR:

- Add a report-only CSP first, including Supabase, YouTube nocookie, Suno/external navigation, images/media from Supabase Storage, and Vite/Netlify requirements.
- Tighten to enforcing CSP after the report-only phase.

### SEC-010: Migration baseline is incomplete

Severity: Medium  
Status: Confirmed from repository files  
Beta blocker: Conditional

Evidence:

- `supabase/schema.sql` contains the full expected schema.
- `supabase/migrations/` only includes feature migrations from notifications onward. It does not include a complete initial baseline migration for core tables such as `profiles`, `posts`, `archives`, `star_letters`, `observations`, legacy `profile_tags`, and legacy `post_tags`.

Impact:

- Rebuilding a new Supabase project from migrations alone may miss core schema.
- Live schema drift is harder to detect.

Recommended fix PR:

- Add a documented baseline migration or an explicit "schema.sql is baseline" runbook.
- Add live schema verification to release checks.

### SEC-011: Dependency reproducibility is weak

Severity: Medium  
Status: Confirmed from repository files  
Beta blocker: No

Evidence:

- `package.json` uses ranged dependency versions.
- No tracked `package-lock.json` was found.
- No tracked `.gitignore` was found.
- Local workspace contains untracked `node_modules/`, `dist/`, and `package-lock.json`.

Impact:

- CI and developer machines may resolve different package versions.
- Generated files can be accidentally included in future PRs.

Recommended fix PR:

- Add and commit a lockfile created from the intended dependency set.
- Add `.gitignore` entries for `node_modules/`, `dist/`, `.env`, and local build artifacts.

### SEC-012: Public profile policy exposes all profile columns

Severity: Low  
Status: Confirmed from repository SQL  
Beta blocker: No

Evidence:

- `profiles_select_public` uses `for select using (true)`.
- Current profile columns include `notify_authors_when_i_archive` and `notify_authors_when_i_resonate`.

Impact:

- Notification preference flags are publicly readable.
- Future sensitive profile columns would be exposed unless policy/grants are revisited.

Recommended fix PR:

- Use a public profile view with an explicit safe column list for timelines and `/stars/:username`.
- Keep private/account settings on a separate table or restrict column grants.

### SEC-013: Legacy tag tables have weaker validation than meteor tags

Severity: Low  
Status: Confirmed from repository SQL  
Beta blocker: No

Evidence:

- `profile_tags.label` and legacy `post_tags.label` require non-empty text but do not enforce a max length.
- New `meteor_tags` does enforce a 30-character max.

Impact:

- If legacy tag UI or direct API access remains usable, oversized labels can be stored.

Recommended fix PR:

- Confirm whether legacy tables are still used.
- Add length constraints or remove/deprecate old flows.

### SEC-014: Security-definer trigger functions use safer settings, but live verification is still required

Severity: Info  
Status: Repository SQL looks good; live verification required

Evidence:

- Notification trigger functions are in `app_private`, use `security definer`, set `search_path = ''`, and revoke execute from `public`, `anon`, and `authenticated`.

Remaining live checks:

- Confirm live functions exactly match repository SQL.
- Confirm no older function versions or policies remain.

### SEC-015: Current source search found no committed secret values

Severity: Info  
Status: Current tree and safe history spot-check found no high-confidence secret value matches

Evidence:

- Current tree contains `.env.example` placeholders and client-side `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` usage.
- Safe history search for high-confidence key patterns returned no file matches.
- Commits containing the string `service_role` are documentation/schema comments warning not to expose service-role keys.

Remaining live checks:

- Check GitHub repository secrets, Netlify environment variables, and Supabase Dashboard keys outside this PR.
- Do not paste secret values into issues, PRs, or logs.

## Positive Controls Observed

- Supabase client uses anon/public environment variables only.
- Notification table client insert is not granted; trusted triggers create rows.
- `notifications` update is restricted to the `is_read` column.
- `feedbacks` rows are readable only by their submitting user.
- `post_meteor_tags` policies include `p.deleted_at is null` for public reads.
- External links use `target="_blank"` with `rel="noopener noreferrer"`.
- The app does not use `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or `new Function` in the checked source tree.
- YouTube embeds use `youtube-nocookie.com` and validate the extracted video id against an 11-character allowlist.
- User-uploaded Storage paths generated by the app use `auth.uid()` as the first folder and random ids rather than raw file names.

## Command Results

Executed:

- `git fetch origin main`: success
- `git merge --ff-only origin/main`: success
- Branch created: `codex/security-audit-hoshizora-village`
- `npm run build`: success. Vite emitted the existing chunk-size warning for bundles over 500 kB.
- `git diff --check`: success
- `npm ls`: success
- `npm audit --omit=dev --json`: success, 0 reported vulnerabilities
- High-confidence current-tree secret scan: no secret value matches
- High-confidence history spot-check: no secret value file matches

Could not complete:

- `npm audit --json`: the first run failed with `ENOTFOUND registry.npmjs.org` in the sandbox. Escalated retry was not approved by the automated reviewer, so the full audit including dev dependency context remains `Not completed in this environment`.

## Required Live Verification

Run `docs/security-verification.sql` in the Supabase SQL Editor for the beta project and save the result summary outside the repository without secret values.

Also check these dashboard-only settings:

- Supabase Auth email confirmation setting
- Password minimum and policy settings
- OAuth providers enabled
- Auth rate limits
- CAPTCHA/bot protection
- Storage bucket settings in Dashboard match repository SQL
- Netlify production and deploy-preview environment variables contain only publishable/anon client keys
- Netlify deployed response headers match intended headers

## Recommended Follow-up PRs

1. `[security] RLS soft-delete hardening`
   - Fix `posts_select_visible` and child-table policies to consistently enforce `deleted_at is null` for public/non-owner access.

2. `[security] Observations public view split`
   - Move public observation reads behind a safe-column view or revoke direct table select from clients.

3. `[security] Media access model decision`
   - Decide public versus private media delivery, then implement signed URLs or cleanup/revocation if deleted/private media must be protected.

4. `[security] DB constraints for UI limits`
   - Add DB constraints for post/star-letter body length and legacy tag lengths.

5. `[security] CSP report-only`
   - Add a report-only Content-Security-Policy and document allowed origins.

6. `[build] Lock dependency graph`
   - Commit a lockfile and `.gitignore`, then re-run audits from a clean checkout.

7. `[security] Abuse controls`
   - Add anti-spam/rate-limit strategy for resonances, star letters, feedbacks, media uploads, and tag creation.
