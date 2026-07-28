import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildChiaAiPrompt,
  buildCuratedLunchBody,
  buildFallbackBody,
  CHIA_DAILY_METEOR_SCHEDULE,
  normalizeGeneratedChiaBody,
  parseChiaAiOutput,
  resolveChiaDailyMeteorSlot,
} from "./chiaDailyMeteor.mjs";

test("日本時間の朝8時・昼12時・夜19時を正しい日付で解決する", () => {
  assert.deepEqual(resolveChiaDailyMeteorSlot(new Date("2026-07-27T23:00:00.000Z")), {
    slot: "morning",
    localDate: "2026-07-28",
    localHour: 8,
    localMinute: 0,
    weekday: 2,
    scheduledFor: "2026-07-27T23:00:00.000Z",
  });

  assert.equal(resolveChiaDailyMeteorSlot(new Date("2026-07-28T03:10:00.000Z"))?.slot, "noon");
  assert.equal(resolveChiaDailyMeteorSlot(new Date("2026-07-28T10:50:00.000Z"))?.slot, "evening");
  assert.equal(resolveChiaDailyMeteorSlot(new Date("2026-07-28T11:00:00.000Z")), null);
});

test("定期実行は各時間帯で10分ごとに再試行できる", () => {
  assert.equal(CHIA_DAILY_METEOR_SCHEDULE, "0,10,20,30,40,50 3,10,23 * * *");
});

test("昼の食事投稿は日付ごとに決まり、ちあの問いかけを含む", () => {
  const first = buildCuratedLunchBody("2026-07-28");
  const second = buildCuratedLunchBody("2026-07-28");

  assert.equal(first, second);
  assert.match(first, /^おひるちあ！/);
  assert.match(first, /今日は.+を食べたよ！/);
  assert.match(first, /みんなは何食べた？$/);
  assert.ok(first.length <= 500);
});

test("朝夜の予備文は必ず挨拶から始まり500文字以内", () => {
  const morning = buildFallbackBody({ slot: "morning", localDate: "2026-07-28" });
  const evening = buildFallbackBody({ slot: "evening", localDate: "2026-07-28" });

  assert.match(morning, /^おはちあ！/);
  assert.match(evening, /^こんばんちあ/);
  assert.ok(morning.length <= 500);
  assert.ok(evening.length <= 500);
});

test("AI用プロンプトは未確認のニュースや天気を禁止する", () => {
  const prompt = buildChiaAiPrompt({ slot: "morning", localDate: "2026-07-28" });

  assert.match(prompt, /おはちあ！/);
  assert.match(prompt, /ニュース・天気など確認できない事実/);
  assert.match(prompt, /ハッシュタグ、URL/);
});

test("AI出力を整形し、危険な形式は予備文へ回せるよう拒否する", () => {
  assert.equal(
    normalizeGeneratedChiaBody("今日も小さな光を見つけたいな。", "morning"),
    "おはちあ！\n今日も小さな光を見つけたいな。",
  );
  assert.equal(normalizeGeneratedChiaBody("https://example.com", "morning"), null);
  assert.equal(normalizeGeneratedChiaBody("#宣伝 おはちあ！", "morning"), null);
  assert.equal(normalizeGeneratedChiaBody("AIで生成しました", "evening"), null);
  assert.equal(
    parseChiaAiOutput('{"body":"こんばんちあ🌙 今日もおつちあ！"}', "evening"),
    "こんばんちあ🌙 今日もおつちあ！",
  );
});

test("投稿作成と台帳完了はDB関数内で原子的に行う", () => {
  const functionSource = readFileSync("netlify/functions/chia-daily-meteor-dispatch.mjs", "utf8");
  const migrationSource = readFileSync(
    "supabase/migrations/20260728174500_add_chia_daily_meteor_runs.sql",
    "utf8",
  );

  assert.match(functionSource, /complete_chia_daily_meteor_run/);
  assert.doesNotMatch(functionSource, /\.from\("posts"\)\s*\.insert/);
  assert.match(migrationSource, /unique \(local_date, slot\)/i);
  assert.match(migrationSource, /insert into public\.posts/i);
  assert.match(migrationSource, /for update;/i);
  assert.match(migrationSource, /alter table public\.chia_daily_meteor_runs enable row level security/i);
  assert.match(migrationSource, /grant execute on function public\.complete_chia_daily_meteor_run/i);
});
