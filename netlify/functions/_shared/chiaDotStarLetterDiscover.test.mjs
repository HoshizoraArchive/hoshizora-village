import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverChiaDotStarLetters, checkChiaDotStarLetterClaimDue } from './chiaDotStarLetterDiscover.mjs';
const chiaProfileId = '66666666-6666-4666-8666-666666666666';
const sourceId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-10-10T10:00:00.000Z');

test('discovery uses server-filtered eligible candidates rather than a capped raw-letter scan', async () => {
  const calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return {data:[{source_star_letter_id:sourceId,created_at:'2026-10-10T09:50:00Z'}]};},from:()=>{throw new Error('raw_scan_starvation');}};
  assert.deepEqual(await discoverChiaDotStarLetters(db,{chiaProfileId,now}),{outcome:'candidates',sourceIds:[sourceId]});
  assert.equal(calls[0].name,'discover_chia_star_letter_reply_candidates');
  assert.equal(calls[0].args.p_limit,5);
  assert.equal(calls[0].args.p_since,'2026-10-08T10:00:00.000Z');
});
test('database discovery errors fail closed and never become no_candidate success',async()=>{
  await assert.rejects(discoverChiaDotStarLetters({rpc:async()=>({error:{code:'database_unavailable'}})},{chiaProfileId,now}),/discovery_query_failed/);
});
test('advisory claim due guard leaves persistent eligibility and budgets to atomic claim',async()=>{
  const db={from:()=>{const query=new Proxy({},{get(_t,key){if(key==='then')return(resolve)=>resolve({data:[{id:sourceId,author_id:'human',created_at:'2026-10-10T09:50:00Z'}]});return()=>query;}});return query;}};
  assert.deepEqual(await checkChiaDotStarLetterClaimDue(db,{chiaProfileId,sourceId,now}),{eligible:true});
});
