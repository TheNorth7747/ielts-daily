/* =========================================================
   course.js · 28 天课程表
   每周 7 天：单词 6 个 + 阅读/听力 1 组 + 写作/口语 1 个，合计约 30 分钟。
   课程按「完成天数」解锁：做完第 1 天，第 2 天才变成「今天」。
   ========================================================= */

import { VOCAB } from './data/vocab.js';
import { READING } from './data/reading.js';
import { LISTENING } from './data/listening.js';
import { WRITING, SPEAKING } from './data/tasks.js';

export { VOCAB, READING, LISTENING, WRITING, SPEAKING };

export const WEEKS = [
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
export const CYCLE_LEN = DAYS.length;

export function allDays() { return DAYS; }

/** 第 lesson 天落在课程表的第几天（1–28） */
export function courseDayOf(lesson) {
  const L = Math.max(1, Number(lesson) || 1);
  return ((L - 1) % CYCLE_LEN) + 1;
}

/** 第 lesson 天属于第几轮（从 1 开始） */
export function cycleOf(lesson) {
  const L = Math.max(1, Number(lesson) || 1);
  return Math.floor((L - 1) / CYCLE_LEN) + 1;
}

/**
 * 第 lesson 天的课程信息。
 * lesson 从 1 开始，不设上限：29 天 = 第 2 轮的第 1 天。
 * cycle > 1 时 isReview = true，词和篇目都按「第二轮精学」展示，不再算新内容。
 */
export function dayInfo(lesson) {
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
export function candidateDay(completedCount) {
  return Math.max(1, completedCount + 1);
}

/** 轮次标签：第 1 轮不显示，第 2 轮起显示 */
export function cycleLabel(info) {
  if (!info || !info.cycle || info.cycle < 2) return '';
  return '第 ' + info.cycle + ' 轮';
}

/** 今日任务清单（用于展示与分步练习） */
export function taskList(info, vocabDue) {
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
export function estimatedMinutes(info, dueCount) {
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
export function wordById(id) {
  for (let i = 0; i < VOCAB.length; i++) if (VOCAB[i].id === id) return VOCAB[i];
  return null;
}

export function wordRange(a, b) {
  return VOCAB.slice(a, b);
}
