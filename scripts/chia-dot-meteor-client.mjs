import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { signChiaDotMeteorRequest } from "../netlify/functions/_shared/chiaDotMeteorAuth.mjs";
import { resolveChiaDailyMeteorSlot } from "../netlify/functions/_shared/chiaDailyMeteor.mjs";

const DEFAULT_ENDPOINT = "https://hoshizora-village.netlify.app/api/chia-dot-meteor";
const DEFAULT_KEY_PATH = path.resolve(
  process.cwd(),
  "../../.secrets/chia-dot-meteor-ed25519.pem",
);

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith("--")) throw new Error(`invalid_argument:${key}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing_argument_value:${key}`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return { action, values };
}

function resolveTargetSlot(scheduledFor) {
  const date = new Date(scheduledFor);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== scheduledFor) {
    throw new Error("invalid_scheduled_for");
  }
  const slotInfo = resolveChiaDailyMeteorSlot(date);
  if (!slotInfo || slotInfo.localMinute !== 0 || slotInfo.scheduledFor !== scheduledFor) {
    throw new Error("invalid_scheduled_slot");
  }
  return slotInfo;
}

async function main() {
  const { action, values } = parseArgs(process.argv.slice(2));
  if (!new Set(["snapshot", "publish", "repair"]).has(action)) {
    throw new Error("usage:snapshot|publish|repair --scheduled-for <ISO> [--body-file <path>] [--snapshot-file <path>]");
  }

  const scheduledFor = values["scheduled-for"];
  if (!scheduledFor) throw new Error("missing_scheduled_for");
  const slotInfo = resolveTargetSlot(scheduledFor);
  const endpoint = values.endpoint || process.env.CHIA_DOT_METEOR_ENDPOINT || DEFAULT_ENDPOINT;
  const keyPath = values["private-key"]
    || process.env.CHIA_DOT_METEOR_PRIVATE_KEY_PATH
    || DEFAULT_KEY_PATH;
  if (!existsSync(keyPath)) throw new Error("chia_dot_meteor_private_key_missing");
  const privateKey = readFileSync(keyPath, "utf8");

  let body = "";
  let snapshotGeneratedAt = "";
  let snapshotHash = "";
  let mediaEvidenceKey = "";
  let groundingMode = "";
  if (action === "publish") {
    const bodyFile = values["body-file"];
    if (!bodyFile) throw new Error("missing_body_file");
    body = readFileSync(bodyFile, "utf8").replace(/\r\n?/g, "\n");
    if (body.endsWith("\n")) body = body.slice(0, -1);
    const snapshotFile = values["snapshot-file"];
    if (!snapshotFile) throw new Error("missing_snapshot_file");
    const saved = JSON.parse(readFileSync(snapshotFile, "utf8"));
    const serverResult = saved?.result ?? saved;
    if (
      serverResult?.outcome !== "snapshot"
      || typeof serverResult?.snapshotHash !== "string"
      || typeof serverResult?.snapshot?.generatedAt !== "string"
      || serverResult?.snapshot?.slot?.scheduledFor !== slotInfo.scheduledFor
    ) {
      throw new Error("invalid_snapshot_file");
    }
    snapshotGeneratedAt = serverResult.snapshot.generatedAt;
    snapshotHash = serverResult.snapshotHash;
    mediaEvidenceKey = values["media-evidence-key"] || "";
    groundingMode = values["grounding-mode"] || "";
    if (!new Set(["non_media", "media"]).has(groundingMode)) {
      throw new Error("missing_or_invalid_grounding_mode");
    }
    if (groundingMode === "media" && !mediaEvidenceKey) {
      throw new Error("media_grounding_requires_evidence_key");
    }
    if (groundingMode === "non_media" && mediaEvidenceKey) {
      throw new Error("non_media_grounding_forbids_evidence_key");
    }
  }

  const payload = signChiaDotMeteorRequest({
    action,
    slotInfo,
    body,
    privateKey,
    snapshotGeneratedAt,
    snapshotHash,
    mediaEvidenceKey,
    groundingMode,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep unexpected provider text visible without exposing the signing key.
  }
  if (action === "snapshot" && values.output && response.ok) {
    writeFileSync(values.output, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ status: response.status, ok: response.ok, result: parsed })}\n`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "chia_dot_meteor_client_failed"}\n`);
  process.exitCode = 1;
});
