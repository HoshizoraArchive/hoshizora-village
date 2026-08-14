import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const originalMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260807103108_add_beta_opening_memorial_frame.sql",
);
const normalizationMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260814041626_normalize_opening_memorial_avatar_frame.sql",
);
const schemaPath = path.join(repoRoot, "supabase/schema.sql");
const assetPath = path.join(repoRoot, "public/profile-frames/opening-memorial.png");
const chiaAssetPath = path.join(repoRoot, "public/profile-frames/chia-guide.png");
const originalMigration = fs.readFileSync(originalMigrationPath, "utf8");
const normalizationMigration = fs.readFileSync(normalizationMigrationPath, "utf8");
const schema = fs.readFileSync(schemaPath, "utf8");

function includes(source, fragment, sourceName = "migration") {
  assert.ok(source.includes(fragment), `${sourceName} is missing: ${fragment}`);
}

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(filePath) {
  const png = fs.readFileSync(filePath);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "PNG must use 8-bit channels");
      assert.equal(data[9], 6, "PNG must be RGBA");
      assert.equal(data[12], 0, "PNG must be non-interlaced");
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += length + 12;
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const compressedRows = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * (stride + 1);
    const filter = compressedRows[sourceStart];

    for (let x = 0; x < stride; x += 1) {
      const raw = compressedRows[sourceStart + 1 + x];
      const targetIndex = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[targetIndex - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[targetIndex - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[targetIndex - stride - bytesPerPixel]
        : 0;
      let value;

      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upperLeft);
      else assert.fail(`unsupported PNG filter: ${filter}`);

      pixels[targetIndex] = value & 0xff;
    }
  }

  return { height, pixels, width };
}

function getAlphaStats(decoded) {
  const bounds = {
    bottom: -1,
    left: decoded.width,
    right: -1,
    top: decoded.height,
  };
  let transparentPixels = 0;
  let centerPixels = 0;
  let transparentCenterPixels = 0;

  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const alpha = decoded.pixels[(y * decoded.width + x) * 4 + 3];

      if (alpha === 0) {
        transparentPixels += 1;
      }

      if (
        x >= decoded.width * 0.3 &&
        x < decoded.width * 0.7 &&
        y >= decoded.height * 0.3 &&
        y < decoded.height * 0.7
      ) {
        centerPixels += 1;
        if (alpha < 16) transparentCenterPixels += 1;
      }

      if (alpha >= 16) {
        bounds.left = Math.min(bounds.left, x);
        bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
  }

  return {
    bounds,
    centerTransparentRatio: transparentCenterPixels / centerPixels,
    transparentRatio: transparentPixels / (decoded.width * decoded.height),
  };
}

test("Opening Memorial素材は1024px RGBAで、avatar用の透明開口と外周配置を持つ", () => {
  const png = fs.readFileSync(assetPath);
  const sha256 = crypto.createHash("sha256").update(png).digest("hex");
  const decoded = decodeRgbaPng(assetPath);
  const stats = getAlphaStats(decoded);

  assert.equal(decoded.width, 1024);
  assert.equal(decoded.height, 1024);
  assert.equal(sha256, "243bf8a5dc65ef6db9087c26ee2027c878c2e817540fd87c119dde2ca332b0e3");
  assert.ok(stats.transparentRatio > 0.7, "most of the canvas must remain transparent");
  assert.ok(stats.centerTransparentRatio > 0.999, "the avatar opening must remain transparent");
  assert.ok(stats.bounds.left < decoded.width * 0.07);
  assert.ok(stats.bounds.right > decoded.width * 0.93);
  assert.ok(stats.bounds.top < decoded.height * 0.05);
  assert.ok(stats.bounds.bottom > decoded.height * 0.95);
});

test("既存chia_guide素材は変更しない", () => {
  const sha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(chiaAssetPath))
    .digest("hex");

  assert.equal(sha256, "994ed1adffc4adb0dc9a5d401033080079e46d095cc5c26c1707f7cdb160bde6");
});

test("beta_residentだけにOpening Memorialフレーム所有権を付与する", () => {
  includes(originalMigration, "'opening_memorial_beta'", "original migration");
  includes(normalizationMigration, "'/profile-frames/opening-memorial.png'");
  includes(normalizationMigration, "'beta_reward'");
  includes(normalizationMigration, "cohort.cohort_key = 'beta_resident'");
  includes(normalizationMigration, "on conflict (profile_id, frame_id) do nothing");
  assert.doesNotMatch(normalizationMigration, /display_name\s*=|username\s*=|profile_id\s+in\s*\(/i);
});

test("grantは冪等で、未装着beta_residentだけを初期装着する", () => {
  includes(normalizationMigration, "profile.active_frame_id is null");
  includes(normalizationMigration, "on conflict (profile_id, frame_id) do nothing");
  includes(normalizationMigration, "grant_opening_memorial_to_beta_residents()");
  includes(normalizationMigration, "select *\nfrom public.grant_opening_memorial_to_beta_residents()");
});

test("grant RPCは固定search_pathでbrowserから実行できずservice_roleだけが利用できる", () => {
  includes(normalizationMigration, "security definer");
  includes(normalizationMigration, "set search_path = ''");
  includes(
    normalizationMigration,
    "from public, anon, authenticated",
  );
  includes(
    normalizationMigration,
    "grant execute on function public.grant_opening_memorial_to_beta_residents()\nto service_role",
  );
});

test("migrationとschema.sqlはOpening Memorial設定とgrant RPCを同期する", () => {
  for (const fragment of [
    "'opening_memorial_beta'",
    "'/profile-frames/opening-memorial.png'",
    "1.22",
    "create or replace function public.grant_opening_memorial_to_beta_residents()",
    "cohort.cohort_key = 'beta_resident'",
    "profile.active_frame_id is null",
    "to service_role",
  ]) {
    includes(normalizationMigration, fragment);
    includes(schema, fragment, "schema.sql");
  }
});
