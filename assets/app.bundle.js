/* 自动生成，请勿直接编辑。源码在 assets/*.js，改完执行：node build.mjs */
(function () {
"use strict";
var __M = {};

__M["assets/store.js"] = (function () {
/* =========================================================
   store.js · 进度存储与记忆调度
   - localStorage 单键存储，带 schema 版本号
   - 词汇间隔重复（1 / 3 / 7 / 15 / 30 天）
   - 连续打卡、经验值、徽章
   ========================================================= */

const KEY = 'ielts-daily:v1';
const SCHEMA = 2;

/** 每天最多安排多少个到期的词。超出的进「欠账」，次日优先，避免 30 分钟被撑爆 */
const REVIEW_CAP = 12;

const XP = {
  newWord: 8,
  reviewWord: 4,
  correct: 6,
  dayDone: 40,
};

const BADGES = [
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

function ymd(d) {
  const t = d || new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function dateFromYmd(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function addDays(s, n) {
  const d = dateFromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function daysBetween(a, b) {
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

function load() {
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

function save(s) {
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

function saveNow(s) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn(e); }
  writeBackup(s);
}

/** 可用的每日快照（从新到旧） */
function listBackups() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(BAK_PREFIX) === 0) out.push(k.slice(BAK_PREFIX.length));
    }
  } catch (e) { /* ignore */ }
  return out.sort().reverse();
}

function loadBackup(day) {
  try {
    const raw = localStorage.getItem(BAK_PREFIX + day);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}

function reset() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/* ---------------- 记忆调度 ---------------- */

const INTERVALS = [0, 1, 3, 7, 15, 30];

function wordState(s, id) {
  if (!s.words[id]) {
    s.words[id] = { seen: 0, good: 0, bad: 0, stage: 0, due: ymd(), first: null, last: null };
  }
  return s.words[id];
}

function rateWord(s, id, rating) {
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
function masteryOf(w) {
  if (!w || !w.seen) return 0;
  if (w.stage >= 4 && w.good >= 3) return 3;
  if (w.stage >= 2) return 2;
  return 1;
}

/** 已进入长期记忆（30 天档），不再每天催 */
function isLongTerm(w) {
  return !!(w && w.seen && w.stage >= 5);
}

function dueWords(s, limit) {
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

function addXp(s, n) {
  s.xp = Math.max(0, (s.xp || 0) + n);
  return s.xp;
}

function levelOf(xp) {
  return Math.floor(Math.sqrt(xp / 120)) + 1;
}

function refreshStats(s) {
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
function streakOf(s) {
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

function checkBadges(s) {
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
function today(s) {
  const t = ymd();
  if (!s.days[t]) s.days[t] = { minutes: 0, xp: 0, words: 0, correct: 0, answers: 0, done: false };
  return s.days[t];
}

function recordAnswer(s, ok, skill) {
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
const SELF_RATINGS = [
  { k: 'bad', label: '没写出来 / 跑题', desc: '这次不算对，明天重来', score: 0.0 },
  { k: 'mid', label: '勉强写完', desc: '意思到了，句子不准', score: 0.55 },
  { k: 'good', label: '到位', desc: '结构、用词都站得住', score: 1.0 },
];

/**
 * 自评驱动的记分：写作 / 口语专用。
 * 没有评分器时，唯一可信的信号是「你自己判断这次到不到位」，
 * 所以这里只按自评给分，不再无条件记正确。
 */
function recordSelf(s, skill, rating) {
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
function reviewPlan(s) {
  const all = dueWords(s);
  const take = all.slice(0, REVIEW_CAP);
  return { due: all.length, take: take, backlog: Math.max(0, all.length - REVIEW_CAP) };
}

/** 完成一天：写入记录、累计时间、刷新统计与徽章 */
function completeDay(s, dayId, minutes, xpGained) {
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
function isDone(s, dayId) {
  return !!(s.progress.completed && s.progress.completed[dayId]);
}

/** 下一次复习安排摘要 */
function reviewSummary(s) {
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

function exportJson(s) {
  const payload = {
    app: 'ielts-daily',
    exportedAt: new Date().toISOString(),
    data: s,
  };
  return JSON.stringify(payload, null, 2);
}

function importJson(text) {
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

  return { REVIEW_CAP: REVIEW_CAP, XP: XP, BADGES: BADGES, ymd: ymd, dateFromYmd: dateFromYmd, addDays: addDays, daysBetween: daysBetween, load: load, save: save, saveNow: saveNow, listBackups: listBackups, loadBackup: loadBackup, reset: reset, wordState: wordState, rateWord: rateWord, masteryOf: masteryOf, isLongTerm: isLongTerm, dueWords: dueWords, addXp: addXp, levelOf: levelOf, refreshStats: refreshStats, streakOf: streakOf, checkBadges: checkBadges, today: today, recordAnswer: recordAnswer, SELF_RATINGS: SELF_RATINGS, recordSelf: recordSelf, reviewPlan: reviewPlan, completeDay: completeDay, isDone: isDone, reviewSummary: reviewSummary, exportJson: exportJson, importJson: importJson };
})();

__M["assets/data/vocab.js"] = (function () {
// 雅思核心词库 · 第 1–4 周
// 每 6 个词一组 = 一天的新词量；每天在 30 分钟里学 6 个新词 + 复习旧词。
// 字段：word 单词 / ipa 英式音标 / pos 词性 / zh 中文释义 / example 例句 / exampleZh 例句翻译 / tag 主题
const VOCAB = [
  { id: 'w001', word: 'academic', ipa: '/ˌækəˈdemɪk/', pos: 'adj.', zh: '学术的；学院的', example: 'Academic writing requires a clear structure and strong evidence.', exampleZh: '学术写作需要清晰的结构和有力的证据。', tag: '教育' },
  { id: 'w002', word: 'curriculum', ipa: '/kəˈrɪkjələm/', pos: 'n.', zh: '课程；课程体系', example: 'The school has updated its curriculum to include more practical subjects.', exampleZh: '学校已更新课程，加入更多实用科目。', tag: '教育' },
  { id: 'w003', word: 'compulsory', ipa: '/kəmˈpʌlsəri/', pos: 'adj.', zh: '义务的；强制的', example: 'Physical education is compulsory for all students in most secondary schools.', exampleZh: '在大多数中学，体育课对所有学生都是必修的。', tag: '教育' },
  { id: 'w004', word: 'enrol', ipa: '/ɪnˈrəʊl/', pos: 'v.', zh: '注册；报名', example: 'Over three hundred students enrol in the language programme each year.', exampleZh: '每年有三百多名学生报名参加这个语言课程。', tag: '教育' },
  { id: 'w005', word: 'literacy', ipa: '/ˈlɪtərəsi/', pos: 'n.', zh: '读写能力；识字', example: 'The government aims to raise adult literacy rates within ten years.', exampleZh: '政府计划在十年内提高成人识字率。', tag: '教育' },
  { id: 'w006', word: 'tuition', ipa: '/tjuˈɪʃn/', pos: 'n.', zh: '学费；教学', example: 'Tuition fees have risen sharply at many universities in recent years.', exampleZh: '近年来许多大学的学费大幅上涨。', tag: '教育' },
  { id: 'w007', word: 'assess', ipa: '/əˈses/', pos: 'v.', zh: '评估；考核', example: 'Teachers assess students through both exams and written assignments.', exampleZh: '教师通过考试和书面作业来评估学生。', tag: '教育' },
  { id: 'w008', word: 'assignment', ipa: '/əˈsaɪnmənt/', pos: 'n.', zh: '作业；任务', example: 'She finished her assignment two days before the deadline.', exampleZh: '她在截止日期前两天完成了作业。', tag: '教育' },
  { id: 'w009', word: 'revise', ipa: '/rɪˈvaɪz/', pos: 'v.', zh: '复习；修订', example: 'He spends every evening revising notes for the final exam.', exampleZh: '他每天晚上都复习笔记，准备期末考试。', tag: '教育' },
  { id: 'w010', word: 'memorise', ipa: '/ˈmeməraɪz/', pos: 'v.', zh: '记忆；背诵', example: 'Students often memorise vocabulary without understanding how to use it.', exampleZh: '学生常常死记词汇，却不理解如何使用。', tag: '教育' },
  { id: 'w011', word: 'concentrate', ipa: '/ˈkɒnsntreɪt/', pos: 'v.', zh: '集中注意力；专注', example: 'It is hard to concentrate when the classroom is noisy.', exampleZh: '教室吵闹时很难集中注意力。', tag: '教育' },
  { id: 'w012', word: 'motivation', ipa: '/ˌməʊtɪˈveɪʃn/', pos: 'n.', zh: '动力；积极性', example: 'Clear learning goals can increase motivation and improve daily study habits.', exampleZh: '清晰的学习目标能增强动力，改善日常学习习惯。', tag: '教育' },
  { id: 'w013', word: 'analyse', ipa: '/ˈænəlaɪz/', pos: 'v.', zh: '分析；解析', example: 'Researchers analyse the data before drawing any firm conclusions.', exampleZh: '研究人员在得出明确结论之前会先分析数据。', tag: '教育' },
  { id: 'w014', word: 'evaluate', ipa: '/ɪˈvæljueɪt/', pos: 'v.', zh: '评价；评估', example: 'We need to evaluate the course before making further changes.', exampleZh: '我们需要在进一步调整之前评估这门课程。', tag: '教育' },
  { id: 'w015', word: 'interpret', ipa: '/ɪnˈtɜːprɪt/', pos: 'v.', zh: '解释；理解', example: 'Students must interpret the graph and describe its main trends.', exampleZh: '学生必须解读图表并描述其主要趋势。', tag: '教育' },
  { id: 'w016', word: 'justify', ipa: '/ˈdʒʌstɪfaɪ/', pos: 'v.', zh: '证明…合理；为…辩解', example: 'You should justify your opinion with clear reasons and examples.', exampleZh: '你应该用清晰的理由和例子来论证自己的观点。', tag: '教育' },
  { id: 'w017', word: 'demonstrate', ipa: '/ˈdemənstreɪt/', pos: 'v.', zh: '证明；展示', example: 'The results demonstrate a clear link between reading and achievement.', exampleZh: '结果表明阅读与学业成绩之间存在明显联系。', tag: '教育' },
  { id: 'w018', word: 'evidence', ipa: '/ˈevɪdəns/', pos: 'n.', zh: '证据；依据', example: 'There is strong evidence that early education improves later performance.', exampleZh: '有充分证据表明早期教育能提高日后的表现。', tag: '教育' },
  { id: 'w019', word: 'facility', ipa: '/fəˈsɪləti/', pos: 'n.', zh: '设施；设备', example: 'The new library offers excellent study facilities for all students.', exampleZh: '新图书馆为所有学生提供优良的学习设施。', tag: '教育' },
  { id: 'w020', word: 'campus', ipa: '/ˈkæmpəs/', pos: 'n.', zh: '校园', example: 'The university campus is quiet, green and easy to walk around.', exampleZh: '大学校园安静、绿意盎然，步行很方便。', tag: '教育' },
  { id: 'w021', word: 'lecture', ipa: '/ˈlektʃə/', pos: 'n./v.', zh: '讲座；讲课', example: 'The lecture on climate change attracted a very large audience.', exampleZh: '那场关于气候变化的讲座吸引了众多听众。', tag: '教育' },
  { id: 'w022', word: 'seminar', ipa: '/ˈsemɪnɑː/', pos: 'n.', zh: '研讨会；研讨课', example: 'Each seminar requires students to discuss a reading in small groups.', exampleZh: '每场研讨课都要求学生分小组讨论一篇阅读材料。', tag: '教育' },
  { id: 'w023', word: 'tutor', ipa: '/ˈtjuːtə/', pos: 'n.', zh: '导师；家教', example: 'My tutor gave me useful advice on planning the essay.', exampleZh: '导师给了我关于规划论文的有用建议。', tag: '教育' },
  { id: 'w024', word: 'scholarship', ipa: '/ˈskɒləʃɪp/', pos: 'n.', zh: '奖学金；学术研究', example: 'She won a scholarship that covers her tuition and living costs.', exampleZh: '她获得了覆盖学费和生活费的奖学金。', tag: '教育' },
  { id: 'w025', word: 'discipline', ipa: '/ˈdɪsəplɪn/', pos: 'n.', zh: '自律；学科', example: 'Learning a language demands discipline and regular daily practice.', exampleZh: '学习一门语言需要自律和每天坚持练习。', tag: '教育' },
  { id: 'w026', word: 'attitude', ipa: '/ˈætɪtjuːd/', pos: 'n.', zh: '态度；看法', example: 'A positive attitude towards failure helps students keep improving.', exampleZh: '对失败的积极态度能帮助学生不断进步。', tag: '教育' },
  { id: 'w027', word: 'confidence', ipa: '/ˈkɒnfɪdəns/', pos: 'n.', zh: '自信；信心', example: 'Speaking in public gradually built her confidence and fluency.', exampleZh: '公开演讲逐渐增强了她的自信和流利度。', tag: '教育' },
  { id: 'w028', word: 'progress', ipa: '/ˈprəʊɡres/', pos: 'n.', zh: '进步；进展', example: 'Regular feedback helps learners make steady progress in writing.', exampleZh: '定期反馈帮助学习者在写作上稳步进步。', tag: '教育' },
  { id: 'w029', word: 'outcome', ipa: '/ˈaʊtkʌm/', pos: 'n.', zh: '结果；成果', example: 'The main outcome of the project was a new online course.', exampleZh: '该项目的主要成果是一门新的在线课程。', tag: '教育' },
  { id: 'w030', word: 'feedback', ipa: '/ˈfiːdbæk/', pos: 'n.', zh: '反馈；意见', example: 'Detailed feedback from teachers can improve student writing quickly.', exampleZh: '教师的详细反馈能迅速提高学生的写作水平。', tag: '教育' },
  { id: 'w031', word: 'opportunity', ipa: '/ˌɒpəˈtjuːnəti/', pos: 'n.', zh: '机会；时机', example: 'Education should give every child an equal opportunity to succeed.', exampleZh: '教育应当给每个孩子平等的成功机会。', tag: '教育' },
  { id: 'w032', word: 'equal', ipa: '/ˈiːkwəl/', pos: 'adj.', zh: '平等的；相等的', example: 'All applicants should have equal access to higher education.', exampleZh: '所有申请者都应享有平等的高等教育机会。', tag: '教育' },
  { id: 'w033', word: 'disadvantage', ipa: '/ˌdɪsədˈvɑːntɪdʒ/', pos: 'n.', zh: '劣势；不利条件', example: 'Students from poor families often face a serious educational disadvantage.', exampleZh: '贫困家庭的学生常常面临严重的教育劣势。', tag: '教育' },
  { id: 'w034', word: 'support', ipa: '/səˈpɔːt/', pos: 'v./n.', zh: '支持；资助', example: 'Schools should support students who struggle with basic reading skills.', exampleZh: '学校应支持那些基本阅读能力有困难的学生。', tag: '教育' },
  { id: 'w035', word: 'encourage', ipa: '/ɪnˈkʌrɪdʒ/', pos: 'v.', zh: '鼓励；促进', example: 'Teachers encourage pupils to ask questions and share ideas freely.', exampleZh: '教师鼓励学生自由提问和分享想法。', tag: '教育' },
  { id: 'w036', word: 'participate', ipa: '/pɑːˈtɪsɪpeɪt/', pos: 'v.', zh: '参与；参加', example: 'More adults now participate in part-time courses after work.', exampleZh: '现在更多成年人下班后参加非全日制课程。', tag: '教育' },
  { id: 'w037', word: 'reform', ipa: '/rɪˈfɔːm/', pos: 'n./v.', zh: '改革；改良', example: 'The education reform aims to reduce exam pressure on children.', exampleZh: '这项教育改革旨在减轻儿童的考试压力。', tag: '教育' },
  { id: 'w038', word: 'qualification', ipa: '/ˌkwɒlɪfɪˈkeɪʃn/', pos: 'n.', zh: '资格；学历', example: 'A recognised qualification can improve your chances of employment.', exampleZh: '受认可的学历能提高你的就业机会。', tag: '教育' },
  { id: 'w039', word: 'graduate', ipa: '/ˈɡrædʒueɪt/', pos: 'v.', zh: '毕业；获得学位', example: 'Thousands of students graduate from vocational colleges every summer.', exampleZh: '每年夏天有数千名学生从职业学院毕业。', tag: '教育' },
  { id: 'w040', word: 'vocational', ipa: '/vəʊˈkeɪʃənl/', pos: 'adj.', zh: '职业的；职业技能的', example: 'Vocational training prepares young people for specific practical jobs.', exampleZh: '职业培训使年轻人为具体的实用工作做好准备。', tag: '教育' },
  { id: 'w041', word: 'attain', ipa: '/əˈteɪn/', pos: 'v.', zh: '达到；获得', example: 'Few students attain the highest grades without consistent effort.', exampleZh: '很少有学生不付出持续努力就能取得最高成绩。', tag: '教育' },
  { id: 'w042', word: 'transferable', ipa: '/trænsˈfɜːrəbl/', pos: 'adj.', zh: '可迁移的；可转移的', example: 'Teamwork and communication are transferable skills valued by employers.', exampleZh: '团队合作与沟通是雇主看重的可迁移技能。', tag: '教育' },
  { id: 'w043', word: 'emission', ipa: '/ɪˈmɪʃn/', pos: 'n.', zh: '排放；排放物', example: 'The factory must reduce its emission of harmful gases.', exampleZh: '该工厂必须减少有害气体的排放。', tag: '环境' },
  { id: 'w044', word: 'contaminate', ipa: '/kənˈtæmɪneɪt/', pos: 'v.', zh: '污染；弄脏', example: 'Chemicals from the factory have contaminated the local river.', exampleZh: '工厂排出的化学物质污染了当地的河流。', tag: '环境' },
  { id: 'w045', word: 'greenhouse', ipa: '/ˈɡriːnhaʊs/', pos: 'n.', zh: '温室', example: 'Greenhouse gases trap heat and slowly warm the planet.', exampleZh: '温室气体截留热量，使地球逐渐变暖。', tag: '环境' },
  { id: 'w046', word: 'carbon', ipa: '/ˈkɑːbən/', pos: 'n.', zh: '碳', example: 'Burning coal releases large amounts of carbon into the air.', exampleZh: '燃烧煤炭向空气中排放大量碳。', tag: '环境' },
  { id: 'w047', word: 'degrade', ipa: '/dɪˈɡreɪd/', pos: 'v.', zh: '降解；使退化', example: 'Plastic waste can degrade very slowly in the ocean.', exampleZh: '塑料垃圾在海洋中降解得非常缓慢。', tag: '环境' },
  { id: 'w048', word: 'ecosystem', ipa: '/ˈiːkəʊsɪstəm/', pos: 'n.', zh: '生态系统', example: 'Coastal development has damaged the fragile ecosystem of the bay.', exampleZh: '沿海开发破坏了海湾脆弱的生态系统。', tag: '环境' },
  { id: 'w049', word: 'renewable', ipa: '/rɪˈnjuːəbl/', pos: 'adj.', zh: '可再生的', example: 'The country now produces half its electricity from renewable sources.', exampleZh: '该国现在有一半电力来自可再生能源。', tag: '环境' },
  { id: 'w050', word: 'fossil', ipa: '/ˈfɒsl/', pos: 'adj.', zh: '化石的', example: 'Burning fossil fuels remains the largest source of global emissions.', exampleZh: '燃烧化石燃料仍是全球排放的最大来源。', tag: '环境' },
  { id: 'w051', word: 'consume', ipa: '/kənˈsjuːm/', pos: 'v.', zh: '消耗；消费', example: 'Modern households consume far more energy than they did before.', exampleZh: '现代家庭消耗的能源远多于从前。', tag: '环境' },
  { id: 'w052', word: 'conserve', ipa: '/kənˈsɜːv/', pos: 'v.', zh: '节约；保护', example: 'Simple habits can help families conserve water and electricity.', exampleZh: '简单的习惯能帮助家庭节约水和电。', tag: '环境' },
  { id: 'w053', word: 'resource', ipa: '/rɪˈsɔːs/', pos: 'n.', zh: '资源；资料', example: 'Fresh water is a limited resource in many dry regions.', exampleZh: '在许多干旱地区，淡水是有限的资源。', tag: '环境' },
  { id: 'w054', word: 'generate', ipa: '/ˈdʒenəreɪt/', pos: 'v.', zh: '产生；发电', example: 'Solar panels generate clean electricity even on cloudy days.', exampleZh: '太阳能板即使在阴天也能产生清洁电力。', tag: '环境' },
  { id: 'w055', word: 'sustainable', ipa: '/səˈsteɪnəbl/', pos: 'adj.', zh: '可持续的', example: 'Cities need sustainable solutions to manage waste and transport.', exampleZh: '城市需要可持续的方案来处理垃圾和交通。', tag: '环境' },
  { id: 'w056', word: 'recycle', ipa: '/ˌriːˈsaɪkl/', pos: 'v.', zh: '回收利用', example: 'Residents are encouraged to recycle paper, glass and metal.', exampleZh: '居民被鼓励回收纸张、玻璃和金属。', tag: '环境' },
  { id: 'w057', word: 'waste', ipa: '/weɪst/', pos: 'n./v.', zh: '废物；浪费', example: 'Food waste in restaurants has become a serious environmental problem.', exampleZh: '餐馆的食物浪费已成为严重的环境问题。', tag: '环境' },
  { id: 'w058', word: 'efficiency', ipa: '/ɪˈfɪʃnsi/', pos: 'n.', zh: '效率；效能', example: 'Improving energy efficiency at home lowers bills and emissions.', exampleZh: '提高家庭能源效率能降低账单和排放。', tag: '环境' },
  { id: 'w059', word: 'alternative', ipa: '/ɔːlˈtɜːnətɪv/', pos: 'n./adj.', zh: '替代方案；可替代的', example: 'Cycling is a healthy alternative to driving short distances.', exampleZh: '骑自行车是短途开车的一种健康替代方式。', tag: '环境' },
  { id: 'w060', word: 'preserve', ipa: '/prɪˈzɜːv/', pos: 'v.', zh: '保护；保存', example: 'National parks were created to preserve rare plants and animals.', exampleZh: '国家公园的建立是为了保护珍稀动植物。', tag: '环境' },
  { id: 'w061', word: 'urban', ipa: '/ˈɜːbən/', pos: 'adj.', zh: '城市的；都市的', example: 'Urban areas often suffer from noise, traffic and poor air.', exampleZh: '城市地区常常遭受噪音、交通和空气污染之苦。', tag: '城市' },
  { id: 'w062', word: 'rural', ipa: '/ˈrʊərəl/', pos: 'adj.', zh: '农村的；乡村的', example: 'Many young people leave rural areas to find work in cities.', exampleZh: '许多年轻人离开农村地区去城市找工作。', tag: '城市' },
  { id: 'w063', word: 'migrate', ipa: '/maɪˈɡreɪt/', pos: 'v.', zh: '迁移；移居', example: 'Millions of people migrate to big cities every year.', exampleZh: '每年有数百万人迁往大城市。', tag: '城市' },
  { id: 'w064', word: 'population', ipa: '/ˌpɒpjuˈleɪʃn/', pos: 'n.', zh: '人口；种群', example: 'The city population has doubled in less than twenty years.', exampleZh: '这个城市的人口在不到二十年内翻了一番。', tag: '城市' },
  { id: 'w065', word: 'expansion', ipa: '/ɪkˈspænʃn/', pos: 'n.', zh: '扩张；扩大', example: 'Rapid urban expansion has swallowed up farmland and forests.', exampleZh: '快速的城市扩张吞没了农田和森林。', tag: '城市' },
  { id: 'w066', word: 'dweller', ipa: '/ˈdwelə/', pos: 'n.', zh: '居民；居住者', example: 'City dwellers often spend hours travelling to work each day.', exampleZh: '城市居民每天常常要花数小时通勤。', tag: '城市' },
  { id: 'w067', word: 'infrastructure', ipa: '/ˈɪnfrəstrʌktʃə/', pos: 'n.', zh: '基础设施', example: 'The city needs better infrastructure to cope with rapid growth.', exampleZh: '这座城市需要更好的基础设施来应对快速增长。', tag: '城市' },
  { id: 'w068', word: 'housing', ipa: '/ˈhaʊzɪŋ/', pos: 'n.', zh: '住房；住宅', example: 'Affordable housing is scarce in the centre of large cities.', exampleZh: '大城市市中心的经济适用房很稀缺。', tag: '城市' },
  { id: 'w069', word: 'congestion', ipa: '/kənˈdʒestʃən/', pos: 'n.', zh: '拥堵；堵塞', example: 'Traffic congestion costs the economy billions of pounds each year.', exampleZh: '交通拥堵每年给经济造成数十亿英镑的损失。', tag: '城市' },
  { id: 'w070', word: 'pedestrian', ipa: '/pəˈdestriən/', pos: 'n.', zh: '行人；步行者', example: 'The new street gives pedestrians more space and safer crossings.', exampleZh: '新街道给行人更多空间和更安全的过街处。', tag: '城市' },
  { id: 'w071', word: 'zone', ipa: '/zəʊn/', pos: 'n.', zh: '区域；地带', example: 'Cars are banned from the city centre zone during busy hours.', exampleZh: '高峰时段汽车被禁止进入市中心区域。', tag: '城市' },
  { id: 'w072', word: 'suburb', ipa: '/ˈsʌbɜːb/', pos: 'n.', zh: '郊区；城郊', example: 'They moved to a quiet suburb with good schools and parks.', exampleZh: '他们搬到了一个有好学校和公园的安静郊区。', tag: '城市' },
  { id: 'w073', word: 'transport', ipa: '/ˈtrænspɔːt/', pos: 'n.', zh: '交通；运输', example: 'Public transport in the city is cheap, frequent and reliable.', exampleZh: '这座城市的公共交通便宜、班次多且可靠。', tag: '交通' },
  { id: 'w074', word: 'commute', ipa: '/kəˈmjuːt/', pos: 'v.', zh: '通勤；上下班往返', example: 'Many workers commute by train for over an hour daily.', exampleZh: '许多上班族每天乘火车通勤一个多小时。', tag: '交通' },
  { id: 'w075', word: 'vehicle', ipa: '/ˈviːəkl/', pos: 'n.', zh: '车辆；工具', example: 'Electric vehicles produce less noise and no exhaust fumes.', exampleZh: '电动车产生的噪音更少，也没有尾气。', tag: '交通' },
  { id: 'w076', word: 'route', ipa: '/ruːt/', pos: 'n.', zh: '路线；路径', example: 'The new bus route connects the station with the hospital.', exampleZh: '新的公交线路把车站和医院连接起来。', tag: '交通' },
  { id: 'w077', word: 'fare', ipa: '/feə/', pos: 'n.', zh: '车费；票价', example: 'Bus fares will rise slightly from the beginning of next month.', exampleZh: '公交车费将从下月初起略微上涨。', tag: '交通' },
  { id: 'w078', word: 'transit', ipa: '/ˈtrænzɪt/', pos: 'n.', zh: '运输；公共交通', example: 'Fast transit links make it easy to travel between districts.', exampleZh: '快捷的公共交通使往返各区变得容易。', tag: '交通' },
  { id: 'w079', word: 'regulation', ipa: '/ˌreɡjuˈleɪʃn/', pos: 'n.', zh: '规章；管理规定', example: 'New regulation on factory emissions will take effect next year.', exampleZh: '关于工厂排放的新法规将于明年生效。', tag: '环境' },
  { id: 'w080', word: 'restrict', ipa: '/rɪˈstrɪkt/', pos: 'v.', zh: '限制；约束', example: 'Some cities restrict car use to improve air quality.', exampleZh: '一些城市限制汽车使用以改善空气质量。', tag: '环境' },
  { id: 'w081', word: 'impose', ipa: '/ɪmˈpəʊz/', pos: 'v.', zh: '强加；征收', example: 'The government may impose higher taxes on polluting vehicles.', exampleZh: '政府可能对污染车辆征收更高的税。', tag: '环境' },
  { id: 'w082', word: 'incentive', ipa: '/ɪnˈsentɪv/', pos: 'n.', zh: '激励；奖励措施', example: 'Tax incentives encourage companies to invest in clean technology.', exampleZh: '税收激励鼓励公司投资清洁技术。', tag: '环境' },
  { id: 'w083', word: 'awareness', ipa: '/əˈweənəs/', pos: 'n.', zh: '意识；认识', example: 'Public awareness of plastic pollution has grown rapidly.', exampleZh: '公众对塑料污染的意识迅速提高。', tag: '环境' },
  { id: 'w084', word: 'decline', ipa: '/dɪˈklaɪn/', pos: 'v./n.', zh: '下降；衰退', example: 'Air pollution levels have declined since the new rules began.', exampleZh: '自新规定实施以来，空气污染水平有所下降。', tag: '环境' },
  { id: 'w085', word: 'employ', ipa: '/ɪmˈplɔɪ/', pos: 'v.', zh: '雇用；使用', example: 'The factory employs over two thousand local workers.', exampleZh: '这家工厂雇用了两千多名当地工人。', tag: '工作' },
  { id: 'w086', word: 'recruit', ipa: '/rɪˈkruːt/', pos: 'v.', zh: '招聘；招募', example: 'Companies now recruit many staff through online interviews.', exampleZh: '公司现在通过线上面试招聘许多员工。', tag: '工作' },
  { id: 'w087', word: 'candidate', ipa: '/ˈkændɪdət/', pos: 'n.', zh: '候选人；应聘者', example: 'Each candidate must prepare a short presentation for the interview.', exampleZh: '每位应聘者都必须为面试准备一个简短的陈述。', tag: '工作' },
  { id: 'w088', word: 'salary', ipa: '/ˈsæləri/', pos: 'n.', zh: '薪水；工资', example: 'A higher salary is not the only reason people change jobs.', exampleZh: '更高的薪水并不是人们换工作的唯一原因。', tag: '工作' },
  { id: 'w089', word: 'promotion', ipa: '/prəˈməʊʃn/', pos: 'n.', zh: '晋升；推广', example: 'She earned a promotion after leading a successful project.', exampleZh: '在领导一个成功项目后她获得了晋升。', tag: '工作' },
  { id: 'w090', word: 'colleague', ipa: '/ˈkɒliːɡ/', pos: 'n.', zh: '同事；同僚', example: 'A helpful colleague showed me how the new system works.', exampleZh: '一位乐于助人的同事向我展示了新系统如何运作。', tag: '工作' },
  { id: 'w091', word: 'flexible', ipa: '/ˈfleksəbl/', pos: 'adj.', zh: '灵活的；弹性的', example: 'Flexible working hours help parents balance work and family.', exampleZh: '弹性工作时间帮助父母平衡工作与家庭。', tag: '工作' },
  { id: 'w092', word: 'workload', ipa: '/ˈwɜːkləʊd/', pos: 'n.', zh: '工作量；工作负担', example: 'A heavy workload can lead to stress and poor sleep.', exampleZh: '繁重的工作量可能导致压力和睡眠不佳。', tag: '工作' },
  { id: 'w093', word: 'productivity', ipa: '/ˌprɒdʌkˈtɪvəti/', pos: 'n.', zh: '生产率；工作效率', example: 'Short breaks during the day can actually raise productivity.', exampleZh: '白天的短暂休息实际上能提高工作效率。', tag: '工作' },
  { id: 'w094', word: 'remote', ipa: '/rɪˈməʊt/', pos: 'adj.', zh: '远程的；偏远的', example: 'Remote working has become common in many office jobs.', exampleZh: '远程工作在许多办公室工作中已变得普遍。', tag: '工作' },
  { id: 'w095', word: 'collaborate', ipa: '/kəˈlæbəreɪt/', pos: 'v.', zh: '合作；协作', example: 'Designers and engineers collaborate closely on every new product.', exampleZh: '设计师和工程师在每个新产品上密切合作。', tag: '工作' },
  { id: 'w096', word: 'delegate', ipa: '/ˈdelɪɡeɪt/', pos: 'v.', zh: '分派；授权', example: 'Good managers delegate tasks instead of doing everything themselves.', exampleZh: '优秀的管理者会分派任务，而不是凡事亲力亲为。', tag: '工作' },
  { id: 'w097', word: 'expertise', ipa: '/ˌekspɜːˈtiːz/', pos: 'n.', zh: '专业知识；专长', example: 'The company values technical expertise as much as experience.', exampleZh: '公司重视技术专长，也重视经验。', tag: '工作' },
  { id: 'w098', word: 'competence', ipa: '/ˈkɒmpɪtəns/', pos: 'n.', zh: '能力；胜任力', example: 'The job requires basic competence in two foreign languages.', exampleZh: '这份工作需要两门外语的基本能力。', tag: '工作' },
  { id: 'w099', word: 'capable', ipa: '/ˈkeɪpəbl/', pos: 'adj.', zh: '有能力的；能干的', example: 'She is capable of managing a large team under pressure.', exampleZh: '她有能力在压力下管理一个大团队。', tag: '工作' },
  { id: 'w100', word: 'initiative', ipa: '/ɪˈnɪʃətɪv/', pos: 'n.', zh: '主动性；倡议', example: 'Employers look for people who show initiative and curiosity.', exampleZh: '雇主寻找有主动性和好奇心的人。', tag: '工作' },
  { id: 'w101', word: 'ambitious', ipa: '/æmˈbɪʃəs/', pos: 'adj.', zh: '有雄心的；有抱负的', example: 'Many ambitious graduates want to start their own businesses.', exampleZh: '许多有抱负的毕业生想自己创业。', tag: '工作' },
  { id: 'w102', word: 'retire', ipa: '/rɪˈtaɪə/', pos: 'v.', zh: '退休；退出', example: 'Most people retire at around sixty-five in this country.', exampleZh: '在这个国家，大多数人六十五岁左右退休。', tag: '工作' },
  { id: 'w103', word: 'digital', ipa: '/ˈdɪdʒɪtl/', pos: 'adj.', zh: '数字的；数码的', example: 'Digital tools have changed the way people learn languages.', exampleZh: '数字工具改变了人们学习语言的方式。', tag: '科技' },
  { id: 'w104', word: 'innovate', ipa: '/ˈɪnəveɪt/', pos: 'v.', zh: '创新；革新', example: 'Small firms often innovate faster than large organisations.', exampleZh: '小公司往往比大机构创新得更快。', tag: '科技' },
  { id: 'w105', word: 'automate', ipa: '/ˈɔːtəmeɪt/', pos: 'v.', zh: '使自动化', example: 'Factories increasingly automate routine tasks to cut costs.', exampleZh: '工厂越来越多地将常规任务自动化以降低成本。', tag: '科技' },
  { id: 'w106', word: 'artificial', ipa: '/ˌɑːtɪˈfɪʃl/', pos: 'adj.', zh: '人工的；人造的', example: 'Artificial intelligence is now used in many everyday services.', exampleZh: '人工智能现在被用于许多日常服务中。', tag: '科技' },
  { id: 'w107', word: 'device', ipa: '/dɪˈvaɪs/', pos: 'n.', zh: '设备；装置', example: 'Most students bring at least one digital device to class.', exampleZh: '大多数学生至少带一个数字设备来上课。', tag: '科技' },
  { id: 'w108', word: 'algorithm', ipa: '/ˈælɡərɪðəm/', pos: 'n.', zh: '算法', example: 'The algorithm suggests videos based on what you watch.', exampleZh: '算法根据你观看的内容推荐视频。', tag: '科技' },
  { id: 'w109', word: 'network', ipa: '/ˈnetwɜːk/', pos: 'n.', zh: '网络；人脉', example: 'A reliable network is essential for online learning and work.', exampleZh: '可靠的网络对在线学习和工作至关重要。', tag: '科技' },
  { id: 'w110', word: 'virtual', ipa: '/ˈvɜːtʃuəl/', pos: 'adj.', zh: '虚拟的；实际上的', example: 'Virtual meetings save time and reduce travel costs.', exampleZh: '虚拟会议节省时间并降低差旅成本。', tag: '科技' },
  { id: 'w111', word: 'privacy', ipa: '/ˈprɪvəsi/', pos: 'n.', zh: '隐私；私密', example: 'Users should read the privacy settings before sharing personal data.', exampleZh: '用户在分享个人数据前应阅读隐私设置。', tag: '科技' },
  { id: 'w112', word: 'security', ipa: '/sɪˈkjʊərəti/', pos: 'n.', zh: '安全；保障', example: 'Strong passwords improve the security of your online accounts.', exampleZh: '强密码能提高你在线账户的安全性。', tag: '科技' },
  { id: 'w113', word: 'access', ipa: '/ˈækses/', pos: 'n./v.', zh: '获取；使用权', example: 'Rural schools still lack reliable access to fast internet.', exampleZh: '农村学校仍然缺乏可靠的快速互联网接入。', tag: '科技' },
  { id: 'w114', word: 'platform', ipa: '/ˈplætfɔːm/', pos: 'n.', zh: '平台；站台', example: 'The platform allows students to share notes and ask questions.', exampleZh: '这个平台允许学生分享笔记和提问。', tag: '科技' },
  { id: 'w115', word: 'journalism', ipa: '/ˈdʒɜːnəlɪzəm/', pos: 'n.', zh: '新闻业；新闻工作', example: 'Good journalism depends on accurate facts and independent checking.', exampleZh: '优秀的新闻业依赖于准确的事实和独立的核查。', tag: '媒体' },
  { id: 'w116', word: 'broadcast', ipa: '/ˈbrɔːdkɑːst/', pos: 'v./n.', zh: '播送；广播节目', example: 'The interview was broadcast live to millions of viewers.', exampleZh: '这次采访向数百万观众现场直播。', tag: '媒体' },
  { id: 'w117', word: 'advertise', ipa: '/ˈædvətaɪz/', pos: 'v.', zh: '做广告；宣传', example: 'Companies advertise products on social media to reach young buyers.', exampleZh: '公司在社交媒体上为产品做广告以触达年轻买家。', tag: '媒体' },
  { id: 'w118', word: 'bias', ipa: '/ˈbaɪəs/', pos: 'n.', zh: '偏见；偏向', example: 'Readers should be aware of bias in some news reports.', exampleZh: '读者应注意某些新闻报道中的偏见。', tag: '媒体' },
  { id: 'w119', word: 'credible', ipa: '/ˈkredəbl/', pos: 'adj.', zh: '可信的；可靠的', example: 'A credible source always names its evidence and its author.', exampleZh: '可信的来源总会标明证据和作者。', tag: '媒体' },
  { id: 'w120', word: 'audience', ipa: '/ˈɔːdiəns/', pos: 'n.', zh: '观众；受众', example: 'The documentary attracted a wide audience across several countries.', exampleZh: '这部纪录片在多个国家吸引了广泛观众。', tag: '媒体' },
  { id: 'w121', word: 'verify', ipa: '/ˈverɪfaɪ/', pos: 'v.', zh: '核实；证实', example: 'Journalists must verify facts before publishing a story.', exampleZh: '记者在发表报道前必须核实事实。', tag: '媒体' },
  { id: 'w122', word: 'accurate', ipa: '/ˈækjərət/', pos: 'adj.', zh: '准确的；精确的', example: 'Accurate information is more important than a fast headline.', exampleZh: '准确的信息比抢快的标题更重要。', tag: '媒体' },
  { id: 'w123', word: 'misleading', ipa: '/ˌmɪsˈliːdɪŋ/', pos: 'adj.', zh: '误导的；使人误解的', example: 'Misleading advertisements can damage trust in a brand.', exampleZh: '误导性广告会损害人们对一个品牌的信任。', tag: '媒体' },
  { id: 'w124', word: 'influence', ipa: '/ˈɪnfluəns/', pos: 'n./v.', zh: '影响；作用', example: 'Social media has a strong influence on how young people think.', exampleZh: '社交媒体对年轻人的思维方式有很大影响。', tag: '媒体' },
  { id: 'w125', word: 'persuasive', ipa: '/pəˈsweɪsɪv/', pos: 'adj.', zh: '有说服力的', example: 'A persuasive argument uses evidence rather than emotion alone.', exampleZh: '有说服力的论证依靠证据，而不仅是情感。', tag: '媒体' },
  { id: 'w126', word: 'engage', ipa: '/ɪnˈɡeɪdʒ/', pos: 'v.', zh: '吸引；参与', example: 'Interactive lessons engage students and keep their attention longer.', exampleZh: '互动课程能吸引学生并让他们保持更长时间的注意力。', tag: '媒体' },
  { id: 'w127', word: 'nutrition', ipa: '/njuˈtrɪʃn/', pos: 'n.', zh: '营养；营养学', example: 'Good nutrition in childhood supports healthy growth and learning.', exampleZh: '童年良好的营养有助于健康成长和学习。', tag: '健康' },
  { id: 'w128', word: 'obesity', ipa: '/əʊˈbiːsəti/', pos: 'n.', zh: '肥胖；肥胖症', example: 'Childhood obesity has risen sharply in many developed countries.', exampleZh: '儿童肥胖在许多发达国家急剧上升。', tag: '健康' },
  { id: 'w129', word: 'diet', ipa: '/ˈdaɪət/', pos: 'n.', zh: '饮食；节食', example: 'A balanced diet includes fresh vegetables, fruit and enough protein.', exampleZh: '均衡的饮食包括新鲜蔬菜、水果和足够的蛋白质。', tag: '健康' },
  { id: 'w130', word: 'sedentary', ipa: '/ˈsedntri/', pos: 'adj.', zh: '久坐的；缺乏运动的', example: 'A sedentary lifestyle increases the risk of heart disease.', exampleZh: '久坐的生活方式会增加患心脏病的风险。', tag: '健康' },
  { id: 'w131', word: 'immunity', ipa: '/ɪˈmjuːnəti/', pos: 'n.', zh: '免疫力；豁免', example: 'Regular exercise and enough sleep can strengthen your immunity.', exampleZh: '经常锻炼和充足睡眠能增强你的免疫力。', tag: '健康' },
  { id: 'w132', word: 'symptom', ipa: '/ˈsɪmptəm/', pos: 'n.', zh: '症状；征兆', example: 'A high fever is a common symptom of this infection.', exampleZh: '高烧是这种感染的常见症状。', tag: '健康' },
  { id: 'w133', word: 'diagnosis', ipa: '/ˌdaɪəɡˈnəʊsɪs/', pos: 'n.', zh: '诊断；判断', example: 'Early diagnosis greatly improves the chance of successful treatment.', exampleZh: '早期诊断大大提高了成功治疗的机会。', tag: '健康' },
  { id: 'w134', word: 'treatment', ipa: '/ˈtriːtmənt/', pos: 'n.', zh: '治疗；处理', example: 'The new treatment is effective but expensive for most patients.', exampleZh: '这种新疗法有效，但对大多数病人来说很昂贵。', tag: '健康' },
  { id: 'w135', word: 'prevention', ipa: '/prɪˈvenʃn/', pos: 'n.', zh: '预防；防止', example: 'Prevention is cheaper than treating disease after it develops.', exampleZh: '预防比疾病发展后再治疗更便宜。', tag: '健康' },
  { id: 'w136', word: 'clinic', ipa: '/ˈklɪnɪk/', pos: 'n.', zh: '诊所；门诊部', example: 'The local clinic offers free checks every Tuesday morning.', exampleZh: '当地诊所周二上午提供免费检查。', tag: '健康' },
  { id: 'w137', word: 'prescribe', ipa: '/prɪˈskraɪb/', pos: 'v.', zh: '开处方；规定', example: 'Doctors should not prescribe antibiotics for simple viral infections.', exampleZh: '医生不应为简单的病毒感染开抗生素。', tag: '健康' },
  { id: 'w138', word: 'patient', ipa: '/ˈpeɪʃnt/', pos: 'n.', zh: '病人；患者', example: 'The patient recovered quickly after a week in hospital.', exampleZh: '这位病人在住院一周后迅速康复。', tag: '健康' },
  { id: 'w139', word: 'anxiety', ipa: '/æŋˈzaɪəti/', pos: 'n.', zh: '焦虑；担心', example: 'Exam anxiety can be reduced by practise and good planning.', exampleZh: '考试焦虑可以通过练习和良好的计划来减轻。', tag: '健康' },
  { id: 'w140', word: 'depression', ipa: '/dɪˈpreʃn/', pos: 'n.', zh: '抑郁；沮丧', example: 'Loneliness among older people can lead to serious depression.', exampleZh: '老年人的孤独可能导致严重的抑郁。', tag: '健康' },
  { id: 'w141', word: 'wellbeing', ipa: '/ˌwelˈbiːɪŋ/', pos: 'n.', zh: '幸福感；身心安康', example: 'Access to green space improves the wellbeing of city residents.', exampleZh: '接触绿地能改善城市居民的身心健康。', tag: '健康' },
  { id: 'w142', word: 'therapy', ipa: '/ˈθerəpi/', pos: 'n.', zh: '治疗；疗法', example: 'Talking therapy helps many people manage stress and low mood.', exampleZh: '谈话疗法帮助许多人应对压力和情绪低落。', tag: '健康' },
  { id: 'w143', word: 'counselling', ipa: '/ˈkaʊnsəlɪŋ/', pos: 'n.', zh: '心理咨询；辅导', example: 'The university offers free counselling to students who feel overwhelmed.', exampleZh: '大学为感到不堪重负的学生提供免费心理咨询。', tag: '健康' },
  { id: 'w144', word: 'resilience', ipa: '/rɪˈzɪliəns/', pos: 'n.', zh: '韧性；恢复力', example: 'Supportive friends and family build resilience during difficult times.', exampleZh: '有支持的朋友和家人能在困难时期培养韧性。', tag: '健康' },
  { id: 'w145', word: 'inequality', ipa: '/ˌɪnɪˈkwɒləti/', pos: 'n.', zh: '不平等；不均等', example: 'Income inequality remains high in many parts of the world.', exampleZh: '世界许多地区的收入不平等仍然严重。', tag: '社会' },
  { id: 'w146', word: 'poverty', ipa: '/ˈpɒvəti/', pos: 'n.', zh: '贫困；贫穷', example: 'Education is one of the best ways to escape poverty.', exampleZh: '教育是摆脱贫困的最佳途径之一。', tag: '社会' },
  { id: 'w147', word: 'welfare', ipa: '/ˈwelfeə/', pos: 'n.', zh: '福利；福祉', example: 'The welfare system supports families with low incomes.', exampleZh: '福利制度支持低收入家庭。', tag: '社会' },
  { id: 'w148', word: 'cohesion', ipa: '/kəʊˈhiːʒn/', pos: 'n.', zh: '凝聚力；团结', example: 'Shared festivals can strengthen social cohesion in diverse cities.', exampleZh: '共同的节日能增强多元城市的社会凝聚力。', tag: '社会' },
  { id: 'w149', word: 'discrimination', ipa: '/dɪˌskrɪmɪˈneɪʃn/', pos: 'n.', zh: '歧视；区别对待', example: 'Age discrimination at work is illegal in many countries.', exampleZh: '工作场所的年龄歧视在许多国家是非法的。', tag: '社会' },
  { id: 'w150', word: 'integrate', ipa: '/ˈɪntɪɡreɪt/', pos: 'v.', zh: '融合；使一体化', example: 'Language classes help new migrants integrate into local communities.', exampleZh: '语言课程帮助新移民融入当地社区。', tag: '社会' },
  { id: 'w151', word: 'policy', ipa: '/ˈpɒləsi/', pos: 'n.', zh: '政策；方针', example: 'The new policy aims to reduce youth unemployment.', exampleZh: '新政策旨在降低青年失业率。', tag: '社会' },
  { id: 'w152', word: 'legislation', ipa: '/ˌledʒɪsˈleɪʃn/', pos: 'n.', zh: '立法；法规', example: 'New legislation requires all new buildings to save energy.', exampleZh: '新立法要求所有新建筑节能。', tag: '社会' },
  { id: 'w153', word: 'authority', ipa: '/ɔːˈθɒrəti/', pos: 'n.', zh: '当局；权力', example: 'Local authorities are responsible for collecting household waste.', exampleZh: '地方政府负责收集生活垃圾。', tag: '社会' },
  { id: 'w154', word: 'fund', ipa: '/fʌnd/', pos: 'v./n.', zh: '资助；资金', example: 'The government will fund free meals for primary pupils.', exampleZh: '政府将资助小学生的免费餐。', tag: '社会' },
  { id: 'w155', word: 'budget', ipa: '/ˈbʌdʒɪt/', pos: 'n.', zh: '预算；经费', example: 'The city has a limited budget for public transport.', exampleZh: '这座城市用于公共交通的预算有限。', tag: '社会' },
  { id: 'w156', word: 'implement', ipa: '/ˈɪmplɪment/', pos: 'v.', zh: '实施；执行', example: 'Schools need time to implement the new assessment system.', exampleZh: '学校需要时间来实施新的评估制度。', tag: '社会' },
  { id: 'w157', word: 'provision', ipa: '/prəˈvɪʒn/', pos: 'n.', zh: '提供；条款', example: 'The provision of clean water should be a basic right.', exampleZh: '提供清洁水应当是一项基本权利。', tag: '社会' },
  { id: 'w158', word: 'allocate', ipa: '/ˈæləkeɪt/', pos: 'v.', zh: '分配；拨给', example: 'The council will allocate more money to public libraries.', exampleZh: '议会将向公共图书馆拨更多资金。', tag: '社会' },
  { id: 'w159', word: 'scheme', ipa: '/skiːm/', pos: 'n.', zh: '计划；方案', example: 'A cycling scheme offers free bikes to city workers.', exampleZh: '一项骑行计划为城市上班族提供免费自行车。', tag: '社会' },
  { id: 'w160', word: 'subsidy', ipa: '/ˈsʌbsədi/', pos: 'n.', zh: '补贴；津贴', example: 'Farmers receive a subsidy for protecting local wildlife.', exampleZh: '农民因保护当地野生动物而获得补贴。', tag: '社会' },
  { id: 'w161', word: 'taxation', ipa: '/tækˈseɪʃn/', pos: 'n.', zh: '税收；征税', example: 'Higher taxation on tobacco can reduce smoking rates.', exampleZh: '对烟草征收更高的税能降低吸烟率。', tag: '社会' },
  { id: 'w162', word: 'campaign', ipa: '/kæmˈpeɪn/', pos: 'n.', zh: '运动；宣传活动', example: 'A public health campaign encouraged people to walk more.', exampleZh: '一项公共卫生运动鼓励人们多走路。', tag: '社会' },
  { id: 'w163', word: 'heritage', ipa: '/ˈherɪtɪdʒ/', pos: 'n.', zh: '遗产；传统', example: 'The old town is protected as part of national heritage.', exampleZh: '这座老城作为国家遗产的一部分受到保护。', tag: '文化' },
  { id: 'w164', word: 'ritual', ipa: '/ˈrɪtʃuəl/', pos: 'n.', zh: '仪式；惯例', example: 'Tea drinking is an important daily ritual in many cultures.', exampleZh: '饮茶在许多文化中是一种重要的日常仪式。', tag: '文化' },
  { id: 'w165', word: 'diverse', ipa: '/daɪˈvɜːs/', pos: 'adj.', zh: '多样的；不同的', example: 'London is one of the most diverse cities in the world.', exampleZh: '伦敦是世界上最多元的城市之一。', tag: '文化' },
  { id: 'w166', word: 'identity', ipa: '/aɪˈdentəti/', pos: 'n.', zh: '身份；认同', example: 'Language plays a central role in national identity.', exampleZh: '语言在国家认同中起着核心作用。', tag: '文化' },
  { id: 'w167', word: 'exhibit', ipa: '/ɪɡˈzɪbɪt/', pos: 'v./n.', zh: '展出；展品', example: 'The museum will exhibit paintings by local artists next month.', exampleZh: '博物馆下个月将展出当地艺术家的画作。', tag: '文化' },
  { id: 'w168', word: 'contemporary', ipa: '/kənˈtemprəri/', pos: 'adj.', zh: '当代的；同时代的', example: 'Contemporary art often reflects social and political concerns.', exampleZh: '当代艺术常常反映社会和政治关切。', tag: '文化' },
];

  return { VOCAB: VOCAB };
})();

__M["assets/data/reading.js"] = (function () {
/* =========================================================
   reading.js · 阅读材料
   - READING：短文 + 4 道单选，练「读懂大意 + 定位细节」
   - 文本里用 [[...]] 包住的是本课关键词，阅读时会高亮并可查词
   ========================================================= */

const READING = {
  r1: {
    title: 'Why Finnish Schools Start Late',
    cn: '为什么芬兰学校上课那么晚',
    words: 268,
    level: '4.5–5.0',
    topic: '教育',
    glossary: {
      compulsory: '强制的；义务的',
      municipality: '市政当局',
      autonomy: '自主权',
      influential: '有影响力的',
      curriculum: '课程体系',
      priority: '优先事项',
    },
    text: [
      'In Finland, most children do not walk into a classroom until they are seven. Before that, they spend their days in play-based early education, where the main [[goal]] is not reading or counting but learning how to be with other people. Many visitors find this surprising. In their own countries, formal [[education]] starts much earlier, and children are expected to read simple words by the age of five.',
      'Yet Finland has one of the most [[successful]] school systems in the world. Its students often [[perform]] well in international tests, although they spend fewer hours in class than students in many other countries. A typical school day begins around nine in the morning and ends in the early afternoon. [[Homework]] is light, and there are long breaks between lessons.',
      'One reason for this approach is the way teachers are [[trained]]. In Finland, teaching is a [[popular]] career, and primary teachers must complete a master\'s degree. They are given a lot of [[freedom]] in how to teach. The national [[curriculum]] sets broad goals, but teachers decide which [[method]]s to use and how to [[assess]] their students. Trust, rather than control, is the [[central]] [[principle]] of the system.',
      'Another reason is the belief that childhood should not be a race. Finnish educators argue that play, rest and time outdoors are not [[waste]]d time. They help children [[develop]] [[confidence]] and the ability to work with others. When formal learning begins, children are usually ready for it. They also tend to [[remain]] curious, which many teachers think matters more than early [[achievement]].',
    ],
    questions: [
      {
        q: 'According to the passage, what is the main aim of early education in Finland?',
        opts: [
          'Learning to read before the age of five',
          'Learning how to get along with other people',
          'Preparing for international tests',
          'Memorising numbers and letters',
        ],
        a: 1,
        why: '第一段直接说 the main goal is not reading or counting but learning how to be with other people，即学会与人相处。',
      },
      {
        q: 'What can be inferred about Finnish students from the second paragraph?',
        opts: [
          'They study longer hours than students elsewhere',
          'They receive a great deal of homework',
          'They achieve good results with relatively short school days',
          'They rarely take part in international tests',
        ],
        a: 2,
        why: '第二段对比：课时更少、作业轻，却在国际测试中表现好——用较少的时间取得好成绩。',
      },
      {
        q: 'The word "autonomy" in the text is closest in meaning to —',
        opts: ['control', 'freedom', 'training', 'pressure'],
        a: 1,
        why: '第三段说教师在教学方式上有很大 freedom / autonomy（自主权），两者同义。注意原文用的是 freedom，题目换成 autonomy 考查同义替换。',
      },
      {
        q: 'The writer\'s attitude towards the Finnish system is best described as —',
        opts: ['doubtful', 'critical', 'supportive', 'neutral and distant'],
        a: 2,
        why: '全文用 successful、trust 等正面词，并解释其理念，整体是赞赏、支持的态度。',
      },
    ],
  },

  r2: {
    title: 'The Hidden Cost of Fast Fashion',
    cn: '快时尚的隐形代价',
    words: 281,
    level: '5.0',
    topic: '环境',
    glossary: {
      affordable: '买得起的',
      trend: '潮流',
      landfill: '垃圾填埋场',
      enormous: '巨大的',
      consume: '消耗',
      alternative: '替代方案',
    },
    text: [
      'A new T-shirt costs less than a cup of coffee in many cities. This seems like good news for shoppers, and it is one reason why fast fashion has become so [[popular]]. Clothes are cheap, [[fashionable]] and easy to replace. But the low price hides an [[enormous]] cost that is paid somewhere else — by the environment, and often by the people who make the clothes.',
      'The fashion industry uses a huge [[amount]] of water. Growing cotton for one T-shirt may require more than 2,000 litres of water. Dyes and chemicals used in production often flow into rivers, [[polluting]] the water that local people depend on. The [[impact]] does not stop when a garment is sold. Each year, millions of tonnes of clothing end up in [[landfill]]s, where some materials take decades to [[break]] down.',
      'There is also a human side. Many clothes are made in factories where workers earn very little and work long hours. Because big brands can move orders quickly from one country to another, factories are under [[pressure]] to keep costs low. Safety is sometimes [[ignored]] in the race to produce more, faster and cheaper.',
      'Some [[change]] is beginning. Second-hand shops and clothing rental services are growing, and a few brands now [[publish]] lists of the factories they use. Consumers can also help by buying less and choosing clothes that last. However, [[individual]] choices alone are unlikely to [[solve]] the problem. [[Government]]s can set rules on chemical use, and companies need to [[accept]] responsibility for the full life of their products, from the cotton field to the recycling bin.',
    ],
    questions: [
      {
        q: 'Why does the writer say the low price of clothes "hides" a cost?',
        opts: [
          'Because shoppers pay with credit cards',
          'Because the real costs are paid by the environment and workers',
          'Because the clothes are of poor quality',
          'Because the price includes hidden taxes',
        ],
        a: 1,
        why: '第一段末：低价的代价由环境和制衣工人承担，这是「藏着」的成本。',
      },
      {
        q: 'Which environmental problem is NOT mentioned in the passage?',
        opts: [
          'Large water use in cotton farming',
          'Chemical pollution of rivers',
          'Clothing waste in landfills',
          'Air pollution from delivery trucks',
        ],
        a: 3,
        why: '第二段提到水、化学染料、填埋，没有提到配送卡车的空气污染——典型的 NOT 题，要逐项回原文核对。',
      },
      {
        q: 'What does the passage suggest about factory workers?',
        opts: [
          'They are well protected by law',
          'They often move abroad for work',
          'They face pressure from low-cost competition',
          'They are paid more than before',
        ],
        a: 2,
        why: '第三段：品牌随时转移订单，工厂为了压低成本而承压，安全有时被忽视。',
      },
      {
        q: 'What is the writer\'s main point in the last paragraph?',
        opts: [
          'Individual action is enough to fix the problem',
          'Both consumers and governments have a role to play',
          'Second-hand shops will replace new clothing',
          'Brands should stop publishing factory lists',
        ],
        a: 1,
        why: '末段先肯定消费者作用，再用 However 转折说个人选择不够，政府和企业也要负责——双方都有责任。',
      },
    ],
  },

  r3: {
    title: 'Working From Anywhere',
    cn: '在哪里都能工作',
    words: 274,
    level: '5.0–5.5',
    topic: '工作',
    glossary: {
      flexible: '灵活的',
      commute: '通勤',
      productivity: '生产率',
      isolate: '使孤立',
      colleague: '同事',
      boundary: '界限',
    },
    text: [
      'Not long ago, "going to work" meant leaving home and travelling to an office. Today, millions of people do their jobs from kitchens, libraries or cafes. The shift to [[remote]] work, which sped up during the pandemic, has changed not only where we work but also how we think about work itself.',
      'Supporters point to clear [[benefits]]. Without a daily [[commute]], employees save time and money. They can [[choose]] working hours that suit their energy levels, and parents can fit work around family life. Companies benefit too: they can [[employ]] talented people who live far away, and they need less office space. Some studies suggest that [[productivity]] stays the same or even rises when people work from home.',
      'Yet remote work is not perfect. Many people say they miss the small [[conversations]] that happen by chance in an office — the ones that lead to new ideas or solve a problem in five minutes. New employees find it harder to learn the [[culture]] of a company when they have never met their [[colleagues]] face to face. And when home and work share the same space, it becomes difficult to [[separate]] them. Some workers report checking messages late at night and feeling that they are never really off duty.',
      'The most [[common]] solution is a mixed [[model]]: a few days in the office, a few days at home. This keeps the [[flexibility]] people value while protecting the human contact that teams need. What matters most, researchers say, is not the number of days in an office but whether workers and managers agree on clear [[expectations]]. Without that, even a perfect office cannot make a team work well.',
    ],
    questions: [
      {
        q: 'What is the passage mainly about?',
        opts: [
          'Why offices are becoming more expensive',
          'The advantages and disadvantages of remote work',
          'How to find a job that allows travel',
          'The history of the modern office',
        ],
        a: 1,
        why: '全文结构：现象 → 好处 → 问题 → 折中方案，主旨是远程工作的利与弊。',
      },
      {
        q: 'According to the passage, one benefit for companies is that they can —',
        opts: [
          'pay employees less',
          'hire people who live far away',
          'avoid training new staff',
          'close all their offices',
        ],
        a: 1,
        why: '第二段：they can employ talented people who live far away，还能少租办公室，但不是「全关办公室」。',
      },
      {
        q: 'Why do new employees find remote work difficult?',
        opts: [
          'They cannot use office equipment',
          'They are not paid during training',
          'They have less access to a company\'s culture',
          'They must work longer hours',
        ],
        a: 2,
        why: '第三段：没面对面见过同事，更难了解公司文化。',
      },
      {
        q: 'What do researchers say is most important for a mixed model?',
        opts: [
          'A fixed number of office days',
          'A larger office building',
          'Clear agreement on expectations',
          'More frequent video calls',
        ],
        a: 2,
        why: '末句：关键不是办公天数，而是双方对期望有清晰共识。',
      },
    ],
  },

  r4: {
    title: 'The Truth About Sleep',
    cn: '关于睡眠的真相',
    words: 276,
    level: '5.5',
    topic: '健康',
    glossary: {
      memory: '记忆',
      immune: '免疫的',
      consistent: '规律的',
      caffeine: '咖啡因',
      average: '平均的',
      recover: '恢复',
    },
    text: [
      'Sleep looks like wasted time. We lie still for eight hours, doing nothing that can be seen. For centuries, some thinkers believed sleep was simply a pause, a break from real life. Modern science tells a very different story: while the body rests, the brain is busy [[processing]] the day.',
      'During deep sleep, the brain [[repeats]] information collected during the day and moves it into long-term [[memory]]. Students who sleep well after studying remember more than those who stay up late. Sleep also [[supports]] the [[immune]] system, helping the body fight illness, and it [[regulates]] the hormones that control hunger. People who regularly sleep too little are more likely to gain weight and to feel anxious.',
      'The problem is that many of us treat sleep as something we can [[reduce]] when we are busy. We stay up to finish work, watch one more episode, or scroll through our phones in bed. Light from screens tells the brain that it is still daytime, so the body produces less of the hormone that makes us sleepy. Coffee late in the afternoon has a similar [[effect]], because caffeine stays in the body for hours.',
      'The good news is that sleep can be [[improved]] fairly quickly. Experts suggest keeping a [[consistent]] schedule, even at weekends; going to bed only when tired; and keeping the bedroom dark and cool. Exercise during the day helps too. None of these [[habits]] is dramatic, but together they can [[increase]] the [[average]] night\'s sleep by an hour or more. And that hour, researchers say, is one of the best [[investments]] you can make in your health.',
    ],
    questions: [
      {
        q: 'What does modern science say about sleep?',
        opts: [
          'It is a waste of time',
          'It is when the brain does important work',
          'It only rests the body',
          'It has no effect on memory',
        ],
        a: 1,
        why: '第一段：大脑在睡眠中忙着处理白天的信息，并非浪费时间。',
      },
      {
        q: 'According to the passage, students who sleep well after studying —',
        opts: [
          'remember more than those who stay up late',
          'need less sleep the next day',
          'feel more anxious during exams',
          'prefer to study at night',
        ],
        a: 0,
        why: '第二段原句：Students who sleep well after studying remember more than those who stay up late.',
      },
      {
        q: 'Why is using a phone in bed a problem?',
        opts: [
          'It makes the room too bright to clean',
          'It increases the body\'s need for caffeine',
          'Screen light makes the brain think it is daytime',
          'It stops the body from producing hormones at all',
        ],
        a: 2,
        why: '第三段：屏幕光告诉大脑现在还是白天，于是睡眠激素分泌减少。',
      },
      {
        q: 'Which of the following is NOT suggested by experts?',
        opts: [
          'Keeping the same sleep schedule at weekends',
          'Exercising during the day',
          'Keeping the bedroom dark and cool',
          'Sleeping longer at weekends to catch up',
        ],
        a: 3,
        why: '专家建议周末也保持规律作息（反而不要靠周末补觉）。',
      },
    ],
  },
};

  return { READING: READING };
})();

__M["assets/data/listening.js"] = (function () {
/* =========================================================
   listening.js · 听力材料
   音频由浏览器语音合成（Web Speech API）朗读脚本，不依赖外部音频文件。
   每课含 4 道单选 / 填空 + 2 句听写。
   ========================================================= */

const LISTENING = {
  l1: {
    title: 'At the Library',
    cn: '图书馆导览',
    topic: '校园',
    style: 'dialogue',
    accent: 'GB',
    script: [
      { s: 'Woman', t: 'Good morning. Is this the main library?' },
      { s: 'Man', t: 'That\'s right. It\'s the biggest one on campus, and it\'s open from eight in the morning until ten at night, Monday to Friday.' },
      { s: 'Woman', t: 'And at the weekend?' },
      { s: 'Man', t: 'On Saturdays we open at nine and close at six. We\'re closed on Sundays during the summer.' },
      { s: 'Woman', t: 'OK. How many books can I borrow?' },
      { s: 'Man', t: 'Undergraduates can take out up to eight books at a time, for three weeks. If you need longer, you can renew them online twice.' },
      { s: 'Woman', t: 'That\'s useful. Is there somewhere quiet to study?' },
      { s: 'Man', t: 'The second floor is the quiet zone. The third floor has group rooms, but you need to book those at least a day in advance. And the café on the ground floor stays open until eight.' },
      { s: 'Woman', t: 'Great. One more thing — do you run any classes for new students?' },
      { s: 'Man', t: 'Yes, every Wednesday afternoon at two. It\'s a short session on finding sources and referencing. You can sign up at the front desk.' },
    ],
    questions: [
      { q: 'When is the library closed?', opts: ['Saturday afternoon', 'Sunday in summer', 'Wednesday morning', 'Friday evening'], a: 1, why: '男声说 We\'re closed on Sundays during the summer.' },
      { q: 'How long can undergraduates keep a book?', opts: ['One week', 'Two weeks', 'Three weeks', 'Four weeks'], a: 2, why: 'three weeks，并且可以线上续借两次。' },
      { q: 'Where should students go for a quiet place to study?', opts: ['The ground floor', 'The second floor', 'The third floor', 'The café'], a: 1, why: 'The second floor is the quiet zone.' },
      { q: 'What must students do to use a group room?', opts: ['Pay a small fee', 'Book it a day before', 'Ask a librarian each time', 'Arrive before nine'], a: 1, why: 'you need to book those at least a day in advance.' },
    ],
    dictation: [
      { text: 'Undergraduates can take out up to eight books at a time.', zh: '本科生一次最多可以借八本书。' },
      { text: 'The second floor is the quiet zone.', zh: '二楼是安静区。' },
    ],
  },

  l2: {
    title: 'Choosing a Sports Club',
    cn: '选一个运动社团',
    topic: '校园',
    style: 'dialogue',
    accent: 'GB',
    script: [
      { s: 'Man', t: 'Hi, I\'m thinking of joining a sports club this term. What do you have?' },
      { s: 'Woman', t: 'Well, the most popular one is football. We train on Tuesdays and Thursdays, from six to seven thirty in the evening.' },
      { s: 'Man', t: 'I\'m not very good at football, to be honest. Anything else?' },
      { s: 'Woman', t: 'There\'s badminton. It\'s much more relaxed, and you don\'t need any experience. We meet on Wednesday afternoons in the main hall. It costs twenty pounds a term, which covers the court and the shuttles.' },
      { s: 'Man', t: 'That sounds better. Do I need my own racket?' },
      { s: 'Woman', t: 'We have a few you can borrow, but most people buy their own after a couple of weeks. The sports shop near the station gives students a ten per cent discount.' },
      { s: 'Man', t: 'Good to know. And is there a swimming club?' },
      { s: 'Woman', t: 'Yes, but the pool is being repaired until the end of next month, so swimming won\'t start until November.' },
      { s: 'Man', t: 'OK. I\'ll come along on Wednesday and see how it goes.' },
      { s: 'Woman', t: 'Perfect. Just bring comfortable clothes and a bottle of water. And arrive ten minutes early so we can register you.' },
    ],
    questions: [
      { q: 'When does the football club train?', opts: ['Monday and Friday mornings', 'Tuesday and Thursday evenings', 'Wednesday afternoons', 'Saturday mornings'], a: 1, why: 'Tuesdays and Thursdays, from six to seven thirty in the evening.' },
      { q: 'Why does the man prefer badminton?', opts: ['It is cheaper than football', 'It is more relaxed and needs no experience', 'It takes place outdoors', 'His friend plays it'], a: 1, why: 'badminton is much more relaxed and needs no experience.' },
      { q: 'What does the twenty pounds cover?', opts: ['A racket and shoes', 'The court and shuttles', 'Coaching lessons', 'Club membership for a year'], a: 1, why: 'covers the court and the shuttles（场地和羽毛球）。' },
      { q: 'Why can\'t the man join swimming now?', opts: ['The club is full', 'The pool is being repaired', 'There is no coach', 'It is too expensive'], a: 1, why: 'the pool is being repaired until the end of next month.' },
    ],
    dictation: [
      { text: 'It is much more relaxed and you do not need any experience.', zh: '它轻松得多，而且不需要任何经验。' },
      { text: 'The sports shop gives students a ten per cent discount.', zh: '那家体育用品店给学生打九折。' },
    ],
  },

  l3: {
    title: 'Weekend Weather Report',
    cn: '周末天气播报',
    topic: '天气',
    style: 'monologue',
    accent: 'AU',
    script: [
      { s: 'Speaker', t: 'And now the weekend weather. After a wet and windy Friday, conditions will improve steadily over the next two days.' },
      { s: 'Speaker', t: 'Saturday morning will start cloudy, with a few showers in the north, but these will clear by lunchtime. Temperatures will reach around eighteen degrees in the afternoon, which is normal for this time of year. If you\'re planning to be outside, the best time is between two and five, when the sun is most likely to appear.' },
      { s: 'Speaker', t: 'Sunday will be the warmer of the two days, with temperatures climbing to twenty-two degrees. However, strong winds are expected along the coast, so sailors and cyclists should take care. There is also a chance of thunderstorms in the late afternoon.' },
      { s: 'Speaker', t: 'Looking ahead to next week, a cold front will arrive on Tuesday, bringing rain and much lower temperatures. So enjoy the weekend, but keep a jacket ready.' },
    ],
    questions: [
      { q: 'What was Friday like?', opts: ['Sunny and warm', 'Wet and windy', 'Cold and snowy', 'Cloudy but dry'], a: 1, why: '开头说 After a wet and windy Friday。' },
      { q: 'When is the best time to be outside on Saturday?', opts: ['Early morning', 'Around lunchtime', 'Between two and five', 'After seven'], a: 2, why: 'the best time is between two and five.' },
      { q: 'What is the highest temperature expected on Sunday?', opts: ['18 degrees', '20 degrees', '22 degrees', '25 degrees'], a: 2, why: 'Sunday 升温到 22 度，是两天里更暖的一天。' },
      { q: 'What change is expected next week?', opts: ['A heat wave', 'A cold front with rain', 'Strong sunshine', 'Snow in the north'], a: 1, why: 'a cold front will arrive on Tuesday, bringing rain and much lower temperatures.' },
    ],
    dictation: [
      { text: 'Temperatures will reach around eighteen degrees in the afternoon.', zh: '下午气温将达到 18 度左右。' },
      { text: 'Strong winds are expected along the coast.', zh: '沿海地区预计会有强风。' },
    ],
  },

  l4: {
    title: 'The Campus Garden',
    cn: '校园菜园',
    topic: '环境',
    style: 'interview',
    accent: 'GB',
    script: [
      { s: 'Interviewer', t: 'Dr Patel, you started the campus garden three years ago. Why did you begin?' },
      { s: 'Dr Patel', t: 'We wanted students to see where food actually comes from. Many of them had never grown anything before. We started with just six small beds behind the science building, and now we have more than forty.' },
      { s: 'Interviewer', t: 'Who does the work?' },
      { s: 'Dr Patel', t: 'It\'s completely run by volunteers — students, staff, and a few people from the local community. We meet every Saturday morning. Nobody is paid, but everyone takes home vegetables, and we run free workshops once a month.' },
      { s: 'Interviewer', t: 'Has it changed anything on campus?' },
      { s: 'Dr Patel', t: 'Definitely. The café now uses some of our vegetables, which cuts its food miles. More importantly, students who work in the garden say they feel less stressed. One study of our volunteers found that their sleep improved within six weeks.' },
      { s: 'Interviewer', t: 'What are your plans?' },
      { s: 'Dr Patel', t: 'We\'re building a small greenhouse so we can grow food through the winter. We also want to start a seed library, where people can borrow seeds and return them at the end of the season.' },
    ],
    questions: [
      { q: 'How many garden beds are there now?', opts: ['Six', 'Fourteen', 'Forty', 'Over forty'], a: 3, why: 'now we have more than forty。注意 six 是「开始时」。' },
      { q: 'How is the garden run?', opts: ['By paid staff', 'By volunteers', 'By a local company', 'By the science department'], a: 1, why: 'It\'s completely run by volunteers.' },
      { q: 'What benefit do student volunteers report?', opts: ['Better grades', 'More money', 'Less stress and better sleep', 'Free meals every day'], a: 2, why: 'feel less stressed，睡眠在六周内改善。' },
      { q: 'What are they planning to build?', opts: ['A new café', 'A greenhouse', 'A car park', 'A larger science building'], a: 1, why: 'We\'re building a small greenhouse.' },
    ],
    dictation: [
      { text: 'The garden is completely run by volunteers.', zh: '这个菜园完全由志愿者管理。' },
      { text: 'They want to start a seed library.', zh: '他们想开办一个种子图书馆。' },
    ],
  },

  l5: {
    title: 'Changes to the Morning Train',
    cn: '早班列车调整',
    topic: '交通',
    style: 'monologue',
    accent: 'GB',
    script: [
      { s: 'Speaker', t: 'Good morning, passengers. This is an announcement about services to the city centre. The seven forty train to Central Station will not run today because of engineering work between the airport and the city.' },
      { s: 'Speaker', t: 'Passengers travelling to the city should take the seven fifty-five service to Riverside, which will stop at all stations. From Riverside, a replacement bus will take you to Central Station. The bus journey takes about twenty minutes and is included in your ticket.' },
      { s: 'Speaker', t: 'We expect the seven fifty-five train to be busy, so please allow extra time to board. Passengers with a seat reservation for the seven forty will be able to use it on the later train.' },
      { s: 'Speaker', t: 'We would like to apologise for the inconvenience. Normal service is expected to return tomorrow morning. If you decide not to travel, you can get a full refund at the ticket office until six this evening.' },
    ],
    questions: [
      { q: 'Why is the 7:40 train cancelled?', opts: ['Bad weather', 'A lack of drivers', 'Engineering work', 'A passenger emergency'], a: 2, why: 'because of engineering work between the airport and the city.' },
      { q: 'How will passengers reach Central Station?', opts: ['By taxi', 'By replacement bus from Riverside', 'By a later direct train', 'On foot from the airport'], a: 1, why: '先坐 7:55 到 Riverside，再换替代巴士到 Central Station。' },
      { q: 'What should passengers with a seat reservation do?', opts: ['Cancel their ticket', 'Use it on the later train', 'Wait for tomorrow', 'Pay again'], a: 1, why: 'will be able to use it on the later train.' },
      { q: 'Until when can passengers get a refund?', opts: ['12 noon', '3 p.m.', '6 p.m.', 'Tomorrow morning'], a: 2, why: 'a full refund at the ticket office until six this evening.' },
    ],
    dictation: [
      { text: 'The bus journey takes about twenty minutes.', zh: '巴士车程大约二十分钟。' },
      { text: 'Normal service is expected to return tomorrow morning.', zh: '预计明天早上恢复正常服务。' },
    ],
  },

  l6: {
    title: 'A Voice Message About a Course',
    cn: '关于一门课程的语音留言',
    topic: '学习',
    style: 'monologue',
    accent: 'US',
    script: [
      { s: 'Speaker', t: 'Hi Maria, it\'s Tom. I\'m calling about the evening course we talked about. I went to the information session last night, and I think you\'d really like it.' },
      { s: 'Speaker', t: 'It\'s a twelve-week course on public speaking, on Tuesday evenings from seven to nine. The first half of each class is practice, and the second half is feedback. The teacher used to work for a radio station, so she\'s very good at helping people sound natural.' },
      { s: 'Speaker', t: 'The full price is two hundred and forty pounds, but there\'s a discount for students, so it would be one hundred and eighty for you. You do need to register before Friday, though, because there are only twenty places.' },
      { s: 'Speaker', t: 'Oh, and one thing — they ask everyone to give a short talk in the final week. It\'s not examined; it\'s just for practice. Let me know if you want to go together. Call me back when you get this.' },
    ],
    questions: [
      { q: 'How long is the course?', opts: ['Six weeks', 'Ten weeks', 'Twelve weeks', 'Twenty weeks'], a: 2, why: 'It\'s a twelve-week course.' },
      { q: 'What does the teacher do in the first half of each class?', opts: ['Give a lecture', 'Let students practise', 'Mark homework', 'Play recordings'], a: 1, why: 'The first half of each class is practice, the second half is feedback.' },
      { q: 'How much will Maria pay?', opts: ['£180', '£200', '£240', '£260'], a: 0, why: '学生折扣后 one hundred and eighty pounds。' },
      { q: 'Why should Maria register before Friday?', opts: ['The price will rise', 'The course starts then', 'There are only twenty places', 'The teacher is leaving'], a: 2, why: 'there are only twenty places.' },
    ],
    dictation: [
      { text: 'The first half of each class is practice.', zh: '每节课的前半段是练习。' },
      { text: 'There are only twenty places on the course.', zh: '这门课只有二十个名额。' },
    ],
  },

  l7: {
    title: 'A Talk on Recycling',
    cn: '关于回收的讲座',
    topic: '环境',
    style: 'monologue',
    accent: 'GB',
    script: [
      { s: 'Speaker', t: 'Thank you for inviting me. I want to talk about something that sounds simple: recycling. Most of us put bottles and paper in the right bin and feel that we have done our part. But the reality is more complicated.' },
      { s: 'Speaker', t: 'First, not everything we put in the recycling bin is actually recycled. In this country, about a quarter of what arrives at recycling centres cannot be processed. Often it is food waste left in containers, or materials that look recyclable but are not.' },
      { s: 'Speaker', t: 'Second, recycling is the last step, not the first. The order should be: reduce, reuse, then recycle. A cotton bag that is used a hundred times is better than a hundred plastic bags, but only if you actually use it. The most effective action for most families is simply to buy less.' },
      { s: 'Speaker', t: 'Finally, I want to mention repair. Many products are designed to be thrown away, but a growing number of local groups now help people fix appliances, clothes and bicycles. Last year, our repair café kept about two tonnes of goods out of landfill. That is small, but it shows what is possible.' },
    ],
    questions: [
      { q: 'What does the speaker say about the recycling bin?', opts: ['Everything in it is recycled', 'About a quarter of it cannot be processed', 'It is only for paper', 'It is checked by the government'], a: 1, why: 'about a quarter of what arrives at recycling centres cannot be processed.' },
      { q: 'What is the correct order of actions?', opts: ['Recycle, reuse, reduce', 'Reuse, recycle, reduce', 'Reduce, reuse, recycle', 'Recycle, reduce, reuse'], a: 2, why: 'The order should be: reduce, reuse, then recycle.' },
      { q: 'Which action does the speaker call most effective?', opts: ['Buying a cotton bag', 'Buying less', 'Recycling more often', 'Using paper bags'], a: 1, why: 'The most effective action for most families is simply to buy less.' },
      { q: 'What does the repair café do?', opts: ['Sells second-hand goods', 'Helps people fix things', 'Collects food waste', 'Runs recycling centres'], a: 1, why: 'help people fix appliances, clothes and bicycles.' },
    ],
    dictation: [
      { text: 'Recycling is the last step, not the first.', zh: '回收是最后一步，而不是第一步。' },
      { text: 'The most effective action is simply to buy less.', zh: '最有效的行动就是少买一点。' },
    ],
  },

  l8: {
    title: 'A Doctor on Screen Time',
    cn: '医生谈屏幕时间',
    topic: '健康',
    style: 'interview',
    accent: 'US',
    script: [
      { s: 'Interviewer', t: 'Dr Lee, parents are often told to limit their children\'s screen time. Is that the right advice?' },
      { s: 'Dr Lee', t: 'It depends on what the screens are used for, and on the child\'s age. For very young children, under two, we still recommend almost no screen time. For older children, the question is less about minutes and more about what they are doing and who they are with.' },
      { s: 'Interviewer', t: 'So some screen time can be good?' },
      { s: 'Dr Lee', t: 'Yes. A video call with grandparents, a documentary, or a coding game can be valuable. The problems appear when screens replace other things: sleep, physical activity, and face-to-face conversation. If a child is staying up late to play games, that is a much bigger concern than the number of hours.' },
      { s: 'Interviewer', t: 'What should parents do?' },
      { s: 'Dr Lee', t: 'Keep screens out of the bedroom, agree on clear rules before rather than during an argument, and watch something together when you can. Children learn from what adults do, not only from what they say.' },
    ],
    questions: [
      { q: 'What does Dr Lee say about children under two?', opts: ['They need two hours of screens', 'They should have almost no screen time', 'They learn well from videos', 'They should watch with parents'], a: 1, why: 'under two, we still recommend almost no screen time.' },
      { q: 'According to Dr Lee, the main question is —', opts: ['How many minutes children use screens', 'What children do and who they are with', 'Which device they use', 'Where the screen is made'], a: 1, why: 'the question is less about minutes and more about what they are doing and who they are with.' },
      { q: 'Which is the biggest concern?', opts: ['Watching a documentary', 'A video call with grandparents', 'Staying up late to play games', 'Using a coding game'], a: 2, why: '最担心的是屏幕挤占睡眠、运动和面对面交流。' },
      { q: 'Which advice is NOT mentioned?', opts: ['Keep screens out of the bedroom', 'Agree on rules in advance', 'Watch something together', 'Set a daily time limit of one hour'], a: 3, why: '医生强调重点不在「固定分钟数」，没提一小时上限。' },
    ],
    dictation: [
      { text: 'Keep screens out of the bedroom.', zh: '不要把屏幕带进卧室。' },
      { text: 'Children learn from what adults do.', zh: '孩子是从大人的行为中学习的。' },
    ],
  },
};

  return { LISTENING: LISTENING };
})();

__M["assets/data/tasks.js"] = (function () {
/* =========================================================
   tasks.js · 写作与口语
   写作：句子翻译 → 段落仿写 → 小作文（图表）；口语：跟读与话题卡
   ========================================================= */

const WRITING = {
  w1: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '用今天学的词，先求对，再求自然',
    lines: [
      { cn: '大多数孩子六岁开始上小学。', hints: ['start', 'primary school'], model: 'Most children start primary school at the age of six.', note: 'at the age of six 比 six years old 更书面。' },
      { cn: '这所学校提供很多课外活动。', hints: ['provide', 'after-school activities'], model: 'The school provides a wide range of after-school activities.', note: 'a wide range of 是雅思常用的「各种各样的」。' },
      { cn: '好老师能让学生对学习更有兴趣。', hints: ['motivate', 'be interested in'], model: 'A good teacher can motivate students to be more interested in learning.', note: 'motivate sb to do 是固定搭配。' },
      { cn: '阅读是提高词汇量最好的方法之一。', hints: ['one of the best ways', 'vocabulary'], model: 'Reading is one of the best ways to improve your vocabulary.', note: 'one of the best ways 后面接 to do。' },
      { cn: '如果学生每天复习，他们就不会忘记。', hints: ['revise', 'forget'], model: 'If students revise every day, they will not forget what they have learned.', note: '条件句：if + 现在时，主句用 will。' },
    ],
  },

  w2: {
    type: 'paragraph',
    title: '写一段「观点 + 理由 + 例子」',
    subtitle: '60–80 词；这是雅思大作文段落的标准骨架',
    prompt: 'Some people think children should start school at an earlier age. Do you agree? 用一段话表明你的立场，并给出一个理由和一个例子。',
    structure: ['① 观点句：I believe / In my view …', '② 理由：This is because …', '③ 例子：For example, …', '④ 收束：As a result, …'],
    words: ['early', 'benefit', 'develop', 'confidence', 'evidence', 'research'],
    model: 'In my view, children should not start formal schooling too early. This is because young children learn best through play, and pushing them to read and write before they are ready can reduce their confidence. For example, in Finland, formal education begins at seven, yet students there perform very well in international tests. As a result, a later start does not appear to hold children back.',
    modelZh: '在我看来，孩子不必过早开始正规学校教育。这是因为幼儿通过玩来学习效果最好，在他们准备好之前就逼着读写会削弱自信。例如在芬兰，正规教育七岁才开始，但那里的学生在国际测试中表现优异。因此，晚一点开始似乎并不会拖累孩子。',
    checklist: ['开头一句话亮明立场', '用 because 给出理由', '用一个具体例子（国家 / 研究 / 经历）', '结尾一句总结'],
  },

  w3: {
    type: 'chart',
    title: '小作文：描述一张柱状图',
    subtitle: 'Task 1 只需 3 句话：总趋势 → 最高 → 最低',
    chart: {
      title: 'Weekly hours spent on four activities by two age groups',
      unit: 'hours / week',
      groups: ['18–25', '26–40'],
      axis: [
        { label: 'Reading', v: [6, 3] },
        { label: 'Exercise', v: [4, 5] },
        { label: 'Screen time', v: [9, 6] },
        { label: 'Socialising', v: [7, 4] },
      ],
    },
    tips: ['用 while / whereas 对比两组', '最高值用 the highest / most', '趋势用 overall / in general 开头'],
    words: ['proportion', 'average', 'significant', 'while', 'compare', 'overall'],
    model: 'Overall, younger people spend more time on screens, reading and socialising, while the older group spends slightly more time exercising. Screen time is the highest for both groups, at nine hours a week for 18–25-year-olds compared with six hours for those aged 26–40. Reading shows the biggest difference: young people read six hours a week, whereas the older group reads only three.',
    modelZh: '总体而言，年轻人在屏幕、阅读和社交上花的时间更多，而年长一组锻炼略多。屏幕时间在两组中都是最高的——18–25 岁为每周九小时，26–40 岁为六小时。差距最大的是阅读：年轻人每周读六小时，而年长一组只有三小时。',
    checklist: ['第一句写 overall 总趋势', '用数字支撑（不要只写 many / few）', '用 while / whereas 做对比', '不写原因，不写个人观点'],
  },

  w4: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '这一组练「环境类」高频句式',
    lines: [
      { cn: '塑料袋对环境造成很大影响。', hints: ['plastic bags', 'have an impact on'], model: 'Plastic bags have a significant impact on the environment.' },
      { cn: '政府应该鼓励人们少开车。', hints: ['encourage', 'drive less'], model: 'The government should encourage people to drive less.' },
      { cn: '每年有数百万吨垃圾被倒进海里。', hints: ['millions of tonnes', 'dump'], model: 'Millions of tonnes of waste are dumped into the sea every year.' },
      { cn: '虽然回收很重要，但减少使用更有效。', hints: ['although', 'effective'], model: 'Although recycling is important, reducing consumption is more effective.' },
      { cn: '如果不采取措施，问题会变得更严重。', hints: ['take action', 'get worse'], model: 'If no action is taken, the problem will get worse.', note: 'If no action is taken 是被动语态的常用句式。' },
    ],
  },

  w5: {
    type: 'chart',
    title: '小作文：描述一张折线图',
    subtitle: 'Task 1 折线图：起点、终点、交叉点、极值',
    chart: {
      title: 'Share of households with internet access, 2000–2020',
      unit: '% of households',
      groups: ['Country A', 'Country B'],
      line: true,
      axis: [
        { label: '2000', v: [20, 5] },
        { label: '2005', v: [45, 15] },
        { label: '2010', v: [70, 40] },
        { label: '2015', v: [85, 65] },
        { label: '2020', v: [95, 88] },
      ],
    },
    tips: ['起点用 stood at / began at', '上升用 rose / increased steadily', '差距缩小用 the gap narrowed'],
    words: ['increase', 'significant', 'trend', 'proportion', 'compare', 'gradual'],
    model: 'The graph shows the percentage of households with internet access in two countries between 2000 and 2020. In country A, the figure rose steadily from 20% to 95%, while country B started much lower at 5% and grew more sharply after 2005. Although country A remained ahead throughout the period, the gap between the two narrowed considerably, from 25 percentage points in 2005 to just 7 in 2020.',
    modelZh: '该图显示 2000 至 2020 年间两个国家家庭互联网普及率的变化。A 国从 20% 稳步上升到 95%；B 国起点低得多，仅 5%，2005 年后增长更快。虽然 A 国始终领先，但两国差距明显缩小，从 2005 年的 25 个百分点降到 2020 年的 7 个百分点。',
    checklist: ['写清起止年份和单位', '描述趋势词（rise / grow / narrow）', '提到两组之间的关系或差距', '不加评论性原因'],
  },

  w6: {
    type: 'essay',
    title: '小作文 + 大作文提纲（二选一）',
    subtitle: '时间不够就只写提纲：观点、两个理由、一个例子',
    prompt: 'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?',
    outline: ['立场：部分同意（免费但设门槛）', '理由 1：机会平等，低收入家庭也能上大学', '理由 2：但完全免费会带来财政压力，可用奖学金代替', '例子：德国 / 北欧的模式与问题'],
    words: ['tuition', 'financial', 'equal', 'opportunity', 'government', 'benefit'],
    model: 'I partly agree that university education should be free. On the one hand, free tuition gives talented students from low-income families an equal opportunity to study, and a country benefits when more of its people are highly skilled. On the other hand, making all degrees free is extremely expensive, and the money may be better spent on scholarships for those who need them most. In Germany, for example, tuition is free, but universities have faced serious funding pressure. In short, support should target students in need rather than every student.',
    modelZh: '我部分同意大学教育应当免费。一方面，免学费让低收入家庭的优秀学生获得平等的求学机会，国民技能水平提升对国家也有益。另一方面，所有学位全免代价极高，这笔钱或许更适合用作给最需要者的奖学金。例如德国学费免费，但大学面临严重的经费压力。简言之，资助应针对有需要的学生，而不是所有学生。',
    checklist: ['立场明确（partly agree 也是立场）', '两个理由分正反', '有一个具体国家或研究的例子', '结尾不引入新观点'],
  },

  w7: {
    type: 'paragraph',
    title: '写一段「让步 + 反驳」',
    subtitle: '70–90 词；雅思 6 分段落的关键技能',
    prompt: 'Some people say technology makes us less social. Write one paragraph that admits one point in its favour, then argues against it.',
    structure: ['① 让步：It is true that …', '② 转折：However, …', '③ 反驳理由：…', '④ 例子或结论：…'],
    words: ['although', 'however', 'individual', 'face-to-face', 'impact', 'benefit'],
    model: 'It is true that smartphones can make people less social in some situations. It is common to see a group of friends sitting together, each looking at a screen instead of talking. However, this is a problem of how technology is used, not of technology itself. The same devices allow families in different countries to see each other every day, and they help shy people find communities they would never meet face to face. In my view, the impact depends on the habit, not the tool.',
    modelZh: '的确，手机在某些场合会让人变得不那么社交。常见几个朋友坐在一起，各自盯着屏幕而不交谈。然而，这是使用方式的问题，而非技术本身的问题。同样的设备让身处不同国家的家人每天都能见面，也能帮内向的人找到现实中难以接触的社群。在我看来，影响取决于习惯，而非工具。',
    checklist: ['第一句先承认对方有理（It is true that）', '用 However 明确转折', '反驳要有自己的理由，不只是重复', '结尾一句话收束'],
  },

  w8: {
    type: 'translate',
    title: '把 5 句中文写成英文',
    subtitle: '这一组练「健康与建议」句式',
    lines: [
      { cn: '睡眠不足会影响你的记忆和情绪。', hints: ['lack of sleep', 'affect'], model: 'A lack of sleep can affect your memory and your mood.' },
      { cn: '专家建议每天在同一时间睡觉。', hints: ['recommend', 'at the same time'], model: 'Experts recommend going to bed at the same time every day.' },
      { cn: '规律运动有助于减轻压力。', hints: ['regular exercise', 'reduce stress'], model: 'Regular exercise helps reduce stress.' },
      { cn: '与其熬夜，不如早点睡、早上再做。', hints: ['rather than', 'stay up late'], model: 'Rather than staying up late, you should go to bed early and finish it in the morning.' },
      { cn: '总的来说，小习惯比大改变更容易坚持。', hints: ['overall', 'stick to'], model: 'Overall, small habits are easier to stick to than big changes.', note: 'stick to sth = 坚持某事。' },
    ],
  },
};

const SPEAKING = {
  s1: {
    title: 'Part 1：Work or study',
    subtitle: '先答 3 句：直接回答 + 一个理由 + 一个小细节',
    questions: [
      { q: 'Do you work or are you a student?', tip: '直接说身份，再说专业/工作内容。' },
      { q: 'What do you like most about it?', tip: '说一个具体点，比如「能不断学到新东西」。' },
      { q: 'Would you like to change anything about it?', tip: '用 I wish / If I could, I would … 造句。' },
    ],
    model: 'I\'m a student at the moment. I\'m studying computer science, and I\'m in my final year. What I like most about it is that there\'s always something new to learn — for example, last term we built a small app from scratch. If I could change one thing, I\'d probably spend less time on exams and more time on real projects.',
    modelZh: '我现在是学生，读计算机专业，今年大四。我最喜欢的一点是总能学到新东西——比如上个学期我们从零做了一个小应用。如果我能改变一件事，我大概会减少考试、多花时间在真实项目上。',
    checks: ['没有背模板腔（不像念稿）', '每个问题答到 3 句左右', '用了 1 个具体例子', '语速平稳，没长时间卡顿'],
  },

  s2: {
    title: 'Part 2：Describe a place you like to study',
    subtitle: '1 分钟准备 → 说满 90 秒',
    card: {
      topic: 'Describe a place where you like to study.',
      points: ['where it is', 'what it looks like', 'what you usually do there', 'and explain why you like studying there'],
    },
    model: 'I\'d like to talk about a small café near my flat. It\'s about ten minutes away on foot, on a quiet street. It has maybe eight tables, a lot of plants, and the walls are covered with old books. I usually go there on Saturday mornings and work for two or three hours — reading, or writing up notes from the week. The reason I like it is that it\'s quiet but not silent. There\'s a low level of background noise, which actually helps me concentrate. At home, I get distracted by my phone and my bed. There, I order one coffee and I know I\'ll finish what I planned. It\'s also become a kind of ritual — going there tells my brain that it\'s time to work.',
    modelZh: '我想说我家附近的一家小咖啡馆，步行十分钟，在一条安静的街上。店里大概八张桌子，很多绿植，墙上摆满旧书。我通常周六早上去，待两三个小时，读书或者整理一周的笔记。我喜欢它的原因是它安静但不死寂，有一点背景噪音反而让我更专注。在家我会被手机和床分心；在那里，点一杯咖啡，我就知道今天计划的事能做完。它甚至成了一种仪式——去那里就像告诉大脑「该干活了」。',
    checks: ['四个提示点都覆盖到', '说到 90 秒左右', '有细节（距离、桌子、植物）', '结尾回答了 why'],
  },

  s3: {
    title: 'Part 3：Cities and transport',
    subtitle: 'Part 3 要「展开」，每个答案 4–5 句',
    questions: [
      { q: 'Why do so many people prefer to live in cities?', tip: '工作机会、医疗教育、社交生活。' },
      { q: 'How could cities encourage people to use public transport?', tip: '提高频率、降低票价、限制市中心停车。' },
      { q: 'Do you think cities will be more or less crowded in the future?', tip: '给一个判断 + 一个理由 + 一点让步。' },
    ],
    model: 'I think there are two main reasons. The first is economic — cities simply have more jobs, especially for young people. The second is convenience: hospitals, universities, shops and entertainment are all close together, so you don\'t need a car. To encourage public transport, I\'d start with frequency. People won\'t wait twenty minutes for a bus, but they will wait five. Cheaper tickets and fewer parking spaces in the centre would also help. As for the future, I suspect large cities will keep growing, though remote work may slow this down a little, because some people no longer need to live near their office.',
    modelZh: '我认为主要有两个原因。第一是经济——城市工作机会更多，尤其对年轻人。第二是便利：医院、大学、商店和娱乐都集中在一起，不需要开车。要鼓励公共交通，我会先从发车频率入手：没人愿意等二十分钟的公交，但五分钟可以。更低票价和减少市中心停车位也会有帮助。至于未来，我猜大城市会继续增长，不过远程工作可能会稍微减缓这一趋势，因为有些人不再需要住在办公室附近。',
    checks: ['每个问题都展开了（不是一句话结束）', '用 First / Second / As for 等连接词', '有让步（though / may）', '没有只背「万能句」'],
  },

  s4: {
    title: 'Part 2：Describe a healthy habit you have',
    subtitle: '1 分钟准备 → 说满 90 秒',
    card: {
      topic: 'Describe a healthy habit you have or would like to have.',
      points: ['what the habit is', 'when you started it', 'how it helps you', 'and explain how you keep it going'],
    },
    model: 'The habit I\'d like to talk about is walking after dinner. I started it about a year ago, when I realised I was sitting at a desk all day and sleeping badly. At first I just walked around the block for ten minutes, but now it\'s usually half an hour. It helps me in two ways. Physically, I feel less stiff, and I fall asleep faster. Mentally, it gives me time to think without a screen in front of me — I often work out problems from the day while I\'m walking. As for keeping it going, I\'ve made it very easy: I leave my shoes by the door, and I go at the same time every evening, so it doesn\'t require a decision. On rainy days I still go, just for ten minutes, because the routine matters more than the distance.',
    modelZh: '我想说的习惯是晚饭后散步。大约一年前开始的，那时我意识到自己整天坐在桌前、睡得很差。一开始只绕街区走十分钟，现在通常是半小时。它有两方面帮助：身体上没那么僵硬，也更容易入睡；心理上，它给了我不看屏幕的思考时间——我常在走路时想通白天的问题。至于坚持，我把它变得很容易：鞋子放在门口，每天固定时间出门，不需要做决定。下雨天我也走，只走十分钟，因为习惯本身比距离更重要。',
    checks: ['四个提示点都覆盖', '有「开始时 → 现在」的变化', '说了具体帮助（身体 + 心理）', '解释了怎么坚持'],
  },
};

  return { WRITING: WRITING, SPEAKING: SPEAKING };
})();

__M["assets/course.js"] = (function () {
/* =========================================================
   course.js · 28 天课程表
   每周 7 天：单词 6 个 + 阅读/听力 1 组 + 写作/口语 1 个，合计约 30 分钟。
   课程按「完成天数」解锁：做完第 1 天，第 2 天才变成「今天」。
   ========================================================= */

const { VOCAB } = __M["assets/data/vocab.js"];
const { READING } = __M["assets/data/reading.js"];
const { LISTENING } = __M["assets/data/listening.js"];
const { WRITING, SPEAKING } = __M["assets/data/tasks.js"];



const WEEKS = [
  {
    n: 1,
    title: '把地基打成习惯',
    theme: '教育 · 学习',
    goal: '认识 42 个学术高频词，学会用「观点 + 理由 + 例子」说话。',
    color: 'green',
  },
  {
    n: 2,
    title: '开始读懂世界',
    theme: '环境 · 城市',
    goal: '从短句过渡到段落阅读，学会抓主旨和数字细节。',
    color: 'sky',
  },
  {
    n: 3,
    title: '把句子写长',
    theme: '工作 · 科技',
    goal: '掌握让步、对比、因果三类句式，小作文不再只会罗列。',
    color: 'gold',
  },
  {
    n: 4,
    title: '连成一棵树',
    theme: '健康 · 社会',
    goal: '把前 21 天的词和句型串起来，做一次完整的口语与写作输出。',
    color: 'rose',
  },
];

const DAYS = [
  // ---------- 第 1 周：把地基打成习惯 ----------
  { d: 1, w: 1, title: '从「学习」开始的六个词', focus: '学术词 + 读懂一段话', words: [0, 6], read: 'r1', writing: 'w1', quote: '第一次坐下学习之前，谁都一样。' },
  { d: 2, w: 1, title: '校园里的六个场景', focus: '听力抓数字与细节', words: [6, 12], listen: 'l1', writing: 'w2', quote: '听得慢，是因为在逐词翻译。先听意思。' },
  { d: 3, w: 1, title: '评价类动词：assess / evaluate', focus: '把中文句子写对', words: [12, 18], read: 'r1', speak: 's1', quote: '写不出长句，往往是因为没有背过「骨架」。' },
  { d: 4, w: 1, title: '学习设施与校园生活', focus: '听力 + 数字', words: [18, 24], listen: 'l2', writing: 'w1', quote: '慢一点没关系，别停。' },
  { d: 5, w: 1, title: '成绩、讲座与第一周复盘', focus: '读 + 说各来一点', words: [24, 30], read: 'r1', speak: 's1', quote: '第一周的目标不是学很多，是每天坐够 30 分钟。' },
  { d: 6, w: 1, title: '研究与证据：学术写作常用词', focus: '听力 + 段落骨架', words: [30, 36], listen: 'l2', writing: 'w2', quote: '例子越具体，分数越稳。' },
  { d: 7, w: 1, title: '第一周收束：把词连成句子', focus: '本词表里的词全部复习一遍', words: [36, 42], read: 'r2', writing: 'w1', quote: '一周的积累，已经比昨天多 42 个词。' },

  // ---------- 第 2 周：开始读懂世界 ----------
  { d: 8, w: 2, title: '环境词开场：impact / consume', focus: '读 + 小作文总趋势', words: [42, 48], read: 'r2', writing: 'w3', quote: '图表作文第一句只写「总体」。' },
  { d: 9, w: 2, title: '城市与污染', focus: '听力抓数字', words: [48, 54], listen: 'l3', writing: 'w4', quote: '数字是听力最容易丢的分，也最容易练。' },
  { d: 10, w: 2, title: '资源、能源与政府', focus: '读环境长文', words: [54, 60], read: 'r2', speak: 's2', quote: '读完先问：作者想让我相信什么？' },
  { d: 11, w: 2, title: '交通与通勤', focus: '听力 + 环境句式', words: [60, 66], listen: 'l3', writing: 'w4', quote: '通勤是雅思听力永恒的场景。' },
  { d: 12, w: 2, title: '政策、禁止与鼓励', focus: '读 + 小作文对比', words: [66, 72], read: 'r1', writing: 'w3', quote: '对比句式 while / whereas 能救一整段。' },
  { d: 13, w: 2, title: '可持续与城市化', focus: '听力精听 + 听写', words: [72, 78], listen: 'l4', writing: 'w4', quote: '听写一句话，胜过听十遍。' },
  { d: 14, w: 2, title: '两周：树冠撑开了', focus: '复习 84 个词 + 综合输出', words: [78, 84], read: 'r2', speak: 's2', quote: '能坚持两周的人，已经不多。' },

  // ---------- 第 3 周：把句子写长 ----------
  { d: 15, w: 3, title: '工作与科技开场', focus: '读职场短文', words: [84, 90], read: 'r3', writing: 'w5', quote: 'Part 2 的秘诀：把抽象问题讲成一个画面。' },
  { d: 16, w: 3, title: '远程办公的两面', focus: '听力抓观点', words: [90, 96], listen: 'l4', writing: 'w6', quote: '听力问「态度」时，注意形容词。' },
  { d: 17, w: 3, title: '技术与媒体：trend / influence', focus: '读 + 折线图', words: [96, 102], read: 'r3', speak: 's3', quote: '折线图只讲三件事：起点、方向、差距。' },
  { d: 18, w: 3, title: '效率、隐私与选择', focus: '听力 + 让步句式', words: [102, 108], listen: 'l5', writing: 'w6', quote: '先承认对方一半，再反驳，段落立刻成熟。' },
  { d: 19, w: 3, title: '创新与基础设施', focus: '读 + 折线图', words: [108, 114], read: 'r3', writing: 'w5', quote: '不要背范文，要背「骨架词」。' },
  { d: 20, w: 3, title: '数据、比例与变化', focus: '听力精听 + 数字描述', words: [114, 120], listen: 'l5', writing: 'w7', quote: '小作文不要写原因，只写看到的东西。' },
  { d: 21, w: 3, title: '三周：开始开花', focus: '复习 126 个词 + 口语 Part 3', words: [120, 126], read: 'r3', speak: 's3', quote: '三周之后，你已经能听懂一段完整的话。' },

  // ---------- 第 4 周：连成一棵树 ----------
  { d: 22, w: 4, title: '健康开场：sleep / stress', focus: '读科普短文', words: [126, 132], read: 'r4', writing: 'w8', quote: '说得慢一点，清楚比流利更重要。' },
  { d: 23, w: 4, title: '睡眠与情绪', focus: '听力抓建议', words: [132, 138], listen: 'l6', writing: 'w8', quote: 'Part 3 不是知识考试，是「理由考试」。' },
  { d: 24, w: 4, title: '社会、社区与公共空间', focus: '读 + 让步段落', words: [138, 144], read: 'r4', speak: 's4', quote: '健康话题最容易犯的错：只说「多运动」。' },
  { d: 25, w: 4, title: '政府、预算与优先级', focus: '听力 + 建议句式', words: [144, 150], listen: 'l7', writing: 'w8', quote: '用数字和例子，代替 I think it is very important。' },
  { d: 26, w: 4, title: '文化与身份', focus: '读 + 完整输出', words: [150, 156], read: 'r4', writing: 'w7', quote: '把「我觉得」换成 It seems to me that …。' },
  { d: 27, w: 4, title: '综合复盘：四项各来一点', focus: '查漏补缺', words: [156, 162], listen: 'l8', writing: 'w8', quote: '最后两天，只做「输出」，不做新输入。' },
  { d: 28, w: 4, title: '最后一天：种成一棵树', focus: '完整复述一次你的学习计划', words: [162, 168], read: 'r4', speak: 's4', quote: '28 天不是终点，是你知道自己能做到的证明。' },
];

/* ---------------- 派生逻辑 ---------------- */

/** 一轮的长度。28 天之后不再结束，而是进入第 2 轮、第 3 轮…… */
const CYCLE_LEN = DAYS.length;

function allDays() { return DAYS; }

/** 第 lesson 天落在课程表的第几天（1–28） */
function courseDayOf(lesson) {
  const L = Math.max(1, Number(lesson) || 1);
  return ((L - 1) % CYCLE_LEN) + 1;
}

/** 第 lesson 天属于第几轮（从 1 开始） */
function cycleOf(lesson) {
  const L = Math.max(1, Number(lesson) || 1);
  return Math.floor((L - 1) / CYCLE_LEN) + 1;
}

/**
 * 第 lesson 天的课程信息。
 * lesson 从 1 开始，不设上限：29 天 = 第 2 轮的第 1 天。
 * cycle > 1 时 isReview = true，词和篇目都按「第二轮精学」展示，不再算新内容。
 */
function dayInfo(lesson) {
  const L = Math.max(1, Number(lesson) || 1);
  const cd = courseDayOf(L);
  const cycle = cycleOf(L);
  const d = DAYS[cd - 1];
  if (!d) return null;
  const w = WEEKS[d.w - 1];
  const words = VOCAB.slice(d.words[0], d.words[1]);
  return {
    id: 'd' + L,
    lesson: L,
    courseDay: cd,
    cycle: cycle,
    isReview: cycle > 1,
    d: L,
    week: d.w,
    weekTitle: w.title,
    weekTheme: w.theme,
    title: d.title,
    focus: d.focus,
    quote: d.quote,
    words: words,
    reading: d.read ? READING[d.read] : null,
    readingId: d.read || null,
    listening: d.listen ? LISTENING[d.listen] : null,
    listeningId: d.listen || null,
    writing: d.writing ? WRITING[d.writing] : null,
    writingId: d.writing || null,
    speaking: d.speak ? SPEAKING[d.speak] : null,
    speakingId: d.speak || null,
    minutes: 30,
  };
}

/** 今天该学第几天：完成数 + 1，不封顶（28 天后接着往后排） */
function candidateDay(completedCount) {
  return Math.max(1, completedCount + 1);
}

/** 轮次标签：第 1 轮不显示，第 2 轮起显示 */
function cycleLabel(info) {
  if (!info || !info.cycle || info.cycle < 2) return '';
  return '第 ' + info.cycle + ' 轮';
}

/** 今日任务清单（用于展示与分步练习） */
function taskList(info, vocabDue) {
  const tasks = [];
  tasks.push({
    key: 'vocab',
    name: '新词 6 个',
    desc: info.words.map(function (w) { return w.word; }).join(' · '),
    minutes: 8,
  });
  if (vocabDue > 0) {
    tasks.push({ key: 'review', name: '复习旧词 ' + vocabDue + ' 个', desc: '按记忆曲线到期', minutes: 5 });
  }
  if (info.reading) {
    tasks.push({ key: 'reading', name: '阅读：' + info.reading.title, desc: info.reading.questionCount ? '' : '4 道题 · 约 280 词', minutes: 9 });
  }
  if (info.listening) {
    tasks.push({ key: 'listening', name: '听力：' + info.listening.title, desc: '4 道题 + 2 句听写', minutes: 9 });
  }
  if (info.writing) {
    tasks.push({ key: 'writing', name: '写作：' + info.writing.title, desc: info.writing.subtitle, minutes: 10 });
  }
  if (info.speaking) {
    tasks.push({ key: 'speaking', name: '口语：' + info.speaking.title, desc: '开口说 60–90 秒', minutes: 8 });
  }
  return tasks;
}

/** 预计时长：按当天真实排了哪些环节算，不再固定加 5 分钟、也不再统一截到 34 */
function estimatedMinutes(info, dueCount) {
  if (!info) return 0;
  let m = 8;
  if (dueCount > 0) m += 5;
  if (info.reading) m += 9;
  if (info.listening) m += 9;
  if (info.writing) m += 10;
  if (info.speaking) m += 8;
  return m;
}

/** 从词库里取词（按 id） */
function wordById(id) {
  for (let i = 0; i < VOCAB.length; i++) if (VOCAB[i].id === id) return VOCAB[i];
  return null;
}

function wordRange(a, b) {
  return VOCAB.slice(a, b);
}

  return { VOCAB: VOCAB, READING: READING, LISTENING: LISTENING, WRITING: WRITING, SPEAKING: SPEAKING, WEEKS: WEEKS, CYCLE_LEN: CYCLE_LEN, allDays: allDays, courseDayOf: courseDayOf, cycleOf: cycleOf, dayInfo: dayInfo, candidateDay: candidateDay, cycleLabel: cycleLabel, taskList: taskList, estimatedMinutes: estimatedMinutes, wordById: wordById, wordRange: wordRange };
})();

__M["assets/tree.js"] = (function () {
/* =========================================================
   tree.js · 成长之树
   学习的「累积」在这里变成看得见的东西：
     - 总叶片数 = 学过的词数
     - 金边叶片 = 进入「牢记」的词
     - 树干粗细 / 枝条数量 / 冠层大小 = 完成天数
   ========================================================= */

const STAGES = [
  { id: 'seed', name: '种子', en: 'SEED', days: 0, desc: '还埋在土里，等第一次浇水。' },
  { id: 'sprout', name: '新芽', en: 'SPROUT', days: 1, desc: '第一次 30 分钟，破土了。' },
  { id: 'sapling', name: '树苗', en: 'SAPLING', days: 3, desc: '开始有自己的形状。' },
  { id: 'young', name: '小树', en: 'YOUNG TREE', days: 7, desc: '第一周结束，树冠撑开了。' },
  { id: 'grown', name: '繁茂', en: 'GROWING', days: 14, desc: '两周不断，枝头开始挂果。' },
  { id: 'bloom', name: '开花', en: 'BLOOM', days: 21, desc: '三周积累，已经很难被忽视。' },
  { id: 'full', name: '成树', en: 'FULL CANOPY', days: 28, desc: '28 天课程走完，一棵完整的树。' },
];

function stageOf(days) {
  let cur = STAGES[0];
  for (let i = 0; i < STAGES.length; i++) {
    if (days >= STAGES[i].days) cur = STAGES[i];
  }
  return cur;
}

function nextStageOf(days) {
  for (let i = 0; i < STAGES.length; i++) {
    if (days < STAGES[i].days) return STAGES[i];
  }
  return null;
}

/* ---------------- 确定性随机（同一棵树多次渲染位置不变） ---------------- */

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 固定种子洗牌：每次渲染顺序一致，避免叶子乱跳 */
function shuffle(arr) {
  const rand = rng(91357);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ---------------- 几何 ---------------- */

const GROUND_Y = 336;
const BASE_X = 200;

/** 按完成天数算生长度 0–1 */
function growth(days) {
  return Math.min(1, Math.max(0, days / 28));
}

/** 主干：随天数长高、变粗 */
function trunkPath(days) {
  const g = growth(days);
  const h = 86 + 154 * Math.pow(g, 0.82);   // 高度：第 1 天是一根小苗，28 天长到冠层
  const topY = GROUND_Y - h;
  const wBottom = 5.2 + 4.4 * g;
  const wTop = 2.4 + 1.4 * g;

  // 轻微弯曲，避免笔直死板
  const bendX = -4 * Math.sin(g * Math.PI);
  const midY = GROUND_Y - h * 0.55;

  const left = [
    'M', BASE_X - wBottom, GROUND_Y,
    'C', BASE_X - wBottom * 0.5, midY + 20, BASE_X + bendX - wTop * 1.4, midY - 10, BASE_X + bendX - wTop, topY,
  ].join(' ');
  const right = [
    'L', BASE_X + bendX + wTop, topY,
    'C', BASE_X + bendX + wTop * 1.5, midY - 10, BASE_X + wBottom * 0.5, midY + 20, BASE_X + wBottom, GROUND_Y,
  ].join(' ');
  return { d: left + ' ' + right + ' Z', topY: topY, h: h, bend: bendX, wTop: wTop };
}

/**
 * 递归长枝条：每一根都先向外、再向上翘起，末端分 2 叉。
 * 越大的树分叉越多、枝条越长。返回 path 段 + 末梢位置（叶子就长在末梢）。
 */
function buildLimbs(days, trunk) {
  const g = growth(days);
  const rand = rng(778812);
  const paths = [];
  const tips = [];

  // 分叉层数：第 1 天只有主干顶上的 2 根小枝，之后每过一段多一层
  const levels = days < 1 ? 0 : days < 4 ? 2 : days < 9 ? 3 : days < 16 ? 4 : 5;
  if (!levels) return { paths: paths, tips: tips };

  const topX = BASE_X + trunk.bend;
  const topY = trunk.topY;

  function limb(x, y, ang, len, w, depth) {
    const sx = x + Math.sin(ang) * len * 0.32 * 1.18;
    const sy = y - Math.cos(ang) * len * 0.32 * 0.9;
    const ex = x + Math.sin(ang * 1.12) * len * 1.18;
    const ey = y - Math.cos(ang * 1.12) * len * 0.9;
    paths.push({
      d: 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Q' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1),
      w: Math.max(1, w),
      depth: depth,
    });
    if (depth <= 1) {
      tips.push({ x: ex, y: ey, len: len, dir: Math.sin(ang) >= 0 ? 1 : -1, x0: x, y0: y });
      return;
    }
    const spread = (0.46 + rand() * 0.16) * (depth >= 3 ? 1 : 0.85);
    const shrink = depth >= 4 ? 0.60 : 0.68;
    limb(ex, ey, ang - spread, len * (shrink + rand() * 0.05), w * 0.6, depth - 1);
    limb(ex, ey, ang + spread * 0.9, len * (shrink - 0.03 + rand() * 0.07), w * 0.55, depth - 1);
  }

  // 主枝：顶端左右各一，第 3 天起主干中段再补左右各一
  const w0 = 1.9 + 1.4 * g;
  limb(topX, topY, -0.30 - rand() * 0.1, 48 + 50 * g, w0, levels);
  limb(topX, topY, 0.30 + rand() * 0.1, 48 + 50 * g, w0, levels);

  if (days >= 3) {
    const midY = topY + trunk.h * 0.22;
    limb(topX - 1, midY, -0.82 - rand() * 0.12, 44 + 44 * g, w0 * 0.8, levels - 1);
    limb(topX + 1, midY, 0.82 + rand() * 0.12, 44 + 44 * g, w0 * 0.8, levels - 1);
  }
  if (days >= 9) {
    const lowY = topY + trunk.h * 0.42;
    limb(topX, lowY, -1.12, 34 + 30 * g, w0 * 0.58, levels - 2);
    limb(topX, lowY, 1.12, 34 + 30 * g, w0 * 0.58, levels - 2);
  }
  return { paths: paths, tips: tips };
}

/** 叶片：沿枝条长成一簇簇 */
function leafSpots(tips, days) {
  const spots = [];
  const rand = rng(20261020);
  for (let i = 0; i < tips.length; i++) {
    const t = tips[i];
    // 沿枝条 35%–100% 的区段都长叶子，冠层中间才不会空
    for (let t2 = 0; t2 < 4; t2++) {
      const f = 0.34 + t2 * 0.22;
      const bx = (t.x0 || BASE_X) + (t.x - (t.x0 || BASE_X)) * f;
      const by = (t.y0 || t.y) + (t.y - (t.y0 || t.y)) * f;
      const cluster = 3 + Math.floor(rand() * 3);
      const r = 11 + Math.min(6, t.len * 0.07);
      for (let k = 0; k < cluster; k++) {
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand());
        spots.push({
          x: bx + Math.cos(ang) * rad * r,
          y: by + Math.sin(ang) * rad * r * 0.8,
          rot: rand() * 360,
          s: 0.8 + rand() * 0.45,
          hue: rand(),
        });
      }
    }
    // 末梢主簇
    const cluster = 6 + Math.floor(rand() * 3);
    const r = 14 + Math.min(8, t.len * 0.1);
    for (let k = 0; k < cluster; k++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand());
      spots.push({
        x: t.x + Math.cos(ang) * rad * r,
        y: t.y + Math.sin(ang) * rad * r * 0.82 - 4,
        rot: rand() * 360,
        s: 0.85 + rand() * 0.5,
        hue: rand(),
      });
    }
  }
  // 第 1–3 天生长期：在顶端补几片，让它像一棵小苗而不是一根杆
  if (days < 4) {
    const topY = GROUND_Y - (86 + 154 * Math.pow(Math.max(0, days) / 28, 0.82));
    for (let i = 0; i < 3; i++) {
      spots.push({
        x: 200 + (rand() - 0.5) * 18,
        y: topY + 4 + (rand() - 0.5) * 16,
        rot: rand() * 360,
        s: 1 + rand() * 0.3,
        hue: rand(),
      });
    }
  }
  // 按「从下到上」排序，叶片自下而上生长更自然
  spots.sort(function (a, b) { return b.y - a.y; });
  return spots;
}

const LEAF_PATH = 'M0 0 C 4.2 -6, 12.4 -5.6, 15 0 C 12.4 5.6, 4.2 6, 0 0 Z';
const LEAF_COLORS = ['#2f6b4f', '#3d8a63', '#4f9b6f', '#6cae84', '#437f5b', '#79b98d'];

function leafSvg(spot, i, mastered) {
  const color = LEAF_COLORS[Math.floor(spot.hue * LEAF_COLORS.length) % LEAF_COLORS.length];
  const stroke = mastered ? '#d3a143' : 'none';
  const sw = mastered ? 1.1 : 0;
  return (
    '<g class="leaf" transform="translate(' + spot.x.toFixed(1) + ' ' + spot.y.toFixed(1) + ') rotate(' + spot.rot.toFixed(0) + ')' +
    ' scale(' + (spot.s * 1.05 * (mastered ? 1.08 : 1)).toFixed(2) + ')">' +
    '<path d="' + LEAF_PATH + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="' + sw + '" opacity="' + (0.84 + spot.hue * 0.16).toFixed(2) + '"/>' +
    '<path d="M0.5 0 L14 0" stroke="rgba(255,255,255,.34)" stroke-width=".7"/>' +
    (mastered ? '<circle cx="16" cy="0" r="2.6" fill="#e2b45c" stroke="#a97a25" stroke-width=".6"/>' : '') +
    '</g>'
  );
}

/**
 * 生成整棵树的 SVG
 * @param {{days:number, words:number, mastered:number, rich?:boolean}} o
 */
function treeSvg(o) {
  const days = Math.max(0, o.days || 0);
  const words = Math.max(0, o.words || 0);
  const mastered = Math.max(0, Math.min(o.mastered || 0, words));
  const g = growth(days);
  const trunk = trunkPath(days);
  const limbs = buildLimbs(days, trunk);
  const spots = leafSpots(limbs.tips, days);

  // 冠层不能冲出画面：按实际末梢范围等比压缩枝条和叶片（树冠中心保持在主干附近）
  let minX = BASE_X, maxX = BASE_X, minY = trunk.topY;
  for (let i = 0; i < limbs.tips.length; i++) {
    const t = limbs.tips[i];
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.y < minY) minY = t.y;
  }
  const crownW = maxX - minX + 40;
  const crownH = GROUND_Y - minY + 40;
  const k = Math.min(1, 300 / crownH, 260 / crownW);

  // 「满叶」按当前树的大小来算：树越大，能放的叶子越多，进度感更细腻
  const wanted = Math.round(words * 5.2);
  const cap = Math.round(spots.length * (0.92 + 0.08 * g));
  const shown = Math.min(wanted, cap, spots.length);
  // 从下往上均匀填：在竖直方向上等距取样，再让每段内部随机，避免全挤在下面的枝条上
  const BANDS = 6;
  const bands = [];
  for (let b = 0; b < BANDS; b++) bands.push([]);
  for (let i = 0; i < spots.length; i++) {
    let b = Math.floor(((spots[i].y - minY) / Math.max(1, GROUND_Y - minY)) * BANDS);
    if (b < 0) b = 0;
    if (b > BANDS - 1) b = BANDS - 1;
    bands[b].push(i);
  }
  for (let b = 0; b < BANDS; b++) shuffle(bands[b]);
  const order = [];
  // 每一轮从各层各取一小把（3 片），单薄时也不至于只长在一条横线上
  let maxLen = 0;
  for (let b = 0; b < BANDS; b++) if (bands[b].length > maxLen) maxLen = bands[b].length;
  for (let row = 0; row < maxLen; row++) {
    for (let b = BANDS - 1; b >= 0; b--) {
      for (let q = 0; q < 3; q++) {
        const idx = row * 3 + q;
        if (bands[b][idx] !== undefined) order.push(bands[b][idx]);
      }
    }
  }
  const picked = order.slice(0, shown);
  // 金叶（牢记）打散到整棵树，而不是聚成一堆
  const masteredSet = {};
  const mOrder = [];
  for (let q = 0; q < picked.length; q++) mOrder.push(q);
  shuffle(mOrder);
  for (let q = 0; q < Math.min(mastered, mOrder.length); q++) masteredSet[mOrder[q]] = true;
  const leaves = [];
  for (let q = 0; q < picked.length; q++) {
    leaves.push(leafSvg(spots[picked[q]], q, !!masteredSet[q]));
  }

  const trunkColor = days >= 14 ? '#5a4330' : days >= 3 ? '#6b5340' : '#7a6550';
  const trunkWidth = trunk.h > 230 ? 1.6 : 1.2;

  const branchSvg = limbs.paths.map(function (b) {
    return '<path d="' + b.d + '" stroke="' + trunkColor + '" stroke-width="' + b.w.toFixed(2) + '" fill="none" stroke-linecap="round"/>';
  }).join('');
  const ground =
    '<ellipse cx="200" cy="' + (GROUND_Y + 2) + '" rx="150" ry="21" fill="url(#gShadow)"/>' +
    '<path d="M54 ' + GROUND_Y + ' Q 200 ' + (GROUND_Y - 20) + ' 346 ' + GROUND_Y + ' L353 ' + (GROUND_Y + 30) + ' L47 ' + (GROUND_Y + 30) + ' Z" fill="url(#gSoil)"/>' +
    '<path d="M92 ' + (GROUND_Y - 2) + ' q 4 -9 8 0 M112 ' + (GROUND_Y + 1) + ' q 5 -11 9 -1 M282 ' + (GROUND_Y - 3) + ' q 4 -10 8 -1 M304 ' + (GROUND_Y) + ' q 5 -12 9 -2" stroke="#6cae84" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".55"/>';

  const seed =
    days < 1
      ? '<g class="seed">' +
        '<ellipse cx="200" cy="' + (GROUND_Y - 4) + '" rx="8.5" ry="10" fill="#6f5a44"/>' +
        '<ellipse cx="197" cy="' + (GROUND_Y - 7) + '" rx="3" ry="4.4" fill="#8d7359" opacity=".7"/>' +
        '<path d="M200 ' + (GROUND_Y - 12) + ' q 1 -22 6 -30" stroke="#4f9b6f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M206 ' + (GROUND_Y - 40) + ' q -15 -2 -19 -13 q 15 -1 19 13 Z" fill="#6cae84"/>' +
        '<path d="M206 ' + (GROUND_Y - 40) + ' q 13 -4 16 -15 q -13 2 -16 15 Z" fill="#4f9b6f"/>' +
        '<circle cx="212" cy="' + (GROUND_Y - 44) + '" r="1.8" fill="#e2b45c"/>' +
        '</g>'
      : '';

  const cls = o.rich ? 'tree rich' : 'tree';

  return (
    '<svg class="' + cls + '" viewBox="0 0 400 400" preserveAspectRatio="xMidYMax meet" role="img" aria-label="成长之树：已完成 ' + days + ' 天，学会 ' + words + ' 个词">' +
    '<defs>' +
    '<radialGradient id="gShadow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#2f6b4f" stop-opacity=".26"/><stop offset="100%" stop-color="#2f6b4f" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="gSoil" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#b9a888"/><stop offset="100%" stop-color="#a08d6c"/>' +
    '</linearGradient>' +
    '<linearGradient id="gTrunk" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0%" stop-color="' + trunkColor + '"/><stop offset="100%" stop-color="#8a7159"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<g class="ground">' + ground + '</g>' +
    '<g class="tree-body" transform="translate(' + BASE_X + ' ' + GROUND_Y + ') scale(' + k.toFixed(3) + ') translate(' + (-BASE_X) + ' ' + (-GROUND_Y) + ')">' +
    (days < 1 ? '' :
      '<g class="trunk"><path d="' + trunk.d + '" fill="url(#gTrunk)" stroke="' + trunkColor + '" stroke-width="' + trunkWidth + '"/>' +
      '<path d="M' + (BASE_X - 1) + ' ' + (GROUND_Y - 6) + ' C ' + (BASE_X - 4) + ' ' + (GROUND_Y - trunk.h * 0.4) + ', ' + (BASE_X + trunk.bend - 1) + ' ' + (GROUND_Y - trunk.h * 0.7) + ', ' + (BASE_X + trunk.bend) + ' ' + (GROUND_Y - trunk.h) +
      '" stroke="rgba(255,255,255,.18)" stroke-width="1.6" fill="none"/></g>') +
    '<g class="branches">' + branchSvg + '</g>' +
    '<g class="canopy">' + leaves.join('') + '</g>' +
    '</g>' +
    seed +
    '</svg>'
  );
}

/** 把树挂到容器并让新叶逐片长出来 */
function mountTree(el, opts, animateNew) {
  const before = el.querySelectorAll('.leaf').length;
  el.innerHTML = treeSvg(opts);
  const leaves = el.querySelectorAll('.leaf');
  const total = leaves.length;
  const start = animateNew ? Math.min(before, total) : 0;
  for (let i = 0; i < total; i++) {
    const lf = leaves[i];
    if (i >= start) {
      lf.style.opacity = '0';
      const delay = animateNew ? 60 + (i - start) * 26 : Math.min(700, i * 8);
      setTimeout(makeAppear(lf, delay), delay);
    }
  }
  return total;
}

function makeAppear(lf, delay) {
  return function () {
    lf.style.transition = 'opacity .5s ease ' + Math.min(300, delay * 0.2) + 'ms';
    lf.style.opacity = '';
  };
}

/** 一片叶子从底部飞进树里（学习完成时的反馈） */
function flyLeaf(x, y) {
  const el = document.createElement('div');
  el.className = 'leaf-fly';
  el.textContent = '🍃';
  el.style.left = (x || window.innerWidth / 2) + 'px';
  el.style.top = (y || window.innerHeight * 0.6) + 'px';
  el.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
  el.style.setProperty('--dy', (-90 - Math.random() * 60).toFixed(0) + 'px');
  el.style.setProperty('--rot', (Math.random() * 120 - 60).toFixed(0) + 'deg');
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1200);
}

  return { STAGES: STAGES, stageOf: stageOf, nextStageOf: nextStageOf, treeSvg: treeSvg, mountTree: mountTree, flyLeaf: flyLeaf };
})();

__M["assets/speech.js"] = (function () {
/* =========================================================
   speech.js · 发音（浏览器语音合成）
   为什么单独一个模块：
   1. 口音要能切换（美音 / 英音 / 澳音），偏好要记住；
   2. 光设 u.lang='en-US' 不够——浏览器会用「默认音色」念，
      而默认音色常常是本地那套最差的，听起来就不像美音。
      必须从语音列表里按质量挑一个。

   IELTS 听说读写都接受不同口音，但学单词时固定一种更利于形成语感，
   所以默认美音，可随时切。
   ========================================================= */

const ACCENT_KEY = 'ielts-daily:accent';

const ACCENTS = [
  { k: 'us', label: '美音', lang: 'en-US' },
  { k: 'uk', label: '英音', lang: 'en-GB' },
  { k: 'au', label: '澳音', lang: 'en-AU' },
];

let current = 'us';
try {
  const saved = localStorage.getItem(ACCENT_KEY);
  if (saved && ACCENTS.some(function (a) { return a.k === saved; })) current = saved;
} catch (e) { /* 存储不可用就用默认美音 */ }

/** 兼容数据里写的 GB / AU 这类大写口音标记 */
function normAccent(k) {
  const s = String(k || '').toLowerCase();
  if (s === 'gb' || s === 'uk' || s === 'en-gb' || s === 'british') return 'uk';
  if (s === 'us' || s === 'en-us' || s === 'american') return 'us';
  if (s === 'au' || s === 'en-au' || s === 'australian') return 'au';
  return current;
}

/**
 * 给音色打分：同语言优先，其次本地音色（延迟低、更稳），
 * 再其次名字里带 natural / neural / google 这类高质量音色。
 * 名字里带 compact / espeak 的是低质量合成音，直接压下去。
 */
function scoreVoice(v, accent) {
  const lang = String(v.lang || '').toLowerCase().replace('_', '-');
  const want = ACCENTS.find(function (a) { return a.k === accent; });
  if (!want) return -1;
  if (lang.indexOf('en') !== 0) return -1;

  let s = 0;
  if (lang === want.lang.toLowerCase()) s += 100;
  else s += 15;                                  // 其他英语变体做兜底
  if (v.localService) s += 30;
  if (/natural|neural|premium|enhanced|google/i.test(v.name)) s += 25;
  if (/samantha|aria|jenny|michelle|ava|allison|zira|emma|karen|moira/i.test(v.name)) s += 8;
  if (/compact|espeak|pico/i.test(v.name)) s -= 40;
  if (v.default) s += 5;
  return s;
}

function rank(voices, accent) {
  return voices
    .map(function (v) { return { v: v, s: scoreVoice(v, accent) }; })
    .filter(function (x) { return x.s >= 0; })
    .sort(function (a, b) { return b.s - a.s; })
    .map(function (x) { return x.v; });
}

const Speech = {
  supported: !!(window.speechSynthesis && window.SpeechSynthesisUtterance),
  voices: [],
  ranked: { us: [], uk: [], au: [] },
  ready: false,
  lastError: null,

  init: function () {
    if (!this.supported) return;
    const self = this;
    const pick = function () {
      const vs = window.speechSynthesis.getVoices() || [];
      if (!vs.length) return;
      self.voices = vs;
      self.ranked = { us: rank(vs, 'us'), uk: rank(vs, 'uk'), au: rank(vs, 'au') };
      self.ready = true;
    };
    pick();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', pick);
    } else {
      window.speechSynthesis.onvoiceschanged = pick;
    }
    // 有些浏览器要等一会才有列表
    setTimeout(pick, 400);
    setTimeout(pick, 1500);
  },

  getAccent: function () { return current; },

  setAccent: function (k) {
    const a = normAccent(k);
    if (!ACCENTS.some(function (x) { return x.k === a; })) return false;
    current = a;
    try { localStorage.setItem(ACCENT_KEY, a); } catch (e) { /* ignore */ }
    return true;
  },

  accentMeta: function () {
    return ACCENTS.find(function (a) { return a.k === current; }) || ACCENTS[0];
  },

  /** 当前口音实际会用的音色（可能为 null，说明系统没有对应口音） */
  voiceFor: function (accent) {
    const list = this.ranked[normAccent(accent)] || [];
    return list.length ? list[0] : null;
  },

  /** 该口音是否真的有本语音色（不是拿别的口音凑数） */
  hasNative: function (accent) {
    const v = this.voiceFor(accent);
    if (!v) return false;
    const want = (ACCENTS.find(function (a) { return a.k === normAccent(accent); }) || ACCENTS[0]).lang;
    return String(v.lang || '').toLowerCase().replace('_', '-') === want.toLowerCase();
  },

  speak: function (text, opts) {
    if (!this.supported) return null;
    const o = opts || {};
    const accent = normAccent(o.accent || current);
    const meta = ACCENTS.find(function (a) { return a.k === accent; }) || ACCENTS[0];
    if (!this.ready) this.init();

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = meta.lang;
    u.rate = o.rate || 0.92;
    u.pitch = o.pitch || 1;
    u.volume = o.volume === undefined ? 1 : o.volume;

    const v = this.voiceFor(accent);
    if (v) u.voice = v;
    u.onend = o.onend || null;
    u.onstart = o.onstart || null;
    u.onerror = function (e) {
      Speech.lastError = e && e.error;
      if (o.onend) o.onend();
    };
    window.speechSynthesis.speak(u);
    return u;
  },

  /** 单词朗读：比句子稍慢一点，让音素听得清 */
  sayWord: function (word, opts) {
    return this.speak(word, Object.assign({ rate: 0.88 }, opts || {}));
  },

  stop: function () {
    if (this.supported) window.speechSynthesis.cancel();
  },
};

Speech.init();

  return { ACCENTS: ACCENTS, Speech: Speech };
})();

__M["assets/drills.js"] = (function () {
/* =========================================================
   drills.js · 练习引擎
   五种练习：词汇卡 / 阅读 / 听力 / 写作 / 口语
   每个 render 函数拿到 (host, ctx)，完成时调用 ctx.finish(result)
   ========================================================= */

const { rateWord, recordAnswer, recordSelf, wordState, addXp, ymd, SELF_RATINGS } = __M["assets/store.js"];
const { wordById } = __M["assets/course.js"];
const { flyLeaf } = __M["assets/tree.js"];

/* ---------------- 小工具 ---------------- */

function el(tag, attrs, html) {
  const e = document.createElement(tag);
  if (attrs) {
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
  }
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function clear(host) { host.innerHTML = ''; }

function kicker(tagText, tagClass, stepText) {
  return '<div class="step-kicker">' + (tagText ? '<span class="tag ' + (tagClass || '') + '">' + esc(tagText) + '</span>' : '') +
    (stepText ? '<span>' + esc(stepText) + '</span>' : '') + '</div>';
}

/** 高亮 [[词]] */
function richText(text) {
  return esc(text).replace(/\[\[(.+?)\]\]/g, '<em>$1</em>');
}

/* ---------------- 语音合成 ---------------- */

// 口音选择、音色挑选都在 speech.js 里（默认美音，可切英音/澳音）
const { Speech } = __M["assets/speech.js"];

/* ---------------- 通用底栏 ---------------- */

function foot(host, left, rightHtml, opts) {
  const f = el('div', { class: 'step-foot' });
  f.innerHTML = '<div class="hint">' + (left || '') + '</div><div class="foot-right">' + (rightHtml || '') + '</div>';
  host.appendChild(f);
  if (opts && opts.onEnter) {
    // Esc 由 session 统一处理
  }
  return f;
}

function primaryBtn(label, onclick, extraClass) {
  const b = el('button', { class: 'btn primary ' + (extraClass || ''), type: 'button', text: label });
  b.addEventListener('click', onclick);
  return b;
}

/**
 * 自评三档（写作 / 口语专用）。
 * 没有评分器时，写作和口语不能用「点了就算对」来记分——那只会把分数刷成假的。
 * 唯一可信的信号是「你自己判断这次到不到位」，所以强制先自评，再进下一步。
 * onPick(ratingKey) 里由调用方去做 recordSelf。
 */
function selfRateRow(ctx, skill, onPick) {
  const wrap = el('div', { class: 'self-rate' });
  const title = el('p', { class: 'self-rate-title', text: '这次写得/说得怎么样？（自评决定这次记不记分）' });
  wrap.appendChild(title);
  const row = el('div', { class: 'self-rate-row' });
  let picked = false;

  SELF_RATINGS.forEach(function (r) {
    const b = el('button', {
      class: 'rate-btn rate-' + r.k,
      type: 'button',
    }, '<b>' + esc(r.label) + '</b><span>' + esc(r.desc) + '</span>');
    b.addEventListener('click', function () {
      if (picked) return;
      picked = true;
      // 选完就把三档锁住：否则另外两档看起来还能点，点了却什么都不发生
      row.querySelectorAll('.rate-btn').forEach(function (x) { x.classList.remove('on'); x.disabled = true; });
      b.classList.add('on');
      recordSelf(ctx.state, skill, r.k);
      if (r.k === 'good') ctx.addXp(6);
      else if (r.k === 'mid') ctx.addXp(3);
      ctx.bumpProgress();
      onPick(r.k);
    });
    row.appendChild(b);
  });

  wrap.appendChild(row);
  return wrap;
}

/* =========================================================
   1. 词汇卡
   ========================================================= */

function renderVocab(host, ctx, opts) {
  const list = (opts && opts.words) || [];
  const isReview = !!(opts && opts.review);
  const words = list.map(function (id) { return wordById(id); }).filter(Boolean);
  let idx = 0;
  let revealed = false;
  const stats = { good: 0, mid: 0, bad: 0 };

  if (!words.length) {
    host.innerHTML = '<div class="step-inner"><div class="step-done"><h2>今天没有到期要复习的词</h2><p>这是好事，说明记忆曲线跟得上。</p></div></div>';
    const b = primaryBtn('继续', function () { ctx.finish({ xp: 0 }); }, 'lg');
    host.querySelector('.step-done').appendChild(b);
    return;
  }

  const inner = el('div', { class: 'step-inner' });
  host.appendChild(inner);

  function draw() {
    clear(inner);
    const w = words[idx];
    const st = wordState(ctx.state, w.id);
    const isNew = !st.seen;

    inner.innerHTML =
      kicker(isReview ? '复习' : '新词', isReview ? 'gold' : '', (idx + 1) + ' / ' + words.length + ' · ' + (isNew ? '第一次见' : '第 ' + (st.seen + 1) + ' 次复习')) +
      '<h2 class="step-title">' + (isReview ? '看英文，回想意思' : '先记住它长什么样') + '</h2>' +
      '<p class="step-sub">' + (isReview ? '想不起来也没关系，点「忘了」它明天还会来。' : '看词 → 听音 → 猜意思 → 翻开。') + '</p>';

    const card = el('div', { class: 'vocab-card' });
    card.innerHTML =
      '<div class="vc-word">' + esc(w.word) + '</div>' +
      '<div class="vc-ipa"><span>' + esc(w.ipa) + '</span>' +
      '<button class="speak-btn" type="button" aria-label="朗读单词">' +
      '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a9 9 0 0 1 0 12"/></svg></button>' +
      '<span class="tag plain">' + esc(w.tag) + '</span></div>' +
      '<div class="vc-hidden" id="vc-body"></div>';

    const body = card.querySelector('#vc-body');
    body.innerHTML = '<div class="vc-mask"><p>先自己想一想，再翻开</p><button class="btn" type="button" id="vc-show">看释义</button></div>';

    card.querySelector('.speak-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      Speech.sayWord(w.word);
      this.classList.add('playing');
      const self = this;
      setTimeout(function () { self.classList.remove('playing'); }, 1200);
    });

    card.querySelector('#vc-show').addEventListener('click', function () {
      revealed = true;
      const exHtml = esc(w.example).replace(new RegExp('\\b(' + w.word.split(' ').map(function (x) { return x.replace(/[^a-z]/gi, ''); }).filter(Boolean).join('|') + ')\\w*', 'gi'), '<em>$1</em>');
      body.innerHTML =
        '<div class="vc-reveal">' +
        '<span class="vc-pos">' + esc(w.pos) + '</span>' +
        '<div class="vc-zh">' + esc(w.zh) + '</div>' +
        '<div class="vc-ex">' + exHtml + '</div>' +
        '<div class="vc-ex-zh">' + esc(w.exampleZh) + '</div>' +
        '<div class="vc-tagline"><span class="tag">' + esc(w.tag) + '</span><span class="grow-hint">' + (isNew ? '学会它，树的冠层就密一点' : '想起它，叶片会变成金色') + '</span></div>' +
        '</div>';
      drawAnswer();
    });

    inner.appendChild(card);

    if (isReview) {
      // 复习卡先翻面，再评分；新词卡也支持先看答案
      card.querySelector('#vc-show').click();
    } else {
      foot(inner, '先想一想，再点「看释义」', '');
    }
  }

  function drawAnswer() {
    const w = words[idx];
    const isNew = !wordState(ctx.state, w.id).seen;
    const old = inner.querySelector('.answer-row');
    if (old) old.remove();
    const oldFoot = inner.querySelector('.step-foot');
    if (oldFoot) oldFoot.remove();

    const row = el('div', { class: 'answer-row' });
    row.innerHTML =
      '<button class="ans-btn bad" data-r="bad" type="button">忘了<span>明天再来</span></button>' +
      '<button class="ans-btn mid" data-r="mid" type="button">有点印象<span>过几天再见</span></button>' +
      '<button class="ans-btn good" data-r="good" type="button">记住了<span>拉长间隔</span></button>';
    row.querySelectorAll('.ans-btn').forEach(function (b) {
      b.addEventListener('click', function () { rate(b.getAttribute('data-r')); });
    });
    inner.appendChild(row);

    foot(inner, isNew ? '按 <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> 也能评价' : '复习不扣分，只调整下次出现的时间', '');

    inner._rate = rate;
  }

  function rate(r) {
    const w = words[idx];
    if (!w) return;
    const st = wordState(ctx.state, w.id);
    const isNew = !st.seen;
    rateWord(ctx.state, w.id, r);
    ctx.markWord(w.id, r);
    stats[r] += 1;

    let gained = 0;
    if (isNew) {
      gained = r === 'bad' ? 2 : 8;
    } else {
      gained = r === 'good' ? 6 : r === 'mid' ? 4 : 2;
    }
    addXp(ctx.state, gained);
    ctx.addXp(gained);
    if (r !== 'bad') {
      const rect = inner.getBoundingClientRect();
      flyLeaf(rect.left + rect.width / 2, rect.top + 40);
    }

    idx += 1;
    revealed = false;
    if (idx >= words.length) {
      const withXp = isReview
        ? '复习了 ' + words.length + ' 个词，其中 ' + stats.good + ' 个记得牢。'
        : '今天的 6 个词都过了一遍，' + stats.good + ' 个记住了。';
      ctx.finish({ xp: 0, summary: withXp, stats: stats });
      return;
    }
    draw();
  }

  // 键盘 1/2/3
  const keys = function (e) {
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const map = { '1': 'bad', '2': 'mid', '3': 'good' };
      const btn = inner.querySelector('.ans-btn[data-r="' + map[e.key] + '"]');
      if (btn) { e.preventDefault(); btn.click(); }
    } else if (e.key === ' ' || e.key === 'Enter') {
      const show = inner.querySelector('#vc-show');
      if (show) { e.preventDefault(); show.click(); }
    }
  };
  document.addEventListener('keydown', keys);
  ctx.onCleanup(function () { document.removeEventListener('keydown', keys); Speech.stop(); });

  draw();
  ctx.setTotal(words.length);
}

/* =========================================================
   2. 阅读
   ========================================================= */

function renderReading(host, ctx, passage) {
  const inner = el('div', { class: 'step-inner' });
  host.appendChild(inner);
  const qs = passage.questions;
  let qi = 0;
  let shown = 0;
  const results = [];

  function draw() {
    clear(inner);
    const q = qs[qi];
    inner.innerHTML =
      kicker('阅读', 'sky', (qi + 1) + ' / ' + qs.length) +
      '<h2 class="step-title">' + esc(passage.title) + '</h2>' +
      '<p class="step-sub">' + esc(passage.cn) + ' · ' + passage.words + ' 词 · 难度 ' + esc(passage.level) + ' · 关键词已高亮</p>';

    const art = el('div', { class: 'q-passage' });
    for (let i = 0; i < passage.text.length; i++) {
      const p = el('p', null, richText(passage.text[i]));
      art.appendChild(p);
    }
    inner.appendChild(art);

    const panel = el('div', { class: 'q-panel' });
    panel.innerHTML =
      '<div class="q-stem"><span class="q-no">Q' + (qi + 1) + '.</span>' + esc(q.q) + '</div>' +
      '<div class="q-opts">' + q.opts.map(function (o, i) {
        return '<button class="opt" data-i="' + i + '" type="button"><span class="o-key">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="fb-slot"></div>';

    panel.querySelectorAll('.opt').forEach(function (b) {
      b.addEventListener('click', function () {
        if (panel._answered) return;
        panel._answered = true;
        const pick = Number(b.getAttribute('data-i'));
        const ok = pick === q.a;
        results.push(ok);
        recordAnswer(ctx.state, ok, 'reading');
        if (ok) { ctx.addXp(6); }
        panel.querySelectorAll('.opt').forEach(function (x, i) {
          if (i === q.a) x.classList.add('correct');
          else if (i === pick) x.classList.add('wrong');
          else x.classList.add('dim');
          x.disabled = true;
        });
        const slot = panel.querySelector('.fb-slot');
        slot.innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '答对了。' : '正确答案是 ' + 'ABCD'[q.a] + '。') + '</b> ' + esc(q.why) + '</div>';
        const b2 = primaryBtn(qi + 1 < qs.length ? '下一题' : '完成阅读', function () {
          if (qi + 1 < qs.length) { qi += 1; draw(); }
          else finish();
        }, 'sm');
        b2.style.marginTop = '12px';
        slot.appendChild(b2);
        ctx.bumpProgress();
      });
    });
    inner.appendChild(panel);
    ctx.setTotal(qs.length);
  }

  function finish() {
    const right = results.filter(Boolean).length;
    ctx.finish({ xp: 0, summary: '阅读 4 题答对 ' + right + ' 题。' + (right >= 3 ? '理解得不错。' : '把错题的原文句再读一遍。') });
  }

  draw();
}

/* =========================================================
   3. 听力
   ========================================================= */

function renderListening(host, ctx, lesson) {
  const inner = el('div', { class: 'step-inner' });
  host.appendChild(inner);
  const qs = lesson.questions;
  let qi = 0;
  let playing = false;
  let currentUtt = null;
  const results = [];
  let transcriptShown = false;

  function stopAudio() {
    Speech.stop();
    playing = false;
  }
  ctx.onCleanup(stopAudio);

  function playScript(onEnd) {
    const seq = lesson.script;
    let i = 0;
    let pending = false;
    playing = true;
    function next() {
      if (!playing) return;
      if (i >= seq.length) {
        playing = false;
        if (onEnd) onEnd();
        return;
      }
      const line = seq[i];
      i += 1;
      pending = true;
      const fallback = 900 + line.t.length * 95;
      const guard = setTimeout(function () {
        if (pending && playing) { pending = false; next(); }
      }, fallback);
      currentUtt = Speech.speak(line.t, {
        accent: lesson.accent,
        rate: 0.9,
        pitch: line.s !== 'Speaker' && line.s !== 'Interviewer' ? 1.04 : 0.98,
        onend: function () {
          if (!pending) return;
          pending = false;
          clearTimeout(guard);
          setTimeout(next, 240);
        },
      });
    }
    next();
  }

  function audioPanel() {
    const wrap = el('div', { class: 'audio-panel' });
    wrap.innerHTML =
      '<div class="a-title">' + esc(lesson.title) + '</div>' +
      '<div class="a-sub">' + esc(lesson.cn) + ' · ' + (lesson.style === 'dialogue' ? '对话' : '独白') + ' · ' + (lesson.accent === 'US' ? '美音' : lesson.accent === 'AU' ? '澳音' : '英音') + '</div>' +
      (Speech.supported
        ? '<button class="play-big" type="button" aria-label="播放录音"><svg class="ico-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg></button>' +
          '<div class="audio-controls"><button class="chip-btn on" data-rate="0.9" type="button">正常</button><button class="chip-btn" data-rate="0.75" type="button">慢速</button></div>' +
          '<div class="audio-note">用浏览器语音合成朗读 · 没有声卡也能用</div>'
        : '<div class="audio-note" style="margin-top:20px">当前浏览器不支持语音合成，可以点下方「看原文」。</div>');

    const big = wrap.querySelector('.play-big');
    let rate = 0.9;
    if (big) {
      big.addEventListener('click', function () {
        if (playing) {
          stopAudio();
          big.classList.remove('playing');
          big.innerHTML = '<svg class="ico-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
        } else {
          big.classList.add('playing');
          big.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
          playScript(function () {
            big.classList.remove('playing');
            big.innerHTML = '<svg class="ico-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
          });
        }
      });
      wrap.querySelectorAll('.chip-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          rate = Number(b.getAttribute('data-rate'));
          wrap.querySelectorAll('.chip-btn').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          if (playing) { stopAudio(); big.click(); }
        });
      });
    }
    return wrap;
  }

  function draw() {
    clear(inner);
    const q = qs[qi];
    inner.innerHTML =
      kicker('听力', 'gold', (qi + 1) + ' / ' + qs.length) +
      '<h2 class="step-title">先听一遍，再做题</h2>' +
      '<p class="step-sub">听不懂就先抓关键词：数字、地点、转折词 but / however。</p>';
    inner.appendChild(audioPanel());

    const toggle = el('div', { class: 'step-foot', style: 'border-top:0;padding-top:10px' });
    toggle.innerHTML = '<button class="chip-btn" type="button" id="btn-tr">看原文</button><span class="hint">建议做完题再看</span>';
    inner.appendChild(toggle);

    const tr = el('div', { class: 'transcript', hidden: '' });
    tr.innerHTML = '<h4>听力原文</h4>' + lesson.script.map(function (l) {
      return '<p><b>' + esc(l.s) + ':</b> ' + esc(l.t) + '</p>';
    }).join('');
    inner.appendChild(tr);
    toggle.querySelector('#btn-tr').addEventListener('click', function () {
      transcriptShown = !transcriptShown;
      if (transcriptShown) tr.removeAttribute('hidden'); else tr.setAttribute('hidden', '');
      this.textContent = transcriptShown ? '收起原文' : '看原文';
    });

    const panel = el('div', { class: 'q-panel' });
    panel.innerHTML =
      '<div class="q-stem"><span class="q-no">Q' + (qi + 1) + '.</span>' + esc(q.q) + '</div>' +
      '<div class="q-opts">' + q.opts.map(function (o, i) {
        return '<button class="opt" data-i="' + i + '" type="button"><span class="o-key">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></button>';
      }).join('') + '</div><div class="fb-slot"></div>';

    panel.querySelectorAll('.opt').forEach(function (b) {
      b.addEventListener('click', function () {
        if (panel._answered) return;
        panel._answered = true;
        const pick = Number(b.getAttribute('data-i'));
        const ok = pick === q.a;
        results.push(ok);
        recordAnswer(ctx.state, ok, 'listening');
        if (ok) ctx.addXp(6);
        panel.querySelectorAll('.opt').forEach(function (x, i) {
          if (i === q.a) x.classList.add('correct');
          else if (i === pick) x.classList.add('wrong');
          else x.classList.add('dim');
          x.disabled = true;
        });
        panel.querySelector('.fb-slot').innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '答对了。' : '正确答案是 ' + 'ABCD'[q.a] + '。') + '</b> ' + esc(q.why) + '</div>';
        const b2 = primaryBtn(qi + 1 < qs.length ? '下一题' : '去听写', function () {
          if (qi + 1 < qs.length) { qi += 1; draw(); }
          else dictation();
        }, 'sm');
        b2.style.marginTop = '12px';
        panel.querySelector('.fb-slot').appendChild(b2);
        ctx.bumpProgress();
      });
    });
    inner.appendChild(panel);
    ctx.setTotal(qs.length + lesson.dictation.length);
    if (qi > 0) ctx.bumpProgress();
  }

  /* ---- 听写 ---- */
  function dictation() {
    stopAudio();
    clear(inner);
    inner.innerHTML =
      kicker('听写', 'gold', '最后一步') +
      '<h2 class="step-title">听一句，写一句</h2>' +
      '<p class="step-sub">点播放键逐句听，写下你听到的句子。拼写错误会被标出来。</p>';

    let di = 0;
    const score = { done: 0, right: 0 };
    const wrap = el('div');
    inner.appendChild(wrap);

    function drawDict() {
      clear(wrap);
      const item = lesson.dictation[di];
      const box = el('div', { class: 'prompt-box' });
      box.innerHTML =
        '<div class="prompt-label">第 ' + (di + 1) + ' / ' + lesson.dictation.length + ' 句</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button class="btn sm" id="db-play" type="button">▶ 播放这句</button>' +
        '<button class="btn sm ghost" id="db-slow" type="button">慢速</button>' +
        '<button class="btn sm ghost" id="db-hint" type="button">看中文提示</button>' +
        '</div>' +
        '<div class="dictate-line">' +
        '<textarea class="dictate-input" id="db-in" placeholder="在这里写下你听到的句子…" spellcheck="false"></textarea>' +
        '<div id="db-cn" hidden style="font-size:12.5px;color:var(--ink-3)">' + esc(item.zh) + '</div>' +
        '<div id="db-fb"></div>' +
        '</div>';
      wrap.appendChild(box);

      const input = box.querySelector('#db-in');
      const fb = box.querySelector('#db-fb');
      box.querySelector('#db-play').addEventListener('click', function () {
        Speech.speak(item.text, { accent: lesson.accent, rate: 0.88 });
      });
      box.querySelector('#db-slow').addEventListener('click', function () {
        Speech.speak(item.text, { accent: lesson.accent, rate: 0.7 });
      });
      box.querySelector('#db-hint').addEventListener('click', function () {
        const cn = box.querySelector('#db-cn');
        cn.toggleAttribute('hidden');
        this.textContent = cn.hasAttribute('hidden') ? '看中文提示' : '收起提示';
      });

      const btn = primaryBtn(di + 1 < lesson.dictation.length ? '检查并下一句' : '检查并完成', function () { check(); }, 'sm');
      btn.style.marginTop = '10px';
      box.appendChild(btn);
      input.focus();

      function check() {
        const target = item.text;
        const res = diffWords(input.value, target);
        const pct = res.total ? res.ok / res.total : 0;
        const pass = pct >= 0.8;
        score.done += 1;
        if (pass) score.right += 1;
        recordAnswer(ctx.state, pass, 'listening');
        fb.innerHTML =
          '<div class="feedback ' + (pass ? 'ok' : 'no') + '">' +
          '<b>' + (pass ? '很好，' : '再听一遍，') + Math.round(pct * 100) + '% 的词写对了。</b>' +
          '<div class="diff-text" style="margin-top:6px">' + res.html + '</div>' +
          '</div>';
        input.disabled = true;
        btn.disabled = true;
        ctx.bumpProgress();
        const next = primaryBtn(di + 1 < lesson.dictation.length ? '下一句' : '完成听力', function () {
          di += 1;
          if (di >= lesson.dictation.length) {
            ctx.finish({ xp: 0, summary: '听力 ' + results.filter(Boolean).length + '/4，听写 ' + score.right + '/' + lesson.dictation.length + ' 句达标。' });
          } else {
            drawDict();
          }
        }, 'sm');
        next.style.marginTop = '10px';
        fb.appendChild(next);
      }
    }
    drawDict();
  }

  draw();
}

/* ---- 逐词比对 ---- */
function normalizeWords(s) {
  return String(s).toLowerCase().replace(/[.,!?;:'"’“”()\-—]/g, ' ').split(/\s+/).filter(Boolean);
}

function diffWords(input, target) {
  const tIn = normalizeWords(input);
  const tT = normalizeWords(target);
  let ok = 0;
  const html = tT.map(function (w, i) {
    if (tIn[i] === w) { ok += 1; return '<span class="w-ok">' + esc(w) + '</span>'; }
    if (tIn[i] && levenshtein(tIn[i], w) <= 1) { ok += 1; return '<span class="w-ok" title="拼写差一点">' + esc(w) + '</span>'; }
    if (tIn[i]) return '<span class="w-no" title="你写的是 ' + esc(tIn[i]) + '">' + esc(w) + '</span>';
    return '<span class="w-miss">' + esc(w) + '</span>';
  }).join(' ');
  return { ok: ok, total: tT.length, html: html || '（没有写内容）' };
}

function levenshtein(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}

/* =========================================================
   4. 写作
   ========================================================= */

function renderWriting(host, ctx, task) {
  const inner = el('div', { class: 'step-inner' });
  host.appendChild(inner);
  const words = task.words || [];

  const head =
    kicker('写作', 'rose', task.type === 'translate' ? '句子翻译' : task.type === 'chart' ? '小作文 Task 1' : task.type === 'essay' ? '大作文提纲' : '段落仿写') +
    '<h2 class="step-title">' + esc(task.title) + '</h2>' +
    '<p class="step-sub">' + esc(task.subtitle) + '</p>';
  inner.innerHTML = head;

  const box = el('div');
  inner.appendChild(box);

  if (task.type === 'translate') {
    drawTranslate();
  } else if (task.type === 'chart') {
    drawChart();
  } else {
    drawParagraph();
  }

  /* ---- 句子翻译 ---- */
  function drawTranslate() {
    let i = 0;
    const inputs = [];
    box.innerHTML = '<div class="prompt-box" id="tw-box"></div><div id="tw-fb"></div>';
    const slot = box.querySelector('#tw-box');
    const fb = box.querySelector('#tw-fb');

    function drawLine() {
      const ln = task.lines[i];
      fb.innerHTML = '';
      slot.innerHTML =
        '<div class="prompt-label">第 ' + (i + 1) + ' / ' + task.lines.length + ' 句</div>' +
        '<div class="prompt-cn">' + esc(ln.cn) + '</div>' +
        '<div class="prompt-hint">' + (ln.hints || []).map(function (h) { return '<span class="hint-chip">' + esc(h) + '</span>'; }).join('') + '</div>' +
        '<textarea class="write-area" id="tw-in" placeholder="写下你的英文…" spellcheck="true"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        '<button class="btn primary sm" id="tw-check" type="button">对照参考</button>' +
        '<button class="btn ghost sm" id="tw-skip" type="button">先跳过</button>' +
        '</div>';
      const input = slot.querySelector('#tw-in');
      input.value = inputs[i] || '';
      input.addEventListener('input', function () { inputs[i] = input.value; });
      input.focus();

      slot.querySelector('#tw-check').addEventListener('click', function () {
        // 只判一次：判完把按钮收起来，避免重复记分，也避免留下一个点不动的灰按钮
        slot.querySelector('#tw-check').disabled = true;
        slot.querySelector('#tw-check').style.display = 'none';
        const mine = input.value.trim();
        fb.innerHTML =
          '<div class="model-answer"><h4>参考译文</h4>' + esc(ln.model) +
          (ln.note ? '<div class="ma-zh">' + esc(ln.note) + '</div>' : '') + '</div>' +
          '<div class="self-check" id="tw-checks">' +
          '<label class="check-item"><input type="checkbox"> 句子完整，有主谓</label>' +
          '<label class="check-item"><input type="checkbox"> 用上了提示词</label>' +
          '<label class="check-item"><input type="checkbox"> 时态 / 单复数正确</label>' +
          '<label class="check-item"><input type="checkbox"> 和参考句意思接近</label>' +
          '</div>';
        fb.querySelectorAll('.check-item input').forEach(function (c) {
          c.addEventListener('change', function () { c.closest('.check-item').classList.toggle('on', c.checked); });
        });
        // 不再用「长度 > 8 就算对」代替判断：先自评，再决定记不记分
        let rated = false;
        const next = primaryBtn(i + 1 < task.lines.length ? '下一句' : '完成写作', function () {
          if (!rated) { fb.querySelector('.self-rate-row').classList.add('need'); return; }
          i += 1;
          if (i >= task.lines.length) {
            ctx.finish({ xp: 0, summary: '写了 ' + task.lines.length + ' 句。翻译的关键是先把主谓宾写对。' });
          } else drawLine();
        }, 'sm');
        next.style.marginTop = '12px';
        fb.appendChild(selfRateRow(ctx, 'writing', function () { rated = true; }));
        fb.appendChild(next);
      });
      slot.querySelector('#tw-skip').addEventListener('click', function () {
        i += 1;
        if (i >= task.lines.length) ctx.finish({ xp: 0, summary: '今天先看了一遍参考句，明天再动笔也可以。' });
        else drawLine();
      });
    }
    drawLine();
    ctx.setTotal(task.lines.length);
  }

  /* ---- 段落 / 大作文 ---- */
  function drawParagraph() {
    const hints = task.structure || task.outline || [];
    box.innerHTML =
      '<div class="prompt-box">' +
      '<div class="prompt-label">题目</div>' +
      '<div class="prompt-cn" style="font-size:17px">' + esc(task.prompt) + '</div>' +
      (hints.length ? '<div style="margin-top:12px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink-2)">' +
        hints.map(function (h) { return '<span>· ' + esc(h) + '</span>'; }).join('') + '</div>' : '') +
      (words.length ? '<div class="prompt-hint">' + words.map(function (w) { return '<span class="hint-chip">' + esc(w) + '</span>'; }).join('') + '</div>' : '') +
      '<textarea class="write-area" id="pw-in" style="min-height:140px" placeholder="在这里写…（不会的词先用中文代替，写完再查）"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
      '<button class="btn primary sm" id="pw-submit" type="button">写完，看范文</button>' +
      '<button class="btn ghost sm" id="pw-later" type="button">今天只读范文</button>' +
      '</div></div>' +
      '<div id="pw-fb"></div>';
    const input = box.querySelector('#pw-in');
    const fb = box.querySelector('#pw-fb');
    let started = Date.now();

    function showModel(advance) {
      const text = input.value.trim();
      const n = text ? text.split(/\s+/).length : 0;
      fb.innerHTML =
        '<div class="model-answer"><h4>参考范文（' + (task.model.split(/\s+/).length) + ' 词）</h4>' + esc(task.model) +
        (task.modelZh ? '<div class="ma-zh">' + esc(task.modelZh) + '</div>' : '') + '</div>' +
        (task.checklist ? '<div class="self-check">' + task.checklist.map(function (c) {
          return '<label class="check-item"><input type="checkbox"> ' + esc(c) + '</label>';
        }).join('') + '</div>' : '');
      fb.querySelectorAll('.check-item input').forEach(function (c) {
        c.addEventListener('change', function () { c.closest('.check-item').classList.toggle('on', c.checked); });
      });
      if (!n) {
        // 只读范文：不记分，但必须给一条走得出去的路
        const skip = primaryBtn('完成（这次不记分）', function () {
          ctx.finish({ xp: 0, summary: '今天先读了范文，明天试着自己写一版。' });
        }, 'sm');
        skip.style.marginTop = '12px';
        fb.appendChild(skip);
        ctx.setTotal(1);
        return;
      }
      let rated = false;
      const btn = primaryBtn('完成写作', function () {
        if (!rated) { fb.querySelector('.self-rate-row').classList.add('need'); return; }
        ctx.finish({ xp: 0, summary: '写了 ' + n + ' 词。对照范文，挑一句最不像的，明天重写它。' });
      }, 'sm');
      btn.style.marginTop = '12px';
      fb.appendChild(selfRateRow(ctx, 'writing', function () { rated = true; }));
      fb.appendChild(btn);
      ctx.setTotal(1);
    }

    box.querySelector('#pw-submit').addEventListener('click', function () {
      box.querySelector('#pw-submit').disabled = true;
      box.querySelector('#pw-submit').style.display = 'none';
      showModel(true);
    });
    box.querySelector('#pw-later').addEventListener('click', function () { showModel(false); });
  }

  /* ---- 图表小作文 ---- */
  function drawChart() {
    box.innerHTML =
      '<div class="prompt-box chart-box" style="padding:12px 14px">' + chartSvg(task.chart) + '</div>' +
      '<div class="prompt-box">' +
      '<div class="prompt-label">任务</div>' +
      '<div class="prompt-cn" style="font-size:16px">用 2–3 句英文描述这张图：总趋势、最高值、最明显的对比。</div>' +
      '<div class="prompt-hint">' + (task.tips || []).map(function (h) { return '<span class="hint-chip">' + esc(h) + '</span>'; }).join('') + '</div>' +
      '<textarea class="write-area" id="ch-in" placeholder="Overall, … / The highest figure is … / while …" spellcheck="true"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
      '<button class="btn primary sm" id="ch-check" type="button">对照参考</button>' +
      '</div></div><div id="ch-fb"></div>';
    const input = box.querySelector('#ch-in');
    const fb = box.querySelector('#ch-fb');
    box.querySelector('#ch-check').addEventListener('click', function () {
      box.querySelector('#ch-check').disabled = true;
      box.querySelector('#ch-check').style.display = 'none';
      box.querySelector('#ch-check').style.display = 'none';
      const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
      fb.innerHTML =
        '<div class="model-answer"><h4>参考写法</h4>' + esc(task.model) +
        (task.modelZh ? '<div class="ma-zh">' + esc(task.modelZh) + '</div>' : '') + '</div>' +
        (task.checklist ? '<div class="self-check">' + task.checklist.map(function (c) {
          return '<label class="check-item"><input type="checkbox"> ' + esc(c) + '</label>';
        }).join('') + '</div>' : '');
      if (!n) {
        const skip = primaryBtn('完成（这次不记分）', function () {
          ctx.finish({ xp: 0, summary: '今天先看了参考写法。' });
        }, 'sm');
        skip.style.marginTop = '12px';
        fb.appendChild(skip);
        ctx.setTotal(1);
        return;
      }
      let rated = false;
      const btn = primaryBtn('完成写作', function () {
        if (!rated) { fb.querySelector('.self-rate-row').classList.add('need'); return; }
        ctx.finish({ xp: 0, summary: '写了 ' + n + ' 词。小作文只描述，不解释原因。' });
      }, 'sm');
      btn.style.marginTop = '12px';
      fb.appendChild(selfRateRow(ctx, 'writing', function () { rated = true; }));
      fb.appendChild(btn);
      ctx.setTotal(1);
    });
    ctx.setTotal(1);
  }
}

/* ---- 简易 SVG 柱状图 / 折线图 ---- */
function chartSvg(chart) {
  const W = 560; const H = 260;
  const padL = 44; const padR = 58; const padT = 44; const padB = 38;
  const n = chart.axis.length;
  let max = 0;
  chart.axis.forEach(function (a) { a.v.forEach(function (v) { if (v > max) max = v; }); });
  max = Math.ceil(max / 10) * 10 || 10;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const colors = ['#2f6b4f', '#d9a441'];

  function y(v) { return padT + ih - (v / max) * ih; }
  function x(i) { return padL + (n === 1 ? iw / 2 : (iw / (n - 1)) * i); }

  const grid = [0, 0.25, 0.5, 0.75, 1].map(function (p) {
    const yy = padT + ih - ih * p;
    return '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#e3ddcd" stroke-width="1"/>' +
      '<text x="' + (padL - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="9.5" fill="#a9aea3">' + Math.round(max * p) + '</text>';
  }).join('');

  let body = '';
  if (chart.line) {
    for (let g = 0; g < chart.groups.length; g++) {
      const pts = chart.axis.map(function (a, i) { return x(i) + ',' + y(a.v[g]); }).join(' ');
      body += '<polyline points="' + pts + '" fill="none" stroke="' + colors[g % 2] + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      body += chart.axis.map(function (a, i) {
        return '<circle cx="' + x(i) + '" cy="' + y(a.v[g]) + '" r="3.4" fill="#fff" stroke="' + colors[g % 2] + '" stroke-width="2"/>';
      }).join('');
    }
  } else {
    const groupW = iw / n;
    const barW = Math.min(20, groupW / (chart.groups.length + 1.6));
    for (let i = 0; i < n; i++) {
      for (let g = 0; g < chart.groups.length; g++) {
        const v = chart.axis[i].v[g];
        const bx = padL + groupW * i + groupW / 2 - (barW * chart.groups.length) / 2 + g * barW;
        const by = y(v);
        body += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + (barW - 3).toFixed(1) + '" height="' + (padT + ih - by).toFixed(1) +
          '" rx="3" fill="' + colors[g % 2] + '" opacity="' + (g === 0 ? 0.92 : 0.72) + '"/>';
        body += '<text x="' + (bx + (barW - 3) / 2).toFixed(1) + '" y="' + (by - 4).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#7b8175">' + v + '</text>';
      }
    }
  }

  const labels = chart.axis.map(function (a, i) {
    return '<text x="' + x(i) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="10" fill="#4a5045">' + esc(a.label) + '</text>';
  }).join('');

  const legend = chart.groups.map(function (g, i) {
    return '<g transform="translate(' + (padL + i * 104) + ',20)"><rect width="9" height="9" rx="2" fill="' + colors[i % 2] + '"/><text x="14" y="8.5" font-size="10" fill="#4a5045">' + esc(g) + '</text></g>';
  }).join('');

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;max-height:300px" role="img" aria-label="' + esc(chart.title) + '">' +
    '<text x="' + padL + '" y="12" font-size="11" fill="#4a5045" font-weight="600">' + esc(chart.title) + '</text>' +
    '<text x="' + (W - padR) + '" y="12" text-anchor="end" font-size="9.5" fill="#a9aea3">' + esc(chart.unit) + '</text>' +
    grid + body + labels + legend + '</svg>';
}

/* =========================================================
   5. 口语
   ========================================================= */

function renderSpeaking(host, ctx, task) {
  const inner = el('div', { class: 'step-inner' });
  host.appendChild(inner);
  const isPart2 = !!task.card;
  let phase = 'intro'; // intro → prep → speak → model
  let timer = null;
  let rec = null;
  let chunks = [];
  let recUrl = null;

  inner.innerHTML =
    kicker(isPart2 ? '口语 Part 2' : '口语 Part 1 / 3', 'sky', isPart2 ? '1 分钟准备 + 90 秒作答' : '逐题开口') +
    '<h2 class="step-title">' + esc(task.title) + '</h2>' +
    '<p class="step-sub">' + esc(task.subtitle) + '　· 对着屏幕说出来，不用录音也行。</p>';

  const body = el('div');
  inner.appendChild(body);

  function cleanup() {
    if (timer) { clearInterval(timer); timer = null; }
    if (rec && rec.state === 'recording') { try { rec.stop(); } catch (e) {} }
    Speech.stop();
  }
  ctx.onCleanup(cleanup);

  if (isPart2) drawPart2(); else drawPart13();

  /* ---- Part 2 卡片 ---- */
  function drawPart2() {
    body.innerHTML =
      '<div class="prompt-box">' +
      '<div class="prompt-label">话题卡</div>' +
      '<div class="prompt-cn">' + esc(task.card.topic) + '</div>' +
      '<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink-2)">' +
      task.card.points.map(function (p) { return '<span>· ' + esc(p) + '</span>'; }).join('') +
      '</div></div>' +
      '<div class="prompt-box" style="display:flex;gap:22px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
      '<div><div class="prompt-label">倒计时</div><div class="speak-timer" id="sp-timer">60</div>' +
      '<div class="step-sub" id="sp-phase">准备时间：可以先写 3 个关键词</div></div>' +
      '<div class="rec-row" id="sp-ctl"></div></div>' +
      '<div id="sp-extra"></div>';
    const ctl = body.querySelector('#sp-ctl');
    const playBtn = primaryBtn('开始 90 秒作答', function () { startSpeak(); }, 'lg');
    ctl.appendChild(playBtn);
    const skip = el('button', { class: 'chip-btn', type: 'button', text: '跳过准备' });
    skip.addEventListener('click', function () { startSpeak(); });
    ctl.appendChild(skip);

    let prep = 60;
    const timerEl = body.querySelector('#sp-timer');
    timer = setInterval(function () {
      prep -= 1;
      timerEl.textContent = prep > 0 ? prep : '0';
      if (prep <= 0) { clearInterval(timer); timer = null; startSpeak(); }
    }, 1000);

    function startSpeak() {
      if (phase === 'speak') return;
      phase = 'speak';
      if (timer) { clearInterval(timer); timer = null; }
      body.querySelector('#sp-phase').textContent = '现在开口，说满 90 秒';
      let left = 90;
      timerEl.textContent = left;
      ctl.innerHTML = '';
      const stopBtn = primaryBtn('说完了，看参考', function () { finishSpeak(); }, 'lg');
      ctl.appendChild(stopBtn);
      timer = setInterval(function () {
        left -= 1;
        timerEl.textContent = left > 0 ? left : '0';
        if (left <= 0) finishSpeak();
      }, 1000);

      // 可选录音
      if (navigator.mediaDevices && window.MediaRecorder) {
        const recBtn = el('button', { class: 'btn sm ghost', type: 'button', text: '● 录音（可选）' });
        recBtn.addEventListener('click', function () {
          if (rec && rec.state === 'recording') { rec.stop(); return; }
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            rec = new MediaRecorder(stream);
            chunks = [];
            rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
            rec.onstop = function () {
              stream.getTracks().forEach(function (t) { t.stop(); });
              const blob = new Blob(chunks, { type: 'audio/webm' });
              if (recUrl) URL.revokeObjectURL(recUrl);
              recUrl = URL.createObjectURL(blob);
              const wrap = body.querySelector('#sp-extra');
              wrap.innerHTML = '<div class="prompt-box"><div class="prompt-label">你的录音</div><audio controls src="' + recUrl + '" style="width:100%"></audio><p class="step-sub" style="margin-top:6px">回听一遍，只听两件事：有没有长时间卡住、结尾有没有说完。</p></div>';
              recBtn.textContent = '● 重新录音';
            };
            rec.start();
            recBtn.innerHTML = '<span class="rec-dot"></span> 录音中，点击停止';
          }).catch(function () {
            recBtn.textContent = '浏览器不允许麦克风，直接用嘴说也可以';
            recBtn.disabled = true;
          });
        });
        ctl.appendChild(recBtn);
      }
    }

    function finishSpeak() {
      if (phase === 'model') return;
      phase = 'model';
      if (timer) { clearInterval(timer); timer = null; }
      if (rec && rec.state === 'recording') { try { rec.stop(); } catch (e) {} }
      ctx.addXp(12);
      const extra = body.querySelector('#sp-extra');
      extra.innerHTML +=
        '<div class="model-answer"><h4>参考回答（跟读 2 遍再走）</h4>' + esc(task.model) +
        '<div class="ma-zh">' + esc(task.modelZh) + '</div></div>' +
        '<div class="self-check">' + task.checks.map(function (c) {
          return '<label class="check-item"><input type="checkbox"> ' + esc(c) + '</label>';
        }).join('') + '</div>';
      extra.querySelectorAll('.check-item input').forEach(function (c) {
        c.addEventListener('change', function () { c.closest('.check-item').classList.toggle('on', c.checked); });
      });
      let rated = false;
      const bar = el('div', { style: 'display:flex;gap:8px;margin-top:16px;flex-wrap:wrap' });
      bar.appendChild(primaryBtn('完成口语', function () {
        if (!rated) { extra.querySelector('.self-rate-row').classList.add('need'); return; }
        ctx.finish({ xp: 0, summary: '开口说了 90 秒。说的次数比说的完美更重要。' });
      }));
      const readBtn = el('button', { class: 'btn', type: 'button', text: '朗读参考回答' });
      readBtn.addEventListener('click', function () { Speech.speak(task.model, { rate: 0.9 }); });
      bar.appendChild(readBtn);
      extra.appendChild(selfRateRow(ctx, 'speaking', function () { rated = true; }));
      extra.appendChild(bar);
    }
    ctx.setTotal(1);
  }

  /* ---- Part 1 / 3 逐题 ---- */
  function drawPart13() {
    const qs = task.questions;
    let i = 0;
    body.innerHTML = '<div id="sp-q"></div><div id="sp-model"></div>';
    const qslot = body.querySelector('#sp-q');
    const mslot = body.querySelector('#sp-model');

    function drawQ() {
      const q = qs[i];
      mslot.innerHTML = '';
      qslot.innerHTML =
        '<div class="prompt-box"><div class="prompt-label">问题 ' + (i + 1) + ' / ' + qs.length + '</div>' +
        '<div class="prompt-cn">' + esc(q.q) + '</div>' +
        '<p class="step-sub" style="margin-top:8px">先说 3 句试试：直接回答 → 一个理由 → 一个小细节。</p>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn sm" id="sp-show" type="button">说完了，看参考</button>' +
        '<button class="btn sm ghost" id="sp-hint" type="button">看思路提示</button>' +
        '</div><div id="sp-tip"></div></div>';
      qslot.querySelector('#sp-hint').addEventListener('click', function () {
        qslot.querySelector('#sp-tip').innerHTML = '<div class="feedback ok" style="margin-top:10px">' + esc(q.tip) + '</div>';
      });
      qslot.querySelector('#sp-show').addEventListener('click', function () {
        ctx.addXp(6);
        const model = (q && q.model) || task.model;
        mslot.innerHTML =
          '<div class="model-answer"><h4>参考回答</h4>' + esc(model) +
          (i === 0 && task.modelZh ? '<div class="ma-zh">' + esc(task.modelZh) + '</div>' : '') + '</div>' +
          '<div class="self-check">' + task.checks.map(function (c) {
            return '<label class="check-item"><input type="checkbox"> ' + esc(c) + '</label>';
          }).join('') + '</div>';
        mslot.querySelectorAll('.check-item input').forEach(function (c) {
          c.addEventListener('change', function () { c.closest('.check-item').classList.toggle('on', c.checked); });
        });
        let rated = false;
        const bar = el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap' });
        bar.appendChild(primaryBtn(i + 1 < qs.length ? '下一题' : '完成口语', function () {
          if (!rated) { mslot.querySelector('.self-rate-row').classList.add('need'); return; }
          i += 1;
          if (i >= qs.length) {
            ctx.finish({ xp: 0, summary: '练了 ' + qs.length + ' 个口语问题。' });
          } else drawQ();
        }));
        const rd = el('button', { class: 'btn', type: 'button', text: '听一遍参考' });
        rd.addEventListener('click', function () { Speech.speak(model, { rate: 0.9 }); });
        bar.appendChild(rd);
        mslot.appendChild(selfRateRow(ctx, 'speaking', function () { rated = true; }));
        mslot.appendChild(bar);
      });
      ctx.setTotal(qs.length);
    }
    drawQ();
  }
}

  return { el: el, renderVocab: renderVocab, renderReading: renderReading, renderListening: renderListening, renderWriting: renderWriting, renderSpeaking: renderSpeaking };
})();

__M["assets/exam.js"] = (function () {
/* =========================================================
   exam.js · 真题模考
   听力 40 题 / 阅读 40 题，计时、答题卡、交卷、按雅思 40 题制估分、逐题精讲。
   ========================================================= */

const { saveNow, ymd, addXp, refreshStats } = __M["assets/store.js"];
const { Speech } = __M["assets/speech.js"];

/* ---------------- 估分表 ---------------- */

// 雅思 Academic 的 40 题制换算（业界常用近似值，非官方）
// 听力与阅读的换算曲线并不相同，中段差 0.5 分，所以分成两张表。
const BAND_READING = [
  [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0],
  [27, 6.5], [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5],
  [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5], [0, 2.0],
];

const BAND_LISTENING = [
  [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0],
  [26, 6.5], [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5],
  [11, 4.0], [8, 3.5], [6, 3.0], [4, 2.5], [0, 2.0],
];

function rawToBand(raw, kind) {
  const table = kind === 'listening' ? BAND_LISTENING : BAND_READING;
  for (let i = 0; i < table.length; i++) {
    if (raw >= table[i][0]) return table[i][1];
  }
  return 2.0;
}

/** 题量不是 40 时先折回 40 题制，避免 80 题全卷被判成 9 分 */
function toForty(correct, total) {
  if (!total) return 0;
  return Math.round((correct * 40) / total);
}

/** 6.0 对应的每题线（听力/阅读各自） */
const TARGET = { band: 6.0, raw: 23 };

/* ---------------- 取题与判分 ---------------- */

/** 把一套题摊平成按题号排序的列表 */
function flatten(part, kind) {
  const out = [];
  const groups = kind === 'listening' ? part.groups : part.groups;
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    for (let q = 0; q < grp.questions.length; q++) {
          const item = grp.questions[q];
          const row = (grp.table || []).find(function (r) { return String(r[1]).indexOf(String(item.no)) >= 0; });
          const tableRow = grp.table && row ? (row[0] + ' → ' + String(row[1] || '').replace(String(item.no), '').replace(/_+/g, ' ______ ').replace(/\s+/g, ' ').trim()) : null;
          out.push(Object.assign({}, item, {
            group: grp,
            groupType: grp.type,
            section: part,
            kind: kind,
            tableRow: tableRow,
          }));
    }
  }
  out.sort(function (a, b) { return a.no - b.no; });
  return out;
}

function examItems(set, section) {
  const out = [];
  if ((section === 'listening' || section === 'all') && set.listening) {
    const parts = set.listening.parts;
    for (let i = 0; i < parts.length; i++) out.push.apply(out, flatten(parts[i], 'listening'));
  }
  if ((section === 'reading' || section === 'all') && set.reading) {
    const ps = set.reading.passages;
    for (let i = 0; i < ps.length; i++) out.push.apply(out, flatten(ps[i], 'reading'));
  }
  return out;
}

function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[.,!?;:'"’“”()\-—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkAnswer(item, given) {
  if (given === undefined || given === null || given === '') return false;
  if (item.type === 'mcq' || item.type === 'match') {
    return Number(given) === Number(item.answer);
  }
  if (item.type === 'tfng') {
    return norm(given) === norm(item.answer);
  }
  const g = norm(given);
  if (!g) return false;
  const accepts = [item.answer].concat(item.accept || []);
  for (let i = 0; i < accepts.length; i++) {
    const a = norm(accepts[i]);
    if (g === a) return true;
    // 数字写法：允许 140 / 140.0 / £140 这类差异
    if (/^\d+$/.test(a) && parseFloat(g.replace(/[^\d.]/g, '')) === Number(a)) return true;
  }
  return false;
}

function scoreOf(items, answers, kind) {
  let correct = 0;
  const per = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const ok = checkAnswer(it, answers[it.no]);
    if (ok) correct += 1;
    const k = it.kind;
    if (!per[k]) per[k] = { total: 0, correct: 0 };
    per[k].total += 1;
    if (ok) per[k].correct += 1;
  }

  // 听力、阅读各自按自己的表换算；全卷取两者平均，而不是拿 80 题直接套 40 题的表
  const lBand = per.listening ? rawToBand(toForty(per.listening.correct, per.listening.total), 'listening') : null;
  const rBand = per.reading ? rawToBand(toForty(per.reading.correct, per.reading.total), 'reading') : null;
  let band;
  if (lBand !== null && rBand !== null) band = Math.round(((lBand + rBand) / 2) * 2) / 2;
  else if (lBand !== null) band = lBand;
  else if (rBand !== null) band = rBand;
  else band = rawToBand(toForty(correct, items.length), kind || 'reading');

  return {
    correct: correct,
    total: items.length,
    per: per,
    raw40: toForty(correct, items.length),
    band: band,
    bandListening: lBand,
    bandReading: rBand,
  };
}

/* ---------------- 会话 ---------------- */

let E = null;
let clock = null;

function stopClock() { if (clock) { clearInterval(clock); clock = null; } }

/** 进入考试 */
function startExam(app, opts) {
  const set = opts.set;
  const section = opts.section || 'all';
  const relaxed = !!opts.relaxed;
  const items = examItems(set, section);
  const minutes = relaxed ? 150 : (section === 'listening' ? 35 : section === 'reading' ? 60 : 95);
  E = {
    set: set,
    section: section,
    relaxed: relaxed,
    items: items,
    answers: {},
    flags: {},
    i: 0,
    left: minutes * 60,
    total: minutes * 60,
    deadline: Date.now() + minutes * 60000,
    finished: false,
    startedAt: Date.now(),
    app: app,
  };
  if (!items.length) {
    app.toast('这一套还没有这个部分，换一个', '⚠️');
    return;
  }
  openOverlay();
  startClock();
  renderQuestion();
}

function startClock() {
  stopClock();
  if (!E) return;
  // 用截止时间戳求差，而不是每秒自减：
  // 切标签页时浏览器会把 setInterval 限流到 1 次/分钟，自减会让计时变慢，等于可以「暂停」考试。
  if (!E.relaxed && !E.deadline) E.deadline = Date.now() + E.total * 1000;
  E.tick = function () {
    if (!E || E.finished) return;
    if (E.relaxed) {
      E.left = Math.floor((Date.now() - E.startedAt) / 1000);
      const c = document.getElementById('exam-clock');
      if (c) c.textContent = fmt(E.left);
      return;
    }
    E.left = Math.max(0, Math.round((E.deadline - Date.now()) / 1000));
    const clockEl = document.getElementById('exam-clock');
    if (clockEl) clockEl.textContent = fmt(E.left);
    const bar = document.getElementById('exam-timebar');
    if (bar) bar.style.width = Math.max(0, (E.left / E.total) * 100) + '%';
    if (E.left <= 0) { stopClock(); submitExam(true); }
  };
  E.tick();
  clock = setInterval(E.tick, 500);
}

// 从后台切回来立刻校准一次，不让限流累积误差
document.addEventListener('visibilitychange', function () {
  if (E && E.tick && !document.hidden) E.tick();
});

function fmt(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function openOverlay() {
  let ov = document.getElementById('exam');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'exam';
    ov.className = 'exam';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    document.body.appendChild(ov);
  }
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  ov.innerHTML =
    '<div class="exam-top">' +
    '  <div class="exam-top-left">' +
    '    <button class="icon-btn" id="exam-quit" type="button" aria-label="退出模考"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
    '    <div><div class="exam-title">' + esc(E.set.name) + '</div>' +
    '      <div class="exam-sub">' + (E.section === 'all' ? '听力 + 阅读' : E.section === 'listening' ? 'Listening' : 'Reading') +
    '      · ' + E.items.length + ' 题 · ' + (E.relaxed ? '宽松模式' : '限时') + '</div></div>' +
    '  </div>' +
    '  <div class="exam-timer"><span class="exam-clock" id="exam-clock">' + fmt(E.left) + '</span>' +
    '    <div class="exam-timebar-track"><i id="exam-timebar" style="width:100%"></i></div></div>' +
    '  <div class="exam-top-right">' +
    '    <span class="exam-progress" id="exam-progress"></span>' +
    '    <button class="btn primary sm" id="exam-submit" type="button">交卷</button>' +
    '  </div>' +
    '</div>' +
    '<div class="exam-main">' +
    '  <aside class="exam-nav" id="exam-nav"></aside>' +
    '  <section class="exam-body" id="exam-body"></section>' +
    '</div>';
  ov.onclick = function (e) {
    const t = e.target;
    if (!t) return;
    if (t.closest && t.closest('#exam-quit')) { quitExam(); return; }
    if (t.closest && t.closest('#exam-submit')) { confirmSubmit(); return; }
  };
  renderNav();
}

function renderNav() {
  const nav = document.getElementById('exam-nav');
  if (!nav) return;
  const answered = countAnswered();
  const p = document.getElementById('exam-progress');
  if (p) p.textContent = answered + ' / ' + E.items.length;

  // 按 part / passage 分组显示题号
  const groups = [];
  let cur = null;
  for (let i = 0; i < E.items.length; i++) {
    const it = E.items[i];
    const secTitle = it.kind === 'listening' ? ('Part ' + (it.section && it.section.part)) : ('Passage ' + (it.section && it.section.no));
    if (!cur || cur.title !== secTitle) { cur = { title: secTitle, items: [] }; groups.push(cur); }
    cur.items.push({ i: i, no: it.no });
  }

  nav.innerHTML =
    '<div class="exam-nav-title">答题卡</div>' +
    groups.map(function (g) {
      return '<div class="exam-nav-group"><div class="exam-nav-label">' + esc(g.title) + '</div>' +
        '<div class="exam-nav-grid">' + g.items.map(function (x) {
          const it = E.items[x.i];
          const ans = E.answers[it.no];
          const done = ans !== undefined && ans !== '';
          const cls = 'exam-dot' + (done ? ' done' : '') + (x.i === E.i ? ' now' : '') + (E.flags[it.no] ? ' flag' : '');
          return '<button class="' + cls + '" data-go="' + x.i + '" type="button">' + x.no + '</button>';
        }).join('') + '</div></div>';
    }).join('') +
    '<div class="exam-nav-legend"><span><i class="exam-dot done"></i>已答</span><span><i class="exam-dot"></i>未答</span><span><i class="exam-dot now"></i>当前</span></div>';

  nav.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.i = Number(b.getAttribute('data-go'));
      renderQuestion();
    });
  });
}

function countAnswered() {
  let n = 0;
  for (let i = 0; i < E.items.length; i++) {
    const a = E.answers[E.items[i].no];
    if (a !== undefined && a !== '') n += 1;
  }
  return n;
}

function renderQuestion() {
  const body = document.getElementById('exam-body');
  if (!body) return;
  const it = E.items[E.i];
  renderNav();
  body.scrollTop = 0;

  const isLast = E.i === E.items.length - 1;
  let left = '';
  if (it.kind === 'reading' && it.section) {
    left = '<div class="exam-passage">' +
      '<div class="exam-passage-head"><b>' + esc(it.section.title) + '</b><span>' + it.section.words + ' 词 · Passage ' + it.section.no + '</span></div>' +
      '<div class="exam-passage-text">' + it.section.text.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      '</div>';
  } else if (it.kind === 'listening' && it.section) {
    left = '<div class="exam-passage exam-audio">' +
      '<div class="exam-passage-head"><b>' + esc(it.section.title) + '</b><span>' + esc(it.section.intro || '') + '</span></div>' +
      '<div class="exam-audio-actions">' +
      '<button class="btn sm" id="exam-play" type="button">▶ 播放这一部分</button>' +
      '<button class="btn sm ghost" id="exam-playone" type="button">▶ 只读这一段</button>' +
      '</div>' +
      '<p class="exam-audio-note">模考不提供官方音频，这里用浏览器语音合成朗读该部分原文。正式考试时录音只播一遍，建议先做题，实在卡住再点。</p>' +
      '<div class="exam-qlist" id="exam-qlist"></div>' +
      '<details class="exam-script-wrap"><summary>看这一部分的原文</summary>' +
      '<div class="exam-script" id="exam-script">' + it.section.script.map(function (l) {
        return '<p><b>' + esc(l.s) + ':</b> ' + esc(l.t) + '</p>';
      }).join('') + '</div></details>' +
      '</div>';
  }

  body.innerHTML =
    '<div class="exam-q' + (left ? ' split' : '') + '">' +
    (left ? '<div class="exam-left">' + left + '</div>' : '') +
    '  <div class="exam-right">' +
    '    <div class="exam-q-head">' +
    '      <span class="exam-q-no">Question ' + it.no + '</span>' +
    '      <span class="exam-q-type">' + typeName(it) + '</span>' +
    '      <button class="chip-btn" type="button" id="exam-flag">' + (E.flags[it.no] ? '取消标记' : '标记这题') + '</button>' +
    '    </div>' +
    '    <div class="exam-instr">' + esc(it.group.instruction || '') + '</div>' +
    questionHtml(it) +
    '    <div class="exam-foot">' +
    '      <button class="btn" id="exam-prev" type="button"' + (E.i === 0 ? ' disabled' : '') + '>上一题</button>' +
    '      <span class="exam-foot-hint">' + (isLast ? '最后一题，检查完可以交卷' : '回车也能到下一题') + '</span>' +
    '      <button class="btn primary" id="exam-next" type="button">' + (isLast ? '检查答题卡' : '下一题') + '</button>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  bindQuestion(body, it);
  if (it.kind === 'listening' && it.section) {
    bindAudio(it.section);
    renderQList(it);
  }
}

/** 听力部分左侧的题目清单，点一下就跳过去 */
function renderQList(cur) {
  const box = document.getElementById('exam-qlist');
  if (!box) return;
  const same = E.items.filter(function (x) { return x.kind === 'listening' && x.section === cur.section; });
  box.innerHTML = same.map(function (x) {
    const a = E.answers[x.no];
    const done = a !== undefined && a !== '';
    return '<button class="exam-qline' + (x.no === cur.no ? ' now' : '') + (done ? ' done' : '') + '" data-jump="' + x.no + '" type="button">' +
      '<b>Q' + x.no + '</b><span>' + esc(x.tableRow || x.prompt || '') + '</span>' +
      (done ? '<i>✓</i>' : '') + '</button>';
  }).join('');
  box.querySelectorAll('[data-jump]').forEach(function (b) {
    b.addEventListener('click', function () {
      const no = Number(b.getAttribute('data-jump'));
      const idx = E.items.findIndex(function (x) { return x.no === no; });
      if (idx >= 0) { E.i = idx; renderQuestion(); }
    });
  });
}

/* ---------------- 听力朗读 ---------------- */

let examAudio = { playing: false, timer: null };

function stopExamAudio() {
  examAudio.playing = false;
  if (examAudio.timer) { clearTimeout(examAudio.timer); examAudio.timer = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

/* ---------------- 语音 ---------------- */

// 听力原文用英音（雅思听力以英音为主），但音色仍交给 speech.js 统一挑：
// 直接 getVoices() 取第一个，常常是最差的系统默认音色。
function speakLine(text, cb) {
  Speech.speak(text, { accent: 'uk', rate: 0.92, onend: cb });
}

function bindAudio(section) {
  const play = document.getElementById('exam-play');
  const one = document.getElementById('exam-playone');
  if (!play) return;
  play.addEventListener('click', function () {
    if (examAudio.playing) { stopExamAudio(); play.textContent = '▶ 播放这一部分'; return; }
    stopExamAudio();
    examAudio.playing = true;
    play.textContent = '■ 停止';
    const lines = section.script.slice();
    let i = 0;
    const step = function () {
      if (!examAudio.playing || i >= lines.length) {
        examAudio.playing = false;
        play.textContent = '▶ 播放这一部分';
        return;
      }
      speakLine(lines[i].t, function () { if (examAudio.playing) examAudio.timer = setTimeout(step, 260); });
      i += 1;
    };
    step();
  });
  one.addEventListener('click', function () {
    stopExamAudio();
    // 从头连续朗读，点一次就停（相当于「再听一遍这一段」）
    speakLine(section.script.map(function (l) { return l.t; }).join(' '));
  });
}

function typeName(it) {
  if (it.kind === 'listening') return 'Listening';
  if (it.groupType === 'tfng') return 'TRUE / FALSE / NOT GIVEN';
  if (it.groupType === 'completion') return 'Fill in the blank';
  return 'Multiple choice';
}

function questionHtml(it) {
  let html = '';
  const stem = it.prompt || (it.tableRow ? 'Complete the note: ' + it.tableRow : 'Complete question ' + it.no);  html += '<div class="exam-stem">' + esc(stem) + '</div>';
  if (it.type === 'mcq' || it.type === 'match') {
    html += '<div class="exam-opts">' + it.options.map(function (o, idx) {
      const on = Number(E.answers[it.no]) === idx;
      return '<button class="exam-opt' + (on ? ' on' : '') + '" data-opt="' + idx + '" type="button">' +
        '<span class="o-key">' + 'ABCD'[idx] + '</span><span>' + esc(o) + '</span></button>';
    }).join('') + '</div>';
  } else if (it.type === 'tfng') {
    const opts = ['TRUE', 'FALSE', 'NOT GIVEN'];
    html += '<div class="exam-opts tfng">' + opts.map(function (o, idx) {
      const on = norm(E.answers[it.no]) === norm(o);
      return '<button class="exam-opt' + (on ? ' on' : '') + '" data-tf="' + o + '" type="button">' +
        '<span class="o-key">' + ['T', 'F', 'NG'][idx] + '</span><span>' + o + '</span></button>';
    }).join('') + '</div>';
  } else {
    html += '<div class="exam-blank"><input class="exam-input" id="exam-input" type="text" autocomplete="off" spellcheck="false" placeholder="在这里填第 ' + it.no + ' 空的答案" value="' + esc(E.answers[it.no] || '') + '"></div>';
    if (it.group.table && it.group.table.length > 2) {
      html += '<div class="exam-table">' + it.group.table.map(function (row) {
        const active = String(row[1]).indexOf(String(it.no)) >= 0;
        return '<div class="exam-table-row' + (active ? ' active' : '') + '"><span>' + esc(row[0]) + '</span><b>' + esc(row[1] || '') + '</b></div>';
      }).join('') + '</div>';
    }
  }
  return html;
}

function bindQuestion(body, it) {
  body.querySelectorAll('.exam-opt[data-opt]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.answers[it.no] = Number(b.getAttribute('data-opt'));
      body.querySelectorAll('.exam-opt[data-opt]').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderNav();
    });
  });
  body.querySelectorAll('.exam-opt[data-tf]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.answers[it.no] = b.getAttribute('data-tf');
      body.querySelectorAll('.exam-opt[data-tf]').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderNav();
    });
  });
  const input = body.querySelector('#exam-input');
  if (input) {
    input.addEventListener('input', function () {
      E.answers[it.no] = input.value;
      renderNav();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(1); }
    });
  }
  body.querySelector('#exam-flag').addEventListener('click', function () {
    E.flags[it.no] = !E.flags[it.no];
    this.textContent = E.flags[it.no] ? '取消标记' : '标记这题';
    renderNav();
  });
  body.querySelector('#exam-prev').addEventListener('click', function () { go(-1); });
  body.querySelector('#exam-next').addEventListener('click', function () { go(1); });
}

function go(d) {
  const next = E.i + d;
  if (next < 0) return;
  if (next >= E.items.length) { E.i = E.items.length - 1; renderQuestion(); return; }
  E.i = next;
  renderQuestion();
}

function confirmSubmit() {
  const left = E.items.length - countAnswered();
  const html =
    '<h3>交卷？</h3>' +
    '<p class="sheet-sub">' + (left > 0 ? '还有 ' + left + ' 题没答，空题按错处理。' : '40 题都答完了。') + '交卷后可以看到分数和逐题精讲。</p>' +
    '<div class="sheet-actions">' +
    '<button class="btn primary" id="do-submit" type="button">确认交卷</button>' +
    '<button class="btn ghost" id="do-back" type="button">再检查一下</button>' +
    '</div>';
  showSheet(html);
  document.getElementById('do-submit').addEventListener('click', function () { hideSheet(); submitExam(false); });
  document.getElementById('do-back').addEventListener('click', function () { hideSheet(); });
}

function quitExam() {
  const html =
    '<h3>退出模考？</h3>' +
    '<p class="sheet-sub">这次作答不会计入成绩。' + (countAnswered() > 0 ? '已经写了 ' + countAnswered() + ' 题，退出就白写了。' : '') + '</p>' +
    '<div class="sheet-actions">' +
    '<button class="btn primary" id="quit-yes" type="button">退出</button>' +
    '<button class="btn ghost" id="quit-no" type="button">继续考</button>' +
    '</div>';
  showSheet(html);
  document.getElementById('quit-yes').addEventListener('click', function () {
    hideSheet(); stopClock(); closeOverlay();
  });
  document.getElementById('quit-no').addEventListener('click', function () { hideSheet(); });
}

function showSheet(html) {
  let sheet = document.getElementById('exam-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'exam-sheet';
    sheet.className = 'sheet';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.hidden = true; });
  }
  sheet.innerHTML = '<div class="sheet-card">' + html + '</div>';
  sheet.hidden = false;
}

function hideSheet() {
  const sheet = document.getElementById('exam-sheet');
  if (sheet) sheet.hidden = true;
}

function closeOverlay() {
  const ov = document.getElementById('exam');
  if (ov) ov.hidden = true;
  document.body.style.overflow = '';
  if (E && E.app && E.app.onExamClose) E.app.onExamClose();
  E = null;
}

function submitExam(auto) {
  if (!E || E.finished) return;
  E.finished = true;
  stopClock();
  const res = scoreOf(E.items, E.answers);
  const minutesUsed = Math.max(1, Math.round((Date.now() - E.startedAt) / 60000));
  renderResult(res, minutesUsed, auto);
}

/* ---------------- 成绩与精讲 ---------------- */

function renderResult(res, minutesUsed, auto) {
  const body = document.getElementById('exam-body');
  const nav = document.getElementById('exam-nav');
  if (nav) nav.innerHTML = '<div class="exam-nav-title">成绩</div><div class="exam-result-mini" id="exam-mini"></div>';
  document.getElementById('exam-clock').textContent = '已交卷';
  const submitBtn = document.getElementById('exam-submit');
  if (submitBtn) {
    submitBtn.outerHTML = '<button class="btn sm" id="exam-done" type="button">返回模考页</button>';
    const done = document.getElementById('exam-done');
    if (done) done.addEventListener('click', function () { closeOverlay(); });
  }

  const band = res.band;
  const hit = band >= 6.0;
  const total = res.total;

  body.innerHTML =
    '<div class="exam-result">' +
    '  <div class="exam-result-head">' +
    '    <div><div class="exam-kicker">' + (auto ? '时间到，自动交卷' : '已交卷') + '</div>' +
    '      <h2 class="exam-band">' + band.toFixed(1) + '<small> 分</small></h2>' +
    '      <p class="exam-band-note">' + (hit ? '已经到 6.0 线以上。保持这个正确率，把速度再压一压。' : '距离 6.0 还差 ' + (TARGET.raw - res.correct) + ' 题（目标 ' + TARGET.raw + ' / ' + total + '）。') + '</p>' +
    '    </div>' +
    '    <div class="exam-result-stats">' +
    '      <div><b>' + res.correct + '/' + total + '</b><span>正确</span></div>' +
    '      <div><b>' + minutesUsed + '</b><span>分钟</span></div>' +
    '      <div><b>' + Math.round((res.correct / total) * 100) + '%</b><span>正确率</span></div>' +
    '    </div>' +
    '  </div>' +
    '  <div class="exam-bars">' +
    Object.keys(res.per).map(function (k) {
      const p = res.per[k];
      const pct = Math.round((p.correct / p.total) * 100);
      return '<div class="exam-bar"><div class="exam-bar-top"><span>' + (k === 'listening' ? '听力' : '阅读') + '</span><b>' + p.correct + ' / ' + p.total + '</b></div>' +
        '<div class="exam-bar-track"><i style="width:' + Math.max(2, pct) + '%"></i></div></div>';
    }).join('') +
    '  </div>' +
    '  <div class="exam-target-note">6.0 通常对应听力 / 阅读各 23 题左右。这个换算是业界常用近似值，<b>不是官方评分</b>。</div>' +
    '  <div class="exam-actions">' +
    '    <button class="btn primary" id="exam-review" type="button">逐题精讲</button>' +
    '    <button class="btn" id="exam-again" type="button">再做一遍</button>' +
    '    <button class="btn ghost" id="exam-close" type="button">返回模考页</button>' +
    '  </div>' +
    '  <div id="exam-review-list"></div>' +
    '</div>';

  const mini = document.getElementById('exam-mini');
  if (mini) {
    mini.innerHTML =
      '<div class="exam-mini-band">' + band.toFixed(1) + '</div>' +
      '<div class="exam-mini-sub">' + res.correct + ' / ' + total + ' 题</div>' +
      '<div class="exam-mini-grid">' + E.items.map(function (it) {
        const ok = checkAnswer(it, E.answers[it.no]);
        return '<span class="exam-dot ' + (ok ? 'ok' : 'bad') + '" title="第 ' + it.no + ' 题">' + it.no + '</span>';
      }).join('') + '</div>';
  }

  document.getElementById('exam-review').addEventListener('click', function () { renderReview(); this.disabled = true; this.textContent = '已展开'; });
  document.getElementById('exam-again').addEventListener('click', function () {
    const opts = { set: E.set, section: E.section, relaxed: E.relaxed, app: E.app };
    hideSheet(); stopClock(); closeOverlay();
    startExam(opts.app, opts);
  });
  document.getElementById('exam-close').addEventListener('click', function () { closeOverlay(); });

  // 写入成绩历史与经验
  saveResult(res, minutesUsed);
}

function saveResult(res, minutesUsed) {
  const app = E.app;
  const s = app && app.state ? app.state : null;
  if (!s) return;
  if (!s.exams) s.exams = [];
  s.exams.push({
    at: new Date().toISOString(),
    date: ymd(),
    setId: E.set.id,
    section: E.section,
    correct: res.correct,
    total: res.total,
    band: res.band,
    minutes: minutesUsed,
    per: res.per,
  });
  if (s.exams.length > 40) s.exams = s.exams.slice(-40);
  // 听力/阅读技能分：按这次正确率平滑
  const rm = res.per.reading; const lm = res.per.listening;
  if (lm) s.skills.listening = Math.round((s.skills.listening || 0) * 0.6 + (lm.correct / lm.total) * 100 * 0.4);
  if (rm) s.skills.reading = Math.round((s.skills.reading || 0) * 0.6 + (rm.correct / rm.total) * 100 * 0.4);
  addXp(s, 30 + res.correct * 2);
  refreshStats(s);
  saveNow(s);
  if (app && app.toast) app.toast('模考完成 · ' + res.correct + '/' + res.total + ' · 估分 ' + res.band.toFixed(1), '🎯');
}

function renderReview() {
  const list = document.getElementById('exam-review-list');
  if (!list) return;
  list.innerHTML =
    '<div class="exam-review-title">逐题精讲</div>' +
    E.items.map(function (it) {
      const given = E.answers[it.no];
      const ok = checkAnswer(it, given);
      let rightText = '';
      if (it.type === 'mcq' || it.type === 'match') rightText = 'ABCD'[it.answer] + '. ' + it.options[it.answer];
      else rightText = it.answer;
      let givenText = given === undefined || given === '' ? '（没答）' : (it.type === 'mcq' || it.type === 'match') ? 'ABCD'[given] + '. ' + it.options[given] : given;
      return '<div class="review-item ' + (ok ? 'ok' : 'bad') + '">' +
        '<div class="review-head"><b>Q' + it.no + '</b><span class="review-badge ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '正确' : '错误') + '</span>' +
        '<span class="review-sec">' + (it.kind === 'listening' ? 'Part ' + it.section.part : 'Passage ' + it.section.no) + '</span></div>' +
        '<div class="review-stem">' + esc(it.prompt) + '</div>' +
        '<div class="review-ans"><span>你答：' + esc(givenText) + '</span>' + (ok ? '' : '<span class="right">正确：' + esc(rightText) + '</span>') + '</div>' +
        '<div class="review-why">' + esc(it.why || '') + '</div>' +
        (it.kind === 'listening' && it.section && it.section.script ?
          '<details class="review-script"><summary>看这段听力原文</summary>' +
          it.section.script.map(function (l) { return '<p><b>' + esc(l.s) + ':</b> ' + esc(l.t) + '</p>'; }).join('') + '</details>' : '') +
        '</div>';
    }).join('');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* ---------------- 对外：成绩历史 ---------------- */

function historyStats(state) {
  const list = (state.exams || []).slice(-12);
  if (!list.length) return null;
  let best = 0; let sum = 0; let last = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].band > best) best = list[i].band;
    sum += list[i].band;
    last = list[i];
  }
  return { count: list.length, best: best, avg: Math.round((sum / list.length) * 10) / 10, last: last, list: list };
}

  return { rawToBand: rawToBand, toForty: toForty, TARGET: TARGET, flatten: flatten, examItems: examItems, norm: norm, checkAnswer: checkAnswer, scoreOf: scoreOf, startExam: startExam, historyStats: historyStats };
})();

__M["assets/data/exams-b.js"] = (function () {
// 模考 B · 阅读部分
const READING_B = {
  passages: [
    {
      no: 1,
      title: 'Why Cities Are Starting to Limit Cars',
      words: 354,
      text: [
        'For most of the twentieth century, the car sat at the centre of city planning. Every new office block had to provide parking, and streets were designed around the car. In the past fifteen years, however, a growing number of city governments have begun to reverse that logic. From Oslo to Bogotá, mayors have removed parking spaces, closed central streets to private cars and spent the savings on public transport. Several pressures arrived at once.',
        'The first is public health. Traffic is now the largest source of air pollution in many cities, and doctors link it to asthma and heart disease. When Madrid pedestrianised its central district in 2018, nitrogen dioxide on the main shopping street fell by almost a quarter within a year.',
        'The second pressure is space. A parked car occupies roughly twelve square metres, and in dense districts that land is worth far more as housing, trees or cafes. Lisbon estimates that parking takes up a fifth of the street area in its old centre. The third is money: a bus carrying sixty passengers uses a fraction of the road space of sixty cars. But the strongest argument may be safety. Cars kill more than a million people worldwide each year, most of them in cities, and Helsinki has cut serious injuries sharply by lowering speed limits and separating bicycles from traffic.',
        'Opposition is real. Shopkeepers fear that drivers will stop coming, and delivery firms warn of higher costs. Yet studies of pedestrianised streets in Vienna and Mexico City found that sales often rose, because people on foot stop more often than people in cars. Cities have also learned to soften the change. Oslo kept access for disabled drivers and allowed deliveries before eleven in the morning, and it removed parking gradually rather than all at once. Madrid placed its restrictions inside a ring road, so that drivers could still reach the centre but not cross it.',
        'Planners now argue that limiting cars is not an attack on mobility. It is a reallocation of a scarce public resource, street space, towards the majority of residents who do not drive every day.',
      ],
      groups: [
        {
          type: 'mcq',
          title: 'Questions 1–6',
          instruction: 'Choose the correct letter, A, B, C or D.',
          questions: [
            {
              no: 1,
              type: 'mcq',
              prompt: 'In the first paragraph, the phrase "that logic" refers to —',
              options: [
                'spending the savings on public transport',
                'planning streets mainly around cars',
                'closing central streets to private cars',
                'building ring roads outside the centre',
              ],
              answer: 1,
              why: '指前一句「加宽道路、配建停车位、围绕门到门出行设计街道」的以汽车为中心的规划思路。',
            },
            {
              no: 2,
              type: 'mcq',
              prompt: 'What is the passage mainly about?',
              options: [
                'Why some cities are reducing car use and how they manage the change',
                'How to design a modern bus network',
                'Why air pollution has fallen across Europe',
                'The history of the private car',
              ],
              answer: 0,
              why: '全文围绕城市限制汽车的多重原因（健康、空间、安全）与如何缓和反对（gradually、ring road）展开。',
            },
            {
              no: 3,
              type: 'mcq',
              prompt: 'What happened in Madrid after its central district was pedestrianised?',
              options: [
                'Traffic in the area moved faster',
                'Nitrogen dioxide fell by almost a quarter',
                'The number of parking spaces doubled',
                'Air pollution rose slightly',
              ],
              answer: 1,
              why: 'nitrogen dioxide on the main shopping street fell by almost a quarter within a year。',
            },
            {
              no: 4,
              type: 'mcq',
              prompt: 'Why does the writer mention twelve square metres?',
              options: [
                'To show how much a car costs to buy',
                'To show that parking uses land which could be more valuable',
                'To compare European cities with American ones',
                'To explain why cars are becoming larger',
              ],
              answer: 1,
              why: 'A parked car occupies roughly twelve square metres, and in dense districts that land is worth far more as housing, trees or cafes。',
            },
            {
              no: 5,
              type: 'mcq',
              prompt: 'How has Helsinki reduced serious injuries?',
              options: [
                'By banning all cars from the centre',
                'By lowering speed limits and separating bicycles from traffic',
                'By building more car parks',
                'By raising the price of parking',
              ],
              answer: 1,
              why: 'Helsinki has cut serious injuries sharply by lowering speed limits and separating bicycles from traffic。',
            },
            {
              no: 6,
              type: 'mcq',
              prompt: 'What did studies of pedestrianised streets in Vienna and Mexico City find?',
              options: [
                'Sales usually fell',
                'Sales often rose because people on foot stop more often',
                'Drivers spent more money than walkers',
                'Shops closed within a year',
              ],
              answer: 1,
              why: 'sales often rose, because people on foot stop more often than people in cars。',
            },
          ],
        },
        {
          type: 'tfng',
          title: 'Questions 7–10',
          instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
          questions: [
            {
              no: 7,
              type: 'tfng',
              prompt: 'Traffic is the largest source of air pollution in many cities.',
              answer: 'TRUE',
              why: 'Traffic is now the largest source of air pollution in many cities。',
            },
            {
              no: 8,
              type: 'tfng',
              prompt: 'Lisbon has banned private cars from the streets of its historic centre.',
              answer: 'NOT GIVEN',
              why: '原文只提到里斯本估计停车占用老城街道面积的五分之一，未说禁令。',
            },
            {
              no: 9,
              type: 'tfng',
              prompt: 'Oslo removed all of its central parking spaces at the same time.',
              answer: 'FALSE',
              why: 'it removed parking gradually rather than all at once，与「同时全部清除」相反。',
            },
            {
              no: 10,
              type: 'tfng',
              prompt: 'Delivery companies have welcomed plans to limit cars.',
              answer: 'FALSE',
              why: 'delivery firms warn of higher costs，是担忧而非欢迎。',
            },
          ],
        },
        {
          type: 'completion',
          title: 'Questions 11–14',
          instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS for each answer.',
          table: [
            ['Some mayors have closed central streets and spent the savings on', '11 ______'],
            ['In Madrid, nitrogen dioxide on the main shopping street fell by almost', '12 ______ within a year'],
            ['In dense districts, the land used by a parked car is worth more as housing, trees or', '13 ______'],
            ['Helsinki has cut serious injuries by separating bicycles from', '14 ______'],
          ],
          questions: [
            {
              no: 11,
              type: 'blank',
              prompt: 'Some mayors have closed central streets and spent the savings on ______.',
              answer: 'public transport',
              accept: ['public transport', 'public transportation', 'transport'],
              why: 'spent the savings on public transport。',
            },
            {
              no: 12,
              type: 'blank',
              prompt: 'In Madrid, nitrogen dioxide on the main shopping street fell by almost ______ within a year.',
              answer: 'a quarter',
              accept: ['a quarter', 'quarter', 'one quarter'],
              why: 'fell by almost a quarter within a year。',
            },
            {
              no: 13,
              type: 'blank',
              prompt: 'In dense districts, the land used by a parked car is worth more as housing, trees or ______.',
              answer: 'cafes',
              accept: ['cafes', 'cafés', 'cafes and restaurants'],
              why: 'worth far more as housing, trees or cafes。',
            },
            {
              no: 14,
              type: 'blank',
              prompt: 'Helsinki has cut serious injuries by separating bicycles from ______.',
              answer: 'traffic',
              accept: ['traffic', 'the traffic'],
              why: 'separating bicycles from traffic。',
            },
          ],
        },
      ],
    },
    {
      no: 2,
      title: 'How AI Is Changing Medical Imaging',
      words: 316,
      text: [
        'When a patient has a chest X-ray, a radiologist studies the image and writes a report. In the past five years, software trained on millions of earlier scans has begun to work alongside these specialists. The systems do not replace doctors. They sort images by urgency, flag the areas that look unusual and measure changes between one scan and the next, leaving the diagnosis to a human being.',
        'The technology behind the tools is machine learning. Instead of being given rules, the system is shown thousands of labelled examples, and it gradually learns which patterns tend to appear together. Its strengths are speed and consistency: a program can review a scan in seconds, and it does not get tired at four in the afternoon. A tired radiologist, by contrast, is more likely to miss something on the last scan of a long shift.',
        'In some fields the results are striking. Trials of AI reading mammograms have found that the software can detect cancers that human readers missed, while also producing more false alarms, which means extra tests and anxious weeks for patients. The balance between finding more disease and frightening more healthy people is exactly the kind of judgement that is hard to write into a computer.',
        'The limits matter too. A system trained mostly on images from one hospital may perform worse in another, because the equipment and the patients differ. Rare conditions are under-represented in the data, so the software sees them seldom and recognises them poorly. And when a program gives an answer, it rarely explains its reasoning, which is a problem when a doctor has to justify a decision to a patient or a colleague.',
        'Regulators in Europe now require such tools to be tested and monitored, and the general view among clinicians is that AI works best as a second reader. The machine checks the human, and the human remains responsible.',
      ],
      groups: [
        {
          type: 'mcq',
          title: 'Questions 15–19',
          instruction: 'Choose the correct letter, A, B, C or D.',
          questions: [
            {
              no: 15,
              type: 'mcq',
              prompt: 'What does the writer say about the role of AI systems in hospitals?',
              options: [
                'They have replaced radiologists in some hospitals',
                'They work alongside doctors by sorting and flagging images',
                'They are used only for research',
                'They are too slow for daily use',
              ],
              answer: 1,
              why: 'The systems do not replace doctors. They sort images ... flag the areas that look unusual。',
            },
            {
              no: 16,
              type: 'mcq',
              prompt: 'How are these systems trained?',
              options: [
                'They follow rules written by doctors',
                'They learn from thousands of labelled examples',
                'They copy the decisions of one expert',
                'They compare two scans at a time',
              ],
              answer: 1,
              why: 'Instead of being given rules, the system is shown thousands of labelled examples。',
            },
            {
              no: 17,
              type: 'mcq',
              prompt: 'What is one advantage of AI over human readers?',
              options: [
                'It never makes mistakes',
                'It does not get tired',
                'It needs no training data',
                'It explains every decision',
              ],
              answer: 1,
              why: 'it does not get tired at four in the afternoon。',
            },
            {
              no: 18,
              type: 'mcq',
              prompt: 'Why may a system perform worse in a different hospital?',
              options: [
                'The software is too expensive to install',
                'The equipment and the patients are different',
                'Doctors refuse to use it',
                'The images are stored in the wrong format',
              ],
              answer: 1,
              why: 'because the equipment and the patients differ。',
            },
            {
              no: 19,
              type: 'mcq',
              prompt: 'In the last paragraph, a "second reader" is a system that —',
              options: [
                'replaces the first doctor',
                'checks a doctor\'s first reading',
                'reads only unusual cases',
                'works without any doctor',
              ],
              answer: 1,
              why: 'The machine checks the human, and the human remains responsible。',
            },
          ],
        },
        {
          type: 'tfng',
          title: 'Questions 20–23',
          instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
          questions: [
            {
              no: 20,
              type: 'tfng',
              prompt: 'AI systems in medical imaging are designed to replace radiologists.',
              answer: 'FALSE',
              why: 'The systems do not replace doctors，人仍负责诊断。',
            },
            {
              no: 21,
              type: 'tfng',
              prompt: 'A program can review a scan in a few seconds.',
              answer: 'TRUE',
              why: 'a program can review a scan in seconds。',
            },
            {
              no: 22,
              type: 'tfng',
              prompt: 'Rare conditions are well represented in the data used to train these systems.',
              answer: 'FALSE',
              why: 'Rare conditions are under-represented in the data，与陈述相反。',
            },
            {
              no: 23,
              type: 'tfng',
              prompt: 'Hospitals in Japan have stopped using this software because of its cost.',
              answer: 'NOT GIVEN',
              why: '全文未提及日本医院或因费用停用。',
            },
          ],
        },
        {
          type: 'completion',
          title: 'Questions 24–27',
          instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS for each answer.',
          table: [
            ['The software can sort, flag and', '24 ______ images'],
            ['The system is shown thousands of', '25 ______ examples'],
            ['A program does not get tired at four in the', '26 ______'],
            ['When a program gives an answer, it rarely', '27 ______ its reasoning'],
          ],
          questions: [
            {
              no: 24,
              type: 'blank',
              prompt: 'The software can sort, flag and ______ images.',
              answer: 'measure',
              accept: ['measure', 'measures'],
              why: 'They sort images by urgency, flag ... and measure changes。',
            },
            {
              no: 25,
              type: 'blank',
              prompt: 'The system is shown thousands of ______ examples.',
              answer: 'labelled',
              accept: ['labelled', 'labeled'],
              why: 'the system is shown thousands of labelled examples。',
            },
            {
              no: 26,
              type: 'blank',
              prompt: 'A program does not get tired at four in the ______.',
              answer: 'afternoon',
              accept: ['afternoon'],
              why: 'it does not get tired at four in the afternoon。',
            },
            {
              no: 27,
              type: 'blank',
              prompt: 'When a program gives an answer, it rarely ______ its reasoning.',
              answer: 'explains',
              accept: ['explains', 'explain'],
              why: 'it rarely explains its reasoning。',
            },
          ],
        },
      ],
    },
    {
      no: 3,
      title: 'Why Museums Are Changing How They Display Objects',
      words: 305,
      text: [
        'For a long time the museum was arranged like a library of things. Objects stood in glass cases, each with a label, and rooms followed one another in chronological order. A pot was displayed as an example of a style, a period or a place, and the visitor was expected to admire it and move on.',
        'In the last twenty years many museums have changed this. Surveys showed that visitors forget label text within minutes but remember stories for years, so curators began to build exhibitions around questions rather than periods. Instead of a room called "Ceramics 1750–1800", a museum may now ask who could afford to drink tea, and let the objects answer.',
        'A second reason is ownership. Many objects were collected during colonial periods, and museums have begun to explain how each one entered the collection, and in some cases to return it. This is uncomfortable for institutions, but the panels that admit an awkward history are often the most read in the building. Returning an object can empty a case, and the empty case then needs explaining too.',
        'Digital images have changed the calculations as well. If a photograph of an object is available online in high quality, a museum no longer needs to show everything it owns. Some have opened visible storage, where the public can walk past rows of pots and see how a collection is actually kept. Storage is no longer a hidden cost but part of the visit.',
        'Not everyone is convinced. Critics warn that a museum which tells only stories may leave visitors with a feeling but no knowledge. The strongest responses combine both: a clear narrative, the object itself, well lit, and a label honest enough to say what is still unknown. That is harder than it sounds, because a good label has to be short.',
      ],
      groups: [
        {
          type: 'mcq',
          title: 'Questions 28–32',
          instruction: 'Choose the correct letter, A, B, C or D.',
          questions: [
            {
              no: 28,
              type: 'mcq',
              prompt: 'What is the passage mainly about?',
              options: [
                'The cost of looking after museum collections',
                'Why museums are rethinking their displays, and the debate it causes',
                'How to protect objects from light and heat',
                'The training of museum curators',
              ],
              answer: 1,
              why: '全文讲展陈方式为何改变（观众、归属、数字化）以及批评与折中方案。',
            },
            {
              no: 29,
              type: 'mcq',
              prompt: 'In the older approach, an object was mainly presented as —',
              options: [
                'a story about its owner',
                'an example of a style or period',
                'a problem for conservation',
                'a copy of another object',
              ],
              answer: 1,
              why: 'A pot was displayed as an example of a style, a period or a place。',
            },
            {
              no: 30,
              type: 'mcq',
              prompt: 'Why did curators begin to build exhibitions around questions?',
              options: [
                'Because labels were too expensive to print',
                'Because visitors forget labels quickly but remember stories',
                'Because objects were too big for the cases',
                'Because schools asked for them',
              ],
              answer: 1,
              why: 'Surveys showed that visitors forget label text within minutes but remember stories for years。',
            },
            {
              no: 31,
              type: 'mcq',
              prompt: 'What does the writer say about panels that admit an awkward history?',
              options: [
                'They are usually ignored',
                'They are often the most read in the building',
                'They are written by lawyers',
                'They are removed after a year',
              ],
              answer: 1,
              why: 'the panels that admit an awkward history are often the most read in the building。',
            },
            {
              no: 32,
              type: 'mcq',
              prompt: 'What are critics of the new approach worried about?',
              options: [
                'That objects will be damaged',
                'That feeling may replace knowledge',
                'That admission prices will rise',
                'That visitors will stop coming',
              ],
              answer: 1,
              why: 'a museum which tells only stories may leave visitors with a feeling but no knowledge。',
            },
          ],
        },
        {
          type: 'tfng',
          title: 'Questions 33–36',
          instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
          questions: [
            {
              no: 33,
              type: 'tfng',
              prompt: 'In the past, museum rooms usually followed one another in chronological order.',
              answer: 'TRUE',
              why: 'rooms followed one another in chronological order。',
            },
            {
              no: 34,
              type: 'tfng',
              prompt: 'Most museums have now returned the objects taken during colonial periods.',
              answer: 'FALSE',
              why: '原文只说 in some cases to return it，并非大多数已归还。',
            },
            {
              no: 35,
              type: 'tfng',
              prompt: 'High-quality online images mean that a museum no longer has to display everything it owns.',
              answer: 'TRUE',
              why: 'a museum no longer needs to show everything it owns。',
            },
            {
              no: 36,
              type: 'tfng',
              prompt: 'Visible storage areas attract more visitors than traditional galleries.',
              answer: 'NOT GIVEN',
              why: '原文只说有些博物馆开设了 visible storage，没有比较参观人数。',
            },
          ],
        },
        {
          type: 'completion',
          title: 'Questions 37–40',
          instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS for each answer.',
          table: [
            ['In the past, a museum was arranged like a', '37 ______ of things'],
            ['Exhibitions are now built around', '38 ______ rather than periods'],
            ['Museums now explain how each object', '39 ______ the collection'],
            ['The best displays combine a narrative with the object itself, well', '40 ______'],
          ],
          questions: [
            {
              no: 37,
              type: 'blank',
              prompt: 'In the past, a museum was arranged like a ______ of things.',
              answer: 'library',
              accept: ['library'],
              why: 'the museum was arranged like a library of things。',
            },
            {
              no: 38,
              type: 'blank',
              prompt: 'Exhibitions are now built around ______ rather than periods.',
              answer: 'questions',
              accept: ['questions', 'a question'],
              why: 'build exhibitions around questions rather than periods。',
            },
            {
              no: 39,
              type: 'blank',
              prompt: 'Museums now explain how each object ______ the collection.',
              answer: 'entered',
              accept: ['entered', 'enters'],
              why: 'explain how each one entered the collection。',
            },
            {
              no: 40,
              type: 'blank',
              prompt: 'The best displays combine a narrative with the object itself, well ______.',
              answer: 'lit',
              accept: ['lit', 'lighted'],
              why: 'the object itself, well lit。',
            },
          ],
        },
      ],
    },
  ],
};

  return { READING_B: READING_B };
})();

__M["assets/data/exams.js"] = (function () {
/* =========================================================
   exams.js · 真题模考套题
   两套完整的「听力 + 阅读」40 题，按雅思 Academic 的题型组织：
   单选题 / 摘要填空 / 表格填空 / 匹配。
   音频仍由浏览器语音合成朗读，所以不需要音频文件。

   题目结构：
   { type:'mcq',  prompt, options:[...], answer:0, why }
   { type:'match',prompt, options:[...], answer:1, why }
   { type:'blank',prompt, answer:'...', why, trailing }
   ========================================================= */

const SET_A = {
  /* =======================================================
     套题 A
     ======================================================= */
    id: 'setA',
    name: '模考 A · 城市绿地的四十分钟',
    subtitle: '听力 4 部分 + 阅读 3 篇，共 40 题',
    level: '5.0 – 6.0',
    listening: {
      title: 'Listening',
      minutes: 30,
      parts: [
        {
          part: 1,
          title: 'Part 1 · 预订社区活动室',
          intro: 'A conversation between a student and a community centre officer.',
          script: [
            { s: 'Receptionist', t: 'Good morning, Riverside Community Centre. How can I help?' },
            { s: 'Student', t: 'Hi, I\'d like to book a room for a graduation party. We\'re a group of about thirty people.' },
            { s: 'Receptionist', t: 'Thirty should be fine for the Garden Room. It holds up to forty. When is the party?' },
            { s: 'Student', t: 'The twenty-first of June, from seven until eleven in the evening.' },
            { s: 'Receptionist', t: 'Let me check. I\'m sorry, the Garden Room is already booked that evening. The Riverside Hall is free, but it\'s larger and a little more expensive.' },
            { s: 'Student', t: 'How much is it?' },
            { s: 'Receptionist', t: 'The Garden Room is ninety pounds for four hours. The Riverside Hall is one hundred and forty.' },
            { s: 'Student', t: 'That\'s fine. We can share the cost. Is there a kitchen we can use?' },
            { s: 'Receptionist', t: 'Yes, the hall has a small kitchen, but there\'s a fifty-pound deposit for the key. You get it back afterwards as long as everything is clean.' },
            { s: 'Student', t: 'No problem. Do we need to bring our own chairs?' },
            { s: 'Receptionist', t: 'Chairs and tables are included. You only need to bring plates and glasses, or we can hire them from the café for twenty pounds.' },
            { s: 'Student', t: 'We\'ll borrow from the café. Can I pay the deposit by card now?' },
            { s: 'Receptionist', t: 'Yes, but the booking isn\'t confirmed until the full amount is paid. The balance is due one week before the event.' },
            { s: 'Student', t: 'Understood. One last thing — is there somewhere to park?' },
            { s: 'Receptionist', t: 'There\'s a car park at the back, but it\'s for staff only. Guests usually park on Mill Street, which is free after six.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 1–5',
              instruction: 'Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.',
              table: [
                ['Event', 'graduation party'],
                ['Number of guests', '1 ______'],
                ['Date', '2 ______ June'],
                ['Room booked', '3 ______ Hall'],
                ['Cost of hall', '£ 4 ______'],
                ['Deposit for key', '£ 5 ______'],
              ],
              questions: [
                { no: 1, type: 'blank', answer: '30', accept: ['thirty', '30 people'], why: '对话开头学生说 a group of about thirty people。' },
                { no: 2, type: 'blank', answer: '21', accept: ['21st', 'twenty-first', 'twenty first'], why: 'The twenty-first of June。' },
                { no: 3, type: 'blank', answer: 'Riverside', why: 'Garden Room 已被订走，最后订的是 Riverside Hall。' },
                { no: 4, type: 'blank', answer: '140', accept: ['£140', 'one hundred and forty'], why: 'The Riverside Hall is one hundred and forty pounds.' },
                { no: 5, type: 'blank', answer: '50', accept: ['£50', 'fifty'], why: 'a fifty-pound deposit for the key。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 6–10',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 6, type: 'mcq', prompt: 'What does the hall include in the price?', options: ['Plates and glasses', 'Chairs and tables', 'A member of staff'], answer: 1, why: 'Chairs and tables are included. 餐具要么自带，要么向咖啡厅租。' },
                { no: 7, type: 'mcq', prompt: 'What will the student do about plates and glasses?', options: ['Borrow them from the café', 'Bring them from home', 'Buy paper ones'], answer: 0, why: 'We\'ll borrow from the café（花 20 镑租）。' },
                { no: 8, type: 'mcq', prompt: 'When must the full amount be paid?', options: ['When booking', 'One week before the event', 'On the day of the event'], answer: 1, why: 'The balance is due one week before the event. 注意 balance（余款）不是订金。' },
                { no: 9, type: 'mcq', prompt: 'Where can guests park?', options: ['At the back of the centre', 'On Mill Street', 'In the school car park'], answer: 1, why: '后面的停车场只给员工，客人停在 Mill Street。' },
                { no: 10, type: 'mcq', prompt: 'When is parking free?', options: ['All day', 'After six in the evening', 'At weekends only'], answer: 1, why: 'Mill Street ... is free after six。' },
              ],
            },
          ],
        },
        {
          part: 2,
          title: 'Part 2 · 社区图书馆介绍',
          intro: 'A talk given by the manager of a new community library.',
          script: [
            { s: 'Speaker', t: 'Welcome to the Northside Community Library. I\'m going to tell you a little about what we offer and how to use the building.' },
            { s: 'Speaker', t: 'The library opened three years ago in what used to be a primary school. The building was empty for almost a decade before the council decided to renovate it. We kept the original wooden floors and most of the windows, which is why the reading room is so bright.' },
            { s: 'Speaker', t: 'On the ground floor you\'ll find the children\'s section and the café. The first floor has the main collection and the quiet study area. The second floor is for meetings and events, and it can be booked by local groups free of charge.' },
            { s: 'Speaker', t: 'Membership is free for anyone who lives in the area. You can borrow up to twelve items for three weeks, and renew them twice online. We also lend laptops, which can be used inside the building only.' },
            { s: 'Speaker', t: 'Our most popular service is the homework club. It runs every weekday from four to six during term time, and it\'s staffed by volunteers, many of them retired teachers. Last year we helped more than four hundred students.' },
            { s: 'Speaker', t: 'We also run a monthly repair café. People bring broken small appliances, and volunteers show them how to fix things rather than throw them away. It takes place on the first Saturday of the month, from ten until one.' },
            { s: 'Speaker', t: 'Finally, a word about noise. The ground floor is a social space, so please talk normally. If you need silence, go up to the first floor. And please don\'t bring food into the reading areas — drinks with lids are fine.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 11–15',
              instruction: 'Complete the notes below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.',
              table: [
                ['Building was formerly a', '11 ______'],
                ['Empty for nearly', '12 ______ years'],
                ['Meeting rooms can be booked', '13 ______ of charge'],
                ['Borrow up to 14 ______ items'],
                ['Homework club runs', '15 ______ to six'],
              ],
              questions: [
                { no: 11, type: 'blank', answer: 'primary school', why: 'in what used to be a primary school。' },
                { no: 12, type: 'blank', answer: 'ten', accept: ['10'], why: 'empty for almost a decade = nearly ten years。' },
                { no: 13, type: 'blank', answer: 'free', why: 'can be booked by local groups free of charge。' },
                { no: 14, type: 'blank', answer: '12', accept: ['twelve'], why: 'borrow up to twelve items。' },
                { no: 15, type: 'blank', answer: 'four', accept: ['4', '4pm', 'four o\'clock'], why: 'every weekday from four to six。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 16–20',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 16, type: 'mcq', prompt: 'What was kept from the original building?', options: ['The wooden floors', 'The furniture', 'The library shelves'], answer: 0, why: 'We kept the original wooden floors and most of the windows.' },
                { no: 17, type: 'mcq', prompt: 'Laptops borrowed from the library —', options: ['can be taken home', 'must stay in the building', 'cost a small fee'], answer: 1, why: 'can be used inside the building only。' },
                { no: 18, type: 'mcq', prompt: 'Who runs the homework club?', options: ['Paid librarians', 'Retired teachers and other volunteers', 'University students only'], answer: 1, why: 'staffed by volunteers, many of them retired teachers。' },
                { no: 19, type: 'mcq', prompt: 'The repair café takes place —', options: ['every Saturday', 'once a month', 'twice a year'], answer: 1, why: 'monthly ... on the first Saturday of the month。' },
                { no: 20, type: 'mcq', prompt: 'What is allowed in the reading areas?', options: ['Hot food', 'Drinks with lids', 'Loud conversation'], answer: 1, why: 'don\'t bring food into the reading areas — drinks with lids are fine。' },
              ],
            },
          ],
        },
        {
          part: 3,
          title: 'Part 3 · 讨论一份野外考察报告',
          intro: 'Two students, Maya and Leo, discuss their field trip report with their tutor.',
          script: [
            { s: 'Tutor', t: 'So, how did the report on the field trip come together?' },
            { s: 'Maya', t: 'It was harder than we expected. We collected a lot of data on the first day, but the weather changed on the second day, so some of our measurements were not comparable.' },
            { s: 'Leo', t: 'We decided to use only the first day\'s data for the analysis. It\'s not ideal, but at least the figures are consistent.' },
            { s: 'Tutor', t: 'That\'s a reasonable decision, as long as you explain it clearly in the method section. What did you find most difficult?' },
            { s: 'Maya', t: 'For me it was the statistics. We had never used that software before, and the tutorial only covered the basics. Leo spent a whole evening working out how to plot the results.' },
            { s: 'Leo', t: 'The graphs were the easy part, actually. What took the time was checking the data — we found two entries that had been recorded in the wrong column.' },
            { s: 'Tutor', t: 'Good catch. Did that change your conclusions?' },
            { s: 'Maya', t: 'Not the main one. The pattern was still clear. But it did make us less confident about the smaller differences between the sites.' },
            { s: 'Tutor', t: 'Fine. For the presentation, I\'d suggest focusing on one site rather than all three. You have twenty minutes, and that\'s not enough for a detailed comparison.' },
            { s: 'Leo', t: 'We were thinking of using the river site, because it had the most variation.' },
            { s: 'Tutor', t: 'Good choice. And leave time for questions — last year\'s group ran out of time and lost marks for that.' },
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 21–26',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 21, type: 'mcq', prompt: 'Why did the students use only the first day\'s data?', options: ['The second day\'s data was lost', 'The weather made the measurements inconsistent', 'The tutor asked them to'], answer: 1, why: 'the weather changed ... some of our measurements were not comparable。' },
                { no: 22, type: 'mcq', prompt: 'What does the tutor advise them to do?', options: ['Collect more data', 'Explain the decision in the method section', 'Remove the second day from the report'], answer: 1, why: 'as long as you explain it clearly in the method section。' },
                { no: 23, type: 'mcq', prompt: 'What did Maya find most difficult?', options: ['Writing the introduction', 'Using the statistics software', 'Working with Leo'], answer: 1, why: 'For me it was the statistics ... never used that software before。' },
                { no: 24, type: 'mcq', prompt: 'What took Leo the most time?', options: ['Drawing the graphs', 'Checking the data for errors', 'Reading the tutorial'], answer: 1, why: 'What took the time was checking the data。注意 graph 是 easy part。' },
                { no: 25, type: 'mcq', prompt: 'How did the errors affect their conclusions?', options: ['They changed the main conclusion', 'They made them less sure about small differences', 'They had no effect at all'], answer: 1, why: 'Not the main one ... less confident about the smaller differences。' },
                { no: 26, type: 'mcq', prompt: 'What does the tutor recommend for the presentation?', options: ['Compare all three sites', 'Focus on one site', 'Use more graphs'], answer: 1, why: 'focusing on one site rather than all three。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 27–30',
              instruction: 'Complete the sentences below. Write ONE WORD ONLY for each answer.',
              table: [
                ['The presentation will last for 27 ______ minutes.', ''],
                ['They will focus on the 28 ______ site.', ''],
                ['That site had the most 29 ______.', ''],
                ['They must leave time for 30 ______.', ''],
              ],
              questions: [
                { no: 27, type: 'blank', answer: '20', accept: ['twenty'], why: 'You have twenty minutes。' },
                { no: 28, type: 'blank', answer: 'river', why: 'using the river site。' },
                { no: 29, type: 'blank', answer: 'variation', why: 'because it had the most variation。' },
                { no: 30, type: 'blank', answer: 'questions', why: 'leave time for questions。' },
              ],
            },
          ],
        },
        {
          part: 4,
          title: 'Part 4 · 讲座：城市需要野一点',
          intro: 'A lecture on urban rewilding.',
          script: [
            { s: 'Speaker', t: 'Today I want to talk about a movement called urban rewilding. The idea is simple: instead of keeping every patch of city land tidy and controlled, we allow nature to take part of it back.' },
            { s: 'Speaker', t: 'The first thing to understand is that a city is not a desert. Even a small park can support a surprising number of species. In one study in Berlin, researchers found more than sixty kinds of bee in a single cemetery. The reason is that cemeteries are quiet, they are not sprayed with chemicals, and the grass is cut less often than in public parks.' },
            { s: 'Speaker', t: 'So what does rewilding actually look like? In practice it usually means three things: planting native species rather than exotic ones, cutting grass less frequently, and leaving some dead wood and fallen leaves in place. That last point is important. Many insects and fungi depend on dead wood, and fallen leaves provide shelter over winter.' },
            { s: 'Speaker', t: 'There are also benefits for people. Green spaces with more variety tend to be cooler in summer, because trees and long grass hold water and provide shade. They also absorb rainwater more effectively, which reduces the risk of flooding after heavy storms. And several studies suggest that spending time in less managed green spaces is associated with lower levels of stress.' },
            { s: 'Speaker', t: 'Of course, not everyone is happy. Some residents see long grass as untidy, and a few councils have been criticised for letting areas become overgrown. This is why communication matters. Where projects explain the reasons and mark the areas clearly, public support is usually much higher.' },
            { s: 'Speaker', t: 'The lesson, I think, is that rewilding is not about abandoning a place. It is about managing it differently, and accepting that a city can be both cared for and a little wild.' },
          ],
          groups: [
            {
              type: 'completion',
              title: 'Questions 31–34',
              instruction: 'Complete the notes below. Write NO MORE THAN TWO WORDS for each answer.',
              table: [
                ['In Berlin, 60+ kinds of bee found in one', '31 ______'],
                ['Rewilding: plant native species, cut grass less, leave', '32 ______ and fallen leaves'],
                ['More variety means cooler summer and less', '33 ______'],
                ['Main objection from residents: areas look', '34 ______'],
              ],
              questions: [
                { no: 31, type: 'blank', answer: 'cemetery', why: 'more than sixty kinds of bee in a single cemetery。' },
                { no: 32, type: 'blank', answer: 'dead wood', why: 'leaving some dead wood and fallen leaves in place。' },
                { no: 33, type: 'blank', answer: 'flooding', why: 'absorb rainwater more effectively, which reduces the risk of flooding。' },
                { no: 34, type: 'blank', answer: 'untidy', why: 'Some residents see long grass as untidy。' },
              ],
            },
            {
              type: 'mcq',
              title: 'Questions 35–40',
              instruction: 'Choose the correct letter, A, B or C.',
              questions: [
                { no: 35, type: 'mcq', prompt: 'What is urban rewilding mainly about?', options: ['Building more parks', 'Allowing nature to take part of the land back', 'Removing all grass'], answer: 1, why: 'allow nature to take part of it back。' },
                { no: 36, type: 'mcq', prompt: 'Why do cemeteries support so many bees?', options: ['They are sprayed regularly', 'They are quiet and less managed', 'They have many flowers planted'], answer: 1, why: 'quiet, not sprayed, grass cut less often。' },
                { no: 37, type: 'mcq', prompt: 'Why is dead wood important?', options: ['It looks natural', 'Insects and fungi depend on it', 'It stops grass growing'], answer: 1, why: 'Many insects and fungi depend on dead wood。' },
                { no: 38, type: 'mcq', prompt: 'Which benefit for people is mentioned?', options: ['Lower temperatures in summer', 'More space for cars', 'Cheaper housing'], answer: 0, why: 'Green spaces with more variety tend to be cooler in summer。' },
                { no: 39, type: 'mcq', prompt: 'Why do some residents object?', options: ['They fear animals', 'They think areas look untidy', 'They want more parking'], answer: 1, why: 'Some residents see long grass as untidy。' },
                { no: 40, type: 'mcq', prompt: 'What is the speaker\'s conclusion?', options: ['Cities should stop managing green spaces', 'Rewilding means managing land differently', 'Only rural areas can be wild'], answer: 1, why: 'It is about managing it differently。' },
              ],
            },
          ],
        },
      ],
    },

    reading: {
      title: 'Reading',
      minutes: 60,
      passages: [
        {
          no: 1,
          title: 'The Quiet Revolution of Remote Work',
          words: 320,
          text: [
            'For most of the twentieth century, the office was the natural home of professional work. Employees travelled to a building, sat at a desk, and were supervised in person. That model began to weaken in the 2010s, when faster internet and cheaper laptops made it possible to work from almost anywhere. Then, in 2020, the change became sudden rather than gradual. Within a few weeks, millions of people who had never worked from home were doing so full-time.',
            'The results were mixed, but not in the way many predicted. Early forecasts suggested that productivity would fall sharply. In fact, several large studies found that output stayed roughly the same, and in some tasks it improved. Workers saved time on commuting, and they reported fewer interruptions. However, the gains were uneven. Tasks that required concentration — writing, coding, analysis — often went better at home. Tasks that depended on quick exchanges with colleagues sometimes became slower.',
            'There was also a cost that was harder to measure. New employees, in particular, struggled. Learning how an organisation works depends heavily on overhearing conversations and copying the behaviour of experienced colleagues. A person who joins a company remotely may understand the formal rules but miss the unwritten ones. Several firms reported that their new staff took longer to become fully effective.',
            'The compromise that has emerged is hybrid work: some days in the office, some at home. Yet the details matter more than the label. A team that meets on the same two days each week behaves very differently from one where everyone chooses independently. The former keeps the social contact that supports learning; the latter gives individuals more control but can leave offices half-empty and teams fragmented.',
            'What seems clear is that the office will not disappear, but it will no longer be the default. The most successful organisations appear to be those that treat location as a design question rather than a rule: deciding, task by task, where the work is done best.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 1–7',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 1, type: 'mcq', prompt: 'What does the writer say about the change to remote work in 2020?', options: ['It had been planned for years', 'It happened very quickly', 'It affected only small companies', 'It was caused by new laws'], answer: 1, why: 'the change became sudden rather than gradual ... within a few weeks。' },
                { no: 2, type: 'mcq', prompt: 'Early forecasts about productivity were —', options: ['accurate', 'too optimistic', 'too pessimistic', 'never tested'], answer: 2, why: '预测会大幅下降，实际基本持平甚至提高 → 过于悲观。' },
                { no: 3, type: 'mcq', prompt: 'Which tasks tended to improve at home?', options: ['Tasks needing concentration', 'Tasks needing quick exchange', 'Tasks involving new staff', 'Tasks requiring supervision'], answer: 0, why: 'Tasks that required concentration often went better at home。' },
                { no: 4, type: 'mcq', prompt: 'Why did new employees struggle?', options: ['They lacked equipment', 'They missed informal learning', 'They were paid less', 'They had longer commutes'], answer: 1, why: 'depends heavily on overhearing conversations and copying behaviour。' },
                { no: 5, type: 'mcq', prompt: 'What problem does the writer identify with independent hybrid choices?', options: ['Higher costs', 'Offices half-empty and teams fragmented', 'Slower internet', 'More meetings'], answer: 1, why: 'can leave offices half-empty and teams fragmented。' },
                { no: 6, type: 'mcq', prompt: 'The phrase "the unwritten ones" refers to —', options: ['formal rules', 'informal ways of working', 'contracts', 'emails'], answer: 1, why: '对应前句 the formal rules 之外的「不成文规矩」。' },
                { no: 7, type: 'mcq', prompt: 'What is the writer\'s overall view?', options: ['Offices should be abolished', 'Everyone should work from home', 'Location should be decided task by task', 'Hybrid work has failed'], answer: 2, why: 'treat location as a design question rather than a rule。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 8–10',
              instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.',
              table: [
                ['In 2020 remote work changed suddenly rather than', '8 ______'],
                ['Tasks that needed quick exchanges with colleagues became', '9 ______'],
                ['Hybrid teams that meet on fixed days keep the social contact that supports', '10 ______'],
              ],
              questions: [
                { no: 8, type: 'blank', answer: 'gradually', why: 'the change became sudden rather than gradual（题干用原形 gradually）。' },
                { no: 9, type: 'blank', answer: 'slower', why: 'Tasks that depended on quick exchanges ... sometimes became slower。' },
                { no: 10, type: 'blank', answer: 'learning', why: 'keeps the social contact that supports learning。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 11–13',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 11, type: 'tfng', prompt: 'All employees became more productive when they worked from home.', answer: 'FALSE', why: '原文说 gains were uneven，部分任务变慢，并非所有人都提高。' },
                { no: 12, type: 'tfng', prompt: 'Some firms found that new staff took longer to become fully effective.', answer: 'TRUE', why: 'Several firms reported that their new staff took longer to become fully effective。' },
                { no: 13, type: 'tfng', prompt: 'Most companies have now closed their offices completely.', answer: 'NOT GIVEN', why: '原文只说 office will not disappear，没有提「大多数公司关闭办公室」。' },
              ],
            },
          ],
        },
        {
          no: 2,
          title: 'Rewilding the City',
          words: 330,
          text: [
            'A few years ago, the council of a mid-sized European city made an unexpected decision. Instead of mowing a large riverside park every two weeks, it would cut the grass only twice a year. The change cost almost nothing and saved money on fuel. Within three years, the number of insect species in the park had risen by nearly a third, and the park had become one of the most visited places in the city.',
            'This is one small example of what has come to be called urban rewilding. The term is deliberately loose. It can mean planting wildflower meadows on roundabouts, allowing a corner of a park to grow into scrub, or simply leaving fallen leaves where they land. What these projects share is a willingness to give up a little control.',
            'The ecological argument is straightforward. Cities cover only a small fraction of the Earth\'s surface, but they expand into land that was once habitat. A garden, a railway embankment or a cemetery can act as a stepping stone, allowing species to move between larger areas. Connectivity matters as much as the size of any single site.',
            'There are economic arguments too. Long grass and trees cool the air, reducing the need for air conditioning in nearby buildings. They also hold rainwater, which lowers the risk of flooding during heavy storms — a problem that is becoming more expensive as the climate changes. Some cities have calculated that the savings from avoided flood damage are many times the cost of the rewilding itself.',
            'Yet the idea has opponents. Some residents associate long grass with neglect, and councils have been accused of using rewilding as an excuse to cut maintenance budgets. The objection is not unreasonable: a badly managed site can look abandoned and can attract litter. Successful projects tend to share certain features. They explain what is happening, using signs and public meetings. They mow a clear path through the long grass so that the area still feels cared for. And they are honest about the trade-offs.',
            'Perhaps the most important lesson is about patience. A meadow takes several years to establish, and the first summer may look worse than the mown lawn it replaced. Cities that have succeeded are those that were willing to wait, and to explain the wait to the people who live there.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 14–20',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 14, type: 'mcq', prompt: 'What was the result of mowing the park less often?', options: ['Fewer visitors', 'More insect species and more visitors', 'Higher costs', 'A new car park'], answer: 1, why: 'insect species risen by nearly a third；park 成为最受欢迎的地方之一。' },
                { no: 15, type: 'mcq', prompt: 'The term "urban rewilding" is described as —', options: ['precisely defined', 'deliberately loose', 'outdated', 'controversial in science'], answer: 1, why: 'The term is deliberately loose。' },
                { no: 16, type: 'mcq', prompt: 'Why are small sites important?', options: ['They are cheaper to manage', 'They act as stepping stones between habitats', 'They attract tourists', 'They produce food'], answer: 1, why: 'can act as a stepping stone ... Connectivity matters。' },
                { no: 17, type: 'mcq', prompt: 'One economic benefit mentioned is —', options: ['higher property prices', 'reduced flood risk', 'more parking spaces', 'cheaper food'], answer: 1, why: 'hold rainwater, which lowers the risk of flooding。' },
                { no: 18, type: 'mcq', prompt: 'Why do some residents object?', options: ['They dislike insects', 'They think the areas look neglected', 'They want more houses', 'They are worried about safety'], answer: 1, why: 'associate long grass with neglect。' },
                { no: 19, type: 'mcq', prompt: 'Which feature do successful projects share?', options: ['They hide the changes', 'They mow clear paths and explain', 'They remove all signs', 'They close the area to the public'], answer: 1, why: 'explain what is happening ... mow a clear path。' },
                { no: 20, type: 'mcq', prompt: 'What does the writer say about patience?', options: ['Results appear immediately', 'The first summer may look worse', 'It is not necessary', 'Only scientists need it'], answer: 1, why: 'the first summer may look worse than the mown lawn。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 21–23',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 21, type: 'tfng', prompt: 'Cutting grass less often saved the council money.', answer: 'TRUE', why: 'The change cost almost nothing and saved money on fuel。' },
                { no: 22, type: 'tfng', prompt: 'Rewilding projects always cost more than traditional maintenance.', answer: 'FALSE', why: '原文强调「省钱」与「避免洪水损失的收益是成本的很多倍」，与陈述相反。' },
                { no: 23, type: 'tfng', prompt: 'Most residents in the city supported the project immediately.', answer: 'NOT GIVEN', why: '只说了有反对者，没有给出支持比例。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 24–27',
              instruction: 'Complete the sentences below. Write ONE WORD ONLY for each answer.',
              table: [
                ['The city cut the grass only', '24 ______ a year.'],
                ['Small sites allow species to move between larger areas, so connectivity matters as much as', '25 ______.'],
                ['Long grass and trees hold rainwater and lower the risk of', '26 ______.'],
                ['A badly managed site can look abandoned and attract', '27 ______.'],
              ],
              questions: [
                { no: 24, type: 'blank', answer: 'twice', why: 'cut the grass only twice a year。' },
                { no: 25, type: 'blank', answer: 'size', why: 'Connectivity matters as much as the size of any single site。' },
                { no: 26, type: 'blank', answer: 'flooding', why: 'lowers the risk of flooding。' },
                { no: 27, type: 'blank', answer: 'litter', why: 'can look abandoned and can attract litter。' },
              ],
            },
          ],
        },
        {
          no: 3,
          title: 'Why We Forget',
          words: 340,
          text: [
            'Memory is often compared to a cupboard or a hard drive, a place where information is stored until it is needed. This metaphor is convenient, but it is wrong in an important way. Forgetting is not usually a failure of storage. More often, it is a failure of retrieval, or a sign that the information was never encoded in a form the brain could use later.',
            'Consider what happens when you meet someone at a party. You hear their name, repeat it once, and continue the conversation. A minute later the name is gone. This is not because your brain is full. It is because the name was processed shallowly: you heard the sound but did not connect it to anything you already knew. Information that is linked to existing knowledge is far more likely to survive.',
            'This finding has a practical consequence. Rereading a textbook feels productive because the material becomes familiar. But familiarity is not the same as memory. In experiments, students who reread a passage several times often perform worse than students who read it once and then try to recall it. The effort of recall, even when it fails, strengthens the memory more than passive exposure does.',
            'The timing of review matters as well. Memory weakens quickly at first and then more slowly. Reviewing soon after learning, and again after a longer gap, produces better long-term retention than the same amount of study concentrated in one session. This is the principle behind spaced repetition, which is now used in language learning apps and medical training.',
            'There is also a social dimension. People remember information better when they expect to teach it to someone else, or when they discuss it with others. Explaining an idea forces you to notice the gaps in your understanding, and those gaps are exactly what you need to work on.',
            'None of this makes memory effortless. It does, however, suggest that the strategies we usually rely on — highlighting, rereading, copying notes — are among the least effective. What works is harder: retrieving, spacing, and explaining.',
          ],
          groups: [
            {
              type: 'mcq',
              title: 'Questions 28–34',
              instruction: 'Choose the correct letter, A, B, C or D.',
              questions: [
                { no: 28, type: 'mcq', prompt: 'The writer says the cupboard metaphor is wrong because —', options: ['memory has no limit', 'forgetting is often a retrieval problem', 'the brain stores too much', 'memory is not physical'], answer: 1, why: 'Forgetting is not usually a failure of storage ... failure of retrieval。' },
                { no: 29, type: 'mcq', prompt: 'Why do we forget a name heard at a party?', options: ['The brain is full', 'The name was processed shallowly', 'Names are harder than faces', 'We did not like the person'], answer: 1, why: 'the name was processed shallowly。' },
                { no: 30, type: 'mcq', prompt: 'What do experiments show about rereading?', options: ['It is the best method', 'It feels productive but is less effective than recall', 'It should be done three times', 'It prevents forgetting completely'], answer: 1, why: 'familiarity is not the same as memory ... perform worse than students who ... try to recall。' },
                { no: 31, type: 'mcq', prompt: 'What is the principle behind spaced repetition?', options: ['Study everything the night before', 'Review soon, then again after longer gaps', 'Never review', 'Study only when motivated'], answer: 1, why: 'Reviewing soon after learning, and again after a longer gap。' },
                { no: 32, type: 'mcq', prompt: 'Why does explaining help memory?', options: ['It makes learning faster', 'It reveals gaps in understanding', 'It replaces revision', 'It reduces stress'], answer: 1, why: 'forces you to notice the gaps in your understanding。' },
                { no: 33, type: 'mcq', prompt: 'Which strategies does the writer call least effective?', options: ['Retrieval and spacing', 'Highlighting and rereading', 'Explaining to others', 'Testing yourself'], answer: 1, why: 'highlighting, rereading, copying notes — among the least effective。' },
                { no: 34, type: 'mcq', prompt: 'The overall tone of the passage is —', options: ['discouraging', 'informative and practical', 'humorous', 'uncertain'], answer: 1, why: '给出研究发现与可操作建议，语气是「说明 + 实用」。' },
              ],
            },
            {
              type: 'tfng',
              title: 'Questions 35–37',
              instruction: 'Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.',
              questions: [
                { no: 35, type: 'tfng', prompt: 'The effort of trying to recall something can strengthen memory even when the attempt fails.', answer: 'TRUE', why: 'The effort of recall, even when it fails, strengthens the memory。' },
                { no: 36, type: 'tfng', prompt: 'Spaced repetition is only used in language learning.', answer: 'FALSE', why: '原文说 language learning apps and medical training。' },
                { no: 37, type: 'tfng', prompt: 'The writer believes that memory can be made effortless.', answer: 'FALSE', why: 'None of this makes memory effortless。' },
              ],
            },
            {
              type: 'completion',
              title: 'Questions 38–40',
              instruction: 'Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.',
              table: [
                ['A name is forgotten because it was processed', '38 ______'],
                ['Information linked to existing knowledge is more likely to', '39 ______'],
                ['Effective strategies include retrieving, spacing and', '40 ______'],
              ],
              questions: [
                { no: 38, type: 'blank', answer: 'shallowly', why: 'the name was processed shallowly。' },
                { no: 39, type: 'blank', answer: 'survive', why: 'far more likely to survive。' },
                { no: 40, type: 'blank', answer: 'explaining', why: 'What works is harder: retrieving, spacing, and explaining。' },
              ],
            },
          ],
        },
      ],
    },
};

const { READING_B } = __M["assets/data/exams-b.js"];

/** 套题 B：目前只有阅读（40 题），听力部分留空但不影响模考 */
const SET_B = {
  id: 'setB',
  name: '模考 B · 阅读专练',
  subtitle: '3 篇文章 · 40 题 · 只测阅读',
  level: '5.5 – 6.5',
  listening: null,
  reading: {
    title: 'Reading',
    minutes: 60,
    passages: READING_B.passages,
  },
};

const EXAM_SETS = [SET_A, SET_B];

  return { EXAM_SETS: EXAM_SETS };
})();

__M["assets/app.js"] = (function () {
/* =========================================================
   app.js · 应用主控
   视图渲染 / 会话流程 / 结算 / 数据管理
   ========================================================= */

const { load, save, saveNow, reset, ymd, addDays, daysBetween, dueWords, masteryOf, refreshStats, streakOf, checkBadges, completeDay, isDone, levelOf, addXp, today, BADGES, exportJson, importJson, rateWord, reviewPlan, REVIEW_CAP, listBackups, loadBackup } = __M["assets/store.js"];
const { WEEKS, allDays, dayInfo, candidateDay, estimatedMinutes, VOCAB, cycleOf, courseDayOf, cycleLabel, CYCLE_LEN } = __M["assets/course.js"];
const { treeSvg, mountTree, stageOf, nextStageOf, STAGES, flyLeaf } = __M["assets/tree.js"];
const { renderVocab, renderReading, renderListening, renderWriting, renderSpeaking, el } = __M["assets/drills.js"];
const { Speech, ACCENTS } = __M["assets/speech.js"];
const { startExam, historyStats, rawToBand, TARGET, examItems } = __M["assets/exam.js"];
const { EXAM_SETS } = __M["assets/data/exams.js"];

/* ---------------- 状态 ---------------- */

let S = load();
let view = 'home';
let session = null;
const $ = function (id) { return document.getElementById(id); };

refreshStats(S);

/* ---------------- 时间与打卡 ---------------- */

function studyInfo() {
  const today = ymd();
  const dates = Object.keys(S.progress.completed || {}).sort();
  let lastDate = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = S.progress.completed[dates[i]];
    if (d && d.at) { lastDate = String(d.at).slice(0, 10); break; }
  }
  const doneToday = !!(S.days[today] && S.days[today].done);
  const lastNum = S.progress.lastDayDone || 0;
  // 不封顶：第 29 天 = 第 2 轮的第 1 天，一路往后排
  const nextDay = lastNum + 1;
  return { today: today, lastDate: lastDate, doneToday: doneToday, nextDay: nextDay, gap: lastDate ? daysBetween(lastDate, today) : null, lastNum: lastNum };
}

/* ---------------- 分数估算 ---------------- */

/**
 * 估分：以「最近一次模考」为锚，练习表现只能在锚点 ±0.5 内微调。
 * 旧公式把 30% 权重给了「完成天数」，等于坚持点满就能涨分——那个数字是假的，已删。
 * 没有模考记录时不给分数，直接显示「—」。
 */
function bandEstimate() {
  const h = historyStats(S);
  const mock = h && h.last ? h.last.band : null;
  const sk = skillsScores();
  const skillAvg = (sk[0].v + sk[1].v + sk[2].v + sk[3].v + sk[4].v) / 5;
  const acc = S.stats.answers > 0 ? S.stats.correct / S.stats.answers : 0;
  // 练习表现折算到 4.0–6.5：自评/正确率越高，锚点允许往上浮
  const practice = 4.0 + (skillAvg / 100) * 1.5 + acc * 1.0;

  if (mock === null) {
    return { has: false, band: null, mock: null, practice: practice, pct: 0, acc: acc };
  }
  const band = Math.max(mock - 0.5, Math.min(mock + 0.5, practice));
  return {
    has: true,
    band: Math.round(band * 2) / 2,
    mock: mock,
    practice: practice,
    pct: Math.max(0.04, Math.min(1, (band - 4.0) / 2.5)),
    acc: acc,
  };
}

/** 分数文本：没模考就显示破折号，不编一个数字出来 */
function bandText(b) {
  return b && b.has && b.band !== null ? b.band.toFixed(1) : '—';
}

function bandLabel(b) {
  if (b === null || b === undefined) return '还没有模考成绩';
  if (b < 4.6) return 'CET4 起步';
  if (b < 5.0) return '接近 5.0';
  if (b < 5.5) return '约 5.0–5.5';
  if (b < 6.0) return '接近 6.0';
  return '已到 6.0 区间';
}

/* ---------------- Toast / Sheet ---------------- */

function toast(msg, icon) {
  const wrap = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span class="t-ico">' + (icon || '🌿') + '</span><span>' + msg + '</span>';
  wrap.appendChild(t);
  setTimeout(function () {
    t.classList.add('out');
    setTimeout(function () { t.remove(); }, 320);
  }, 2600);
}

function openSheet(html) {
  const sheet = $('sheet');
  $('sheet-card').innerHTML = html;
  sheet.hidden = false;
  sheet.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { hideSheet(); });
  });
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) hideSheet();
  });
  return $('sheet-card');
}

function hideSheet() { $('sheet').hidden = true; }

/* ---------------- 顶栏 / 侧栏 ---------------- */

function renderChrome() {
  const t = studyInfo();
  const now = new Date();
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  $('today-date').textContent = (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + weekNames[now.getDay()];
  const hour = now.getHours();
  const greet = t.doneToday ? '今天的 30 分钟已经种下去了' : hour < 11 ? '早上好，先来 30 分钟' : hour < 19 ? '下午好，用 30 分钟换一片叶子' : '晚上好，今天还来得及';
  $('today-greet').textContent = greet;

  $('streak-num').textContent = streakOf(S);
  $('xp-num').textContent = S.xp || 0;

  const b = bandEstimate();
  $('side-band').textContent = bandText(b);
  $('side-band-bar').style.width = Math.max(4, Math.round(b.pct * 100)) + '%';
  $('side-band-note').textContent = b.has
    ? '模考 ' + b.mock.toFixed(1) + ' · 估分 ' + bandLabel(b.band) + ' · 非官方'
    : '做一次模考才有分数 · 非官方';
}

/* =========================================================
   今日视图
   ========================================================= */

function renderHome() {
  const t = studyInfo();
  const dayNo = t.doneToday ? Math.max(1, t.nextDay - 1) : t.nextDay;
  const info = dayInfo(dayNo);
  const st = stageOf(S.stats.days);
  const nx = nextStageOf(S.stats.days);
  const rp = reviewPlan(S);
  const due = rp.due;
  const tasks = taskListFor(info, Math.min(due, REVIEW_CAP));
  const doneKeys = t.doneToday ? tasks.map(function (x) { return x.key; }) : [];
  const cyc = cycleLabel(info);

  const b = bandEstimate();
  const weekDelta = weekLearned();

  const root = $('view');
  root.innerHTML =
    '<div class="hero">' +
    '  <section class="stage-card">' +
    '    <div class="stage-head">' +
    '      <div><div class="eyebrow">YOUR GROWTH TREE</div>' +
    '        <h1 class="stage-name">' + st.name + ' · ' + st.en + '</h1>' +
    '        <p class="stage-desc">' + st.desc + '</p></div>' +
    '      <div class="stage-badge"><b>' + S.stats.days + '<small style="font-size:12px">/28</small></b><span>已完成天数</span></div>' +
    '    </div>' +
    '    <div class="tree-wrap" id="home-tree"></div>' +
    '    <div class="stage-foot">' +
    '      <div class="leaf-count"><b>' + S.stats.learned + '</b><span>个词 · 长成一片树冠</span></div>' +
    '      <div class="grow-hint">' + (nx ? '再完成 ' + (nx.days - S.stats.days) + ' 天 → ' + nx.name : '这棵树已经长满，接下来是复习') + '</div>' +
    '    </div>' +
    '  </section>' +

    '  <section class="card mission">' +
    '    <div class="mission-top">' +
    ringSvg(t.doneToday ? 1 : S.stats.days / 28) +
    '      <div><h2 class="mission-title">' + (t.doneToday ? '今天已完成' : '今天的 30 分钟') + '</h2>' +
    '        <p class="mission-sub">第 ' + dayNo + ' 天' + (cyc ? ' · ' + cyc : '') + ' · ' + esc(info.title) + '</p></div>' +
    '    </div>' +
    '    <p class="mission-text">' + esc(info.quote) + '</p>' +
    '    <ul class="task-list" id="task-list">' +
    tasks.map(function (x, i) {
      return '<li class="task ' + (doneKeys.indexOf(x.key) >= 0 ? 'done' : '') + '">' +
        '<div class="task-ico">' + taskIcon(x.key) + '</div>' +
        '<div class="task-main"><b>' + esc(x.name) + '</b><span>' + esc(x.desc) + '</span></div>' +
        '<span class="task-time">' + x.minutes + ' 分</span></li>';
    }).join('') +
    '    </ul>' +
    '    <div class="mission-cta">' +
    (t.doneToday
      ? '<button class="btn primary block lg" id="btn-extra" type="button">继续学第 ' + (dayNo + 1) + ' 天（可选）→</button>' +
        (due ? '<button class="btn block lg" id="btn-review" type="button">只复习到期的 ' + Math.min(due, REVIEW_CAP) + ' 个词</button>' : '') +
        '<div class="mission-foot"><span>第 ' + (dayNo + 1) + ' 天' + (cycleOf(dayNo + 1) > 1 ? ' · 第 ' + cycleOf(dayNo + 1) + ' 轮' : '') + ' 也会记进档案</span><span>' + (due ? '有 ' + due + ' 个词到期' + (rp.backlog > 0 ? '，还欠 ' + rp.backlog + ' 个' : '') : '暂无到期复习') + '</span></div>'
      : '<button class="btn primary block lg" id="btn-start" type="button">开始今天的 30 分钟 →</button>' +
        '<div class="mission-foot"><span>约 ' + estimatedMinutes(info, Math.min(due, REVIEW_CAP)) + ' 分钟 · ' + tasks.length + ' 个环节</span><span>想中断随时可以退出，已做的会保存</span></div>') +
    '    </div>' +
    '  </section>' +
    '</div>' +

    // 数据条
    '<div class="stats">' +
    statCard('学会的词', S.stats.learned, '个词已进入记忆', weekDelta > 0 ? '本周 +' + weekDelta : '本周暂无新增', '🌿') +
    statCard('学习天数', S.stats.days, '天 · 已学 ' + (S.progress.lastDayDone || 0) + ' 个课日', '累计 ' + Math.round(S.stats.minutes) + ' 分钟', '📅') +
    statCard('牢记', S.stats.mastered, '个词已进入长期记忆', '正确率 ' + (S.stats.answers ? Math.round((S.stats.correct / S.stats.answers) * 100) : 0) + '%', '💎') +
    statCard('估分', bandText(b), b.has ? '模考 ' + b.mock.toFixed(1) + ' 为锚 · 非官方' : '还没有模考记录', b.has ? bandLabel(b.band) : '先做一次模考', '🎯') +
    '</div>' +

    // 热力图 + 技能
    '<div class="grid-2">' +
    '  <section class="card card-pad">' +
    '    <div class="card-head"><h3 class="card-title">最近的坚持 <em>HEATMAP</em></h3><span class="card-sub">最近 12 周 · 颜色越深学得越久</span></div>' +
    heatmapHtml() +
    '    <div class="hm-legend">少 <i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i> 多</div>' +
    '  </section>' +
    '  <section class="card card-pad">' +
    '    <div class="card-head"><h3 class="card-title">五项能力 <em>SKILLS</em></h3></div>' +
    '    <div class="radar-wrap">' +
    radarSvg() +
    '      <div class="skill-list">' + skillRows() + '</div>' +
    '    </div>' +
    '  </section>' +
    '</div>' +

    // 进度条 + 徽章
    '<div class="grid-2">' +
    '  <section class="card card-pad">' +
    '    <div class="card-head"><h3 class="card-title">28 天路线 <em>ROADMAP</em></h3><span class="card-sub">' + WEEKS.length + ' 个阶段 · 每天解锁一天</span></div>' +
    '    <div class="road">' + roadHtml(t) + '</div>' +
    '    <div class="day-strip">' +
    '      <span>当前：<b>第 ' + dayNo + ' 天</b>' + (cyc ? ' · ' + cyc : '') + ' · ' + esc(info.weekTheme) + '</span>' +
    '      <span>·</span><span>' + (t.doneToday ? '今天的任务已完成' : (S.progress.lastDayDone || 0) < CYCLE_LEN ? '还差 ' + (CYCLE_LEN - (S.progress.lastDayDone || 0)) + ' 天走完第一轮' : '第一轮已走完，正在接着往后学') + '</span>' +
    '      <button class="link-btn" id="to-path" type="button" style="margin-left:auto">看完整课程表 →</button>' +
    '    </div>' +
    '  </section>' +
    '  <section class="card card-pad">' +
    '    <div class="card-head"><h3 class="card-title">里程碑 <em>BADGES</em></h3><span class="card-sub">' + S.badges.length + ' / ' + BADGES.length + '</span></div>' +
    '    <div class="badges">' + badgeHtml() + '</div>' +
    '    <div class="day-strip"><span>下一枚：<b>' + (nextBadge() ? nextBadge().name + '（' + nextBadge().desc + '）' : '全部解锁') + '</b></span></div>' +
    '  </section>' +
    '</div>' +

    // 模考
    examHomeCard();

  if (S.stats.days === 0) {
    $('home-tree').innerHTML =
      '<div class="tree-empty">' +
      '<div class="te-seed">🌱</div>' +
      '<p class="te-title">这里会长出一棵树</p>' +
      '<p class="te-sub">完成今天的 30 分钟，种子就破土。<br>之后每学会一个词，冠层就密一点。</p>' +
      '</div>';
  } else {
    mountTree($('home-tree'), treeOpts(), true);
  }
  const exGo = $('home-exam-go');
  if (exGo) exGo.addEventListener('click', function () { switchView('exam'); });
  bindHome();
}

/* ---------------- 首页的模考卡 ---------------- */

function examHomeCard() {
  const h = historyStats(S);
  const last = h ? h.last : null;
  if (!h) {
    return '<div class="grid-2">' +
      '<section class="card card-pad exam-home">' +
      '  <div class="card-head"><h3 class="card-title">真题模考 <em>MOCK TEST</em></h3><span class="card-sub">还没有考过</span></div>' +
      '  <p class="exam-home-copy">平时练的是「每天 30 分钟」，模考考的是「40 题能不能在规定时间里拿到 23 题」。<br>第一套：听力 4 部分 + 阅读 3 篇，共 40 题，交卷后逐题精讲。</p>' +
      '  <button class="btn primary" id="home-exam-go" type="button">去模考 →</button>' +
      '</section>' +
      '<section class="card card-pad">' +
      '  <div class="card-head"><h3 class="card-title">6.0 线 <em>TARGET</em></h3></div>' +
      '  <div class="exam-target-line"><b>23</b><span>/ 40 题</span></div>' +
      '  <p class="step-sub">听力、阅读各自 23/40 左右，通常对应 6.0。真实考试另有写作与口语，本站暂不涉及。</p>' +
      '</section></div>';
  }
  const bands = (h.list || []).map(function (x) { return x.band; });
  return '<div class="grid-2">' +
    '<section class="card card-pad exam-home">' +
    '  <div class="card-head"><h3 class="card-title">真题模考 <em>MOCK TEST</em></h3><span class="card-sub">已考 ' + h.count + ' 次 · 最高 ' + h.best.toFixed(1) + '</span></div>' +
    '  <div class="exam-home-stats">' +
    '    <div><b>' + last.band.toFixed(1) + '</b><span>最近一次</span></div>' +
    '    <div><b>' + last.correct + '/' + last.total + '</b><span>答对</span></div>' +
    '    <div><b>' + h.avg.toFixed(1) + '</b><span>平均</span></div>' +
    '    <div><b>' + (last.band >= 6.0 ? '达标' : '差 ' + Math.max(0, TARGET.raw - last.correct) + ' 题') + '</b><span>vs 6.0 线</span></div>' +
    '  </div>' +
    '  <div class="exam-spark">' + bands.map(function (b) {
      return '<i style="height:' + Math.max(8, ((b - 3.5) / 4) * 100) + '%" title="' + b.toFixed(1) + ' 分"></i>';
    }).join('') + '</div>' +
    '  <button class="btn primary" id="home-exam-go" type="button">再考一次 / 看精讲 →</button>' +
    '</section>' +
    '<section class="card card-pad">' +
    '  <div class="card-head"><h3 class="card-title">离 6.0 还差什么 <em>GAP</em></h3></div>' +
    '  <p class="step-sub" style="line-height:1.8">' + gapAdvice(last) + '</p>' +
    '</section></div>';
}

function gapAdvice(last) {
  if (!last) return '';
  const r = last.per && last.per.reading ? last.per.reading : null;
  const l = last.per && last.per.listening ? last.per.listening : null;
  const tips = [];
  if (l && l.correct / l.total < 0.6) tips.push('听力：<b>先把 23 题里的 17 题拿稳</b>——数字、名称、转折词这类「必得分」比听懂全文更重要。');
  if (r && r.correct / r.total < 0.6) tips.push('阅读：<b>先做顺序题</b>（填空、判断），把段落匹配留到最后，别在一道题上耗过 2 分钟。');
  if (last.band < 6.0) tips.push('总分：把「<b>每次 40 题错 17 题以内</b>」当成下一阶段目标，而不是一次冲 6.0。');
  else tips.push('已经过线：接下来练<b>速度</b>——同样的正确率，用 50 分钟做完阅读。');
  return tips.join('<br>');
}

function taskListFor(info, due) {
  const tasks = [];
  tasks.push({ key: 'vocab', name: info.isReview ? '再学 6 个词' : '新词 6 个', desc: info.words.map(function (w) { return w.word; }).join(' · '), minutes: 8 });
  if (due > 0) tasks.push({ key: 'review', name: '复习 ' + due + ' 个到期词', desc: '按记忆曲线到期，忘掉的明天还会来', minutes: 5 });
  if (info.reading) tasks.push({ key: 'reading', name: '阅读 · ' + info.reading.title, desc: '4 道题 · ' + info.reading.words + ' 词', minutes: 9 });
  if (info.listening) tasks.push({ key: 'listening', name: '听力 · ' + info.listening.title, desc: '4 道题 + 2 句听写', minutes: 9 });
  if (info.writing) tasks.push({ key: 'writing', name: '写作 · ' + info.writing.title, desc: info.writing.subtitle, minutes: 10 });
  if (info.speaking) tasks.push({ key: 'speaking', name: '口语 · ' + info.speaking.title, desc: '开口说 60–90 秒', minutes: 8 });
  return tasks;
}

function taskIcon(key) {
  const p = {
    vocab: '<path d="M5 4h9l5 5v11H5V4Z"/><path d="M14 4v5h5"/>',
    review: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
    reading: '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/>',
    listening: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 1 2 2v1a2 2 0 0 1-2-2Zm16 0a2 2 0 0 0-2 2v1a2 2 0 0 0 2-2Z"/>',
    writing: '<path d="M4 20h16"/><path d="M6 16 18 4l2 2L8 18l-3 1 1-3Z"/>',
    speaking: '<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  };
  return '<svg viewBox="0 0 24 24">' + (p[key] || p.vocab) + '</svg>';
}

function statCard(k, v, unit, x, ico) {
  return '<div class="stat"><div class="stat-k"><i></i>' + k + '</div>' +
    '<div class="stat-v">' + v + '<small>' + unit + '</small></div>' +
    '<div class="stat-x">' + x + '</div></div>';
}

function weekLearned() {
  let n = 0;
  const today = ymd();
  const ids = Object.keys(S.words);
  for (let i = 0; i < ids.length; i++) {
    const w = S.words[ids[i]];
    if (w.first && daysBetween(w.first, today) < 7) n += 1;
  }
  return n;
}

function ringSvg(pct) {
  const r = 40; const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return '<div class="ring-wrap">' +
    '<svg viewBox="0 0 100 100"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#6cae84"/><stop offset="100%" stop-color="#2f6b4f"/></linearGradient></defs>' +
    '<circle class="ring-bg" cx="50" cy="50" r="' + r + '"/>' +
    '<circle class="ring-fg" cx="50" cy="50" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
    '<div class="ring-label"><b>' + Math.round(pct * 100) + '%</b><span>' + (pct >= 1 ? '完成' : '进度') + '</span></div>' +
    '</div>';
}

function heatmapHtml() {
  // 12 周 × 7 天，最后一格是今天
  const cells = [];
  const today = new Date();
  const dow = today.getDay(); // 0 Sun
  const offset = dow === 0 ? 6 : dow - 1; // 让周一在最上面
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end.getTime() - (end.getDate() - 1) * 86400000);
  start.setDate(start.getDate() - offset - 7 * 11);
  for (let i = 0; i < 84; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = ymd(d);
    const rec = S.days[key];
    const mins = rec ? rec.minutes || 0 : 0;
    let lv = 0;
    if (rec && rec.done) lv = 4;
    else if (mins >= 20) lv = 3;
    else if (mins >= 10) lv = 2;
    else if (mins > 0) lv = 1;
    const isToday = key === ymd(new Date());
    cells.push('<div class="hm-cell' + (isToday ? ' is-today' : '') + '" data-l="' + lv + '" title="' + key + (rec ? ' · ' + Math.round(mins) + ' 分钟' : ' · 未学习') + '"></div>');
  }
  return '<div class="heatmap">' + cells.join('') + '</div>';
}

function skillsScores() {
  const sk = S.skills || {};
  return [
    { k: 'listening', n: '听力', v: sk.listening || 0 },
    { k: 'reading', n: '阅读', v: sk.reading || 0 },
    { k: 'writing', n: '写作', v: sk.writing || 0 },
    { k: 'speaking', n: '口语', v: sk.speaking || 0 },
    { k: 'vocab', n: '词汇', v: Math.min(100, Math.round((S.stats.learned / 168) * 100)) },
  ];
}

function radarSvg() {
  const items = skillsScores();
  const cx = 120; const cy = 118; const R = 86;
  const n = items.length;
  function pt(i, r) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }
  let rings = '';
  [0.25, 0.5, 0.75, 1].forEach(function (p) {
    const pts = [];
    for (let i = 0; i < n; i++) { const q = pt(i, R * p); pts.push(q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
    rings += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#e3ddcd" stroke-width="1"/>';
  });
  let axes = '';
  let labels = '';
  for (let i = 0; i < n; i++) {
    const q = pt(i, R);
    axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" stroke="#e3ddcd" stroke-width="1"/>';
    const lp = pt(i, R + 18);
    labels += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3.5).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="#7b8175">' + items[i].n + '</text>';
  }
  const radarPts = [];
  for (let i = 0; i < n; i++) {
    const v = Math.max(0.06, Math.min(1, items[i].v / 100));
    const q = pt(i, R * v);
    radarPts.push(q[0].toFixed(1) + ',' + q[1].toFixed(1));
  }
  return '<svg viewBox="0 0 240 240">' + rings + axes +
    '<polygon points="' + radarPts.join(' ') + '" fill="rgba(108,174,132,.26)" stroke="#3d8a63" stroke-width="2" stroke-linejoin="round"/>' +
    radarPts.map(function (p) {
      const xy = p.split(',');
      return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3" fill="#2f6b4f"/>';
    }).join('') + labels + '</svg>';
}

function skillRows() {
  return skillsScores().map(function (s) {
    return '<div class="skill-row"><span>' + s.n + '</span><div class="skill-bar"><i style="width:' + Math.max(2, s.v) + '%"></i></div><b>' + s.v + '</b></div>';
  }).join('');
}

function roadHtml(t) {
  const cur = t.nextDay;
  const cycle = Math.max(1, cycleOf(cur));
  const base = (cycle - 1) * CYCLE_LEN;
  let html = '';
  for (let i = 1; i <= CYCLE_LEN; i++) {
    const lesson = base + i;
    if (i > 1 && (i - 1) % 7 === 0) html += '<span class="road-week-gap"></span>';
    const done = isDone(S, 'd' + lesson);
    const now = lesson === cur && !done;
    html += '<div class="road-day ' + (done ? 'done ' : '') + (now ? 'now' : '') + (lesson > cur ? ' lock' : '') + '" title="第 ' + lesson + ' 天">' +
      '<b>' + i + '</b>' + (done ? '✓' : now ? '今' : '') + '</div>';
  }
  return html;
}

function badgeHtml() {
  return BADGES.map(function (b) {
    const on = S.badges.indexOf(b.id) >= 0;
    return '<span class="badge ' + (on ? 'on' : '') + '" title="' + b.desc + '"><span class="b-ico">' + b.icon + '</span>' + b.name + '</span>';
  }).join('');
}

function nextBadge() {
  for (let i = 0; i < BADGES.length; i++) {
    if (S.badges.indexOf(BADGES[i].id) === -1) return BADGES[i];
  }
  return null;
}

function treeOpts() {
  return { days: S.stats.days, words: S.stats.learned, mastered: S.stats.mastered, rich: true };
}

function bindHome() {
  const start = $('btn-start');
  if (start) start.addEventListener('click', function () { startSession(studyInfo().nextDay); });
  const extra = $('btn-extra');
  // 今天已经学完了还想学：直接接上下一课，日期与轮次继续往后记（Q5）
  if (extra) extra.addEventListener('click', function () { startSession(studyInfo().nextDay); });
  const review = $('btn-review');
  if (review) review.addEventListener('click', function () { startReviewSession(); });
  const toPath = $('to-path');
  if (toPath) toPath.addEventListener('click', function () { switchView('path'); });
}

/* =========================================================
   成长树视图
   ========================================================= */

function renderTreeView() {
  const st = stageOf(S.stats.days);
  const nx = nextStageOf(S.stats.days);
  const root = $('view');
  root.innerHTML =
    '<div class="tree-hero">' +
    '  <section class="tree-canvas">' +
    '    <div class="tree-wrap" id="big-tree"></div>' +
    '    <div class="tree-canvas-foot">' +
    '      <div><div class="big-count">' + S.stats.learned + '<small>个词</small></div>' +
    '        <div class="big-label">每学会一个词，冠层就密一分；金边叶 = 进入长期记忆</div></div>' +
    '      <div style="text-align:right"><div class="big-count" style="font-size:30px">' + S.stats.mastered + '<small>金叶</small></div>' +
    '        <div class="big-label">牢记 · 间隔已拉到 15 天以上</div></div>' +
    '    </div>' +
    '  </section>' +
    '  <section class="card card-pad">' +
    '    <div class="card-head"><h3 class="card-title">生长阶段 <em>STAGES</em></h3><span class="card-sub">' + (nx ? '距下一阶段 ' + (nx.days - S.stats.days) + ' 天' : '已满级') + '</span></div>' +
    '    <div class="stage-track">' +
    STAGES.map(function (s) {
      const on = S.stats.days >= s.days;
      const now = s.id === st.id;
      return '<div class="stage-row ' + (on ? 'on ' : '') + (now ? 'now' : '') + '">' +
        '<span class="stage-dot"></span>' +
        '<span class="st-name"><b>' + s.name + '</b><span>' + s.desc + '</span></span>' +
        '<span class="st-need">' + (on ? '已达' : (s.days - S.stats.days) + ' 天') + '</span></div>';
    }).join('') +
    '    </div>' +
    '    <div class="tree-facts">' +
    '      <div class="fact"><b>' + S.stats.learned + '</b><span>个词（树冠密度）</span></div>' +
    '      <div class="fact"><b>' + S.stats.mastered + '</b><span>片金叶（牢记）</span></div>' +
    '      <div class="fact"><b>' + S.stats.days + '</b><span>天（树干粗细）</span></div>' +
    '      <div class="fact"><b>' + Math.round(S.stats.minutes) + '</b><span>分钟累计</span></div>' +
    '    </div>' +
    '    <p class="step-sub" style="margin-top:14px">树的形状不会因为中断而缩小。停几天再回来，它只是暂时不长了。</p>' +
    '  </section>' +
    '</div>' +
    '<div class="grid-2">' +
    '  <section class="card card-pad"><div class="card-head"><h3 class="card-title">词的增长 <em>WORDS</em></h3><span class="card-sub">按周</span></div>' +
    weekBars() + '</section>' +
    '  <section class="card card-pad"><div class="card-head"><h3 class="card-title">树的含义 <em>HOW</em></h3></div>' +
    '<p style="font-size:13px;color:var(--ink-2);line-height:1.8">· <b>叶片</b>：每学会一个新词，树上就添两片叶子。词忘不掉不是因为背得多，而是因为见得多——所以复习会把叶子留住。<br>· <b>金边与果实</b>：同一个词被想起来 3 次以上、间隔拉到 15 天，它就从「见过」变成「记住」，叶片变成金边。<br>· <b>树干</b>：由完成天数决定。每天 30 分钟，树干就粗一圈。</p>' +
    '  </section>' +
    '</div>';
  mountTree($('big-tree'), treeOpts(), false);
}

function weekBars() {
  const counts = [0, 0, 0, 0];
  const ids = Object.keys(S.words);
  for (let i = 0; i < ids.length; i++) {
    const w = S.words[ids[i]];
    if (!w.first) continue;
    const idx = VOCAB.findIndex(function (v) { return v.id === ids[i]; });
    if (idx >= 0) counts[Math.floor(idx / 42)] += 1;
  }
  const max = Math.max.apply(null, counts.concat([1]));
  return '<div style="display:flex;gap:14px;align-items:flex-end;height:150px;padding-top:10px">' +
    counts.map(function (c, i) {
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%">' +
        '<div style="flex:1;display:flex;align-items:flex-end;width:100%"><div style="width:100%;height:' + Math.max(3, (c / max) * 100) + '%;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#6cae84,#2f6b4f);opacity:' + (0.45 + i * 0.18) + '"></div></div>' +
        '<b style="font-family:var(--serif);font-size:15px">' + c + '</b><span style="font-size:10.5px;color:var(--ink-4)">第 ' + (i + 1) + ' 周</span></div>';
    }).join('') + '</div>';
}

/* =========================================================
   词库视图
   ========================================================= */

let wordFilter = 'all';
let wordQuery = '';
let wordLimit = 36;

function renderWords() {
  const root = $('view');
  const due = dueWords(S);
  const dueSet = {};
  due.forEach(function (id) { dueSet[id] = true; });

  root.innerHTML =
    '<div class="card card-pad" style="margin-bottom:14px">' +
    '  <div class="card-head" style="margin-bottom:10px"><h2 class="card-title">我的词库 <em>WORD BOOK</em></h2>' +
    '    <span class="card-sub">' + S.stats.learned + ' / 168 已学 · ' + S.stats.mastered + ' 牢记 · ' + due.length + ' 个今天到期</span></div>' +
    '  <div class="toolbar">' +
    '    <div class="seg" id="w-filter">' +
    ['all:全部', 'due:待复习', 'learning:在学', 'mastered:牢记', 'new:未学'].map(function (x) {
      const p = x.split(':');
      return '<button data-f="' + p[0] + '" class="' + (wordFilter === p[0] ? 'on' : '') + '" type="button">' + p[1] + '</button>';
    }).join('') +
    '    </div>' +
    accentSegHtml() +
    '    <input class="search" id="w-search" placeholder="搜单词或中文…" value="' + esc(wordQuery) + '">' +
    '    <button class="btn sm" id="w-review" type="button">复习到期的 ' + due.length + ' 个 →</button>' +
    '  </div>' +
    '  <div class="word-grid" id="word-grid"></div>' +
    '  <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px">' +
    '    <span class="card-sub" id="w-count"></span>' +
    '    <button class="btn sm" id="w-more" type="button">再多看一些</button>' +
    '  </div>' +
    '</div>';

  function draw() {
    const grid = $('word-grid');
    const q = wordQuery.trim().toLowerCase();
    const items = VOCAB.filter(function (w) {
      const st = S.words[w.id];
      const m = st ? masteryOf(st) : 0;
      if (wordFilter === 'due' && !dueSet[w.id]) return false;
      if (wordFilter === 'learning' && !(m === 1 || m === 2)) return false;
      if (wordFilter === 'mastered' && m !== 3) return false;
      if (wordFilter === 'new' && st && st.seen) return false;
      if (q && w.word.toLowerCase().indexOf(q) < 0 && w.zh.indexOf(q) < 0) return false;
      return true;
    });
    if (!items.length) {
      grid.innerHTML = '<p class="step-sub" style="padding:20px 0">这个筛选下没有词。换个筛选条件试试。</p>';
      $('w-count').textContent = '';
      $('w-more').style.display = 'none';
      return;
    }
    const shown = items.slice(0, wordLimit);
    $('w-count').textContent = '显示 ' + shown.length + ' / ' + items.length + ' 个词';
    $('w-more').style.display = items.length > shown.length ? '' : 'none';
    grid.innerHTML = shown.map(function (w) {
      const st = S.words[w.id];
      const m = st ? masteryOf(st) : 0;
      const cls = m === 3 ? 'is-mastered' : (!st || !st.seen) ? 'is-new' : '';
      return '<button class="word-card ' + cls + '" data-id="' + w.id + '" type="button">' +
        '<div class="wc-top"><span class="wc-word">' + esc(w.word) + '</span>' +
        '<span class="dots">' + [1, 2, 3].map(function (n) { return '<i class="' + (m >= n ? 'on' : '') + '"></i>'; }).join('') + '</span></div>' +
        '<div class="wc-ipa">' + esc(w.ipa) + ' · ' + esc(w.pos) + '</div>' +
        '<div class="wc-zh">' + esc(w.zh) + '</div>' +
        '<div class="wc-ex">' + esc(w.example) + '</div>' +
        '<div class="wc-foot"><span class="tag plain">' + esc(w.tag) + '</span>' +
        (dueSet[w.id] ? '<span class="tag gold">今天到期</span>' : st && st.seen ? (st.stage >= 5 ? '<span class="tag gold">长期记忆</span>' : '<span class="tag">下次 ' + st.due.slice(5) + '</span>') : '') +
        '</div></button>';
    }).join('');
    grid.querySelectorAll('.word-card').forEach(function (b) {
      b.addEventListener('click', function () { openWord(b.getAttribute('data-id')); });
    });
  }

  $('w-filter').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      wordFilter = b.getAttribute('data-f');
      wordLimit = 36;
      $('w-filter').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      draw();
    });
  });
  $('w-accent').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.getAttribute('data-a');
      Speech.setAccent(k);
      $('w-accent').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      const sample = VOCAB[0];
      if (sample) Speech.sayWord(sample.word);
      toast('朗读口音：' + (ACCENTS.find(function (a) { return a.k === k; }) || {}).label + (Speech.hasNative(k) ? '' : '（系统没有这个口音的音色，先用最接近的）'), '🔊');
    });
  });
  $('w-search').addEventListener('input', function () { wordQuery = this.value; wordLimit = 36; draw(); });
  $('w-more').addEventListener('click', function () { wordLimit += 60; draw(); });
  $('w-review').addEventListener('click', function () {
    if (!due.length) { toast('今天没有到期的词，明天再来', '✅'); return; }
    startReviewSession();
  });
  draw();
}

function openWord(id) {
  const w = VOCAB.find(function (x) { return x.id === id; });
  if (!w) return;
  const st = S.words[id];
  const m = st ? masteryOf(st) : 0;
  const card = openSheet(
    '<div class="word-sheet">' +
    '<div class="ws-head"><div><div class="ws-word">' + esc(w.word) + '</div><div class="ws-ipa">' + esc(w.ipa) + ' · ' + esc(w.pos) + '</div></div>' +
    '<button class="speak-btn" id="ws-say" type="button" aria-label="朗读"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a9 9 0 0 1 0 12"/></svg></button></div>' +
    '<div class="ws-block"><h4>释义</h4><div style="font-family:var(--serif);font-size:19px">' + esc(w.zh) + '</div></div>' +
    '<div class="ws-block"><h4>例句</h4><div class="ws-ex">' + esc(w.example) + '</div><div class="ws-ex-zh">' + esc(w.exampleZh) + '</div></div>' +
    '<div class="ws-block"><h4>记忆状态</h4><div style="font-size:13px;color:var(--ink-2)">' +
    (m === 0 ? '还没学过' : m === 3 ? '已牢记 · 间隔已拉到 15–30 天' : m === 2 ? '在学 · 间隔 ' + (st ? st.stage : 0) + ' 档' : '刚认识 · 明天会再见到') +
    (st && st.seen ? '　见过 ' + st.seen + ' 次，下次复习 <b>' + esc(st.due) + '</b>' : '') +
    '</div></div>' +
    '<div class="ws-sched">' +
    '<button class="btn sm" id="ws-play" type="button">朗读</button>' +
    '<button class="btn sm ghost" id="ws-good" type="button">标记为「已记住」</button>' +
    '<button class="btn ghost sm" data-close type="button">关闭</button>' +
    '</div></div>'
  );
  card.querySelector('#ws-say').addEventListener('click', function () { speakWord(w.word); });
  card.querySelector('#ws-play').addEventListener('click', function () { speakWord(w.word); });
  card.querySelector('#ws-good').addEventListener('click', function () {
    rateWord(S, id, 'good');
    saveNow(S);
    refreshStats(S);
    toast('已记录：' + w.word + ' 的记忆间隔拉长了');
    hideSheet();
    renderWords();
    renderChrome();
  });
}

function speakWord(text) {
  Speech.sayWord(text);
}

/** 词库顶部的口音切换：美音 / 英音 / 澳音 */
function accentSegHtml() {
  return '<div class="seg" id="w-accent" title="朗读口音">' +
    ACCENTS.map(function (a) {
      return '<button data-a="' + a.k + '" class="' + (Speech.getAccent() === a.k ? 'on' : '') + '" type="button">' + a.label + '</button>';
    }).join('') +
    '</div>';
}

/* =========================================================
   路线视图
   ========================================================= */

function renderPath() {
  const t = studyInfo();
  const cycle = Math.max(1, cycleOf(t.nextDay));
  const base = (cycle - 1) * CYCLE_LEN;
  const rp = reviewPlan(S);
  const root = $('view');
  let html = '<div class="card card-pad" style="margin-bottom:14px">' +
    '<div class="card-head" style="margin-bottom:8px"><h2 class="card-title">28 天路线 <em>ROADMAP</em></h2>' +
    '<span class="card-sub">' + (cycle > 1 ? '第 ' + cycle + ' 轮 · 词和篇目都按「再精学一遍」算' : '每天解锁一天 · 中断不会倒退，只会停一停') + '</span></div>' +
    '<p style="font-size:13px;color:var(--ink-2);line-height:1.75">整个过程分四个阶段：先把 168 个雅思高频词过一遍，同时从「读懂一段话、听懂一段对话、写对一个句子」开始。每天 30 分钟，不追求一次学很多，追求明天还愿意坐下来。' +
    '走完 28 天不会结束——第 29 天从第一章接着走，日期和轮次继续往后记。</p>' +
    (cycle > 1 && rp.backlog > 0 ? '<p style="font-size:12.5px;color:var(--ink-2);margin-top:6px">今天还有 ' + rp.due + ' 个词到期，先安排 ' + Math.min(rp.due, REVIEW_CAP) + ' 个，剩 ' + rp.backlog + ' 个往后排。</p>' : '') +
    '</div>';

  WEEKS.forEach(function (w) {
    const days = allDays().filter(function (d) { return d.w === w.n; });
    html += '<div class="week-block">' +
      '<div class="week-head"><h3>第 ' + w.n + ' 周 · ' + esc(w.title) + '</h3>' +
      '<span>' + esc(w.theme) + '</span><span class="tag ' + (w.n === 1 ? '' : w.color === 'gold' ? 'gold' : w.color === 'sky' ? 'sky' : 'rose') + ' week-tag">' + esc(w.goal) + '</span></div>' +
      days.map(function (d) {
        const lesson = base + d.d;
        const info = dayInfo(lesson);
        const done = isDone(S, 'd' + lesson);
        const now = lesson === t.nextDay && !done;
        return '<div class="day-row ' + (done ? 'done ' : '') + (now ? 'now' : '') + '">' +
          '<div class="day-num">' + (done ? '✓' : lesson) + '</div>' +
          '<div class="day-main"><b>' + (now ? '今天 · ' : '') + esc(info.title) + (info.isReview ? ' <span class="tag plain">复习篇</span>' : '') + '</b><span>' + esc(info.focus) + ' · ' + esc(info.words.map(function (x) { return x.word; }).join(', ')) + '</span></div>' +
          '<div class="day-side"><span class="mins">' + estimatedMinutes(info, Math.min(rp.due, REVIEW_CAP)) + ' 分</span>' +
          (done ? '<span class="tag">已完成</span>'
            : now ? '<button class="btn sm primary" data-start="' + lesson + '" type="button">开始</button>'
            : lesson <= t.nextDay ? '<button class="btn sm" data-start="' + lesson + '" type="button">开始</button>'
            : '<button class="btn sm ghost" data-start="' + lesson + '" data-ahead="1" type="button">提前学</button>') +
          '</div></div>';
      }).join('') +
      '</div>';
  });

  root.innerHTML = html;
  root.querySelectorAll('[data-start]').forEach(function (b) {
    b.addEventListener('click', function () {
      const d = Number(b.getAttribute('data-start'));
      if (d > t.nextDay) toast('提前学也没问题：完成后会记在这一天', '🌿');
      startSession(d);
    });
  });
}

/* =========================================================
   模考视图
   ========================================================= */

function renderExam() {
  const h = historyStats(S);
  const root = $('view');
  const sets = EXAM_SETS;
  root.innerHTML =
    '<section class="card card-pad exam-hero">' +
    '  <div class="exam-hero-main">' +
    '    <div class="eyebrow">IELTS ACADEMIC · MOCK TEST</div>' +
    '    <h2 class="exam-hero-title">40 题，一次见真章</h2>' +
    '    <p class="exam-hero-copy">平时 30 分钟练的是输入量；模考考的是<b>限时里的取舍</b>。听力 / 阅读各 40 题，23 题左右通常对应 6.0。交卷后按题给分数、给答案、给原文依据。</p>' +
    '    <div class="exam-hero-facts">' +
    '      <span><b>' + TARGET.raw + '/40</b> 6.0 参考线</span>' +
    '      <span><b>60′</b> 阅读限时</span>' +
    '      <span><b>' + sets.length + '</b> 套在库</span>' +
    '    </div>' +
    '  </div>' +
    '  <div class="exam-hero-side">' +
    (h
      ? '<div class="exam-best"><b>' + h.best.toFixed(1) + '</b><span>历史最高</span></div>' +
        '<div class="exam-best-row"><span>最近 ' + h.count + ' 次平均</span><b>' + h.avg.toFixed(1) + '</b></div>' +
        '<div class="exam-spark big">' + (h.list || []).map(function (x) {
          return '<i style="height:' + Math.max(8, ((x.band - 3.5) / 4) * 100) + '%" title="' + x.date + ' · ' + x.band.toFixed(1) + ' 分"></i>';
        }).join('') + '</div>'
      : '<div class="exam-best empty"><b>—</b><span>还没有考过</span></div>' +
        '<p class="step-sub" style="margin-top:12px">第一次模考建议先用「宽松模式」，做完再看时间。</p>' +
        '<div class="exam-best-hint"><span>目标</span><b>' + TARGET.raw + '</b><span>/ 40 题</span></div>') +
    '  </div>' +
    '</section>' +

    '<div class="exam-set-grid">' +
    sets.map(function (set) {
      const lItems = examItems(set, 'listening');
      const rItems = examItems(set, 'reading');
      return '<section class="card card-pad exam-set">' +
        '<div class="exam-set-top"><span class="tag">' + esc(set.level) + '</span><span class="card-sub">' + set.id.toUpperCase() + '</span></div>' +
        '<h3 class="exam-set-title">' + esc(set.name) + '</h3>' +
        '<p class="card-sub">' + esc(set.subtitle) + '</p>' +
        '<div class="exam-set-parts">' +
        (lItems.length ? '  <div><b>' + lItems.length + '</b><span>听力题量</span></div>' : '') +
        (rItems.length ? '  <div><b>' + rItems.length + '</b><span>阅读题量</span></div>' : '') +
        '  <div><b>' + (set.listening ? '35′' : '60′') + '</b><span>限时</span></div>' +
        '</div>' +
        '<div class="exam-set-actions">' +
        (lItems.length ? '  <button class="btn primary" data-exam="listening" data-set="' + set.id + '" type="button">听力 · 35 分钟</button>' : '') +
        (rItems.length ? '  <button class="btn ' + (lItems.length ? '' : 'primary') + '" data-exam="reading" data-set="' + set.id + '" type="button">阅读 · 60 分钟</button>' : '') +
        (lItems.length ? '  <button class="btn ghost" data-exam="all" data-set="' + set.id + '" data-relaxed="1" type="button">宽松模式（不限时）</button>' : '') +
        '</div>' +
        '</section>';
    }).join('') +
    '</div>' +

    (h && h.list && h.list.length
      ? '<section class="card card-pad" style="margin-top:16px"><div class="card-head"><h3 class="card-title">成绩记录 <em>HISTORY</em></h3><span class="card-sub">最近 ' + h.count + ' 次</span></div>' +
        '<div class="exam-history">' + h.list.slice().reverse().map(function (x) {
          return '<div class="exam-history-row"><span>' + esc(x.date) + '</span>' +
            '<span class="tag plain">' + (x.section === 'reading' ? '阅读' : x.section === 'listening' ? '听力' : '全卷') + '</span>' +
            '<b>' + x.correct + '/' + x.total + '</b><span class="eh-band">' + x.band.toFixed(1) + '</span>' +
            '<span class="eh-min">' + x.minutes + ' 分钟</span></div>';
        }).join('') + '</div>' +
        '</section>'
      : '') +

    '<section class="card card-pad" style="margin-top:16px">' +
    '  <div class="card-head"><h3 class="card-title">怎么用模考 <em>HOW</em></h3></div>' +
    '  <div class="exam-how">' +
    '    <div><b>① 先单项，再全卷</b><span>头两次只做阅读或只做听力，熟悉题型和答题卡；第三次再上全卷。</span></div>' +
    '    <div><b>② 卡时间</b><span>阅读 60 分钟做完 3 篇，做不完就停——考场上也不会给你加时。</span></div>' +
    '    <div><b>③ 精讲比分数重要</b><span>每套题做完，把错题的原文句抄到笔记里，那才是真实进步。</span></div>' +
    '    <div><b>④ 每周一次就够</b><span>模考是用来校准的，不是用来刷的。平时仍然做每日 30 分钟。</span></div>' +
    '  </div>' +
    '</section>';

  root.querySelectorAll('[data-exam]').forEach(function (b) {
    b.addEventListener('click', function () {
      const setId = b.getAttribute('data-set');
      const set = sets.find(function (x) { return x.id === setId; });
      if (!set) return;
      startExam(appCtx(), {
        set: set,
        section: b.getAttribute('data-exam'),
        relaxed: b.getAttribute('data-relaxed') === '1',
      });
    });
  });
}

/** 给模考引擎的回调上下文 */
function appCtx() {
  return {
    state: S,
    toast: toast,
    save: function () { save(S); },
    onExamClose: function () { renderAll(); renderChrome(); },
  };
}

/* =========================================================
   会话流程
   ========================================================= */

function buildSteps(info, dueCount, reviewOnly) {
  const steps = [];
  const rp = reviewPlan(S);
  if (reviewOnly) {
    steps.push({ key: 'review', tag: '复习', title: '把到期的词过一遍', build: function (host, ctx) { renderVocab(host, ctx, { words: reviewPlan(S).take, review: true }); } });
    return steps;
  }
  steps.push({
    key: 'vocab', tag: info && info.isReview ? '复习词' : '新词', title: info && info.isReview ? '这一轮的 6 个词' : '今天的 6 个新词',
    build: function (host, ctx) { renderVocab(host, ctx, { words: info.words.map(function (w) { return w.id; }), review: !!(info && info.isReview) }); },
  });
  if (dueCount > 0) {
    const n = Math.min(rp.due, REVIEW_CAP);
    steps.push({
      key: 'review', tag: '复习', title: '到期复习 ' + n + ' 个' + (rp.backlog > 0 ? '（还欠 ' + rp.backlog + ' 个，明天优先）' : ''),
      build: function (host, ctx) { renderVocab(host, ctx, { words: reviewPlan(S).take, review: true }); },
    });
  }
  if (info.reading) {
    steps.push({ key: 'reading', tag: '阅读', title: info.reading.title, build: function (host, ctx) { renderReading(host, ctx, info.reading); } });
  }
  if (info.listening) {
    steps.push({ key: 'listening', tag: '听力', title: info.listening.title, build: function (host, ctx) { renderListening(host, ctx, info.listening); } });
  }
  if (info.writing) {
    steps.push({ key: 'writing', tag: '写作', title: info.writing.title, build: function (host, ctx) { renderWriting(host, ctx, info.writing); } });
  }
  if (info.speaking) {
    steps.push({ key: 'speaking', tag: '口语', title: info.speaking.title, build: function (host, ctx) { renderSpeaking(host, ctx, info.speaking); } });
  }
  steps.push({ key: 'wrap', tag: '收束', title: '今天到这里', build: null });
  return steps;
}

function startSession(dayNo) {
  const info = dayInfo(dayNo);
  if (!info) return;
  const due = dueWords(S).length;
  const steps = buildSteps(info, due, false);
  openSession(steps, info, false);
}

function startReviewSession() {
  const due = dueWords(S).length;
  if (!due) { toast('今天没有到期的词', '✅'); return; }
  openSession(buildSteps(null, due, true), null, true);
}

function openSession(steps, info, reviewOnly) {
  session = {
    steps: steps,
    i: 0,
    startedAt: Date.now(),
    xp: 0,
    words: 0,
    good: 0,
    info: info,
    reviewOnly: reviewOnly,
    cleanups: [],
    finished: false,
  };
  $('session').hidden = false;
  $('session-xp').textContent = '+0';
  const segs = $('seg-track');
  segs.innerHTML = steps.map(function () { return '<div class="pseg"><i></i></div>'; }).join('');
  renderStep(0);
  startClock();
  document.body.style.overflow = 'hidden';
}

let clockTimer = null;

function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const clock = $('session-clock');
  clockTimer = setInterval(function () {
    if (!session) return;
    const sec = Math.floor((Date.now() - session.startedAt) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    clock.textContent = m + ':' + s;
  }, 500);
}

function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

function renderStep(i) {
  const step = session.steps[i];
  session.i = i;
  runCleanups();
  $('session-step').textContent = '第 ' + (i + 1) + ' / ' + session.steps.length + ' 步 · ' + step.tag;
  const segs = $('seg-track').children;
  for (let k = 0; k < segs.length; k++) {
    segs[k].classList.toggle('active', k === i);
    segs[k].classList.toggle('done', k < i);
  }
  const stage = $('stage');
  stage.scrollTop = 0;
  stage.innerHTML = '';

  if (step.key === 'wrap') { renderWrap(stage); return; }

  const ctx = makeCtx(step);
  step.build(stage, ctx);
}

function makeCtx(step) {
  const ctx = {
    state: S,
    step: step,
    total: 1,
    progress: 0,
    addXp: function (n) {
      session.xp += n;
      const xpEl = $('session-xp');
      xpEl.textContent = '+' + session.xp;
      xpEl.classList.add('bump');
      setTimeout(function () { xpEl.classList.remove('bump'); }, 300);
    },
    markWord: function (id, rating) {
      session.words += 1;
      if (rating === 'good') session.good += 1;
    },
    setTotal: function (n) { ctx.total = Math.max(1, n); },
    bumpProgress: function () {
      ctx.progress += 1;
      const i = session.i;
      const segs = $('seg-track').children;
      if (segs[i]) {
        const bar = segs[i].querySelector('i');
        bar.style.width = Math.min(100, Math.round((ctx.progress / ctx.total) * 100)) + '%';
      }
    },
    onCleanup: function (fn) { session.cleanups.push(fn); },
    finish: function (res) {
      const seg = $('seg-track').children[session.i];
      if (seg) seg.querySelector('i').style.width = '100%';
      setTimeout(function () {
        // 用户可能在这个 260ms 里直接退出了会话：session 已被置空，不能再读
        if (!session) return;
        if (session.i + 1 < session.steps.length) renderStep(session.i + 1);
        else renderWrap($('stage'));
      }, 260);
    },
  };
  return ctx;
}

function runCleanups() {
  if (!session) return;
  const list = session.cleanups;
  session.cleanups = [];
  for (let i = 0; i < list.length; i++) {
    try { list[i](); } catch (e) { /* ignore */ }
  }
}

/* ---- 收束步 ---- */
function renderWrap(stage) {
  const sec = Math.floor((Date.now() - session.startedAt) / 1000);
  const mins = Math.max(1, Math.round(sec / 60));
  const stage2 = el('div', { class: 'stage-inner' });
  stage.appendChild(stage2);
  stage2.innerHTML =
    '<div class="step-done">' +
    '<div class="sd-ico"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg></div>' +
    '<h2>' + (mins >= 20 ? mins + ' 分钟，种下去了' : '今天也来了') + '</h2>' +
    '<p>' + (session.reviewOnly ? '复习完了，记忆曲线会继续往后推。' : (mins >= 20 ? '今天的任务全部完成。树上多了一片叶子，明天它还在。' : '时间不长也没关系，记忆是这样一点点长出来的。')) + '</p>' +
    '<div class="sd-stats">' +
    '<div><b>' + mins + '</b><span>分钟</span></div>' +
    '<div><b>+' + session.xp + '</b><span>成长值</span></div>' +
    '<div><b>' + session.words + '</b><span>个词</span></div>' +
    '</div></div>' +
    '<div class="step-foot" style="justify-content:center;gap:10px">' +
    '<button class="btn primary lg" id="wrap-done" type="button">看看今天的成果 →</button>' +
    '</div>';
  stage2.querySelector('#wrap-done').addEventListener('click', function () { finishSession(mins); });
}

/* ---- 结算 ---- */
function finishSession(mins) {
  if (session.finished) return;
  session.finished = true;
  const info = session.info;
  const before = (S.days[ymd()] && S.days[ymd()].done);
  const dayId = session.reviewOnly ? null : (info ? info.id : null);
  let earned = [];
  if (dayId) {
    earned = completeDay(S, dayId, mins, session.xp);
  } else {
    S.review.lastStudy = ymd();
    S.review.streak = streakOf(S);
    refreshStats(S);
    checkBadges(S);
    saveNow(S);
  }
  refreshStats(S);

  // 关闭会话
  runCleanups();
  stopClock();
  $('session').hidden = true;
  document.body.style.overflow = '';

  const lessonNow = info ? info.d : (S.progress.lastDayDone || 0);
  const nextLesson = lessonNow + 1;
  const nextInfo = dayInfo(nextLesson);
  const cycleDone = !!(info && info.courseDay === CYCLE_LEN);
  const nx = nextStageOf(S.stats.days);
  const b = bandEstimate();
  const card = $('finish-card');
  card.innerHTML =
    '<div class="fc-kicker">DAY ' + lessonNow + (info && info.cycle > 1 ? ' · 第 ' + info.cycle + ' 轮' : '') + ' · COMPLETE</div>' +
    '<h2>' + (cycleDone ? '第一轮走完了' : '树又长大了一点') + '</h2>' +
    '<p class="fc-sub">' + (cycleDone ? '28 天不是终点，是「我知道自己明天还会坐下来」的证明。' : (info ? esc(info.quote) : '复习也是一种前进。')) + '</p>' +
    '<div class="fc-tree">' + treeSvg(treeOpts()) + '</div>' +
    '<div class="fc-grid">' +
    '<div class="fc-stat"><b>' + lessonNow + '</b><span>个课日</span></div>' +
    '<div class="fc-stat"><b>' + S.stats.learned + '</b><span>个词</span></div>' +
    '<div class="fc-stat"><b>' + bandText(b) + '</b><span>估分</span></div>' +
    '</div>' +
    (earned.length ? '<div class="fc-badges">' + earned.map(function (e) {
      return '<span class="badge on"><span class="b-ico">' + e.icon + '</span>' + e.name + ' · ' + e.desc + '</span>';
    }).join('') + '</div>' : '') +
    '<div class="fc-next">' +
    (cycleDone
      ? '明天 <b>第 ' + nextLesson + ' 天</b> 从第一章接着走，进入<b>第 ' + cycleOf(nextLesson) + ' 轮</b>。<br>' +
        '这一轮词和篇目都按「再精学一遍」算，日期继续往后记——不重来，也不清零。'
      : '明天：<b>第 ' + nextLesson + ' 天 · ' + esc(nextInfo ? nextInfo.title : '') + '</b>' +
        (nextInfo && nextInfo.cycle > 1 ? '（第 ' + nextInfo.cycle + ' 轮）' : '') + '<br>' +
        '今天学的几个词，会在 <b>明天 / 第 3 天 / 第 7 天</b> 自动回到复习里。' +
        (nx ? '<br>再 ' + (nx.days - S.stats.days) + ' 天，树会变成「' + nx.name + '」。' : '')) +
    '</div>' +
    '<div class="fc-actions">' +
    '<button class="btn primary" id="fc-home" type="button">回到今日</button>' +
    '<button class="btn" id="fc-tree" type="button">看看整棵树</button>' +
    '</div>';
  $('finish').hidden = false;
  $('finish-card').querySelector('#fc-home').addEventListener('click', function () {
    $('finish').hidden = true;
    renderAll();
  });
  $('finish-card').querySelector('#fc-tree').addEventListener('click', function () {
    $('finish').hidden = true;
    switchView('tree');
  });
  session = null;
  renderChrome();
}

/* ---- 退出 ---- */
function quitSession() {
  if (!session) return;
  const sec = Math.floor((Date.now() - session.startedAt) / 1000);
  const html =
    '<h3>先停一下？</h3>' +
    '<p class="sheet-sub">已经做过的词和题目都会保存下来。今天还没完成的话，回来可以接着做。</p>' +
    '<div class="sheet-actions">' +
    '<button class="btn primary" data-act="quit" type="button">退出练习</button>' +
    '<button class="btn ghost" data-act="stay" type="button">继续学</button>' +
    '</div>';
  const card = openSheet(html);
  card.querySelector('[data-act="stay"]').addEventListener('click', function () { hideSheet(); });
  card.querySelector('[data-act="quit"]').addEventListener('click', function () {
    hideSheet();
    runCleanups();
    stopClock();
    // 中途退出也要把「学了多久、过了几个词」记下来，否则热力图和「累计分钟」会漏掉这一段
    const mins = Math.max(1, Math.round(sec / 60));
    if (session && (session.words > 0 || session.xp > 0)) {
      const d = today(S);
      d.minutes = (d.minutes || 0) + mins;
      d.xp = (d.xp || 0) + session.xp;
      d.words = (d.words || 0) + session.words;
      addXp(S, session.xp);
      refreshStats(S);
    }
    saveNow(S);
    $('session').hidden = true;
    document.body.style.overflow = '';
    session = null;
    toast('已保存进度 · 学了 ' + mins + ' 分钟', '🌱');
    renderAll();
    window.scrollTo(0, 0);
  });
}

/* =========================================================
   视图切换 / 初始化
   ========================================================= */

function renderAll() {
  renderChrome();
  if (view === 'home') renderHome();
  else if (view === 'tree') renderTreeView();
  else if (view === 'words') renderWords();
  else if (view === 'path') renderPath();
  else if (view === 'exam') renderExam();
  const v = $('view');
  v.style.animation = 'none';
  void v.offsetWidth;
  v.style.animation = '';
}

function switchView(v) {
  view = v;
  document.querySelectorAll('.nav-item, .tab').forEach(function (b) {
    b.classList.toggle('is-active', b.getAttribute('data-view') === v);
  });
  const elv = $('view');
  elv.style.animation = 'none';
  void elv.offsetWidth;
  elv.style.animation = '';
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function bindGlobal() {
  document.querySelectorAll('.nav-item, .tab').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); });
  });
  $('btn-quit').addEventListener('click', quitSession);

  const dataSheet = function () {
    const card = openSheet(
      '<h3>备份与导入</h3>' +
      '<p class="sheet-sub">所有进度只存在这台电脑的浏览器里。换电脑、清缓存之前先备份。</p>' +
      '<div class="sheet-actions" style="margin-top:16px">' +
      '<button class="btn primary" id="ds-export" type="button">备份为 JSON</button>' +
      '<button class="btn" id="ds-import" type="button">从 JSON 导入</button>' +
      '</div>' +
      '<hr class="hr">' +
      '<div class="sheet-actions">' +
      '<button class="btn ghost" id="ds-reset" type="button" style="color:var(--rose)">清空进度重新开始</button>' +
      '<button class="btn ghost" data-close type="button">关闭</button>' +
      '</div>' +
      '<p class="sheet-sub" style="margin-top:10px">当前：' + S.stats.days + ' 天 · ' + S.stats.learned + ' 个词 · ' + (S.xp || 0) + ' 成长值</p>'
    );
    card.querySelector('#ds-export').addEventListener('click', function () {
      const blob = new Blob([exportJson(S)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '每日雅思-备份-' + ymd() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('备份文件已下载');
    });
    card.querySelector('#ds-import').addEventListener('click', function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', function () {
        const f = input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            S = importJson(String(reader.result));
            hideSheet();
            renderAll();
            toast('导入成功：' + S.stats.days + ' 天 · ' + S.stats.learned + ' 个词');
          } catch (e) {
            toast('导入失败：' + e.message, '⚠️');
          }
        };
        reader.readAsText(f);
      });
      input.click();
    });
    card.querySelector('#ds-reset').addEventListener('click', function () {
      if (!window.confirm('确定清空全部学习进度吗？建议先导出备份。这个操作不可撤销。')) return;
      reset();
      S = load();
      refreshStats(S);
      hideSheet();
      renderAll();
      toast('已清空，从第一天重新开始', '🌱');
    });
  };
  $('btn-data').addEventListener('click', dataSheet);
  $('btn-data-2').addEventListener('click', dataSheet);
  $('btn-about').addEventListener('click', function () {
    openSheet(
      '<div class="about"><h3>关于这个学习站</h3>' +
      '<p>为「CET4 底子、目标雅思 6.0、每天 30 分钟」设计。<b>方向还没定也没关系</b>：这 28 天只做一件事——把每天 30 分钟变成不需要决心的习惯，同时把词汇和四项基本功往上抬一格。</p>' +
      '<p><b>每天的结构</b></p>' +
      '<ul><li>新词 6 个（约 8 分钟，卡片式：先猜后翻）</li>' +
      '<li>到期复习（约 5 分钟，间隔重复：1 / 3 / 7 / 15 / 30 天）</li>' +
      '<li>阅读或听力（约 9 分钟，4 道题 + 听力听写 2 句）</li>' +
      '<li>写作或口语（约 8–10 分钟，句子翻译 / 段落骨架 / 小作文 / 话题卡）</li></ul>' +
      '<p><b>成长树怎么长大</b>：叶子 = 学过的词，金边 = 牢记；树干粗细 = 完成天数。它会一直保留，停几天也不会缩小。</p>' +
      '<p><b>关于估分</b>：页面上那个 4.5 → 6.0 的数字只是把「完成度 + 正确率 + 词汇量」折算出来的进度参考，<b>不是雅思官方分数</b>。真正的分数要靠真题模考。</p>' +
      '<p><b>数据</b>：全部存在浏览器 localStorage 里，不上传任何服务器。换设备请用「备份 / 导入」。</p>' +
      '<p><b>想改内容</b>：词库在 <code>assets/data/vocab.js</code>，阅读/听力在 <code>data/</code>，28 天怎么排在 <code>assets/course.js</code>。改完刷新即可，不需要构建。详细说明见同目录的 <code>2026-10-20-每日雅思学习站使用与设计说明.md</code>。</p>' +
      '<p><b>参考的开源项目</b>（只借鉴思路，代码为本项目原创）：<br>' +
      '<a href="https://github.com/Kaiyiwing/qwerty-learner" target="_blank" rel="noopener">qwerty-learner</a> —— 纯前端背单词的极简卡片与「学 + 复习」组织方式；<br>' +
      '<a href="https://github.com/lingdojo/kana-dojo" target="_blank" rel="noopener">kana-dojo</a> —— 把语言学习做成有成长感的小游戏，以及模块化拆分的做法。</p>' +
      '<div class="sheet-actions"><button class="btn" data-close type="button">知道了</button></div></div>'
    );
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('exam') && !$('exam').hidden) { return; }
      if (!$('sheet').hidden) { hideSheet(); return; }
      if (!$('finish').hidden) { $('finish').hidden = true; renderAll(); return; }
      if (session) { e.preventDefault(); quitSession(); }
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (session) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ---------------- 启动 ---------------- */

/** 顶部横条提示：只在出问题时出现，不打断正常使用 */
function banner(msg, kind) {
  const bar = document.createElement('div');
  bar.className = 'sys-banner ' + (kind || '');
  bar.innerHTML = msg + '<button class="sys-banner-x" type="button" aria-label="关闭">×</button>';
  bar.querySelector('.sys-banner-x').addEventListener('click', function () { bar.remove(); });
  document.body.appendChild(bar);
}

/** 本地存储能不能用：file:// 下有些浏览器会禁用，禁用了要明说，不能假装在存 */
function storageOk() {
  try {
    const k = '__ielts_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

function boot() {
  bindGlobal();
  renderAll();

  if (!storageOk()) {
    banner('浏览器禁用了本地存储：进度不会保存。<br>用 <b>启动.cmd</b> 或 <code>python -m http.server</code> 打开即可恢复。', 'bad');
  } else if (location.protocol === 'file:') {
    banner('当前是双击打开的本地文件：功能可用，但换浏览器或清缓存会丢进度。<br>想要更稳，双击 <b>启动.cmd</b> 用本地服务器打开。', 'warn');
  }

  // 每天第一次打开时，轻轻提醒到期词
  const rp = reviewPlan(S);
  if (rp.due > 0) setTimeout(function () { toast('有 ' + rp.due + ' 个词到期了，先复习 ' + Math.min(rp.due, REVIEW_CAP) + ' 个', '🍂'); }, 1400);
}

boot();

/* 导出给调试用 */
window.__ielts = {
  state: function () { return S; },
  reset: function () { reset(); location.reload(); },
  speech: Speech,   // 调试/测试用：查口音、查当前选中的音色
};

  return {};
})();

window.__IELTS_BOOTED = true;
})();
