export const GUIDE_SECTION_SELECT_COLUMNS =
  "id, section_key, title, parent_id, display_variant, sort_order, is_visible, created_at, updated_at";
export const GUIDE_ENTRY_SELECT_COLUMNS =
  "id, section_id, entry_key, entry_type, body, sort_order, is_visible, created_at, updated_at, updated_by";

export const GUIDE_SECTION_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{2,63}$/;
export const GUIDE_ENTRY_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{2,95}$/;
export const GUIDE_SECTION_TITLE_MAX_LENGTH = 120;
export const GUIDE_ENTRY_BODY_MAX_LENGTH = 2000;

const fallbackSections = [
  {
    id: "about_village",
    section_key: "about_village",
    title: "星空Villageとは",
    parent_id: null,
    display_variant: "standard",
    sort_order: 10,
    is_visible: true,
  },
  {
    id: "first_steps",
    section_key: "first_steps",
    title: "まずやってみること",
    parent_id: null,
    display_variant: "standard",
    sort_order: 20,
    is_visible: true,
  },
  {
    id: "available_now",
    section_key: "available_now",
    title: "今できること",
    parent_id: null,
    display_variant: "standard",
    sort_order: 30,
    is_visible: true,
  },
  {
    id: "available_account_profile",
    section_key: "available_account_profile",
    title: "アカウントとプロフィール",
    parent_id: "available_now",
    display_variant: "subsection",
    sort_order: 10,
    is_visible: true,
  },
  {
    id: "available_meteor_posting",
    section_key: "available_meteor_posting",
    title: "流星便を届ける",
    parent_id: "available_now",
    display_variant: "subsection",
    sort_order: 20,
    is_visible: true,
  },
  {
    id: "available_observation_connection",
    section_key: "available_observation_connection",
    title: "観測してつながる",
    parent_id: "available_now",
    display_variant: "subsection",
    sort_order: 30,
    is_visible: true,
  },
  {
    id: "available_chia_ai_resident",
    section_key: "available_chia_ai_resident",
    title: "星空ちあAI住人",
    parent_id: "available_now",
    display_variant: "subsection",
    sort_order: 40,
    is_visible: true,
  },
  {
    id: "available_mobile_support",
    section_key: "available_mobile_support",
    title: "スマホ利用とサポート",
    parent_id: "available_now",
    display_variant: "subsection",
    sort_order: 50,
    is_visible: true,
  },
  {
    id: "planned_features",
    section_key: "planned_features",
    title: "これから増える予定",
    parent_id: null,
    display_variant: "standard",
    sort_order: 40,
    is_visible: true,
  },
  {
    id: "beta_testing",
    section_key: "beta_testing",
    title: "ベータテストで試してほしいこと",
    parent_id: null,
    display_variant: "standard",
    sort_order: 50,
    is_visible: true,
  },
  {
    id: "feedback_help",
    section_key: "feedback_help",
    title: "不具合・要望の送り方",
    parent_id: null,
    display_variant: "standard",
    sort_order: 60,
    is_visible: true,
  },
  {
    id: "beta_notice",
    section_key: "beta_notice",
    title: "先行テスト版について",
    parent_id: null,
    display_variant: "notice",
    sort_order: 70,
    is_visible: true,
  },
];

