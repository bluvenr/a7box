/* ═══════════════════════════════════════════
   A7Box Website — i18n, Data & Interactions
   ═══════════════════════════════════════════ */

// ════════════════════════════════════════
// i18n Translations
// ════════════════════════════════════════

const I18N = {
  en: {
    // Meta
    'page.title': 'A7Box — Your Tactical Efficiency Weapon on Desktop',
    'page.description': 'A 100% local, cross-platform developer toolbox — 20 built-in tools. ~10MB, no cloud. Built with Tauri 2 + React 19.',

    // Nav
    'nav.features': 'Features',
    'nav.tools': 'Tools',
    'nav.compare': 'Compare',
    'nav.story': 'Story',
    'nav.download': 'Download',

    // Hero
    'hero.badge': 'Open Source (MIT)',
    'hero.title1': 'Your Tactical',
    'hero.title2': 'Efficiency Weapon',
    'hero.title3': 'on Desktop',
    'hero.subtitle': 'An all-in-one developer toolbox that runs <strong>100% locally</strong> — 20 built-in tools in a ~10MB app. No cloud. No tracking. No account required.',
    'hero.download': 'Download Now',
    'hero.github': 'View on GitHub',
    'hero.available': 'Available for:',
    'hero.win': 'Windows',
    'hero.mac': 'macOS',

    // Privacy Pledge
    'pledge.title': 'Privacy First — By Design, Not by Policy',
    'pledge.text': 'A7Box is <strong>100% local</strong>. Every tool — JSON formatting, screenshot capture, hash generation, file compression — runs entirely on your machine. <strong>No data ever leaves your computer.</strong> No network requests. No telemetry. No account required.',
    'pledge.b1': 'Zero Network Requests',
    'pledge.b2': 'Zero Telemetry',
    'pledge.b3': 'Zero Account Required',
    'pledge.b4': 'Open Source & Auditable',
    'pledge.quote': '"In an era where every app wants your data, A7Box respects a simple principle: <strong>your tools should work for you, not against you.</strong>"',

    // Features
    'features.tag': 'Core Highlights',
    'features.title': 'Built Different',
    'features.desc': 'Every feature is designed with one goal: maximum output with minimum overhead.',
    'features.f1.title': 'Cross-Platform',
    'features.f1.desc': 'Native support for Windows, macOS, and Linux from a single Tauri 2 codebase. One app, three platforms.',
    'features.f2.title': '100% Local & Offline',
    'features.f2.desc': 'All processing on your machine. No internet required. No data ever leaves. Works in airplane mode.',
    'features.f3.title': 'Featherweight ~10MB',
    'features.f3.desc': 'Tauri + Rust backend — not Electron. ~10MB installer, minimal memory footprint, instant startup.',
    'features.f4.title': 'Spotlight Command Palette',
    'features.f4.desc': 'Fuzzy search, category filtering, keyboard navigation. Hit Ctrl+K — any tool, milliseconds away.',
    'features.f5.title': 'Clipboard Quick Actions',
    'features.f5.desc': 'Copy content, press a shortcut, floating window pops up to process — JSON, code, Markdown, QR.',
    'features.f6.title': 'Full Screenshot Workflow',
    'features.f6.desc': 'Capture → annotate (pen/rect/text/mosaic/blur) → pin to screen → session history. All in one flow.',
    'features.f7.title': 'Pixel-Level Color Picker',
    'features.f7.desc': 'Full-screen transparent overlay with real-time magnifier for precise pixel-level color sampling.',
    'features.f8.title': 'LAN Collaboration',
    'features.f8.desc': 'Serve any directory as a website over LAN. P2P transfer files with other A7Box devices on the same network.',
    'features.f9.title': 'Highly Customizable',
    'features.f9.desc': 'Custom shortcuts, drag-to-reorder modules, dark/light/system theme, i18n (English / Chinese).',

    // Tools
    'tools.tag': 'Toolbox',
    'tools.title': '20 Tools, One Box',
    'tools.desc': 'Accessible via sidebar, command palette (Ctrl+K), or global shortcuts.',

    // Comparison
    'compare.tag': 'Comparison',
    'compare.title': 'How It Compares',
    'compare.desc': 'See how A7Box stacks up against popular developer toolboxes.',
    'compare.feature': 'Feature',

    // Story
    'story.tag': 'The Story Behind A7',
    'story.title': 'Engineering, Not Armament',
    'story.p1': 'The name <strong>A7</strong> is deliberate. Take one of the most iconic engineering symbols in history — the AK-47. Extract its first letter <strong>A</strong> and its last digit <strong>7</strong>. You get <strong>A7</strong>.',
    'story.p2': 'Not for what it represents as a weapon, but for what it stands for as engineering: <strong>reliability, simplicity, and efficiency</strong>. Maximum output with minimum overhead.',
    'story.p3': 'The <strong>"Box"</strong> completes the picture: one container, a full arsenal of tools. From JSON formatting to screenshots, from file compression to LAN transfer — everything a developer reaches for daily, unified in a single ~10MB application.',
    'story.slogan': 'That\'s why our slogan reads: <em>Your Tactical Efficiency Weapon on Desktop.</em>',
    'story.v1': 'Reliability',
    'story.v2': 'Simplicity',
    'story.v3': 'Efficiency',

    // Tech Stack
    'tech.tag': 'Under the Hood',
    'tech.title': 'Tech Stack',
    'tech.framework': 'Framework',
    'tech.frontend': 'Frontend',
    'tech.backend': 'Backend',
    'tech.build': 'Build',
    'tech.types': 'Type Safety',
    'tech.styling': 'Styling',
    'tech.state': 'State',
    'tech.editor': 'Editor',

    // Download
    'download.title': 'Ready to Deploy?',
    'download.desc': 'Download A7Box — 20 tools, ~10MB, no cloud, no account. Just install and use.',
    'download.win': 'Download for Windows',
    'download.mac': 'Download for macOS',
    'download.linux': 'Download for Linux',
    'download.fmtWin': 'Windows: .exe / .msi / .zip',
    'download.fmtMac': 'macOS: .dmg (Universal)',
    'download.fmtLinux': 'Linux: .AppImage / .deb',
    'download.note': 'Auto-update supported — get notified when new versions are available.',

    // Footer
    'footer.releases': 'Releases',
    'footer.issues': 'Issues',
    'footer.license': 'Open source under MIT License.',
    'a11y.skip': 'Skip to content',
    'proof.stars': 'Stars on GitHub',
    'proof.openSource': 'Free & Open Source',
    'proof.private': '100% Private',
  },

  zh: {
    // Meta
    'page.title': 'A7Box — 桌面端战术效率武器',
    'page.description': '100% 本地运行的跨平台开发者工具箱，内置 20 款工具，~10MB 安装包，无云端依赖。基于 Tauri 2 + React 19 构建。',

    // Nav
    'nav.features': '特性',
    'nav.tools': '工具箱',
    'nav.compare': '对比',
    'nav.story': '故事',
    'nav.download': '下载',

    // Hero
    'hero.badge': '开源（MIT）',
    'hero.title1': '你的桌面端战术',
    'hero.title2': '效率武器',
    'hero.title3': '即刻就绪',
    'hero.subtitle': '一款 <strong>100% 本地运行</strong> 的全功能开发者工具箱 —— 20 款内置工具，~10MB 安装包。不联网、不追踪、不需要账号。',
    'hero.download': '立即下载',
    'hero.github': '在 GitHub 查看',
    'hero.available': '支持平台：',
    'hero.win': 'Windows',
    'hero.mac': 'macOS',

    // Privacy Pledge
    'pledge.title': '隐私至上 —— 源于设计，而非声明',
    'pledge.text': 'A7Box 是 <strong>100% 本地运行</strong> 的应用。每一款工具 —— JSON 格式化、截图、哈希生成、图片压缩 —— 全部在你的机器上执行。<strong>数据永远不会离开你的电脑。</strong>没有网络请求、没有遥测追踪、不需要注册账号。',
    'pledge.b1': '零网络请求',
    'pledge.b2': '零遥测追踪',
    'pledge.b3': '零账号要求',
    'pledge.b4': '开源可审计',
    'pledge.quote': '"在一个每个应用都想获取你数据的时代，A7Box 坚守一个简单的原则：<strong>工具应该为你服务，而不是盯着你。</strong>"',

    // Features
    'features.tag': '核心亮点',
    'features.title': '与众不同',
    'features.desc': '每一项功能都围绕同一个目标设计：最小开销，最大产出。',
    'features.f1.title': '跨平台',
    'features.f1.desc': '一套 Tauri 2 代码，原生支持 Windows、macOS、Linux。一个应用，三个平台。',
    'features.f2.title': '100% 本地离线',
    'features.f2.desc': '所有处理在你的机器上完成，无需联网，数据不出本机，飞行模式也能用。',
    'features.f3.title': '极致轻量 ~10MB',
    'features.f3.desc': 'Tauri + Rust 后端 —— 不是 Electron。~10MB 安装包，极低内存占用，秒级启动。',
    'features.f4.title': 'Spotlight 命令面板',
    'features.f4.desc': '模糊搜索、分类过滤、键盘导航。按下 Ctrl+K，任意工具毫秒级触达。',
    'features.f5.title': '剪贴板快捷浮窗',
    'features.f5.desc': '复制内容 → 按快捷键 → 浮窗即刻弹出处理 —— JSON、代码、Markdown、二维码。',
    'features.f6.title': '完整截图工作流',
    'features.f6.desc': '截图 → 标注（画笔/矩形/文字/马赛克/模糊） → 置顶预览 → 历史记录，一站式完成。',
    'features.f7.title': '像素级取色器',
    'features.f7.desc': '全屏透明遮罩 + 实时放大镜，精准拾取屏幕任意像素点颜色。',
    'features.f8.title': '局域网协作',
    'features.f8.desc': '一键将本地目录变为网站，或与同网络其他 A7Box 设备 P2P 传输文件。',
    'features.f9.title': '高度可定制',
    'features.f9.desc': '自定义快捷键、拖拽排序模块、深色/浅色/跟随系统主题、中英双语。',

    // Tools
    'tools.tag': '工具箱',
    'tools.title': '20 款工具，一个盒子',
    'tools.desc': '支持侧边栏、命令面板（Ctrl+K）和自定义全局快捷键三种方式调用。',

    // Comparison
    'compare.tag': '产品对比',
    'compare.title': '与同类产品对比',
    'compare.desc': '看看 A7Box 与主流开发者工具箱相比表现如何。',
    'compare.feature': '功能',

    // Story
    'story.tag': 'A7 名字由来',
    'story.title': '工程精神，而非武器',
    'story.p1': '<strong>A7</strong> 这个名字，不是随意取的。取工业史上最具辨识度的工程符号 —— AK-47。提取它的首字母 <strong>A</strong> 与末位数字 <strong>7</strong>，得到 <strong>A7</strong>。',
    'story.p2': '不是在致敬武器本身，而是在提取它所代表的工程精神：<strong>可靠、简洁、高效</strong>。最小开销，最大产出。',
    'story.p3': '<strong>"Box"</strong> 则补全了这幅图景：一个容器，一整套武器库。从 JSON 格式化到截图，从图片压缩到局域网传输 —— 开发者日常所需的一切，统一收纳进一个 ~10MB 的应用。',
    'story.slogan': '这就是我们 Slogan 的由来：<em>桌面端战术效率武器。</em>',
    'story.v1': '可靠',
    'story.v2': '简洁',
    'story.v3': '高效',

    // Tech Stack
    'tech.tag': '技术架构',
    'tech.title': '技术栈',
    'tech.framework': '框架',
    'tech.frontend': '前端',
    'tech.backend': '后端',
    'tech.build': '构建',
    'tech.types': '类型安全',
    'tech.styling': '样式',
    'tech.state': '状态管理',
    'tech.editor': '编辑器',

    // Download
    'download.title': '准备好了吗？',
    'download.desc': '下载 A7Box —— 20 款工具，~10MB，无云端，无账号。安装即用。',
    'download.win': '下载 Windows 版',
    'download.mac': '下载 macOS 版',
    'download.linux': '下载 Linux 版',
    'download.fmtWin': 'Windows：.exe / .msi / .zip',
    'download.fmtMac': 'macOS：.dmg（通用版）',
    'download.fmtLinux': 'Linux：.AppImage / .deb',
    'download.note': '支持自动更新 —— 新版本发布时会收到升级通知。',

    // Footer
    'footer.releases': '发布记录',
    'footer.issues': '问题反馈',
    'footer.license': '基于 MIT 许可证开源。',
    'a11y.skip': '跳转到内容',
    'proof.stars': 'GitHub Stars',
    'proof.openSource': '免费开源',
    'proof.private': '100% 隐私',
  },
};

