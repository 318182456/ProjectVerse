# ProjectVerse — Obsidian Virtual Project Space Plugin

[中文](#中文) | [English](#english)

---

## 中文

### 📌 简介
**ProjectVerse** 是一个为 Obsidian 打造的虚拟项目空间管理插件。它可以帮助您通过代码与配置化的方式管理项目，关联散落在库中不同位置的文件 and 文件夹，并为每个项目自动生成精美的控制面板（Dashboard），让 Obsidian 变成您的超级工作台。

---

### 🌟 主要功能
- **虚拟项目空间 (Virtual Project Spaces)**：自由创建、编辑和删除项目空间。每个空间均支持自定义主题颜色、图标，并能够以非侵入式的方式关联现有的文件与文件夹。
- **专属项目浏览器 (Space Explorer)**：提供独立的侧边栏视图，仅展示当前激活的项目空间及其关联的目录树结构，让您专注于当前任务。
- **自动项目控制面板 (Space Dashboard)**：
  - **美观的 Banner 头部**：采用现代化渐变设计与自定义图标。
  - **项目数据统计**：展示关联文件总数、待办任务数、关联规则数等关键指标。
  - **任务扫描器 (Task Scanner)**：自动扫描项目关联文件中的 Markdown 任务列表（`- [ ]`），支持在 Dashboard 中直接点击勾选同步修改源文件。
  - **备忘录区域 (Memo Area)**：记录与项目相关的备忘录和快速便签，支持 Markdown 渲染、图片附件、编辑、删除以及持久化存储。
  - **项目文件树与新建笔记**：在面板中以虚拟树的形式浏览文件，并支持一键在项目目录下快速新建笔记。
- **工作区状态同步 (Workspace Sync)**：切换项目空间时，自动保存并还原上一次打开的标签页（Tabs），无缝衔接工作上下文。

---

### 🚀 安装方法
1. 前往 GitHub Releases 页面下载最新的发布包 `projectVerse-x.y.z.zip`。
2. 解压压缩包，并将解压后的 `main.js`、`manifest.json`、`styles.css` 文件放入您的 Obsidian 库目录中：
   `YourVault/.obsidian/plugins/projectVerse/`
3. 打开 Obsidian，进入 **设置 -> 第三方插件**，启用 **ProjectVerse** 插件。

---

### 🛠️ 开发与构建
如果您想对插件进行二次开发，请执行以下命令：
```bash
# 安装依赖
npm install

# 启动热重载开发模式
npm run dev

# 编译打包生产版本
npm run build
```

---

## English

### 📌 Introduction
**ProjectVerse** is a virtual project space management plugin built for Obsidian. It helps you manage projects through code and configuration, associating folders and files scattered across your vault, and automatically generating beautiful dashboards for each project, transforming Obsidian into your ultimate workspace.

---

### 🌟 Key Features
- **Virtual Project Spaces**: Create, edit, and delete project spaces freely. Each space supports custom theme colors, icons, and non-intrusively links existing files and folders.
- **Dedicated Project Explorer (Space Explorer)**: A dedicated sidebar view showing only the currently active project space and its associated directory tree, keeping you focused on the task at hand.
- **Auto-generated Project Dashboard (Space Dashboard)**:
  - **Stunning Banner Header**: Features a modern gradient header with custom icons.
  - **Project Statistics**: Display key metrics such as total associated files, pending tasks, and association rules.
  - **Task Scanner**: Automatically scans for Markdown checklist items (`- [ ]`) across all associated files. Check/uncheck them directly on the dashboard to update the source files.
  - **Memo Area**: Keep project-specific memos and quick notes. Supports Markdown rendering, image attachments, editing, deletion, and data persistence.
  - **Virtual File Tree & Quick Notes**: Browse project files in a virtual tree and create new notes under the project directory with one click.
- **Workspace State Sync**: Automatically saves and restores open tabs when switching between project spaces, preserving your work context seamlessly.

---

### 🚀 Installation
1. Go to the GitHub Releases page and download the latest release package `projectVerse-x.y.z.zip`.
2. Extract the archive, and place the extracted `main.js`, `manifest.json`, and `styles.css` files into your Obsidian plugin directory:
   `YourVault/.obsidian/plugins/projectVerse/`
3. Open Obsidian, navigate to **Settings -> Community Plugins**, and enable **ProjectVerse**.

---

### 🛠️ Development & Build
To build or customize the plugin locally:
```bash
# Install dependencies
npm install

# Start development mode with hot-reload
npm run dev

# Build for production
npm run build
```
