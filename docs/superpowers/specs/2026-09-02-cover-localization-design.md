# 封面本地化镜像设计

日期：2026-09-02
状态：已与用户逐节确认，待用户审阅设计文档后进入实施计划

## 1. 背景与目标

当前阅读记录页面的书籍封面直接引用 Airtable `Douban Cover Link` 字段中的外链（315 张去重封面中 312 张来自 `neodb.social`，其余来自 amazon 等站点）。浏览器加载页面时会直接请求外站，一旦 neodb 等站点不可达，封面将无法显示。

目标：

- 站点（归档首页与各年度页）的封面资源全部改由本项目提供，浏览器只访问本项目仓库内的文件。
- 315 张存量封面一次性下载并提交进 `main`（全量入库）。
- 以后新增书籍出现新封面时，在现有 Zapier → GitHub Actions 触发流程中自动补齐，并自动写回 `main` 的封面目录（增量入库）。
- 支持没有 neodb 记录的书籍：用户手工找图、上传到本项目后，把 raw 链接填入 Airtable，CI 直接复用仓库内文件。

## 2. 关键决策记录

以下决策均已经用户确认：

1. 存量迁移采用**原地改写**现有 8 个年度 HTML，不重新访问 Airtable、不改微信读书缓存、不重跑生成器。
2. 封面存放于仓库根目录 `covers/`，与 `icons/` 同级。
3. 自动镜像文件命名采用「原始 URL 的 SHA-1（完整 40 位）+ 真实扩展名」。
4. CI 自动写回 `main` 时**只提交封面文件**，不自动提交年度 HTML、模板、缓存等其它文件。
5. 不修改部署触发方式：仍为推送核心文件、Zapier `repository_dispatch`、手动触发与每周一/四定时触发。
6. 镜像下载失败不中断构建：该书保留原链接并告警，下次成功运行自动纠正。

## 3. 目标数据流

```text
改造前：
Airtable Douban Cover Link(外链)
  -> BOOKS_JSON 原样保存外链
  -> 年度页/归档首页 <img src="https://neodb.social/...">
  -> 浏览器直连外站

改造后：
Airtable Douban Cover Link(仍是原始外链或本仓库 raw 链接)
  -> 生成器镜像步骤 cover-mirror.js
  -> covers/<sha1(外链)>.<ext>（或复用仓库内已上传文件）
  -> BOOKS_JSON 保存 "../covers/<文件名>"
  -> 年度页 <img src="../covers/...">
  -> 归档首页解析时归一为 /covers/...
  -> 浏览器只访问 GitHub Pages 资源
```

## 4. 存储与命名

### 4.1 目录

仓库根目录新建 `covers/`。理由：

- 与既有 `icons/` 同级，延续「根目录资源目录 + `../` 前缀」的现有约定（年度页已用 `../icons/...`）。
- 一份文件被 8 个年度页与归档首页共享，天然去重。
- GitHub Actions 的 `publish_dir: ./` 会原样发布该目录。

### 4.2 自动镜像文件名

`covers/<sha1(完整 URL)>.<扩展名>`，例如 `covers/9f2ab3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0.jpg`。

- 同一 URL 在任何时间、任何机器上算出同一文件名：无需维护 URL → 文件映射表。
- 文件名与书名、年份、作者无关：以后修改标题或在 Airtable 更换封面，不会误伤历史页面中已写入的引用。
- 下载前先检查本地文件是否存在：已存在即跳过，存量封面从此不再访问外站。

扩展名确定顺序：

1. 响应头 `Content-Type`（`image/jpeg` → `.jpg`，`image/png` → `.png`，`image/webp` → `.webp` 等）；
2. URL 路径自带扩展名（`.jpg/.jpeg/.png/.webp/.gif`）；
3. 兜底 `.jpg`。

同一张图若以不同 URL 出现会存两份，按 URL 粒度去重，可接受。

### 4.3 手工封面上传约定

没有 neodb 记录的书籍，用户把封面图片上传到仓库 `covers/` 目录，复制 GitHub 网页上的 Raw 链接（形如
`https://raw.githubusercontent.com/Nickilism/reading-tracker/main/covers/某书名.jpg`），填入 Airtable `Douban Cover Link`。

生成器识别为「本仓库自己的 raw 链接」时直接复用仓库内该文件，不下载、不产生第二份拷贝。文件尚未推送到 main 时，按普通外链处理，下载哈希副本兜底。

