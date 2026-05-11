# 阅读记录在线系统

将 Airtable 中的阅读记录自动生成 HTML 页面，部署到 GitHub Pages 实现在线访问。

演示地址：

https://nickilism.github.io/reading-tracker/reading%20archive/index.html

## 功能


- 自动同步 Airtable 阅读数据
- 生成美观的阅读记录展示页面
- 支持按年份筛选和统计
- 自动事件触发或定时更新

## 前提条件

- Airtable 账户（Free/Pro/Enterprise 均可）
- GitHub 账户
- Zapier 账户（用于连接 Airtable 和 GitHub）

## 技术架构

- **数据源**: Airtable Books 表
- **生成工具**: Node.js 脚本
- **托管平台**: GitHub Pages
- **自动化**: GitHub Actions + Zapier

## 核心文件

| 文件 | 说明 |
|------|------|
| `reading-tracker-github.js` | 主脚本，从 Airtable 获取数据生成 HTML |
| `template.js` | HTML 模板文件 |
| `.github/workflows/deploy.yml` | GitHub Actions 工作流 |

## Airtable 表结构要求

你的 Airtable Books 表需要包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| Title | 文本 | 书名 |
| Author | 文本 | 作者 |
| Start Time | 日期 | 开始阅读时间 |
| Finish Time | 日期 | 完成阅读时间 |
| My Rating | 数字 | 评分（1-10） |
| Pages | 数字 | 页数 |
| Douban Link | URL | 豆瓣链接 |
| Douban Cover Link | URL | 封面图链接（推荐 neodb.social） |
| Review | 文本 | 书评 |

**"已读"判断标准**：Finish Time 字段不为空

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

编辑 `reading-tracker-github.js` 第37行：

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
3. 名称：`AIRTABLE_API_KEY`
4. 值：你的 Airtable API Token

获取 Airtable API Token：
1. 登录 [Airtable](https://airtable.com)
2. 点击右上角头像 → **Developer hub**
3. 点击 **Create new token**
4. 勾选 `data.records:read` 权限
5. 复制生成的 token

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

## 自定义

### 修改显示的年份

编辑 `reading-tracker-github.js` 第155行：

```javascript
const year = process.argv[2] || String(new Date().getFullYear());
```

### 修改页面样式

编辑 `template.js` 文件

### 修改国家前缀映射

编辑 `reading-tracker-github.js` 中的 `COUNTRY_PREFIX_MAP` 对象

## 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitHub Pages 文档](https://docs.github.com/en/pages)
- [Zapier Airtable 集成](https://zapier.com/apps/airtable/integrations)
- [Airtable API 文档](https://support.airtable.com/docs/automation)
