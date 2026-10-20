#!/usr/bin/env node
// LOCAL ONLY: PGlite regression for bounded oldest-first Chia discovery.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pglitePath = process.env.CHIA_PGLITE_MODULE
  ?? '/tmp/chia-hardening-tools/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(resolve(pglitePath)).href);
const harnessSource = await readFile(resolve(repo, 'scripts/chia-dot-star-letter-pglite-harness.mjs'), 'utf8');
const baseline = harnessSource.match(/const baseline = `([\s\S]*?)`;/)?.[1];
assert.ok(baseline, 'could not read PGlite fixture baseline');

const db = new PGlite();
try {
  await db.exec(baseline);
  for (const migration of [
    'supabase/migrations/20260908123500_add_chia_star_letter_reply_runs.sql',
    'supabase/migrations/20261010213000_chia_reply_memory_and_fencing.sql',
    'supabase/migrations/20261020120000_chia_dot_reply_atomic_guards.sql',
  ]) {
    let source = await readFile(resolve(repo, migration), 'utf8');
    if (process.env.CHIA_DISCOVERY_TEST_DESCENDING === 'true'
      && migration.endsWith('20261020120000_chia_dot_reply_atomic_guards.sql')) {
      source = source.replace('order by sl.created_at,sl.id', 'order by sl.created_at desc,sl.id desc');
    }
    await db.exec(source);
  }
  await db.exec(await readFile(resolve(repo, 'supabase/tests/chia-dot-discovery-fairness-assertions.sql'), 'utf8'));
  console.log('GREEN: oldest due candidate remains discoverable through continuous newer arrivals; 48h expiry enforced');
} finally {
  await db.close();
}
