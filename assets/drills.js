/* =========================================================
   drills.js · 练习引擎
   五种练习：词汇卡 / 阅读 / 听力 / 写作 / 口语
   每个 render 函数拿到 (host, ctx)，完成时调用 ctx.finish(result)
   ========================================================= */

import { rateWord, recordAnswer, recordSelf, wordState, addXp, ymd, SELF_RATINGS } from './store.js';
import { wordById } from './course.js';
import { flyLeaf } from './tree.js';

/* ---------------- 小工具 ---------------- */

export function el(tag, attrs, html) {
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
import { Speech } from './speech.js';

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

export function renderVocab(host, ctx, opts) {
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

export function renderReading(host, ctx, passage) {
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

export function renderListening(host, ctx, lesson) {
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

export function renderWriting(host, ctx, task) {
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

export function renderSpeaking(host, ctx, task) {
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
