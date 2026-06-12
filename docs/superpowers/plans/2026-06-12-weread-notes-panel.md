# 微信读书笔记弹出面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在年度阅读记录页面中，点击封面弹出右侧面板，展示微信读书的划线、想法和点评。

**Architecture:** 构建时通过微信读书 API 拉取笔记数据，嵌入 HTML（与现有 `{{BOOKS_JSON}}` 模式一致）。使用增量缓存避免重复拉取历史书籍数据。面板 UI 为右侧滑入（移动端底部滑入）。

**Tech Stack:** Node.js (https 模块), 原生 JS/CSS (template.js 内联), GitHub Actions

**Spec:** `docs/superpowers/specs/2026-06-12-weread-notes-panel-design.md`

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `weread-api.js` | 微信读书 API 封装（HTTP 调用、错误处理、速率限制） | 新建 |
| `weread-match.js` | 书籍模糊匹配逻辑（title+author 标准化、精确/模糊匹配） | 新建 |
| `weread-cache.js` | 增量缓存管理（读写 `weread-cache.json`） | 新建 |
| `reading-tracker-github.js` | 构建入口，集成上述模块，注入 `{{WEREAD_JSON}}` | 修改 |
| `template.js` | 面板 HTML/CSS/JS，封面 onclick 变更，`{{WEREAD_JSON}}` 占位符 | 修改 |
| `.github/workflows/deploy.yml` | 新增 `WEREAD_API_KEY` 环境变量 | 修改 |
| `.gitignore` | 新增 `weread-cache.json` | 修改 |

---

### Task 1: WeRead API 模块 (`weread-api.js`)

**Files:**
- Create: `weread-api.js`

创建独立的微信读书 API 封装模块，提供 `fetchShelf()`, `fetchBookInfo()`, `fetchHighlights()`, `fetchThoughts()` 四个函数。

- [ ] **Step 1: 创建 `weread-api.js` 基础结构**

```js
/**
 * weread-api.js - 微信读书 API 封装
 *
 * 通过 Agent Gateway 调用微信读书接口。
 * 所有请求通过 POST https://i.weread.qq.com/api/agent/gateway
 */

const https = require('https');

const WEREAD_API_KEY = process.env.WEREAD_API_KEY;
const GATEWAY_HOST = 'i.weread.qq.com';
const GATEWAY_PATH = '/api/agent/gateway';
const SKILL_VERSION = '1.0.3';

function gatewayRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ ...body, skill_version: SKILL_VERSION });
    const options = {
      hostname: GATEWAY_HOST,
      port: 443,
      path: GATEWAY_PATH,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WEREAD_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errcode && json.errcode !== 0) {
            reject(new Error('WeRead API error: ' + (json.errmsg || json.errcode)));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Failed to parse WeRead response: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 获取完整书架列表
 * @returns {Promise<Array>} 电子书数组，每项包含 bookId, title, author
 */
async function fetchShelf() {
  const result = await gatewayRequest({ api_name: '/shelf/sync' });
  return result.books || [];
}

/**
 * 获取书籍信息（评分、评分人数）
 * @param {string} bookId
 * @returns {Promise<Object>} 包含 newRating, newRatingCount 等
 */
async function fetchBookInfo(bookId) {
  const result = await gatewayRequest({ api_name: '/book/info', bookId: bookId });
  return result;
}

/**
 * 获取单本书的划线列表
 * @param {string} bookId
 * @returns {Promise<Object>} 包含 updated (划线数组) 和 chapters
 */
async function fetchHighlights(bookId) {
  const result = await gatewayRequest({ api_name: '/book/bookmarklist', bookId: bookId });
  return result;
}

/**
 * 获取单本书的个人想法与点评
 * @param {string} bookId
 * @returns {Promise<Object>} 包含 reviews 数组
 */
async function fetchThoughts(bookId) {
  const result = await gatewayRequest({ api_name: '/review/list/mine', bookid: bookId, count: 100 });
  return result;
}

/**
 * 获取书籍热门划线
 * @param {string} bookId
 * @returns {Promise<Object>} 包含 items 数组
 */
async function fetchPopularHighlights(bookId) {
  const result = await gatewayRequest({ api_name: '/book/bestbookmarks', bookId: bookId, chapterUid: 0 });
  return result;
}

module.exports = {
  fetchShelf,
  fetchBookInfo,
  fetchHighlights,
  fetchThoughts,
  fetchPopularHighlights,
  sleep
};
```

