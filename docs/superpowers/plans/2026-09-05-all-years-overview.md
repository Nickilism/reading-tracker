# 全部年份总览页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `reading archive/all.html` 全部年份总览页（运行时汇总 2019 至当前年份的全部年度页），并把首页顶部统计条改为入口。

**Architecture:** `all.html` 是与年度页同目录的自包含静态页面；打开时按「2019 → 当前年」逐年 `fetch` 同级年度页、解析各自 `const books = […]` 合并为全量书单，再复用年度页那套组件（统计/国家/图表/筛选/书影/清单/划线面板）渲染；图表改为「每年柱 + 累计线」，筛选月份改年份，新增随范围联动的高分榜 Top 10。微信读书 `wereadData` 按需懒解析并缓存。首页入口只改 `index.html` 顶部统计条为可点击链接。

**Tech Stack:** 原生 HTML/CSS/JS（无构建）、Chart.js 4.4.1（`../vendor/chart.umd.js`）、Node（仅本地 `node --check` 与预览）、浏览器自动化验证（playwright，沿用仓库网页测试惯例）。

**Spec:** `docs/superpowers/specs/2026-09-05-all-years-overview-design.md`

## Global Constraints

- 新增文件固定为 `reading archive/all.html`（与年度页同目录），**不放仓库根目录**。
- 年份范围不得写死：`START_YEAR = 2019` 常量 + `CURRENT_YEAR = new Date().getFullYear()` 动态终点；逐年尝试，缺失年份自动跳过。
- 不修改：`template.js`、`reading-tracker-github.js`、`reading-tracker-year-github.js`、`builder_offline.js`、8 个既有年度页、`.github/workflows/deploy.yml`。
- 首页入口链接编码与现有年度卡一致：`reading%20archive/all.html`；`all.html` 内 favicon / Chart.js 用 `../` 前缀。
- 相对路径解析基准 = `reading archive/` 目录：`cover`（`../covers/...`）与 `report`（`reports/<年>/<id>.html`）沿用年度页解析方式；抓取年度页用 `./${year}_reading_tracker.html`。
- 解析 `const books = [` / `const wereadData = {` 必须用字符串感知的平衡扫描（跳过引号内括号）。
- `wereadData` 只在点开某本书时解析所在年度页一次并缓存，不得首屏全量解析。
- 颜色一律通过 CSS 变量定义/引用，禁止硬编码 hex/rgba（图表色从 CSS 变量读取，深浅色自适应）。
- 页面行为（搜索/筛选/统计/国家/图表/高分榜/书影/清单/面板）全部联动，单一数据源 `allBooks[]` + 当前状态。
- 高分榜只取有数字评分（`typeof rating === 'number'`）的书；并列按完成日期新→旧。
- 无结果、无划线、无 `wereadId`、无报告、某年 fetch/解析失败：自然降级，不白屏、不 console 报错刷屏。
- 验证命令：`node --check`（对 `all.html` 提取的 `<script>`）；`npm test`/`node --test test/` 必须仍通过（本改动不新增 Node 测试）。
- 不执行 `git push` / `git rebase` / `git reset --hard` / 修改 CI；仅允许本地 `git add` / `git commit`。

---

### Task 1: `reading archive/all.html` 静态外壳 + CSS 骨架

**Files:**
- Create: `reading archive/all.html`

**Interfaces:**
- Consumes: 无
- Produces: 页面骨架容器：`#subtitle`、`#yearBadge`、`#searchInput`、`#total-books`、`#total-pages`、`#avg-reading-time`、`#country-grid`、`#chartCanvas`、`#filters`、`#top10`、`#cover-wall`、`#wall-count`、`#booklist-content`、`#panelOverlay`、`#bookPanel`、`#footer-note`、`#load-error`。

- [ ] **Step 1: 建立 HTML 骨架**
  从 `template.js` 复制同一套 `<head>` 元信息、字体、CSS 变量与基础布局（`.page` 780px、`body` 内边距、深色模式 `prefers-color-scheme`）；favicon 用 `../icons/...`；引用 `../vendor/chart.umd.js`；按 spec 页面结构搭好全部区块（标题区、搜索、统计、国家、图表容器、高分榜、筛选、书影、清单、面板、页脚），内容初始为骨架/占位。
