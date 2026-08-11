import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  PROFILE_TITLES_RELATION_SELECT,
  getPrimaryProfileTitle,
  normalizeProfileTitles,
} from "../../../src/profileTitles.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const badgeSource = readFileSync("src/ProfileTitleBadge.jsx", "utf8");
const emblemSource = readFileSync("src/ProfileTitleEmblem.jsx", "utf8");
const cssSource = readFileSync("src/index.css", "utf8");
const runtimeIdentitySource = [
  appSource,
  readFileSync("src/InteractiveOnboarding.jsx", "utf8"),
  readFileSync("src/chiaNotificationExperience.js", "utf8"),
  readFileSync("netlify/functions/_shared/aiPrompt.mjs", "utf8"),
  readFileSync("netlify/functions/_shared/pushSubscriptionTest.mjs", "utf8"),
].join("\n");
const migrationSql = readFileSync(
  "supabase/migrations/20260729125037_add_profile_titles.sql",
  "utf8",
);
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const emblemBytes = readFileSync("public/assets/titles/chia-celestial-guide-emblem.png");

function assignment({
  isPrimary = false,
  key = "beta_tester",
  label = "ベータテスター",
  sortOrder = 100,
  variant = "standard",
} = {}) {
  return {
    is_primary: isPrimary,
    granted_at: "2026-07-29T00:00:00Z",
    title: {
      id: `${key}-id`,
      key,
      label,
      description: null,
      variant,
      emblem_path:
        variant === "celestial_guide"
          ? "/assets/titles/chia-celestial-guide-emblem.png"
          : null,
      is_active: true,
      sort_order: sortOrder,
    },
  };
}

function readPngAlphaStats(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const idatParts = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IDAT") {
      idatParts.push(data);
    }

    offset += length + 12;
  }

  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);

  const inflated = inflateSync(Buffer.concat(idatParts));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let sourceOffset = 0;
  let transparentPixels = 0;
  let partialAlphaPixels = 0;

  function paeth(left, above, upperLeft) {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);

    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
      return left;
    }

    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  }

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let reconstructed = raw;

      if (filter === 1) {
        reconstructed = raw + left;
      } else if (filter === 2) {
        reconstructed = raw + above;
      } else if (filter === 3) {
        reconstructed = raw + Math.floor((left + above) / 2);
      } else if (filter === 4) {
        reconstructed = raw + paeth(left, above, upperLeft);
      } else {
        assert.equal(filter, 0);
      }

      current[x] = reconstructed & 0xff;
    }

    for (let x = 3; x < stride; x += bytesPerPixel) {
      if (current[x] === 0) {
        transparentPixels += 1;
      } else if (current[x] < 255) {
        partialAlphaPixels += 1;
      }
    }

    current.copy(previous);
    sourceOffset += stride;
  }

  return { width, height, transparentPixels, partialAlphaPixels };
}

test("profiles without titles keep the existing title-free layout", () => {
  assert.deepEqual(normalizeProfileTitles(undefined), []);
  assert.equal(getPrimaryProfileTitle({ id: "profile-1" }), null);
});

test("normal titles are normalized and only the primary title is selected", () => {
  const profile = {
    profile_titles: [
      assignment({ key: "developer", label: "開発者", sortOrder: 50 }),
      assignment({ isPrimary: true }),
    ],
  };

  const titles = normalizeProfileTitles(profile.profile_titles);
  assert.equal(titles.length, 2);
  assert.equal(titles[0].label, "ベータテスター");
  assert.equal(getPrimaryProfileTitle(profile)?.variant, "standard");
});

test("celestial guide keeps its dedicated variant and emblem path", () => {
  const primary = getPrimaryProfileTitle({
    profile_titles: [
      assignment({
        isPrimary: true,
        key: "celestial_guide",
        label: "街の案内人",
        sortOrder: 10,
        variant: "celestial_guide",
      }),
    ],
  });

  assert.equal(primary?.label, "街の案内人");
  assert.equal(primary?.variant, "celestial_guide");
  assert.equal(primary?.emblemPath, "/assets/titles/chia-celestial-guide-emblem.png");
});