## 5. 新模块：cover-mirror.js

新建 `cover-mirror.js`，职责单一：判断/生成封面本地路径、必要时下载封面。生成器与迁移脚本共用，避免逻辑分叉。

### 5.1 主要函数

```js
coverFileName(url)      // 纯函数：返回 "covers/<sha1(url)>.<ext>"，扩展名按 URL 推断的默认值
resolveRemote(url)      // 判断 url 是否指向本仓库 covers/ 的 raw 链接；是则返回仓库内相对路径
ensureCover(url, opts)  // 确保 covers/ 下存在对应文件；返回本地相对路径（含 covers/ 前缀）或 null
mirrorCovers(books, opts)
                        // 遍历 books，把每本可镜像的 book.cover 改写为 "../" + 本地路径
                        // 失败时保留原值并收集警告
```

`ensureCover` 下载行为：

- 仅处理 `http(s)://` 链接；空值或已是本地相对路径（`../covers/...`）直接放行。
- 跟随重定向最多 5 次（复用生成器现有 `downloadUrl` 的重定向模式）。
- 30 秒超时；只接受 `Content-Type` 为图片的内容；单文件上限 10MB，超出按失败处理。
- 内容以二进制 Buffer 原样写入，不压缩、不转码。
- 文件已存在时不发起任何网络请求。

### 5.2 本仓库 raw 链接识别

判定规则：

1. 主机名为 `raw.githubusercontent.com`；
2. 路径前三段分别是 owner / repo / branch，剩余部分以 `covers/` 开头；
3. owner/repo 与本仓库实际远程一致（CI 中取 `GITHUB_REPOSITORY`，本地取 `git remote get-url origin`，比较时忽略大小写）；
4. 剩余路径经 `decodeURIComponent` 后对应的本地文件存在于工作区。

满足以上条件时，直接把 `book.cover` 改写为 `"../" + 仓库内相对路径`，不下载。不满足第 4 条时退回普通外链镜像流程。

## 6. 一次性迁移脚本：sync-covers.js

新建 `sync-covers.js`，用于把历史年度页面原地迁移到本地封面，后续也可手动复用。

行为：

1. 参数可指定年份；缺省处理 `reading archive/` 下全部 `YYYY_reading_tracker.html`。
2. 沿用现有 `const books = [...]` 提取正则（与 `builder_offline.js` 相同）解析每页书籍数据。
3. 对每个仍是外链的 `book.cover` 调用镜像逻辑：下载缺失文件（成功后得到 `covers/<sha1>.<ext>`）或识别本仓库 raw 链接。
4. 用精确字符串替换把页面中 `"<外链>"` 原位替换为 `"../covers/<文件>"`；**除封面路径外不改动页面任何字节**（保留生成日期、报告按钮、微信读书数据等全部现状，也保留用户本地未提交的页面修改）。
5. 只在实际发生变化时写回文件；逐个年份输出成功/失败统计。
6. 失败封面保留原链接，最终汇总清单便于用户跟进。

镜像下载按顺序执行并做限速，避免对 neodb 造成压力；315 张预计数分钟内完成。

## 7. 代码改动清单

### 7.1 reading-tracker-github.js（CI 生成器）

在 `fetchReports` 之后、`generate` 之前调用 `await mirrorCovers(processed)`：

```js
await fetchReports(processed, year);
await mirrorCovers(processed);
```

这样新生成页面中的封面从一开始就是本地路径；main 中已有的封面文件不会被重复下载。

### 7.2 reading-tracker-year-github.js（本地交互生成器）

在相同位置调用 `mirrorCovers`，保持与主生成器数据处理逻辑一致（AGENTS.md 约定）。

### 7.3 index.html（归档首页）

在 `loadYear` 解析出 `books` 后统一归一封面路径：

```js
const yearUrl = new URL(path, location.href);
for (const b of books) {
  if (b.cover && !/^https?:\/\//i.test(b.cover) && !b.cover.startsWith('data:')) {
    b.cover = new URL(b.cover, yearUrl).href;
  }
}
```

`../covers/xxx.jpg` 会按年度页 URL 解析成站点根下的 `covers/xxx.jpg`，此后 `stats.topCovers`、搜索替换封面等现有逻辑无需改动。

### 7.4 builder_offline.js（离线构建器）

当 `book.cover` 已是 `../covers/...` 本地路径时，改为从仓库根目录读取文件并转 base64；文件缺失时置空并告警，不再尝试用 `https.get` 请求本地路径。