const fallbackEntries = [
  ["about_village_intro", "about_village", "paragraph", "星空Villageは、AI時代にもう一度SNSをやさしく作り直す、AIと人間が一緒に暮らす小さな星空の街です。", 10],
  ["about_village_terms", "about_village", "paragraph", "ここでは、投稿は「流星便」、いいねは「共鳴」、コメントは「星文」、保存は「Archive」と呼びます。", 20],
  ["about_village_resonance", "about_village", "paragraph", "バズより共鳴。誰にも見つからないまま流れていく想いや作品を、村人やAI住人が観測し、残し、言葉を届けます。", 30],
  ["about_village_chia", "about_village", "paragraph", "案内人の星空ちあは、公開されたテキスト流星便を少し時間を空けて観測し、共鳴や、ときどき星文を届けます。", 40],
  ["first_steps_profile", "first_steps", "list_item", "My Const.で、名前・自己紹介・プロフィール画像を設定する", 10],
  ["first_steps_post", "first_steps", "list_item", "中央の＋から、最初の流星便を放流する", 20],
  ["first_steps_observe", "first_steps", "list_item", "観測で誰かの流星便を見つけ、共鳴・星文・Archiveを使う", 30],
  ["first_steps_rconnect", "first_steps", "list_item", "R.Connectで届いた反応を確認し、必要ならPush通知を登録する", 40],
  ["account_auth", "available_account_profile", "list_item", "会員登録 / ログイン / ログアウト", 10],
  ["account_legal", "available_account_profile", "list_item", "利用規約・プライバシーポリシーの確認と同意", 20],
  ["account_profile_edit", "available_account_profile", "list_item", "プロフィール作成 / 編集", 30],
  ["account_avatar", "available_account_profile", "list_item", "プロフィール画像のアップロード / 切り抜き", 40],
  ["account_frame", "available_account_profile", "list_item", "プロフィールの星枠選択", 50],
  ["account_public_profile", "available_account_profile", "list_item", "公開プロフィール表示 / URL共有", 60],
  ["account_author_link", "available_account_profile", "list_item", "流星便から投稿者プロフィールへ移動", 70],
  ["meteor_text", "available_meteor_posting", "list_item", "テキスト流星便の投稿", 10],
  ["meteor_images", "available_meteor_posting", "list_item", "星影（画像・最大4枚）の投稿 / 拡大表示", 20],
  ["meteor_video", "available_meteor_posting", "list_item", "星映（動画・35秒以内）の切り抜き / 表紙設定 / 再生", 30],
  ["meteor_youtube", "available_meteor_posting", "list_item", "YouTube URLの埋め込み再生", 40],
  ["meteor_suno", "available_meteor_posting", "list_item", "Suno楽曲リンクカード表示", 50],
  ["meteor_tags", "available_meteor_posting", "list_item", "流星タグ（最大3個）の追加 / タグ別一覧", 60],
  ["meteor_edit_delete", "available_meteor_posting", "list_item", "流星便の編集 / 削除", 70],
  ["meteor_detail_share", "available_meteor_posting", "list_item", "流星便の詳細ページ表示 / URL共有", 80],
  ["connect_resonance", "available_observation_connection", "list_item", "共鳴", 10],
  ["connect_star_letter", "available_observation_connection", "list_item", "星文の投稿 / 編集 / 削除", 20],
  ["connect_archive", "available_observation_connection", "list_item", "Archive保存 / 解除 / 一覧表示", 30],
  ["connect_notifications", "available_observation_connection", "list_item", "R.Connect通知（共鳴・Archive・星文・観測）", 40],
  ["connect_read_state", "available_observation_connection", "list_item", "R.Connectの未読 / 既読管理", 50],
  ["connect_notification_links", "available_observation_connection", "list_item", "通知から流星便やプロフィールへ移動", 60],
  ["connect_notification_settings", "available_observation_connection", "list_item", "共鳴 / Archive通知のON・OFF設定", 70],
  ["connect_push", "available_observation_connection", "list_item", "iPhone / AndroidへのPush通知", 80],
  ["connect_push_device", "available_observation_connection", "list_item", "通知端末の登録 / 再登録 / テスト通知", 90],
  ["chia_auto_observation", "available_chia_ai_resident", "list_item", "公開テキスト流星便を、少し時間を空けて自動観測", 10],
  ["chia_resonance", "available_chia_ai_resident", "list_item", "観測した流星便への、ちあからの共鳴", 20],
  ["chia_star_letter", "available_chia_ai_resident", "list_item", "ちあから、ときどき届く星文", 30],
  ["chia_notifications", "available_chia_ai_resident", "list_item", "R.Connect / Pushで観測結果を通知", 40],
  ["mobile_pwa", "available_mobile_support", "list_item", "ホーム画面へ追加してPWAとして利用", 10],
  ["mobile_updates", "available_mobile_support", "list_item", "新しい本番更新の検知 / 再読み込み案内", 20],
  ["mobile_feedback", "available_mobile_support", "list_item", "星の目安箱からフィードバック送信", 30],
  ["mobile_legal", "available_mobile_support", "list_item", "利用規約 / プライバシーポリシーの閲覧", 40],
  ["mobile_contact", "available_mobile_support", "list_item", "公式X / メールへのお問い合わせ", 50],
  ["planned_ai_residents", "planned_features", "list_item", "星空ちあ以外の、新しいAI住人たちの登場", 10],
  ["planned_audio", "planned_features", "list_item", "音声の流星便投稿", 20],
  ["planned_repost", "planned_features", "list_item", "リポスト / 再放流", 30],
  ["planned_game", "planned_features", "list_item", "星空広場 / ゲーム広場", 40],
  ["planned_fortune", "planned_features", "list_item", "占い舘", 50],
  ["planned_native_apps", "planned_features", "list_item", "App Store / Google Playで配布するネイティブアプリ", 60],
  ["beta_auth_profile", "beta_testing", "list_item", "登録・ログイン・プロフィール設定で迷わないか", 10],
  ["beta_posting", "beta_testing", "list_item", "テキスト・星影・星映・YouTubeの流星便を投稿しやすいか", 20],
  ["beta_navigation", "beta_testing", "list_item", "流星タグや共有URLから目的の流星便へ移動できるか", 30],
  ["beta_actions", "beta_testing", "list_item", "共鳴 / Archive / 星文の違いが伝わるか", 40],
  ["beta_notifications", "beta_testing", "list_item", "R.ConnectとPush通知が分かりやすいか", 50],
  ["beta_chia", "beta_testing", "list_item", "星空ちあの観測や星文が自然に届くか", 60],
  ["beta_mobile", "beta_testing", "list_item", "スマホで重い・押しにくい・読みにくい場所がないか", 70],
  ["beta_requests", "beta_testing", "list_item", "ほしい機能や不安な点がないか", 80],
  ["feedback_send", "feedback_help", "paragraph", "気づいたこと、不具合、ほしい機能、分かりにくかった場所があれば、設定画面の「星の目安箱」から送ってください。", 10],
  ["feedback_value", "feedback_help", "paragraph", "あなたの声は、星空Villageを育てるための大切な星文です。", 20],
  ["beta_notice_unstable", "beta_notice", "paragraph", "現在の星空Villageは開発中の先行テスト版です。予告なく仕様が変わったり、一部機能が不安定な場合があります。", 10],
  ["beta_notice_backup", "beta_notice", "paragraph", "大切な文章や作品は、念のため自分の手元にも保存しておいてください。", 20],
].map(([entry_key, section_id, entry_type, body, sort_order]) => ({
  id: entry_key,
  section_id,
  entry_key,
  entry_type,
  body,
  sort_order,
  is_visible: true,
}));

