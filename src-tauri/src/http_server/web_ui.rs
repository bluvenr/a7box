// A7Box Web UI for LAN file sharing
// Self-contained HTML/CSS/JS served by the HTTP server
// Features: i18n (auto-detect zh/en), favicon, folder browsing

pub const WEB_UI_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>A7Box - LAN File Share</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='a7-g' x1='100' y1='18' x2='100' y2='178' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0%25' stop-color='%23FF7875'/%3E%3Cstop offset='100%25' stop-color='%23FF4D4F'/%3E%3C/linearGradient%3E%3Cmask id='a7-m'%3E%3Crect width='200' height='200' fill='white'/%3E%3Cpath d='M58 62L148 62L148 82L104 82L72 166L54 166L88 82L58 82Z' fill='black'/%3E%3C/mask%3E%3C/defs%3E%3Cpath d='M100 18L182 178L18 178Z' fill='url(%23a7-g)' mask='url(%23a7-m)'/%3E%3C/svg%3E">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg: #0f0f0f;
  --surface: #1a1a1a;
  --surface-hover: #252525;
  --border: #2a2a2a;
  --text: #f5f5f5;
  --text-muted: #888;
  --text-dim: #555;
  --success: #22c55e;
  --error: #ef4444;
  --radius: 12px;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh; padding: 0;
}
.container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
h1 .logo { width: 28px; height: 28px; }
.subtitle { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px; }

/* Breadcrumb */
.breadcrumb { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; font-size: 0.8rem; }
.breadcrumb a { color: var(--primary); text-decoration: none; cursor: pointer; }
.breadcrumb a:hover { text-decoration: underline; }
.breadcrumb .sep { color: var(--text-dim); margin: 0 2px; }
.breadcrumb .current { color: var(--text-muted); }

/* Tabs */
.tabs { display: flex; gap: 4px; background: var(--surface); padding: 4px; border-radius: 10px; margin-bottom: 20px; }
.tab {
  flex: 1; padding: 10px; text-align: center; border-radius: 8px;
  font-size: 0.875rem; font-weight: 500; cursor: pointer;
  color: var(--text-muted); transition: all 0.2s;
}
.tab.active { background: var(--primary); color: white; }
.tab:not(.active):hover { background: var(--surface-hover); color: var(--text); }

