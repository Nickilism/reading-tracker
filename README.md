# 阅读记录在线系统

将 Airtable 中的阅读记录自动生成 HTML 页面，部署到 GitHub Pages 实现在线访问。支持集成微信读书（WeRead）笔记数据，在页面中展示划线、想法和热门划线。

演示地址：

https://nickilism.github.io/reading-tracker/reading%20archive/index.html

## 功能

- 自动同步 Airtable 阅读数据
- 集成微信读书笔记（划线、想法、热门划线）
- 生成美观的阅读记录展示页面
- 支持按年份筛选和统计
- 自动事件触发或定时更新
- 深色模式支持
- 点击封面查看读书笔记面板

## 前提条件

- Airtable 账户（Free/Pro/Enterprise 均可）
- GitHub 账户
- Zapier 账户（用于连接 Airtable 和 GitHub）
- 微信读书账户（可选，用于获取读书笔记）

## 技术架构

- **数据源**: Airtable Books 表 + 微信读书 API
- **生成工具**: Node.js 脚本
- **托管平台**: GitHub Pages
- **自动化**: GitHub Actions + Zapier

## 数据流

```
Airtable (Books 表)
    ↓ REST API
reading-tracker-github.js (Node.js)
    ↓ 微信读书 API (可选)
weread-api.js → weread-match.js → weread-cache.json
    ↓ 模板注入
template.js → {year}_reading_tracker.html
    ↓ 部署
GitHub Pages (gh-pages 分支)
```

### 微信读书集成流程

1. 调用 `/shelf/sync` 获取书架，模糊匹配 Airtable 书籍
2. 调用 `/user/notebooks` 获取有笔记的书（覆盖已从书架删除的书）
3. 对匹配成功的书拉取划线、想法、热门划线
4. 增量缓存到 `weread-cache.json`，只对新书调 API

## 核心文件

| 文件 | 说明 |
|------|------|
| `reading-tracker-github.js` | 主脚本，从 Airtable 获取数据生成 HTML |
| `template.js` | HTML 模板文件 |
| `weread-api.js` | 微信读书 API 客户端 |
| `weread-match.js` | 模糊匹配逻辑（Airtable 书籍 ↔ 微信读书书籍） |
| `weread-cache.js` | 缓存管理 |
| `weread-cache.json` | 微信读书缓存数据 |
| `reading archive/index.html` | 归档页面，聚合所有年度数据 |
| `.github/workflows/deploy.yml` | GitHub Actions 工作流 |

## Airtable 表结构要求

你的 Airtable Books 表需要包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| Title | 文本 | 书名 |
| Author | 文本 | 作者（可含国家前缀，如 `[日]村上春树`） |
| Start Time | 日期 | 开始阅读时间 |
| Finish Time | 日期 | 完成阅读时间 |
| My Rating | 数字 | 评分（1-10） |
| Pages | 数字 | 页数 |
| Douban Link | URL | 豆瓣链接 |
| Douban Cover Link | URL | 封面图链接（推荐 neodb.social） |
| Review | 文本 | 书评 |

**"已读"判断标准**：Finish Time 字段不为空

### 国家前缀格式

作者字段支持国家前缀，用于统计书籍来源国家：
- 方括号：`[日]`、`[美]`、`[德]`
- 圆括号：`(英)`、`(法)`、`(俄)`
- 其他：`〔中〕`、`【意】`

未标记的中文名默认为中国，未标记的非中文名默认为美国。

## 环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `AIRTABLE_API_KEY` | ✅ | Airtable 个人访问 token，需 `data.records:read` 权限 |
| `WEREAD_API_KEY` | ❌ | 微信读书 API Key（格式 `wrk-xxxxxxxx`），不配置则跳过微信读书数据获取 |

### 获取 Airtable API Token