// ════════════════════════════════════════
// Tool Icons (unified SVG, stroke-based, 24×24)
// ════════════════════════════════════════

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const TOOL_ICONS = {
  json: `<svg viewBox="0 0 24 24" ${S}><path d="M8 3H6a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h2"/><path d="M16 3h2a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2h-2"/></svg>`,

  code: `<svg viewBox="0 0 24 24" ${S}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

  regex: `<svg viewBox="0 0 24 24" ${S}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>`,

  diff: `<svg viewBox="0 0 24 24" ${S}><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/><path d="M6 9v6"/><path d="M3 12h6"/><path d="M18 9v6"/></svg>`,

  base64: `<svg viewBox="0 0 24 24" ${S}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,

  hash: `<svg viewBox="0 0 24 24" ${S}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,

  jwt: `<svg viewBox="0 0 24 24" ${S}><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,

  uuid: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`,

  timestamp: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>`,

  screenshot: `<svg viewBox="0 0 24 24" ${S}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>`,

  color: `<svg viewBox="0 0 24 24" ${S}><path d="m19 11-8 8-7-7 8-8z"/><path d="m5 14-2 2 4 4 2-2"/><path d="m17 3 4 4"/></svg>`,

  imgcompress: `<svg viewBox="0 0 24 24" ${S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 3 3 3-3"/><path d="M12 18v-4"/></svg>`,

  imgconvert: `<svg viewBox="0 0 24 24" ${S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h4"/><path d="m12 10 2 2-2 2"/></svg>`,

  watermark: `<svg viewBox="0 0 24 24" ${S}><path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/></svg>`,

  qrcode: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3"/><path d="M14 20h3"/><path d="M20 20h1"/></svg>`,

  markdown: `<svg viewBox="0 0 24 24" ${S}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8v8l3-3 3 3V8"/><path d="m17 12-2 2 2 2"/></svg>`,

  reminder: `<svg viewBox="0 0 24 24" ${S}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,

  timer: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M12 5V3"/><path d="M10 2h4"/></svg>`,

  webservice: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,

  lantransfer: `<svg viewBox="0 0 24 24" ${S}><rect x="2" y="3" width="7" height="6" rx="1"/><rect x="15" y="15" width="7" height="6" rx="1"/><path d="M9 6h4a2 2 0 0 1 2 2v4"/><path d="m13 10 2 2-2 2"/><path d="M15 18h-4a2 2 0 0 1-2-2v-4"/><path d="m11 14-2-2 2-2"/></svg>`,
};