/* File List */
.file-list { display: flex; flex-direction: column; gap: 2px; }
.file-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--surface); border-radius: var(--radius);
  cursor: pointer; transition: background 0.15s;
}
.file-item:hover { background: var(--surface-hover); }
.file-icon { font-size: 1.5rem; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 0.875rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.file-dl {
  padding: 6px 12px; background: var(--primary); color: white;
  border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 500;
  cursor: pointer; flex-shrink: 0; transition: background 0.15s; text-decoration: none;
}
.file-dl:hover { background: var(--primary-hover); }
.file-arrow { color: var(--text-dim); font-size: 1.2rem; flex-shrink: 0; }

/* Upload Area */
.upload-zone {
  border: 2px dashed var(--border); border-radius: var(--radius);
  padding: 48px 24px; text-align: center; cursor: pointer;
  transition: all 0.2s; margin-bottom: 16px;
}
.upload-zone:hover, .upload-zone.dragover {
  border-color: var(--primary); background: rgba(99, 102, 241, 0.05);
}
.upload-zone.dragover { background: rgba(99, 102, 241, 0.1); }
.upload-icon { font-size: 3rem; margin-bottom: 12px; }
.upload-text { font-size: 0.875rem; color: var(--text-muted); }
.upload-text strong { color: var(--text); }

/* Upload Progress */
.upload-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--surface); border-radius: var(--radius); margin-bottom: 8px;
}
.upload-name { flex: 1; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.progress-bar { width: 80px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
.progress-fill { height: 100%; background: var(--primary); transition: width 0.3s; }
.upload-status { font-size: 0.75rem; color: var(--text-muted); width: 40px; text-align: right; flex-shrink: 0; }
.upload-status.success { color: var(--success); }
.upload-status.error { color: var(--error); }

/* Empty State */
.empty { text-align: center; padding: 48px 24px; color: var(--text-muted); }
.empty-icon { font-size: 3rem; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 0.875rem; }

/* Footer */
.footer { margin-top: 32px; text-align: center; font-size: 0.75rem; color: var(--text-dim); }
</style>
</head>
<body>
<div class="container">
  <h1>
    <svg class="logo" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="a7-gi" x1="100" y1="18" x2="100" y2="178" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FF7875"/>
          <stop offset="100%" stop-color="#FF4D4F"/>
        </linearGradient>
        <mask id="a7-mi">
          <rect width="200" height="200" fill="white"/>
          <path d="M58 62L148 62L148 82L104 82L72 166L54 166L88 82L58 82Z" fill="black"/>
        </mask>
      </defs>
      <path d="M100 18L182 178L18 178Z" fill="url(#a7-gi)" mask="url(#a7-mi)"/>
    </svg>
    A7Box
  </h1>
  <p class="subtitle" id="subtitle"></p>

  <div class="tabs">
    <div class="tab active" data-tab="browse" id="tab-label-browse">Browse</div>
    <div class="tab" data-tab="upload" id="tab-label-upload">Upload</div>
  </div>

  <div id="tab-browse">
    <div class="breadcrumb" id="breadcrumb"></div>
    <div class="file-list" id="file-list"></div>
    <div class="empty" id="empty-state" style="display:none">
      <div class="empty-icon">📂</div>
      <div class="empty-text" id="empty-text"></div>
    </div>
  </div>

  <div id="tab-upload" style="display:none">
    <div class="upload-zone" id="upload-zone">
      <div class="upload-icon">📤</div>
      <div class="upload-text" id="upload-text"></div>
    </div>
    <input type="file" id="file-input" multiple style="display:none">
    <div id="upload-list"></div>
  </div>

  <div class="footer">Powered by A7Box</div>
</div>

<script>
// ============ i18n ============
const LANG = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const I18N = {
  zh: {
    subtitle: '局域网文件共享',
    browse: '浏览文件',
    upload: '上传文件',
    download: '下载',
    empty: '当前目录为空',
    uploadHint: '<strong>点击选择</strong> 或拖放文件到此处<br>文件将上传到当前目录',
    root: '根目录',
  },
  en: {
    subtitle: 'LAN File Share',
    browse: 'Browse Files',
    upload: 'Upload Files',
    download: 'Download',
    empty: 'No files in current directory',
    uploadHint: '<strong>Click to select</strong> or drag files here<br>Files will be uploaded to the current directory',
    root: 'Root',
  }
};
const t = (key) => I18N[LANG][key] || I18N.en[key] || key;

// Apply i18n
document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
document.title = 'A7Box - ' + t('subtitle');
document.getElementById('subtitle').textContent = t('subtitle');
document.getElementById('tab-label-browse').textContent = t('browse');
document.getElementById('tab-label-upload').textContent = t('upload');
document.getElementById('empty-text').textContent = t('empty');
document.getElementById('upload-text').innerHTML = t('uploadHint');

// ============ State ============
let currentPath = '';  // '' = root, 'subdir' or 'a/b/c'
let uploadAllowed = true;

// ============ Config: check upload permission ============
(async () => {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (!cfg.allowUpload) {
      uploadAllowed = false;
      // Hide tabs container and show static header instead
      const tabs = document.querySelector('.tabs');
      if (tabs) {
        tabs.style.display = 'none';
        // Insert a static page title
        const header = document.createElement('h2');
        header.style.cssText = 'font-size:1rem;font-weight:600;margin-bottom:16px;color:var(--text)';
        header.textContent = t('browse');
        tabs.parentNode.insertBefore(header, tabs.nextSibling);
      }
    }
  } catch(e) { /* ignore */ }
})();

// ============ Tab switching ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    if (tabName === 'upload' && !uploadAllowed) return;  // Respect upload restriction
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-browse').style.display = tabName === 'browse' ? 'block' : 'none';
    document.getElementById('tab-upload').style.display = tabName === 'upload' ? 'block' : 'none';
    if (tabName === 'browse') loadFiles();
  });
});

