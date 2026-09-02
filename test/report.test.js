const assert = require('node:assert/strict');
const test = require('node:test');
const { escapeHtml, buildReportPage } = require('../report-pages');

test('markdown 报告: 转换为 HTML 并包含返回链接、书名、作者', () => {
  const html = buildReportPage({
    year: '2026',
    title: '书楼吊堂：炎昼',
    author: '[日] 京极夏彦',
    content: '# 第一章\n\n这是正文。',
    isHtml: false
  });
  assert.match(html, /<h1[^>]*>第一章<\/h1>/);
  assert.match(html, /<p>这是正文。<\/p>/);
  assert.match(html, /href="\.\.\/2026_reading_tracker\.html"/);
  assert.match(html, /书楼吊堂：炎昼/);
  assert.match(html, /\[日\] 京极夏彦/);
});

test('HTML 报告: 原样嵌入 iframe srcdoc 且转义正确', () => {
  const html = buildReportPage({
    year: '2026',
    title: 'A Brief History of Intelligence',
    author: 'Max Bennett',
    content: '<h1>Intro</h1><p>quote "quoted" & <b>bold</b></p>',
    isHtml: true
  });
  assert.match(html, /<iframe class="report-frame"/);
  assert.match(html, /srcdoc="/);
  assert.ok(html.includes('&quot;'), 'srcdoc 中的双引号应被转义');
  assert.match(html, /reportFrame\.style\.height/);
});

test('escapeHtml 转义特殊字符', () => {
  assert.equal(
    escapeHtml('<a href="x">&\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;\'&lt;/a&gt;'
  );
});