// ════════════════════════════════════════
// Tool Data (i18n-aware)
// ════════════════════════════════════════

const TOOLS_I18N = {
  en: [
    { category: 'Developer Essentials', tools: [
      { icon: 'json', name: 'JSON Formatter', desc: 'Format, validate, compress & tree-view' },
      { icon: 'code', name: 'Code Minify / Beautify', desc: 'JS, TS, CSS, HTML, JSON' },
      { icon: 'regex', name: 'Regex Tester', desc: 'Live matching with highlights' },
      { icon: 'diff', name: 'Text Diff', desc: 'Side-by-side comparison with diff' },
    ]},
    { category: 'Text & Encoding', tools: [
      { icon: 'base64', name: 'Base64 Tool', desc: 'Encode and decode text & files' },
      { icon: 'hash', name: 'Hash Generator', desc: 'MD5, SHA-1, SHA-256, SHA-512' },
      { icon: 'jwt', name: 'JWT Decoder', desc: 'Inspect headers and payloads' },
      { icon: 'uuid', name: 'UUID Generator', desc: 'UUID v4, NanoID, unique IDs' },
      { icon: 'timestamp', name: 'Timestamp Converter', desc: 'Unix ↔ human-readable dates' },
    ]},
    { category: 'Design & Media', tools: [
      { icon: 'screenshot', name: 'Screenshot', desc: 'Capture → annotate → pin → history' },
      { icon: 'color', name: 'Color Tool', desc: 'Picker, converter, palette generator' },
      { icon: 'imgcompress', name: 'Image Compress', desc: 'Browser-side with quality control' },
      { icon: 'imgconvert', name: 'Image Convert', desc: 'PNG ↔ JPG ↔ WebP ↔ ICO' },
      { icon: 'watermark', name: 'Image Watermark', desc: 'Text / logo / timestamp, tiling & batch' },
      { icon: 'qrcode', name: 'QR Code', desc: 'Generate from text/URL, decode' },
    ]},
    { category: 'Content & Documents', tools: [
      { icon: 'markdown', name: 'Markdown Editor', desc: 'Live preview, KaTeX, Mermaid, HTML export' },
    ]},
    { category: 'Productivity', tools: [
      { icon: 'reminder', name: 'Reminder', desc: 'Natural language, scheduled notifications' },
      { icon: 'timer', name: 'Timer', desc: 'Countdown & stopwatch with desktop widgets' },
    ]},
    { category: 'Network', tools: [
      { icon: 'webservice', name: 'Web Service', desc: 'Serve any directory over LAN' },
      { icon: 'lantransfer', name: 'LAN Transfer', desc: 'P2P file transfer between devices' },
    ]},
  ],
  zh: [
    { category: '开发必备', tools: [
      { icon: 'json', name: 'JSON 格式化', desc: '格式化、校验、压缩、树形视图' },
      { icon: 'code', name: '代码压缩/美化', desc: 'JS、TS、CSS、HTML、JSON' },
      { icon: 'regex', name: '正则测试', desc: '实时匹配，高亮结果' },
      { icon: 'diff', name: '文本对比', desc: '并排比较，行内差异高亮' },
    ]},
    { category: '文本与编码', tools: [
      { icon: 'base64', name: 'Base64 工具', desc: '文本和文件的编解码' },
      { icon: 'hash', name: '哈希生成', desc: 'MD5、SHA-1、SHA-256、SHA-512' },
      { icon: 'jwt', name: 'JWT 解码', desc: '查看 Header 和 Payload' },
      { icon: 'uuid', name: 'UUID 生成器', desc: 'UUID v4、NanoID、唯一标识' },
      { icon: 'timestamp', name: '时间戳转换', desc: 'Unix 时间戳 ↔ 可读日期' },
    ]},
    { category: '设计与图像', tools: [
      { icon: 'screenshot', name: '截图', desc: '截图 → 标注 → 置顶预览 → 历史记录' },
      { icon: 'color', name: '颜色工具', desc: '屏幕取色、格式转换、调色板' },
      { icon: 'imgcompress', name: '图片压缩', desc: '浏览器端压缩，质量/尺寸控制' },
      { icon: 'imgconvert', name: '图片转换', desc: 'PNG ↔ JPG ↔ WebP ↔ ICO' },
      { icon: 'watermark', name: '图片水印', desc: '文字/Logo/时间戳，平铺与批量导出' },
      { icon: 'qrcode', name: '二维码', desc: '文本/URL 生成，图片解码' },
    ]},
    { category: '内容与文档', tools: [
      { icon: 'markdown', name: 'Markdown 编辑器', desc: '实时预览、KaTeX、Mermaid、HTML 导出' },
    ]},
    { category: '效率', tools: [
      { icon: 'reminder', name: '事项提醒', desc: '自然语言输入，定时通知' },
      { icon: 'timer', name: '计时器', desc: '倒计时与秒表，支持桌面浮窗' },
    ]},
    { category: '网络', tools: [
      { icon: 'webservice', name: 'Web 服务', desc: '将本地目录变为局域网网站' },
      { icon: 'lantransfer', name: '局域网传输', desc: '设备间 P2P 文件传输' },
    ]},
  ],
};

