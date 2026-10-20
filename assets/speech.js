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

export const ACCENTS = [
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

export const Speech = {
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
