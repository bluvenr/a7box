<p align="center">
  <img src="public/a7box-logo.png" alt="A7Box" width="128" />
</p>

<h1 align="center">A7Box</h1>

<p align="center">
  <strong>Your Tactical Efficiency Weapon on Desktop</strong><br />
  A lightweight, all-in-one developer toolbox built with Tauri 2 + React 19.
</p>

<p align="center">
  <a href="README_zh-CN.md">中文文档</a> · <a href="#features">Features</a> · <a href="#getting-started">Getting Started</a> · <a href="#development">Development</a>
</p>

---

## ✨ Features

17 built-in tools, all accessible via the sidebar, command palette (`Ctrl+K`), or customizable global shortcuts.

| Tool | Description |
|------|-------------|
| **Screenshot** | Region capture with annotation, inline editing, pin preview, and session history |
| **JSON Formatter** | Auto-format, validate, compress, and tree-view JSON data |
| **QR Code** | Generate QR codes from text/URL and decode from images |
| **Markdown Editor** | Live preview, syntax highlighting, KaTeX math, Mermaid diagrams, HTML export |
| **Code Minify / Beautify** | Minify or beautify JS, TS, CSS, HTML, and JSON |
| **Image Compress** | Browser-side image compression with quality/size control |
| **Image Convert** | Convert between PNG, JPG, and WebP formats |
| **Hash Generator** | Generate MD5, SHA-1, SHA-256, SHA-512 hashes |
| **Color Tool** | Screen color picker, format converter, and palette generator |
| **Base64 Tool** | Encode and decode Base64 text and files |
| **Timestamp Converter** | Convert between Unix timestamps and human-readable dates |
| **UUID Generator** | Generate UUID v4, NanoID, and unique identifiers |
| **JWT Decoder** | Decode and inspect JWT token headers and payloads |
| **Regex Tester** | Test regular expressions with live matching and highlights |
| **Text Diff** | Side-by-side text comparison with inline diff highlighting |
| **Web Service** | Instantly serve any local directory over LAN with file upload support |
| **LAN Transfer** | Peer-to-peer file transfer between A7Box devices on the same network |

### Highlights

- **Lightweight & Native** — Built with Tauri, ~10MB installer, minimal memory usage, smooth native performance
- **Instant Access** — Global shortcuts (`Ctrl+Shift+S/C`) and command palette (`Ctrl+K`) to reach any tool in milliseconds
- **Clipboard Quick Actions** — Copy content, press a shortcut, and a floating window pops up ready to process: JSON formatting, code minification, Markdown preview, or QR decoding
- **Full Screenshot Workflow** — Region capture → annotate (pen, rectangle, text, mosaic, blur) → pin to screen → session history with save/delete
- **LAN Collaboration** — Serve any local directory as a website, or transfer files peer-to-peer with other A7Box devices on the same network
- **Configurable** — Customizable global shortcuts, theme support, and per-module enable/disable

## 📊 How It Compares

| Feature | A7Box | DevToys | IT-Tools | He3 | PowerToys |
|---------|:-----:|:-------:|:--------:|:---:|:---------:|
| Desktop app | ✓ | ✓ | ✗ (Web) | ✓ | ✓ |
| Lightweight (<15MB) | ✓ | ✗ | — | ✗ | ✗ |
| Global shortcuts | ✓ | ✗ | ✗ | ✓ | ✓ |
| Clipboard → floating window | ✓ | ✗ | ✗ | ✗ | ✗ |
| Screenshot + annotation | ✓ | ✗ | ✗ | ✗ | ✗ |
| Screenshot pin preview | ✓ | ✗ | ✗ | ✗ | ✗ |
| LAN file transfer | ✓ | ✗ | ✗ | ✗ | ✗ |
| Local web server | ✓ | ✗ | ✗ | ✗ | ✗ |
| Auto update | ✓ | ✓ | — | ✓ | ✓ |
| i18n (EN/ZH) | ✓ | Partial | ✓ | ✓ | ✓ |

## 📥 Download

Pre-built installers for Windows are available on the [Releases](https://github.com/bluvenr/a7box/releases) page. Each version includes:

- `.exe` installer
- `.msi` installer
- Portable `.zip` (if applicable)

The app also supports auto-update — once installed, it will notify you when a new version is available.

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://tauri.app/) |
| Frontend | [React 19](https://react.dev/) + [TypeScript 5.8](https://www.typescriptlang.org/) |
| Build | [Vite 7](https://vitejs.dev/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| State | [Zustand](https://zustand.docs.pmnd.rs/) |
| i18n | [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) |
| Router | [React Router 7](https://reactrouter.com/) |
| Editor | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| Backend | [Rust](https://www.rust-lang.org/) (Tauri core + plugins) |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
git clone https://github.com/bluvenr/a7box.git
cd a7box
npm install
```

## 💻 Development

```bash
# Start dev server (frontend + Rust backend)
npm run tauri:dev

# Or run frontend only
npm run dev
```

The app will open at `http://localhost:1420` (frontend dev server), with the Tauri desktop window launching automatically.

## 📦 Build

```bash
# Build production binary
npm run tauri:build
```

Installers and executables will be output to `src-tauri/target/release/bundle/`.

## 📂 Project Structure

```
src/
├── app/                  # Layouts, pages, router
│   ├── layouts/          # MainLayout, CachedOutlet
│   ├── pages/            # Home, Settings, utility windows
│   └── router.tsx        # Route configuration
├── components/           # Shared UI components (Dialog, Toast, TitleBar, etc.)
├── core/                 # Core systems
│   ├── command-palette/  # Ctrl+K command palette
│   ├── i18n/             # i18next setup
│   ├── registry/         # Module registry
│   ├── settings/         # Settings store (Zustand)
│   ├── shortcuts/        # Global shortcut management
│   ├── theme/            # Theme provider
│   └── updater/          # Auto-update system
├── locales/              # i18n translation files (en-US, zh-CN)
├── modules/              # 17 tool modules (each self-contained)
├── shared/               # Shared hooks, utils, components
└── styles/               # Global CSS

src-tauri/                # Rust backend
├── src/
│   ├── commands/         # Tauri IPC commands
│   ├── screenshot/       # Screenshot capture engine
│   ├── clipboard/        # Clipboard operations
│   ├── http_server/      # LAN web server
│   ├── p2p/              # P2P file transfer
│   ├── tray/             # System tray
│   └── lib.rs            # App setup & event handlers
└── tauri.conf.json       # Tauri configuration
```

## 📄 License

[MIT](LICENSE)