// Comparison data (language-independent values, feature names from I18N)
const COMPARE_FEATURES_EN = [
  'Cross-platform (Win/Mac/Linux)', '100% local, no cloud', 'Lightweight (<15MB)',
  'Clipboard → floating window', 'Screenshot workflow', 'Screen color picker',
  'Spotlight command palette', 'LAN file transfer', 'Local web server',
  'Reminder & notifications', 'Timer & desktop widgets', 'Global shortcuts', 'Works offline',
  'Desktop native app', 'Auto update', 'i18n (EN/ZH)', 'Open source (MIT)',
];

const COMPARE_FEATURES_ZH = [
  '跨平台 (Win/Mac/Linux)', '100% 本地，无云端', '轻量 (<15MB)',
  '剪贴板 → 浮窗', '截图工作流', '屏幕取色器',
  'Spotlight 命令面板', '局域网文件传输', '本地 Web 服务',
  '事项提醒', '计时器与桌面浮窗', '全局快捷键', '离线可用',
  '桌面原生应用', '自动更新', '国际化 (中/英)', '开源 (MIT)',
];

const COMPARE_VALUES = [
  [true, true, false, 'Win/Mac', 'Win', 'Win/Mac'],
  [true, true, false, true, true, false],
  [true, false, '—', false, false, false],
  [true, false, false, false, false, true],
  [true, false, false, false, false, false],
  [true, false, false, false, true, false],
  [true, false, false, false, false, true],
  [true, false, false, false, false, false],
  [true, false, false, false, false, false],
  [true, false, false, false, false, false],
  [true, false, false, false, false, false],
  [true, false, false, true, true, true],
  [true, true, false, true, true, true],
  [true, true, 'Web', true, true, true],
  [true, true, '—', true, true, true],
  [true, 'Partial', true, true, true, true],
  [true, true, true, false, true, false],
];