### 7.5 .github/workflows/deploy.yml（已获用户授权）

仅做两处改动：

1. checkout 步骤加 `fetch-depth: 0`，保证自动回写 push 稳定。
2. 在「Generate Reading Tracker」之后、发布之前新增「回写封面到 main」步骤，逻辑：

```yaml
- name: Sync cover files back to main
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add covers/
    if git diff --cached --quiet; then
      echo "No new cover files"
    else
      git commit -m "chore: sync cover files from CI"
      git push origin HEAD:main || echo "::warning::Cover sync push failed; will retry on next run"
    fi
```

设计约束：

- 只 `git add covers/`，不提交年度 HTML、模板、缓存或其它文件。
- push 目标为 `main`；工作流 push 触发路径不含 `covers/**`，不会自我循环触发。
- push 失败（如与用户本地提交冲突）只告警、不使部署失败；下次运行自动重试。
- 工作流文件本身不在 push 触发路径中，改动不影响 Zapier/定时触发方式；下次触发即用新逻辑。

### 7.6 项目文档

- `AGENTS.md`：目录/文件约定表登记 `cover-mirror.js`、`sync-covers.js` 与 `covers/` 目录角色。
- `CLAUDE.md`：模块说明补充新文件。
- `README.md`：补充手工封面（无 neodb 记录）的上传流程与 raw 链接填写方法。

### 7.7 测试

参照仓库现有极简 node 测试风格新增 `test/cover-mirror.test.js`，覆盖：

- 同一 URL 得到同一文件名，不同 URL 得到不同文件名；
- 扩展名推断规则；
- 本仓库 raw 链接识别与映射；
- 非本仓库外链走哈希镜像路径；
- 下载失败时 `book.cover` 保持原值。

## 8. 失败兜底

- 镜像失败的书：年度页/详情面板行为与今天完全一致（远程可达则显示，不可达则占位/隐藏），构建不中断，控制台告警并提示书名。
- CI 回写 push 失败：仅告警，本次部署照常完成。
- 手工 raw 链接文件尚未推送到 main：本次按普通外链处理，推送后下次运行自动纠正。
- 不删除任何历史文件：即使 Airtable 封面 URL 变化导致旧哈希文件不再被引用，也保留（可留待以后单独清理，本次不做删除）。

## 9. 验证方案

1. 所有新增/修改的普通 JS 模块运行 `node --check`（`template.js` 除外）。
2. 运行 `test/cover-mirror.test.js` 纯函数测试。
3. 运行 `node sync-covers.js` 完成 315 张封面迁移，检查：
   - `covers/` 文件数与成功列表一致；
   - 8 个年度页中不再出现 `https://neodb.social` 封面直链（失败清单除外）；
   - 页面非封面内容与迁移前一致（git diff 仅封面字符串与新增图片）。
4. 本地 HTTP 预览（`preview.cmd`）验证：
   - 归档首页各年度卡片封面正常；
   - 抽查多个年度页封面墙、详情面板封面；
   - `covers/` 下图片路径返回 200；
   - 深色模式与窄屏下封面表现不回归。
5. 运行 `node builder_offline.js 2026` 验证离线版仍可生成且封面内联正常；生成的 `_offline.html` 验证后删除（会先征求用户同意）。
6. 浏览器按页面行为要求做最终检查（对应仓库 AGENTS.md 的网页测试约定）。

## 10. 边界与明确不做

- 不修改部署触发路径与触发方式。
- 不自动提交年度 HTML、模板、微信读书缓存等非封面文件。
- 不改 Airtable 数据，不读取/输出/提交 `.env` 与密钥。
- 不改模板视觉与页面布局。
- 不压缩、转码或重命名已有封面内容。
- 不删除孤儿封面文件。
- 迁移与 CI 改动均先在 main 本地完成并验证，推送前单独征求用户授权。

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 迁移时个别外站拒绝下载 | 失败保留原链接并汇总清单；不阻塞迁移 |
| CI 回写 main 遇到并发提交 | 回写为 best-effort，失败仅告警，下次运行重试 |
| 自动回写触发工作流循环 | push 路径不含 `covers/**`；且只提交封面文件 |
| 手工 raw 链接路径含空格/中文 | 用户复制 Raw 链接；实现中做 URL 解码 |
| 仓库体积增加 | 预计 10–20MB，GitHub 与 OneDrive 均能承受；不做压缩以保持原图 |
