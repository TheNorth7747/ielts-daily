/* =========================================================
   build.mjs · 零依赖打包器
   把 assets/ 下的 ES Module 拼成一个经典脚本 assets/app.bundle.js，
   这样双击 index.html（file:// 协议）也能跑——浏览器在 file:// 下
   会因为 CORS 拒绝加载 <script type="module">。

   用法：node build.mjs
   改了 assets/ 下任何 .js 之后都要重跑一次。
   ========================================================= */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = 'assets/app.js';
const OUT = 'assets/app.bundle.js';

const modules = [];   // 按依赖顺序
const seen = new Set();

function resolveId(from, spec) {
  const base = path.posix.dirname(from);
  return path.posix.normalize(path.posix.join(base, spec));
}

/** 把 import/export 改写成普通语句，并记录导出名 */
function transform(id, src) {
  const exportsMap = []; // [exportedName, localName]

  // 1) import { a, b as c } from './x.js'
  src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm, (m, names, spec) => {
    const target = resolveId(id, spec);
    collect(target, spec);
    const bind = names.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const mm = s.split(/\s+as\s+/);
        return mm.length === 2 ? mm[0].trim() + ': ' + mm[1].trim() : s;
      })
      .join(', ');
    return 'const { ' + bind + ' } = __M[' + JSON.stringify(target) + '];';
  });

  // 2) import './x.js'
  src = src.replace(/^import\s*['"]([^'"]+)['"];?/gm, (m, spec) => {
    const target = resolveId(id, spec);
    collect(target, spec);
    return '__M[' + JSON.stringify(target) + '];';
  });

  // 3) export { a, b as c }
  src = src.replace(/^export\s*\{([\s\S]*?)\};?/gm, (m, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const mm = s.split(/\s+as\s+/);
      if (mm.length === 2) exportsMap.push([mm[1].trim(), mm[0].trim()]);
      else exportsMap.push([s, s]);
    });
    return '';
  });

  // 4) export function / const / let / class
  src = src.replace(/^export\s+(async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm, (m, kw, name) => {
    exportsMap.push([name, name]);
    return kw + ' ' + name;
  });

  if (/^\s*(import|export)\s/m.test(src)) {
    throw new Error('还有没处理掉的 import/export：' + id + '\n' + src.match(/^\s*(import|export).*/m)[0]);
  }
  return { code: src, exportsMap };
}

function collect(id, spec) {
  if (seen.has(id)) return;
  seen.add(id);
  const file = path.join(ROOT, id);
  if (!fs.existsSync(file)) throw new Error('找不到模块：' + spec + ' → ' + id);
  const raw = fs.readFileSync(file, 'utf8');
  const { code, exportsMap } = transform(id, raw);
  // 依赖先入栈（transform 里已经递归 collect），再放自己 → 后序
  modules.push({ id, code, exportsMap });
}

collect(ENTRY, ENTRY);

const body = modules.map((m) => {
  const ret = m.exportsMap.length
    ? '\n  return { ' + m.exportsMap.map(([e, l]) => e + ': ' + l).join(', ') + ' };\n'
    : '\n  return {};\n';
  return '__M[' + JSON.stringify(m.id) + '] = (function () {\n' + m.code + ret + '})();';
}).join('\n\n');

const banner = '/* 自动生成，请勿直接编辑。源码在 assets/*.js，改完执行：node build.mjs */';

const out = banner + '\n(function () {\n"use strict";\nvar __M = {};\n\n' + body +
  '\n\nwindow.__IELTS_BOOTED = true;\n})();\n';

fs.writeFileSync(path.join(ROOT, OUT), out, 'utf8');
console.log('打包完成：' + OUT + '（' + modules.length + ' 个模块，' + Math.round(out.length / 1024) + ' KB）');
console.log('顺序：' + modules.map((m) => m.id).join(' → '));
