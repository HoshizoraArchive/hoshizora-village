import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChiaDotMemoryEvidence, rememberChiaDotStarLetter } from './chiaDotStarLetterRemember.mjs';

const human = '11111111-1111-4111-8111-111111111111';
const chia = '22222222-2222-4222-8222-222222222222';
const source = '33333333-3333-4333-8333-333333333333';
const text = '新しい歌のタイトルは星のしおりです。';
const payload = JSON.stringify({ memoryKey: 'original_song', evidenceQuote: '新しい歌のタイトルは星のしおり' });

test('memory evidence is exactly quoted from the source and rejects sensitive inferences', () => {
  assert.deepEqual(parseChiaDotMemoryEvidence(payload, text), { key: 'original_song', quote: '新しい歌のタイトルは星のしおり' });
  assert.equal(parseChiaDotMemoryEvidence(payload, '違う内容'), null);
  assert.equal(parseChiaDotMemoryEvidence(JSON.stringify({ memoryKey: 'song', evidenceQuote: '宗教について話した' }), '宗教について話した'), null);
  assert.equal(parseChiaDotMemoryEvidence(JSON.stringify({ memoryKey: 'song', evidenceQuote: '新しい歌のタイトルは星のしおり', personId: human }), text), null);
});

test('only a replied run can insert UUID-scoped memory with authoritative provenance', async () => {
  let inserted = null;
  const db = {
    from(table) {
      if (table === 'star_letters') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: source, author_id: human, body: text, deleted_at: null } }) }) }) };
      if (table === 'chia_person_memories') return {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
        insert: async (record) => { inserted = record; return { error: null }; },
      };
      throw new Error('unexpected_table');
    },
  };
  const signed = { body: payload, sourceId: source };
  assert.deepEqual(await rememberChiaDotStarLetter(db, { run: { status: 'processing' }, signed, chiaProfileId: chia }), { outcome: 'not_replied' });
  assert.equal(inserted, null);
  assert.deepEqual(await rememberChiaDotStarLetter(db, { run: { status: 'replied' }, signed, chiaProfileId: chia }), { outcome: 'remembered' });
  assert.equal(inserted.person_profile_id, human);
  assert.equal(inserted.chia_profile_id, chia);
  assert.equal(inserted.source_star_letter_id, source);
  assert.equal(inserted.content, '新しい歌のタイトルは星のしおり');
});
