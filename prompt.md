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

- 部署分支: `gh-pages`
- 访问地址: `https://用户名.github.io/reading-tracker/`

## 当前进度

- [x] reading-tracker-github.js 已创建
- [x] deploy.yml 已创建
- [ ] GitHub 仓库已创建并上传代码
- [ ] GitHub Secrets 已配置
- [ ] GitHub Pages 已启用
- [ ] Airtable Automation 已配置
- [ ] 测试完成

## 部署步骤

### 第一步：创建 GitHub 仓库

1. 登录 GitHub，创建新仓库 `reading-tracker`
2. 不要勾选 "Add a README file"（因为我们要推送已有文件）

### 第二步：克隆仓库到本地

在 VSCode 中：
1. `Ctrl+Shift+P` → `Git: Clone`
2. 粘贴仓库 URL
3. 选择本地文件夹（不要选 `reading-tracker-github` 文件夹）
4. 克隆完成后，把 `reading-tracker-github` 文件夹里的所有文件复制到克隆的仓库

### 第三步：推送代码

1. VSCode Source Control 面板会显示所有更改
2. 提交（Commit）并推送（Push）

### 第四步：配置 GitHub Secrets

1. 进入仓库 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. 名称：`AIRTABLE_API_KEY`
4. 值：你的 Airtable API Token（以 `patiYWpgJBIfOkTSP` 开头的那个）

### 第五步：配置 GitHub Pages

1. 进入仓库 **Settings** → **Pages**
2. **Source**: 选择 `gh-pages` 分支
3. **Path**: `/ (root)`
4. 点击 **Save**

### 第六步：配置 Personal Access Token

1. GitHub **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. 点击 **Generate new token**
3. 勾选 **repo** 权限
4. 复制生成的 token

### 第七步：配置 Airtable Automation

1. 打开 Airtable，进入 **Books** 表
2. 点击 **Automations** → **Create automation**
3. 配置：
   - **触发**: When record is created or updated
   - **条件**: Finish Time is not empty
   - **操作**: Send HTTP request
     - URL: `https://api.github.com/repos/你的用户名/reading-tracker/dispatches`
     - Method: POST
     - Headers:
       - `Accept: application/vnd.github+json`
       - `Authorization: Bearer 你的PAT_token`
       - `X-GitHub-Event: push`
     - Body: `{"event_type": "airtable-update"}`

### 第八步：测试

1. 手动触发：GitHub Actions → Deploy Reading Tracker → Run workflow
2. 验证 GitHub Pages 访问正常

## 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitHub Pages 文档](https://docs.github.com/en/pages)
- [Airtable Automation 文档](https://support.airtable.com/docs/automation)