- [ ] **Step 2: 标题区初始内容**
  标题 `阅读记录 · 全部年份`；`#yearBadge` 初始 `ALL`；`#subtitle` 留待 Task 2 动态填充。
- [ ] **Step 3: 语法与基础验证**
  提取页面内 `<script>`（或先留空 `<script></script>`）到临时文件执行 `node --check`；`preview.cmd` 起服，浏览器打开 `http://127.0.0.1:<port>/reading%20archive/all.html`，确认无 404（`../vendor/chart.umd.js`、`../icons/...` 可加载）、深色模式切换正常、各区块骨架可见。
- [ ] **Step 4: 本地提交**
  `git add "reading archive/all.html"` → `git commit -m "feat: scaffold all-years overview page shell"`

### Task 2: 数据层（动态年份、逐年 fetch、解析合并、统计条）

**Files:**
- Modify: `reading archive/all.html`（内嵌 `<script>`）

**Interfaces:**
- Produces: `allBooks`（每本书补 `year`）、`yearHtmlCache: { [year]: string }`、`loadedYears: number[]`、`failedYears: number[]`；函数 `extractBalanced(html, markerStartChar)`（字符串感知平衡扫描）、`extractBooksJson(html)`、`extractWereadJson(html)`、`resolveYearData(year, html)`、`fmtNumber(n)`。

- [ ] **Step 1: 写动态年份与抓取逻辑**
  `START_YEAR = 2019`、`CURRENT_YEAR = new Date().getFullYear()`；`Promise.all` 逐年 `fetch('./' + y + '_reading_tracker.html')`；404/网络/解析失败计入 `failedYears` 并继续；成功后用 `extractBalanced` 解析 `const books = [` 数组，`JSON.parse`，逐本补 `year`，并用 `new URL(b.cover, yearBase)` 方式把 `cover`/`report` 解析为相对 `reading archive/` 的可用地址；原始 HTML 存入 `yearHtmlCache`。
- [ ] **Step 2: 渲染标题与统计条**
  `#subtitle` 显示 `2019 – <CURRENT_YEAR> · <loadedYears.length> 年`；统计条：已读书目（`allBooks.length`）、总页数（`pages` 数字求和）、阅读天数中位数（照搬年度页算法：有 start+finish 的书按完成日排序取中位；无有效日期则显示 `—`）。
- [ ] **Step 3: 失败提示**
  `failedYears` 非空时在 `#footer-note` 显示「<年份> 暂未加载」；全部失败时 `#load-error` 显示「需要 HTTP 预览（请用 preview.cmd），且确认年度页存在」。
- [ ] **Step 4: 验证**
  `node --check`（提取脚本）；浏览器打开总览页，核对统计数与首页一致（如 315 本 / 108,497 页，以实际为准）；临时把某年文件名改走再测「跳过并提示」。
- [ ] **Step 5: 本地提交**
  `git commit -am "feat: load and merge all yearly book data in overview page"`

### Task 3: 国家分布 + 高分榜 Top 10（静态全量版）

**Files:**
- Modify: `reading archive/all.html`

**Interfaces:**
- Consumes: `allBooks`
- Produces: `renderCountries(list)`、`rankTopBooks(list, n=10)`（取有数字评分、按 rating 降序、并列按 finish 降序）、`renderTop10(list)`；`COUNTRY_FLAGS` 小映射（从 `template.js` 复制）。

- [ ] **Step 1: 国家分布**
  按 spec 统计当前范围国家计数并渲染徽章（国旗 emoji + 名称 + ×计数），排序按计数降序。
- [ ] **Step 2: 高分榜**
  标题「高分榜 · Top 10」；封面卡横排（桌面 5 列×2 行，窄屏降列），左上角名次角标，1–3 名强调色（CSS 变量），hover 显示书名/作者/评分/年份；点击行为先留空（Task 7 接入面板）。
- [ ] **Step 3: 验证**
  浏览器确认：国家徽章计数正确；高分榜 10 本与「按评分排序后的前 10」一致；少于 10 本有评分时按实际显示；深色/窄屏正常。
