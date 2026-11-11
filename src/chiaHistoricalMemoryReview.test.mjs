import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReviewedHistoricalPostMemory as prepare} from './chiaHistoricalMemoryReview.mjs';
const chia='41000000-0000-4000-8000-000000000001';
const human='41000000-0000-4000-8000-000000000002';
const id='42000000-0000-4000-8000-000000000003';
const at='2026-08-09T11:00:00Z';
const post={id,author_id:human,visibility:'public',deleted_at:null,body:'この曲を作りました。音源はコメントに。',updated_at:at};
const candidate={sourceType:'post',sourceId:id,sourceKey:`post:${id}`,postId:id,personProfileId:human,sourceUpdatedAt:at};
const input=extra=>({candidate,post,reviewedQuote:'この曲を作りました。',chiaProfileId:chia,now:Date.parse('2026-11-11T00:00:00Z'),...extra});
test('only a verbatim quote from a still-public source becomes a proposal',()=>{
  const result=prepare(input());
  assert.deepEqual(result,{
    chia_profile_id:chia,person_profile_id:human,source_post_id:id,source_updated_at:at,
    memory_key:'historical_post_'+id.replaceAll('-',''),content:'この曲を作りました。',importance:2,
  });
  assert.equal('source_star_letter_id' in result,false);
});
test('no inference about people, private posts, erased posts or stale source',()=>{
  assert.equal(prepare(input({reviewedQuote:'この住人は音楽好き'})),null);
  assert.equal(prepare(input({post:{...post,visibility:'private'}})),null);
  assert.equal(prepare(input({post:{...post,deleted_at:at}})),null);
  assert.equal(prepare(input({post:{...post,updated_at:'2026-08-10T00:00:00Z'}})),null);
  assert.equal(prepare(input({post:{...post,author_id:chia}})),null);
  assert.equal(prepare(input({candidate:{...candidate,personProfileId:chia}})),null);
  assert.equal(prepare(input({candidate:{...candidate,sourceKey:'post:changed'}})),null);
});
test('rejects overly long, control-containing, or non-verbatim quotes',()=>{
  assert.equal(prepare(input({reviewedQuote:'\nこの曲を作りました。'})),null);
  assert.equal(prepare(input({reviewedQuote:'この曲を作りました。\n'})),null);
  assert.equal(prepare(input({reviewedQuote:'あ'.repeat(501)})),null);
  assert.equal(prepare(input({reviewedQuote:'この曲を作りました。\u0000'})),null);
});
