import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const originalMigrationPath =
  "supabase/migrations/20260813173000_add_ai_resident_post_mentions.sql";
const fixMigrationPath =
  "supabase/migrations/20260813180000_fix_ai_resident_mention_validation.sql";
const identityMigrationPath =
  "supabase/migrations/20260807063919_add_profile_identity_roles_and_beta_cohorts.sql";

const originalMigrationBytes = readFileSync(originalMigrationPath);
const migrationSql = readFileSync(fixMigrationPath, "utf8");
const identityMigrationSql = readFileSync(identityMigrationPath, "utf8");

const functionBody = migrationSql
  .split(
    "create or replace function app_private.create_ai_resident_mention_notification()",
  )[1]
  ?.split("$$;")[0];

assert.ok(functionBody, "replacement function body must be present");

const authorGuard = "p.author_id = new.actor_profile_id";
const tokenGuard = "position(new.token in coalesce(p.body, '')) > 0";
const actorKindGuard = "k.profile_id = new.actor_profile_id";
const actorKind = "k.kind = 'ai_resident'";
const targetKindGuard = "k.profile_id = new.mentioned_profile_id";
const targetKind = "k.kind = 'human'";
const deleteChiaNotification = "delete from public.notifications n";
const insertDedicatedNotification = "insert into public.notifications";

function positionOf(fragment) {
  const position = functionBody.indexOf(fragment);
  assert.notEqual(position, -1, `missing SQL fragment: ${fragment}`);
  return position;
}

test("the applied 20260813173000 migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(originalMigrationBytes).digest("hex"),
    "5ebbca24389343a7aaa6c1182327cf06ecd7ae78e00245512fedf835a454fbec",
  );
});

test("the additive migration replaces only the mention notification function", () => {
  assert.equal(
    (
      migrationSql.match(
        /create or replace function app_private\.create_ai_resident_mention_notification\(\)/gi,
      ) ?? []
    ).length,
    1,
  );
  assert.doesNotMatch(
    migrationSql,
    /\b(?:alter|create|drop)\s+(?:table|policy|index|trigger|constraint)\b/i,
  );
  assert.doesNotMatch(migrationSql, /\b(?:grant|revoke)\b/i);
  assert.doesNotMatch(migrationSql, /enqueue_push_notification_job/i);
});

test("self mention is rejected by the mutually exclusive AI actor and human target guards", () => {
  assert.doesNotMatch(
    functionBody,
    /if\s+new\.actor_profile_id\s*=\s*new\.mentioned_profile_id\s+then\s+return new/i,
  );
  assert.match(identityMigrationSql, /profile_id uuid primary key/i);
  assert.match(
    identityMigrationSql,
    /kind text not null default 'human' check \(kind in \('human', 'ai_resident'\)\)/i,
  );
  assert.ok(positionOf(actorKindGuard) < positionOf(deleteChiaNotification));
  assert.ok(positionOf(actorKind) < positionOf(deleteChiaNotification));
  assert.ok(positionOf(targetKindGuard) < positionOf(deleteChiaNotification));
  assert.ok(positionOf(targetKind) < positionOf(deleteChiaNotification));
});

test("human actor is rejected before notification replacement", () => {
  assert.match(
    functionBody,
    /if not exists \([\s\S]*?k\.profile_id = new\.actor_profile_id[\s\S]*?k\.kind = 'ai_resident'[\s\S]*?raise exception 'mention actor must be an AI resident';[\s\S]*?end if;/i,
  );
  assert.ok(positionOf(actorKind) < positionOf(deleteChiaNotification));
});

test("AI target is rejected before notification replacement", () => {
  assert.match(
    functionBody,
    /if not exists \([\s\S]*?k\.profile_id = new\.mentioned_profile_id[\s\S]*?k\.kind = 'human'[\s\S]*?raise exception 'mention target must be human';[\s\S]*?end if;/i,
  );
  assert.ok(positionOf(targetKind) < positionOf(deleteChiaNotification));
});

test("post author mismatch is rejected before notification replacement", () => {
  assert.match(
    functionBody,
    /if not exists \([\s\S]*?p\.id = new\.post_id[\s\S]*?p\.author_id = new\.actor_profile_id[\s\S]*?raise exception 'mention post author must match the actor';[\s\S]*?end if;/i,
  );
  assert.ok(positionOf(authorGuard) < positionOf(deleteChiaNotification));
});

test("a mention token missing from the post body is rejected before notification replacement", () => {
  assert.match(
    functionBody,
    /if not exists \([\s\S]*?p\.id = new\.post_id[\s\S]*?position\(new\.token in coalesce\(p\.body, ''\)\) > 0[\s\S]*?raise exception 'mention token must appear in the post body';[\s\S]*?end if;/i,
  );
  assert.ok(positionOf(tokenGuard) < positionOf(deleteChiaNotification));
});

test("all validations run before an existing chia_post notification can be deleted", () => {
  const deletePosition = positionOf(deleteChiaNotification);
  for (const guard of [
    authorGuard,
    tokenGuard,
    actorKindGuard,
    actorKind,
    targetKindGuard,
    targetKind,
  ]) {
    assert.ok(positionOf(guard) < deletePosition, `${guard} must precede delete`);
  }
  assert.equal(
    (functionBody.slice(0, deletePosition).match(/raise exception/gi) ?? []).length,
    4,
  );
});

test("a valid AI resident to human mention replaces chia_post with the dedicated notification", () => {
  const deletePosition = positionOf(deleteChiaNotification);
  const insertPosition = positionOf(insertDedicatedNotification);

  assert.ok(deletePosition < insertPosition);
  assert.match(
    functionBody,
    /delete from public\.notifications n[\s\S]*?n\.recipient_id = new\.mentioned_profile_id[\s\S]*?n\.post_id = new\.post_id[\s\S]*?n\.actor_id = new\.actor_profile_id[\s\S]*?n\.type = 'chia_post';/i,
  );
  assert.match(
    functionBody,
    /insert into public\.notifications \(recipient_id, actor_id, post_id, type, message\)[\s\S]*?new\.mentioned_profile_id[\s\S]*?new\.actor_profile_id[\s\S]*?new\.post_id[\s\S]*?'ai_resident_mention'/i,
  );
  assert.equal((functionBody.match(/return new;/gi) ?? []).length, 1);
  assert.ok(positionOf("return new;") > insertPosition);
});
