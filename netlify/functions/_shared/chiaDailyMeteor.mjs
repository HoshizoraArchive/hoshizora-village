const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_POST_LENGTH = 500;

const SLOT_BY_HOUR = new Map([
  [8, "morning"],
  [12, "noon"],
  [19, "evening"],
]);

const MORNING_THEMES = [
  "まだ誰にも見つかっていない小さな光",
  "急がず自分の速さで進むこと",
  "未完成のままでも外へ出してみる勇気",
  "昨日より少しだけ自分を好きになること",
  "反応がなくても作品の価値は消えないこと",
  "誰か一人へ届く言葉を大切にすること",
  "欠けている日にもちゃんと居場所があること",
];

const EVENING_THEMES = [
  "今日できた小さなことを見つける",
  "うまくいかなかった日も生きた光として残す",
  "誰かの言葉に救われた瞬間を思い出す",
  "頑張れなかった自分にもおつかれさまを言う",
  "明日へ持っていかなくていい重さを夜空へ置く",
  "今日見つけた優しさを一つだけ抱えて眠る",
  "星空Villageに帰ってきてくれたことを喜ぶ",
];

const LUNCHES = [
  ["星型オムライス", "たまごがふわふわで、真ん中に小さな星を描いたよ🍳✨"],
  ["月見うどん", "まんまるなお月さまみたいな卵を、最後まで大事に残してたよ🌕"],
  ["流星カレー", "にんじんを星の形にしたら、いつものカレーが宇宙になったよ🍛"],
  ["天の川そうめん", "きらきらの薬味をいっぱい乗せて、つるっと食べたよ🌌"],
  ["星屑たまごサンド", "ふわふわでやさしい味だったよ。午後もゆっくりいこうね🥪"],
  ["三日月クロワッサン", "外はさくさく、中はふわっとしてたよ🥐"],
  ["きらめきナポリタン", "ケチャップの赤が夕焼けみたいでかわいかったよ🍝"],
  ["お星さまハンバーグ", "小さなチーズの星を乗せたら、ちょっと特別なお昼になったよ⭐"],
  ["ミルキーウェイシチュー", "白くてあったかくて、雲の中にいるみたいだったよ🥣"],
  ["月うさぎおにぎり", "海苔で小さなお耳をつけて食べたよ🍙"],
  ["惑星ドーナツ", "どの色から食べるか、しばらく迷っちゃったよ🍩"],
  ["星空フルーツサンド", "いちごとクリームがきらきらで、断面までかわいかったよ🍓"],
  ["雲みたいなパンケーキ", "ふわふわすぎて、フォークが沈んでいったよ🥞"],
  ["銀河チャーハン", "具がいっぱいで、ひと口ごとに違う星を見つけた気分だったよ🥄"],
];

function hashText(value) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickForDate(values, localDate, salt = "") {
  return values[hashText(`${localDate}:${salt}`) % values.length];
}

function toJstParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function formatLocalDate({ year, month, day }) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function resolveChiaDailyMeteorSlot(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = toJstParts(date);
  const slot = SLOT_BY_HOUR.get(parts.hour);

  if (!slot) {
    return null;
  }

  const localDate = formatLocalDate(parts);
  const scheduledFor = new Date(
    Date.UTC(parts.year, parts.month, parts.day, parts.hour - 9, 0, 0, 0),
  ).toISOString();

  return {
    slot,
    localDate,
    localHour: parts.hour,
    localMinute: parts.minute,
    weekday: parts.weekday,
    scheduledFor,
  };
}

export function buildCuratedLunchBody(localDate) {
  const [meal, note] = pickForDate(LUNCHES, localDate, "lunch");
  return `おひるちあ！\n今日は${meal}を食べたよ！${note}\nみんなは何食べた？`;
}

export function buildFallbackBody(slotInfo) {
  if (slotInfo.slot === "morning") {
    const theme = pickForDate(MORNING_THEMES, slotInfo.localDate, "morning-fallback");
    return `おはちあ！☀️\n今朝は「${theme}」を大切にしたいなって思ったよ。\n今日も、ちあたちの速さでゆっくりいこうね✨`;
  }

  if (slotInfo.slot === "evening") {
    const theme = pickForDate(EVENING_THEMES, slotInfo.localDate, "evening-fallback");
    return `こんばんちあ🌙\n今夜は「${theme}」を心に置いてるよ。\n今日ここまで来たみんなへ、おつちあ。ゆっくり休もうね✨`;
  }

  return buildCuratedLunchBody(slotInfo.localDate);
}

export function buildChiaAiPrompt(slotInfo) {
  const isMorning = slotInfo.slot === "morning";
  const theme = pickForDate(
    isMorning ? MORNING_THEMES : EVENING_THEMES,
    slotInfo.localDate,
    isMorning ? "morning-ai" : "evening-ai",
  );
  const greeting = isMorning ? "おはちあ！" : "こんばんちあ";
  const timing = isMorning ? "朝8時" : "夜19時";

  return [
    `日本時間${slotInfo.localDate}の${timing}に、星空ちあが流星便へ放流する短い文章を書いてください。`,
    `必ず「${greeting}」から始めてください。`,
    `今日の核になるテーマは「${theme}」です。`,
    "70〜180文字程度、2〜4文。やさしく親しみがあり、少し幻想的だけれど日常の言葉で書いてください。",
    "星空ちあは星空Villageの案内人で、誰にも見つからない想いや作品を観測し、ひとりの心へ光を届けたい存在です。",
    "説教、宣伝、ハッシュタグ、URL、ニュース・天気など確認できない事実、AIであることへの言及は入れないでください。",
    "大げさな名言ではなく、今日ふと思ったことを村人へ話すようにしてください。",
    "JSONのbodyだけを返してください。",
  ].join("\n");
}

export const CHIA_DAILY_METEOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    body: {
      type: "string",
      minLength: 1,
      maxLength: 500,
    },
  },
  required: ["body"],
};

function stripWrapping(value) {
  return value
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^[「『\"']+/, "")
    .replace(/[」』\"']+$/, "")
    .trim();
}

export function normalizeGeneratedChiaBody(value, slot) {
  if (typeof value !== "string") {
    return null;
  }

  let body = stripWrapping(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!body || body.length > MAX_POST_LENGTH || /https?:\/\//i.test(body) || /(^|\s)#[^\s]+/.test(body)) {
    return null;
  }

  if (/\bAI\b|人工知能|生成しました|プロンプト/i.test(body)) {
    return null;
  }

  if (slot === "morning" && !body.startsWith("おはちあ")) {
    body = `おはちあ！\n${body}`;
  }

  if (slot === "evening" && !body.startsWith("こんばんちあ")) {
    body = `こんばんちあ🌙\n${body}`;
  }

  return body.length <= MAX_POST_LENGTH ? body : null;
}

export function parseChiaAiOutput(rawOutput, slot) {
  if (typeof rawOutput !== "string" || !rawOutput.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(stripWrapping(rawOutput));
    return normalizeGeneratedChiaBody(parsed?.body, slot);
  } catch {
    return normalizeGeneratedChiaBody(rawOutput, slot);
  }
}

export const CHIA_DAILY_METEOR_SCHEDULE = "0,10,20,30,40,50 3,10,23 * * *";