- [ ] **Step 2: 验证模块语法**

Run: `node -c weread-api.js`
Expected: 无输出（语法正确）

- [ ] **Step 3: Commit**

```bash
git add weread-api.js
git commit -m "feat: add WeRead API client module"
```

---

### Task 2: 书籍匹配模块 (`weread-match.js`)

**Files:**
- Create: `weread-match.js`

创建模糊匹配模块，将 Airtable 书籍与微信读书书架对应起来。

- [ ] **Step 1: 创建 `weread-match.js`**

```js
/**
 * weread-match.js - Airtable 书籍 ↔ 微信读书书架 模糊匹配
 */

/**
 * 标准化字符串：去空格、去标点、转小写
 */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[\s　]/g, '')       // 全角/半角空格
    .replace(/[^\w一-龥]/g, '') // 去标点，保留中英文和数字
    .trim();
}

/**
 * 检查两个 author 字符串是否有交集
 * 策略：标准化后，任一包含另一，或有共同的中文名/英文词
 */
function authorMatch(airtableAuthor, wereadAuthor) {
  const a = normalize(airtableAuthor);
  const w = normalize(wereadAuthor);
  if (!a || !w) return false;
  // 精确包含
  if (a.includes(w) || w.includes(a)) return true;
  // 提取中文名（2-4字）做匹配
  const aChinese = a.match(/[一-龥]{2,4}/g) || [];
  const wChinese = w.match(/[一-龥]{2,4}/g) || [];
  if (aChinese.some(cn => w.includes(cn))) return true;
  // 提取英文词做匹配
  const aWords = a.match(/[a-z]+/g) || [];
  const wWords = w.match(/[a-z]+/g) || [];
  if (aWords.some(word => wWords.includes(word) && word.length > 2)) return true;
  return false;
}

/**
 * 匹配 Airtable 书籍到微信读书书架
 *
 * @param {Array} airtableBooks - processBooks() 输出的书籍数组
 * @param {Array} shelfBooks - fetchShelf() 返回的书架数组
 * @returns {Object} { matched: [{airtable, shelf}], unmatched: [airtableBook] }
 */
function matchBooks(airtableBooks, shelfBooks) {
  const matched = [];
  const unmatched = [];
  const usedShelfIds = new Set();

  for (const book of airtableBooks) {
    const titleNorm = normalize(book.title);
    let bestMatch = null;

    for (const shelf of shelfBooks) {
      if (usedShelfIds.has(shelf.bookId)) continue;

      const shelfTitleNorm = normalize(shelf.title || '');
      const titleExact = titleNorm === shelfTitleNorm;
      const titleFuzzy = titleNorm.includes(shelfTitleNorm) || shelfTitleNorm.includes(titleNorm);

      if ((titleExact || titleFuzzy) && authorMatch(book.author, shelf.author || '')) {
        bestMatch = shelf;
        if (titleExact) break; // 精确匹配优先
      }
    }

    if (bestMatch) {
      usedShelfIds.add(bestMatch.bookId);
      matched.push({ airtable: book, shelf: bestMatch });
    } else {
      unmatched.push(book);
    }
  }

  return { matched, unmatched };
}

module.exports = { matchBooks, normalize, authorMatch };
```

- [ ] **Step 2: 验证模块语法**

Run: `node -c weread-match.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
git add weread-match.js
git commit -m "feat: add book matching module for Airtable ↔ WeRead"
```

---

### Task 3: 缓存管理模块 (`weread-cache.js`)

**Files:**
- Create: `weread-cache.js`

- [ ] **Step 1: 创建 `weread-cache.js`**

```js
/**
 * weread-cache.js - 微信读书数据增量缓存
 *
 * 缓存文件: weread-cache.json（项目根目录）
 * 缓存 key: wereadId
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'weread-cache.json');

/**
 * 读取缓存，不存在则返回空对象
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('读取缓存失败，将重新获取:', e.message);
  }
  return {};
}

/**
 * 保存缓存到文件
 */
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * 从缓存中获取指定书籍数据
 * @param {Object} cache
 * @param {string} wereadId
 * @returns {Object|null}
 */
function getCached(cache, wereadId) {
  return cache[wereadId] || null;
}

/**
 * 检查是否命中缓存
 */
function isCached(cache, wereadId) {
  return !!cache[wereadId];
}

module.exports = { loadCache, saveCache, getCached, isCached };
```

