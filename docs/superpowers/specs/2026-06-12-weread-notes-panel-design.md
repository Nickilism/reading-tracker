# 微信读书笔记弹出面板设计

**日期**: 2026-06-12
**范围**: 年度阅读记录页面（如 `2026_reading_tracker.html`）的封面交互增强
**不涉及**: `reading archive/index.html`（保持不变）

---

## 概述

在年度阅读记录页面中，点击书影留存的封面时，从页面右侧（移动端从底部）弹出面板，展示该书在微信读书上的划线、想法和点评。

## 技术方案：构建时嵌入

构建脚本 (`reading-tracker-github.js`) 在拉取 Airtable 数据后，额外调用微信读书 API 获取笔记数据，嵌入 HTML。

与现有 `{{BOOKS_JSON}}` 注入模式完全一致，页面自包含，离线可用。

---

## 数据层

### 构建流程

```
Airtable 数据
  → processBooks()
  → [新增] fetchWeReadData(books)
      1. 加载本地缓存 weread-cache.json
      2. 调用 /shelf/sync 获取完整书架 (bookId, title, author)
      3. 模糊匹配 Airtable 书籍 ↔ 微信读书书架
      4. 对缓存中已有 → 直接使用，跳过 API 调用
      5. 对缓存中没有（新增书籍）→ 调用 /book/bookmarklist + /review/list/mine + /book/info
      6. 将新获取的数据合并回缓存，写入 weread-cache.json
  → 注入 {{BOOKS_JSON}} + {{WEREAD_JSON}} 到模板
```

### 增量缓存机制

**缓存文件**: `weread-cache.json`（项目根目录）

**策略**: 历史书籍的划线和想法基本不会改动，因此缓存已有书籍的微信读书数据，每次构建只对新增书籍调用 API。

**缓存 key**: 以 `wereadId` 为 key，缓存内容与 `{{WEREAD_JSON}}` 结构一致。

**流程**:
1. 构建开始时读取 `weread-cache.json`（不存在则视为空缓存）
2. 模糊匹配后，对比当前书籍列表与缓存：
   - 缓存命中 → 直接使用，零 API 调用
   - 缓存未命中（新增书籍）→ 调用 API 获取数据
3. 构建结束时将新数据合并写回缓存

**缓存管理**:
- `weread-cache.json` 加入 `.gitignore`（纯本地文件）
- CI 环境可通过 GitHub Actions cache 持久化
- 提供 `--no-cache` 标志强制全量刷新

### 模糊匹配策略

1. 标准化双方的 title 和 author（去空格、去标点、转小写）
2. 精确匹配：title 完全一致 && author 有交集
3. 模糊匹配：title 包含关系（A 包含 B 或 B 包含 A）&& author 有交集
4. 匹配失败的书：不注入微信读书数据，面板降级显示

### 注入数据结构

**模板新增占位符**: `{{WEREAD_JSON}}`

```js
{
  "wereadId_abc123": {
    "rating": 85,
    "ratingCount": 1234,
    "review": "我的点评内容...",
    "highlights": [
      { "text": "高亮文本", "chapter": "第一章", "color": 1 }
    ],
    "thoughts": [
      { "text": "我的想法", "quote": "原文引用...", "chapter": "第二章" }
    ],
    "popularHighlights": [
      { "text": "热门高亮文本", "count": 50 }
    ]
  }
}
```

每本书的 JSON 对象新增 `wereadId` 字段用于关联：

```js
{
  title: "...",
  author: "...",
  wereadId: "abc123",  // 新增
  // ... 其他现有字段
}
```

### 微信读书 API 调用

所有请求通过网关：

```
POST https://i.weread.qq.com/api/agent/gateway
Authorization: Bearer ${WEREAD_API_KEY}
```

| 步骤 | api_name | 用途 |
|------|----------|------|
| 1 | `/shelf/sync` | 获取完整书架列表 |
| 2 | `/book/info` | 获取评分、评分人数 |
| 3 | `/book/bookmarklist` | 获取划线列表 |
| 4 | `/review/list/mine` | 获取想法和点评 |

---

## 面板 UI 设计

### 面板形态

**桌面端（≥ 600px）**:
- 右侧滑入，宽度 `min(480px, 90vw)`，全高度
- 背景半透明遮罩 `rgba(0,0,0,0.3)` (dark: `rgba(0,0,0,0.5)`)
- 滑入动画 300ms ease
- 点击遮罩或按 ESC 关闭