1. 登录 [Airtable](https://airtable.com)
2. 点击右上角头像 → **Developer hub**
3. 点击 **Create new token**
4. 勾选 `data.records:read` 权限
5. 复制生成的 token

### 获取微信读书 API Key

1. 登录微信读书网页版
2. 获取 Bearer token（格式 `wrk-xxxxxxxx`）
3. 配置为 GitHub Secret 或本地 `.env` 文件

## 向 Airtable 添加数据的推荐方式

由于手动输入较繁琐，推荐使用以下自动化流程：

### 方案：neodb.social + iOS Shortcuts + Airtable API

1. **获取书籍信息**
   - 在 [neodb.social](https://neodb.social) 搜索书籍
   - 获取书籍 URL

2. **使用 iOS Shortcuts 自动化**
   - 创建 Shortcut 调用 neodb.social API
   - 自动获取书名、作者、封面链接等信息
   - 通过 Airtable API 创建

### iOS Shortcuts 示例

1. 下载 iOS Shortcuts App
2. 创建新的 Shortcut
3. 添加操作：
   - **"Get text from input"** - 输入 ISBN 或书名
   - **"URL"** - 构建 Airtable API 请求
   - **"Get contents of URL"** - 发送 POST 请求到 Airtable

## 部署步骤

### 第一步：创建 GitHub 仓库

1. 登录 GitHub，创建新仓库 `reading-tracker`
2. 不要勾选 "Add a README file"

### 第二步：配置本地仓库

```bash
# 克隆仓库
git clone https://github.com/你的用户名/reading-tracker.git
cd reading-tracker

# 复制本项目所有文件到仓库目录
```

### 第三步：修改配置

在开始使用前，你需要修改以下配置：

#### 1. 修改 Airtable Base ID

编辑 `reading-tracker-github.js` 中的 `BASE_ID` 常量：

```javascript
const BASE_ID = '你的Airtable Base ID';
```

获取方法：在 Airtable URL 中找到 Base ID，格式为 `appXXXXXXXXXXXXXX`

### 第四步：推送代码到 GitHub

```bash
git add -A
git commit -m "Initial commit"
git push -u origin main
```

### 第五步：配置 GitHub Secrets

1. 进入仓库 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. 添加以下 secrets：

| 名称 | 值 | 必需 |
|------|----|------|
| `AIRTABLE_API_KEY` | Airtable API Token | ✅ |
| `WEREAD_API_KEY` | 微信读书 API Key | ❌ |

### 第六步：运行第一次部署

1. 进入 GitHub 仓库 **Actions** 页面
2. 选择 "Deploy Reading Tracker"
3. 点击 **Run workflow**
4. 等待完成

### 第七步：启用 GitHub Pages

1. 进入仓库 **Settings** → **Pages**
2. **Source**: 选择 `Deploy from a branch`
3. **Branch**: 选择 `gh-pages`，path 选 `/ (root)`
4. 点击 **Save**

### 第八步：配置 Zapier 自动触发

1. 登录 [Zapier](https://zapier.com)
2. 创建新 Zap
3. **Trigger**: 选择 **Airtable**
   - Event: "New or Updated Record"
   - Base: 选择你的 Base
   - Table: 选择 Books 表
4. **Action**: 选择 **GitHub App**（搜索 "GitHub"）
   - 新建一个自定义的 Action："Create a repository dispatch event"
   - 配置：
     - **Repository**: `你的用户名/reading-tracker`
     - **Event Type**: `airtable-update`
     - **Customer Event Body**（可选）：留空或填 `{}`
5. 测试并开启 Zap

### 第九步：验证

访问 `https://你的用户名.github.io/reading-tracker/reading%20archive/index.html`

## 触发方式

| 方式 | 说明 |
|------|------|
| **Zapier 自动触发** | Airtable 记录更新时自动触发（推荐） |
| **手动触发** | GitHub Actions 页面手动运行 |
| **定时触发** | 每周一、周四 UTC 6:00 自动运行 |
| **Push 触发** | 推送 `template.js`、`reading-tracker-github.js` 等文件时触发 |

## 构建命令

```bash
# 安装依赖
npm install

# 生成当年 HTML（CI 模式）
node reading-tracker-github.js

# 生成指定年份 HTML
node reading-tracker-github.js 2025

# 强制刷新微信读书缓存
node reading-tracker-github.js 2025 --no-cache

# 交互式版本（本地使用）
node reading-tracker-year-github.js
```

## 自定义

### 修改显示的年份

编辑 `reading-tracker-github.js` 中的年份变量：

```javascript
const year = process.argv[2] || String(new Date().getFullYear());
```

### 修改页面样式

编辑 `template.js` 文件

### 修改国家前缀映射

编辑 `reading-tracker-github.js` 中的 `COUNTRY_PREFIX_MAP` 对象

## 常见问题

### Q: 微信读书数据没有显示？

A: 检查以下几点：
1. `WEREAD_API_KEY` 是否正确配置
2. Airtable 书籍标题和作者是否与微信读书匹配
3. 查看构建日志是否有匹配成功的记录

### Q: 如何强制刷新微信读书缓存？

A: 使用 `--no-cache` 参数：
```bash
node reading-tracker-github.js 2025 --no-cache
```

### Q: 本地构建和 CI 构建有什么区别？

A: 
- **CI 构建**：自动部署到 GitHub Pages，更新 `weread-cache.json` 并提交
- **本地构建**：用于测试，不会自动部署，建议先 `git pull` 获取最新缓存

### Q: 归档页面如何工作？

A: `reading archive/index.html` 在浏览器端动态加载所有年度 HTML 文件，提取嵌入的 JSON 数据，计算跨年统计（总本数、总页数、国家分布等）。

## 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitHub Pages 文档](https://docs.github.com/en/pages)
- [Zapier Airtable 集成](https://zapier.com/apps/airtable/integrations)
- [Airtable API 文档](https://support.airtable.com/docs/automation)