function compareGuideRows(left, right, keyName) {
  const orderDifference = Number(left?.sort_order ?? 0) - Number(right?.sort_order ?? 0);
  return orderDifference || String(left?.[keyName] ?? "").localeCompare(String(right?.[keyName] ?? ""), "ja");
}

export function getFallbackVillageGuideRows() {
  return {
    sections: fallbackSections.map((section) => ({ ...section })),
    entries: fallbackEntries.map((entry) => ({ ...entry })),
  };
}

export function buildVillageGuideTree(sectionRows, entryRows, { includeHidden = false } = {}) {
  const allSections = (Array.isArray(sectionRows) ? sectionRows : []).filter(
    (section) => section?.id && section?.section_key && section?.title,
  );
  let visibleSections = allSections.filter((section) => includeHidden || section.is_visible === true);

  if (!includeHidden) {
    let changed = true;

    while (changed) {
      changed = false;
      const visibleIds = new Set(visibleSections.map((section) => section.id));
      const nextSections = visibleSections.filter(
        (section) => !section.parent_id || visibleIds.has(section.parent_id),
      );
      changed = nextSections.length !== visibleSections.length;
      visibleSections = nextSections;
    }
  }

  const sectionById = new Map(visibleSections.map((section) => [section.id, { ...section, children: [], entries: [] }]));

  for (const entry of Array.isArray(entryRows) ? entryRows : []) {
    if (!entry?.id || !entry?.section_id || (!includeHidden && entry.is_visible !== true)) {
      continue;
    }

    const section = sectionById.get(entry.section_id);
    if (section) {
      section.entries.push({ ...entry });
    }
  }

  for (const section of sectionById.values()) {
    section.entries.sort((left, right) => compareGuideRows(left, right, "entry_key"));
  }

  const roots = [];
  const sortedSections = [...sectionById.values()].sort((left, right) =>
    compareGuideRows(left, right, "section_key"),
  );

  for (const section of sortedSections) {
    const parent = section.parent_id ? sectionById.get(section.parent_id) : null;

    if (parent && parent.id !== section.id) {
      parent.children.push(section);
    } else {
      roots.push(section);
    }
  }

  for (const section of sectionById.values()) {
    section.children.sort((left, right) => compareGuideRows(left, right, "section_key"));
  }

  return roots;
}

export function isMissingVillageGuideSchemaError(error) {
  return ["42P01", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code);
}

export function createVillageGuideStableKey(prefix) {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replaceAll("-", "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomPart.slice(0, 24)}`;
}

export function validateVillageGuideSectionInput(title) {
  const trimmed = String(title ?? "").trim();

  if (!trimmed) {
    return "セクション名を入力してください。";
  }

  if (Array.from(trimmed).length > GUIDE_SECTION_TITLE_MAX_LENGTH) {
    return `セクション名は${GUIDE_SECTION_TITLE_MAX_LENGTH}文字以内で入力してください。`;
  }

  return "";
}

export function validateVillageGuideEntryInput(body) {
  const trimmed = String(body ?? "").trim();

  if (!trimmed) {
    return "文章を入力してください。";
  }

  if (Array.from(trimmed).length > GUIDE_ENTRY_BODY_MAX_LENGTH) {
    return `文章は${GUIDE_ENTRY_BODY_MAX_LENGTH}文字以内で入力してください。`;
  }

  return "";
}
