import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChiaDotStarLetterSnapshot } from './chiaDotStarLetterSnapshot.mjs';

const human = '11111111-1111-4111-8111-111111111111';
const chia = '22222222-2222-4222-8222-222222222222';
const foreign = '33333333-3333-4333-8333-333333333333';
const source = '44444444-4444-4444-8444-444444444444';

function dbFixture() {
  const calls = [];
  const fixtures = {
    star_letters: [
      [{ id: source, post_id: 'post-1', author_id: human, body: 'やあ', parent_star_letter_id: null, created_at: '2026-10-10T10:00:00Z' }],
      [
        { id: source, author_id: human, body: 'やあ', parent_star_letter_id: null },
        { id: 'reply-other', author_id: chia, body: '他の人への返事', parent_star_letter_id: 'other-letter' },
        { id: 'reply-me', author_id: chia, body: '前に話したね', parent_star_letter_id: source },
      ],
    ],
    posts: [
      [{ id: 'post-1', author_id: chia, body: '星空の話' }],
      [{ id: 'post-1' }],
    ],
    profiles: [[{ id: human, display_name: '星空ほしくん', username: 'not_identity' }]],
    profile_kinds: [[{ kind: 'human' }]],
    profile_roles: [[{ role_key: 'founder' }]],
    profile_blocks: [[]],
    chia_person_memories: [[{ memory_key: 'topic', content: '一緒に制作中' }]],
  };
  return {
    calls,
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = new Proxy({}, {
        get(_target, prop) {
          if (prop === 'then') return (resolve) => resolve({ data: fixtures[table].shift() ?? [], error: null });
          return (...args) => { call.filters.push([prop, ...args]); return query; };
        },
      });
      return query;
    },
  };
}

test('memory is UUID-scoped, verified founder UUID is authoritative, other conversations excluded', async () => {
  const db = dbFixture();
  const result = await loadChiaDotStarLetterSnapshot(db, { sourceId: source, chiaProfileId: chia, founderProfileId: human });
  assert.equal(result.context.isFounder, true);
  assert.equal(result.context.accountId, human);
  assert.deepEqual(result.context.rememberedFacts, [{ key: 'topic', content: '一緒に制作中' }]);
  assert.equal(result.context.recentConversation.some((entry) => entry.body === '他の人への返事'), false);
  assert.equal(result.context.recentConversation.some((entry) => entry.body === '前に話したね'), true);
  assert.deepEqual(db.calls.find((call) => call.table === 'chia_person_memories').filters.filter((filter) => filter[0] === 'eq'), [
    ['eq', 'chia_profile_id', chia], ['eq', 'person_profile_id', human],
  ]);
});

test('founder is never inferred from matching display name', async () => {
  const db = dbFixture();
  const result = await loadChiaDotStarLetterSnapshot(db, { sourceId: source, chiaProfileId: chia, founderProfileId: foreign });
  assert.equal(result.context.isFounder, false);
  assert.equal(db.calls.some((call) => call.table === 'profile_roles'), false);
});
