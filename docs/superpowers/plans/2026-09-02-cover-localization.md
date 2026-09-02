# 封面本地化镜像 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让阅读记录站点全部封面改由本项目 `covers/` 目录提供，存量 315 张一次迁移入库，新封面在 Zapier 触发的 CI 中自动补齐并只回写封面文件到 main。

**Architecture:** 新增 `cover-mirror.js` 作为封面镜像唯一逻辑入口：由 URL 哈希确定本地文件名、识别本仓库 raw 链接、缺失时才下载。两个生成器生成前调用镜像；`index.html` 解析年度页时归一 `../covers/...` 路径；`sync-covers.js` 原地迁移历史年度页；deploy.yml 增加只提交 `covers/` 的自动回写步骤。

**Tech Stack:** Node.js（仅内置模块：fs/path/https/crypto），无新依赖；GitHub Actions；原生 HTML/JS 页面。

**Spec:** [2026-09-02-cover-localization-design.md](../specs/2026-09-02-cover-localization-design.md)

## Global Constraints

- 页面/JSON 内一律使用正斜杠相对路径：`../covers/<file>`；文件系统写入使用 `path.join`。
- 封面文件名为 `covers/<sha1(url)>.<ext>`；扩展名优先 URL 自带（当前 315 张均自带），URL 无扩展名时用响应 Content-Type，最后兜底 `jpg`。
- 下载仅接受 `Content-Type` 以 `image/` 开头的内容，单文件上限 10MB，重定向最多 5 次，30 秒超时。
- 镜像成功改写 `book.cover`；失败保留原链接并 `console.warn`，绝不中断构建。
- 只改本计划列出的文件；不编辑 `template.js`、微信读书模块、报告页、`.env`。
- 迁移/同步脚本只替换封面字符串，不改年度页其它任何字节。
- CI 自动回写只 `git add covers/`；不提交年度 HTML、模板或缓存。
- 全程不 `git push`；推送前单独征求用户授权。
- 每个新/改 JS 通过 `node --check`；测试用 `node --test test/<file>.test.js` 运行。

---

### Task 1: cover-mirror.js 纯函数核心与测试

**Files:**
- Create: `cover-mirror.js`
- Test: `test/cover-mirror.test.js`

**Interfaces:**
- Produces: `sha1Hex(url) -> string`、`extFromUrl(url) -> string|null`、`extFromContentType(contentType) -> string|null`、`resolveOwnRaw(url, repoSlug) -> string|null`、`coverFileName(url) -> string`

- [ ] **Step 1: Write the failing test**

```js
// test/cover-mirror.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sha1Hex, extFromUrl, extFromContentType, resolveOwnRaw, coverFileName
} = require('../cover-mirror');

test('sha1Hex 稳定且区分不同 URL', () => {
  const a = sha1Hex('https://neodb.social/m/book/1.jpg');
  const b = sha1Hex('https://neodb.social/m/book/2.jpg');
  assert.equal(a.length, 40);
  assert.equal(a, sha1Hex('https://neodb.social/m/book/1.jpg'));
  assert.notEqual(a, b);
});

test('extFromUrl 识别常见图片扩展名', () => {
  assert.equal(extFromUrl('https://x/a.jpg'), 'jpg');
  assert.equal(extFromUrl('https://x/a.JPEG'), 'jpg');
  assert.equal(extFromUrl('https://x/a.png'), 'png');
  assert.equal(extFromUrl('https://x/a.webp'), 'webp');
  assert.equal(extFromUrl('https://x/a'), null);
});

test('extFromContentType 映射 MIME 到扩展名', () => {
  assert.equal(extFromContentType('image/png'), 'png');
  assert.equal(extFromContentType('image/webp; charset=binary'), 'webp');
  assert.equal(extFromContentType('text/html'), null);
  assert.equal(extFromContentType(''), null);
});

test('resolveOwnRaw 识别本仓库 covers raw 链接', () => {
  const repo = 'nickilism/reading-tracker';
  const raw = 'https://raw.githubusercontent.com/Nickilism/reading-tracker/main/covers/%E4%B9%A6.jpg';
  assert.equal(resolveOwnRaw(raw, repo), 'covers/书.jpg');
  assert.equal(resolveOwnRaw('https://raw.githubusercontent.com/other/repo/main/covers/x.jpg', repo), null);
  assert.equal(resolveOwnRaw('https://neodb.social/m/book/1.jpg', repo), null);
  assert.equal(resolveOwnRaw('https://raw.githubusercontent.com/Nickilism/reading-tracker/main/icons/favicon.ico', repo), null);
});

test('coverFileName 由 URL 哈希与扩展名组成', () => {
  const url = 'https://neodb.social/m/book/abc.jpg';
  const name = coverFileName(url);
  assert.equal(name, 'covers/' + sha1Hex(url) + '.jpg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cover-mirror.test.js`