- [ ] **Step 2: 验证模块语法**

Run: `node -c weread-cache.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
git add weread-cache.js
git commit -m "feat: add WeRead data cache module"
```

---

### Task 4: 构建脚本集成 (`reading-tracker-github.js`)

**Files:**
- Modify: `reading-tracker-github.js`
- Modify: `.gitignore`

将三个模块集成到构建流程中：拉取微信读书数据、匹配、缓存、注入模板。

- [ ] **Step 1: 在 `reading-tracker-github.js` 顶部添加模块引入**

在第 28 行 `require('dotenv').config({ debug: false });` 之后添加：

```js
const { fetchShelf, fetchBookInfo, fetchHighlights, fetchThoughts, fetchPopularHighlights, sleep } = require('./weread-api');
const { matchBooks } = require('./weread-match');
const { loadCache, saveCache, isCached } = require('./weread-cache');
```

- [ ] **Step 2: 在 `main()` 中添加 `--no-cache` 参数解析**

在 `const year = process.argv[2] || ...` 之前添加：

```js
const noCache = process.argv.includes('--no-cache');
```

- [ ] **Step 3: 在 `main()` 中添加 `fetchWeReadData` 调用**

在 `const processed = addDerived(processBooks(records));` 之后，`const html = generate(year, processed);` 之前，添加：

```js
    const wereadData = await fetchWeReadData(processed, noCache);
```

- [ ] **Step 4: 修改 `generate()` 函数注入 `{{WEREAD_JSON}}`**

将 `generate` 函数改为：

```js
function generate(year, books, wereadData) {
  const countryMapStr = JSON.stringify(COUNTRY_PREFIX_MAP).replace(/"/g, "'");
  let output = TEMPLATE
    .replace(/\{\{YEAR\}\}/g, String(year))
    .replace(/\{\{GENERATED_DATE\}\}/g, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }))
    .replace('{{COUNTRY_PREFIX_MAP}}', countryMapStr)
    .replace('{{BOOKS_JSON}}', JSON.stringify(books))
    .replace('{{WEREAD_JSON}}', JSON.stringify(wereadData));
  return output;
}
```

并更新调用处：`const html = generate(year, processed, wereadData);`

- [ ] **Step 5: 添加 `fetchWeReadData` 函数**

在 `addDerived` 函数之后添加：

