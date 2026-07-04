<p align="center">
  <img src="public/a7box-logo.png" alt="A7Box" width="128" />
</p>

<h1 align="center">A7Box</h1>

<p align="center">
  <strong>桌面端战术效率武器</strong><br />
  基于 Tauri 2 + React 19 构建的轻量级全功能开发者工具箱。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="#功能">功能</a> · <a href="#快速开始">快速开始</a> · <a href="#开发">开发</a>
</p>

---

## ✨ 功能

内置 17 款工具，支持侧边栏导航、命令面板（`Ctrl+K`）和自定义全局快捷键三种方式快速调用。

| 工具 | 说明 |
|------|------|
| **截图** | 区域截图、标注编辑（画笔/矩形/文字/马赛克/模糊）、置顶预览、截图记录 |
| **JSON 格式化** | 自动格式化、校验、压缩、树形视图 |
| **二维码** | 从文本/URL 生成二维码，从图片解码 |
| **Markdown 编辑器** | 实时预览、语法高亮、KaTeX 数学公式、Mermaid 图表、HTML 导出 |
| **代码压缩/美化** | JS、TS、CSS、HTML、JSON 的压缩与美化 |
| **图片压缩** | 浏览器端图片压缩，支持质量和尺寸控制 |
| **图片转换** | PNG、JPG、WebP 格式互转 |
| **哈希生成** | 生成 MD5、SHA-1、SHA-256、SHA-512 哈希值 |
| **颜色工具** | 屏幕取色器、格式转换、调色板生成 |
| **Base64 工具** | 文本和文件的 Base64 编解码 |
| **时间戳转换** | Unix 时间戳与可读日期互转 |
| **UUID 生成器** | 生成 UUID v4、NanoID 及唯一标识符 |
| **JWT 解码** | 解码并查看 JWT 令牌的 Header 和 Payload |
| **正则测试** | 实时匹配测试正则表达式，高亮匹配结果 |
| **文本对比** | 并排文本比较，行内差异高亮 |
| **Web 服务** | 一键将本地目录变为局域网网站，支持文件上传 |
| **局域网传输** | 同网络 A7Box 设备间的 P2P 文件传输 |

### 亮点特性

- **轻量原生** — 基于 Tauri 构建，安装包 ~10MB，内存占用低，流畅的原生性能
- **即时访问** — 全局快捷键（`Ctrl+Shift+S/C`）和命令面板（`Ctrl+K`），毫秒级触达任意工具
- **剪贴板快捷浮窗** — 复制内容后按下快捷键，JSON 格式化、代码压缩、Markdown 预览、二维码解码等浮窗即刻弹出处理
- **完整截图工作流** — 区域截图 → 标注（画笔/矩形/文字/马赛克/模糊） → 置顶预览 → 截图记录（保存/删除）
- **局域网协作** — 一键将本地目录变为网站分享，或与同网络的其他 A7Box 设备 P2P 传输文件
- **可配置** — 自定义全局快捷键、主题切换、按模块启用/禁用

## 📊 对比

| 功能 | A7Box | DevToys | IT-Tools | He3 | PowerToys |
|------|:-----:|:-------:|:--------:|:---:|:---------:|
| 桌面应用 | ✓ | ✓ | ✗ (Web) | ✓ | ✓ |
| 轻量 (<15MB) | ✓ | ✗ | — | ✗ | ✗ |
| 全局快捷键 | ✓ | ✗ | ✗ | ✓ | ✓ |
| 剪贴板 → 浮窗 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 截图 + 标注 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 截图置顶预览 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 局域网文件传输 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 本地 Web 服务 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 自动更新 | ✓ | ✓ | — | ✓ | ✓ |
| 国际化 (EN/ZH) | ✓ | 部分 | ✓ | ✓ | ✓ |

## 📥 下载

Windows 预构建安装包可在 [Releases](https://github.com/bluvenr/a7box/releases) 页面下载。每个版本提供：

- `.exe` 安装包
- `.msi` 安装包
- 便携 `.zip`（如适用）

应用内置自动更新，安装后新版本发布时会收到升级通知。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri 2](https://tauri.app/) |
| 前端 | [React 19](https://react.dev/) + [TypeScript 5.8](https://www.typescriptlang.org/) |
| 构建 | [Vite 7](https://vitejs.dev/) |
| 样式 | [Tailwind CSS 4](https://tailwindcss.com/) |
| 状态管理 | [Zustand](https://zustand.docs.pmnd.rs/) |
| 国际化 | [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) |
| 路由 | [React Router 7](https://reactrouter.com/) |
| 编辑器 | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| 后端 | [Rust](https://www.rust-lang.org/)（Tauri 核心 + 插件） |

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77
- [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 安装

```bash
git clone https://github.com/bluvenr/a7box.git
cd a7box
npm install
```

## 💻 开发

```bash
# 启动开发服务（前端 + Rust 后端）
npm run tauri:dev

# 或仅启动前端开发服务器
npm run dev
```

前端开发服务器运行在 `http://localhost:1420`，Tauri 桌面窗口会自动启动。

## 📦 构建

```bash
# 构建生产版本
npm run tauri:build
```

安装包和可执行文件将输出到 `src-tauri/target/release/bundle/`。

## 📂 项目结构

```
src/
├── app/                  # 布局、页面、路由
│   ├── layouts/          # MainLayout、CachedOutlet
│   ├── pages/            # 首页、设置、工具窗口
│   └── router.tsx        # 路由配置
├── components/           # 共享 UI 组件（Dialog、Toast、TitleBar 等）
├── core/                 # 核心系统
│   ├── command-palette/  # Ctrl+K 命令面板
│   ├── i18n/             # i18next 国际化配置
│   ├── registry/         # 模块注册中心
│   ├── settings/         # 设置状态管理（Zustand）
│   ├── shortcuts/        # 全局快捷键管理
│   ├── theme/            # 主题系统
│   └── updater/          # 自动更新系统
├── locales/              # 翻译文件（en-US、zh-CN）
├── modules/              # 17 个工具模块（各自独立）
├── shared/               # 共享 hooks、工具函数、组件
└── styles/               # 全局样式

src-tauri/                # Rust 后端
├── src/
│   ├── commands/         # Tauri IPC 命令
│   ├── screenshot/       # 截图捕获引擎
│   ├── clipboard/        # 剪贴板操作
│   ├── http_server/      # 局域网 Web 服务
│   ├── p2p/              # P2P 文件传输
│   ├── tray/             # 系统托盘
│   └── lib.rs            # 应用初始化与事件处理
└── tauri.conf.json       # Tauri 配置
```

## 📄 许可证

[MIT](LICENSE)
