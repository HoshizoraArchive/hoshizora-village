import { useEffect, useMemo, useState } from "react";
import { ERROR_OPERATION, getUserFacingError, logSafeError } from "./safeErrors";
import { supabase } from "./lib/supabaseClient";
import {
  GUIDE_ENTRY_SELECT_COLUMNS,
  GUIDE_SECTION_SELECT_COLUMNS,
  buildVillageGuideTree,
  createVillageGuideStableKey,
  validateVillageGuideEntryInput,
  validateVillageGuideSectionInput,
} from "./villageGuide";

const emptySectionDraft = {
  parentId: "",
  title: "",
};

function sortRows(rows, keyName) {
  return [...rows].sort(
    (left, right) =>
      Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) ||
      String(left[keyName] ?? "").localeCompare(String(right[keyName] ?? ""), "ja"),
  );
}

function getNextSortOrder(rows) {
  return rows.reduce((maximum, row) => Math.max(maximum, Number(row.sort_order ?? 0)), 0) + 10;
}

function GuideAdminActionButton({ children, disabled = false, onClick, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "border-sakura/30 bg-sakura/10 text-sakura hover:bg-sakura/15"
      : tone === "primary"
        ? "border-comet/30 bg-comet/10 text-comet hover:bg-comet/15"
        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white";

  return (
    <button
      className={`min-h-10 rounded-2xl border px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function GuideEntryEditor({
  busy,
  entry,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
  onSave,
  onToggle,
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${entry.is_visible ? "border-white/10 bg-white/[0.04]" : "border-white/5 bg-night-950/45 opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="break-all text-[10px] text-slate-500">{entry.entry_key}</code>
        <span className="text-[10px] font-bold text-slate-500">{entry.is_visible ? "表示中" : "非表示"}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="text-xs font-bold text-slate-400">
          種類
          <select
            className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-night-950 px-3 text-sm text-white"
            disabled={busy}
            onChange={(event) => onChange(entry.id, { entry_type: event.target.value })}
            value={entry.entry_type}
          >
            <option value="paragraph">段落</option>
            <option value="list_item">一覧項目</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-400">
          文言
          <textarea
            className="mt-1 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-night-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-comet/40"
            disabled={busy}
            onChange={(event) => onChange(entry.id, { body: event.target.value })}
            value={entry.body}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <GuideAdminActionButton disabled={busy || isFirst} onClick={() => onMove(entry, -1)}>
          ↑ 上へ
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy || isLast} onClick={() => onMove(entry, 1)}>
          ↓ 下へ
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onToggle(entry)}>
          {entry.is_visible ? "非表示にする" : "表示する"}
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onSave(entry)} tone="primary">
          保存
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onDelete(entry)} tone="danger">
          削除
        </GuideAdminActionButton>
      </div>
    </div>
  );
}

function GuideSectionEditor({
  busy,
  entries,
  isFirst,
  isLast,
  onAddEntry,
  onDeleteEntry,
  onDeleteSection,
  onEntryChange,
  onMoveEntry,
  onMoveSection,
  onSaveEntry,
  onSaveSection,
  onSectionChange,
  onToggleEntry,
  onToggleSection,
  section,
}) {
  const [entryBody, setEntryBody] = useState("");
  const [entryType, setEntryType] = useState("list_item");
  const sortedEntries = sortRows(entries, "entry_key");

  async function handleAddEntry() {
    const added = await onAddEntry(section, {
      body: entryBody,
      entryType,
    });

    if (added) {
      setEntryBody("");
    }
  }

  return (
    <article className={`rounded-3xl border px-3 py-4 sm:px-4 ${section.is_visible ? "border-white/10 bg-night-950/35" : "border-white/5 bg-night-950/55 opacity-75"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-aurora">
            {section.parent_id ? "子カテゴリー" : section.display_variant === "notice" ? "注意書き" : "セクション"}
          </p>
          <code className="mt-1 block break-all text-[10px] text-slate-500">{section.section_key}</code>
        </div>
        <span className="text-[10px] font-bold text-slate-500">{section.is_visible ? "表示中" : "非表示"}</span>
      </div>

      <label className="mt-3 block text-xs font-bold text-slate-400">
        セクション名
        <input
          className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-night-950 px-3 text-sm font-black text-white outline-none focus:border-comet/40"
          disabled={busy}
          onChange={(event) => onSectionChange(section.id, { title: event.target.value })}
          value={section.title}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <GuideAdminActionButton disabled={busy || isFirst} onClick={() => onMoveSection(section, -1)}>
          ↑ 上へ
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy || isLast} onClick={() => onMoveSection(section, 1)}>
          ↓ 下へ
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onToggleSection(section)}>
          {section.is_visible ? "非表示にする" : "表示する"}
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onSaveSection(section)} tone="primary">
          名前を保存
        </GuideAdminActionButton>
        <GuideAdminActionButton disabled={busy} onClick={() => onDeleteSection(section)} tone="danger">
          セクションを削除
        </GuideAdminActionButton>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-black text-comet">文章・項目</p>
        {sortedEntries.length === 0 ? <p className="text-xs text-slate-500">まだ項目がありません。</p> : null}
        {sortedEntries.map((entry, index) => (
          <GuideEntryEditor
            busy={busy}
            entry={entry}
            isFirst={index === 0}
            isLast={index === sortedEntries.length - 1}
            key={entry.id}
            onChange={onEntryChange}
            onDelete={onDeleteEntry}
            onMove={onMoveEntry}
            onSave={onSaveEntry}
            onToggle={onToggleEntry}
          />
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-comet/15 bg-comet/[0.06] px-3 py-3">
        <p className="text-xs font-black text-comet">このセクションへ追加</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <select
            className="min-h-11 rounded-xl border border-white/10 bg-night-950 px-3 text-sm text-white"
            disabled={busy}
            onChange={(event) => setEntryType(event.target.value)}
            value={entryType}
          >
            <option value="paragraph">段落</option>
            <option value="list_item">一覧項目</option>
          </select>
          <textarea
            className="min-h-20 resize-y rounded-xl border border-white/10 bg-night-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-comet/40"
            disabled={busy}
            onChange={(event) => setEntryBody(event.target.value)}
            placeholder="追加する文章"
            value={entryBody}
          />
        </div>
        <div className="mt-3">
          <GuideAdminActionButton disabled={busy} onClick={handleAddEntry} tone="primary">
            項目を追加
          </GuideAdminActionButton>
        </div>
      </div>
    </article>
  );
}

export default function VillageGuideAdminScreen({ isAdmin, onBack }) {
  const [sections, setSections] = useState([]);
  const [entries, setEntries] = useState([]);
  const [sectionDraft, setSectionDraft] = useState(emptySectionDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const guideTree = useMemo(
    () => buildVillageGuideTree(sections, entries, { includeHidden: true }),
    [entries, sections],
  );
  const rootSections = useMemo(() => sortRows(sections.filter((section) => !section.parent_id), "section_key"), [sections]);
  const controlsDisabled = busy || loading;

  async function loadGuide() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [sectionResult, entryResult] = await Promise.all([
      supabase.from("guide_sections").select(GUIDE_SECTION_SELECT_COLUMNS).order("sort_order").order("section_key"),
      supabase.from("guide_entries").select(GUIDE_ENTRY_SELECT_COLUMNS).order("sort_order").order("entry_key"),
    ]);

    setLoading(false);

    const loadError = sectionResult.error || entryResult.error;
    if (loadError) {
      logSafeError(ERROR_OPERATION.GUIDE_LOAD, loadError);
      setError(getUserFacingError(loadError, ERROR_OPERATION.GUIDE_LOAD));
      return;
    }

    setSections(sectionResult.data ?? []);
    setEntries(entryResult.data ?? []);
  }

  useEffect(() => {
    loadGuide();
  }, [isAdmin]);

  function beginOperation() {
    setBusy(true);
    setMessage("");
    setError("");
  }

  function failOperation(operationError) {
    logSafeError(ERROR_OPERATION.GUIDE_SAVE, operationError);
    setBusy(false);
    setError(getUserFacingError(operationError, ERROR_OPERATION.GUIDE_SAVE));
  }

  async function finishOperation(successMessage) {
    setMessage(successMessage);
    await loadGuide();
    setBusy(false);
  }

  async function handleAddSection() {
    const validationError = validateVillageGuideSectionInput(sectionDraft.title);
    if (validationError) {
      setError(validationError);
      return;
    }

    const siblings = sections.filter((section) => (section.parent_id ?? "") === sectionDraft.parentId);
    beginOperation();
    const { error: insertError } = await supabase.from("guide_sections").insert({
      section_key: createVillageGuideStableKey("custom_section"),
      title: sectionDraft.title.trim(),
      parent_id: sectionDraft.parentId || null,
      display_variant: sectionDraft.parentId ? "subsection" : "standard",
      sort_order: getNextSortOrder(siblings),
      is_visible: true,
    });

    if (insertError) {
      failOperation(insertError);
      return;
    }

    setSectionDraft(emptySectionDraft);
    await finishOperation(sectionDraft.parentId ? "子カテゴリーを追加しました。" : "セクションを追加しました。");
  }

  async function handleSaveSection(section) {
    const validationError = validateVillageGuideSectionInput(section.title);
    if (validationError) {
      setError(validationError);
      return;
    }

    beginOperation();
    const { data, error: updateError } = await supabase
      .from("guide_sections")
      .update({ title: section.title.trim() })
      .eq("id", section.id)
      .select("id")
      .maybeSingle();

    if (updateError || !data) {
      failOperation(updateError ?? new Error("guide section was not updated"));
      return;
    }

    await finishOperation("セクション名を保存しました。");
  }

  async function handleToggleSection(section) {
    beginOperation();
    const { data, error: updateError } = await supabase
      .from("guide_sections")
      .update({ is_visible: !section.is_visible })
      .eq("id", section.id)
      .select("id")
      .maybeSingle();

    if (updateError || !data) {
      failOperation(updateError ?? new Error("guide section visibility was not updated"));
      return;
    }

    await finishOperation(section.is_visible ? "セクションを非表示にしました。" : "セクションを表示しました。");
  }

  async function handleDeleteSection(section) {
    const warning = section.parent_id
      ? "この子カテゴリーと中の項目を削除します。元に戻せません。"
      : "このセクション、子カテゴリー、中の項目をすべて削除します。元に戻せません。";

    if (!window.confirm(warning)) {
      return;
    }

    beginOperation();
    const { data, error: deleteError } = await supabase
      .from("guide_sections")
      .delete()
      .eq("id", section.id)
      .select("id")
      .maybeSingle();

    if (deleteError || !data) {
      failOperation(deleteError ?? new Error("guide section was not deleted"));
      return;
    }

    await finishOperation("セクションを削除しました。");
  }

  async function swapSortOrder(table, current, target, successMessage) {
    beginOperation();
    const [currentResult, targetResult] = await Promise.all([
      supabase.from(table).update({ sort_order: target.sort_order }).eq("id", current.id).select("id").maybeSingle(),
      supabase.from(table).update({ sort_order: current.sort_order }).eq("id", target.id).select("id").maybeSingle(),
    ]);
    const updateError = currentResult.error || targetResult.error;

    if (updateError || !currentResult.data || !targetResult.data) {
      failOperation(updateError ?? new Error("guide order was not updated"));
      await loadGuide();
      return;
    }

    await finishOperation(successMessage);
  }

  async function handleMoveSection(section, direction) {
    const siblings = sortRows(
      sections.filter((candidate) => (candidate.parent_id ?? null) === (section.parent_id ?? null)),
      "section_key",
    );
    const currentIndex = siblings.findIndex((candidate) => candidate.id === section.id);
    const target = siblings[currentIndex + direction];

    if (target) {
      await swapSortOrder("guide_sections", section, target, "セクションの順番を変更しました。");
    }
  }

  async function handleAddEntry(section, draft) {
    const validationError = validateVillageGuideEntryInput(draft.body);
    if (validationError) {
      setError(validationError);
      return false;
    }

    const sectionEntries = entries.filter((entry) => entry.section_id === section.id);
    beginOperation();
    const { error: insertError } = await supabase.from("guide_entries").insert({
      section_id: section.id,
      entry_key: createVillageGuideStableKey("custom_entry"),
      entry_type: draft.entryType,
      body: draft.body.trim(),
      sort_order: getNextSortOrder(sectionEntries),
      is_visible: true,
    });

    if (insertError) {
      failOperation(insertError);
      return false;
    }

    await finishOperation("項目を追加しました。");
    return true;
  }

  async function handleSaveEntry(entry) {
    const validationError = validateVillageGuideEntryInput(entry.body);
    if (validationError) {
      setError(validationError);
      return;
    }

    beginOperation();
    const { data, error: updateError } = await supabase
      .from("guide_entries")
      .update({
        body: entry.body.trim(),
        entry_type: entry.entry_type,
      })
      .eq("id", entry.id)
      .select("id")
      .maybeSingle();

    if (updateError || !data) {
      failOperation(updateError ?? new Error("guide entry was not updated"));
      return;
    }

    await finishOperation("項目を保存しました。");
  }

  async function handleToggleEntry(entry) {
    beginOperation();
    const { data, error: updateError } = await supabase
      .from("guide_entries")
      .update({ is_visible: !entry.is_visible })
      .eq("id", entry.id)
      .select("id")
      .maybeSingle();

    if (updateError || !data) {
      failOperation(updateError ?? new Error("guide entry visibility was not updated"));
      return;
    }

    await finishOperation(entry.is_visible ? "項目を非表示にしました。" : "項目を表示しました。");
  }

  async function handleDeleteEntry(entry) {
    if (!window.confirm("この項目を削除します。元に戻せません。")) {
      return;
    }

    beginOperation();
    const { data, error: deleteError } = await supabase
      .from("guide_entries")
      .delete()
      .eq("id", entry.id)
      .select("id")
      .maybeSingle();

    if (deleteError || !data) {
      failOperation(deleteError ?? new Error("guide entry was not deleted"));
      return;
    }

    await finishOperation("項目を削除しました。");
  }

  async function handleMoveEntry(entry, direction) {
    const siblings = sortRows(entries.filter((candidate) => candidate.section_id === entry.section_id), "entry_key");
    const currentIndex = siblings.findIndex((candidate) => candidate.id === entry.id);
    const target = siblings[currentIndex + direction];

    if (target) {
      await swapSortOrder("guide_entries", entry, target, "項目の順番を変更しました。");
    }
  }

  if (!isAdmin) {
    return (
      <section className="glass-panel p-4">
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300"
          onClick={onBack}
          type="button"
        >
          戻る
        </button>
        <p className="mt-4 rounded-2xl border border-sakura/20 bg-sakura/10 px-4 py-3 text-sm text-sakura">
          この画面を開く権限がありません。
        </p>
      </section>
    );
  }

  return (
    <section className="glass-panel p-4">
      <p className="text-xs font-bold uppercase text-comet">GUIDE ADMIN</p>
      <h2 className="mt-1 text-lg font-black text-white">入村案内を編集</h2>
      <div className="mt-4 space-y-4">
        <button
          className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
          onClick={onBack}
          type="button"
        >
          戻る
        </button>

        <p className="text-xs leading-6 text-slate-400">
          keyは外部更新でも使う識別子のため変更できません。表示順は同じ階層内の「上へ」「下へ」で調整できます。
        </p>

        {message || error ? (
          <p className={`rounded-2xl border px-4 py-3 text-xs leading-6 ${error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"}`}>
            {error || message}
          </p>
        ) : null}

        <div className="rounded-3xl border border-aurora/20 bg-aurora/[0.08] px-4 py-4">
          <h3 className="text-sm font-black text-white">セクションを追加</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="text-xs font-bold text-slate-400">
              セクション名
              <input
                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-night-950 px-3 text-sm text-white outline-none focus:border-comet/40"
                disabled={controlsDisabled}
                onChange={(event) => setSectionDraft((current) => ({ ...current, title: event.target.value }))}
                value={sectionDraft.title}
              />
            </label>
            <label className="text-xs font-bold text-slate-400">
              追加先
              <select
                className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-night-950 px-3 text-sm text-white"
                disabled={controlsDisabled}
                onChange={(event) => setSectionDraft((current) => ({ ...current, parentId: event.target.value }))}
                value={sectionDraft.parentId}
              >
                <option value="">最上位セクション</option>
                {rootSections
                  .filter((section) => section.display_variant !== "notice")
                  .map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title} の子カテゴリー
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mt-3">
            <GuideAdminActionButton disabled={controlsDisabled} onClick={handleAddSection} tone="primary">
              追加する
            </GuideAdminActionButton>
          </div>
        </div>

        {loading ? <p className="rounded-2xl border border-comet/15 bg-comet/[0.06] px-4 py-3 text-sm text-comet">入村案内を読み込み中...</p> : null}

        {!loading && guideTree.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
            セクションがありません。上のフォームから追加してください。
          </p>
        ) : null}

        <div className="space-y-5">
          {guideTree.map((section, rootIndex) => {
            const rootEntries = entries.filter((entry) => entry.section_id === section.id);

            return (
              <div className="space-y-3" key={section.id}>
                <GuideSectionEditor
                  busy={controlsDisabled}
                  entries={rootEntries}
                  isFirst={rootIndex === 0}
                  isLast={rootIndex === guideTree.length - 1}
                  onAddEntry={handleAddEntry}
                  onDeleteEntry={handleDeleteEntry}
                  onDeleteSection={handleDeleteSection}
                  onEntryChange={(entryId, patch) =>
                    setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)))
                  }
                  onMoveEntry={handleMoveEntry}
                  onMoveSection={handleMoveSection}
                  onSaveEntry={handleSaveEntry}
                  onSaveSection={handleSaveSection}
                  onSectionChange={(sectionId, patch) =>
                    setSections((current) => current.map((row) => (row.id === sectionId ? { ...row, ...patch } : row)))
                  }
                  onToggleEntry={handleToggleEntry}
                  onToggleSection={handleToggleSection}
                  section={section}
                />
                {section.children.length > 0 ? (
                  <div className="ml-2 space-y-3 border-l border-aurora/20 pl-3 sm:ml-5 sm:pl-4">
                    {section.children.map((child, childIndex) => (
                      <GuideSectionEditor
                        busy={controlsDisabled}
                        entries={entries.filter((entry) => entry.section_id === child.id)}
                        isFirst={childIndex === 0}
                        isLast={childIndex === section.children.length - 1}
                        key={child.id}
                        onAddEntry={handleAddEntry}
                        onDeleteEntry={handleDeleteEntry}
                        onDeleteSection={handleDeleteSection}
                        onEntryChange={(entryId, patch) =>
                          setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)))
                        }
                        onMoveEntry={handleMoveEntry}
                        onMoveSection={handleMoveSection}
                        onSaveEntry={handleSaveEntry}
                        onSaveSection={handleSaveSection}
                        onSectionChange={(sectionId, patch) =>
                          setSections((current) => current.map((row) => (row.id === sectionId ? { ...row, ...patch } : row)))
                        }
                        onToggleEntry={handleToggleEntry}
                        onToggleSection={handleToggleSection}
                        section={child}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
