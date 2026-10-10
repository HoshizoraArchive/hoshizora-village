import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

// All reads and writes are filtered by auth.uid() in the DB's RLS policies.
// The UI also binds requests to the currently signed-in account to avoid a
// stale response displaying another account's personal memories.
export default function ChiaMemorySettings({ userId }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState(null);
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async (isCancelled = () => false) => {
    if (!userId) return;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("chia_person_memories")
      .select("id,memory_key,content,updated_at")
      .eq("person_profile_id", userId)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (isCancelled()) return;
    setMemories(queryError ? [] : data ?? []);
    setError(queryError ? "記憶を読み込めませんでした。" : "");
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setMemories([]);
    setEditing(null);
    if (!userId) { setLoading(false); return; }
    void reload(() => cancelled);
    return () => { cancelled = true; };
  }, [userId, reload]);

  async function save(memory) {
    if (!userId || workingId || !editing || editing.id !== memory.id) return;
    const content = editing.content.trim();
    if (!content || content.length > 1200) {
      setError("記憶は1〜1200文字で入力してください。");
      return;
    }
    setWorkingId(memory.id);
    const { error: updateError } = await supabase
      .from("chia_person_memories")
      .update({ content })
      .eq("id", memory.id)
      .eq("person_profile_id", userId);
    setWorkingId(null);
    if (updateError) { setError("記憶を更新できませんでした。"); return; }
    setEditing(null);
    setError("");
    await reload();
  }

  async function erase(memory) {
    if (!userId || workingId || !window.confirm("この記憶を削除しますか？")) return;
    setWorkingId(memory.id);
    const { error: deleteError } = await supabase
      .from("chia_person_memories")
      .delete()
      .eq("id", memory.id)
      .eq("person_profile_id", userId);
    setWorkingId(null);
    if (deleteError) { setError("記憶を削除できませんでした。"); return; }
    setEditing(null);
    setError("");
    await reload();
  }

  if (!userId) return null;
  return (
    <section aria-label="ちあの記憶管理" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
      <h3 className="text-sm font-black text-white">ちあが覚えていること</h3>
      <p className="mt-1 text-xs leading-6 text-slate-400">あなたの星文に合わせた返信のための記憶です。自分の記憶を確認・書き直し・削除できます。</p>
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {loading ? <p className="mt-3 text-xs text-slate-400">読み込み中…</p> : null}
      {!loading && memories.length === 0 ? <p className="mt-3 text-xs text-slate-400">保存された記憶はありません。</p> : null}
      <div className="mt-3 space-y-3">
        {memories.map((memory) => (
          <div key={memory.id} className="rounded-xl border border-white/10 bg-night-950/30 p-3">
            <p className="text-xs font-bold text-comet">{memory.memory_key}</p>
            {editing?.id === memory.id ? (
              <label className="mt-2 block text-xs text-slate-300">
                記憶の内容
                <textarea className="mt-2 min-h-24 w-full rounded-lg border border-white/20 bg-night-950/60 p-2 text-sm text-white" maxLength={1200} value={editing.content} onChange={(event) => setEditing({ id: memory.id, content: event.target.value })} />
              </label>
            ) : <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{memory.content}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {editing?.id === memory.id ? (
                <>
                  <button type="button" disabled={!!workingId} onClick={() => void save(memory)} className="rounded-lg border border-comet/40 px-3 py-1 text-xs text-comet">保存</button>
                  <button type="button" disabled={!!workingId} onClick={() => setEditing(null)} className="rounded-lg border border-white/20 px-3 py-1 text-xs">キャンセル</button>
                </>
              ) : <button type="button" disabled={!!workingId} onClick={() => setEditing({ id: memory.id, content: memory.content })} className="rounded-lg border border-white/20 px-3 py-1 text-xs">修正</button>}
              <button type="button" disabled={!!workingId} onClick={() => void erase(memory)} className="rounded-lg border border-rose-300/30 px-3 py-1 text-xs text-rose-200">削除</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
