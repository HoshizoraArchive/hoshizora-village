import { createHash } from 'node:crypto';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const clean = (value, max = 500) => Array.from(String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/https?:\/\/\S+/gi, '[URL]').trim()).slice(0, max).join('');
async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}_query_failed`);
  return data ?? [];
}
export async function loadChiaDotStarLetterSnapshot(supabase, { sourceId, chiaProfileId, founderProfileId }) {
  const letters = await rows(supabase.from('star_letters').select('id,post_id,author_id,body,parent_star_letter_id,created_at,updated_at').eq('id', sourceId).is('deleted_at', null).limit(1), 'source');
  const source = letters[0];
  if (!source || source.author_id === chiaProfileId) throw new Error('source_not_eligible');
  const posts = await rows(supabase.from('posts').select('id,author_id,body,visibility,updated_at').eq('id', source.post_id).eq('author_id', chiaProfileId).eq('visibility', 'public').is('deleted_at', null).limit(1), 'post');
  if (!posts.length || posts[0].visibility !== 'public') throw new Error('post_not_eligible');
  const profiles = await rows(supabase.from('profiles').select('id,display_name,username').eq('id', source.author_id).limit(1), 'profile');
  if (!profiles.length) throw new Error('author_profile_missing');
  const kinds = await rows(supabase.from('profile_kinds').select('kind').eq('profile_id', source.author_id).eq('kind', 'human').limit(1), 'kind');
  if (!kinds.length) throw new Error('author_not_human');
  const roles = source.author_id === founderProfileId && UUID.test(founderProfileId ?? '') ? await rows(supabase.from('profile_roles').select('role_key').eq('profile_id', source.author_id).eq('role_key', 'founder').limit(1), 'founder') : [];
  const blocked = await rows(supabase.from('profile_blocks').select('blocker_id,blocked_id').or(`and(blocker_id.eq.${source.author_id},blocked_id.eq.${chiaProfileId}),and(blocker_id.eq.${chiaProfileId},blocked_id.eq.${source.author_id})`).limit(1), 'blocks');
  if (blocked.length) throw new Error('blocked');
  const { data: partition, error: memoryError } = await supabase.rpc('snapshot_chia_person_memory', {
    p_chia_profile_id: chiaProfileId, p_person_profile_id: source.author_id,
  });
  if (memoryError || typeof partition?.revision !== 'string' || !/^(0|[1-9][0-9]*)$/.test(partition.revision) || !Array.isArray(partition.memories)) throw new Error('memory_query_failed');
  const memory = partition.memories;
  const recent = await rows(supabase.from('star_letters').select('id,author_id,body,created_at,parent_star_letter_id').eq('post_id', source.post_id).in('author_id', [source.author_id, chiaProfileId]).is('deleted_at', null).lte('created_at', source.created_at).order('created_at', { ascending: false }).limit(40), 'history');
  const parentRows = source.parent_star_letter_id ? await rows(supabase.from('star_letters').select('id,author_id').eq('id', source.parent_star_letter_id).eq('post_id', source.post_id).is('deleted_at', null).limit(1), 'parent') : [];
  const parent = parentRows[0] ?? null;
  if (source.parent_star_letter_id && (!parent || parent.author_id !== chiaProfileId)) throw new Error('invalid_parent');
  const humanStarLetterIds = new Set(recent.filter((entry) => entry.author_id === source.author_id).map((entry) => entry.id));
  const ownDialogue = recent.filter((entry) => entry.author_id === source.author_id || (entry.author_id === chiaProfileId && humanStarLetterIds.has(entry.parent_star_letter_id))).slice(0, 12);
  const evidence = { sourceId: source.id, sourceUpdatedAt: source.updated_at, postId: posts[0].id, postUpdatedAt: posts[0].updated_at, postVisibility: posts[0].visibility, memoryRevision: partition.revision };
  const context = { sourceId: source.id, accountId: source.author_id, chiaProfileId, isFounder: roles.length > 0, evidence, author: { displayName: clean(profiles[0].display_name, 80), username: clean(profiles[0].username, 64) }, post: clean(posts[0].body), rememberedFacts: memory.slice(0, 12).map((entry) => ({ key: clean(entry.memory_key, 80), content: clean(entry.content, 500) })), incoming: clean(source.body), recentConversation: ownDialogue.reverse().map(({ id, author_id, body }) => ({ id, speaker: author_id === chiaProfileId ? 'chia' : 'villager', body: clean(body) })) };
  return { context, evidence, snapshotHash: createHash('sha256').update(JSON.stringify(context)).digest('hex') };
}
