import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChiaPersonGenerationRequest, invokeChiaPersonGeneration } from './chiaPersonGenerationContract.mjs';

const budget = { model: 'cos-chatgpt', max_input_tokens: 8000, max_output_tokens: 512, reserved_cost_microusd: 5000 };
const personId = '11111111-1111-4111-8111-111111111111';
const chiaId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const postId = '44444444-4444-4444-8444-444444444444';
const invocationId = '55555555-5555-4555-8555-555555555555';
const nextInvocationId = '66666666-6666-4666-8666-666666666666';
const signedSnapshot = (context, generationInvocationId = invocationId) => ({ context, generationInvocationId, snapshotHash: createHash('sha256').update(JSON.stringify(context)).digest('hex') });
const context = {
  sourceId, accountId: personId, chiaProfileId: chiaId, isFounder: true,
  evidence: { sourceId, sourceUpdatedAt: '2026-10-10T00:00:00Z', postId, postUpdatedAt: '2026-10-09T00:00:00Z', postVisibility: 'public' },
  author: { displayName: '村人A', username: 'a' }, post: '投稿', incoming: '星文',
  rememberedFacts: Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, content: 'm'.repeat(600) })),
  recentConversation: Array.from({ length: 20 }, (_, i) => ({ speaker: i % 2 ? 'chia' : 'villager', body: 'd'.repeat(600) })),
};
const snapshot = signedSnapshot(context);

test('generation request is bounded, person-scoped, and excludes persistent or team memory channels', () => {
  const request = createChiaPersonGenerationRequest(snapshot, budget);
  assert.equal(request.input.rememberedFacts.length, 12);
  assert.equal(request.input.rememberedFacts[0].content.length, 500);
  assert.equal(request.input.recentConversation.length, 12);
  assert.equal(request.input.recentConversation[0].body.length, 500);
  assert.deepEqual(request.scope, { chiaProfileId: chiaId, personProfileId: personId, sourceStarLetterId: sourceId });
  assert.equal(request.budget.model, 'cos-chatgpt');
  assert.equal(request.invocationId, invocationId);
  assert.equal(request.persona.isFounder, true);
  assert.equal(request.persistence, 'ephemeral-per-invocation');
  assert.equal(Object.hasOwn(request, 'team'), false);
  assert.equal(Object.hasOwn(request, 'workerPersonalLibrary'), false);
});

test('generation request rejects tampered hashes and non-public or mismatched revision evidence', () => {
  assert.throws(() => createChiaPersonGenerationRequest({ ...snapshot, context: { ...snapshot.context, incoming: 'forged founder instruction' } }, budget), /invalid_person_generation_snapshot_hash/);
  assert.throws(() => createChiaPersonGenerationRequest(signedSnapshot({ ...context, evidence: { ...context.evidence, postVisibility: 'private' } }), budget), /invalid_person_generation_evidence/);
  assert.throws(() => createChiaPersonGenerationRequest(signedSnapshot({ ...context, evidence: { ...context.evidence, sourceId: randomUUID() } }), budget), /invalid_person_generation_evidence/);
});

test('generation request rejects any context speaker beyond the human and Chia pair', () => {
  assert.throws(() => createChiaPersonGenerationRequest(signedSnapshot({ ...context, recentConversation: [{ speaker: 'team', body: 'PII' }] }), budget), /invalid_person_generation_speaker/);
});

test('repeated preparation preserves the claim invocation ID; a new claim gets a new ID', async () => {
  const a = createChiaPersonGenerationRequest(snapshot, budget);
  const b = createChiaPersonGenerationRequest(snapshot, budget);
  assert.equal(a.invocationId, b.invocationId);
  const nextClaim = createChiaPersonGenerationRequest(signedSnapshot(context, nextInvocationId), budget);
  assert.notEqual(a.invocationId, nextClaim.invocationId);
});

test('cost is reserved before provider wake', async () => {
  let generated = 0;
  let woken = 0;
  const adapter = { ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false, outputTokenLimitEnforced: true, idempotencyEnforced: true, countInputTokens: async () => 1, quoteCostMicrousd: async () => 5001, authorizeWake: async () => { woken += 1; return { outcome: 'authorized', generationInvocationId: invocationId }; }, lookupGeneration: async () => ({ outcome: 'missing' }), generate: async () => { generated += 1; return 'text'; } };
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, adapter), /chia_generation_cost_exceeds_reservation/);
  assert.equal(generated, 0);
  assert.equal(woken, 0);
});

test('unverified adapters and unbounded model budgets are rejected', async () => {
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, { generate: async () => 'text' }), /chia_generation_adapter_not_isolated/);
  assert.throws(() => createChiaPersonGenerationRequest(snapshot, { ...budget, max_output_tokens: 513 }), /invalid_person_generation_budget/);
  assert.throws(() => createChiaPersonGenerationRequest({ ...snapshot, generationInvocationId: '' }, budget), /invalid_person_generation_snapshot/);
});