// ════════════════════════════════════════
// i18n Engine
// ════════════════════════════════════════

let currentLang = 'en';

function detectLanguage() {
  const saved = localStorage.getItem('a7box-lang');
  if (saved === 'en' || saved === 'zh') return saved;
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('a7box-lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  // Update body font for Chinese
  document.body.style.fontFamily = lang === 'zh'
    ? "'Noto Sans SC', 'Sora', system-ui, sans-serif"
    : '';

  // Update page title & description
  document.title = t('page.title');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', t('page.description'));

  // Update all [data-i18n] elements
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val.includes('<')) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });

  // Update lang toggle visual state
  const toggle = document.getElementById('langToggle');
  if (toggle) {
    toggle.querySelector('.lang-en').classList.toggle('active', lang === 'en');
    toggle.querySelector('.lang-zh').classList.toggle('active', lang === 'zh');
  }

  // Toggle hero screenshot (en ↔ zh with fade)
  const screenshotWrapper = document.querySelector('.app-screenshot-wrapper');
  if (screenshotWrapper) {
    screenshotWrapper.classList.toggle('lang-zh', lang === 'zh');
  }

  // Re-render dynamic sections
  renderTools();
  renderComparison();

  // Re-apply version to badge after language switch
  fetchVersion();
}

function toggleLanguage() {
  applyLanguage(currentLang === 'en' ? 'zh' : 'en');
}

