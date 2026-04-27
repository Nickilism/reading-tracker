# 在线阅读记录系统 - 详细实施步骤

## Context

用户希望将阅读记录部署到 GitHub Pages，支持：
- 在线访问（电脑、手机）
- Airtable 更新时自动同步（事件驱动）
- 手动触发作为备份
- API Token 安全存储

---

## 第一阶段：整理项目文件到文件夹

**目标**：将需要的文件复制到 `D:\OneDrive\各种备份\Projects\reading-tracker-github\` 文件夹

需要复制的文件：
| 源文件 | 目标位置 |
|-------|---------|
| `reading-tracker-github.js` | 根目录 |
| `template.js` | 根目录 |
| `.github/workflows/deploy.yml` | `.github/workflows/` |

同时创建 `prompt.md` 项目说明文件，供其他 Claude Code session 参考。

---

## 第二阶段：GitHub 仓库设置（用户手动完成）

### 第一步：创建 reading-tracker-github.js

**文件**: `reading-tracker-github.js`（新建）

复制 `reading-tracker.js` 的内容，修改最后一行：

```javascript
// 原来
main().catch(console.error);

// 改为（支持年份参数，默认 2026）
async function main() {
  const year = process.argv[2] || new Date().getFullYear();
  // ... 其余逻辑保持不变
}
```

核心区别：
- API Key 从 `process.env.AIRTABLE_API_KEY` 读取
- 支持命令行参数指定年份：`node reading-tracker-github.js 2026`
- 默认使用当前年份

---

### 第二步：创建 GitHub 仓库

1. 登录 GitHub，点击右上角 **+** → **New repository**
2. 填写仓库名：`reading-tracker`（或喜欢的名字）
3. 选择 **Private** 或 **Public**（公开则所有人都能看）
4. 点击 **Create repository**

---

### 第三步：上传代码文件到仓库

需要上传的文件：
- `reading-tracker-github.js`
- `template.js`
- `builder_offline.js`（可选）

**注意**：先不要上传以下文件：
- `*_reading_tracker.html`（这些是生成的结果，不需要）
- 任何包含实际 token 的配置

---

### 第四步：配置 GitHub Secrets

1. 进入仓库 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. 名称：`AIRTABLE_API_KEY`
4. 值：粘贴你的 Airtable API Token
5. 点击 **Add secret**

---

### 第五步：创建 GitHub Actions Workflow

创建文件：`.github/workflows/deploy.yml`

```yaml
name: Deploy Reading Tracker

on:
  # 方式1: Airtable Automation 触发
  repository_dispatch:
    types: [airtable-update]

  # 方式2: 手动触发
  workflow_dispatch:

  # 方式3: 定时备份（每天 UTC 6:00 = 北京时间 14:00）
  schedule:
    - cron: '0 6 * * *'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate Reading Tracker
        env:
          AIRTABLE_API_KEY: ${{ secrets.AIRTABLE_API_KEY }}
        run: node reading-tracker-github.js

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
          publish_branch: gh-pages
```

---

### 第六步：配置 GitHub Pages

1. 进入仓库 **Settings** → **Pages**
2. **Source**: 选择 `gh-pages` 分支
3. **Path**: `/ (root)`
4. 点击 **Save**

等待 1-2 分钟，页面会发布到：`https://你的用户名.github.io/reading-tracker/`

---

## prompt.md 项目说明文件内容

这个文件需要创建在项目根目录，供其他 Claude Code session 了解项目背景和当前进度：

```markdown
# 阅读记录在线系统

## 项目背景

本项目用于将 Airtable 中的阅读记录生成 HTML 页面，并部署到 GitHub Pages 实现在线访问。

## 技术架构

- **数据源**: Airtable Books 表（Base ID: appJJmTgbDFTEnJxz）
- **生成工具**: reading-tracker-github.js（Node.js）
- **托管平台**: GitHub Pages
- **自动化**: GitHub Actions

## 核心文件

- `reading-tracker-github.js` - 主生成脚本，从 Airtable 获取数据生成 HTML
- `template.js` - HTML 模板
- `.github/workflows/deploy.yml` - GitHub Actions 工作流

## 触发机制

1. **事件驱动**（主要）: Airtable Automation 发送 webhook 到 GitHub Actions
2. **手动触发**: GitHub Actions 页面手动运行
3. **定时备份**: 每天 UTC 6:00 自动运行

## 环境变量

- `AIRTABLE_API_KEY` - 存储在 GitHub Secrets 中

## GitHub Pages

部署分支: `gh-pages`
访问地址: `https://用户名.github.io/reading-tracker/`