Expected: FAIL with `Cannot find module '../cover-mirror'`

- [ ] **Step 3: Create cover-mirror.js 纯函数部分**

```js
// cover-mirror.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const DEFAULT_COVERS_DIR = 'covers';
const PAGE_PREFIX = '../';
const MAX_COVER_BYTES = 10 * 1024 * 1024;

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function extFromContentType(contentType) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (!contentType) return null;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return map[type] || null;
}

function extFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif)$/i);
    if (!m) return null;
    return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  } catch (_) {
    return null;
  }
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.toLowerCase();
  try {
    const child = require('child_process');
    const out = child.execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const m = out.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (m) return (m[1] + '/' + m[2]).toLowerCase();
  } catch (_) {}
  return '';
}

function resolveOwnRaw(url, repo) {
  if (!/^https?:\/\//i.test(url)) return null;
  let parsed;
  try { parsed = new URL(url); } catch (_) { return null; }
  if (parsed.hostname.toLowerCase() !== 'raw.githubusercontent.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 4) return null;
  const remoteSlug = (parts[0] + '/' + parts[1]).toLowerCase();
  if (repo && remoteSlug !== repo.toLowerCase()) return null;
  const projectPath = parts.slice(3).map(decodeURIComponent).join('/');
  if (!projectPath.startsWith('covers/')) return null;
  return projectPath;
}

function coverFileName(url) {
  return DEFAULT_COVERS_DIR + '/' + sha1Hex(url) + '.' + (extFromUrl(url) || 'jpg');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

module.exports = {
  sha1Hex, extFromContentType, extFromUrl, repoSlug, resolveOwnRaw,
  coverFileName, toPosix, DEFAULT_COVERS_DIR, PAGE_PREFIX, MAX_COVER_BYTES
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cover-mirror.test.js`
Expected: PASS（6 个用例）

- [ ] **Step 5: Syntax check and commit**

Run: `node --check cover-mirror.js`

```bash
git add cover-mirror.js test/cover-mirror.test.js
git commit -m "feat: add cover mirror core pure functions"
```

### Task 2: cover-mirror.js 下载与镜像（含失败保留）

**Files:**
- Modify: `cover-mirror.js`（在 `toPosix` 之后追加 I/O 函数，并更新 `module.exports`）
- Test: `test/cover-mirror.test.js`（追加用例）

**Interfaces:**
- Consumes: Task 1 的 `sha1Hex`/`extFromContentType`/`extFromUrl`/`toPosix`/常量
- Produces: `findCoverFile(hash, coversDir) -> string|null`、`downloadImage(url) -> {buffer, contentType}`、`ensureCover(url, opts) -> string|null`、`mirrorCovers(books, opts) -> void`（成功把 `book.cover` 改写为 `../covers/<file>`）

- [ ] **Step 1: Write the failing test（追加到 test/cover-mirror.test.js 末尾）**

