const KEY_PATTERN = /^[a-z0-9_]{3,64}$/;
const SENSITIVE_PATTERN = /(?:\b(?:diagnos(?:is|ed)|medication|depress(?:ion|ed)|suicid(?:al|e)|religion|christian|muslim|buddhist|sexual(?:ity)?|pregnan(?:cy|t)|passport|password|ssn|bank\s*account|credit\s*card)\b|病気|診断|治療|薬を|服薬|障害|宗教|信仰|創価|性的|妊娠|住所|電話番号|クレジットカード|口座|パスワード|暗証番号|生年月日|誕生日|選挙|支持政党)/i;

export function parseChiaDotMemoryEvidence(body, sourceBody) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (Object.keys(parsed).sort().join(',') !== 'evidenceQuote,memoryKey') return null;
  const key = parsed.memoryKey;
  const quote = parsed.evidenceQuote;
  if (typeof key !== 'string' || !KEY_PATTERN.test(key) || typeof quote !== 'string' || quote.trim() !== quote || quote.length < 4 || quote.length > 300 || /[\u0000-\u001f\u007f]/.test(quote) || SENSITIVE_PATTERN.test(quote)) return null;
  if (typeof sourceBody !== 'string' || !sourceBody.includes(quote)) return null;
  return { key, quote };
}

export async function rememberChiaDotStarLetter(db, { run, signed, chiaProfileId, evidence }) {
  if (run.status !== 'replied') return { outcome: 'not_replied' };
  // Never let a stale quote acquire the revision read after generation.
  if (!evidence?.sourceUpdatedAt || !evidence?.postUpdatedAt) return { outcome: 'stale_snapshot' };
  const { data: original, error: readError } = await db.from('star_letters').select('id,author_id,body,deleted_at,updated_at').eq('id', signed.sourceId).maybeSingle();
  if (readError) throw new Error('source_lookup_failed');
  if (!original || original.deleted_at || original.author_id === chiaProfileId) return { outcome: 'source_no_longer_eligible' };
  if (Date.parse(original.updated_at) !== Date.parse(evidence.sourceUpdatedAt)) return { outcome: 'stale_snapshot' };
  const parsed = parseChiaDotMemoryEvidence(signed.body, original.body);
  if (!parsed) return { outcome: 'invalid_memory_evidence' };
  const { data, error } = await db.rpc('remember_chia_star_letter_reply', {
    p_run_id: signed.runId, p_chia_profile_id: chiaProfileId,
    p_person_profile_id: original.author_id, p_claim_token: signed.claimToken,
    p_source_star_letter_id: signed.sourceId,
    p_source_updated_at: evidence.sourceUpdatedAt, p_post_updated_at: evidence.postUpdatedAt,
    p_memory_key: parsed.key, p_content: parsed.quote, p_importance: 3,
  });
  if (error) throw new Error('memory_transaction_failed');
  if (!data?.outcome) throw new Error('unexpected_memory_outcome');
  return data;
}
