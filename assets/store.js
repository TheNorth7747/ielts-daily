/* =========================================================
   store.js · 进度存储与记忆调度
   - localStorage 单键存储，带 schema 版本号
   - 词汇间隔重复（1 / 3 / 7 / 15 / 30 天）
   - 连续打卡、经验值、徽章
   ========================================================= */

const KEY = 'ielts-daily:v1';
const SCHEMA = 2;

/** 每天最多安排多少个到期的词。超出的进「欠账」，次日优先，避免 30 分钟被撑爆 */
export const REVIEW_CAP = 12;

export const XP = {
  newWord: 8,
  reviewWord: 4,
  correct: 6,
  dayDone: 40,
};

export const BADGES = [
  { id: 'first-day', name: '第一天', icon: '🌱', desc: '完成第一次 30 分钟', test: (s) => s.stats.days >= 1 },
  { id: 'streak-3', name: '三连', icon: '🌿', desc: '连续学习 3 天', test: (s) => s.streak >= 3 },
  { id: 'streak-7', name: '一周成林', icon: '🌳', desc: '连续学习 7 天', test: (s) => s.streak >= 7 },
  { id: 'words-30', name: '三十词', icon: '🍃', desc: '学会 30 个词', test: (s) => s.stats.learned >= 30 },
  { id: 'words-80', name: '八十词', icon: '🍀', desc: '学会 80 个词', test: (s) => s.stats.learned >= 80 },
  { id: 'master-20', name: '记得牢', icon: '💎', desc: '20 个词达到「牢记」', test: (s) => s.stats.mastered >= 20 },
  { id: 'week-1', name: '第一章', icon: '📗', desc: '完成第 1 周 7 天', test: (s) => s.stats.days >= 7 },
  { id: 'half', name: '走了一半', icon: '🧭', desc: '完成 14 天', test: (s) => s.stats.days >= 14 },
  { id: 'done-28', name: '种成一棵树', icon: '🏆', desc: '完成 28 天全部课程', test: (s) => s.stats.days >= 28 },
  { id: 'accuracy-80', name: '稳准狠', icon: '🎯', desc: '答题正确率 ≥ 80%', test: (s) => s.stats.answers >= 20 && s.stats.correct / s.stats.answers >= 0.8 },
];

/* ---------------- 日期工具 ---------------- */

