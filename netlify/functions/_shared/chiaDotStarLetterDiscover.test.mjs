import test from 'node:test';
import assert from 'node:assert/strict';
import { checkChiaDotStarLetterClaimDue } from './chiaDotStarLetterDiscover.mjs';

const sourceId = '55555555-5555-4555-8555-555555555555';
const chiaProfileId = '66666666-6666-4666-8666-666666666666';
const human = '77777777-7777-4777-8777-777777777777';
const now = new Date('2026-10-10T10:00:00.000Z');

function fixture({ count = 0, createdAt = '2026-10-10T09:50:00.000Z' } = {}) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table };
      calls.push(call);
      const query = new Proxy({}, {
        get(_target, key) {
          if (key === 'then') return (resolve) => resolve(table === 'chia_star_letter_reply_runs' ? { data: [], count } : { data: [{ id: sourceId, author_id: human, created_at: createdAt }] });
          return () => query;
        },
      });
      return query;
    },
  };
  return { db, calls };
}

test('claim guard enforces per-day cap before source lookup', async () => {
  const { db, calls } = fixture({ count: 50 });
  assert.deepEqual(await checkChiaDotStarLetterClaimDue(db, { sourceId, chiaProfileId, now }), { eligible: false, outcome: 'daily_limit' });
  assert.deepEqual(calls.map(({ table }) => table), ['chia_star_letter_reply_runs']);
});

test('claim guard enforces delay and lookback independently', async () => {
  const pending = fixture({ createdAt: '2026-10-10T09:59:59.000Z' });
  assert.deepEqual(await checkChiaDotStarLetterClaimDue(pending.db, { sourceId, chiaProfileId, now }), { eligible: false, outcome: 'not_due' });
  const due = fixture();
  assert.deepEqual(await checkChiaDotStarLetterClaimDue(due.db, { sourceId, chiaProfileId, now }), { eligible: true });
});