```js
async function fetchWeReadData(books, noCache) {
  if (!process.env.WEREAD_API_KEY) {
    console.log('\n未设置 WEREAD_API_KEY，跳过微信读书数据获取');
    return {};
  }

  console.log('\n正在获取微信读书数据...');
  const cache = noCache ? {} : loadCache();
  const cacheHits = [];
  const toFetch = [];

  // 1. 获取书架
  let shelfBooks;
  try {
    shelfBooks = await fetchShelf();
    console.log('  书架获取成功，共 ' + shelfBooks.length + ' 本');
  } catch (e) {
    console.error('  获取书架失败:', e.message);
    return {};
  }

  // 2. 匹配
  const { matched, unmatched } = matchBooks(books, shelfBooks);
  console.log('  匹配成功: ' + matched.length + ' 本，未匹配: ' + unmatched.length + ' 本');

  if (unmatched.length > 0) {
    console.log('  未匹配的书:', unmatched.map(b => b.title).join(', '));
  }

  // 3. 分流：缓存命中 vs 需要拉取
  const wereadData = {};
  for (const { airtable, shelf } of matched) {
    airtable.wereadId = shelf.bookId;
    if (!noCache && isCached(cache, shelf.bookId)) {
      wereadData[shelf.bookId] = cache[shelf.bookId];
      cacheHits.push(airtable.title);
    } else {
      toFetch.push({ airtable, shelf });
    }
  }

  if (cacheHits.length > 0) {
    console.log('  缓存命中: ' + cacheHits.length + ' 本');
  }

  if (toFetch.length > 0) {
    console.log('  需要获取: ' + toFetch.length + ' 本');
  }

  // 4. 逐本获取数据
  for (let i = 0; i < toFetch.length; i++) {
    const { airtable, shelf } = toFetch[i];
    const bookId = shelf.bookId;
    console.log('  [' + (i + 1) + '/' + toFetch.length + '] ' + airtable.title);

    try {
      const [info, highlights, thoughts, popular] = await Promise.all([
        fetchBookInfo(bookId),
        fetchHighlights(bookId),
        fetchThoughts(bookId),
        fetchPopularHighlights(bookId)
      ]);

      // 构建章节映射
      const chapterMap = {};
      const chapters = highlights.chapters || [];
      chapters.forEach(ch => {
        chapterMap[ch.chapterUid] = ch.title;
      });

      // 处理划线
      const hlList = (highlights.updated || []).map(h => ({
        text: h.markText || '',
        chapter: chapterMap[h.chapterUid] || '',
        color: h.colorStyle || 0
      }));

      // 处理想法
      const thList = (thoughts.reviews || []).map(r => {
        const rev = r.review || {};
        return {
          text: rev.content || '',
          quote: rev.abstract || '',
          chapter: rev.chapterName || ''
        };
      }).filter(t => t.text); // 过滤空内容

      // 处理热门划线
      const popChapters = {};
      (popular.chapters || []).forEach(ch => {
        popChapters[ch.chapterUid] = ch.title;
      });
      const popList = (popular.items || []).map(item => ({
        text: item.markText || '',
        count: item.totalCount || 0,
        chapter: popChapters[item.chapterUid] || ''
      }));

      wereadData[bookId] = {
        rating: info.newRating || 0,
        ratingCount: info.newRatingCount || 0,
        review: '', // 个人点评通过 thoughts 中的书评获取
        highlights: hlList,
        thoughts: thList,
        popularHighlights: popList
      };

      // 速率限制
      if (i < toFetch.length - 1) {
        await sleep(300);
      }
    } catch (e) {
      console.error('    获取失败: ' + e.message);
    }
  }

  // 5. 合并写回缓存
  const updatedCache = { ...cache, ...wereadData };
  if (toFetch.length > 0 && !noCache) {
    saveCache(updatedCache);
    console.log('  缓存已更新');
  }

  const totalWithData = Object.keys(wereadData).length;
  console.log('微信读书数据获取完成: ' + totalWithData + ' 本书有笔记数据');

  return wereadData;
}
```

- [ ] **Step 6: 更新 `generate()` 调用**

找到：
```js
    const html = generate(year, processed);
```
替换为：
```js
    const html = generate(year, processed, wereadData);
```

- [ ] **Step 7: 在 `.gitignore` 中添加缓存文件**

在末尾添加：

```
# WeRead data cache
weread-cache.json
```

- [ ] **Step 8: 验证语法**

Run: `node -c reading-tracker-github.js`
Expected: 无输出

- [ ] **Step 9: Commit**

```bash
git add reading-tracker-github.js .gitignore
git commit -m "feat: integrate WeRead data fetching into build script"
```

---

### Task 5: 模板 - 面板 HTML 与 CSS (`template.js`)

**Files:**
- Modify: `template.js`

在模板中添加弹出面板的 HTML 结构和 CSS 样式。

- [ ] **Step 1: 添加 `{{WEREAD_JSON}}` 数据注入**

在 `const books = {{BOOKS_JSON}};` 之后添加：

```js
    const wereadData = {{WEREAD_JSON}};
```

- [ ] **Step 2: 在 `</style>` 之前添加面板 CSS**

在 `@media (max-width: 480px)` 块之后、`</style>` 之前添加：