```js
const fs = require('node:fs');
const os = require('node:os');

test('ensureCover 已存在文件时不下载', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const hash = sha1Hex('https://example.com/a.jpg');
  fs.writeFileSync(path.join(dir, hash + '.jpg'), 'x');
  let downloads = 0;
  const rel = await ensureCover('https://example.com/a.jpg', {
    coversDir: dir,
    download: async () => { downloads++; throw new Error('should not download'); }
  });
  assert.equal(downloads, 0);
  assert.ok(rel.endsWith(hash + '.jpg'));
});

test('ensureCover 下载写入并按 content-type 定扩展名', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/noext';
  const hash = sha1Hex(url);
  const rel = await ensureCover(url, {
    coversDir: dir,
    download: async () => ({ buffer: Buffer.from([1, 2, 3]), contentType: 'image/png' })
  });
  assert.ok(rel.endsWith(hash + '.png'));
  assert.equal(fs.readFileSync(path.join(dir, hash + '.png')).length, 3);
});

test('ensureCover 拒绝非图片响应', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  await assert.rejects(
    ensureCover('https://example.com/a', {
      coversDir: dir,
      download: async () => ({ buffer: Buffer.from('x'), contentType: 'text/html' })
    }),
    /非图片响应/
  );
});

test('mirrorCovers 成功改写为本地相对路径', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/b.jpg';
  const hash = sha1Hex(url);
  fs.writeFileSync(path.join(dir, hash + '.jpg'), 'x');
  const books = [{ title: 'B', cover: url }];
  await mirrorCovers(books, { coversDir: dir, repoSlug: '' });
  assert.ok(books[0].cover.includes(hash + '.jpg'));
  assert.ok(books[0].cover.startsWith('../'));
});

test('mirrorCovers 下载失败保留原链接', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/c.jpg';
  const books = [{ title: 'C', cover: url }];
  await mirrorCovers(books, {
    coversDir: dir,
    repoSlug: '',
    download: async () => { throw new Error('boom'); }
  });
  assert.equal(books[0].cover, url);
});
```

注意：测试顶部需要追加 `const path = require('node:path');`，并把 `ensureCover`/`mirrorCovers` 加入 require 列表。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cover-mirror.test.js`
Expected: FAIL with `ensureCover is not a function` 等错误

- [ ] **Step 3: 在 cover-mirror.js 的 `toPosix` 之后、`module.exports` 之前追加**

```js
function findCoverFile(hash, coversDir) {
  if (!fs.existsSync(coversDir)) return null;
  const match = fs.readdirSync(coversDir).find((name) => name.startsWith(hash + '.'));
  return match ? toPosix(path.join(coversDir, match)) : null;
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const get = (target) => {
      const req = https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++redirects > 5) {
            reject(new Error('重定向次数过多: ' + url));
            return;
          }
          get(new URL(res.headers.location, target).toString());
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode + ': ' + url));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > MAX_COVER_BYTES) {
            req.destroy();
            reject(new Error('封面超过 10MB: ' + url));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' });
        });
      });
      req.setTimeout(30000, () => req.destroy(new Error('Timeout: ' + url)));
      req.on('error', reject);
    };
    get(url);
  });
}

