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

test('remember supplies observed star-letter and post revisions to one fenced transaction', async () => {
  const calls=[];
  const db={
    from:(table)=> { assert.equal(table,'star_letters'); return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:source,author_id:human,body:text,deleted_at:null,updated_at:'2026-10-10T00:00:00Z'}})})})}; },
    rpc:async(name,args)=>{calls.push({name,args});return {data:{outcome:'remembered'}};},
  };
  const signed={body:payload,sourceId:source,runId:source,claimToken:chia};
  const evidence={sourceUpdatedAt:'2026-10-10T00:00:00Z',postUpdatedAt:'2026-10-09T00:00:00Z'};
  assert.deepEqual(await rememberChiaDotStarLetter(db,{run:{status:'processing'},signed,chiaProfileId:chia,evidence}),{outcome:'not_replied'});
  assert.deepEqual(await rememberChiaDotStarLetter(db,{run:{status:'replied'},signed,chiaProfileId:chia,evidence}),{outcome:'remembered'});
  assert.equal(calls[0].name,'remember_chia_star_letter_reply');
  assert.equal(calls[0].args.p_source_updated_at,evidence.sourceUpdatedAt);
  assert.equal(calls[0].args.p_post_updated_at,evidence.postUpdatedAt);
  assert.equal(calls[0].args.p_person_profile_id,human);
  assert.equal(calls[0].args.p_claim_token,chia);
});

test('missing observation revision fails closed without silently adopting current source revision',async()=>{
  let writes=0;
  const result=await rememberChiaDotStarLetter({rpc:async()=>{writes++;}}, {run:{status:'replied'},signed:{body:payload,sourceId:source},chiaProfileId:chia});
  assert.deepEqual(result,{outcome:'stale_snapshot'});
  assert.equal(writes,0);
});