```css
    /* ===== Book Notes Panel ===== */
    .panel-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .panel-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    @media (prefers-color-scheme: dark) {
      .panel-overlay { background: rgba(0, 0, 0, 0.5); }
    }

    .book-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(480px, 90vw);
      height: 100vh;
      background: var(--bg);
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
    }
    .book-panel.active {
      transform: translateX(0);
    }

    .panel-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      font-size: 20px;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 8px;
      z-index: 1;
      transition: color 0.15s;
    }
    .panel-close:hover { color: var(--text); }

    .panel-header {
      display: flex;
      gap: 16px;
      padding: 24px 24px 16px;
      border-bottom: 1px solid var(--border);
    }
    .panel-cover {
      width: 80px;
      height: 110px;
      border-radius: 4px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .panel-book-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }
    .panel-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      margin-bottom: 4px;
    }
    .panel-author {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .panel-rating {
      font-size: 13px;
      color: var(--text-muted);
    }
    .panel-rating-score {
      font-weight: 600;
      color: var(--text);
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 24px 24px;
    }

    .panel-section {
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }
    .panel-section:last-child { border-bottom: none; }

    .panel-section-title {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .panel-review-text {
      font-size: 14px;
      line-height: 1.7;
      color: var(--text);
    }
    .panel-review-text.collapsed {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .panel-review-toggle {
      background: none;
      border: none;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      cursor: pointer;
      margin-top: 6px;
      padding: 0;
    }

    .panel-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
    }
    .panel-tab {
      flex: 1;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 10px 4px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-align: center;
    }
    .panel-tab:hover { color: var(--text-secondary); }
    .panel-tab.active {
      color: var(--text);
      border-bottom-color: var(--text);
    }

    .panel-tab-content {
      display: none;
      padding: 12px 0;
    }
    .panel-tab-content.active { display: block; }

    .panel-note-item {
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .panel-note-item:last-child { border-bottom: none; }
    .panel-note-text {
      font-size: 14px;
      line-height: 1.7;
      color: var(--text);
    }
    .panel-note-chapter {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .panel-note-count {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .panel-quote {
      border-left: 3px solid var(--border);
      background: var(--bg-alt);
      padding: 8px 12px;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
      border-radius: 0 4px 4px 0;
    }

    .panel-thought-content {
      font-size: 14px;
      line-height: 1.7;
      color: var(--text);
      margin-top: 6px;
    }

    .panel-empty {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Mobile: bottom sheet */
    @media (max-width: 599px) {
      .book-panel {
        top: auto;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 90vh;
        border-radius: 16px 16px 0 0;
        transform: translateY(100%);
      }
      .book-panel.active { transform: translateY(0); }
      .panel-header { padding: 20px 20px 14px; }
      .panel-body { padding: 0 20px 20px; }
      .panel-cover { width: 60px; height: 82px; }
      .panel-drag-bar {
        width: 40px;
        height: 4px;
        background: var(--border-strong);
        border-radius: 2px;
        margin: 8px auto 0;
      }
    }
```

- [ ] **Step 3: 在 `<!-- ===== Book List ===== -->` 之前添加面板 HTML**

在 `<!-- ===== Book List ===== -->` 之前添加：

```html
    <!-- ===== Book Notes Panel ===== -->
    <div class="panel-overlay" id="panelOverlay"></div>
    <div class="book-panel" id="bookPanel">
      <div class="panel-drag-bar" id="panelDragBar"></div>
      <button class="panel-close" id="panelClose" aria-label="关闭">✕</button>
      <div class="panel-header" id="panelHeader"></div>
      <div class="panel-body" id="panelBody"></div>
    </div>
```

- [ ] **Step 4: 验证模板语法**

Run: `node -c template.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
git add template.js
git commit -m "feat: add book notes panel HTML and CSS to template"
```

---

### Task 6: 模板 - 面板 JavaScript 逻辑 (`template.js`)

**Files:**
- Modify: `template.js`

在 `<script>` 块中添加面板的打开/关闭/渲染逻辑，以及封面点击事件修改。

- [ ] **Step 1: 添加面板核心函数**

在 `// ===== 初始渲染 =====` 之前（即 `applySearchAndFilter();` 调用之前）添加：

