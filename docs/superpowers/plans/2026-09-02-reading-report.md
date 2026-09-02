# 阅读报告功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在年度阅读页面中，为 Airtable `Report` 附件字段（`.md` / `.html`）生成独立静态报告页，并在书籍清单与详情面板提供「阅读报告」入口。

**Architecture:** 构建时下载附件：`.md` 用 `marked` 转 HTML 嵌入正文，`.html` 原样放入 `<iframe srcdoc>`；产物写入 `reading archive/reports/<年份>/<recId>.html`。每本书的 JS 数据对象携带相对路径 `reports/<年份>/<recId>.html` 进入 `BOOKS_JSON`，`template.js` 按该字段渲染两个入口按钮。纯渲染逻辑抽到共享模块 `report-pages.js`，两个生成器复用，保证行为一致。

**Tech Stack:** Node.js（`https`、`fs`、`node:test`）、`marked`（devDependency）、原生模板字符串。

**Spec:** `docs/superpowers/specs/2026-09-02-reading-report-design.md`

## Global Constraints

- 报告统一存放 `reading archive/reports/<年份>/`，产物一律 `<recId>.html`（recId = Airtable 记录 ID，纯 ASCII、唯一、稳定）。
- 无记录 ID（正常流程不会出现）：跳过该报告并告警，不生成文件。实现说明：spec 原文「由书名-作者生成 ASCII slug」细化为「跳过并告警」，避免中文书名导致的歧义文件名；Task 3 会同步修订 spec 对应行。
- 每本书的 `report` 字段：成功时为相对路径字符串 `reports/<年份>/<recId>.html`；失败或无报告时为 `''`。
- `reading-tracker-github.js` 与 `reading-tracker-year-github.js` 行为保持一致，共享 `report-pages.js`；不得只在单侧引入行为。
- 附件字段兼容 `Report` / `report` 两种大小写；多附件取第一个并告警。
- 不修改 `.github/workflows/deploy.yml`；不做报告缓存；不自动删除旧报告文件。
- 颜色必须通过 CSS 变量定义和引用；报告页沿用现有设计语言（`.page` 780px、深色模式 `prefers-color-scheme`）。
- 模板占位符约定不变：`{{YEAR}}`、`{{GENERATED_DATE}}`、`{{BOOKS_JSON}}`、`{{COUNTRY_PREFIX_MAP}}`、`{{WEREAD_JSON}}`、`{{FAVICON_PREFIX}}`。
- 下载复用 `https` 模块模式，不引入全局 `fetch`（保持 Node 14+ 兼容）。
- 报告内容为用户自产内容，不做 HTML 消毒（与现有 Review/Summary 渲染同一信任级别）。
- 非 `.md` / `.html` 扩展名按 Markdown 处理并在构建日志中告警。
- 验证命令统一为 `node --test test/`（本仓库无 npm scripts）。

---

### Task 1: 报告页构建模块 `report-pages.js`（纯函数）+ 单测 + `marked` 依赖

**Files:**
- Create: `report-pages.js`
- Create: `test/report.test.js`
- Modify: `package.json`、`package-lock.json`（通过 `npm install -D marked`）

**Interfaces:**
- Consumes: `marked`（devDependency）
- Produces: `buildReportPage({ year, title, author, content, isHtml })` → 完整 HTML 字符串；`escapeHtml(str)` → 转义后的字符串。Task 3 将消费 `buildReportPage`。

- [ ] **Step 1: 安装 marked 依赖**

Run: `npm install -D marked`
Expected: `package.json` 的 `devDependencies` 增加 `marked`；`node_modules` 就绪。若网络/写入被沙箱拦截，使用 escalate 重跑。

- [ ] **Step 2: 写失败测试**

创建 `test/report.test.js`：

```js
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
  assert.ok(html.includes('&amp;quot;'), 'srcdoc 中的双引号应被转义');
  assert.match(html, /reportFrame\.style\.height/);
});

test('escapeHtml 转义特殊字符', () => {
  assert.equal(
    escapeHtml('<a href="x">&\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;\'&lt;/a&gt;'
  );
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test test/report.test.js`
Expected: FAIL，`Cannot find module '../report-pages'`（模块尚未创建）。

- [ ] **Step 4: 实现 `report-pages.js`**

创建 `report-pages.js`：