- [ ] **Step 4: 本地提交**
  `git commit -am "feat: add country stats and top-10 highlights to overview"`

### Task 4: 每年阅读量柱 + 累计线图表

**Files:**
- Modify: `reading archive/all.html`

**Interfaces:**
- Consumes: `allBooks`、`loadedYears`
- Produces: `initChart()`（读取 CSS 变量取色）、`updateChart(list)`（按 list 中 `b.year` 统计每年本数 + 逐年累计，柱 + 折线/第二坐标轴；柱点击 → 切到该年筛选，Task 5 接入）。

- [ ] **Step 1: 初始化 Chart.js**
  `loadedYears` 升序为 X 轴；柱数据 = 每年本数；第二坐标轴折线 = 逐年累计；`y.max` 动态；色值 `getComputedStyle(document.documentElement).getPropertyValue(...)`。
- [ ] **Step 2: updateChart 联动**
  供后续 Task 5 每次状态变化调用；空范围时柱全 0、折线归零。
- [ ] **Step 3: 验证**
  浏览器确认：X 轴为 2019→当前年；柱高与每年书目一致；累计线单调不减；深色模式色值切换正确。
- [ ] **Step 4: 本地提交**
  `git commit -am "feat: add yearly bar + cumulative line chart to overview"`

### Task 5: 搜索 + 筛选 + 统一联动（核心状态机）

**Files:**
- Modify: `reading archive/all.html`

**Interfaces:**
- Consumes: `allBooks`、`renderCountries`、`updateChart`、`renderTop10`、`renderWall`、`renderBooklist`（后两者 Task 6 提供，本任务先定义并留最小实现/空实现）
- Produces: 状态对象 `state = { query, filter, year, country }`；`getFilteredBooks()`（先搜索后筛选，语义对齐年度页）；`applyState()`（依次刷新 统计/国家/图表/高分榜/筛选计数/书影/清单）；`renderFilters()`（全部/高分≥8.4/中评>7.9且<8.4/低分≤7.9/有报告 + 国家 + 年份降序，各带范围计数）；选中年份时在筛选条旁渲染「打开 {年} 年度页 ↗」链接 `./{year}_reading_tracker.html`；深链读取 `?search=` `?year=`（可选 `?sort=`）。

- [ ] **Step 1: 状态机与筛选**
  实现上述函数；筛选按钮点击切换并高亮；搜索输入 300ms debounce；URL 深链同步（`history.replaceState` 或 `pushState`）。
- [ ] **Step 2: 图表柱点击**
  点击某年柱 → `state.year = 该年` → `applyState()`。
- [ ] **Step 3: 验证**
  浏览器核对：跨年搜索命中；筛 2020 后统计/国家/图表/高分榜/清单全联动且与手工核对一致；`?search=`、`?year=` 直达；无结果文案出现。
- [ ] **Step 4: 本地提交**
  `git commit -am "feat: wire search, year/country/rating filters and deep links"`

### Task 6: 书影留存 + 书籍清单（含年份标签、排序、报告按钮）

**Files:**
- Modify: `reading archive/all.html`

**Interfaces:**
- Consumes: `getFilteredBooks()`、`state`
- Produces: `renderWall(list)`（封面卡 + hover 年份小标签 + 计数 `#wall-count`）、`renderBooklist(list)`、`toggleBooklist()`、排序 `finish/rating/pages/year`、`getSortedList()`；行内「阅读报告」按钮（`report` 非空时渲染，链接解析到 `reading archive/reports/...`）；有 `wereadId` 的书行内划线指示。

- [ ] **Step 1: 书影留存**
  懒加载图片；点击行为先留空（Task 7 接入面板）。
- [ ] **Step 2: 书籍清单**
  复制年度页清单行结构与样式（书名、作者、评分星、日期、年份标签、报告按钮、划线指示）；排序按钮切换（时间↓/评分↓/页数↓/年份↓），默认 `finish` 降序（最新在前）。
- [ ] **Step 3: 接入 applyState**
  搜索/筛选变化后墙与清单同步刷新。
