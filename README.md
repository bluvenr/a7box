<p align="center">
  <img src="public/a7box-logo.png" alt="A7Box" width="128" />
</p>

<h1 align="center">A7Box</h1>

<p align="center">
  <strong>Your Tactical Efficiency Weapon on Desktop</strong><br />
  A modern, open-source, lightweight, all-in-one, 100% local developer toolbox for Windows, macOS, and Linux. Built with Tauri 2 + React 19.
</p>

<p align="center">
  <a href="README_zh-CN.md">中文文档</a> · <a href="#features">Features</a> · <a href="#download">Download</a> · <a href="#getting-started">Getting Started</a>
</p>

---

## ✨ Features

17 built-in tools, all accessible via the sidebar, command palette (`Ctrl+K`), or customizable global shortcuts.

**Developer Essentials**

| Tool | Description |
|------|-------------|
| **JSON Formatter** | Auto-format, validate, compress, and tree-view JSON data |
| **Code Minify / Beautify** | Minify or beautify JS, TS, CSS, HTML, and JSON |
| **Regex Tester** | Test regular expressions with live matching and highlights |
| **Text Diff** | Side-by-side text comparison with inline diff highlighting |

**Text & Encoding**

| Tool | Description |
|------|-------------|
| **Base64 Tool** | Encode and decode Base64 text and files |
| **Hash Generator** | Generate MD5, SHA-1, SHA-256, SHA-512 hashes |
| **JWT Decoder** | Decode and inspect JWT token headers and payloads |
| **UUID Generator** | Generate UUID v4, NanoID, and unique identifiers |
| **Timestamp Converter** | Convert between Unix timestamps and human-readable dates |

**Design & Media**

| Tool | Description |
|------|-------------|
| **Screenshot** | Region capture with annotation, inline editing, pin preview, and session history |
| **Color Tool** | Screen color picker, format converter, and palette generator |
| **Image Compress** | Browser-side image compression with quality/size control |
| **Image Convert** | Convert between PNG, JPG, and WebP formats |
| **QR Code** | Generate QR codes from text/URL and decode from images |

**Content & Documents**

| Tool | Description |
|------|-------------|
| **Markdown Editor** | Live preview, syntax highlighting, KaTeX math, Mermaid diagrams, HTML export |

**Network**

| Tool | Description |
|------|-------------|
| **Web Service** | Instantly serve any local directory over LAN with file upload support |
| **LAN Transfer** | Peer-to-peer file transfer between A7Box devices on the same network |

### Highlights

- **Cross-Platform** — Native support for Windows, macOS, and Linux with a single codebase
- **Lightweight & Native** — Built with Tauri, ~10MB installer, minimal memory usage, smooth native performance
- **Spotlight Command Palette** — Fuzzy search, category filtering, keyboard navigation, and recently used history for instant tool access
- **Clipboard Quick Actions** — Copy content, press a shortcut, and a floating window pops up ready to process: JSON formatting, code minification, Markdown preview, or QR decoding
- **Full Screenshot Workflow** — Region capture → 5 annotation tools (pen, rectangle, text, mosaic, blur) → pin to screen → session history with save/delete
- **Pixel-Level Color Picker** — Full-screen transparent overlay with magnifier for precise color sampling anywhere on screen
- **LAN Collaboration** — Serve any local directory as a website, or transfer files peer-to-peer with other A7Box devices on the same network
- **System Integration** — System tray with quick toggle, right-click context menu for instant actions (Windows), and auto-start on boot
- **Highly Customizable** — Custom global shortcuts, drag-to-reorder modules, dark/light/system theme, font size control, and cache management

## 📥 Download

Pre-built installers for **Windows**, **macOS**, and **Linux** are available on the [Releases](https://github.com/bluvenr/a7box/releases) page. Each version includes:

| Platform | Formats |
|----------|---------|
| Windows | `.exe` installer, `.msi` installer, portable `.zip` |
| macOS | `.dmg` (Universal / Intel / Apple Silicon) |
| Linux | `.AppImage`, `.deb` |

The app also supports auto-update — once installed, it will notify you when a new version is available.

### macOS Users: "App is damaged" Warning

Since A7Box is not currently signed with an Apple Developer certificate, macOS Gatekeeper may show a warning like **"A7Box is damaged and can't be opened"** or **"cannot be opened because the developer cannot be verified"** when you first launch it.

**Fix (Option 1 — Terminal, recommended):**

Open Terminal and run:

```bash
xattr -cr /Applications/A7Box.app
```

This removes the macOS quarantine flag. You only need to do this once after installing or updating.

**Fix (Option 2 — System Settings):**

1. Try to open A7Box — the warning will appear
2. Open **System Settings → Privacy & Security**
3. Scroll down and click **Open Anyway** next to A7Box
4. Enter your password when prompted

> **Why does this happen?** macOS requires apps distributed outside the App Store to be code-signed and notarized by Apple. A7Box is an open-source project and does not yet have an Apple Developer certificate ($99/year). The app is safe — it is 100% local, open-source, and auditable. You can verify the source code on GitHub.

## 🎯 The Name

The name **A7** is no coincidence.

Take one of the most recognizable engineering icons in history — the AK-47. Extract its first letter **A** and its last digit **7**. You get **A7**.

We chose this deliberately — not for what it represents as a weapon, but for what it stands for as a piece of engineering:

- **Reliability** — Built to work, every time, without fail.
- **Simplicity** — No unnecessary complexity. Pick it up and it just works.
- **Efficiency** — Maximum output with minimum overhead.

A7Box carries this philosophy into the developer toolbox space: lightweight, no bloat, no compromises. A desktop app that launches instantly, runs quietly, and delivers exactly what you need — the moment you need it.

The **"Box"** completes the picture: one container, a full arsenal of tools. From JSON formatting to screenshots, from file compression to LAN transfer — everything a developer reaches for daily, unified in a single, fast application.

That's why our slogan reads: *Your Tactical Efficiency Weapon on Desktop.*

## 📊 How It Compares

| Feature | A7Box | DevToys | IT-Tools | He3 | PowerToys | uTools |
|---------|:-----:|:-------:|:--------:|:---:|:---------:|:------:|
| Cross-platform (Win/Mac/Linux) | ✓ | ✓ | — | ✓ (Win/Mac) | ✗ (Win) | ✓ (Win/Mac) |
| Clipboard → floating window | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Screenshot workflow (capture + annotate + pin) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Screen color picker | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Spotlight command palette | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| LAN file transfer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Local web server | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lightweight (<15MB) | ✓ | ✗ | — | ✗ | ✗ | ✗ |
| Global shortcuts | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Works offline | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Desktop app | ✓ | ✓ | ✗ (Web) | ✓ | ✓ | ✓ |
| Auto update | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| i18n (EN/ZH) | ✓ | Partial | ✓ | ✓ | ✓ | ✓ |

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
