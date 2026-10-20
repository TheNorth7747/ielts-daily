/* =========================================================
   tree.js · 成长之树
   学习的「累积」在这里变成看得见的东西：
     - 总叶片数 = 学过的词数
     - 金边叶片 = 进入「牢记」的词
     - 树干粗细 / 枝条数量 / 冠层大小 = 完成天数
   ========================================================= */

export const STAGES = [
  { id: 'seed', name: '种子', en: 'SEED', days: 0, desc: '还埋在土里，等第一次浇水。' },
  { id: 'sprout', name: '新芽', en: 'SPROUT', days: 1, desc: '第一次 30 分钟，破土了。' },
  { id: 'sapling', name: '树苗', en: 'SAPLING', days: 3, desc: '开始有自己的形状。' },
  { id: 'young', name: '小树', en: 'YOUNG TREE', days: 7, desc: '第一周结束，树冠撑开了。' },
  { id: 'grown', name: '繁茂', en: 'GROWING', days: 14, desc: '两周不断，枝头开始挂果。' },
  { id: 'bloom', name: '开花', en: 'BLOOM', days: 21, desc: '三周积累，已经很难被忽视。' },
  { id: 'full', name: '成树', en: 'FULL CANOPY', days: 28, desc: '28 天课程走完，一棵完整的树。' },
];

export function stageOf(days) {
  let cur = STAGES[0];
  for (let i = 0; i < STAGES.length; i++) {
    if (days >= STAGES[i].days) cur = STAGES[i];
  }
  return cur;
}

export function nextStageOf(days) {
  for (let i = 0; i < STAGES.length; i++) {
    if (days < STAGES[i].days) return STAGES[i];
  }
  return null;
}