export function ymd(d) {
  const t = d || new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function dateFromYmd(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function addDays(s, n) {
  const d = dateFromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function daysBetween(a, b) {
  const A = dateFromYmd(a).getTime();
  const B = dateFromYmd(b).getTime();
  return Math.round((B - A) / 86400000);
}

/* ---------------- 默认状态 ---------------- */

function emptyState() {
  return {
    schema: SCHEMA,
    profile: { startDate: ymd(), targetBand: 6.0, examType: 'academic' },
    xp: 0,
    words: {},          // id -> { seen, good, bad, stage, due, first, last }
    skills: { listening: 0, reading: 0, writing: 0, speaking: 0, vocab: 0 },
    selfEval: { writing: { good: 0, mid: 0, bad: 0 }, speaking: { good: 0, mid: 0, bad: 0 } },
    days: {},           // 'YYYY-MM-DD' -> { minutes, xp, words, correct, answers, done }
    progress: { lastDayDone: 0, completed: {} }, // completed: 'd1' -> { at, minutes, xp }
    badges: [],         // 已解锁的徽章 id
    stats: { days: 0, minutes: 0, learned: 0, mastered: 0, answers: 0, correct: 0 },
    review: { streak: 0, lastStudy: null },
    exams: [],
    createdAt: new Date().toISOString(),
  };
}

/* ---------------- 读写 ---------------- */

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return migrate(data);
  } catch (e) {
    console.warn('读取进度失败，使用新存档', e);
    return emptyState();
  }
}

function migrate(data) {
  const base = emptyState();
  const from = Number(data && data.schema) || 1;
  const s = Object.assign(base, data);
  s.schema = SCHEMA;
  s.profile = Object.assign(base.profile, data.profile || {});
  s.skills = Object.assign(base.skills, data.skills || {});
  s.stats = Object.assign(base.stats, data.stats || {});
  s.review = Object.assign(base.review, data.review || {});
  s.progress = Object.assign(base.progress, data.progress || {});
  s.progress.completed = s.progress.completed || {};
  s.words = s.words || {};
  s.days = s.days || {};
  s.badges = Array.isArray(s.badges) ? s.badges : [];
  s.exams = Array.isArray(s.exams) ? s.exams : [];

  // v1 → v2：写作/口语改为自评驱动，新增自评计数
  const se = data.selfEval || {};
  s.selfEval = {
    writing: Object.assign({ good: 0, mid: 0, bad: 0 }, se.writing || {}),
    speaking: Object.assign({ good: 0, mid: 0, bad: 0 }, se.speaking || {}),
  };
  if (from < 2) {
    // 老存档里写作/口语的分数是「点击即正确」刷出来的，清零重算，不继承脏数据
    s.skills.writing = 0;
    s.skills.speaking = 0;
  }
  return s;
}

let saveTimer = null;
const BAK_PREFIX = KEY + ':bak:';
let backedUpDay = null;

/** 只保留最近 7 份每日快照，防止把 localStorage 撑满 */
function trimBackups() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(BAK_PREFIX) === 0) keys.push(k);
    }
  } catch (e) { return; }
  keys.sort();
  while (keys.length > 7) {
    try { localStorage.removeItem(keys.shift()); } catch (e) { /* ignore */ }
  }
}

/** 每天第一次落盘时留一份快照，用来救「清缓存 / 换浏览器」 */
function writeBackup(s) {
  const d = ymd();
  if (backedUpDay === d) return;
  try {
    localStorage.setItem(BAK_PREFIX + d, JSON.stringify(s));
    backedUpDay = d;
    trimBackups();
  } catch (e) { /* 空间不够就放弃备份，不干扰主存 */ }
}

export function save(s) {
  // 轻微防抖：连续答题时不必每次写盘
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('保存失败（可能存储已满）', e);
    }
  }, 120);
}

export function saveNow(s) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn(e); }
  writeBackup(s);
}

/** 可用的每日快照（从新到旧） */
export function listBackups() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(BAK_PREFIX) === 0) out.push(k.slice(BAK_PREFIX.length));
    }
  } catch (e) { /* ignore */ }
  return out.sort().reverse();
}

