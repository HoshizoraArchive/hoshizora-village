import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('./ChiaMemorySettings.jsx',import.meta.url),'utf8');
test('only an authenticated owner RPC may permanently forget a source',()=>{
  assert.match(source,/\.rpc\("delete_own_chia_memory",\s*\{\s*p_memory_id:\s*memory\.id\s*\}\)/);
  assert.doesNotMatch(source,/\.from\("chia_person_memories"\)\s*\.delete\(/);
  assert.match(source,/deletion\?\.outcome\s*!==\s*"deleted"/);
  assert.match(source,/まとめて削除しますか/);
});