- [ ] **Step 4: 验证**
  浏览器核对：墙计数 = 清单数 = 当前范围书数；年份标签正确；报告按钮指向 `reading archive/reports/<年>/<id>.html` 且能打开；排序正确；折叠展开正常。
- [ ] **Step 5: 本地提交**
  `git commit -am "feat: add cover wall and book list with year badges to overview"`

### Task 7: 笔记/划线面板（懒加载 weread）

**Files:**
- Modify: `reading archive/all.html`

**Interfaces:**
- Consumes: `yearHtmlCache`、`extractWereadJson(html)`
- Produces: `openBookPanel(book, indexInAllBooks)`、`closeBookPanel()`；每年度 weread 解析缓存 `wereadCache[year]`。

- [ ] **Step 1: 懒解析**
  首次点开某年书籍时，用 `extractBalanced` 从 `yearHtmlCache[year]` 解析 `const wereadData = {` 并缓存；此后同年度直接复用。
- [ ] **Step 2: 面板渲染**
  面板结构对齐年度页：封面/书名/作者/评分星/起止日期/Review/Summary/「阅读报告」按钮；有 `wereadId` 且有数据时渲染 划线(highlights)/想法(thoughts)/热门划线(popularHighlights)/章节(chapters)；无数据自然隐藏划线区。
- [ ] **Step 3: 接线**
  高分榜卡、书影墙、清单行点击均打开对应书面板；移动端底部面板与桌面右侧面板行为对齐年度页；`#panelClose`/遮罩/返回按钮可用。
- [ ] **Step 4: 验证**
  浏览器点开 ≥3 本不同年份的书：划线数据正确、只解析该书所在年度一次（Network 面板确认无重复 fetch）、无划线书不显示划线区；窄屏/深色正常。
- [ ] **Step 5: 本地提交**
  `git commit -am "feat: lazy-load weread notes panel in overview"`

### Task 8: 首页入口 + 文档

**Files:**
- Modify: `index.html`（顶部统计条 `.global-summary` 区域）
- Modify: `AGENTS.md`（目录表 + 同步提醒）
- Modify: `README.md`（可选，一句入口说明）

- [ ] **Step 1: 入口改造**
  将顶部统计条整条变为指向 `reading%20archive/all.html` 的链接：保留现有视觉；hover 显示「查看全部年份 →」提示、手型光标；键盘可达（真实 `<a>` 或 `role="link"` + Enter 处理）；`aria-label="查看全部年份总览"`；加载完成前也可点击。
- [ ] **Step 2: AGENTS.md**
  目录表加 `reading archive/all.html` 行（角色 = 全部年份总览页，手工维护）；在「模板与设计规则」加一条：改 `index.html`/`template.js` 视觉或交互时需同步 `all.html`。
- [ ] **Step 3: 验证**
  首页 hover/键盘/点击均进入总览页；`AGENTS.md` 渲染正常。
- [ ] **Step 4: 本地提交**
  `git commit -am "feat: add overview entry on archive stats bar and document sync rule"`

### Task 9: 综合回归验证

**Files:**
- 无新增（仅验证）

- [ ] **Step 1: 静态校验**
  提取 `all.html` 内嵌脚本 `node --check`；`node --test test/` 通过。
- [ ] **Step 2: 功能矩阵（preview + 浏览器自动化）**
  首页入口 → 总览页：统计数、国家、年图+累计线、高分榜、筛选、书影、清单、划线面板；跨年搜索；单年筛选联动；排序；深链 `?search=`/`?year=`；报告链接；≥3 本不同年份划线懒加载；窄屏；深色；无结果；某年缺失模拟不白屏；`file://` 打开显示 HTTP 指引。
- [ ] **Step 3: 回归**
  打开首页与 1–2 个年度页，确认未受影响（本次未改它们，作为基线抽查）。
- [ ] **Step 4: 变更范围核对**
  `git status` 仅含：`reading archive/all.html`（新增）、`index.html`、`AGENTS.md`、`README.md`（可选）与两份 `docs/superpowers/` 文档；确认 8 个年度页与 CI 无改动。
- [ ] **Step 5: 汇总**
  向用户汇报验证证据；推送与否由用户决定，不自行 push。
