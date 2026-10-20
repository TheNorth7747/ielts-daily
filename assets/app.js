/* =========================================================
   app.js · 应用主控
   视图渲染 / 会话流程 / 结算 / 数据管理
   ========================================================= */

import {
  load, save, saveNow, reset, ymd, addDays, daysBetween, dueWords, masteryOf,
  refreshStats, streakOf, checkBadges, completeDay, isDone, levelOf,
  addXp, today,
  BADGES, exportJson, importJson, rateWord, reviewPlan, REVIEW_CAP,
  listBackups, loadBackup,
} from './store.js';
import {
  WEEKS, allDays, dayInfo, candidateDay, estimatedMinutes, VOCAB,
  cycleOf, courseDayOf, cycleLabel, CYCLE_LEN,
} from './course.js';
import { treeSvg, mountTree, stageOf, nextStageOf, STAGES, flyLeaf } from './tree.js';
import {
  renderVocab, renderReading, renderListening, renderWriting, renderSpeaking, el,
} from './drills.js';
import { Speech, ACCENTS } from './speech.js';
import { startExam, historyStats, rawToBand, TARGET, examItems } from './exam.js';
import { EXAM_SETS } from './data/exams.js';

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