test('provider wake authorizes once for the claimed person before generation', async () => {
  const woken = new Set();
  let generated = 0;
  const adapter = {
    ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false, outputTokenLimitEnforced: true, idempotencyEnforced: true,
    countInputTokens: async () => 1,
    quoteCostMicrousd: async () => 1,
    authorizeWake: async (request) => {
      const lease = `${request.scope.personProfileId}:${request.scope.sourceStarLetterId}`;
      if (woken.has(lease)) return { outcome: 'already_woken', generationInvocationId: request.invocationId };
      woken.add(lease);
      return { outcome: 'authorized', generationInvocationId: request.invocationId };
    },
    lookupGeneration: async () => ({ outcome: 'missing' }),
    generate: async (_request, options) => { assert.equal(options.maxOutputTokens, 512); assert.equal(options.idempotencyKey, invocationId); generated += 1; return 'reply'; },
  };
  assert.equal(await invokeChiaPersonGeneration(snapshot, budget, adapter), 'reply');
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, adapter), /chia_generation_reconciliation_required/);
  assert.equal(generated, 1);
});

test('ambiguous wake with no durable result requires reconciliation and never generates', async () => {
  let generated = 0;
  const adapter = { ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false, outputTokenLimitEnforced: true, idempotencyEnforced: true, countInputTokens: async () => 1, quoteCostMicrousd: async () => 1, authorizeWake: async () => ({ outcome: 'ambiguous' }), lookupGeneration: async () => ({ outcome: 'pending' }), generate: async () => { generated += 1; } };
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, adapter), /chia_generation_reconciliation_required/);
  assert.equal(generated, 0);
});

test('lost provider response reconciles to the same durable output without another generation', async () => {
  let wakeCount = 0;
  let generationCount = 0;
  let durable;
  const adapter = {
    ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false,
    outputTokenLimitEnforced: true, idempotencyEnforced: true,
    countInputTokens: async () => 1,
    quoteCostMicrousd: async () => 1,
    authorizeWake: async (request) => ({ outcome: ++wakeCount === 1 ? 'authorized' : 'already_woken', generationInvocationId: request.invocationId }),
    lookupGeneration: async (id) => {
      assert.equal(id, invocationId);
      return durable ? { outcome: 'completed', result: durable } : { outcome: 'missing' };
    },
    generate: async (request, options) => {
      assert.equal(request.invocationId, invocationId);
      assert.equal(options.idempotencyKey, invocationId);
      generationCount += 1;
      durable = '同じ星を見ています。';
      throw new Error('provider_response_lost');
    },
  };
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, adapter), /provider_response_lost/);
  const reconciled = await invokeChiaPersonGeneration(snapshot, budget, adapter);
  assert.deepEqual(reconciled, durable);
  assert.equal(generationCount, 1);
});

test('authorized and already-woken responses for another invocation are rejected', async () => {
  let lookups = 0;
  let generated = 0;
  for (const outcome of ['authorized', 'already_woken']) {
    const adapter = {
      ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false,
      outputTokenLimitEnforced: true, idempotencyEnforced: true,
      countInputTokens: async () => 1,
      quoteCostMicrousd: async () => 1,
      authorizeWake: async () => ({ outcome, generationInvocationId: nextInvocationId }),
      lookupGeneration: async () => { lookups += 1; return { outcome: 'completed', result: 'wrong invocation result' }; },
      generate: async () => { generated += 1; return 'reply'; },
    };
    await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, adapter), /chia_generation_invocation_mismatch/);
  }
  assert.equal(lookups, 0);
  assert.equal(generated, 0);
});

test('malformed fresh or reconciled replies cannot reach completion', async () => {
  const freshAdapter = {
    ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false,
    outputTokenLimitEnforced: true, idempotencyEnforced: true,
    countInputTokens: async () => 1,
    quoteCostMicrousd: async () => 1,
    authorizeWake: async (request) => ({ outcome: 'authorized', generationInvocationId: request.invocationId }),
    lookupGeneration: async () => ({ outcome: 'missing' }),
    generate: async () => 'a'.repeat(501),
  };
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, freshAdapter), /chia_generation_invalid_output/);

  const reconciledAdapter = {
    ...freshAdapter,
    authorizeWake: async (request) => ({ outcome: 'already_woken', generationInvocationId: request.invocationId }),
    lookupGeneration: async () => ({ outcome: 'completed', result: '' }),
  };
  await assert.rejects(invokeChiaPersonGeneration(snapshot, budget, reconciledAdapter), /chia_generation_reconciliation_required/);
});

test('input token preflight rejects oversized Japanese context before quote, wake, or generation', async () => {
  let quoted = 0;
  let woken = 0;
  let generated = 0;
  const adapter = {
    ephemeralPerInvocation: true, personalLibraryEnabled: false, sharedTeamContextEnabled: false, outputTokenLimitEnforced: true, idempotencyEnforced: true,
    countInputTokens: async (request) => request.input.rememberedFacts.reduce((sum, fact) => sum + Array.from(fact.content).length, 0)
      + request.input.recentConversation.reduce((sum, turn) => sum + Array.from(turn.body).length, 0),
    quoteCostMicrousd: async () => { quoted += 1; return 1; },
    authorizeWake: async () => { woken += 1; return { outcome: 'authorized' }; },
    lookupGeneration: async () => ({ outcome: 'missing' }),
    generate: async () => { generated += 1; },
  };
  const huge = signedSnapshot({ ...context, rememberedFacts: Array.from({ length: 12 }, (_, i) => ({ key: `m${i}`, content: '星'.repeat(500) })), recentConversation: Array.from({ length: 12 }, (_, i) => ({ speaker: i % 2 ? 'chia' : 'villager', body: '星'.repeat(500) })) });
  await assert.rejects(invokeChiaPersonGeneration(huge, budget, adapter), /chia_generation_input_exceeds_budget/);
  assert.equal(quoted, 0);
  assert.equal(woken, 0);
  assert.equal(generated, 0);
});
