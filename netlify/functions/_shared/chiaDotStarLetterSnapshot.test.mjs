import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChiaDotStarLetterSnapshot } from './chiaDotStarLetterSnapshot.mjs';
import { createChiaPersonGenerationRequest } from './chiaPersonGenerationContract.mjs';

const human = '11111111-1111-4111-8111-111111111111';
const chia = '22222222-2222-4222-8222-222222222222';
const foreign = '33333333-3333-4333-8333-333333333333';
const source = '44444444-4444-4444-8444-444444444444';
const postId = '55555555-5555-4555-8555-555555555555';

function dbFixture() {
  const calls = [];
  const fixtures = {
    star_letters: [
      [{ id: source, post_id: postId, author_id: human, body: 'やあ', parent_star_letter_id: null, created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z' }],
      [
        { id: source, author_id: human, body: 'やあ', parent_star_letter_id: null },
        { id: 'reply-other', author_id: chia, body: '他の人への返事', parent_star_letter_id: 'other-letter' },
        { id: 'reply-me', author_id: chia, body: '前に話したね', parent_star_letter_id: source },
      ],
    ],
    posts: [
      [{ id: postId, author_id: chia, body: '星空の話', visibility: 'public', updated_at: '2026-10-01T10:00:00Z' }],
      [{ id: postId }],
    ],
    profiles: [[{ id: human, display_name: '星空ほしくん', username: 'not_identity' }]],
    profile_kinds: [[{ kind: 'human' }]],
    profile_roles: [[{ role_key: 'founder' }]],
    profile_blocks: [[]],
    chia_person_memories: [[{ memory_key: 'topic', content: '一緒に制作中' }]],
  };
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      assert.equal(name, 'snapshot_chia_person_memory');
      return { data: { revision: '7', memories: [{ memory_key: 'topic', content: '一緒に制作中' }] }, error: null };
    },
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
  assert.deepEqual(result.context.evidence, { sourceId: source, sourceUpdatedAt: '2026-10-10T10:00:00Z', postId, postUpdatedAt: '2026-10-01T10:00:00Z', postVisibility: 'public', memoryRevision: '7' });
  assert.deepEqual(result.evidence, result.context.evidence);
  assert.equal(result.context.recentConversation.some((entry) => entry.body === '他の人への返事'), false);
  assert.equal(result.context.recentConversation.some((entry) => entry.body === '前に話したね'), true);
  assert.deepEqual(db.calls.find((call) => call.rpc), { rpc: 'snapshot_chia_person_memory', args: { p_chia_profile_id: chia, p_person_profile_id: human } });
  const request = createChiaPersonGenerationRequest({ ...result, generationInvocationId: source }, { model: 'cos-chatgpt', max_input_tokens: 8000, max_output_tokens: 512, reserved_cost_microusd: 5000 });
  assert.equal(request.scope.personProfileId, human);
  assert.equal(request.scope.chiaProfileId, chia);
  assert.equal(request.persistence, 'ephemeral-per-invocation');
  assert.deepEqual(request.forbiddenContext, ['other-person-memory', 'shared-seven-role-team-pii', 'persistent-chat-history', 'worker-personal-library']);
  assert.equal(JSON.stringify(request).includes('他の人への返事'), false);
  assert.equal(Object.hasOwn(request, 'team'), false);
  assert.equal(Object.hasOwn(request, 'workerMemory'), false);
});

test('snapshot scope stays on the source post and excludes Chia replies in other post contexts', async () => {
  const db = dbFixture();
  await loadChiaDotStarLetterSnapshot(db, { sourceId: source, chiaProfileId: chia, founderProfileId: human });
  assert.equal(db.calls.some((call) => call.table === 'posts' && call.filters.some((filter) => filter[0] === 'limit' && filter[1] === 20)), false);
  assert.ok(db.calls.find((call) => call.table === 'star_letters' && call.filters.some((filter) => filter[0] === 'eq' && filter[1] === 'post_id')));
  assert.ok(db.calls.find((call) => call.table === 'posts' && call.filters.some((filter) => filter[0] === 'eq' && filter[1] === 'visibility' && filter[2] === 'public')));
});

test('founder is never inferred from matching display name', async () => {
  const db = dbFixture();
  const result = await loadChiaDotStarLetterSnapshot(db, { sourceId: source, chiaProfileId: chia, founderProfileId: foreign });
  assert.equal(result.context.isFounder, false);
  assert.equal(db.calls.some((call) => call.table === 'profile_roles'), false);
});