/* ---------------- 确定性随机（同一棵树多次渲染位置不变） ---------------- */

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 固定种子洗牌：每次渲染顺序一致，避免叶子乱跳 */
function shuffle(arr) {
  const rand = rng(91357);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ---------------- 几何 ---------------- */

const GROUND_Y = 336;
const BASE_X = 200;

/** 按完成天数算生长度 0–1 */
function growth(days) {
  return Math.min(1, Math.max(0, days / 28));
}

/** 主干：随天数长高、变粗 */
function trunkPath(days) {
  const g = growth(days);
  const h = 86 + 154 * Math.pow(g, 0.82);   // 高度：第 1 天是一根小苗，28 天长到冠层
  const topY = GROUND_Y - h;
  const wBottom = 5.2 + 4.4 * g;
  const wTop = 2.4 + 1.4 * g;

  // 轻微弯曲，避免笔直死板
  const bendX = -4 * Math.sin(g * Math.PI);
  const midY = GROUND_Y - h * 0.55;

  const left = [
    'M', BASE_X - wBottom, GROUND_Y,
    'C', BASE_X - wBottom * 0.5, midY + 20, BASE_X + bendX - wTop * 1.4, midY - 10, BASE_X + bendX - wTop, topY,
  ].join(' ');
  const right = [
    'L', BASE_X + bendX + wTop, topY,
    'C', BASE_X + bendX + wTop * 1.5, midY - 10, BASE_X + wBottom * 0.5, midY + 20, BASE_X + wBottom, GROUND_Y,
  ].join(' ');
  return { d: left + ' ' + right + ' Z', topY: topY, h: h, bend: bendX, wTop: wTop };
}

/**
 * 递归长枝条：每一根都先向外、再向上翘起，末端分 2 叉。
 * 越大的树分叉越多、枝条越长。返回 path 段 + 末梢位置（叶子就长在末梢）。
 */
function buildLimbs(days, trunk) {
  const g = growth(days);
  const rand = rng(778812);
  const paths = [];
  const tips = [];

  // 分叉层数：第 1 天只有主干顶上的 2 根小枝，之后每过一段多一层
  const levels = days < 1 ? 0 : days < 4 ? 2 : days < 9 ? 3 : days < 16 ? 4 : 5;
  if (!levels) return { paths: paths, tips: tips };

  const topX = BASE_X + trunk.bend;
  const topY = trunk.topY;

  function limb(x, y, ang, len, w, depth) {
    const sx = x + Math.sin(ang) * len * 0.32 * 1.18;
    const sy = y - Math.cos(ang) * len * 0.32 * 0.9;
    const ex = x + Math.sin(ang * 1.12) * len * 1.18;
    const ey = y - Math.cos(ang * 1.12) * len * 0.9;
    paths.push({
      d: 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Q' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1),
      w: Math.max(1, w),
      depth: depth,
    });
    if (depth <= 1) {
      tips.push({ x: ex, y: ey, len: len, dir: Math.sin(ang) >= 0 ? 1 : -1, x0: x, y0: y });
      return;
    }
    const spread = (0.46 + rand() * 0.16) * (depth >= 3 ? 1 : 0.85);
    const shrink = depth >= 4 ? 0.60 : 0.68;
    limb(ex, ey, ang - spread, len * (shrink + rand() * 0.05), w * 0.6, depth - 1);
    limb(ex, ey, ang + spread * 0.9, len * (shrink - 0.03 + rand() * 0.07), w * 0.55, depth - 1);
  }

  // 主枝：顶端左右各一，第 3 天起主干中段再补左右各一
  const w0 = 1.9 + 1.4 * g;
  limb(topX, topY, -0.30 - rand() * 0.1, 48 + 50 * g, w0, levels);
  limb(topX, topY, 0.30 + rand() * 0.1, 48 + 50 * g, w0, levels);

  if (days >= 3) {
    const midY = topY + trunk.h * 0.22;
    limb(topX - 1, midY, -0.82 - rand() * 0.12, 44 + 44 * g, w0 * 0.8, levels - 1);
    limb(topX + 1, midY, 0.82 + rand() * 0.12, 44 + 44 * g, w0 * 0.8, levels - 1);
  }
  if (days >= 9) {
    const lowY = topY + trunk.h * 0.42;
    limb(topX, lowY, -1.12, 34 + 30 * g, w0 * 0.58, levels - 2);
    limb(topX, lowY, 1.12, 34 + 30 * g, w0 * 0.58, levels - 2);
  }
  return { paths: paths, tips: tips };
}

/** 叶片：沿枝条长成一簇簇 */
function leafSpots(tips, days) {
  const spots = [];
  const rand = rng(20261020);
  for (let i = 0; i < tips.length; i++) {
    const t = tips[i];
    // 沿枝条 35%–100% 的区段都长叶子，冠层中间才不会空
    for (let t2 = 0; t2 < 4; t2++) {
      const f = 0.34 + t2 * 0.22;
      const bx = (t.x0 || BASE_X) + (t.x - (t.x0 || BASE_X)) * f;
      const by = (t.y0 || t.y) + (t.y - (t.y0 || t.y)) * f;
      const cluster = 3 + Math.floor(rand() * 3);
      const r = 11 + Math.min(6, t.len * 0.07);
      for (let k = 0; k < cluster; k++) {
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand());
        spots.push({
          x: bx + Math.cos(ang) * rad * r,
          y: by + Math.sin(ang) * rad * r * 0.8,
          rot: rand() * 360,
          s: 0.8 + rand() * 0.45,
          hue: rand(),
        });
      }
    }
    // 末梢主簇
    const cluster = 6 + Math.floor(rand() * 3);
    const r = 14 + Math.min(8, t.len * 0.1);
    for (let k = 0; k < cluster; k++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand());
      spots.push({
        x: t.x + Math.cos(ang) * rad * r,
        y: t.y + Math.sin(ang) * rad * r * 0.82 - 4,
        rot: rand() * 360,
        s: 0.85 + rand() * 0.5,
        hue: rand(),
      });
    }
  }
  // 第 1–3 天生长期：在顶端补几片，让它像一棵小苗而不是一根杆
  if (days < 4) {
    const topY = GROUND_Y - (86 + 154 * Math.pow(Math.max(0, days) / 28, 0.82));
    for (let i = 0; i < 3; i++) {
      spots.push({
        x: 200 + (rand() - 0.5) * 18,
        y: topY + 4 + (rand() - 0.5) * 16,
        rot: rand() * 360,
        s: 1 + rand() * 0.3,
        hue: rand(),
      });
    }
  }
  // 按「从下到上」排序，叶片自下而上生长更自然
  spots.sort(function (a, b) { return b.y - a.y; });
  return spots;
}

const LEAF_PATH = 'M0 0 C 4.2 -6, 12.4 -5.6, 15 0 C 12.4 5.6, 4.2 6, 0 0 Z';
const LEAF_COLORS = ['#2f6b4f', '#3d8a63', '#4f9b6f', '#6cae84', '#437f5b', '#79b98d'];