// ════════════════════════════════════════
// Dynamic Renderers
// ════════════════════════════════════════

function renderTools() {
  const container = document.getElementById('toolGrid');
  if (!container) return;
  const data = TOOLS_I18N[currentLang] || TOOLS_I18N.en;

  let toolIndex = 0;
  container.innerHTML = data.map((cat) => `
    <div class="tool-category">
      <h3>${cat.category}</h3>
      <div class="tool-grid">
        ${cat.tools.map((tool) => {
          const delay = (toolIndex % 4) * 0.08;
          toolIndex++;
          return `
          <div class="tool-card reveal" style="transition-delay:${delay}s">
            <div class="tool-icon">${TOOL_ICONS[tool.icon] || ''}</div>
            <div class="tool-info">
              <h4>${tool.name}</h4>
              <p>${tool.desc}</p>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  // Re-observe newly rendered .reveal elements
  initReveal();
}

function renderComparison() {
  const tbody = document.getElementById('compareBody');
  if (!tbody) return;
  const features = currentLang === 'zh' ? COMPARE_FEATURES_ZH : COMPARE_FEATURES_EN;

  function cell(val, isHighlight) {
    const cls = isHighlight ? ' compare-highlight' : '';
    if (val === true) return `<td class="${cls}"><span class="check">✓</span></td>`;
    if (val === false) return `<td class="${cls}"><span class="cross">✗</span></td>`;
    return `<td class="${cls}">${val}</td>`;
  }

  tbody.innerHTML = COMPARE_VALUES.map((row, i) => `
    <tr>
      <th scope="row">${features[i]}</th>
      ${row.map((v, j) => cell(v, j === 0)).join('')}
    </tr>
  `).join('');
}

// ════════════════════════════════════════
// Scroll & Animation
// ════════════════════════════════════════

let revealObserver = null;

function initReveal() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
  }
  document.querySelectorAll('.reveal:not(.visible)').forEach((el) => revealObserver.observe(el));
}

