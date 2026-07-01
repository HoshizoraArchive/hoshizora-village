# 星空Village Security Test Matrix

Use this matrix before beta release and after each security-related PR. Mark each row with `Pass`, `Fail`, `Blocked`, or `Not run`.

## Automated / Repository Checks

| ID | Area | Steps | Expected Result | Current Audit Status |
| --- | --- | --- | --- | --- |
| A-01 | Build | Run `npm run build` from a clean checkout. | Build succeeds without committing `dist/`. | Pass. Vite emitted the existing chunk-size warning for bundles over 500 kB |
| A-02 | Whitespace | Run `git diff --check`. | No trailing whitespace or conflict markers. | Pass |
| A-03 | Dependency tree | Run `npm ls`. | Dependency tree resolves without unmet dependencies. | Pass |
| A-04 | Dependency audit, prod | Run `npm audit --omit=dev --json`. | No high/critical production vulnerability, or documented mitigation. | Pass, 0 vulnerabilities reported |
| A-05 | Dependency audit, full | Run `npm audit --json`. | No high/critical vulnerability, or documented mitigation. | Blocked by sandbox DNS/approval |
| A-06 | Secrets, current tree | Search current tree for high-confidence secret patterns without printing values. | No committed secret values. | Pass |
| A-07 | Secrets, history spot-check | Search git history for high-confidence secret patterns without printing values. | No committed secret values. | Pass |
| A-08 | Dangerous browser APIs | Search for `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`. | No unsafe rendering/eval usage in app code. | Pass |
| A-09 | Generated artifacts | Check tracked files and status. | `node_modules/`, `dist/`, local `.env`, and local lock churn are ignored/not staged. | Risk: no tracked `.gitignore`; local untracked artifacts exist |

## Supabase SQL Editor Verification

Run `docs/security-verification.sql` in the target Supabase project and record aggregate results only. Do not paste private row contents or secret values into public reports.

| ID | Area | SQL Sections | Expected Result | Status |
| --- | --- | --- | --- | --- |
| S-01 | RLS enabled | `01_rls_status` | All app tables have RLS enabled. | Needs live verification |
| S-02 | Relation grants | `02_relation_privileges_aclexplode`, `02b_schema_privileges_aclexplode` | `PUBLIC`, `anon`, and `authenticated` privileges are visible and intended. | Needs live verification |
| S-03 | Column grants | `03_column_privileges_explicit_aclexplode` | Explicit column privileges are visible; `notifications` update remains limited to `is_read`. | Needs live verification |
| S-04 | Default privileges | `03b_default_privileges` | No unexpected default grants to `PUBLIC`, `anon`, or `authenticated`. | Needs live verification |
| S-05 | Public schema inventory | `03c_public_schema_object_inventory` | All public schema tables, partitioned tables, views, materialized views, sequences, foreign tables, and functions are known and intended. | Needs live verification |
| S-06 | RLS anomaly extraction | `03d_rls_anomalies`, `03e_browser_role_write_grants` | No RLS-enabled zero-policy tables, no policy-on-disabled-RLS tables, no unexpected disabled-RLS tables, and no unexpected `PUBLIC`, `anon`, or `authenticated` write grants. | Needs live verification |
| S-07 | Policy drift | `04_policies` | Live policy definitions match intended repository policy set. | Needs live verification |
| S-08 | Security definer hygiene | `05_security_definer_functions`, `06_function_execute_privileges` | Security-definer functions use safe search path, and any `PUBLIC`, `anon`, or `authenticated` EXECUTE grants are intended. | Needs live verification |
| S-09 | Storage buckets | `08_storage_buckets` | Bucket public/private, MIME, and size settings match product intent. | Needs live verification |
| S-10 | Storage object shape | `09_storage_object_counts` | Object paths start with UUID folders; no unexpected bucket objects. | Needs live verification |
| S-11 | Orphan storage | `10_unreferenced_meteor_storage_objects` | No unexpected orphan media objects, or accepted cleanup backlog exists. | Needs live verification |
| S-12 | Media metadata | `11_post_media_metadata_quality`, `12_post_media_visibility_shape` | Metadata has valid shape and no unexpected deleted/private exposure. | Needs live verification |
| S-13 | Deleted posts | `13_deleted_post_counts`, `14_child_rows_on_deleted_posts` | Deleted rows are not publicly exposed or actionable. | Needs live verification |
| S-14 | Observations | `15_observation_counts`, `16_public_post_observation_counts` | No internal AI rows are exposed through public table reads. | Needs live verification |
| S-15 | Oversized content | `17_oversized_content` | No oversized rows beyond UI limits, or cleanup plan exists. | Needs live verification |
| S-16 | Resonance spam | `18_duplicate_resonances` | Duplicate resonance count matches intended MVP behavior. | Needs live verification |
| S-17 | Notifications | `20_notification_shape` | No self-notification or invalid type anomalies. | Needs live verification |
| S-18 | Realtime exposure | `22_publication_tables` | No unintended tables are published to Realtime. | Needs live verification |

