/* =========================================================
   交互流程测试 · node tests/flow.test.mjs
   真点按钮：开始今天的练习 → 过完 6 个词 → 退出去模考 → 答题 → 交卷 → 看精讲。
   目的：抓「点了没反应 / 点一半报错」这类只有真点才暴露的问题。
   需要 jsdom：npm i -D jsdom
   ========================================================= */

import fs from 'node:fs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('跳过流程测试：未安装 jsdom。执行 `npm i -D jsdom` 后重跑。');
  process.exit(0);
}

const proj = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', proj), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const bundle = fs.readFileSync(new URL('assets/app.bundle.js', proj), 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost:8000/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};
window.eval(bundle);

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const click = (elOrSel) => {
  const el = typeof elOrSel === 'string' ? $(elOrSel) : elOrSel;
  if (!el) throw new Error('找不到元素：' + elOrSel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + extra : '')); }
};

console.log('\n[1] 开始今天的练习，走完 6 个词');
click('#btn-start');
t('会话浮层已打开', doc.getElementById('session').hidden === false);
t('第一步是词汇卡', !!$('.vocab-card'), doc.getElementById('stage').innerHTML.slice(0, 80));

let words = 0;
for (let i = 0; i < 6; i++) {
  const show = $('#vc-show');
  if (!show) break;
  click(show);
  const good = $('.ans-btn[data-r="good"]');
  if (!good) break;
  click(good);
  words++;
  await sleep(30);
}
t('6 个词都点得动（翻面 + 评价）', words === 6, words);
const S = window.__ielts.state();
t('6 个词的记忆状态已写入', Object.keys(S.words).length >= 6, Object.keys(S.words).length);
t('已进入下一步（不是卡在第一张卡）', !$('#vc-show'), doc.getElementById('session-step').textContent);

console.log('\n[2] 中途退出要能保存');
click('#btn-quit');
t('退出确认弹层出现', doc.getElementById('sheet').hidden === false);
click('[data-act="quit"]');
await sleep(30);
t('会话已关闭', doc.getElementById('session').hidden === true);
t('今天已有学习记录', !!S.days[new Date().toISOString().slice(0, 10)]);

console.log('\n[3] 模考：进去、答题、交卷、看精讲');
click('[data-view="exam"]');
const readBtn = $('[data-exam="reading"][data-set="setA"]');
t('模考页有「阅读 · 60 分钟」入口', !!readBtn);
click(readBtn);
t('模考浮层已打开', doc.getElementById('exam') && doc.getElementById('exam').hidden === false);
t('渲染出第一题', !!$('.exam-opt[data-opt]'));
click($('.exam-opt[data-opt]'));
t('选项可选中（有 on 状态）', !!$('.exam-opt.on'));

click('#exam-submit');
t('交卷确认弹层出现', !!$('#do-submit'));
click('#do-submit');
await sleep(50);
const examHtml = doc.getElementById('exam-body').innerHTML;
t('交卷后渲染出成绩', /分|正确|答对/.test(examHtml), examHtml.slice(0, 60));
t('成绩写入存档', (S.exams || []).length === 1, (S.exams || []).length);
t('顶栏计时器停止在「已交卷」', doc.getElementById('exam-clock').textContent.includes('已交卷'), doc.getElementById('exam-clock').textContent);

console.log('\n[4] 交卷后首页估分不再是「—」');
const done = $('#exam-done');
if (done) click(done);
await sleep(30);
click('[data-view="home"]');
const band = doc.getElementById('side-band').textContent.trim();
t('侧栏出现分数', band !== '—', band);

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
