const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function renderTemplate(books) {
  const source = fs.readFileSync('template.js', 'utf8');
  const template = source.match(/const template = `([\s\S]*)`;/)[1];
  return template
    .replace(/\{\{YEAR\}\}/g, '2026')
    .replace('{{GENERATED_DATE}}', '2026-09-02')
    .replace('{{COUNTRY_PREFIX_MAP}}', '{}')
    .replace('{{BOOKS_JSON}}', JSON.stringify(books))
    .replace('{{WEREAD_JSON}}', '{}')
    .replace(/\{\{FAVICON_PREFIX\}\}/g, '../');
}

test('模板注入后内嵌脚本语法有效', () => {
  const html = renderTemplate([]);
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, '应存在内嵌 script');
  assert.doesNotThrow(() => new Function(m[1]), '内嵌脚本应通过语法检查');
});

test('模板包含报告按钮渲染逻辑', () => {
  const html = renderTemplate([{
    title: '书楼吊堂：炎昼',
    author: '[日] 京极夏彦',
    start: '',
    finish: '2026-05-01',
    rating: 5,
    pages: 100,
    doubanLink: '',
    cover: '',
    review: '',
    summary: '',
    month: 5,
    country: '中国',
    report: 'reports/2026/recAAA.html'
  }]);
  assert.match(html, /class="report-btn"/);
  assert.match(html, /\$\{b\.report\}/);
});
