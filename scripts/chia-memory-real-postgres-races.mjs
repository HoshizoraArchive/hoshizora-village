#!/usr/bin/env node
/**
 * Full PostgreSQL 17 multi-session memory safety harness. Synthetic data only;
 * this script starts and stops its own local cluster, no Supabase credentials.
 * Install optional fixture dependencies outside the repo (see docs) and set
 * CHIA_EMBEDDED_PG_MODULE to embedded-postgres/dist/index.js.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const external=process.env.CHIA_EMBEDDED_PG_MODULE;
if(!external) throw new Error('Missing CHIA_EMBEDDED_PG_MODULE. Do not start a remote DB.');
const {default:EmbeddedPostgres}=await import(pathToFileURL(resolve(external)).href);
const oldHarness=await readFile(resolve(root,'scripts/chia-dot-star-letter-pglite-harness.mjs'),'utf8');
const baseline=oldHarness.match(/const baseline = `([\s\S]*?)`;\n/);
if(!baseline) throw new Error('Synthetic schema fixture baseline unavailable');
const migrations=['20260908123500_add_chia_star_letter_reply_runs.sql','20261010213000_chia_reply_memory_and_fencing.sql','20261020120000_chia_dot_reply_atomic_guards.sql','20261020123000_chia_source_monotonic_revisions.sql','20261020124500_chia_source_monotonic_any_update.sql','20261110155216_chia_historical_post_memory_sources.sql'];
const chia='41000000-0000-4000-8000-000000000001',human='41000000-0000-4000-8000-000000000002';
const p1='42000000-0000-4000-8000-000000000002',p2='42000000-0000-4000-8000-000000000003',p3='42000000-0000-4000-8000-000000000004';
const p4='42000000-0000-4000-8000-000000000005',p5='42000000-0000-4000-8000-000000000006';
const key=id=>'historical_post_'+id.replaceAll('-','');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=(p,ms=8000)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error('two-session test timeout')),ms))]);
const waitFor=async(predicate)=>{for(let i=0;i<50;i++){if(await predicate())return;await delay(75)}throw new Error('expected concurrent wait not observed')};
const q=(c,sql,params=[])=>c.query(sql,params);
const inserter=(p,body)=>`insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_post_id,memory_key,content) values('${chia}','${human}','${p}','${key(p)}','${body}')`;
const asRole=async(client,role,person)=>{
  await q(client,`set role ${role}`);
  if(person) await q(client,`select set_config('request.jwt.claim.sub',$1,false)`,[person]);
};
const reset=async client=>{await q(client,'reset role');await q(client,"select set_config('request.jwt.claim.sub','',false)");};

const pg=new EmbeddedPostgres({databaseDir:'/tmp/chia-postgres-real-races-20261112',user:'postgres',password:'synthetic-local-only-20261112',port:55494,persistent:false,postgresFlags:['-c','listen_addresses=127.0.0.1','-c','deadlock_timeout=100ms'],onLog:()=>{},onError:()=>{}});
const clients=[];
let started=false;
const client=async()=>{const c=pg.getPgClient('testmem','127.0.0.1');await c.connect();clients.push(c);return c;};
try{
  await pg.initialise();await pg.start();started=true;await pg.createDatabase('testmem');
  const admin=await client(),editor=await client(),owner=await client(),writer=await client(),writer2=await client();
  await q(admin,baseline[1]);
  for(const mig of migrations){try{await q(admin,await readFile(resolve(root,'supabase/migrations',mig),'utf8'))}catch(e){throw new Error(`${mig}: ${e.message}`)}}
  await q(admin,`insert into auth.users(id) values('${chia}'),('${human}');
    insert into public.profiles(id,display_name,username) values
      ('${chia}','Fake AI','test_ai'),('${human}','Fake human','test_human');
    update public.profile_kinds set kind='ai_resident' where profile_id='${chia}';
    insert into public.posts(id,author_id,body,created_at) values
      ('${p1}','${human}','Synthetic song A',now()-interval '90 days'),
      ('${p2}','${human}','Synthetic song B',now()-interval '90 days'),
      ('${p3}','${human}','Synthetic song C',now()-interval '90 days'),
      ('${p4}','${human}','Synthetic song D',now()-interval '90 days'),
      ('${p5}','${human}','Synthetic song E',now()-interval '90 days');
    grant select,update,delete on public.posts to authenticated;
    grant select,update on public.profiles,public.posts,public.star_letters to service_role;
    grant select on public.profile_kinds,public.profile_blocks to service_role;`);
  await asRole(editor,'authenticated',human);await asRole(owner,'authenticated',human);
  await asRole(writer,'service_role');await asRole(writer2,'service_role');

  // Race A: an authenticated source edit invalidates the memory inside an
  // uncommitted transaction; the human's explicit forget must not get lost.
  await q(admin,inserter(p1,'Synthetic song A'));
  const memorySnapshot=(await q(admin,`select public.snapshot_chia_person_memory('${chia}','${human}') snapshot`)).rows[0].snapshot;
  assert.ok(memorySnapshot.memories.some(x=>x.memory_key===key(p1)&&x.content==='Synthetic song A'),
    'a real historical post quote appears in the production-style Chia memory snapshot');
  const memoryId=(await q(admin,`select id from public.chia_person_memories where source_post_id='${p1}'`)).rows[0].id;
  await q(editor,'begin');
  await q(editor,`update public.posts set visibility='private' where id='${p1}'`);
  let done=false;
  const forget=q(owner,`select public.delete_own_chia_memory('${memoryId}') response`).finally(()=>{done=true});
  await delay(300);
  assert.equal(done,false,'forget must wait for pending source invalidation');
  await q(editor,'commit');
  const outcome=(await timeout(forget)).rows[0].response.outcome;
  assert.equal(outcome,'deleted','human source forget persisted despite concurrent invalidation');
  assert.equal((await q(admin,`select count(*)::int n from public.chia_memory_source_exclusions where source_id='${p1}'`)).rows[0].n,1);
  await q(admin,`update public.posts set visibility='public' where id='${p1}'`);
  await assert.rejects(q(writer,inserter(p1,'Synthetic song A')),/source excluded by owner/);
  console.log('PG17_RACE_A_PASS: source edit+owner forget keeps permanent exclusion');

  // Race B: a new writer is blocked by a still-open user forget transaction;
  // when it resumes, the source-level tombstone must reject the write.
  await q(admin,inserter(p2,'Synthetic song B'));
  const memory2=(await q(admin,`select id from public.chia_person_memories where source_post_id='${p2}'`)).rows[0].id;
  await q(owner,'begin');
  assert.equal((await q(owner,`select public.delete_own_chia_memory('${memory2}') response`)).rows[0].response.outcome,'deleted');
  let finished=false;
  const retry=q(writer,inserter(p2,'Synthetic song B')).finally(()=>{finished=true});
  await delay(250);
  assert.equal(finished,false,'importer must wait until owner forget commits');
  await q(owner,'commit');
  await assert.rejects(timeout(retry),/source excluded by owner/);
  assert.equal((await q(admin,`select count(*)::int n from public.chia_person_memories where source_post_id='${p2}'`)).rows[0].n,0);
  console.log('PG17_RACE_B_PASS: owner delete+new import cannot resurrect source');

  // Race C: two concurrent transactions use opposite source order for one
  // person. The person profile lock is acquired first, preventing deadlocks.
  await q(writer,'begin');await q(writer,inserter(p3,'Synthetic song C'));
  await q(writer2,'begin');
  let writer2Finished=false;
  const writer2First=q(writer2,inserter(p4,'Synthetic song D')).finally(()=>{writer2Finished=true});
  await delay(250);assert.equal(writer2Finished,false,'writer2 serialized by person profile lock');
  await q(writer,inserter(p4,'Synthetic song D'));
  await q(writer,'commit');
  await assert.rejects(timeout(writer2First),/duplicate key value violates unique constraint/);
  await q(writer2,'rollback');
  assert.equal((await q(admin,`select count(*)::int n from public.chia_person_memories where source_post_id in ('${p3}','${p4}')`)).rows[0].n,2);
  console.log('PG17_RACE_C_PASS: multi-source same-person admissions serialize without deadlock');

  // Race D: account removal holds profile FOR UPDATE while owner forget
  // attempts KEY SHARE; neither should hold an opposite-ordered memory lock.
  await q(admin,inserter(p5,'Synthetic song E'));
  const memory5=(await q(admin,`select id from public.chia_person_memories where source_post_id='${p5}'`)).rows[0].id;
  await q(admin,'begin');
  await q(admin,`delete from public.posts where author_id='${human}'`);
  await q(admin,`delete from public.profiles where id='${human}'`);
  let gone=false;
  const forgetGone=q(owner,`select public.delete_own_chia_memory('${memory5}') response`).finally(()=>{gone=true});
  await delay(250);assert.equal(gone,false);
  await q(admin,'commit');
  const goneOutcome=(await timeout(forgetGone)).rows[0].response.outcome;
  assert.equal(goneOutcome,'account_gone');
  console.log('PG17_RACE_D_PASS: account removal+owner forget completes without deadlock');

  console.log('PG17_REAL_CONCURRENCY_ALL_PASS: 4 scenarios, actual independent Postgres connections, synthetic only');
}catch(err){console.error('PG17_REAL_CONCURRENCY_FAIL:',err.message);process.exitCode=1}
finally{for(const c of clients)await c.end().catch(()=>{});if(started)await pg.stop().catch(()=>{});}
