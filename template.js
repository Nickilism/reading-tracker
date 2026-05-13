/**
 * template.js - 阅读记录 HTML 模板
 *
 * 生成脚本通过 String.replace() 注入以下变量：
 *   {{YEAR}}          - 年份
 *   {{GENERATED_DATE}} - 生成日期
 *   {{BOOKS_JSON}}    - 书籍数据 JSON
 *
 * 结构说明：
 *   HTML 模板 → CSS 样式 → JavaScript 逻辑
 */

const template = `<!DOCTYPE html>
<html lang="zh" id="html">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1f1f22">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <title>{{YEAR}} 阅读记录</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=Noto+Sans+SC:wght@500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
  <style>
    /* ===== Reset & Variables ===== */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg: #ffffff;
      --bg-alt: #f6f5f4;
      --text: rgba(0,0,0,0.95);
      --text-secondary: #615d59;
      --text-muted: #a39e98;
      --border: rgba(0,0,0,0.1);
      --accent: #0075de;
      --shadow-hover: 0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.02);
      --star-empty: rgba(0,0,0,0.15);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121214;
        --bg-alt: #1c1c1f;
        --text: rgba(255,255,255,0.92);
        --text-secondary: #9e9a96;
        --text-muted: #6b6762;
        --border: rgba(255,255,255,0.1);
        --accent: #0075de;
        --shadow-hover: 0 2px 6px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1);
        --star-empty: rgba(255,255,255,0.15);
      }
    }

    /* ===== Base ===== */
    body {
      font-family: 'Inter', 'Noto Sans SC', -apple-system, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 1rem;
      line-height: 1.5;
      transition: background 0.2s ease, color 0.2s ease;
    }

    @media (min-width: 768px) {
      body { padding: 2rem; }
    }

    .page {
      max-width: 1000px;
      margin: 0 auto;
    }

    /* ===== Header ===== */
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.25rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
    }

    .title-block h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.625px;
      color: var(--text);
      line-height: 1.1;
    }

    .title-block p {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 500;
    }

    .year-badge {
      font-size: 3rem;
      font-weight: 700;
      color: var(--bg-alt);
      line-height: 1;
      user-select: none;
      letter-spacing: -1.5px;
    }

    /* ── Search Input ───────────────── */
    .search-wrap {
      position: relative;
      margin-top: 0.75rem;
    }

    .search-input {
      width: 100%;
      padding: 0.7rem 2.6rem 0.7rem 2.6rem;
      font-family: inherit;
      font-size: 15px;
      color: var(--text);
      background: var(--bg-alt);
      border: none;
      border-radius: 10px;
      outline: none;
      transition: box-shadow 0.2s ease;
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:focus {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      box-shadow: none;
    }

    .search-icon {
      position: absolute;
      left: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-clear {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      font-size: 16px;
      line-height: 1;
      display: none;
    }

    .search-clear.visible {
      display: block;
    }

    .no-results {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .filtered-query {
      color: var(--accent);
      font-weight: 500;
    }

    .clear-filter {
      background: none;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0.15rem 0.6rem;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .clear-filter:hover {
      background: var(--bg-alt);
      color: var(--text);
    }

    .title-block h1 {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    @media (min-width: 768px) {
      .title-block h1 { font-size: 2.25rem; letter-spacing: -1px; }
      .year-badge { font-size: 4rem; }
    }

    /* ===== Stats Grid ===== */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 600px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    }

    @media (min-width: 600px) {
      .stats-grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
    }

    @media (min-width: 900px) {
      .stats-grid { gap: 12px; }
    }

    .stat {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      transition: box-shadow 0.2s, background 0.2s ease, border-color 0.2s ease;
    }

    .stat:hover {
      box-shadow: var(--shadow-hover);
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: var(--text);
    }

    /* ===== Country Stats ===== */
    .country-section {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .section-title {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .country-grid {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .country-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
      transition: all 0.15s;
      cursor: default;
    }

    .country-badge:hover {
      box-shadow: var(--shadow-hover);
      transform: translateY(-1px);
    }

    .country-flag { font-size: 14px; }
    .country-count { font-size: 11px; color: var(--text-muted); font-weight: 600; }

    /* ===== Chart ===== */
    .chart-wrap {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .chart-container {
      position: relative;
      height: 160px;
    }

    /* ===== Filters ===== */
    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-right: 4px;
    }

    .filter-btn {
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 5px 14px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .filter-btn:hover {
      border-color: var(--text);
      color: var(--text);
    }

    .filter-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    /* ===== Cover Wall ===== */
    .wall-section {
      margin-top: 2rem;
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }

    .wall-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .wall-header h2 {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.25px;
    }

    .wall-header span {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
    }

    #cover-wall {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    @media (min-width: 600px) {
      #cover-wall { grid-template-columns: repeat(5, 1fr); gap: 12px; }
    }

    @media (min-width: 900px) {
      #cover-wall { grid-template-columns: repeat(5, 1fr); gap: 14px; }
    }

    .cover-link {
      display: block;
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-alt);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }

    .cover-link:hover {
      transform: scale(1.03);
      box-shadow: var(--shadow-hover);
    }

    .cover-img-wrap { position: relative; }
    .cover-img-wrap img { display: block; width: 100%; height: auto; }

    .cover-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 30%, transparent 70%);
      opacity: 0;
      transition: opacity 0.25s ease;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 10px 9px;
    }

    .cover-link:hover .cover-overlay { opacity: 1; }
    .cover-title { font-size: 11px; font-weight: 600; color: #fff; line-height: 1.3; margin-bottom: 2px; }
    .cover-author { font-size: 9px; color: rgba(255,255,255,0.7); margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cover-rating { font-size: 11px; color: #f5a623; }

    /* ===== Collapsible Book List ===== */
    .booklist-section {
      margin-top: 1.5rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s ease;
    }

    .booklist-toggle {
      width: 100%;
      background: var(--bg-alt);
      border: none;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: background 0.15s;
    }

    .booklist-toggle:hover { background: var(--bg-alt); filter: brightness(0.95); }

    .sort-bar {
      display: flex;
      gap: 6px;
      padding: 10px 18px;
      background: var(--bg);
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .sort-btn {
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .sort-btn:hover { border-color: var(--text); color: var(--text); }
    .sort-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

    .booklist-toggle .arrow {
      font-size: 10px;
      transition: transform 0.2s;
    }

    .booklist-toggle.open .arrow { transform: rotate(180deg); }

    .booklist-content { display: none; padding: 0; }
    .booklist-content.open { display: block; }

    .book-row {
      background: var(--bg);
      border-top: 1px solid var(--border);
      padding: 14px 18px;
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .book-row:first-child { border-top: none; }

    .book-info { flex: 1; min-width: 0; }

    .book-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 3px;
      line-height: 1.4;
    }

    .book-author {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 8px;
      font-weight: 500;
    }

    .book-review {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-top: 8px;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .review-more-btn {
      background: none;
      border: none;
      padding: 4px 0;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      color: var(--accent);
      cursor: pointer;
      margin-top: 4px;
      transition: color 0.15s;
    }

    .review-more-btn:hover { color: var(--accent-hover); }

    .book-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .month-tag {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .star-rating { font-size: 11px; letter-spacing: 1px; }

    .star-filled {
      background: linear-gradient(to right, #f5a623 100%, #f5a623 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .star-half {
      background: linear-gradient(to right, #f5a623 0%, #f5a623 50%, var(--star-empty) 50%, var(--star-empty) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .star-empty { color: var(--star-empty); }
    .rating-num { font-size: 10px; color: var(--text-muted); font-weight: 600; }
    .pages-tag { font-size: 10px; color: var(--text-muted); }

    .book-dates {
      text-align: right;
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.7;
      white-space: nowrap;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    /* ===== Footer ===== */
    footer {
      margin-top: 2.5rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
      font-size: 11px;
      color: var(--text-muted);
      text-align: center;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 500;
    }

    /* ===== Responsive ===== */
    @media (max-width: 480px) {
      .book-row { flex-direction: column; gap: 8px; }
      .book-dates { text-align: left; }
      .stat-value { font-size: 1.5rem; }
      .stats-grid { gap: 8px; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- ===== Header ===== -->
    <header>
      <div class="title-block">
        <h1>阅读记录</h1>
        <p id="subtitle">{{MONTH_RANGE}} {{YEAR}}</p>
        <div class="search-wrap" id="searchWrap">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="search-input" id="searchInput" placeholder="搜索书名或作者..." autocomplete="off">
          <button class="search-clear" id="searchClear" aria-label="清除搜索">✕</button>
        </div>
      </div>
      <div class="year-badge">{{YEAR}}</div>
    </header>

    <!-- ===== Stats Grid ===== -->
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-label">已读书目</div>
        <div class="stat-value" id="total-books">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">平均评分</div>
        <div class="stat-value" id="avg-rating">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">总页数</div>
        <div class="stat-value" id="total-pages">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">阅读天数中位数</div>
        <div class="stat-value" id="avg-reading-time">—</div>
      </div>
    </div>

    <!-- ===== Country Stats ===== -->
    <div class="country-section">
      <div class="section-title">国家分布</div>
      <div class="country-grid" id="country-grid"></div>
    </div>

    <!-- ===== Chart ===== -->
    <div class="chart-wrap">
      <div class="section-title">每月阅读量</div>
      <div class="chart-container">
        <canvas id="monthChart" role="img"></canvas>
      </div>
    </div>

    <!-- ===== Filters ===== -->
    <div class="filters" id="filters">
      <span class="filter-label">筛选</span>
    </div>

    <!-- ===== Cover Wall ===== -->
    <div class="wall-section">
      <div class="wall-header">
        <h2>书影留存</h2>
        <span id="wall-count">— 本</span>
      </div>
      <div id="cover-wall"></div>
    </div>

    <!-- ===== Book List ===== -->
    <div class="booklist-section">
      <button class="booklist-toggle" id="booklist-toggle" onclick="toggleBooklist()">
        <span>书籍清单</span>
        <span class="arrow">▼</span>
      </button>
      <div class="sort-bar" id="sort-bar">
        <button class="sort-btn active" data-sort="finish">时间 ↓</button>
        <button class="sort-btn" data-sort="rating">评分 ↓</button>
        <button class="sort-btn" data-sort="pages">页数 ↓</button>
      </div>
      <div class="booklist-content" id="booklist-content"></div>
    </div>

    <!-- ===== Footer ===== -->
<footer id="footer" style="display: flex; align-items: center; justify-content: center; gap: 0;">导出于 {{GENERATED_DATE}} · <a href="https://github.com/Nickilism/reading-tracker" target="_blank" style="color: var(--text-muted); text-decoration: none; display: inline-flex; align-items: center; margin-left: 0.25em; line-height: 1; margin-bottom: 2px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display: block;"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg></a></footer>
  <script>
    // ========== 数据注入开始 ==========
    // 以下变量由生成脚本注入

    const YEAR = {{YEAR}};
    const GENERATED_DATE = "{{GENERATED_DATE}}";

    // 12个月颜色配置
    const MONTH_COLORS = [
      { bg: '#b5d4f4', color: '#0c447c', label: '1月' },
      { bg: '#9fe1cb', color: '#085041', label: '2月' },
      { bg: '#fac775', color: '#633806', label: '3月' },
      { bg: '#f5c4b3', color: '#712b13', label: '4月' },
      { bg: '#d4c4f4', color: '#4c147c', label: '5月' },
      { bg: '#f4d4b5', color: '#7c4414', label: '6月' },
      { bg: '#b5f4d4', color: '#147c54', label: '7月' },
      { bg: '#f4b5d4', color: '#7c1454', label: '8月' },
      { bg: '#d4f4b5', color: '#547c14', label: '9月' },
      { bg: '#b5d4f4', color: '#147c8c', label: '10月' },
      { bg: '#f4b5b5', color: '#7c1414', label: '11月' },
      { bg: '#b5f4f4', color: '#147c7c', label: '12月' },
    ];

    // 国家前缀映射（支持多种括号格式）
    const COUNTRY_PREFIX_MAP = {
      // 方括号
      '[日]': '日本', '[美]': '美国', '[德]': '德国', '[英]': '英国',
      '[法]': '法国', '[塞尔维亚]': '塞尔维亚', '[韩]': '韩国', '[俄]': '俄罗斯',
      '[以色列]': '以色列', '[爱尔兰]': '爱尔兰', '[英美]': '英美', '[荷]': '荷兰',
      '[意大利]': '意大利', '[奥]': '奥地利', '[奥地利]': '奥地利', '[阿根廷]': '阿根廷',
      '[波兰]': '波兰', '[葡萄牙]': '葡萄牙', '[古希腊]': '古希腊',
      '[瑞典]': '瑞典', '[加拿大]': '加拿大', '[澳]': '澳大利亚',
      '[英国]': '英国', '[加]': '加拿大', '[意]': '意大利', '[波]': '波兰',
      '[阿]': '阿根廷', '[荷]': '荷兰',
      // 圆括号
      '(日)': '日本', '(美)': '美国', '(德)': '德国', '(英)': '英国',
      '(法)': '法国', '(韩)': '韩国', '(俄)': '俄罗斯', '(荷)': '荷兰',
      '(意)': '意大利', '(奥)': '奥地利', '(葡萄牙)': '葡萄牙',
      '(古希腊)': '古希腊', '(俄罗斯)': '俄罗斯',
      // 中文圆括号
      '（日）': '日本', '（美）': '美国', '（德）': '德国', '（英）': '英国',
      '（法）': '法国', '（韩）': '韩国', '（俄）': '俄罗斯',
      '（意）': '意大利', '（葡萄牙）': '葡萄牙',
      // 中文方括号 〔 〕
      '〔美〕': '美国', '〔英〕': '英国', '〔日〕': '日本', '〔德〕': '德国',
      '〔法〕': '法国', '〔俄〕': '俄罗斯', '〔意〕': '意大利', '〔波〕': '波兰',
    };

    // 国家旗帜
    const COUNTRY_FLAGS = {
      '中国': '🇨🇳', '日本': '🇯🇵', '美国': '🇺🇸', '德国': '🇩🇪',
      '英国': '🇬🇧', '法国': '🇫🇷', '塞尔维亚': '🇷🇸', '韩国': '🇰🇷',
      '俄罗斯': '🇷🇺', '以色列': '🇮🇱', '爱尔兰': '🇮🇪', '英美': '🇺🇸',
      '荷兰': '🇳🇱', '意大利': '🇮🇹', '奥地利': '🇦🇹', '阿根廷': '🇦🇷',
      '波兰': '🇵🇱', '葡萄牙': '🇵🇹', '古希腊': '🇬🇷', '瑞典': '🇸🇪',
      '加拿大': '🇨🇦', '澳大利亚': '🇦🇺', '西班牙': '🇪🇸', '捷克': '🇨🇿',
    };

    // 检测字符串是否包含中文字符
    function hasChineseChars(str) {
      return /[\u4e00-\u9fa5]/.test(str);
    }

    // 标准化作者名字符串，去除各种括号及其内容
    function stripCountryPrefixes(author) {
      return author
        .replace(/\[([^\]]+)\]/g, '')   // [xxx]
        .replace(/\(([^\)]+)\)/g, '')     // (xxx)
        .replace(/（([^）]+)）/g, '')      // （xxx）
        .replace(/《([^》]+)》/g, '')     // 《xxx》
        .replace(/【([^】]+)】/g, '')     // 【xxx】
        .trim();
    }

    // 国家推断
    function deriveCountry(author) {
      // 1. 先匹配前缀映射表
      for (const [prefix, country] of Object.entries(COUNTRY_PREFIX_MAP)) {
        if (author.includes(prefix)) return country;
      }
      // 2. 无前缀时，根据姓名文字判断
      const nameOnly = stripCountryPrefixes(author);
      if (hasChineseChars(nameOnly)) {
        return '中国';
      }
      // 3. 纯英文名默认为美国
      return '美国';
    }

    // 书籍数据（由生成脚本注入）
    const books = {{BOOKS_JSON}};
    const allBooks = books.slice(); // preserve original for repeated filtering
    let searchQuery = '';
    let searchDebounce = null;

    // ========== 数据注入结束 ==========

    // ===== 初始化 =====
    const actualMonths = [...new Set(books.map(b => b.month))].sort((a, b) => a - b);
    const monthMeta = {};
    actualMonths.forEach(m => { monthMeta[m] = MONTH_COLORS[m - 1]; });

    const monthLabels = actualMonths.map(m => `${m}月`);
    const MONTH_RANGE = `${Math.min(...actualMonths)}月 – ${Math.max(...actualMonths)}月`;
    document.getElementById('subtitle').textContent = 'Nickilism';

    // ===== 统计计算 =====
    const totalBooks = books.length;
    const avgRating = (books.reduce((sum, b) => sum + b.rating, 0) / totalBooks).toFixed(1);
    const totalPages = books.reduce((sum, b) => sum + (parseInt(b.pages) || 0), 0);

    // 国家统计（只统计非空国家）
    const countryCount = {};
    books.forEach(b => {
      if (b.country) {
        countryCount[b.country] = (countryCount[b.country] || 0) + 1;
      }
    });

    // 每月统计
    const monthCounts = {};
    actualMonths.forEach(m => { monthCounts[m] = 0; });
    books.forEach(b => { if (monthCounts[b.month] !== undefined) monthCounts[b.month]++; });

    // ===== 更新 DOM =====
    document.getElementById('total-books').textContent = totalBooks;
    document.getElementById('avg-rating').textContent = avgRating;
    document.getElementById('total-pages').textContent = totalPages;

    // 计算阅读天数中位数
    const readingDays = books.map(b => {
      const start = new Date(b.start);
      const finish = new Date(b.finish);
      return (finish - start) / (1000 * 60 * 60 * 24);
    }).sort((a, b) => a - b);

    const medianReadingDays = readingDays.length % 2 === 0
      ? (readingDays[readingDays.length/2 - 1] + readingDays[readingDays.length/2]) / 2
      : readingDays[Math.floor(readingDays.length/2)];
    document.getElementById('avg-reading-time').textContent = medianReadingDays.toFixed(1);

    // 渲染国家分布
    const countryGrid = document.getElementById('country-grid');
    Object.entries(countryCount).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
      const badge = document.createElement('div');
      badge.className = 'country-badge';
      badge.innerHTML = `<span class="country-flag">${COUNTRY_FLAGS[country] || ''}</span>${country}<span class="country-count">×${count}</span>`;
      countryGrid.appendChild(badge);
    });

    // ===== 星星计算 =====
    function stars(rating) {
      let full, half;
      if (rating >= 9) { full = 5; half = 0; }
      else if (rating >= 8.5) { full = 4; half = 1; }
      else if (rating >= 8.0) { full = 4; half = 0; }
      else if (rating >= 7.5) { full = 3; half = 1; }
      else if (rating >= 7.0) { full = 3; half = 0; }
      else { full = 2; half = 0; }
      const empty = 5 - full - half;
      return '<span class="star-filled">★</span>'.repeat(full) +
             (half ? '<span class="star-half">★</span>' : '') +
             '<span class="star-empty">☆</span>'.repeat(empty);
    }

    // ===== 筛选器 =====
    const filterMap = {
      all: () => true,
      high: b => b.rating >= 8.3,
      normal: b => b.rating > 7.9 && b.rating < 8.3,
      low: b => b.rating <= 7.9,
    };

    const highCount = allBooks.filter(b => b.rating >= 8.3).length;
    const normalCount = allBooks.filter(b => b.rating > 7.9 && b.rating < 8.3).length;
    const lowCount = allBooks.filter(b => b.rating <= 7.9).length;

    const filterBtns = [
      { key: 'all', label: `全部 (${totalBooks})` },
      { key: 'high', label: `🟢 高分作品 (${highCount})` },
      { key: 'normal', label: `🟡 普通作品 (${normalCount})` },
      { key: 'low', label: `🔴 低分作品 (${lowCount})` },
    ];

    // 添加国家筛选按钮
    Object.entries(countryCount).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
      filterBtns.push({
        key: `country-${country}`,
        label: `${COUNTRY_FLAGS[country] || ''} ${country} (${count})`
      });
      filterMap[`country-${country}`] = b => b.country === country;
    });

    // 添加月份筛选按钮
    actualMonths.forEach(m => {
      const count = allBooks.filter(b => b.month === m).length;
      filterBtns.push({
        key: `month-${m}`,
        label: `${m}月`
      });
      filterMap[`month-${m}`] = b => b.month === m;
    });

    let currentFilter = 'all';
    let currentSortField = 'finish';
    let currentSortDir = 'desc';
    let booklistOpen = true;

    // ===== 搜索 + 筛选组合逻辑 =====
    function getFilteredBooks() {
      let result = allBooks;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(b =>
          (b.title && b.title.toLowerCase().includes(q)) ||
          (b.author && b.author.toLowerCase().includes(q))
        );
      }
      if (currentFilter !== 'all') {
        result = result.filter(filterMap[currentFilter]);
      }
      return result;
    }

    function updateFilterCounts(list) {
      document.querySelectorAll('.filter-btn').forEach(btn => {
        const key = btn.dataset.filterKey;
        if (!key) return;
        if (key === 'all') {
          btn.textContent = `全部 (${list.length})`;
        } else if (filterMap[key]) {
          btn.textContent = btn.dataset.baseLabel + ` (${list.filter(filterMap[key]).length})`;
        }
      });
    }

    function updateStats(list) {
      const n = list.length;
      document.getElementById('total-books').textContent = n;
      document.getElementById('avg-rating').textContent =
        n ? (list.reduce((s, b) => s + b.rating, 0) / n).toFixed(1) : '0';
      document.getElementById('total-pages').textContent =
        list.reduce((s, b) => s + (parseInt(b.pages) || 0), 0).toLocaleString();
      if (n) {
        const days = list.map(b => {
          const s = new Date(b.start), f = new Date(b.finish);
          return (f - s) / (1000 * 60 * 60 * 24);
        }).sort((a, b) => a - b);
        const median = days.length % 2 === 0
          ? (days[days.length/2 - 1] + days[days.length/2]) / 2
          : days[Math.floor(days.length/2)];
        document.getElementById('avg-reading-time').textContent = median.toFixed(1);
      } else {
        document.getElementById('avg-reading-time').textContent = '0';
      }
      // Country badges
      const cc = {};
      list.forEach(b => { if (b.country) cc[b.country] = (cc[b.country] || 0) + 1; });
      const cg = document.getElementById('country-grid');
      cg.innerHTML = '';
      Object.entries(cc).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
        const badge = document.createElement('div');
        badge.className = 'country-badge';
        badge.innerHTML = `<span class="country-flag">${COUNTRY_FLAGS[country] || ''}</span>${country}<span class="country-count">×${count}</span>`;
        cg.appendChild(badge);
      });
      updateFilterCounts(list);
    }

    function updateChart(list) {
      const counts = {};
      actualMonths.forEach(m => { counts[m] = 0; });
      list.forEach(b => { if (counts[b.month] !== undefined) counts[b.month]++; });
      monthChart.data.datasets[0].data = actualMonths.map(m => counts[m]);
      monthChart.options.scales.y.max = Math.max(Math.max(...actualMonths.map(m => counts[m])) + 1, 4);
      monthChart.update();
    }

    function applySearchAndFilter() {
      const filtered = getFilteredBooks();
      updateStats(filtered);
      updateChart(filtered);
      if (filtered.length > 0) {
        renderWall(filtered);
        renderBooklist(getSortedList(filtered));
        if (booklistOpen) {
          document.getElementById('booklist-content').classList.add('open');
          document.getElementById('booklist-toggle').classList.add('open');
        }
      } else {
        document.getElementById('cover-wall').innerHTML = '<div class="no-results">没有找到匹配的书籍</div>';
        document.getElementById('booklist-content').innerHTML = '<div class="no-results">没有找到匹配的书籍</div>';
        document.getElementById('wall-count').textContent = '0 本';
      }
    }

    // ===== 搜索框事件 =====
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    // 从 URL 预填
    const urlParams = new URLSearchParams(window.location.search);
    searchQuery = urlParams.get('search') || '';
    searchInput.value = searchQuery;
    if (searchQuery) searchClear.classList.add('visible');

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = e.target.value.trim();
        const url = new URL(window.location);
        if (searchQuery) {
          url.searchParams.set('search', searchQuery);
        } else {
          url.searchParams.delete('search');
        }
        history.replaceState(null, '', url);
        searchClear.classList.toggle('visible', !!searchQuery);
        applySearchAndFilter();
      }, 150);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.classList.remove('visible');
      const url = new URL(window.location);
      url.searchParams.delete('search');
      history.replaceState(null, '', url);
      applySearchAndFilter();
      searchInput.focus();
    });

    // ===== 筛选按钮 =====
    const filtersEl = document.getElementById('filters');
    filterBtns.forEach(fb => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (fb.key === 'all' ? ' active' : '');
      btn.textContent = fb.label;
      btn.dataset.filterKey = fb.key;
      btn.dataset.baseLabel = fb.label.replace(/\s*\(\d+\)\s*$/, '');
      btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = fb.key;
        applySearchAndFilter();
      };
      filtersEl.appendChild(btn);
    });

    // ===== 渲染封面墙 =====
    function renderWall(list) {
      document.getElementById('wall-count').textContent = `${list.length} 本`;
      const wallEl = document.getElementById('cover-wall');
      wallEl.innerHTML = '';
      // 按 finish 时间升序排列
      const sorted = getSortedList(list);
      sorted.forEach(b => {
        const item = document.createElement('div');
        item.className = 'cover-item';
        item.innerHTML = `
          <div class="cover-link" onclick="window.open('${b.doubanLink}', '_blank')" title="${b.title}">
            <div class="cover-img-wrap">
              <img src="${b.cover}" alt="${b.title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 150%22><rect fill=%22%23f6f5f4%22 width=%22100%22 height=%22150%22/><text x=%2250%22 y=%2280%22 text-anchor=%22middle%22 fill=%22%23a39e98%22 font-size=%2210%22>${b.title}</text></svg>'">
              <div class="cover-overlay">
                <div class="cover-title">${b.title}</div>
                <div class="cover-author">${b.author}</div>
                <div class="cover-rating">${stars(b.rating)} ${b.rating}</div>
              </div>
            </div>
          </div>`;
        wallEl.appendChild(item);
      });
    }

    // ===== 渲染书单列表 =====
    function renderBooklist(list) {
      const content = document.getElementById('booklist-content');
      content.innerHTML = list.map((b, idx) => {
        const m = monthMeta[b.month];
        let reviewSection = '';
        if (b.review) {
          const needsTruncation = b.review.length > 60;
          const truncatedText = needsTruncation ? b.review.substring(0, 60) + '...' : b.review;
          reviewSection = `
            <div class="book-review" id="review-${idx}" data-full="${encodeURIComponent(b.review)}" data-truncated="${needsTruncation}">
              ${truncatedText.replace(/\n/g, '<br>')}
            </div>
            ${needsTruncation ? `<button class="review-more-btn" onclick="toggleReview(${idx}, this)">展开</button>` : ''}
          `;
        }
        return `<div class="book-row">
          <div class="book-info">
            <div class="book-title"><a href="${b.doubanLink}" target="_blank" style="color:inherit;text-decoration:none;">${b.title}</a></div>
            <div class="book-author">${b.author}</div>
            <div class="book-meta">
              <span class="month-tag" style="background:${m.bg};color:${m.color}">${m.label}</span>
              <span class="star-rating">${stars(b.rating)}</span>
              <span class="rating-num">${b.rating}</span>
              ${b.pages ? `<span class="pages-tag">${b.pages}页</span>` : ''}
            </div>
            ${reviewSection}
          </div>
          <div class="book-dates">${b.start}<br>${b.finish}</div>
        </div>`;
      }).join('');
    }

    function toggleReview(idx, btn) {
      const review = document.getElementById(`review-${idx}`);
      const isCollapsed = btn.textContent === '展开';
      const fullText = decodeURIComponent(review.dataset.full);

      if (isCollapsed) {
        review.innerHTML = fullText.replace(/\n/g, '<br>');
        btn.textContent = '收起';
      } else {
        review.innerHTML = fullText.substring(0, 60) + '...';
        btn.textContent = '展开';
      }
    }

    // ===== 展开/收起书单 =====
    function toggleBooklist() {
      const toggle = document.getElementById('booklist-toggle');
      const content = document.getElementById('booklist-content');
      booklistOpen = !booklistOpen;
      toggle.classList.toggle('open', booklistOpen);
      content.classList.toggle('open', booklistOpen);
    }

    // ===== 排序函数 =====
    function getSortedList(list) {
      const sorted = [...list];
      const dir = currentSortDir === 'desc' ? -1 : 1;
      switch (currentSortField) {
        case 'finish': return sorted.sort((a, b) => a.finish.localeCompare(b.finish) * dir);
        case 'rating': return sorted.sort((a, b) => (a.rating - b.rating) * dir);
        case 'pages': return sorted.sort((a, b) => ((parseInt(a.pages) || 0) - (parseInt(b.pages) || 0)) * dir);
        default: return sorted;
      }
    }

    // ===== 排序按钮事件 =====
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.sort;
        if (currentSortField === field) {
          // 同字段点击 → 切换方向
          currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          // 不同字段 → 切换到该字段，默认降序
          currentSortField = field;
          currentSortDir = 'desc';
        }
        // 更新按钮文字
        const fieldLabels = { finish: '时间', rating: '评分', pages: '页数' };
        document.querySelectorAll('.sort-btn').forEach(b => {
          const f = b.dataset.sort;
          const a = (currentSortField === f) ? currentSortDir : 'desc';
          b.textContent = fieldLabels[f] + (a === 'desc' ? ' ↓' : ' ↑');
          b.classList.toggle('active', currentSortField === f);
        });
        applySearchAndFilter();
      });
    });

    // ===== 图表 =====
    const maxMonthlyCount = Math.max(...actualMonths.map(m => monthCounts[m]));
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const chartTextColor = isDark ? '#9e9a96' : '#615d59';
    const chartGridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const monthChart = new Chart(document.getElementById('monthChart'), {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: '本数',
          data: actualMonths.map(m => monthCounts[m]),
          backgroundColor: actualMonths.map(m => MONTH_COLORS[m - 1].bg),
          borderColor: actualMonths.map(m => MONTH_COLORS[m - 1].color),
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: Math.max(maxMonthlyCount + 1, 4),
            ticks: { stepSize: 1, font: { family: 'Inter', size: 11 }, color: chartTextColor },
            grid: { color: chartGridColor },
            border: { display: false }
          },
          x: {
            ticks: { font: { family: 'Inter', size: 12 }, color: chartTextColor },
            grid: { display: false },
            border: { display: false }
          }
        }
      },
      plugins: [{
        id: 'monthDataLabels',
        afterDatasetsDraw(chart) {
          const { ctx, data, scales } = chart;
          ctx.save();
          ctx.font = '600 11px Inter';
          ctx.fillStyle = chartTextColor;
          ctx.textAlign = 'center';
          data.datasets[0].data.forEach((value, index) => {
            if (value > 0) {
              const x = scales.x.getPixelForValue(index);
              const y = scales.y.getPixelForValue(value) - 6;
              ctx.fillText(value, x, y);
            }
          });
          ctx.restore();
        }
      }]
    });

    // ===== 初始渲染 =====
    applySearchAndFilter();
  </script>
</body>
</html>
`;

module.exports = template;