// ============ Breadcrumb ============
function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  if (!currentPath) {
    el.innerHTML = '<span class="current">' + t('root') + '</span>';
    return;
  }
  const parts = currentPath.split('/');
  let html = '<a data-path="">📁 ' + t('root') + '</a>';
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += (acc ? '/' : '') + parts[i];
    html += '<span class="sep">/</span>';
    if (i === parts.length - 1) {
      html += '<span class="current">' + escapeHtml(parts[i]) + '</span>';
    } else {
      html += '<a data-path="' + escapeHtml(acc) + '">' + escapeHtml(parts[i]) + '</a>';
    }
  }
  el.innerHTML = html;
  el.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      currentPath = a.dataset.path;
      loadFiles();
    });
  });
}

// ============ Load file list ============
async function loadFiles() {
  try {
    const url = currentPath ? '/api/files?path=' + encodeURIComponent(currentPath) : '/api/files';
    const res = await fetch(url);
    const files = await res.json();
    const list = document.getElementById('file-list');
    const empty = document.getElementById('empty-state');
    renderBreadcrumb();

    if (files.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Sort: dirs first, then files
    files.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    list.innerHTML = files.map(f => {
      const icon = f.isDir ? '📁' : getFileIcon(f.name);
      const size = f.isDir ? '' : formatSize(f.size);
      if (f.isDir) {
        return `<div class="file-item" data-dir="${escapeHtml(f.name)}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(f.name)}</div>
          </div>
          <span class="file-arrow">›</span>
        </div>`;
      } else {
        const href = currentPath
          ? '/files/' + encodeURIComponent(currentPath + '/' + f.name)
          : '/files/' + encodeURIComponent(f.name);
        return `<div class="file-item">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(f.name)}</div>
            <div class="file-meta">${size}</div>
          </div>
          <a class="file-dl" href="${href}" download>${t('download')}</a>
        </div>`;
      }
    }).join('');

    // Folder click handlers
    list.querySelectorAll('[data-dir]').forEach(el => {
      el.addEventListener('click', () => {
        const dir = el.dataset.dir;
        currentPath = currentPath ? currentPath + '/' + dir : dir;
        loadFiles();
      });
    });
  } catch (e) {
    console.error('Failed to load files:', e);
  }
}

// ============ Upload ============
const zone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

zone.addEventListener('click', () => fileInput.click());
zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', (e) => {
  e.preventDefault();
  zone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) uploadFiles(fileInput.files); });

async function uploadFiles(files) {
  const list = document.getElementById('upload-list');
  for (const file of files) {
    const itemId = 'upload-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const itemHtml = `<div class="upload-item" id="${itemId}">
      <span class="file-icon">${getFileIcon(file.name)}</span>
      <span class="upload-name">${escapeHtml(file.name)}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
      <span class="upload-status">0%</span>
    </div>`;
    list.insertAdjacentHTML('afterbegin', itemHtml);
    await uploadFile(file, itemId);
  }
  fileInput.value = '';
}

async function uploadFile(file, itemId) {
  const formData = new FormData();
  formData.append('file', file);
  if (currentPath) formData.append('path', currentPath);
  const xhr = new XMLHttpRequest();
  return new Promise((resolve) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        const el = document.getElementById(itemId);
        if (el) {
          el.querySelector('.progress-fill').style.width = pct + '%';
          el.querySelector('.upload-status').textContent = pct + '%';
        }
      }
    });
    xhr.addEventListener('load', () => {
      const el = document.getElementById(itemId);
      if (el) {
        el.querySelector('.progress-fill').style.width = '100%';
        const status = el.querySelector('.upload-status');
        if (xhr.status === 200) {
          status.textContent = '✓';
          status.classList.add('success');
        } else {
          status.textContent = '✗';
          status.classList.add('error');
        }
      }
      resolve();
    });
    xhr.addEventListener('error', () => {
      const el = document.getElementById(itemId);
      if (el) {
        el.querySelector('.upload-status').textContent = '✗';
        el.querySelector('.upload-status').classList.add('error');
      }
      resolve();
    });
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}

// ============ Utilities ============
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📄', docx: '📄', txt: '📝', md: '📝',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    js: '💻', ts: '💻', py: '💻', rs: '💻', go: '💻', java: '💻',
    html: '🌐', css: '🌐', json: '🌐', xml: '🌐',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📊', pptx: '📊',
  };
  return icons[ext] || '📄';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Initial load
loadFiles();
</script>
</body>
</html>"##;
