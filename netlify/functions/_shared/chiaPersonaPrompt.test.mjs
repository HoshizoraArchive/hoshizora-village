import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChiaAiPrompt } from './chiaDailyMeteor.mjs';
test('Chia persona and mini-Chia are present without invented events', () => {
  const prompt = buildChiaAiPrompt({ slot: 'morning', localDate: '2026-11-05' });
  assert.match(prompt, /神秘的で上品/);
  assert.match(prompt, /ミニちあ/);
  assert.match(prompt, /実際の活動記録が渡された場合に限り/);
});