test("profile title UI keeps the guide emblem and title as independent elements", () => {
  const emblemCssBlock = cssSource.split(".profile-title-emblem {")[1]?.split("}")[0] ?? "";

  assert.match(badgeSource, /size = "compact"/);
  assert.match(badgeSource, /isProfileSize = size === "profile"/);
  assert.doesNotMatch(badgeSource, /<img/);
  assert.doesNotMatch(badgeSource, /emblemPath/);
  assert.match(badgeSource, /星空ちあ 街の案内人の紋章/);
  assert.match(emblemSource, /alt=\{decorative \? "" : CELESTIAL_GUIDE_ALT\}/);
  assert.match(emblemSource, /width="1024"/);
  assert.match(emblemSource, /height="1024"/);
  assert.match(emblemSource, /decorative = false/);
  assert.match(emblemSource, /placement = "inline"/);
  assert.match(emblemSource, /placement === "header"/);
  assert.match(emblemSource, /profile-title-emblem-header-slot/);
  assert.match(emblemSource, /placement === "post-card"/);
  assert.match(emblemSource, /profile-title-emblem-post-card-slot/);
  assert.match(emblemSource, /aria-hidden=\{decorative \? "true" : undefined\}/);
  assert.match(badgeSource, /aria-hidden="true"/);
  assert.doesNotMatch(badgeSource, /GuideReflection/);
  assert.match(cssSource, /\.profile-title-badge-compact/);
  assert.match(cssSource, /\.profile-title-badge-profile/);
  assert.match(cssSource, /\.profile-title-emblem-compact/);
  assert.match(cssSource, /\.profile-title-emblem-profile/);
  assert.match(cssSource, /\.profile-card-header[\s\S]*position: relative/);
  assert.match(cssSource, /\.profile-card-header-actions[\s\S]*position: absolute/);
  assert.match(cssSource, /\.profile-title-emblem-header-slot[\s\S]*bottom: -2\.35rem/);
  assert.match(cssSource, /\.profile-title-emblem-header-slot[\s\S]*clamp\(4rem, 11vw, 4\.75rem\)/);
  assert.match(cssSource, /\.profile-title-emblem-header-slot::before/);
  assert.match(cssSource, /\.profile-title-profile-layout[\s\S]*flex-direction: column/);
  assert.match(cssSource, /\.profile-avatar-title-layout[\s\S]*min-height: 4\.75rem/);
  assert.match(cssSource, /\.profile-avatar-title-plate[\s\S]*left: 3\.15rem[\s\S]*pointer-events: none/);
  assert.match(cssSource, /\.profile-title-badge-celestial-guide\s*\{[\s\S]*border-radius: 0\.65rem/);
  assert.match(cssSource, /\.profile-title-badge-compact\.profile-title-badge-celestial-guide[\s\S]*border-radius: 0\.5rem/);
  assert.match(cssSource, /\.profile-title-badge-celestial-guide::before[\s\S]*profileTitleGuideShimmer 3\.8s ease-in-out infinite/);
  assert.match(cssSource, /\.profile-title-badge-celestial-guide::after[\s\S]*rgb\(255 241 195/);
  assert.match(cssSource, /@keyframes profileTitleGuideShimmer[\s\S]*opacity: 0\.52[\s\S]*translate3d\(195%, -56%, 0\)[\s\S]*scale\(1\.15\)/);
  assert.doesNotMatch(emblemCssBlock, /background|border|box-shadow/);
  assert.match(cssSource, /prefers-reduced-motion[\s\S]*profile-title-badge-celestial-guide::before/);
});

test("profile pages, meteor cards, and star letters render primary titles without mixing card-corner emblems into other screens", () => {
  assert.match(appSource, /function ProfileCard[\s\S]*ProfileTitleBadge size="profile"/);
  assert.match(appSource, /function PublicProfileCard[\s\S]*ProfileTitleBadge size="profile"/);
  assert.match(appSource, /function ProfileCard[\s\S]*ProfileTitleEmblem placement="header" size="profile"/);
  assert.match(appSource, /function PublicProfileCard[\s\S]*ProfileTitleEmblem placement="header" size="profile"/);
  assert.match(
    appSource,
    /function ProfileCard[\s\S]*ProfileTitleEmblem placement="header" size="profile"[\s\S]*profile-avatar-title-plate[\s\S]*ProfileTitleBadge size="profile"/,
  );
  assert.match(
    appSource,
    /function PublicProfileCard[\s\S]*ProfileTitleEmblem placement="header" size="profile"[\s\S]*profile-avatar-title-plate[\s\S]*ProfileTitleBadge size="profile"/,
  );
  assert.match(appSource, /function PostCard[\s\S]*ProfileTitleBadge size="compact" title=\{post\.primaryTitle\}/);
  assert.match(appSource, /function PostCard[\s\S]*emblemPlacement = "inline"/);
  assert.match(appSource, /function PostCard[\s\S]*hasCornerEmblem[\s\S]*placement="post-card"/);
  assert.match(appSource, /function Timeline[\s\S]*emblemPlacement="corner"/);
  assert.match(appSource, /function StarLetterItem[\s\S]*ProfileTitleBadge size="compact" title=\{letter\.primaryTitle\}/);
  assert.match(appSource, /function StarLetterItem[\s\S]*ProfileTitleEmblem decorative size="compact" title=\{letter\.primaryTitle\}/);
  assert.match(appSource, /function ArchivedStarLetterCard[\s\S]*ProfileTitleEmblem decorative size="compact" title=\{item\.primaryTitle\}/);
  assert.match(appSource, /min-w-0 flex-1/);
  assert.match(appSource, /flex flex-wrap items-center/);
});

test("profile title data rides existing batched profile queries without per-card queries", () => {
  assert.match(PROFILE_TITLES_RELATION_SELECT, /^profile_titles\(/);
  assert.match(PROFILE_TITLES_RELATION_SELECT, /title:titles\(/);
  assert.match(appSource, /PROFILE_TITLES_RELATION_SELECT/);
  assert.doesNotMatch(appSource, /\.from\("profile_titles"\)/);
  assert.match(appSource, /\.in\("id", authorIds\)/);
  assert.match(appSource, /isMissingProfileTitlesSchemaError/);
});

test("migration seeds titles idempotently and separates Chia's name", () => {
  assert.match(migrationSql, /'celestial_guide',\s*'街の案内人'/);
  assert.match(migrationSql, /'beta_tester',\s*'ベータテスター'/);
  assert.match(migrationSql, /on conflict \(key\) do update/);
  assert.match(migrationSql, /on conflict \(profile_id, title_id\) do update/);
  assert.match(migrationSql, /p\.display_name = '星空ちあ｜街の案内人'/);
  assert.match(migrationSql, /set display_name = '星空ちあ'/);
  assert.doesNotMatch(runtimeIdentitySource, /星空ちあ｜街の案内人/);
});

test("browser roles can read active titles but cannot grant or mutate them", () => {
  assert.match(migrationSql, /alter table public\.titles enable row level security/);
  assert.match(migrationSql, /alter table public\.profile_titles enable row level security/);
  assert.match(migrationSql, /where is_primary;/);
  assert.match(
    migrationSql,
    /revoke all on table public\.profile_titles from public, anon, authenticated;/,
  );
  assert.match(
    migrationSql,
    /grant select on table public\.profile_titles to anon, authenticated;/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant (?:insert|update|delete)[^;]*public\.profile_titles to (?:anon|authenticated)/i,
  );
  assert.doesNotMatch(
    migrationSql,
    /create policy [^\n]+ on public\.profile_titles[\s\S]*?for (?:insert|update|delete)/i,
  );
});

test("profile title migration and schema block stay synchronized", () => {
  const migrationBody = migrationSql
    .replace(/^--[^\n]*\n--[^\n]*\n\nbegin;\n\n/, "")
    .replace(/\ncommit;\s*$/i, "")
    .trim();
  const schemaBlock = schemaSql
    .split("-- 20260729120000_add_profile_titles.sql\n")[1]
    ?.split("-- 20260731080253_add_profile_blocks.sql\n")[0]
    ?.trim();

  assert.equal(schemaBlock, migrationBody);
});

test("the committed emblem is the original transparent 1024px RGBA asset", () => {
  const stats = readPngAlphaStats(emblemBytes);
  const sha256 = createHash("sha256").update(emblemBytes).digest("hex");

  assert.equal(stats.width, 1024);
  assert.equal(stats.height, 1024);
  assert.ok(stats.transparentPixels > 0);
  assert.ok(stats.partialAlphaPixels > 0);
  assert.equal(
    sha256,
    "fe8fee79bd2237d7c2a0c462e645ebf06ba31805a57d85b05bf236a0934e8641",
  );
});
