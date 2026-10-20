/* =========================================================
   逻辑测试（不碰 DOM）· node tests/logic.test.mjs
   覆盖：课程循环 / 时长估算 / 复习上限 / 分表换算 / 80 题折算 /
        自评记分 / 存档迁移 / 每日快照
   ========================================================= */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => Array.from(mem.keys())[i] || null,
  get length() { return mem.size; },
};
// exam.js 顶部会挂 visibilitychange 监听，给个最小桩
globalThis.document = { addEventListener() {}, hidden: false };
globalThis.window = {};

const { dayInfo, courseDayOf, cycleOf, estimatedMinutes } = await import('../assets/course.js');
const store = await import('../assets/store.js');
const exam = await import('../assets/exam.js');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

console.log('\n[1] 课程循环：28 天之后接着学，不结束');
const d1 = dayInfo(1), d28 = dayInfo(28), d29 = dayInfo(29), d56 = dayInfo(56), d57 = dayInfo(57);
t('第 1 天 = 第 1 轮第 1 课', d1.cycle === 1 && d1.courseDay === 1);
t('第 28 天仍属第 1 轮', d28.cycle === 1 && d28.courseDay === 28);
t('第 29 天回到课程第 1 天', d29.courseDay === 1);
t('第 29 天 = 第 2 轮，且标为复习', d29.cycle === 2 && d29.isReview === true);
t('第 29 天有标题（旧代码在这里返回 null，首页会白屏）', !!d29.title);
t('第 56 天 = 第 2 轮第 28 课', d56.courseDay === 28 && cycleOf(56) === 2);
t('第 57 天 = 第 3 轮第 1 课', d57.cycle === 3 && d57.courseDay === 1);
t('courseDayOf 永不越界', courseDayOf(0) === 1 && courseDayOf(340) === 4);

console.log('\n[2] 时长估算：按真实环节算，不再恒加 5 分钟、不再截到 34');
t('无到期词：8 + 阅读 9 + 写作 10 = 27', estimatedMinutes(dayInfo(1), 0) === 27, estimatedMinutes(dayInfo(1), 0));
t('有到期词再加 5', estimatedMinutes(dayInfo(1), 3) === 32);

console.log('\n[3] 复习预算：到期全算欠账，但每天只排 12 个');
const s = store.load();
for (let i = 0; i < 30; i++) {
  s.words['w' + String(i + 1).padStart(3, '0')] = { seen: 2, good: 1, bad: 0, stage: 1, due: '2020-01-01', first: '2020-01-01', last: '2020-01-01' };
}
const rp = store.reviewPlan(s);
t('到期 30 个全部计入 due', rp.due === 30, rp.due);
t('当天只安排 12 个', rp.take.length === 12, rp.take.length);
t('欠账 18 个留到明天', rp.backlog === 18, rp.backlog);

console.log('\n[4] 模考换算：听力/阅读分表 + 80 题折回 40 题制');
t('阅读 26 → 6.0（旧表给 6.5，偏松）', exam.rawToBand(26, 'reading') === 6.0, exam.rawToBand(26, 'reading'));
t('听力 26 → 6.5', exam.rawToBand(26, 'listening') === 6.5, exam.rawToBand(26, 'listening'));
t('阅读 18 → 5.0', exam.rawToBand(18, 'reading') === 5.0);
t('听力 18 → 5.5', exam.rawToBand(18, 'listening') === 5.5);
const fake = (kind, n) => Array.from({ length: n }, (_, i) => ({ no: i + 1, type: 'mcq', answer: 0, kind }));
const items80 = fake('listening', 40).concat(fake('reading', 40).map((x) => Object.assign(x, { no: x.no + 40 })));
const ans80 = {};
items80.forEach((it) => { if (it.no <= 40) ans80[it.no] = 0; }); // 只答了听力且全对
const r80 = exam.scoreOf(items80, ans80);
t('80 题全卷：听力 40 对 → 9.0', r80.bandListening === 9.0, r80.bandListening);
t('80 题全卷：阅读 0 题 → 2.0（旧代码会被 80 题撑成 9.0）', r80.bandReading === 2.0, r80.bandReading);
t('全卷 band = 两者平均 5.5', r80.band === 5.5, r80.band);
t('raw40 折回 40 题制 = 20', r80.raw40 === 20, r80.raw40);

console.log('\n[5] 自评记分：写作/口语不再「点一下就算对」');
const s2 = store.load();
store.recordSelf(s2, 'writing', 'bad');
t('自评「没写出来」→ 技能分不涨', s2.skills.writing <= 25, s2.skills.writing);
t('自评 bad 不计入正确数', s2.days[store.ymd()].correct === 0, s2.days[store.ymd()]);
store.recordSelf(s2, 'writing', 'good');
t('自评 good 才加分', s2.skills.writing > 0, s2.skills.writing);
t('自评计数落库', s2.selfEval.writing.bad === 1 && s2.selfEval.writing.good === 1);

console.log('\n[6] 存档迁移 v1 → v2');
mem.clear();
mem.set('ielts-daily:v1', JSON.stringify({
  schema: 1,
  profile: { startDate: '2026-10-01' },
  skills: { writing: 100, speaking: 100, reading: 60 },
  words: {}, days: {},
}));
const old = store.load();
t('旧存档里刷出来的写作分被清零', old.skills.writing === 0, old.skills.writing);
t('口语同样清零', old.skills.speaking === 0);
t('听读分保留（那是真答出来的）', old.skills.reading === 60);
t('schema 升到 2', old.schema === 2, old.schema);
t('selfEval 补上默认值', old.selfEval && old.selfEval.writing.bad === 0);

console.log('\n[7] 每日快照');
const s3 = store.load();
store.saveNow(s3);
const baks = store.listBackups();
t('落盘后生成今日快照', baks.length >= 1, baks);
t('快照可回读', !!store.loadBackup(baks[0]));

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
