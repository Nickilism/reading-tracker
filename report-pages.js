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
