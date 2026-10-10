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

export async function rememberChiaDotStarLetter(db, { run, signed, chiaProfileId }) {
  if (run.status !== 'replied') return { outcome: 'not_replied' };
  const { data: original, error: readError } = await db.from('star_letters').select('id,author_id,body,deleted_at').eq('id', signed.sourceId).maybeSingle();
  if (readError) throw new Error('source_lookup_failed');
  if (!original || original.deleted_at || original.author_id === chiaProfileId) return { outcome: 'source_no_longer_eligible' };
  const evidence = parseChiaDotMemoryEvidence(signed.body, original.body);
  if (!evidence) return { outcome: 'invalid_memory_evidence' };
  const { data: existing, error: existingError } = await db.from('chia_person_memories').select('id').eq('chia_profile_id', chiaProfileId).eq('person_profile_id', original.author_id).eq('memory_key', evidence.key).maybeSingle();
  if (existingError) throw new Error('memory_lookup_failed');
  if (existing) return { outcome: 'already_remembered' };
  const { error: insertError } = await db.from('chia_person_memories').insert({
    chia_profile_id: chiaProfileId,
    person_profile_id: original.author_id,
    source_star_letter_id: signed.sourceId,
    memory_key: evidence.key,
    content: evidence.quote,
  });
  if (insertError) {
    if (insertError.code === '23505') return { outcome: 'already_remembered' };
    throw new Error('memory_insert_failed');
  }
  return { outcome: 'remembered' };
}
