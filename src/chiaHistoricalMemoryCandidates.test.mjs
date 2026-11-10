import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enumerateChiaHistoricalMemorySources as enumerate } from './chiaHistoricalMemoryCandidates.mjs';
const uuid = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const chia = uuid(1), h1 = uuid(2), h2 = uuid(3), otherAi = uuid(4), unknown = uuid(5);
const date = '2026-08-09T12:00:00.000Z';
const post = (id, author_id = h1, extra = {}) => ({ id:uuid(id), author_id, visibility:'public', deleted_at:null, created_at:date, updated_at:date, ...extra });
const letter = (id, post_id, author_id = h1, extra = {}) => ({ id:uuid(id), post_id, author_id, deleted_at:null, created_at:date, updated_at:date, parent_star_letter_id:null, ...extra });
const kinds = [{ profile_id:chia,kind:'ai_resident' }, {profile_id:h1,kind:'human'}, {profile_id:h2,kind:'human'},{profile_id:otherAi,kind:'ai_resident'}];
const input = (p = [], l = [], extra = {}) => ({posts:p,starLetters:l,profileKinds:kinds,chiaProfileId:chia,now:Date.parse('2026-11-11T00:00:00Z'),...extra});
test('historical public human posts remain eligible beyond 60 days, without body leakage', () => {
  const rows = enumerate(input([post(101,h1,{body:'private to output? ignored', media_url:'https://example.test/image'})]));
  assert.equal(rows.length,1);
  assert.equal(rows[0].sourceKey,`post:${uuid(101)}`);
  assert.equal(rows[0].requiresMediaObservation,true);
  assert.equal(JSON.stringify(rows).includes('private to output'),false);
});
test('private, soft-deleted, future-dated, unknown and AI posts are excluded', () => {
  const p = [post(101),post(102,h1,{visibility:'private'}),post(103,h1,{deleted_at:date}),post(104,h1,{created_at:'2027-01-01T00:00:00Z'}),post(105,unknown),post(106,otherAi)];
  assert.deepEqual(enumerate(input(p)).map(row=>row.sourceId),[uuid(101)]);
});
test('star letters belong to direct conversations with Chia, not with another human or another AI', () => {
  const p = [post(101,chia),post(102,otherAi),post(103,h1)];
  const l = [letter(201,uuid(101)),letter(202,uuid(102)),letter(203,uuid(103)),letter(204,uuid(101),h2,{parent_star_letter_id:uuid(201)}),letter(205,uuid(101),chia),letter(206,uuid(101),h2,{parent_star_letter_id:uuid(205)})];
  assert.deepEqual(enumerate(input(p,l)).filter(x=>x.sourceType==='star_letter').map(x=>x.sourceId),[uuid(201),uuid(206)]);
});
test('a removed parent or cross-post parent cannot authorize a remembered reply', () => {
  const p = [post(101,chia),post(102,chia)];
  const l = [letter(201,uuid(101),chia,{deleted_at:date}),letter(202,uuid(101),h1,{parent_star_letter_id:uuid(201)}),letter(203,uuid(102),h1,{parent_star_letter_id:uuid(201)})];
  assert.equal(enumerate(input(p,l)).length,0);
});
test('blocked and opted-out people, excluded sources, previously imported sources stay excluded', () => {
  const p = [post(101,h1),post(102,h2)];
  const excludedSourceKeys = new Set([`post:${uuid(101)}`]);
  const existingSourceKeys = new Set([`post:${uuid(102)}`]);
  assert.equal(enumerate(input(p,[],{excludedSourceKeys,existingSourceKeys})).length,0);
  assert.deepEqual(enumerate(input(p,[],{blockedPersonIds:new Set([h1]),optedOutPersonIds:new Set([h2])})),[]);
});
test('a missing explicit AI classification for Chia fails closed', () => {
  assert.deepEqual(enumerate(input([post(101)],[],{profileKinds:kinds.filter(k=>k.profile_id!==chia)})),[]);
});
test('duplicates are stable, capped per person, and source ids are not confused with authors', () => {
  const p = [post(101),post(101),post(102),post(103),post(104,h2)];
  assert.deepEqual(enumerate(input(p,[],{maxPerPerson:2})).map(x=>x.sourceId),[uuid(101),uuid(102),uuid(104)]);
});
test('invalid timestamp and edited-future source fail closed', () => {
  const p = [post(101,h1,{updated_at:'2027-01-01T00:00:00Z'}),post(102,h1,{created_at:'not a date'}),post(103)];
  assert.deepEqual(enumerate(input(p)).map(x=>x.sourceId),[uuid(103)]);
});

test('conflicting snapshots and profile kinds cannot resurrect deleted or untrusted evidence', () => {
  const p = [post(101),post(101,h1,{deleted_at:date}),post(102)];
  assert.deepEqual(enumerate(input(p)).map(x=>x.sourceId),[uuid(102)]);
  const conflictingKinds = [...kinds, {profile_id:h1,kind:'ai_resident'}];
  assert.deepEqual(enumerate(input([post(102)],[],{profileKinds:conflictingKinds})),[]);
});

test('missing deleted_at field is not treated as positive proof of a public live source', () => {
  const candidate = post(101);
  delete candidate.deleted_at;
  assert.deepEqual(enumerate(input([candidate])),[]);
  const liveChia = post(102,chia);
  const maybeDeletedLetter = letter(201,uuid(102));
  delete maybeDeletedLetter.deleted_at;
  assert.deepEqual(enumerate(input([liveChia],[maybeDeletedLetter])),[]);
});