```js
    // ===== Book Notes Panel =====
    const panelOverlay = document.getElementById('panelOverlay');
    const bookPanel = document.getElementById('bookPanel');
    const panelClose = document.getElementById('panelClose');
    const panelHeader = document.getElementById('panelHeader');
    const panelBody = document.getElementById('panelBody');
    const panelDragBar = document.getElementById('panelDragBar');

    function openBookPanel(bookIndex) {
      const b = allBooks[bookIndex];
      if (!b) return;
      const weread = b.wereadId ? wereadData[b.wereadId] : null;
      renderPanelContent(b, weread);
      panelOverlay.classList.add('active');
      bookPanel.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeBookPanel() {
      panelOverlay.classList.remove('active');
      bookPanel.classList.remove('active');
      document.body.style.overflow = '';
    }

    panelOverlay.addEventListener('click', closeBookPanel);
    panelClose.addEventListener('click', closeBookPanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bookPanel.classList.contains('active')) {
        closeBookPanel();
      }
    });

    // Mobile drag-to-close
    let dragStartY = 0;
    let dragging = false;
    panelDragBar.addEventListener('touchstart', (e) => {
      dragStartY = e.touches[0].clientY;
      dragging = true;
    });
    document.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const dy = e.touches[0].clientY - dragStartY;
      if (dy > 0) {
        bookPanel.style.transform = 'translateY(' + dy + 'px)';
      }
    });
    document.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const dy = e.changedTouches[0].clientY - dragStartY;
      bookPanel.style.transform = '';
      if (dy > 100) {
        closeBookPanel();
      }
    });

    function renderPanelContent(book, weread) {
      // Header: cover + info
      panelHeader.innerHTML =
        '<img class="panel-cover" src="' + book.cover + '" alt="' + book.title + '" onerror="this.style.display=\'none\'">' +
        '<div class="panel-book-info">' +
          '<div class="panel-title">' + book.title + '</div>' +
          '<div class="panel-author">' + book.author + '</div>' +
          (weread
            ? '<div class="panel-rating">微信读书 <span class="panel-rating-score">' +
              (weread.rating / 10).toFixed(1) + '</span>/10 · ' +
              formatRatingCount(weread.ratingCount) + '人评价</div>'
            : '')
        + '</div>';

      if (!weread) {
        panelBody.innerHTML = '<div class="panel-empty">暂无微信读书笔记</div>';
        return;
      }

      let html = '';

      // Review section
      if (weread.review) {
        html += '<div class="panel-section">';
        html += '<div class="panel-section-title">📝 我的点评</div>';
        const needsCollapse = weread.review.length > 200;
        html += '<div class="panel-review-text' + (needsCollapse ? ' collapsed' : '') + '" id="panelReviewText">' +
          weread.review.replace(/\n/g, '<br>') + '</div>';
        if (needsCollapse) {
          html += '<button class="panel-review-toggle" onclick="togglePanelReview(this)">展开全文</button>';
        }
        html += '</div>';
      }

      // Tabs
      const hlCount = weread.highlights ? weread.highlights.length : 0;
      const thCount = weread.thoughts ? weread.thoughts.length : 0;
      const popCount = weread.popularHighlights ? weread.popularHighlights.length : 0;

      html += '<div class="panel-tabs">';
      html += '<button class="panel-tab active" data-tab="highlights">划线 (' + hlCount + ')</button>';
      html += '<button class="panel-tab" data-tab="thoughts">想法 (' + thCount + ')</button>';
      html += '<button class="panel-tab" data-tab="popular">热门划线 (' + popCount + ')</button>';
      html += '</div>';

      // Highlights tab
      html += '<div class="panel-tab-content active" data-tab-content="highlights">';
      if (hlCount > 0) {
        weread.highlights.forEach(function(h) {
          html += '<div class="panel-note-item">';
          html += '<div class="panel-note-text">' + escapeHtml(h.text) + '</div>';
          if (h.chapter) html += '<div class="panel-note-chapter">「' + escapeHtml(h.chapter) + '」</div>';
          html += '</div>';
        });
      } else {
        html += '<div class="panel-empty">暂无划线</div>';
      }
      html += '</div>';

      // Thoughts tab
      html += '<div class="panel-tab-content" data-tab-content="thoughts">';
      if (thCount > 0) {
        weread.thoughts.forEach(function(t) {
          html += '<div class="panel-note-item">';
          if (t.quote) {
            html += '<div class="panel-quote">' + escapeHtml(t.quote) + '</div>';
          }
          html += '<div class="panel-thought-content">' + escapeHtml(t.text) + '</div>';
          if (t.chapter) html += '<div class="panel-note-chapter">「' + escapeHtml(t.chapter) + '」</div>';
          html += '</div>';
        });
      } else {
        html += '<div class="panel-empty">暂无想法</div>';
      }
      html += '</div>';

      // Popular highlights tab
      html += '<div class="panel-tab-content" data-tab-content="popular">';
      if (popCount > 0) {
        weread.popularHighlights.forEach(function(p) {
          html += '<div class="panel-note-item">';
          html += '<div class="panel-note-text">' + escapeHtml(p.text) + '</div>';
          html += '<div class="panel-note-count">' + p.count + '人划线</div>';
          if (p.chapter) html += '<div class="panel-note-chapter">「' + escapeHtml(p.chapter) + '」</div>';
          html += '</div>';
        });
      } else {
        html += '<div class="panel-empty">暂无热门划线</div>';
      }
      html += '</div>';

      panelBody.innerHTML = html;

      // Tab click handlers
      panelBody.querySelectorAll('.panel-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          panelBody.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
          panelBody.querySelectorAll('.panel-tab-content').forEach(function(c) { c.classList.remove('active'); });
          tab.classList.add('active');
          panelBody.querySelector('[data-tab-content="' + tab.dataset.tab + '"]').classList.add('active');
        });
      });
    }

    function togglePanelReview(btn) {
      var textEl = document.getElementById('panelReviewText');
      if (textEl.classList.contains('collapsed')) {
        textEl.classList.remove('collapsed');
        btn.textContent = '收起';
      } else {
        textEl.classList.add('collapsed');
        btn.textContent = '展开全文';
      }
    }

    function formatRatingCount(count) {
      if (count >= 10000) return (count / 10000).toFixed(1) + '万';
      if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
      return String(count);
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
```

