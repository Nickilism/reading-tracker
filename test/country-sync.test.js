const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const PREFIX_DECL = 'const COUNTRY_PREFIX_MAP';
const FLAGS_DECL = 'const COUNTRY_FLAGS';
const PREFIX_FILES = [
  'reading-tracker-github.js',
  'reading-tracker-year-github.js',
  'template.js'
];

function rawContent(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (file === 'template.js') {
    // template.js 是被读取的模板文本：先剥离外层 const template = `...`; 再取内嵌脚本
    const m = src.match(/const template = `([\s\S]*)`;/);
    assert.ok(m, file + ' 应包含 const template = `...`;');
    src = m[1];
  }
  return src;
}

function loadMap(file, decl) {
  const src = rawContent(file);
  const marker = decl + ' = {';
  const start = src.indexOf(marker);
  assert.ok(start !== -1, file + ' 缺少 ' + marker);
  const end = src.indexOf('};', start) + 2;
  const code = src.slice(start, end).replace(decl + ' = {', 'var M = {') + '\nthis.__M = M;';
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ...ctx.__M }; // 摊平成当前 realm 的普通对象，避免 deepStrictEqual 比较原型
}

test('COUNTRY_PREFIX_MAP 三份副本（两个生成器 + template.js）应完全一致', () => {
  const maps = PREFIX_FILES.map((f) => loadMap(f, PREFIX_DECL));
  for (let i = 1; i < maps.length; i++) {
    assert.deepEqual(maps[i], maps[0], PREFIX_FILES[i] + ' 与 ' + PREFIX_FILES[0] + ' 不一致');
  }
});

test('COUNTRY_FLAGS 两份副本（template.js 与 all.html）应完全一致', () => {
  const t = loadMap('template.js', FLAGS_DECL);
  const a = loadMap('reading archive/all.html', FLAGS_DECL);
  assert.deepEqual(a, t, 'all.html 的 COUNTRY_FLAGS 与 template.js 不一致（新增国家时请同步国旗）');
});
