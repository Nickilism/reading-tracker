# 阅读报告功能设计（Reading Report Feature）

## 目标

- Airtable `Books` 表新增 `Report` 附件字段，存放该书的阅读报告（`.md` 或 `.html`，非每本书都有）。
- 构建时下载附件，转换为独立的静态 HTML 页面，存放在 `reading archive/reports/<年份>/`。
- 两个入口，点击后在新标签页打开报告：
  1. 书籍清单：书名右侧的「阅读报告」按钮；
  2. 详情面板：作者名下方的「阅读报告」按钮。

## 数据流

```text
Airtable Report 附件
  -> reading-tracker-github.js / reading-tracker-year-github.js
  -> 下载附件 -> marked 转换(.md) / iframe 原样包装(.html)
  -> reading archive/reports/<年份>/<recId>.html
  -> 年度页 BOOKS_JSON 中每本书的 report 字段（相对路径）
  -> template.js 渲染按钮
```

## 目录与命名

- 报告统一存放在 `reading archive/reports/<年份>/`。
- 文件名使用 Airtable 记录 ID：`<recId>.html`。无论源文件是 `.md` 还是 `.html`，产物一律是 `.html`。
- 记录 ID 全局唯一、稳定、纯 ASCII，避免中文书名的 URL 编码问题和重名冲突。
- 无记录 ID（正常流程不会出现）：跳过该报告的生成并在构建日志中告警，避免生成歧义文件名。

### 报告与书籍的对应关系

1. 每本书的 JS 数据对象新增 `report` 字段，值为相对路径 `reports/<年份>/<recId>.html`；按钮直接使用该值作为 `href`，这是对应关系的唯一数据源。
2. 报告页顶部渲染该书书名与作者（构建时从书数据写入），打开文件本身即可看出归属。
3. 文件名 = 记录 ID，与 Airtable 记录保持 1:1 映射，改名、换年份不产生歧义。

## 报告页渲染

- 页面骨架：顶部「← 返回 {年份} 阅读记录」链接（`../<年份>_reading_tracker.html`）+ 书名 + 作者，下方为正文区。
- 样式沿用现有设计语言：同一组 CSS 变量（背景、文字、强调色）、字体、深色模式支持。
- `.md` 文件：构建时用 `marked` 转换为 HTML，直接嵌入正文区（`.report-content`）。
- `.html` 文件：不解析、不改造，整个文件放入 `<iframe srcdoc>` 原样渲染，并通过加载后 JS 自动调整高度，避免与站点样式互相污染。
- 非 `.md` / `.html` 后缀：按 Markdown 处理并在构建日志中告警。

## 生成器改动

`reading-tracker-github.js` 与 `reading-tracker-year-github.js` 同步修改，保持一致：

1. `processBooks`：
   - 新增 `id: r.id`（来自 Airtable 记录）；
   - 新增 `report: b.Report?.[0]`（附件数组取第一个；多于一个时告警）。
2. 新增异步步骤 `fetchReports(books, year)`（在 `addDerived` 之后、写年度 HTML 之前执行）：
   - 确保 `reading archive/reports/<年份>/` 目录存在；
   - 复用现有 `https` 请求模式下载附件（不依赖全局 `fetch`，保持 Node 14+ 兼容）；
   - 按扩展名转换/包装，写入 `<recId>.html`；
   - 成功：`book.report` 更新为相对路径 `reports/<年份>/<recId>.html`；
   - 失败：`console.warn` 后清空 `book.report`，构建继续，按钮不渲染。
3. `generate()` 的占位符约定不变；`report` 随 `{{BOOKS_JSON}}` 注入。
4. 新增构建期依赖：`marked`（devDependency，仅 Node 侧使用，不进浏览器）。

## 模板改动（template.js）

- 新增 `.report-btn` 样式：使用 CSS 变量（强调色系），与现有按钮/链接风格一致。
- 书籍清单：`.book-title` 外层改为弹性行，报告存在时在书名右侧渲染「阅读报告」链接（`target="_blank"`）。
- 详情面板：`.panel-author` 下方渲染同款「阅读报告」链接。
- 按钮随行渲染，不修改搜索/筛选逻辑；`report` 为空时自然不显示。

## 边界与错误处理

- 附件字段多个文件：取第一个并在构建日志中告警。
- 下载或转换失败：告警并跳过该按钮，不中断整年构建。
- 报告在 Airtable 中删除或换书：不自动删除旧报告文件（删除属用户红线，默认不做）；文件名按记录 ID 生成，不会与新文件冲突。
- 重新上传：每次构建都按当前附件 URL 重新下载并覆盖同名文件，无报告缓存；格式变更（.md <-> .html）按新扩展名切换渲染方式。
- 离线版（builder_offline）：报告页是本地兄弟文件，年度页相对链接打开时仍可用；「单文件全离线」不在本次范围。

## 验证

- `node --check` 两个生成器；`npm test` 通过。
- 本地生成 2026 年页（会访问 Airtable 并下载两份测试报告），确认报告文件落盘。
- 预览服务器检查：两个入口按钮、`.md` 与 `.html` 两种渲染、搜索/筛选、深色模式、窄屏。
- `git status` 核对变更范围（两个生成器、template.js、package.json、报告文件、年度页）。

## 非目标（Non-Goals）

- 不在归档入口 `index.html` 添加报告入口。
- 不做报告缓存（每次构建重新下载）。
- 不自动删除旧报告文件。
- 不修改 `.github/workflows/deploy.yml`。
- 不做单文件全离线打包。
- 不改造用户 `.html` 报告内部的深色模式适配。
