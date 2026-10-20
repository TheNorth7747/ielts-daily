/* =========================================================
   DOM 渲染测试 · node tests/dom.test.mjs
   在 jsdom 里真跑一遍 app.js，重点验「第 29 天不会白屏」这类只有渲染时才暴露的问题。
   需要 jsdom：npm i -D jsdom（只用于测试，不进页面、不影响零构建）
   ========================================================= */

import fs from 'node:fs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('跳过 DOM 测试：未安装 jsdom。执行 `npm i -D jsdom` 后重跑。');
  process.exit(0);
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost:8000/', pretendToBeVisual: true });
const { window } = dom;

for (const k of ['window', 'document', 'localStorage', 'location', 'HTMLElement', 'Element',
  'Node', 'SVGElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'Event', 'MouseEvent']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; }
  catch (e) { Object.defineProperty(globalThis, k, { value: window[k], configurable: true }); }
}
globalThis.window = window;
window.scrollTo = () => {};
globalThis.scrollTo = () => {};

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + extra : '')); }
};

await import('../assets/app.js');
const S = window.__ielts.state();
const doc = window.document;
const view = doc.getElementById('view');
const click = (sel) => doc.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

console.log('\n[1] 全新存档的首屏');
t('渲染出「今天的 30 分钟」', view.innerHTML.includes('今天的 30 分钟'));
t('没有模考时侧栏显示「—」，不编数字', doc.getElementById('side-band').textContent.trim() === '—', doc.getElementById('side-band').textContent);
t('侧栏提示去做模考', doc.getElementById('side-band-note').textContent.includes('模考'));

console.log('\n[2] 造一个「学完 28 天」的存档，看第 29 天');
const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const ym = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
for (let i = 1; i <= 28; i++) {
  const d = new Date(today.getTime() - (28 - i) * 86400000);
  S.progress.completed['d' + i] = { at: d.toISOString(), minutes: 28, xp: 300 };
  S.days[ym(d)] = { minutes: 28, xp: 300, words: 6, correct: 3, answers: 4, done: true };
}
S.progress.lastDayDone = 28;
S.stats.days = 28;
S.days[ym(today)].done = false; // 今天还没学 → 今天就是第 29 天
S.words['w001'] = { seen: 3, good: 3, bad: 0, stage: 3, due: '2026-10-21', first: '2026-10-01', last: '2026-10-19' };
S.exams.push({ id: 'x1', set: 'setA', section: 'reading', date: '2026-10-18', correct: 20, total: 40, band: 5.5, minutes: 60, per: { reading: { total: 40, correct: 20 } } });

let err = null;
try { click('[data-view="home"]'); } catch (e) { err = e; }
t('第 29 天首页不抛异常（旧代码在这里读 null.title 崩掉）', !err, err && err.message);
t('首页指向第 29 天', view.innerHTML.includes('第 29 天'));
t('首页标注「第 2 轮」', view.innerHTML.includes('第 2 轮'));
t('第 2 轮的词卡叫「再学 6 个词」', view.innerHTML.includes('再学 6 个词'));

console.log('\n[3] 估分以模考为锚');
const sideBand = doc.getElementById('side-band').textContent.trim();
t('有模考后侧栏出分数', sideBand !== '—', sideBand);
t('估分落在模考 5.5 ± 0.5 内', Math.abs(parseFloat(sideBand) - 5.5) <= 0.5, sideBand);

console.log('\n[4] 路线页切到第 2 轮');
err = null;
try { click('[data-view="path"]'); } catch (e) { err = e; }
t('第 2 轮路线页不抛异常', !err, err && err.message);
t('表头标「第 2 轮」', view.innerHTML.includes('第 2 轮'));
t('复用篇目打「复习篇」标签', view.innerHTML.includes('复习篇'));
t('第一天显示第 29 天', view.innerHTML.includes('29'));

console.log('\n[5] 其余页面渲染');
for (const v of ['words', 'tree', 'exam']) {
  err = null;
  try { click('[data-view="' + v + '"]'); } catch (e) { err = e; }
  t(v + ' 页不抛异常', !err, err && err.message);
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