## 当前进度

- [x] reading-tracker-github.js 已创建
- [x] deploy.yml 已创建
- [ ] GitHub 仓库已创建并上传代码
- [ ] GitHub Secrets 已配置
- [ ] GitHub Pages 已启用
- [ ] Airtable Automation 已配置
- [ ] 测试完成

## 部署步骤

详见: https://github.com/你的用户名/reading-tracker（仓库创建后补充链接）
```

---

## 验证清单

- [x] reading-tracker-github.js 已创建
- [ ] 项目文件夹已整理
- [ ] prompt.md 已创建
- [ ] 代码已上传到 GitHub 仓库
- [ ] GitHub Secret AIRTABLE_API_KEY 已配置
- [ ] GitHub Actions workflow 已创建
- [ ] GitHub Pages 已启用
- [ ] Personal Access Token 已生成
- [ ] Airtable Automation 已配置
- [ ] 手动触发测试成功
- [ ] Airtable 触发测试成功
- [ ] 页面访问正常

---

### 第七步：配置 Airtable Automation（事件驱动）

1. 打开 Airtable，进入你的 **Books** 表
2. 点击右上角 **Automations**
3. 创建新自动化：
   - **触发**：当记录被创建或更新时
   - **条件**：监控 `Finish Time` 字段不为空
   - **操作**：发送 HTTP 请求

4. HTTP 请求配置：
   - **URL**：`https://api.github.com/repos/你的用户名/reading-tracker/dispatches`
   - **Method**：POST
   - **Headers**：
     - `Accept: application/vnd.github+json`
     - `Authorization: Bearer 你的GitHub_Personal_Access_Token`
     - `X-GitHub-Event: push`
   - **Body**：
     ```json
     {
       "event_type": "airtable-update"
     }
     ```

---

### 第八步：生成 Personal Access Token（用于 Airtable 触发）

1. GitHub 右上角头像 → **Settings**
2. 左侧底部 **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. 点击 **Generate new token**
4. 勾选 **repo** 权限（完整仓库访问）
5. 生成后复制 token，添加到 Airtable Automation 的 Authorization header 中

---

### 第九步：测试

**手动触发测试**：
1. 进入仓库 **Actions** 页面
2. 选择 "Deploy Reading Tracker"
3. 点击 **Run workflow** → **Run workflow**
4. 等待执行完成，检查 Pages 站点是否更新

**Airtable 触发测试**：
1. 在 Airtable 中添加或修改一条记录的 Finish Time
2. 检查 GitHub Actions 是否有新的运行记录
3. 检查页面是否更新

---

## 关键文件清单

| 文件 | 操作 | 说明 |
|-----|-----|-----|
| `reading-tracker-github.js` | 已创建 | GitHub Actions 版本，支持环境变量 |
| `template.js` | 已存在 | 模板文件 |
| `.github/workflows/deploy.yml` | 已创建 | Actions 工作流 |
| `prompt.md` | 新建 | 项目说明，供其他 Claude Code session 参考 |
| `README.md` | 新建（可选） | 项目说明 |

---

## 验证清单

- [ ] reading-tracker-github.js 已创建
- [ ] 代码已上传到 GitHub 仓库
- [ ] GitHub Secret AIRTABLE_API_KEY 已配置
- [ ] GitHub Actions workflow 已创建
- [ ] GitHub Pages 已启用
- [ ] Personal Access Token 已生成
- [ ] Airtable Automation 已配置
- [ ] 手动触发测试成功
- [ ] Airtable 触发测试成功
- [ ] 页面访问正常