```js
/**
 * report-pages.js - 阅读报告静态页构建（纯函数，不访问网络/文件系统）
 *
 * 依赖文件:
 *   - marked (devDependency, 构建期 Markdown 转换)
 *
 * 导出:
 *   - escapeHtml(str): string
 *   - buildReportPage({ year, title, author, content, isHtml }): string
 */

const { marked } = require('marked');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReportPage({ year, title, author, content, isHtml }) {
  const safeTitle = escapeHtml(title);
  const safeAuthor = escapeHtml(author);
  const bodyContent = isHtml
    ? '<iframe class="report-frame" id="reportFrame" srcdoc="' + escapeHtml(content) + '"></iframe>\n' +
      '<script>\n' +
      "  const reportFrame = document.getElementById('reportFrame');\n" +
      "  reportFrame.addEventListener('load', () => {\n" +
      '    const doc = reportFrame.contentDocument;\n' +
      '    if (doc) reportFrame.style.height = (doc.documentElement.scrollHeight + 24) + "px";\n' +
      '  });\n' +
      '</script>'
    : '<div class="report-content">' + marked.parse(content) + '</div>';

  return '<!DOCTYPE html>\n' +
    '<html lang="zh-CN">\n' +
    '<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <title>' + safeTitle + ' 阅读报告</title>\n' +
    '  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
    '  <style>\n' +
    '    :root {\n' +
    '      --bg: #fafaf9; --bg-alt: #f2f0ee; --text: #1c1917; --text-secondary: #44403c;\n' +
    '      --text-muted: #78716c; --border: #e7e5e4; --accent: #b45309; --accent-hover: #92400e;\n' +
    '    }\n' +
    '    @media (prefers-color-scheme: dark) {\n' +
    '      :root {\n' +
    '        --bg: #11100f; --bg-alt: #1a1817; --text: #f5f5f4; --text-secondary: #d6d3d1;\n' +
    '        --text-muted: #a8a29e; --border: #292524; --accent: #d6a24e; --accent-hover: #e2b86b;\n' +
    '      }\n' +
    '    }\n' +
    '    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
    '    body { background: var(--bg); color: var(--text); font-family: "Inter", "Noto Sans SC", system-ui, sans-serif; padding: 2.5rem 1rem 2rem; }\n' +
    '    .page { max-width: 780px; margin: 0 auto; }\n' +
    '    .report-head { margin-bottom: 2rem; }\n' +
    '    .report-back { color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600; }\n' +
    '    .report-back:hover { color: var(--accent-hover); }\n' +
    '    .report-title { font-family: "DM Serif Display", "Noto Serif SC", serif; font-size: 1.8rem; line-height: 1.25; margin-top: 0.75rem; }\n' +
    '    .report-author { color: var(--text-muted); margin-top: 0.35rem; font-size: 14px; }\n' +
    '    .report-content { line-height: 1.75; font-size: 15px; color: var(--text-secondary); overflow-wrap: break-word; }\n' +
    '    .report-content h1, .report-content h2, .report-content h3 { color: var(--text); margin: 1.4em 0 0.6em; line-height: 1.3; font-family: "DM Serif Display", "Noto Serif SC", serif; }\n' +
    '    .report-content h1 { font-size: 1.5rem; }\n' +
    '    .report-content h2 { font-size: 1.3rem; }\n' +
    '    .report-content h3 { font-size: 1.1rem; }\n' +
    '    .report-content p { margin: 0.8em 0; }\n' +
    '    .report-content ul, .report-content ol { padding-left: 1.4em; margin: 0.8em 0; }\n' +
    '    .report-content blockquote { border-left: 3px solid var(--accent); padding-left: 1em; color: var(--text-muted); margin: 1em 0; }\n' +
    '    .report-content code { background: var(--bg-alt); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }\n' +
    '    .report-content pre { background: var(--bg-alt); padding: 1em; border-radius: 8px; overflow-x: auto; margin: 1em 0; }\n' +
    '    .report-content pre code { background: none; padding: 0; }\n' +
    '    .report-content img { max-width: 100%; height: auto; border-radius: 6px; }\n' +
    '    .report-content table { border-collapse: collapse; margin: 1em 0; }\n' +
    '    .report-content th, .report-content td { border: 1px solid var(--border); padding: 0.5em 0.75em; }\n' +
    '    .report-frame { width: 100%; border: 1px solid var(--border); border-radius: 8px; background: #fff; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="page">\n' +
    '    <div class="report-head">\n' +
    '      <a class="report-back" href="../' + year + '_reading_tracker.html">&larr; 返回 ' + year + ' 阅读记录</a>\n' +
    '      <h1 class="report-title">' + safeTitle + '</h1>\n' +
    '      <div class="report-author">' + safeAuthor + '</div>\n' +
    '    </div>\n' +
    bodyContent + '\n' +
    '  </div>\n' +
    '</body>\n' +
    '</html>\n';
}

module.exports = { escapeHtml, buildReportPage };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/report.test.js`
Expected: 3 个测试全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add report-pages.js test/report.test.js package.json package-lock.json
git commit -m "feat: add report page builder with markdown support"
```

---

### Task 2: `processBooks` 映射 `Report` 附件字段（两个生成器）

**Files:**
- Modify: `reading-tracker-github.js`（`processBooks`）
- Modify: `reading-tracker-year-github.js`（`processBooks`）
- Modify: `test/report.test.js`（新增 processBooks 映射测试）

**Interfaces:**
- Consumes: Airtable 记录 `{ id, fields }`（`fields.Report` 或 `fields.report` 为附件数组）
- Produces: 书对象新增 `id: string`、`report: '' | { url: string, filename: string }`。Task 3 消费该 `report` 对象。

- [ ] **Step 1: 写失败测试**

在 `test/report.test.js` 追加：

```js
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
    assert.deepEqual(
      books[0].report,
      { url: 'https://dl.airtable.com/1.md', filename: 'report.md' },
      file
    );
    assert.deepEqual(
      books[1].report,
      { url: 'https://dl.airtable.com/2.html', filename: 'report.html' },
      file
    );
    assert.equal(books[2].report, '', file);
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/report.test.js`
Expected: 新增测试 FAIL（`books[0].report` 为 `undefined`）。

- [ ] **Step 3: 实现映射（两个文件相同改动）**

在 `reading-tracker-github.js` 与 `reading-tracker-year-github.js` 的 `processBooks` 中，`const rating = b['My Rating'];` 之后插入：

```js
    const reportAttachments =
      (Array.isArray(b.Report) && b.Report.length > 0)
        ? b.Report
        : (Array.isArray(b.report) && b.report.length > 0 ? b.report : null);
    if (reportAttachments && reportAttachments.length > 1) {
      console.warn('  注意: ' + (b.Title || '(未命名)') + ' 的 Report 字段有 ' + reportAttachments.length + ' 个附件，仅使用第一个');
    }
