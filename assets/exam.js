/* =========================================================
   exam.js · 真题模考
   听力 40 题 / 阅读 40 题，计时、答题卡、交卷、按雅思 40 题制估分、逐题精讲。
   ========================================================= */

import { saveNow, ymd, addXp, refreshStats } from './store.js';
import { Speech } from './speech.js';

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

export function rawToBand(raw, kind) {
  const table = kind === 'listening' ? BAND_LISTENING : BAND_READING;
  for (let i = 0; i < table.length; i++) {
    if (raw >= table[i][0]) return table[i][1];
  }
  return 2.0;
}

/** 题量不是 40 时先折回 40 题制，避免 80 题全卷被判成 9 分 */
export function toForty(correct, total) {
  if (!total) return 0;
  return Math.round((correct * 40) / total);
}

/** 6.0 对应的每题线（听力/阅读各自） */
export const TARGET = { band: 6.0, raw: 23 };

/* ---------------- 取题与判分 ---------------- */

/** 把一套题摊平成按题号排序的列表 */
export function flatten(part, kind) {
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

export function examItems(set, section) {
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

export function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[.,!?;:'"’“”()\-—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkAnswer(item, given) {
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

export function scoreOf(items, answers, kind) {
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
export function startExam(app, opts) {
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

export function historyStats(state) {
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
