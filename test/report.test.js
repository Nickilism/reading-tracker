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

const fs = require('node:fs');
const vm = require('node:vm');

const generatorFiles = [
  'reading-tracker-github.js',
  'reading-tracker-year-github.js'
];

function loadProcessBooks(file) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('const COUNTRY_PREFIX_MAP');
  const end = source.indexOf('\n\nfunction addDerived', start);
  return vm.runInNewContext(
    source.slice(start, end) + '\n({ processBooks })',
    { console }
  ).processBooks;
}

test('processBooks 从 Report/report 附件字段映射 report 对象（两个生成器一致）', () => {
  for (const file of generatorFiles) {
    const processBooks = loadProcessBooks(file);
    const books = processBooks([
      {
        id: 'recAAA',
        fields: {
          Title: '书楼吊堂：炎昼',
          Report: [{ url: 'https://dl.airtable.com/1.md', filename: 'report.md' }]
        }
      },
      {
        id: 'recBBB',
        fields: {
          Title: 'A Brief History of Intelligence',
          report: [{ url: 'https://dl.airtable.com/2.html', filename: 'report.html' }]
        }
      },
      { id: 'recCCC', fields: { Title: '无报告的书' } }
    ]);
    assert.equal(books[0].id, 'recAAA', file);
    assert.equal(books[0].report.url, 'https://dl.airtable.com/1.md', file);
    assert.equal(books[0].report.filename, 'report.md', file);
    assert.equal(books[1].report.url, 'https://dl.airtable.com/2.html', file);
    assert.equal(books[1].report.filename, 'report.html', file);
    assert.equal(books[2].report, '', file);
  }
});