```

在返回对象中 `summary: b.Summary || ''` 之后追加：

```js
      id: r.id || '',
      report: reportAttachments
        ? { url: reportAttachments[0].url || '', filename: reportAttachments[0].filename || '' }
        : '',
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/`
Expected: 所有测试（country-mapping + report）PASS。

- [ ] **Step 5: 语法检查**

Run: `node --check reading-tracker-github.js`
Run: `node --check reading-tracker-year-github.js`
Expected: 均无输出（退出码 0）。

- [ ] **Step 6: 提交**

```bash
git add reading-tracker-github.js reading-tracker-year-github.js test/report.test.js
git commit -m "feat: map Airtable Report attachment into book data"
```

---

### Task 3: 下载附件并生成报告文件（`downloadUrl` + `fetchReports`）

**Files:**
- Modify: `reading-tracker-github.js`
- Modify: `reading-tracker-year-github.js`
- Modify: `docs/superpowers/specs/2026-09-02-reading-report-design.md`（修订无记录 ID 兜底行）

**Interfaces:**
- Consumes: `book.report` 对象 `{ url, filename }`、`book.id`；`report-pages.js` 的 `buildReportPage`
- Produces: 磁盘文件 `reading archive/reports/<年份>/<recId>.html`；`book.report` 变为 `'' | 'reports/<年份>/<recId>.html'`。Task 4 消费该字符串。

- [ ] **Step 1: 修订 spec 兜底行**

将 `docs/superpowers/specs/2026-09-02-reading-report-design.md` 中：

```text
- 无记录 ID 的兜底（正常流程不会出现）：由「书名-作者」生成 ASCII slug。
```

改为：

```text
- 无记录 ID（正常流程不会出现）：跳过该报告的生成并在构建日志中告警，避免生成歧义文件名。
```

- [ ] **Step 2: 引入共享模块并实现下载与生成（两个文件相同改动）**

在两个生成器的 `require('dotenv').config({ debug: false });` 之后追加：

```js
const { buildReportPage } = require('./report-pages');
```

在两个生成器的 `addDerived` 函数之后、`generate` 函数之前插入：

```js
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const get = (target) => {
      const req = https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++redirects > 5) {
            reject(new Error('重定向次数过多'));
            return;
          }
          get(new URL(res.headers.location, target).toString());
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
    };
    get(url);
  });
}

