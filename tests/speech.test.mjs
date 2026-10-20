/* =========================================================
   发音测试 · node tests/speech.test.mjs
   验的是「单词语音是不是美音」这件事本身：
   1. 默认口音 = 美音（en-US）
   2. 从语音列表里挑的是美音里评分最高的那个，不是系统默认音色
   3. 切英音后立刻换音色，且偏好能记住
   需要 jsdom：npm i -D jsdom
   ========================================================= */

import fs from 'node:fs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('跳过发音测试：未安装 jsdom。执行 `npm i -D jsdom` 后重跑。');
  process.exit(0);
}

const proj = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', proj), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const bundle = fs.readFileSync(new URL('assets/app.bundle.js', proj), 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
};

/** 造一个带语音列表的 jsdom，返回 window 和记录下来的朗读请求 */
function boot(voices, opts) {
  const dom = new JSDOM(html, { url: 'http://localhost:8000/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  const spoken = [];
  window.speechSynthesis = {
    getVoices: () => voices,
    speak: (u) => spoken.push(u),
    cancel: () => {},
    addEventListener: () => {},
    onvoiceschanged: null,
  };
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
  };
  if (opts && opts.storedAccent) window.localStorage.setItem('ielts-daily:accent', opts.storedAccent);
  window.eval(bundle);
  return { window, spoken };
}

console.log('\n[1] 默认是美音，且挑的是美音里最好的音色');
const voices = [
  { lang: 'zh-CN', name: 'Microsoft Huihui', localService: true, default: true },
  { lang: 'en-GB', name: 'Daniel', localService: true },
  { lang: 'en-US', name: 'Microsoft David - English (United States)', localService: true },
  { lang: 'en-US', name: 'Google US English', localService: true },
  { lang: 'en-US', name: 'eSpeak US', localService: false },
  { lang: 'en-AU', name: 'Karen', localService: true },
];
const A = boot(voices);
const sp = A.window.__ielts.speech;

t('默认口音是 us（美音）', sp.getAccent() === 'us', sp.getAccent());
t('语音列表已就绪', sp.ready === true);
t('美音音色选中了 Google US English（不是 David / eSpeak）',
  sp.voiceFor('us') && sp.voiceFor('us').name === 'Google US English',
  sp.voiceFor('us') && sp.voiceFor('us').name);
t('该音色确实是 en-US', sp.voiceFor('us').lang === 'en-US', sp.voiceFor('us').lang);
t('系统有原生美音（hasNative 为真）', sp.hasNative('us') === true);

console.log('\n[2] 读单词时真的用了美音');
const u = sp.sayWord('academic');
t('朗读请求已发出', A.spoken.length === 1, A.spoken.length);
t('utterance 的 lang 是 en-US', u.lang === 'en-US', u.lang);
t('utterance 绑定了美音音色', u.voice && u.voice.lang === 'en-US', u.voice && u.voice.name);
t('单词朗读语速略慢（< 1.0）', u.rate < 1, u.rate);

console.log('\n[3] 切换到英音：音色立刻跟着换，并记住偏好');
sp.setAccent('uk');
t('当前口音变成 uk', sp.getAccent() === 'uk');
t('英音音色是 Daniel', sp.voiceFor('uk') && sp.voiceFor('uk').name === 'Daniel', sp.voiceFor('uk') && sp.voiceFor('uk').name);
const u2 = sp.sayWord('academic');
t('切换后朗读用 en-GB', u2.lang === 'en-GB', u2.lang);
t('偏好写进了 localStorage', A.window.localStorage.getItem('ielts-daily:accent') === 'uk', A.window.localStorage.getItem('ielts-daily:accent'));

console.log('\n[4] 重新打开页面时沿用上次的口音');
const B = boot(voices, { storedAccent: 'uk' });
t('启动即读回 uk', B.window.__ielts.speech.getAccent() === 'uk', B.window.__ielts.speech.getAccent());
const C = boot(voices, { storedAccent: 'au' });
t('切澳音后音色是 Karen', C.window.__ielts.speech.voiceFor('au') && C.window.__ielts.speech.voiceFor('au').name === 'Karen', C.window.__ielts.speech.voiceFor('au') && C.window.__ielts.speech.voiceFor('au').name);

console.log('\n[5] 系统没有美音音色时：不崩，用最接近的兜底并如实告知');
const onlyGB = [{ lang: 'zh-CN', name: 'Huihui', localService: true }, { lang: 'en-GB', name: 'Daniel', localService: true }];
const D = boot(onlyGB);
t('hasNative("us") 为 false（不假装有）', D.window.__ielts.speech.hasNative('us') === false);
t('仍然能读（fallback 到英音音色）', !!D.window.__ielts.speech.voiceFor('us'), D.window.__ielts.speech.voiceFor('us') && D.window.__ielts.speech.voiceFor('us').name);
const u3 = D.window.__ielts.speech.sayWord('academic');
t('lang 仍标记 en-US（让系统尽量按美音念）', u3.lang === 'en-US', u3.lang);

console.log('\n[6] 听力数据里的 GB / AU 大写标记不会被当成美音');
const u4 = sp.speak('Good morning.', { accent: 'GB' });
t('accent:"GB" 解析成 en-GB', u4.lang === 'en-GB', u4.lang);
const u5 = sp.speak('G\'day.', { accent: 'AU' });
t('accent:"AU" 解析成 en-AU', u5.lang === 'en-AU', u5.lang);

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
