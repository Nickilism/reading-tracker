# AGENTS.md

## 项目目标

本项目将 Airtable `Books` 表中的阅读记录生成年度静态 HTML 页面，并发布到 GitHub Pages。可选地从微信读书获取划线、想法和热门划线，嵌入每本书的笔记面板。

线上归档页：`https://nickilism.github.io/reading-tracker/`

## 工作原则

- 默认使用中文沟通；结论先行，代码、命令和变量名使用英文。
- 先理解数据流和现有约束，再改代码；不要为“看起来更整洁”而重构无关部分。
- 修改前先确认目标文件是否为生成产物。除非任务明确要求，不直接手改生成的年度 HTML。
- 不读取、输出、提交或修改 `.env`、密钥、Token。环境变量仅通过运行环境或 GitHub Secrets 提供。
- 未经用户明确授权，不执行删除、`git push`、`git rebase`、`git reset --hard`、修改 GitHub Actions/CI 配置或生产发布。

## 目录与文件约定

| 路径 | 角色 | 修改约定 |
| --- | --- | --- |
| `reading-tracker-github.js` | CI/非交互主生成器 | 年度数据处理、Airtable 拉取、微信读书整合与模板注入 |
| `reading-tracker-year-github.js` | 本地交互式生成器 | 保持与主生成器的数据处理逻辑一致；不在此处引入只属于 CI 的行为 |
| `template.js` | 年度页面的唯一模板 | 修改 UI 或客户端行为时的主入口 |
| `index.html` | 跨年度归档入口与视觉规范源 | 与 `template.js` 共同维护，优先在此确定视觉规范 |
| `weread-api.js` | 微信读书 API 客户端 | 仅负责请求封装与接口参数 |
| `weread-match.js` | Airtable/微信读书书籍匹配 | 保持匹配规则可解释，避免无依据地降低匹配门槛 |
| `weread-cache.js` / `weread-cache.json` | 微信读书增量缓存 | JSON 是构建产物兼缓存；只在需要刷新数据时更新 |
| `reading archive/YYYY_reading_tracker.html` | 年度生成页面（含当年） | 由主生成器生成，统一存放在此目录 |
| `report-pages.js` | 阅读报告页构建（纯函数） | 两个生成器共享；修改后需重新生成受影响年度页面与报告页 |
| `reading archive/reports/YYYY/<recId>.html` | 年度阅读报告页（构建产物） | 由生成器根据 Airtable `Report` 附件生成；文件名 = Airtable 记录 ID，不要手改 |
| `builder_offline.js` | 离线页面构建器 | 读取已有年度页面、内联 Chart.js 和封面，不访问 Airtable |
| `preview.js` | 本地预览服务器 | 双击 `preview.cmd` 时启动；仅监听本机 127.0.0.1，不访问 Airtable |
| `preview.cmd` | 预览启动器 | 双击即可启动本地预览并自动打开浏览器 |
| `.github/workflows/deploy.yml` | CI 与 GitHub Pages 发布 | 仅在用户明确要求时修改 |

不要将临时文件、下载素材、调试输出放在项目根目录；使用系统临时目录或项目已有的忽略目录。新增长期文档放在 `docs/`，设计与实施记录放在 `docs/superpowers/specs/`、`docs/superpowers/plans/`。

## 数据流与不变量

```text
Airtable Books
  -> reading-tracker-github.js
  -> template.js 注入数据
  -> YYYY_reading_tracker.html
  -> GitHub Pages / index.html

微信读书 API
  -> weread-api.js -> weread-match.js -> weread-cache.json
  -> 年度页面的 WEREAD_JSON

Airtable Report 附件 (.md/.html)
  -> reading-tracker-github.js -> report-pages.js
  -> reading archive/reports/YYYY/<recId>.html
  -> 年度页 BOOKS_JSON 中的 report 相对路径
```

