/* =========================================================
   打包产物测试 · node tests/bundle.test.mjs
   模拟「双击 index.html」：file:// 协议 + 经典脚本（不是 module）。
   验证 app.bundle.js 在 file:// 下能真正跑起来、按钮能点。
   需要 jsdom：npm i -D jsdom
   ========================================================= */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('跳过打包测试：未安装 jsdom。执行 `npm i -D jsdom` 后重跑。');
  process.exit(0);
}

const proj = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', proj), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const bundlePath = new URL('assets/app.bundle.js', proj);
const bundle = fs.readFileSync(bundlePath, 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + extra : '')); }
};

console.log('\n[1] 产物本身');
t('bundle 里没有残留的 import/export 语句', !/^\s*(import|export)\s/m.test(bundle));
t('bundle 不是 module 语法（可直接被 <script> 执行）', !/^\s*import\s/m.test(bundle));

console.log('\n[2] file:// 下执行（等价于双击 index.html）');
// 不写死本机路径：按当前文件位置推出 index.html，换机器/换目录都能跑
const here = path.dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(html, {
  url: pathToFileURL(path.join(here, '..', 'index.html')).href,
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};

let thrown = null;
try {
  window.eval(bundle); // 浏览器里的 <script src> 等价物
} catch (e) { thrown = e; }
t('bundle 在 file:// 环境下执行不抛异常', !thrown, thrown && thrown.message);
t('启动标记已置位', window.__IELTS_BOOTED === true);

const doc = window.document;
const view = doc.getElementById('view');
t('首屏渲染出内容（不再是空壳）', view.innerHTML.length > 500, view.innerHTML.length);
t('首页有「今天的 30 分钟」或「今天已完成」', /今天的 30 分钟|今天已完成/.test(view.innerHTML));
t('侧栏估分位有值（「—」也算，说明 JS 跑到了）', doc.getElementById('side-band').textContent.trim().length > 0);

console.log('\n[3] 逐个点击导航，确认不是「点了没反应」');
const click = (sel) => doc.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const views = [
  ['path', /ROADMAP/],
  ['words', /词库|WORD/],
  ['tree', /成长树|GROWTH|TREE/],
  ['exam', /MOCK|模考/],
  ['home', /今天的 30 分钟|今天已完成/],
];
for (const [v, re] of views) {
  let err = null;
  const before = view.innerHTML;
  try { click('[data-view="' + v + '"]'); } catch (e) { err = e; }
  t('点击「' + v + '」不抛异常', !err, err && err.message);
  t('点击「' + v + '」后视图真的换了', view.innerHTML !== '' && (view.innerHTML !== before || re.test(view.innerHTML)));
}

console.log('\n[4] 关键按钮存在且可绑定');
const startBtn = doc.getElementById('btn-start');
t('首页有「开始今天的 30 分钟」按钮', !!startBtn);
if (startBtn) {
  let err = null;
  try { startBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); } catch (e) { err = e; }
  t('点击开始不抛异常', !err, err && err.message);
  t('练习会话已打开', doc.getElementById('session').hidden === false);
  t('第一个练习步骤渲染出内容', doc.getElementById('stage').innerHTML.length > 200);
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