function initNavScroll() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 60);
        ticking = false;
      });
      ticking = true;
    }
  });
}

function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('open');
    toggle.classList.toggle('active');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  links.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ════════════════════════════════════════
// GitHub API — Version, Stars & Download Links
// ════════════════════════════════════════

const FALLBACK_URL = 'https://github.com/bluvenr/a7box/releases/latest';
let _releaseCache = null; // { ver, assets } — avoid redundant API calls on lang switch

const PLATFORM_MAP = {
  win:   { exts: ['.exe', '.msi', '.zip'],         primary: '.exe' },
  mac:   { exts: ['.dmg'],                          primary: '.dmg' },
  linux: { exts: ['.AppImage', '.deb'],             primary: '.AppImage' },
};

function detectOS() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Win')) return 'win';
  if (ua.includes('Mac')) return 'mac';
  if (ua.includes('Linux')) return 'linux';
  return 'win';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function findAsset(assets, ext) {
  return assets.find(a => a.name.toLowerCase().endsWith(ext.toLowerCase()));
}

function updateDownloadLinks(assets, ver) {
  const currentOS = detectOS();

  // Highlight current OS button
  document.querySelectorAll('.download-btn[data-platform]').forEach(btn => {
    btn.classList.toggle('is-current-os', btn.dataset.platform === currentOS);
  });

  // Update each platform button with direct link + meta info
  document.querySelectorAll('.download-btn[data-platform]').forEach(btn => {
    const platform = btn.dataset.platform;
    const map = PLATFORM_MAP[platform];
    if (!map) return;

    const asset = findAsset(assets, map.primary);
    if (!asset) return; // no match → keep fallback href

    btn.href = asset.browser_download_url;
    const textEl = btn.querySelector('[data-i18n]');
    if (!textEl) return;

    const i18nKey = btn.dataset.defaultText;
    const baseText = i18nKey ? t(i18nKey) : textEl.textContent;
    const size = formatSize(asset.size);

    // Remove old meta span if exists (e.g. after language switch)
    const oldMeta = btn.querySelector('.btn-meta');
    if (oldMeta) oldMeta.remove();

    textEl.textContent = baseText;
    const meta = document.createElement('span');
    meta.className = 'btn-meta';
    meta.textContent = `v${ver} · ${size}`;
    textEl.after(meta);
  });

  // Update Hero download button to current OS direct link
  const heroBtn = document.getElementById('heroDownloadBtn');
  if (heroBtn) {
    const map = PLATFORM_MAP[currentOS];
    if (map) {
      const asset = findAsset(assets, map.primary);
      if (asset) heroBtn.href = asset.browser_download_url;
    }
  }

  // Update format-tag links with secondary asset URLs
  document.querySelectorAll('.format-tag[data-asset-ext]').forEach(tag => {
    const ext = tag.dataset.assetExt;
    const asset = findAsset(assets, ext);
    if (asset) {
      tag.href = asset.browser_download_url;
      tag.target = '_blank';
    }
  });
}

