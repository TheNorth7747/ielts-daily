/* =========================================================
   端到端流程测试 · node tests/e2e.test.mjs
   真点按钮，连续走完前 3 天：词汇 → 阅读/听力 → 写作/口语 → 收束 → 结算。
   目的：证明「每天的 30 分钟」这条链路是真能走完的，而不是只能看。
   需要 jsdom：npm i -D jsdom
   ========================================================= */

import fs from 'node:fs';

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch (e) {
  console.log('跳过端到端测试：未安装 jsdom。执行 `npm i -D jsdom` 后重跑。');
  process.exit(0);
}

const proj = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', proj), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const bundle = fs.readFileSync(new URL('assets/app.bundle.js', proj), 'utf8');

// 把 jsdom 里的未捕获错误全部收上来，最后断言「跑完几天零报错」
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(html, { url: 'http://localhost:8000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
window.scrollTo = () => {};
window.addEventListener('error', (e) => errors.push(e.message));
window.eval(bundle);

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const stage = () => doc.getElementById('stage');
const click = (el) => { if (!el) return false; el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typeInto = (el, text) => { el.value = text; el.dispatchEvent(new window.Event('input', { bubbles: true })); };

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + extra : '')); }
};

/** 把当前会话从头点到结算，返回走过的步骤名 */
async function walkSession() {
  const steps = [];
  let guard = 0;
  while (guard++ < 120) {
    const s = stage();
    if (!s || doc.getElementById('session').hidden) break;

    const label = doc.getElementById('session-step').textContent;
    if (!steps.length || steps[steps.length - 1] !== label) steps.push(label);

    const vcShow = s.querySelector('#vc-show');
    if (vcShow) { click(vcShow); await sleep(8); }
    const ansBtn = s.querySelector('.ans-btn[data-r="good"]');
    if (ansBtn) { click(ansBtn); await sleep(15); continue; }

    const opt = s.querySelector('.opt[data-i]:not([disabled])');
    if (opt) {
      click(opt);
      await sleep(8);
      click(s.querySelector('.fb-slot .btn.primary'));
      await sleep(15);
      continue;
    }

    const twCheck = s.querySelector('#tw-check:not([disabled])');
    if (twCheck) {
      const ta = s.querySelector('#tw-in');
      if (ta) typeInto(ta, 'This is a complete sentence written by the test runner.');
      click(twCheck);
      await sleep(12);
      continue;
    }
    const pw = s.querySelector('#pw-submit:not([disabled])');
    if (pw) {
      const ta = s.querySelector('#pw-in');
      if (ta) typeInto(ta, 'In recent years, more and more people have started to work from home. This change brings both benefits and problems, and I will discuss both sides before giving my own view.');
      click(pw);
      await sleep(12);
      continue;
    }
    const chCheck = s.querySelector('#ch-check:not([disabled])');
    if (chCheck) {
      const ta = s.querySelector('#ch-in');
      if (ta) typeInto(ta, 'Overall, the figure rose steadily, with the highest value in 2020.');
      click(chCheck);
      await sleep(12);
      continue;
    }

    // 一组自评只能选一次：找还没选过的那一组
    const rowEl = Array.from(s.querySelectorAll('.self-rate-row')).find((r) => !r.querySelector('.rate-btn.on'));
    const rate = rowEl && rowEl.querySelector('.rate-btn:not([disabled])');
    if (rate) { click(rate); await sleep(12); continue; }

    const primary = s.querySelector('.btn.primary:not([disabled])');
    if (primary) { click(primary); await sleep(300); continue; }

    const foot = s.querySelector('.step-foot .btn');
    if (foot) { click(foot); await sleep(300); continue; }

    // 口语 Part 1/3 的动作按钮不是 primary 样式（说完了，看参考 / 跳过准备）
    const anyBtn = s.querySelector('#sp-show, .chip-btn, button.btn:not([disabled])');
    if (anyBtn) { click(anyBtn); await sleep(60); continue; }

    break; // 真的没有可点的了
  }
  return { steps, guard };
}

const S = window.__ielts.state();

for (const day of [1, 2, 3]) {
  console.log('\n[' + day + '] 第 ' + day + ' 天：从首页点到结算');
  // 当天没学过 → #btn-start；已经学过还想接着学 → #btn-extra（继续学下一天）
  const startBtn = $('#btn-start') || $('#btn-extra');
  if (!startBtn) { t('第 ' + day + ' 天有可点的开始入口', false, doc.getElementById('view').innerHTML.slice(0, 120)); break; }
  click(startBtn);
  t('会话已打开', doc.getElementById('session').hidden === false);

  const { steps, guard } = await walkSession();
  console.log('  步骤：' + steps.join(' → '));
  t('没有卡死（guard=' + guard + '）', guard < 120, guard);
  t('至少走过 2 个环节', steps.length >= 2, steps.length);
  t('到达结算页', doc.getElementById('finish').hidden === false, steps[steps.length - 1]);
  t('第 ' + day + ' 天写入完成记录', !!S.progress.completed && !!S.progress.completed['d' + day], Object.keys(S.progress.completed || {}).join(','));

  const home = doc.querySelector('#fc-home');
  if (home) { click(home); await sleep(25); }
}

console.log('\n[4] 结果检查');
t('三天都记完了', ['d1', 'd2', 'd3'].every((k) => S.progress.completed[k]), Object.keys(S.progress.completed).join(','));
t('学到词（词卡状态非空）', Object.keys(S.words).length > 0, Object.keys(S.words).length);
t('技能分有真实变化（阅读/听力来自判分）', S.skills.reading > 0 || S.skills.listening > 0, JSON.stringify(S.skills));
t('整轮操作零未捕获错误', errors.length === 0, errors.join(' | '));

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