async function fetchReports(books, year) {
  const reportDir = 'reading archive/reports/' + year;
  fs.mkdirSync(reportDir, { recursive: true });
  let reportCount = 0;
  for (const book of books) {
    if (!book.report || typeof book.report !== 'object') continue;
    if (!book.id) {
      console.warn('  跳过报告: ' + (book.title || '(未命名)') + ' 缺少记录 ID');
      book.report = '';
      continue;
    }
    const filename = book.report.filename || '';
    const isHtml = /\.html?$/i.test(filename);
    if (!isHtml && !/\.md$/i.test(filename)) {
      console.warn('  提示: ' + (book.title || '(未命名)') + ' 的报告格式 ' + (filename || '(未知)') + ' 按 Markdown 处理');
    }
    const outPath = reportDir + '/' + book.id + '.html';
    try {
      const content = await downloadUrl(book.report.url);
      const html = buildReportPage({
        year: year,
        title: book.title,
        author: book.author,
        content: content,
        isHtml: isHtml
      });
      fs.writeFileSync(outPath, html, 'utf8');
      book.report = 'reports/' + year + '/' + book.id + '.html';
      reportCount++;
      console.log('  已生成报告: ' + book.title + ' -> ' + outPath);
    } catch (err) {
      console.warn('  报告处理失败，已跳过: ' + (book.title || '(未命名)') + ' - ' + err.message);
      book.report = '';
    }
  }
  if (reportCount > 0) console.log('阅读报告生成完成: ' + reportCount + ' 本');
}
```

- [ ] **Step 3: 在 main 流程中调用**

`reading-tracker-github.js` 的 `main()` 中，将：

```js
    const processed = addDerived(processBooks(records));
    const wereadData = await fetchWeReadData(processed, noCache);
```

改为：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    const wereadData = await fetchWeReadData(processed, noCache);
```

`reading-tracker-year-github.js` 的 `generateForYear()` 中，将：

```js
    const processed = addDerived(processBooks(records));
    const html = generate(year, processed);
```

改为：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    const html = generate(year, processed);
```

- [ ] **Step 4: 语法检查**

Run: `node --check reading-tracker-github.js`
Run: `node --check reading-tracker-year-github.js`
Expected: 均无输出（退出码 0）。

- [ ] **Step 5: 运行既有测试**

Run: `node --test test/`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add reading-tracker-github.js reading-tracker-year-github.js docs/superpowers/specs/2026-09-02-reading-report-design.md
git commit -m "feat: download and build static reading report pages"
```

---

### Task 4: `template.js` 两个入口按钮 + CSS

**Files:**
- Modify: `template.js`（CSS、`renderBooklist`、`renderPanelContent`）
- Create: `test/template-smoke.test.js`

**Interfaces:**
- Consumes: 书对象 `report` 字符串（来自 Task 3，空字符串不渲染按钮）
- Produces: 列表书名右侧按钮、面板作者下方按钮；均 `target="_blank"` 相对链接

- [ ] **Step 1: 写失败测试**

创建 `test/template-smoke.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/template-smoke.test.js`
Expected: 第二个测试 FAIL（`class="report-btn"` 尚不存在）。

- [ ] **Step 3: 新增 CSS**

在 `template.js` 中 `.book-title { ... }` 规则之后插入：

```css
    .book-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 3px;
    }

    .book-title-row .book-title { margin-bottom: 0; }

    .report-btn {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border: 1px solid var(--accent);
      border-radius: 999px;
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }

    .report-btn:hover {
      background: var(--accent);
      color: var(--bg);
    }
```

在 `.panel-author { ... }` 规则之后插入：

```css
    .panel-report-btn {
      align-self: flex-start;
      margin-bottom: 8px;
    }
```

- [ ] **Step 4: 书单入口**

将 `renderBooklist` 的返回模板：

