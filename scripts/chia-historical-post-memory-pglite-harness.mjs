#!/usr/bin/env node
/** Offline Postgres migration/permissions test; only synthetic UUIDs and text. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const modulePath = process.env.CHIA_PGLITE_MODULE;
if (!modulePath) throw new Error('Set CHIA_PGLITE_MODULE to an installed PGlite index.js. No network or install is performed.');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const oldHarness = await readFile(resolve(repo, 'scripts/chia-dot-star-letter-pglite-harness.mjs'), 'utf8');
const baseline = oldHarness.match(/const baseline = `([\s\S]*?)`;\n/);
if (!baseline) throw new Error('Existing synthetic fixture baseline missing');
const migration = 'supabase/migrations/20261110155216_chia_historical_post_memory_sources.sql';
const src = async p => await readFile(resolve(repo,p),'utf8');
const migrations = ['supabase/migrations/20260908123500_add_chia_star_letter_reply_runs.sql', 'supabase/migrations/20261010213000_chia_reply_memory_and_fencing.sql','supabase/migrations/20261020120000_chia_dot_reply_atomic_guards.sql','supabase/migrations/20261020123000_chia_source_monotonic_revisions.sql','supabase/migrations/20261020124500_chia_source_monotonic_any_update.sql',migration];
const chia='41000000-0000-4000-8000-000000000001';
const human='41000000-0000-4000-8000-000000000002';
const other='41000000-0000-4000-8000-000000000003';
const post='42000000-0000-4000-8000-000000000002';
const secondPost='42000000-0000-4000-8000-000000000003';
const letter='43000000-0000-4000-8000-000000000001';
const key=id=>'historical_post_'+id.replaceAll('-','');
const sqlQuote=x=>"'"+x.replaceAll("'","''")+"'";
const memorySQL=(id,owner=human,content='I made an original song.',kind='post')=>`insert into public.chia_person_memories(chia_profile_id,person_profile_id,${kind==='post'?'source_post_id':'source_star_letter_id'},memory_key,content) values('${chia}','${owner}','${id}',${sqlQuote(kind==='post'?key(id):'topic')},${sqlQuote(content)})`;
const count=async db=>(await db.query('select count(*)::int n from public.chia_person_memories')).rows[0].n;
async function rejects(db,statement,pattern,label) {
  await assert.rejects(db.exec(statement),error=>new RegExp(pattern,'i').test(error.message),label);
}
async function main() {
  const db=new PGlite();
  try {
    await db.exec(baseline[1]);
    for (const file of migrations) {
      try { await db.exec(await src(file)); }
      catch (error) { error.message=`${file}: ${error.message}`; throw error; }
    }
    await db.exec(`
      insert into auth.users(id) values('${chia}'),('${human}'),('${other}');
      insert into public.profiles(id,display_name,username) values
      ('${chia}','synthetic chia','synthetic_chia'),
      ('${human}','synthetic human','synthetic_human'),
      ('${other}','synthetic other','synthetic_other');
      update public.profile_kinds set kind='ai_resident' where profile_id='${chia}';
      insert into public.posts(id,author_id,body,created_at) values
      ('${post}','${human}','I made an original song.',now()-interval '120 days'),
      ('${secondPost}','${human}','A new drawing in my archive.',now()-interval '115 days'),
      ('42000000-0000-4000-8000-000000000001','${chia}','Chia synthetic question.',now()-interval '120 days');
      insert into public.star_letters(id,post_id,author_id,body) values
      ('${letter}','42000000-0000-4000-8000-000000000001','${human}','I also like singing.');
    `);
    await db.exec(memorySQL(post));
    assert.equal(await count(db),1,'public historical post can seed a truthful quote');
    await db.exec(memorySQL(letter,human,'I also like singing.','star_letter'));
    assert.equal(await count(db),2,'legacy direct star-letter memories are still accepted');
    let records=(await db.query(`select source_post_id,source_star_letter_id from public.chia_person_memories order by source_post_id nulls last`)).rows;
    assert.ok(records.some(x=>x.source_post_id===post&&x.source_star_letter_id===null));
    assert.ok(records.some(x=>x.source_star_letter_id===letter&&x.source_post_id===null));
    await rejects(db,memorySQL(post,other),/invalid historical post evidence|invalid memory participants/, 'other human cannot claim the source');
    await rejects(db,memorySQL(secondPost,human,'Invented song title'),/invalid historical post evidence/, 'cannot hallucinate post quote');
    await rejects(db,`insert into public.chia_person_memories(chia_profile_id,person_profile_id,source_post_id,source_star_letter_id,memory_key,content) values('${chia}','${human}','${secondPost}','${letter}','both','text')`,/exactly_one_source|invalid historical post evidence/, 'must have exactly one evidence source');
    await db.exec(`update public.posts set visibility='private' where id='${post}'`);
    assert.equal(await count(db),1,'changing a post to private deletes the linked historic memory');
    await rejects(db,memorySQL(post),/invalid historical post evidence/,'private post cannot be reimported');
    await db.exec(`update public.posts set visibility='public' where id='${post}'`);
    await db.exec(memorySQL(post));
    assert.equal(await count(db),2,'a public post can be imported again if the owner did not exclude it');
    const oldRev=(await db.query(`select revision from public.chia_person_memory_partitions where chia_profile_id='${chia}' and person_profile_id='${human}'`)).rows[0].revision;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${human}',false);`);
    const visible=(await db.query('select count(*)::int n from public.chia_person_memories')).rows[0].n;
    assert.equal(visible,2,'owner sees own memories');
    await db.exec(`delete from public.chia_person_memories where source_post_id='${post}'`);
    await db.exec('reset role; select set_config(\'request.jwt.claim.sub\',\'\',false);');
    assert.equal(await count(db),1,'owner can delete historical memory');
    const excluded=(await db.query(`select source_type,source_id from public.chia_memory_source_exclusions where person_profile_id='${human}'`)).rows;
    assert.deepEqual(excluded,[{source_type:'post',source_id:post}],'owner delete creates persistent reimport exclusion');
    await rejects(db,memorySQL(post),/source excluded by owner/,'cannot reimport a deleted owner memory');
    const newRev=(await db.query(`select revision from public.chia_person_memory_partitions where chia_profile_id='${chia}' and person_profile_id='${human}'`)).rows[0].revision;
    assert.ok(BigInt(newRev)>BigInt(oldRev),'owner deletion fences in-flight memories');
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query('select count(*)::int n from public.chia_person_memories')).rows[0].n,0,'other human cannot view memories');
    assert.equal((await db.query('select count(*)::int n from public.chia_memory_source_exclusions')).rows[0].n,0,'other human cannot view exclusions');
    await rejects(db,`delete from public.chia_memory_source_exclusions where person_profile_id='${human}'`,/permission denied/,'owners cannot clear exclusions to replay a source');
    await db.exec('reset role; select set_config(\'request.jwt.claim.sub\',\'\',false);');
    await db.exec(`update public.posts set body='The drawing was edited.' where id='${secondPost}'`);
    await rejects(db,memorySQL(secondPost,human,'A new drawing in my archive.'),/invalid historical post evidence/, 'edited-out quote cannot be reimported');
    const partition=(await db.query(`select public.snapshot_chia_person_memory('${chia}','${human}') result`)).rows[0].result;
    assert.equal(partition.memories.length,1);
    assert.equal(partition.memories[0].content,'I also like singing.');
    console.log('PGLITE_GREEN: legacy star letters, historical public quotes, deletion, edit/private invalidation, owner exclusions, RLS, memory revision');
    console.log('PGLITE_BOUNDARY: synthetic in-memory database; no Supabase or Production access');
  } finally {await db.close();}
}
await main();