async function fetchVersion() {
  try {
    // Use cached data if available (e.g. on language switch)
    let data = _releaseCache;
    if (!data) {
      const res = await fetch('https://api.github.com/repos/bluvenr/a7box/releases/latest');
      if (!res.ok) return;
      data = await res.json();
      _releaseCache = data;
    }

    const ver = (data.tag_name || '').replace(/^v/, '');
    if (!ver) return;

    // Update badge
    const badge = document.getElementById('heroBadge');
    if (badge) {
      badge.textContent = `v${ver} \u00b7 ${t('hero.badge')}`;
    }

    // Update download links with direct URLs
    if (Array.isArray(data.assets) && data.assets.length) {
      updateDownloadLinks(data.assets, ver);
    }
  } catch {
    /* API failure → all buttons keep releases/latest fallback (HTML default) */
  }
}

async function fetchStars() {
  try {
    const res = await fetch('https://api.github.com/repos/bluvenr/a7box');
    if (!res.ok) return;
    const data = await res.json();
    const stars = data.stargazers_count;
    if (stars == null) return;
    const el = document.getElementById('starCount');
    if (el) {
      el.textContent = stars >= 1000
        ? `${(stars / 1000).toFixed(1)}k`
        : String(stars);
    }
  } catch { /* ignore */ }
}

// ════════════════════════════════════════
// Screenshot Zoom (mouse-following magnify)
// ════════════════════════════════════════

function initScreenshotZoom() {
  const wrapper = document.querySelector('.app-screenshot-wrapper');
  if (!wrapper) return;
  const imgs = wrapper.querySelectorAll('.app-screenshot');
  wrapper.addEventListener('mousemove', (e) => {
    const x = ((e.offsetX / wrapper.offsetWidth) * 100).toFixed(1);
    const y = ((e.offsetY / wrapper.offsetHeight) * 100).toFixed(1);
    imgs.forEach((img) => { img.style.transformOrigin = `${x}% ${y}%`; });
  });
}

// ════════════════════════════════════════
// Initialize
// ════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Detect & apply language
  const lang = detectLanguage();
  applyLanguage(lang);

  // Bind language toggle
  document.getElementById('langToggle')?.addEventListener('click', toggleLanguage);

  // Init animations
  requestAnimationFrame(() => initReveal());
  initNavScroll();
  initMobileNav();
  initSmoothScroll();
  initScreenshotZoom();

  // Fetch dynamic data
  fetchStars();
});