```js
        return `<div class="book-row">
          <div class="book-info">
            <div class="book-dates">${b.start}<br>${b.finish}</div>
            <div class="book-title"><a href="${b.doubanLink}" target="_blank" style="color:inherit;text-decoration:none;">${b.title}</a></div>
            <div class="book-author">${b.author}</div>
```

改为：

```js
        const reportBtn = b.report
          ? `<a class="report-btn" href="${b.report}" target="_blank" rel="noopener">阅读报告</a>`
          : '';
        return `<div class="book-row">
          <div class="book-info">
            <div class="book-dates">${b.start}<br>${b.finish}</div>
            <div class="book-title-row">
              <div class="book-title"><a href="${b.doubanLink}" target="_blank" style="color:inherit;text-decoration:none;">${b.title}</a></div>
              ${reportBtn}
            </div>
            <div class="book-author">${b.author}</div>
```

- [ ] **Step 5: 面板入口**

将 `renderPanelContent` 中面板头部拼接：

```js
      panelHeader.innerHTML =
        coverHtml +
        '<div class="panel-book-info">' +
          '<div class="panel-title">' + book.title + '</div>' +
          '<div class="panel-author">' + book.author + '</div>' +
```

改为：

```js
      panelHeader.innerHTML =
        coverHtml +
        '<div class="panel-book-info">' +
          '<div class="panel-title">' + book.title + '</div>' +
          '<div class="panel-author">' + book.author + '</div>' +
          (book.report
            ? '<a class="report-btn panel-report-btn" href="' + book.report + '" target="_blank" rel="noopener">阅读报告</a>'
            : '') +
```

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test test/`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add template.js test/template-smoke.test.js
git commit -m "feat: add reading report buttons to book list and panel"
```

---

### Task 5: 端到端验证与产物提交

**Files:**
- 验证产物（不修改代码，除非发现问题）：`reading archive/2026_reading_tracker.html`、`reading archive/reports/2026/` 下的报告文件

**Interfaces:**
- Consumes: Task 1-4 全部代码
- Produces: 重新生成的年度页与报告文件（提交到 git）

- [ ] **Step 1: 确认工作区干净（除既有未提交改动）**

Run: `git status --porcelain`
Expected: 只有本功能相关的已提交代码；如有其他未提交改动，先记录并保留，不覆盖。

- [ ] **Step 2: 本地生成 2026 年页（访问 Airtable，可能更新 weread-cache.json）**

Run: `node reading-tracker-github.js 2026`
Expected: 日志出现「已生成报告: 书楼吊堂：炎昼 -> reading archive/reports/2026/recXXX.html」与另一本测试书；最终「JS 语法验证: OK」。若沙箱拦截网络/写入，使用 escalate 重跑。

- [ ] **Step 3: 核对产物**

Run: `Get-ChildItem -Recurse 'reading archive/reports'`
Expected: 存在 `2026/` 目录及与测试书记录 ID 同名的 `.html` 文件。
Run: `rg -n "report-btn|reports/2026/" 'reading archive/2026_reading_tracker.html'`
Expected: 至少两处按钮相关代码与报告路径出现在生成页中。

- [ ] **Step 4: 浏览器验证**

通过 `preview.cmd` 或 `/browse` skill 打开本地预览，逐项检查：

1. 书籍清单中两本有报告的书，书名右侧出现「阅读报告」按钮；点击后新标签页打开报告。
2. `.md` 报告（书楼吊堂：炎昼）正文为正常排版（标题/段落/列表），无纯文本裸露。
3. `.html` 报告（A Brief History of Intelligence）在 iframe 中原样渲染且高度自适应。
4. 详情面板（点击封面）作者下方出现按钮，行为同上。
5. 搜索/筛选后按钮随行显示/隐藏正确。
6. 窄屏与深色模式下按钮与报告页可读。
7. 无报告的书两处都不出现按钮。

- [ ] **Step 5: 问题修复（如发现）**

发现问题时：修改对应文件，重跑 `node --test test/` 与 Step 2，再回到 Step 4。修复提交使用 `fix: ...` 前缀。

- [ ] **Step 6: 提交产物**

```bash
git add 'reading archive/2026_reading_tracker.html' 'reading archive/reports'
git commit -m "chore: regenerate 2026 page with reading reports"
```

- [ ] **Step 7: 汇总**

向用户报告：生成结果、两个按钮位置、两种格式渲染情况、产物路径；明确未推送、未修改 CI、未删除旧文件。