## Manual Browser and API Checks

Use at least two test accounts: `User A` and `User B`.

| ID | Area | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| M-01 | Auth signup/login | Create/login/logout with test accounts. | Sessions work and no sensitive data appears in console logs. | Not run |
| M-02 | Profile visibility | As anon and as another user, open `/stars/:username`. | Only intended public profile fields are visible. | Not run |
| M-03 | Profile settings privacy | Query profile data as anon/authenticated through browser client. | Notification settings are either intentionally public or hidden by a safe view. | Not run |
| M-04 | Post public read | User A creates public post; User B views observe/detail/profile/archive paths. | Public content works in all intended surfaces. | Not run |
| M-05 | Soft-delete public post | User A soft-deletes a public post; User B tries detail URL and direct Supabase select. | UI shows deleted state; direct API does not expose deleted body/media unless explicitly intended. | Not run |
| M-06 | Private post | If UI/API can create private posts, User B tries direct post/media access. | User B cannot read private post body or media metadata. | Not run |
| M-07 | Public media direct URL | Copy media URL, delete/private the post, then open URL as anon. | Behavior matches documented product intent; if private deletion is expected, URL no longer works. | Not run |
| M-08 | Media path spoofing | Attempt to insert `post_media` row pointing to another user's known public path. | Insert fails or the media is not rendered. | Not run |
| M-09 | Image upload validation | Try jpg/png/webp, HEIC, SVG, HTML renamed as jpg, and oversized files. | Only allowed content is accepted; errors are user-readable. | Not run |
| M-10 | Video upload validation | Try mp4/mov/webm, oversized files, long duration, and unsupported codecs. | Limits and trimming rules hold; failed uploads are cleaned up. | Not run |
| M-11 | URL link safety | Post text with `https://`, `http://`, `javascript:`, URL fragments, and long URLs. | Only http/https links are clickable; no layout overflow; no unsafe schemes. | Not run |
| M-12 | YouTube embed safety | Post valid YouTube URLs and malformed lookalikes. | Only valid video ids embed via `youtube-nocookie.com`; malformed URLs remain safe text/link. | Not run |
| M-13 | Suno card safety | Post valid Suno URLs and non-Suno URLs. | Only Suno URLs show the Suno card; other URLs remain links. | Not run |
| M-14 | Meteor tag validation | Create, edit, and delete posts with 0, 1, 3, 4, duplicate, long, and URL-fragment tags. | Max 3 tags, 30 chars, no URL-fragment false positives, DB relations match body. | Not run |
| M-15 | Star letters | User B comments on User A post; edit/delete own letter; try oversized/direct API. | Only own star letters are mutable; DB rejects or flags oversized content after hardening. | Not run |
| M-16 | Resonance spam | User B repeatedly resonates with User A post. | Behavior matches intended product design; notification volume does not become abusive. | Not run |
| M-17 | Archive privacy | User B archives User A post; User A and anon attempt to read User B archive rows. | Archive rows are readable only by owner. | Not run |
| M-18 | Notifications | Trigger resonance/archive/star letter and read notifications as recipient/non-recipient. | Recipient can read/update `is_read`; others cannot read/update. | Not run |
| M-19 | Feedback privacy | User A sends feedback; User B tries to list/read it. | Feedback is readable only by sender and admin/server contexts. | Not run |
| M-20 | CSP report-only dry run | Add candidate report-only CSP in a temporary deploy. | App functions while violations identify missing allowlist origins. | Not run |
| M-21 | PWA/install | Install on iPhone home screen and Android. | No white safe-area flash; auth and media flows still work. | Not run |
| M-22 | Console/log review | Exercise auth, upload, post, notification, profile, and delete flows. | No secrets, tokens, signed URLs, or internal SQL errors are logged. | Not run |

## Dashboard Checks

| ID | Area | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| D-01 | Supabase Auth email | Check email confirmation and redirect URLs. | Matches beta invite/auth policy. | Needs live verification |
| D-02 | Supabase Auth rate limits | Check sign-up, OTP/email, password reset, and token refresh limits. | Limits are enabled and documented for beta. | Needs live verification |
| D-03 | CAPTCHA/bot protection | Check provider configuration. | Bot protection is enabled or a beta invite gate exists. | Needs live verification |
| D-04 | Supabase API keys | Check exposed frontend values. | Frontend uses only anon/publishable key; service-role key appears only in server/dashboard secret contexts. | Needs live verification |
| D-05 | Storage buckets | Compare Dashboard bucket settings to repository SQL. | Public/private, MIME, and file size settings match intent. | Needs live verification |
| D-06 | Netlify env vars | Review deploy-preview and production env vars. | No service-role, secret, database password, or provider secret is exposed to Vite/browser env. | Needs live verification |
| D-07 | Netlify headers | Inspect deployed headers. | Security headers match repo and CSP rollout plan. | Needs live verification |
| D-08 | GitHub branch protection | Check main protections and required checks. | PR review/build required before merge. | Needs live verification |