function leafSvg(spot, i, mastered) {
  const color = LEAF_COLORS[Math.floor(spot.hue * LEAF_COLORS.length) % LEAF_COLORS.length];
  const stroke = mastered ? '#d3a143' : 'none';
  const sw = mastered ? 1.1 : 0;
  return (
    '<g class="leaf" transform="translate(' + spot.x.toFixed(1) + ' ' + spot.y.toFixed(1) + ') rotate(' + spot.rot.toFixed(0) + ')' +
    ' scale(' + (spot.s * 1.05 * (mastered ? 1.08 : 1)).toFixed(2) + ')">' +
    '<path d="' + LEAF_PATH + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="' + sw + '" opacity="' + (0.84 + spot.hue * 0.16).toFixed(2) + '"/>' +
    '<path d="M0.5 0 L14 0" stroke="rgba(255,255,255,.34)" stroke-width=".7"/>' +
    (mastered ? '<circle cx="16" cy="0" r="2.6" fill="#e2b45c" stroke="#a97a25" stroke-width=".6"/>' : '') +
    '</g>'
  );
}

/**
 * 生成整棵树的 SVG
 * @param {{days:number, words:number, mastered:number, rich?:boolean}} o
 */
export function treeSvg(o) {
  const days = Math.max(0, o.days || 0);
  const words = Math.max(0, o.words || 0);
  const mastered = Math.max(0, Math.min(o.mastered || 0, words));
  const g = growth(days);
  const trunk = trunkPath(days);
  const limbs = buildLimbs(days, trunk);
  const spots = leafSpots(limbs.tips, days);

  // 冠层不能冲出画面：按实际末梢范围等比压缩枝条和叶片（树冠中心保持在主干附近）
  let minX = BASE_X, maxX = BASE_X, minY = trunk.topY;
  for (let i = 0; i < limbs.tips.length; i++) {
    const t = limbs.tips[i];
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.y < minY) minY = t.y;
  }
  const crownW = maxX - minX + 40;
  const crownH = GROUND_Y - minY + 40;
  const k = Math.min(1, 300 / crownH, 260 / crownW);

  // 「满叶」按当前树的大小来算：树越大，能放的叶子越多，进度感更细腻
  const wanted = Math.round(words * 5.2);
  const cap = Math.round(spots.length * (0.92 + 0.08 * g));
  const shown = Math.min(wanted, cap, spots.length);
  // 从下往上均匀填：在竖直方向上等距取样，再让每段内部随机，避免全挤在下面的枝条上
  const BANDS = 6;
  const bands = [];
  for (let b = 0; b < BANDS; b++) bands.push([]);
  for (let i = 0; i < spots.length; i++) {
    let b = Math.floor(((spots[i].y - minY) / Math.max(1, GROUND_Y - minY)) * BANDS);
    if (b < 0) b = 0;
    if (b > BANDS - 1) b = BANDS - 1;
    bands[b].push(i);
  }
  for (let b = 0; b < BANDS; b++) shuffle(bands[b]);
  const order = [];
  // 每一轮从各层各取一小把（3 片），单薄时也不至于只长在一条横线上
  let maxLen = 0;
  for (let b = 0; b < BANDS; b++) if (bands[b].length > maxLen) maxLen = bands[b].length;
  for (let row = 0; row < maxLen; row++) {
    for (let b = BANDS - 1; b >= 0; b--) {
      for (let q = 0; q < 3; q++) {
        const idx = row * 3 + q;
        if (bands[b][idx] !== undefined) order.push(bands[b][idx]);
      }
    }
  }
  const picked = order.slice(0, shown);
  // 金叶（牢记）打散到整棵树，而不是聚成一堆
  const masteredSet = {};
  const mOrder = [];
  for (let q = 0; q < picked.length; q++) mOrder.push(q);
  shuffle(mOrder);
  for (let q = 0; q < Math.min(mastered, mOrder.length); q++) masteredSet[mOrder[q]] = true;
  const leaves = [];
  for (let q = 0; q < picked.length; q++) {
    leaves.push(leafSvg(spots[picked[q]], q, !!masteredSet[q]));
  }

  const trunkColor = days >= 14 ? '#5a4330' : days >= 3 ? '#6b5340' : '#7a6550';
  const trunkWidth = trunk.h > 230 ? 1.6 : 1.2;

  const branchSvg = limbs.paths.map(function (b) {
    return '<path d="' + b.d + '" stroke="' + trunkColor + '" stroke-width="' + b.w.toFixed(2) + '" fill="none" stroke-linecap="round"/>';
  }).join('');
  const ground =
    '<ellipse cx="200" cy="' + (GROUND_Y + 2) + '" rx="150" ry="21" fill="url(#gShadow)"/>' +
    '<path d="M54 ' + GROUND_Y + ' Q 200 ' + (GROUND_Y - 20) + ' 346 ' + GROUND_Y + ' L353 ' + (GROUND_Y + 30) + ' L47 ' + (GROUND_Y + 30) + ' Z" fill="url(#gSoil)"/>' +
    '<path d="M92 ' + (GROUND_Y - 2) + ' q 4 -9 8 0 M112 ' + (GROUND_Y + 1) + ' q 5 -11 9 -1 M282 ' + (GROUND_Y - 3) + ' q 4 -10 8 -1 M304 ' + (GROUND_Y) + ' q 5 -12 9 -2" stroke="#6cae84" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".55"/>';

  const seed =
    days < 1
      ? '<g class="seed">' +
        '<ellipse cx="200" cy="' + (GROUND_Y - 4) + '" rx="8.5" ry="10" fill="#6f5a44"/>' +
        '<ellipse cx="197" cy="' + (GROUND_Y - 7) + '" rx="3" ry="4.4" fill="#8d7359" opacity=".7"/>' +
        '<path d="M200 ' + (GROUND_Y - 12) + ' q 1 -22 6 -30" stroke="#4f9b6f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M206 ' + (GROUND_Y - 40) + ' q -15 -2 -19 -13 q 15 -1 19 13 Z" fill="#6cae84"/>' +
        '<path d="M206 ' + (GROUND_Y - 40) + ' q 13 -4 16 -15 q -13 2 -16 15 Z" fill="#4f9b6f"/>' +
        '<circle cx="212" cy="' + (GROUND_Y - 44) + '" r="1.8" fill="#e2b45c"/>' +
        '</g>'
      : '';

  const cls = o.rich ? 'tree rich' : 'tree';

  return (
    '<svg class="' + cls + '" viewBox="0 0 400 400" preserveAspectRatio="xMidYMax meet" role="img" aria-label="成长之树：已完成 ' + days + ' 天，学会 ' + words + ' 个词">' +
    '<defs>' +
    '<radialGradient id="gShadow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#2f6b4f" stop-opacity=".26"/><stop offset="100%" stop-color="#2f6b4f" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="gSoil" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#b9a888"/><stop offset="100%" stop-color="#a08d6c"/>' +
    '</linearGradient>' +
    '<linearGradient id="gTrunk" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0%" stop-color="' + trunkColor + '"/><stop offset="100%" stop-color="#8a7159"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<g class="ground">' + ground + '</g>' +
    '<g class="tree-body" transform="translate(' + BASE_X + ' ' + GROUND_Y + ') scale(' + k.toFixed(3) + ') translate(' + (-BASE_X) + ' ' + (-GROUND_Y) + ')">' +
    (days < 1 ? '' :
      '<g class="trunk"><path d="' + trunk.d + '" fill="url(#gTrunk)" stroke="' + trunkColor + '" stroke-width="' + trunkWidth + '"/>' +
      '<path d="M' + (BASE_X - 1) + ' ' + (GROUND_Y - 6) + ' C ' + (BASE_X - 4) + ' ' + (GROUND_Y - trunk.h * 0.4) + ', ' + (BASE_X + trunk.bend - 1) + ' ' + (GROUND_Y - trunk.h * 0.7) + ', ' + (BASE_X + trunk.bend) + ' ' + (GROUND_Y - trunk.h) +
      '" stroke="rgba(255,255,255,.18)" stroke-width="1.6" fill="none"/></g>') +
    '<g class="branches">' + branchSvg + '</g>' +
    '<g class="canopy">' + leaves.join('') + '</g>' +
    '</g>' +
    seed +
    '</svg>'
  );
}

