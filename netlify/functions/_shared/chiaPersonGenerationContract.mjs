import { createHash } from 'node:crypto';

const MAX_DIALOGUE_TURNS = 12;
const MAX_MEMORY_FACTS = 12;
const MAX_MEMORY_CHARS = 500;
const MAX_TURN_CHARS = 500;
const MODEL = 'cos-chatgpt';
const MAX_INPUT_TOKENS = 8000;
const MAX_OUTPUT_TOKENS = 512;
const MAX_RESERVED_COST_MICROUSD = 5000;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const bounded = (value, max) => Array.from(String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()).slice(0, max).join('');
const isValidReply = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;

/**
 * Create the complete, person-scoped input for one fresh CoS Dot invocation.
 * The returned object intentionally contains no team/project state or session key.
 * The caller must create a new ephemeral generation per request and must not attach
 * shared mutable chats, Worker personal libraries, or prior villagers' context.
 */
export function createChiaPersonGenerationRequest(snapshot, generationBudget) {
  const context = snapshot?.context;
  const evidence = context?.evidence;
  if (!context || !UUID.test(context.accountId ?? '') || !UUID.test(context.sourceId ?? '') || !UUID.test(context.chiaProfileId ?? '') || !evidence
    || !UUID.test(snapshot?.generationInvocationId ?? '')) {
    throw new Error('invalid_person_generation_snapshot');
  }
  const expectedSnapshotHash = createHash('sha256').update(JSON.stringify(context)).digest('hex');
  if (snapshot.snapshotHash !== expectedSnapshotHash) throw new Error('invalid_person_generation_snapshot_hash');
  if (generationBudget?.model !== MODEL
    || !Number.isInteger(generationBudget.max_input_tokens) || generationBudget.max_input_tokens < 1 || generationBudget.max_input_tokens > MAX_INPUT_TOKENS
    || !Number.isInteger(generationBudget.max_output_tokens) || generationBudget.max_output_tokens < 1 || generationBudget.max_output_tokens > MAX_OUTPUT_TOKENS
    || !Number.isInteger(generationBudget.reserved_cost_microusd) || generationBudget.reserved_cost_microusd < 1 || generationBudget.reserved_cost_microusd > MAX_RESERVED_COST_MICROUSD) {
    throw new Error('invalid_person_generation_budget');
  }
  if (evidence.sourceId !== context.sourceId || !UUID.test(evidence.postId ?? '') || typeof evidence.sourceUpdatedAt !== 'string' || typeof evidence.postUpdatedAt !== 'string' || evidence.postVisibility !== 'public') {
    throw new Error('invalid_person_generation_evidence');
  }
  const rememberedFacts = Array.isArray(context.rememberedFacts)
    ? context.rememberedFacts.slice(0, MAX_MEMORY_FACTS).map(({ key, content }) => Object.freeze({ key: bounded(key, 80), content: bounded(content, MAX_MEMORY_CHARS) }))
    : [];
  const recentConversation = Array.isArray(context.recentConversation)
    ? context.recentConversation.slice(-MAX_DIALOGUE_TURNS).map(({ speaker, body }) => {
      if (speaker !== 'villager' && speaker !== 'chia') throw new Error('invalid_person_generation_speaker');
      return Object.freeze({ speaker, body: bounded(body, MAX_TURN_CHARS) });
    })
    : [];
  return Object.freeze({
    adapter: 'cos-durable-dot-personal-reply-v1',
    invocationId: snapshot.generationInvocationId,
    persistence: 'ephemeral-per-invocation',
    scope: Object.freeze({ chiaProfileId: context.chiaProfileId ?? null, personProfileId: context.accountId, sourceStarLetterId: context.sourceId }),
    snapshotHash: snapshot.snapshotHash,
    evidence: Object.freeze({ ...evidence }),
    budget: Object.freeze({ model: MODEL, maxInputTokens: generationBudget.max_input_tokens, maxOutputTokens: generationBudget.max_output_tokens, reservedCostMicrousd: generationBudget.reserved_cost_microusd }),
    persona: Object.freeze({ displayName: '星空ちあ', isFounder: context.isFounder === true }),
    input: Object.freeze({
      author: Object.freeze({ displayName: bounded(context.author?.displayName, 80), username: bounded(context.author?.username, 64) }),
      post: bounded(context.post, 500),
      incoming: bounded(context.incoming, 500),
      rememberedFacts: Object.freeze(rememberedFacts),
      recentConversation: Object.freeze(recentConversation),
    }),
    forbiddenContext: Object.freeze(['other-person-memory', 'shared-seven-role-team-pii', 'persistent-chat-history', 'worker-personal-library']),
  });
}

/** Invoke only a fresh, explicit adapter after obtaining a bounded cost quote. */
export async function invokeChiaPersonGeneration(snapshot, generationBudget, adapter) {
  if (adapter?.ephemeralPerInvocation !== true || adapter?.personalLibraryEnabled !== false || adapter?.sharedTeamContextEnabled !== false
    || adapter?.outputTokenLimitEnforced !== true || adapter?.idempotencyEnforced !== true || typeof adapter?.countInputTokens !== 'function'
    || typeof adapter?.quoteCostMicrousd !== 'function' || typeof adapter?.authorizeWake !== 'function'
    || typeof adapter?.lookupGeneration !== 'function' || typeof adapter?.generate !== 'function') {
    throw new Error('chia_generation_adapter_not_isolated');
  }
  const request = createChiaPersonGenerationRequest(snapshot, generationBudget);
  const inputTokens = await adapter.countInputTokens(request);
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > request.budget.maxInputTokens) {
    throw new Error('chia_generation_input_exceeds_budget');
  }
  const quote = await adapter.quoteCostMicrousd(request);
  if (!Number.isInteger(quote) || quote < 0 || quote > request.budget.reservedCostMicrousd) {
    throw new Error('chia_generation_cost_exceeds_reservation');
  }
  const wake = await adapter.authorizeWake(request);
  if ((wake?.outcome === 'authorized' || wake?.outcome === 'already_woken')
    && wake.generationInvocationId !== request.invocationId) {
    throw new Error('chia_generation_invocation_mismatch');
  }
  if (wake?.outcome === 'authorized') {
    const result = await adapter.generate(request, {
      idempotencyKey: request.invocationId,
      maxOutputTokens: request.budget.maxOutputTokens,
    });
    if (!isValidReply(result)) throw new Error('chia_generation_invalid_output');
    return result;
  }
  if (wake?.outcome === 'already_woken' || wake?.outcome === 'ambiguous') {
    const generation = await adapter.lookupGeneration(request.invocationId);
    if (generation?.outcome === 'completed' && isValidReply(generation.result)) return generation.result;
    throw new Error('chia_generation_reconciliation_required');
  }
  throw new Error('chia_provider_wake_not_authorized');
}