- “已读”以 Airtable `Finish Time` 非空为准；年度查询按 `YEAR({Finish Time})` 筛选。
- Airtable 书籍字段包括：`Title`、`Author`、`Start Time`、`Finish Time`、`My Rating`、`Pages`、`Douban Link`、`Douban Cover Link`、`Review`、`Summary`、`Report`（附件 `.md`/`.html`，可空）。
- 作者字段中的国家前缀用于推导书籍来源；修改 `COUNTRY_PREFIX_MAP` 时，要保持显示名称、统计和现有前缀兼容。
- 阅读报告：构建时下载 `Report` 附件，`.md` 用 `marked` 转 HTML，`.html` 原样放入 `<iframe srcdoc>`；产物为 `reading archive/reports/<年份>/<recId>.html`。书的 `report` 字段保存相对路径，书单书名右侧与详情面板作者下方据此渲染按钮；无报告/下载失败时为 `''`，不渲染、不中断构建。
- 报告页位于 `reading archive/reports/<年份>/`（两级目录），返回年度页链接必须写成 `../../<年份>_reading_tracker.html`；少写一级 `../` 会 404。
- 微信读书匹配优先级是：有笔记 > 书名精确匹配 > 作者匹配 > 笔记数量。作者为空时仅按书名匹配。
- 书名已匹配（精确或包含）时，作者不匹配不会排除候选，仅降低匹配优先级（导入版作者元数据可能不准确，如《中文打字机》导入版作者误为「张朋亮」）。
- 同一本书存在多个版本时，优先选有笔记的版本；若匹配到的版本无笔记，会按「书名包含」关系在笔记概览中查找同名导入版（导入版文件名较长，如「书楼吊堂_炎昼_王华懋_日_京极夏彦」，normalize 时下划线视为分隔符一并清理）。
- 导入书籍的个人笔记可能来自导入版本，热门划线与推荐值可能来自官方版本；不要把两类数据源混为一谈。
- 缓存按微信读书 `bookId` 存储。`--no-cache` 表示全量刷新；常规构建应复用缓存，避免无意义的 API 请求。

## 模板与设计规则

- `template.js` 是被读取并提取的模板文本，不是可直接执行的普通 JavaScript 模块；不要对它直接运行 `node --check`。
- 生成器会注入 `{{YEAR}}`、`{{GENERATED_DATE}}`、`{{BOOKS_JSON}}`、`{{COUNTRY_PREFIX_MAP}}`、`{{WEREAD_JSON}}`、`{{FAVICON_PREFIX}}`。增删占位符时，必须同步更新生成器。
- 年度页和归档页共用一套设计语言。改视觉规范时，先改 `index.html`，再同步 `template.js`，最后重新生成受影响年度页面。
- 颜色必须通过 CSS 变量定义和引用；不要在组件样式中新增硬编码 hex/rgba 色值。
- 保持页面主体宽度和基础布局：`.page { max-width: 780px; margin: 0 auto; }`，`body { padding: 2.5rem 1rem 2rem; }`。
- 页面应持续支持系统深色模式、移动端笔记底部面板和桌面端右侧笔记面板。
- 阅读报告页是独立 HTML，由 `report-pages.js` 生成，沿用年度页同一组 CSS 变量与字体。

## 构建与验证

```powershell
# 安装依赖
npm install

# 生成当前年份（会访问 Airtable；可能更新微信读书缓存）
node reading-tracker-github.js

# 生成指定年份
node reading-tracker-github.js 2026

# 强制刷新微信读书缓存
node reading-tracker-github.js 2026 --no-cache

# 本地交互式生成
node reading-tracker-year-github.js

# 从已有年度页面生成完全离线版本（会下载 Chart.js 和封面）
node builder_offline.js 2026
```

- 运行主生成器前，明确告知它会访问外部 API 并可能改写 `weread-cache.json` 和目标年度 HTML。
- 生成时若 Airtable `Report` 有附件，会输出 `reading archive/reports/<年份>/` 下的报告页；附件下载失败仅告警并跳过该书。
- 若工作区已有生成页面或缓存的未提交改动，先保留它们；除非用户明确要求，不用构建覆盖。
- 改动普通 JS 模块后运行 `node --check <file>`。验证 `template.js` 时，应按生成器方式注入占位符后，再检查其内嵌脚本语法。
- 改动 UI 时，用浏览器检查归档页、当前年度页、窄屏布局、深色模式、搜索/筛选和笔记面板；网页测试与截图使用 `/browse` skill。

## 自动化与发布

- 工作流在核心文件推送、`repository_dispatch`（`airtable-update`）、手动触发及每周一/周四 06:00 UTC 时运行。
- 工作流生成当年页面并发布整个仓库到 `gh-pages` 分支。因此改动发布范围或部署配置属于高风险操作，必须先取得用户明确授权。
- Airtable/Zapier 触发与 GitHub Secrets 均是外部配置；本仓库代码改动不得假设这些配置可用。

## 任务路由

- 需求、范围或架构重大调整：先进入 Plan Mode，形成方案并等待确认。
- 故障诊断：使用 `/investigate`。
- 网页行为验证：使用 `/qa` 或 `/qa-only`；视觉审查使用 `/design-review`。
- 代码变更完成后的差异审查：使用 `/review`。
- 发布、合并或部署：使用 `/ship` 或 `/land-and-deploy`，并遵守本文件的授权限制。