async function ensureCover(url, opts = {}) {
  if (!/^https?:\/\//i.test(url)) return null;
  const coversDir = opts.coversDir || DEFAULT_COVERS_DIR;
  const download = opts.download || downloadImage;
  const hash = sha1Hex(url);
  const existing = findCoverFile(hash, coversDir);
  if (existing) return existing;
  const { buffer, contentType } = await download(url);
  if (!contentType || !/^image\//i.test(contentType)) {
    throw new Error('非图片响应: ' + url);
  }
  if (buffer.length > MAX_COVER_BYTES) {
    throw new Error('封面超过 10MB: ' + url);
  }
  const ext = extFromContentType(contentType) || extFromUrl(url) || 'jpg';
  const outPath = path.join(coversDir, hash + '.' + ext);
  fs.mkdirSync(coversDir, { recursive: true });
  fs.writeFileSync(outPath, buffer);
  return toPosix(outPath);
}

async function mirrorCovers(books, opts = {}) {
  const coversDir = opts.coversDir || DEFAULT_COVERS_DIR;
  const repo = opts.repoSlug === undefined ? repoSlug() : opts.repoSlug;
  for (const book of books) {
    const url = book.cover;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const ownPath = resolveOwnRaw(url, repo);
    if (ownPath && fs.existsSync(ownPath)) {
      book.cover = PAGE_PREFIX + ownPath;
      continue;
    }
    try {
      const localPath = await ensureCover(url, {
        coversDir,
        download: opts.download
      });
      if (localPath) book.cover = PAGE_PREFIX + localPath;
    } catch (err) {
      console.warn('  封面镜像失败，保留原链接: ' + (book.title || '(未命名)') + ' - ' + err.message);
    }
  }
}
```

更新 `module.exports`：

```js
module.exports = {
  sha1Hex, extFromContentType, extFromUrl, repoSlug, resolveOwnRaw,
  coverFileName, toPosix, findCoverFile, downloadImage, ensureCover, mirrorCovers,
  DEFAULT_COVERS_DIR, PAGE_PREFIX, MAX_COVER_BYTES
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cover-mirror.test.js`
Expected: PASS（11 个用例）

- [ ] **Step 5: Syntax check and commit**

Run: `node --check cover-mirror.js`

```bash
git add cover-mirror.js test/cover-mirror.test.js
git commit -m "feat: add cover download and mirror logic"
```

### Task 3: 两个生成器接入镜像步骤

**Files:**
- Modify: `reading-tracker-github.js`（main() 内 `fetchReports` 之后）
- Modify: `reading-tracker-year-github.js`（`generateForYear` 内 `fetchReports` 之后）

**Interfaces:**
- Consumes: `mirrorCovers(books)`（Task 2）
- Produces: 生成页面 `BOOKS_JSON` 的 `cover` 值为 `../covers/<file>`（下载成功时）

- [ ] **Step 1: 修改 reading-tracker-github.js**

在 `main()` 中找到：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    const wereadData = await fetchWeReadData(processed, noCache);
```

改为：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    await mirrorCovers(processed);
    const wereadData = await fetchWeReadData(processed, noCache);
```

文件顶部新增依赖（放在其它 require 附近）：

```js
const { mirrorCovers } = require('./cover-mirror');
```

main() 内不再需要局部 require，统一使用顶部依赖。

- [ ] **Step 2: 修改 reading-tracker-year-github.js**

在 `generateForYear()` 中找到：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    const html = generate(year, processed);
```

改为：

```js
    const processed = addDerived(processBooks(records));
    await fetchReports(processed, year);
    await mirrorCovers(processed);
    const html = generate(year, processed);
```

文件顶部新增依赖：

```js
const { mirrorCovers } = require('./cover-mirror');
```

generateForYear() 内不再需要局部 require，统一使用顶部依赖。

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check reading-tracker-github.js
node --check reading-tracker-year-github.js
node --test test/template-smoke.test.js
```

Expected: 全部通过（生成器只做语法检查，不连 Airtable）

- [ ] **Step 4: Commit**

```bash
git add reading-tracker-github.js reading-tracker-year-github.js
git commit -m "feat: mirror covers during page generation"
```

### Task 4: index.html 归档首页归一本地封面路径

**Files:**
- Modify: `index.html`（`loadYear` 内 `JSON.parse(json)` 之后）

**Interfaces:**
- Consumes: 年度页 JSON 中形如 `../covers/x.jpg` 的 `cover`
- Produces: 归档卡片与搜索逻辑拿到的 `cover` 为可点击的绝对 URL（`https://.../reading-tracker/covers/x.jpg` 或 `http://127.0.0.1:8765/covers/x.jpg`）

- [ ] **Step 1: 修改 loadYear**

找到 `index.html` 中：

```js
      const books = JSON.parse(json);
      const count = books.length;
```

改为：

```js
      const books = JSON.parse(json);
      const yearUrl = new URL(path, location.href);
      for (const b of books) {
        if (b.cover && !/^https?:\/\//i.test(b.cover) && !b.cover.startsWith('data:')) {
          b.cover = new URL(b.cover, yearUrl).href;
        }
      }
      const count = books.length;
```

- [ ] **Step 2: 校验内嵌脚本语法**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const s of scripts)new Function(s);console.log('index inline scripts OK:',scripts.length);"
```

Expected: `index inline scripts OK: N`（不抛错）

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: resolve local cover paths on archive page"
```

### Task 5: builder_offline.js 支持本地封面

**Files:**
- Modify: `builder_offline.js`
- Test: `test/builder-offline-cover.test.js`

**Interfaces:**
- Consumes: 年度页 JSON 中 `../covers/...` 的封面值
- Produces: `encodeLocalCover(coverValue, rootDir?) -> dataURI`；`require.main === module` 时才自动运行 main

- [ ] **Step 1: Write the failing test**

```js
// test/builder-offline-cover.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeLocalCover } = require('../builder_offline');

test('encodeLocalCover 读取本地封面转 data URI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-cover-'));
  fs.mkdirSync(path.join(dir, 'covers'));
  fs.writeFileSync(path.join(dir, 'covers', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  const uri = encodeLocalCover('../covers/a.jpg', dir);
  assert.match(uri, /^data:image\/jpeg;base64,/);
  assert.ok(uri.length > 'data:image/jpeg;base64,'.length);
});

test('encodeLocalCover 拒绝 covers/ 之外路径', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-cover-'));
  fs.writeFileSync(path.join(dir, 'x.png'), 'x');
  assert.throws(() => encodeLocalCover('../x.png', dir), /未知本地封面路径/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/builder-offline-cover.test.js`
Expected: FAIL（`Cannot find module` 或函数不存在）

- [ ] **Step 3: 修改 builder_offline.js**

在 `downloadAndEncode` 函数之后新增：

```js
function encodeLocalCover(coverValue, rootDir = process.cwd()) {
  const rel = coverValue.replace(/^\.\.\//, '');
  if (!rel.startsWith('covers/')) {
    throw new Error('未知本地封面路径: ' + coverValue);
  }
  const filePath = path.join(rootDir, ...rel.split('/'));
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return 'data:' + mimeType + ';base64,' + fs.readFileSync(filePath).toString('base64');
}
```

把主流程第 3 步的下载循环改为：

```js
  for (const url of coverUrls) {
    try {
      coverMap[url] = url.startsWith('../')
        ? encodeLocalCover(url)
        : await downloadAndEncode(url);
      done++;
      process.stdout.write('   进度: ' + done + '/' + coverUrls.length + '\r');
    } catch (e) {
      console.error('\n   ✗ 封面处理失败: ' + url);
      coverMap[url] = null;
      done++;
    }
  }
```

把文件末尾的自动运行改为可导出（避免测试 require 时执行 main）：

```js
if (require.main === module) {
  main().catch(e => {
    console.error('\n✗ 错误:', e.message);
    process.exit(1);
  });
}

module.exports = { downloadAndEncode, encodeLocalCover };
```

- [ ] **Step 4: Run tests and syntax check**

Run:
```bash
node --check builder_offline.js
node --test test/builder-offline-cover.test.js
node --test test/cover-mirror.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add builder_offline.js test/builder-offline-cover.test.js
git commit -m "fix: support local cover files in offline builder"
```

### Task 6: sync-covers.js 历史年度页迁移工具

**Files:**
- Create: `sync-covers.js`
- Test: `test/sync-covers.test.js`

**Interfaces:**
- Consumes: `mirrorCovers`（Task 2）
- Produces: `migrateYearFile(filePath, opts) -> {filePath, changed, total, synced}`；CLI 用法 `node sync-covers.js [年份...]`

- [ ] **Step 1: Write the failing test**

```js
// test/sync-covers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha1Hex } = require('../cover-mirror');
const { migrateYearFile } = require('../sync-covers');

test('migrateYearFile 只替换封面字符串并写回', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-covers-'));
  const coversDir = path.join(dir, 'covers');
  fs.mkdirSync(coversDir);
  const url = 'https://neodb.social/m/book/abc.jpg';
  const hash = sha1Hex(url);
  fs.writeFileSync(path.join(coversDir, hash + '.jpg'), 'x');
  const file = path.join(dir, '2026_reading_tracker.html');
  const originalHtml =
    '<html><body><script>const books = [{"title":"A","cover":"' + url + '"}];</script></body></html>';
  fs.writeFileSync(file, originalHtml, 'utf8');
  const result = await migrateYearFile(file, { coversDir, repoSlug: '' });
  const html = fs.readFileSync(file, 'utf8');
  assert.equal(result.changed, true);
  assert.equal(result.synced, 1);
  assert.ok(!html.includes(url));
  assert.ok(html.includes(hash + '.jpg'));
  assert.ok(html.includes('</script>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sync-covers.test.js`
Expected: FAIL（`Cannot find module '../sync-covers'`）

- [ ] **Step 3: 创建 sync-covers.js**

```js
#!/usr/bin/env node
/**
 * sync-covers.js - 年度页封面迁移/同步工具
 *
 * 把 reading archive/<year>_reading_tracker.html 中仍是外链的封面
 * 原地替换为 ../covers/<file>，并下载缺失封面。
 *
 * 用法:
 *   node sync-covers.js          # 处理全部年份
 *   node sync-covers.js 2025     # 只处理 2025
 */

const fs = require('fs');
const path = require('path');
const { mirrorCovers } = require('./cover-mirror');

const ARCHIVE_DIR = 'reading archive';
const BOOKS_RE = /const books = (\[[\s\S]+?\]);/;

async function migrateYearFile(filePath, opts = {}) {
  const html = fs.readFileSync(filePath, 'utf8');
  const m = html.match(BOOKS_RE);
  if (!m) throw new Error('无法从 ' + filePath + ' 提取书籍数据');
  const books = eval('(' + m[1] + ')');
  const before = books.map((b) => b.cover);
  await mirrorCovers(books, opts);
  const pairs = [];
  books.forEach((b, i) => {
    if (b.cover !== before[i]) pairs.push([before[i], b.cover]);
  });
  if (pairs.length === 0) {
    return { filePath, changed: false, total: books.length, synced: 0 };
  }
  let output = html;
  let synced = 0;
  for (const [oldUrl, newValue] of pairs) {
    const quotedOld = JSON.stringify(oldUrl);
    const quotedNew = JSON.stringify(newValue);
    if (!output.includes(quotedOld)) {
      console.warn('  未找到可替换字符串: ' + oldUrl);
      continue;
    }
    output = output.split(quotedOld).join(quotedNew);
    synced++;
  }
  if (synced > 0) fs.writeFileSync(filePath, output, 'utf8');
  return { filePath, changed: synced > 0, total: books.length, synced };
}

async function main() {
  const yearArgs = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
  const files = yearArgs.length
    ? yearArgs.map((y) => path.join(ARCHIVE_DIR, y + '_reading_tracker.html'))
    : fs.readdirSync(ARCHIVE_DIR)
        .filter((f) => /^\d{4}_reading_tracker\.html$/.test(f))
        .map((f) => path.join(ARCHIVE_DIR, f));
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn('跳过不存在的文件: ' + file);
      continue;
    }
    const year = path.basename(file).slice(0, 4);
    console.log('\n处理 ' + year + ' 年: ' + file);
    try {
      const r = await migrateYearFile(file);
      console.log('  共 ' + r.total + ' 本，成功改写 ' + r.synced + ' 个封面' + (r.changed ? '' : '（无变化）'));
    } catch (e) {
      console.warn('  处理失败: ' + e.message);
    }
  }
  console.log('\n完成。若存在失败封面，请查看上方警告后人工跟进。');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrateYearFile };
```

- [ ] **Step 4: Run tests and syntax check**

Run:
```bash
node --check sync-covers.js
node --test test/sync-covers.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sync-covers.js test/sync-covers.test.js
git commit -m "feat: add cover sync tool for historical pages"
```

### Task 7: 项目文档登记新文件与手工封面流程

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: AGENTS.md 目录/文件约定表新增三行**

在 `| report-pages.js |` 行之后插入：

```md
| `cover-mirror.js` | 封面本地化镜像 | 由 URL 哈希计算本地文件名、识别本仓库 raw 链接、下载缺失封面；生成器与 sync-covers 共用 |
| `sync-covers.js` | 年度页封面同步/迁移 | 原地把 `reading archive/*.html` 中外链封面替换为 `covers/` 本地路径；不访问 Airtable |
| `covers/` | 封面镜像资源目录 | 资源兼构建产物；文件名 = URL 哈希；CI 只自动回写此目录 |
```

在「数据流与不变量」列表（阅读报告条目之后）追加：

```md
- 封面镜像：`Douban Cover Link`（外链或本仓库 raw 链接）→ `cover-mirror.js` → `covers/<sha1(url)>.<ext>` → BOOKS_JSON 中保存 `../covers/...`。存量封面一经入库不再依赖外站；镜像失败保留原链接并告警，不中断构建。
```

- [ ] **Step 2: CLAUDE.md 补充命令与文件说明**

在 Build & Run Commands 代码块追加：

```bash
node sync-covers.js [year]              # 把年度页外链封面迁移到 covers/（可选指定年份）
```

在 Key Files 列表追加两条：

```md
- **cover-mirror.js** — 封面镜像；计算 `covers/<sha1(url)>.<ext>`、识别本仓库 raw 链接、下载缺失封面；两个生成器与 sync-covers 共用
- **sync-covers.js** — 历史年度页封面迁移工具；原地替换外链封面为 `../covers/<file>`
```

- [ ] **Step 3: README.md 更新字段说明与手工封面流程**

把字段表 `Douban Cover Link` 行改为：

```md
| Douban Cover Link | URL | 封面图链接：neodb.social 链接，或本仓库 `covers/` 文件 raw 链接（生成时镜像到 `covers/`） |
```

在「方案：neodb.social + iOS Shortcuts + Airtable API」小节之后新增：

```md
### 没有 neodb 封面的书（手工上传封面）

1. 在 GitHub 网页打开仓库 → `covers/` 目录 → Add file → Upload files，上传 JPG/PNG/WebP 封面（建议小于 10MB）。
2. 点开刚上传的图片 → 右上角 Raw → 复制链接（形如 `https://raw.githubusercontent.com/Nickilism/reading-tracker/main/covers/xxx.jpg`）。
3. 把该链接填入 Airtable 的 `Douban Cover Link`。
4. Zapier 触发部署后，页面会直接复用仓库内该文件；用户访问时只加载 GitHub Pages 资源。

若图片尚未推送到 main，本次构建会保留该链接并告警，推送成功后下次运行自动纠正。
```

- [ ] **Step 4: 检查改动并提交**

```bash
git diff --stat
```

Expected: 仅 AGENTS.md/CLAUDE.md/README.md 变化

```bash
git add AGENTS.md CLAUDE.md README.md
git commit -m "docs: register cover mirror files and manual cover workflow"
```

### Task 8: deploy.yml 增加封面自动回写

**Files:**
- Modify: `.github/workflows/deploy.yml`（用户已明确授权此文件修改）

- [ ] **Step 1: checkout 步骤增加 fetch-depth**

把：

```yaml
      - name: Checkout code
        uses: actions/checkout@v6
```

改为：

```yaml
      - name: Checkout code
        uses: actions/checkout@v6
        with:
          fetch-depth: 0
```

- [ ] **Step 2: 在 Generate Reading Tracker 之后插入回写步骤**

在：

```yaml
        run: node reading-tracker-github.js

      - name: Deploy to GitHub Pages
```

之间插入：

```yaml
      - name: Sync cover files back to main
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add covers/ 2>/dev/null || true
          if git diff --cached --quiet; then
            echo "No new cover files to sync"
          else
            git commit -m "chore: sync cover files from CI"
            git push origin HEAD:main || echo "::warning::Cover sync push failed; will retry on next run"
          fi
```

- [ ] **Step 3: 校验 YAML 结构**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/deploy.yml','utf8');if(!s.includes('fetch-depth: 0'))throw new Error('missing fetch-depth');if(!s.includes('Sync cover files back to main'))throw new Error('missing sync step');console.log('workflow content OK');"`

Expected: `workflow content OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: sync new cover files back to main"
```

### Task 9: 存量封面真实迁移（315 张）

**Files:**
- Create: `covers/<sha1(url)>.<ext>`（约 315 张）
- Modify: `reading archive/2019_reading_tracker.html` 至 `2026_reading_tracker.html`（8 个文件，只改封面字符串）

> 本任务需要访问外网下载封面，且会写入约 10–20MB 图片。执行前必须先向用户说明并取得确认。

- [ ] **Step 1: 取得用户确认**

向用户确认：允许脚本访问 neodb.social/amazon 等站点下载 315 张封面，并生成 `covers/` 目录与改写 8 个年度页（仅封面字符串）。

- [ ] **Step 2: 确认工作区基线**

Run:
```bash
git status --short
```

Expected: 工作区干净（Task 1-8 全部提交后）

- [ ] **Step 3: 运行迁移**

Run:
```bash
node sync-covers.js
```

Expected: 8 个年份逐行输出「共 N 本，成功改写 M 个封面」；失败封面在警告中列出书名

- [ ] **Step 4: 检查结果**

Run:
```bash
(Get-ChildItem 'covers' -File).Count
rg -n "https://neodb\.social|https://p0\.itc\.cn|m\.media-amazon\.com" 'reading archive' --glob '*_reading_tracker.html'
```

Expected:
- covers 文件数 ≈ 成功镜像数（315 减去失败数）
- 第二条命令只剩失败清单（若为 0 则无输出）

- [ ] **Step 5: 抽查 git diff 只含封面字符串与新增图片**

Run:
```bash
git diff --stat
git diff -- 'reading archive/2026_reading_tracker.html' | Select-Object -First 40
```

Expected: 每页 diff 只出现 `"cover": "https://..."` → `"cover": "../covers/..."` 类的字符串替换

- [ ] **Step 6: Commit（只提交封面与年度页，不推送）**

```bash
git add covers/
git add 'reading archive/2019_reading_tracker.html' 'reading archive/2020_reading_tracker.html' 'reading archive/2021_reading_tracker.html' 'reading archive/2022_reading_tracker.html' 'reading archive/2023_reading_tracker.html' 'reading archive/2024_reading_tracker.html' 'reading archive/2025_reading_tracker.html' 'reading archive/2026_reading_tracker.html'
git commit -m "feat: mirror all historical book covers into repo"
```

### Task 10: 端到端验证与收尾

**Files:**
- 无代码改动；验证后可能生成 `reading archive/*_offline.html`（验证后删除，先征求用户同意）

- [ ] **Step 1: 全量静态检查与单元测试**

Run:
```bash
node --check cover-mirror.js
node --check sync-covers.js
node --check builder_offline.js
node --check reading-tracker-github.js
node --check reading-tracker-year-github.js
node --test test/cover-mirror.test.js
node --test test/sync-covers.test.js
node --test test/builder-offline-cover.test.js
node --test test/template-smoke.test.js
```

Expected: 全部 PASS

- [ ] **Step 2: 本地 HTTP 预览检查**

Run: `preview.cmd`（或 `node preview.js`），用浏览器检查：

- 归档首页 2019–2026 各卡片封面正常显示；
- 抽查 2021、2026 年度页封面墙与详情面板封面；
- 窄屏（375px）与深色模式下封面无回归；
- 直接请求 `http://127.0.0.1:8765/covers/<任取一个实际文件名>` 返回 200 且 Content-Type 为 image/*。

- [ ] **Step 3: 验证离线构建**

Run:
```bash
node builder_offline.js 2026
```

Expected: `reading archive/2026_reading_tracker_offline.html` 生成成功且封面内联

向用户说明后删除该 `_offline.html` 临时产物（若用户同意），否则保留并告知路径。

- [ ] **Step 4: 检查 git 状态与最终 diff**

Run:
```bash
git status --short
git log --oneline -12
```

Expected: 工作区干净（或仅剩用户同意保留的 `_offline.html`），提交历史包含 Task 1-9 的提交

- [ ] **Step 5: 汇报并等待推送授权**

不要执行 `git push`。向用户汇报：

- 迁移成功/失败清单；
- 仓库新增体积（`covers/` 总大小）；
- CI 自动回写说明（下一次 Zapier/定时触发生效）；
- 推送授权请求。

---

## Self-Review Checklist（编写后执行）

- [ ] 逐节对照 spec：存储命名、raw 链接复用、失败兜底、CI 只回写 covers、手工封面流程均有对应任务
- [ ] 无 TBD/TODO/「适当处理」类占位
- [ ] 函数名跨任务一致：`sha1Hex`/`extFromUrl`/`extFromContentType`/`resolveOwnRaw`/`coverFileName`/`findCoverFile`/`downloadImage`/`ensureCover`/`mirrorCovers`/`migrateYearFile`/`encodeLocalCover`
- [ ] 每步给出可运行命令与期望输出
