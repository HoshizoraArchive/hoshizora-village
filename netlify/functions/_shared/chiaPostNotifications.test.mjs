import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260810090000_add_chia_post_notifications.sql", "utf8");
const clientSource = readFileSync("src/chiaPostNotifications.js", "utf8");
const pushSource = readFileSync("netlify/functions/_shared/pushDelivery.mjs", "utf8");
const mainSource = readFileSync("src/main.jsx", "utf8");

test("Chia posts fan out to all human residents in Re:Connect", () => {
  assert.match(migrationSql, /notify_chia_posts boolean not null default true/i);
  assert.match(migrationSql, /'chia_post'::text/);
  assert.match(migrationSql, /username = 'chia_hoshizora'/);
  assert.match(migrationSql, /insert into public\.notifications/i);
  assert.match(migrationSql, /after insert on public\.posts/i);
  assert.match(migrationSql, /coalesce\(profile_kind\.kind, 'human'\) = 'human'/i);
});

test("Chia Push can be disabled without disabling in-app notification", () => {
  assert.match(migrationSql, /new\.type = 'chia_post'/i);
  assert.match(migrationSql, /profile\.notify_chia_posts/i);
  assert.match(migrationSql, /return new;/i);
  assert.match(clientSource, /Village内のRe:Connectとバナーは、この設定に関係なく届きます/);
});

test("Chia Push toggle appears only on Chia My Universe below My Star Chart", () => {
  assert.match(clientSource, /\.public-profile-page/);
  assert.match(clientSource, /CHIA_USERNAME_LABEL/);
  assert.match(clientSource, /My Star Chart/);
  assert.match(clientSource, /insertAdjacentElement\("afterend"/);
  assert.match(clientSource, /ちあの流星便通知/);
  assert.doesNotMatch(clientSource, /notify_authors_when_i_archive/);
  assert.doesNotMatch(clientSource, /notify_authors_when_i_resonate/);
});

test("Chia Push toggle saves immediately as an accessible switch", () => {
  assert.match(clientSource, /role", "switch"/);
  assert.match(clientSource, /aria-checked/);
  assert.match(clientSource, /update\(\{ notify_chia_posts: nextValue \}\)/);
  assert.match(clientSource, /スマホ通知をONにしました/);
  assert.match(clientSource, /スマホ通知をOFFにしました/);
});

test("visible app gets a realtime Chia banner that opens the exact meteor", () => {
  assert.match(clientSource, /table: "posts"/);
  assert.match(clientSource, /author_id=eq\./);
  assert.match(clientSource, /星空ちあが流星便を放流しました/);
  assert.match(clientSource, /\/meteor\/\$\{encodeURIComponent\(post\.id\)\}/);
});

test("Chia Push opens the exact meteor with dedicated title", () => {
  assert.match(pushSource, /type === "chia_post"/);
  assert.match(pushSource, /星空ちあから流星便 ✨/);
  assert.match(pushSource, /`\/meteor\/\$\{encodeURIComponent\(postId\)\}`/);
});

test("Chia notification enhancement is loaded from main", () => {
  assert.match(mainSource, /import "\.\/chiaPostNotifications\.js";/);
});