export function loadBackup(day) {
  try {
    const raw = localStorage.getItem(BAK_PREFIX + day);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/* ---------------- 记忆调度 ---------------- */

const INTERVALS = [0, 1, 3, 7, 15, 30];

export function wordState(s, id) {
  if (!s.words[id]) {
    s.words[id] = { seen: 0, good: 0, bad: 0, stage: 0, due: ymd(), first: null, last: null };
  }
  return s.words[id];
}

export function rateWord(s, id, rating) {
  const w = wordState(s, id);
  const today = ymd();
  w.seen += 1;
  w.last = today;
  if (!w.first) w.first = today;

  if (rating === 'good') {
    w.good += 1;
    w.bad = 0;
    w.stage = Math.min(w.stage + 1, INTERVALS.length - 1);
  } else if (rating === 'mid') {
    w.stage = Math.max(0, w.stage - 1);
  } else {
    w.bad += 1;
    w.stage = 0;
  }
  w.due = addDays(today, INTERVALS[w.stage]);
  return w;
}

/** 掌握程度 0–3：受 stage 与 good 次数影响 */
export function masteryOf(w) {
  if (!w || !w.seen) return 0;
  if (w.stage >= 4 && w.good >= 3) return 3;
  if (w.stage >= 2) return 2;
  return 1;
}

/** 已进入长期记忆（30 天档），不再每天催 */
export function isLongTerm(w) {
  return !!(w && w.seen && w.stage >= 5);
}

export function dueWords(s, limit) {
  const today = ymd();
  const out = [];
  const ids = Object.keys(s.words);
  for (let i = 0; i < ids.length; i++) {
    const w = s.words[ids[i]];
    if (w && w.seen > 0 && !isLongTerm(w) && w.due <= today) out.push(ids[i]);
  }
  out.sort(function (a, b) { return String(s.words[a].due).localeCompare(String(s.words[b].due)); });
  return limit ? out.slice(0, limit) : out;
}

/* ---------------- 经验 / 徽章 / 统计 ---------------- */

export function addXp(s, n) {
  s.xp = Math.max(0, (s.xp || 0) + n);
  return s.xp;
}

export function levelOf(xp) {
  return Math.floor(Math.sqrt(xp / 120)) + 1;
}

export function refreshStats(s) {
  const ids = Object.keys(s.words);
  let learned = 0;
  let mastered = 0;
  for (let i = 0; i < ids.length; i++) {
    const w = s.words[ids[i]];
    if (w && w.seen > 0) learned += 1;
    if (w && w.stage >= 4 && w.good >= 3) mastered += 1;
  }
  let days = 0;
  let minutes = 0;
  let answers = 0;
  let correct = 0;
  const dates = Object.keys(s.days);
  for (let i = 0; i < dates.length; i++) {
    const d = s.days[dates[i]];
    if (d && d.done) days += 1;
    minutes += (d && d.minutes) || 0;
    answers += (d && d.answers) || 0;
    correct += (d && d.correct) || 0;
  }
  s.stats = { days: days, minutes: minutes, learned: learned, mastered: mastered, answers: answers, correct: correct };
  return s.stats;
}

/** 连续打卡：今天或昨天有学习记录才算连着 */
export function streakOf(s) {
  const dates = Object.keys(s.days).filter(function (k) { return s.days[k] && s.days[k].done; }).sort();
  if (!dates.length) return 0;
  const last = dates[dates.length - 1];
  const today = ymd();
  const gap = daysBetween(last, today);
  if (gap > 1) return 0;
  let n = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    if (daysBetween(dates[i - 1], dates[i]) === 1) n += 1;
    else break;
  }
  return n;
}

export function checkBadges(s) {
  const earned = [];
  const streak = streakOf(s);
  const ctx = { stats: s.stats, streak: streak };
  for (let i = 0; i < BADGES.length; i++) {
    const b = BADGES[i];
    if (s.badges.indexOf(b.id) === -1 && b.test(ctx)) {
      s.badges.push(b.id);
      earned.push(b);
    }
  }
  return earned;
}

/** 今日记录（不存在则创建） */
export function today(s) {
  const t = ymd();
  if (!s.days[t]) s.days[t] = { minutes: 0, xp: 0, words: 0, correct: 0, answers: 0, done: false };
  return s.days[t];
}

export function recordAnswer(s, ok, skill) {
  const d = today(s);
  d.answers += 1;
  if (ok) {
    d.correct += 1;
    addXp(s, XP.correct);
  }
  if (skill && s.skills[skill] !== undefined) {
    // 技能分：以正确率为主要依据，第一次作答给一个基线，之后平滑到 0–100
    const prev = s.skills[skill];
    const target = ok ? 100 : 0;
    const base = prev === 0 ? (ok ? 55 : 25) : prev;
    s.skills[skill] = Math.round(base * 0.75 + target * 0.25);
  }
  save(s);
  return s;
}

/** 写作 / 口语的自评档位：不再「点一下就算对」 */
export const SELF_RATINGS = [
  { k: 'bad', label: '没写出来 / 跑题', desc: '这次不算对，明天重来', score: 0.0 },
  { k: 'mid', label: '勉强写完', desc: '意思到了，句子不准', score: 0.55 },
  { k: 'good', label: '到位', desc: '结构、用词都站得住', score: 1.0 },
];

/**
 * 自评驱动的记分：写作 / 口语专用。
 * 没有评分器时，唯一可信的信号是「你自己判断这次到不到位」，
 * 所以这里只按自评给分，不再无条件记正确。
 */
export function recordSelf(s, skill, rating) {
  const row = SELF_RATINGS.find(function (r) { return r.k === rating; }) || SELF_RATINGS[0];
  if (!s.selfEval) s.selfEval = {};
  if (!s.selfEval[skill]) s.selfEval[skill] = { good: 0, mid: 0, bad: 0 };
  s.selfEval[skill][row.k] = (s.selfEval[skill][row.k] || 0) + 1;

  const d = today(s);
  d.answers += 1;
  const passed = row.score >= 0.5;
  if (passed) d.correct += 1;

  const prev = s.skills[skill] || 0;
  const base = prev === 0 ? (passed ? 45 : 20) : prev;
  s.skills[skill] = Math.max(0, Math.min(100, Math.round(base * 0.75 + row.score * 100 * 0.25)));

  if (row.k === 'good') addXp(s, XP.correct);
  else if (row.k === 'mid') addXp(s, Math.round(XP.correct / 2));

  save(s);
  return s;
}

/**
 * 今天的复习计划：到期全部算「欠账」，但每天只安排 REVIEW_CAP 个。
 * 欠账不会消失，只是往后排，保证 30 分钟封顶。
 */
export function reviewPlan(s) {
  const all = dueWords(s);
  const take = all.slice(0, REVIEW_CAP);
  return { due: all.length, take: take, backlog: Math.max(0, all.length - REVIEW_CAP) };
}

/** 完成一天：写入记录、累计时间、刷新统计与徽章 */
export function completeDay(s, dayId, minutes, xpGained) {
  const d = today(s);
  d.done = true;
  d.minutes = Math.max(d.minutes || 0, minutes || 0);
  d.xp = (d.xp || 0) + xpGained;
  s.progress.completed[dayId] = { at: new Date().toISOString(), minutes: minutes, xp: xpGained };
  s.progress.lastDayDone = Math.max(s.progress.lastDayDone || 0, Number(String(dayId).replace(/\D/g, '')) || 0);
  s.review.lastStudy = ymd();
  s.review.streak = streakOf(s);
  refreshStats(s);
  const earned = checkBadges(s);
  saveNow(s);
  return earned;
}

/** 当天是否已完成 */
export function isDone(s, dayId) {
  return !!(s.progress.completed && s.progress.completed[dayId]);
}

/** 下一次复习安排摘要 */
export function reviewSummary(s) {
  const today = ymd();
  const buckets = { overdue: 0, today: 0, soon: 0, later: 0 };
  const ids = Object.keys(s.words);
  for (let i = 0; i < ids.length; i++) {
    const w = s.words[ids[i]];
    if (!w || !w.seen) continue;
    const gap = daysBetween(today, w.due);
    if (gap < 0) buckets.overdue += 1;
    else if (gap === 0) buckets.today += 1;
    else if (gap <= 3) buckets.soon += 1;
    else buckets.later += 1;
  }
  return buckets;
}

export function exportJson(s) {
  const payload = {
    app: 'ielts-daily',
    exportedAt: new Date().toISOString(),
    data: s,
  };
  return JSON.stringify(payload, null, 2);
}

export function importJson(text) {
  let payload;
  try { payload = JSON.parse(text); } catch (e) { throw new Error('不是合法的 JSON 文件'); }
  const data = payload && payload.data ? payload.data : payload;
  if (!data || typeof data !== 'object' || !data.profile) throw new Error('文件里没有可识别的学习进度');
  if (!data.days && !data.words) throw new Error('文件里没有可识别的学习进度');
  const s = migrate(data);
  refreshStats(s);
  saveNow(s);
  return s;
}