**移动端（< 600px）**:
- 从底部滑入，宽度 100%，高度 90vh
- 顶部居中拖拽条（`width: 40px; height: 4px`，圆角）
- 下滑手势关闭（拖拽超过 100px 触发）
- 内容滚动到顶部时继续下滑触发关闭

### 面板内容结构

```
┌─────────────────────────────────┐
│  [×]                           │  ← 关闭按钮（右上角）
│                                 │
│  ┌──────┐  书名                 │
│  │ 封面 │  作者                 │  ← 书籍信息区
│  │ 图片 │  ★★★★☆ 8.5 (2.3万人) │
│  └──────┘                      │
│                                 │
│  ─────────────────────────────  │  ← 分割线
│                                 │
│  📝 我的点评                     │
│  点评正文内容...                 │  ← 点评区（>200字折叠）
│                                 │
│  ─────────────────────────────  │
│                                 │
│  [划线 (12)] [想法 (5)] [热门划线 (30)] │  ← Tab 栏（带数量）
│  ─────────────────────────────  │
│                                 │
│  · 划线内容 1                    │
│    「第一章」                    │  ← Tab 内容区（可滚动）
│                                 │
│  · 划线内容 2                    │
│    「第三章」                    │
│  ...                           │
└─────────────────────────────────┘
```

### 各区块细节

**书籍信息区**:
- 封面：桌面 80×110px，移动端 60×82px，圆角 4px
- 书名：16px，font-weight 600
- 作者：14px，颜色 `var(--text-secondary)`
- 评分：微信读书评分（满分 100，显示为 X.X/10）+ 评分人数

**点评区**:
- 标题 "📝 我的点评"
- >200字 默认折叠显示前 3 行，点击展开
- 无点评时显示 "暂无点评" 并置灰

**Tab 栏**:
- 三个 tab，标题格式：`划线 (12)` `想法 (5)` `热门划线 (30)`
- 数量为 0 时仍显示 tab，内容区显示空状态提示
- Tab 激活态：底部边框 `var(--text)`

**Tab 内容**:
- **划线**：高亮文本 + 所在章节名
- **想法**：想法内容 + 原文引用（引用用左侧 3px 边框 + `var(--bg-alt)` 背景区分）
- **热门划线**：其他读者的热门高亮 + 标注人数

### 样式规范

遵循现有 design tokens（以 `reading archive/index.html` 的 `:root` 为 Single Source of Truth）:
- 面板背景：`var(--bg)`
- 遮罩：`rgba(0,0,0,0.3)` / `rgba(0,0,0,0.5)` (dark)
- 引用块：左侧 3px 边框 `var(--border)`，背景 `var(--bg-alt)`
- 暗色模式自动适配（已有 `prefers-color-scheme` 机制）

---

## 集成

### 改动文件

| 文件 | 改动内容 |
|------|----------|
| `template.js` | 新增面板 HTML/CSS/JS；修改封面 onclick 为 `openBookPanel()`；新增 `{{WEREAD_JSON}}` 占位符 |
| `reading-tracker-github.js` | 新增 `fetchWeReadData()` 函数；匹配逻辑；注入 `{{WEREAD_JSON}}` |
| `.env.example` | 已有 `WEAREAD_API_KEY`，无需改动 |
| `.github/workflows/deploy.yml` | 需新增 `WEREAD_API_KEY` secret 传递 |
| `reading archive/index.html` | **不改** |

### 封面交互变更

**Before**: `onclick="window.open('${b.doubanLink}', '_blank')"`
**After**: `onclick="openBookPanel(${index})"`

### 无数据降级

匹配失败或无微信读书数据时：
- 封面仍可点击，弹出精简面板
- 精简面板只显示书籍信息区（封面、书名、作者）+ 提示 "暂无微信读书笔记"
- 不显示点评区和 Tab 栏

---

## 风险与注意事项

1. **微信读书 API 速率限制**（已通过缓存机制缓解）：增量缓存确保每次构建只对新增书籍调用 API，通常 1-2 本，不存在批量限流风险。首次全量构建时需控制频率，每本书间隔 200-500ms。
2. **构建时间**（已通过缓存机制缓解）：首次全量构建约 30-60 秒（50 本书）；后续增量构建仅几秒。
3. **API Key 安全**：`WEREAD_API_KEY` 仅在构建时使用（Node.js 环境），不暴露到前端。
4. **书架变动**：如果用户从微信读书书架移除了某本书，下次构建时匹配会失败，自动降级。
5. **缓存一致性**：用户修改划线/想法后，缓存不会自动更新。使用 `--no-cache` 标志可强制全量刷新。