- [ ] **Step 2: 修改封面 onclick 事件**

在 `renderWall` 函数中，找到：
```js
        item.innerHTML = `
          <div class="cover-link" onclick="window.open('${b.doubanLink}', '_blank')" title="${b.title}">
```
替换为：
```js
        item.innerHTML = `
          <div class="cover-link" onclick="openBookPanel(${allBooks.indexOf(b)})" title="${b.title}">
```

注意：这里用 `allBooks.indexOf(b)` 而不是 `sorted` 的索引，因为 `openBookPanel` 读取的是 `allBooks` 数组。

- [ ] **Step 3: 验证模板语法**

Run: `node -c template.js`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
git add template.js
git commit -m "feat: add book notes panel JavaScript logic and cover click handler"
```

---

### Task 7: CI/CD 配置 (`.github/workflows/deploy.yml`)

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 添加 `WEREAD_API_KEY` 环境变量**

在 `Generate Reading Tracker` 步骤的 `env` 中添加：

```yaml
      - name: Generate Reading Tracker
        env:
          AIRTABLE_API_KEY: ${{ secrets.AIRTABLE_API_KEY }}
          WEREAD_API_KEY: ${{ secrets.WEREAD_API_KEY }}
        run: node reading-tracker-github.js
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add WEREAD_API_KEY to deploy workflow"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 本地运行构建（无微信读书 key 时应优雅降级）**

Run: `node reading-tracker-github.js 2026`
Expected: 输出包含 "未设置 WEREAD_API_KEY，跳过微信读书数据获取"，HTML 正常生成

- [ ] **Step 2: 验证生成的 HTML 中包含面板结构**

Run: `powershell -Command "Select-String -Path '2026_reading_tracker.html' -Pattern 'book-panel|panelOverlay|wereadData' | Select-Object -First 5"`
Expected: 匹配到面板 HTML 和 `wereadData` 变量声明

- [ ] **Step 3: 验证 `openBookPanel` 函数存在于生成的 HTML**

Run: `powershell -Command "Select-String -Path '2026_reading_tracker.html' -Pattern 'function openBookPanel'"`
Expected: 匹配到函数定义

- [ ] **Step 4: 设置 WEREAD_API_KEY 后完整运行**

Run: `node reading-tracker-github.js 2026 --no-cache`
Expected: 成功获取微信读书数据，输出匹配和获取统计

- [ ] **Step 5: 验证增量缓存**

Run: `node reading-tracker-github.js 2026`
Expected: 输出 "缓存命中: N 本"，不调用 API

- [ ] **Step 6: 在浏览器中打开生成的 HTML 验证面板功能**

手动操作：打开 `2026_reading_tracker.html`，点击任意封面，验证面板弹出、内容正确显示。