/** 把树挂到容器并让新叶逐片长出来 */
export function mountTree(el, opts, animateNew) {
  const before = el.querySelectorAll('.leaf').length;
  el.innerHTML = treeSvg(opts);
  const leaves = el.querySelectorAll('.leaf');
  const total = leaves.length;
  const start = animateNew ? Math.min(before, total) : 0;
  for (let i = 0; i < total; i++) {
    const lf = leaves[i];
    if (i >= start) {
      lf.style.opacity = '0';
      const delay = animateNew ? 60 + (i - start) * 26 : Math.min(700, i * 8);
      setTimeout(makeAppear(lf, delay), delay);
    }
  }
  return total;
}

function makeAppear(lf, delay) {
  return function () {
    lf.style.transition = 'opacity .5s ease ' + Math.min(300, delay * 0.2) + 'ms';
    lf.style.opacity = '';
  };
}

/** 一片叶子从底部飞进树里（学习完成时的反馈） */
export function flyLeaf(x, y) {
  const el = document.createElement('div');
  el.className = 'leaf-fly';
  el.textContent = '🍃';
  el.style.left = (x || window.innerWidth / 2) + 'px';
  el.style.top = (y || window.innerHeight * 0.6) + 'px';
  el.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
  el.style.setProperty('--dy', (-90 - Math.random() * 60).toFixed(0) + 'px');
  el.style.setProperty('--rot', (Math.random() * 120 - 60).toFixed(0) + 'deg');
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1200);
}
