// LAN File Share - Web UI
// Self-contained HTML/CSS/JS served by the HTTP server
// Features: i18n (auto-detect zh/en), favicon, folder browsing,
//           concurrent upload queue with per-file and overall progress

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
  --bg: #0c0c0c;
  --surface: #151517;
  --surface-2: #1c1c20;
  --border: #232328;
  --brand: #FF4D4F;
  --brand-2: #FF7875;
  --brand-soft: rgba(255, 77, 79, 0.12);
  --text: #e8e8ea;
  --muted: #8b8b93;
  --dim: #5a5a62;
  --ok: #3ddc84;
  --warn: #ffb020;
  --err: #ff5f56;
  --info: #4aa3ff;
  --radius: 12px;
}
html { scrollbar-color: #3a3a42 var(--bg); scrollbar-width: thin; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: #33333a; border-radius: 6px; border: 2px solid var(--bg); }
::-webkit-scrollbar-thumb:hover { background: var(--brand); }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh; padding: 0;
  background-image: radial-gradient(900px 420px at 50% -180px, rgba(255,77,79,0.10), transparent 70%);
  background-repeat: no-repeat;
}
.container { max-width: 720px; margin: 0 auto; padding: 24px 16px 40px; }
h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
h1 .logo { width: 28px; height: 28px; }
.subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 22px; }
.num { font-variant-numeric: tabular-nums; }

/* Breadcrumb */
.breadcrumb { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; font-size: 0.8rem; }
.breadcrumb a { color: var(--brand); text-decoration: none; cursor: pointer; }
.breadcrumb a:hover { text-decoration: underline; }
.breadcrumb .sep { color: var(--dim); margin: 0 2px; }
.breadcrumb .current { color: var(--muted); }

/* Tabs */
.tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); padding: 4px; border-radius: 10px; margin-bottom: 18px; }
.tab {
  flex: 1; padding: 10px; text-align: center; border-radius: 8px;
  font-size: 0.875rem; font-weight: 500; cursor: pointer;
  color: var(--muted); transition: background 0.18s, color 0.18s;
  display: flex; align-items: center; justify-content: center; gap: 7px;
}
.tab.active { background: linear-gradient(135deg, var(--brand-2), var(--brand)); color: #fff; }
.tab:not(.active):hover { background: var(--surface-2); color: var(--text); }
.tab-badge {
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: var(--brand-soft); color: var(--brand);
  font-size: 0.7rem; font-weight: 700; line-height: 20px;
}
.tab.active .tab-badge { background: rgba(0,0,0,0.22); color: #fff; }
.tab-badge[hidden] { display: none; }

/* File List */
.file-list { display: flex; flex-direction: column; gap: 3px; }
.file-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--surface); border: 1px solid var(--border);
  border-left: 3px solid transparent; border-radius: var(--radius);
  cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.file-item:hover { background: var(--surface-2); border-left-color: var(--brand); }
.file-icon { font-size: 1.4rem; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 0.875rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 0.75rem; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
.file-dl {
  padding: 6px 12px; background: var(--brand); color: #fff;
  border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 500;
  cursor: pointer; flex-shrink: 0; transition: background 0.15s; text-decoration: none;
}
.file-dl:hover { background: var(--brand-2); }
.file-arrow { color: var(--dim); font-size: 1.2rem; flex-shrink: 0; }

/* Upload Zone */
.upload-zone {
  border: 2px dashed var(--border); border-radius: var(--radius);
  padding: 40px 24px; text-align: center; cursor: pointer;
  transition: border-color 0.2s, background 0.2s, padding 0.2s; margin-bottom: 14px;
}
.upload-zone:hover, .upload-zone.dragover { border-color: var(--brand); background: var(--brand-soft); }
.upload-zone.compact { padding: 18px 20px; }
.upload-zone.compact .upload-icon { font-size: 1.6rem; margin-bottom: 4px; }
.upload-icon { font-size: 2.6rem; margin-bottom: 10px; }
.upload-text { font-size: 0.85rem; color: var(--muted); line-height: 1.6; }
.upload-text strong { color: var(--text); }
.upload-target { margin-top: 8px; font-size: 0.72rem; color: var(--dim); }
.upload-target b { color: var(--brand); font-weight: 600; }

/* Overview panel */
.overview {
  position: sticky; top: 8px; z-index: 5;
  background: rgba(21,21,23,0.94); backdrop-filter: blur(10px);
  border: 1px solid var(--border); border-radius: 14px;
  padding: 14px 16px; margin-bottom: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
}
.overview[hidden] { display: none; }
.ov-top { display: flex; align-items: center; gap: 16px; }
.ring { position: relative; width: 66px; height: 66px; flex-shrink: 0; }
.ring svg { transform: rotate(-90deg); display: block; }
.ring .ring-bg { stroke: #26262c; }
.ring .ring-fg { stroke: url(#ovGrad); stroke-linecap: round; transition: stroke-dashoffset 0.35s ease; }
.ring.done .ring-fg { stroke: var(--ok); }
.ring.partial .ring-fg { stroke: var(--warn); }
.ring-label {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums;
}
.ov-main { flex: 1; min-width: 0; }
.ov-headline { font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ov-headline .sub { font-size: 0.75rem; font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
.ov-bar { height: 8px; background: #26262c; border-radius: 4px; overflow: hidden; }
.ov-bar-fill {
  height: 100%; width: 0%; border-radius: 4px;
  background: linear-gradient(90deg, var(--brand-2), var(--brand));
  transition: width 0.3s ease; position: relative; overflow: hidden;
}
.ov-bar-fill.done { background: linear-gradient(90deg, #6ee7a8, var(--ok)); }
.ov-bar-fill.partial { background: linear-gradient(90deg, #ffd27a, var(--warn)); }
.ov-bar-fill.live::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
  animation: sweep 1.4s linear infinite;
}
@keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.ov-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.stat {
  display: flex; align-items: center; gap: 5px; padding: 4px 9px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 999px; font-size: 0.72rem; color: var(--muted);
}
.stat b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.stat .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dim); }
.stat.s-done .dot { background: var(--ok); }
.stat.s-active .dot { background: var(--brand); }
.stat.s-wait .dot { background: var(--info); }
.stat.s-fail .dot { background: var(--err); }
.stat.s-fail.zero { opacity: 0.45; }
.ov-meta { display: flex; gap: 14px; margin-top: 10px; font-size: 0.72rem; color: var(--muted); flex-wrap: wrap; }
.ov-meta span b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.ov-controls {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);
}
.ov-controls .spacer { flex: 1; }
.ctl {
  padding: 6px 11px; border-radius: 7px; font-size: 0.74rem; font-weight: 500;
  background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
  cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ctl:hover:not(:disabled) { background: #24242a; border-color: #33333c; }
.ctl:disabled { opacity: 0.4; cursor: not-allowed; }
.ctl.danger:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.ctl.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.ctl.primary:hover:not(:disabled) { background: var(--brand-2); border-color: var(--brand-2); }
.conc { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; color: var(--muted); }
.conc select {
  background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
  border-radius: 7px; padding: 5px 7px; font-size: 0.74rem; cursor: pointer;
  font-family: inherit;
}
.conc select:focus { outline: none; border-color: var(--brand); }

/* Upload rows */
.upload-list { display: flex; flex-direction: column; gap: 6px; }
.up-item {
  background: var(--surface); border: 1px solid var(--border);
  border-left: 3px solid var(--border); border-radius: var(--radius);
  padding: 10px 12px; transition: border-color 0.2s, background 0.2s;
}
.up-item.s-uploading { border-left-color: var(--brand); background: var(--surface-2); }
.up-item.s-done { border-left-color: var(--ok); }
.up-item.s-failed { border-left-color: var(--err); }
.up-item.s-canceled { border-left-color: var(--dim); opacity: 0.65; }
.up-row { display: flex; align-items: center; gap: 10px; }
.up-name { flex: 1; min-width: 0; font-size: 0.83rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-size { font-size: 0.72rem; color: var(--muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.chip {
  font-size: 0.68rem; font-weight: 600; padding: 3px 8px; border-radius: 999px;
  flex-shrink: 0; border: 1px solid transparent; white-space: nowrap;
}
.chip.queued { background: rgba(74,163,255,0.12); color: var(--info); border-color: rgba(74,163,255,0.25); }
.chip.uploading { background: var(--brand-soft); color: var(--brand); border-color: rgba(255,77,79,0.28); }
.chip.saving { background: rgba(255,176,32,0.12); color: var(--warn); border-color: rgba(255,176,32,0.3); }
.up-item.is-saving .up-fill { background: linear-gradient(90deg, #ffd27a, var(--warn)); animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
.chip.done { background: rgba(61,220,132,0.12); color: var(--ok); border-color: rgba(61,220,132,0.25); }
.chip.failed { background: rgba(255,95,86,0.14); color: var(--err); border-color: rgba(255,95,86,0.3); }
.chip.canceled { background: #202024; color: var(--dim); border-color: var(--border); }
.up-actions { display: flex; gap: 4px; flex-shrink: 0; }
.icon-btn {
  width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); cursor: pointer;
  font-size: 0.8rem; line-height: 1; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.icon-btn:hover { background: #26262c; color: var(--text); border-color: #3a3a44; }
.icon-btn.danger:hover { color: var(--brand); border-color: var(--brand); }
.up-track { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.up-bar { flex: 1; height: 5px; background: #26262c; border-radius: 3px; overflow: hidden; }
.up-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--brand-2), var(--brand)); transition: width 0.25s linear; }
.up-item.s-done .up-fill { background: var(--ok); }
.up-item.s-failed .up-fill { background: var(--err); }
.up-item.s-canceled .up-fill { background: var(--dim); }
.up-pct { font-size: 0.72rem; color: var(--muted); width: 38px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.up-speed { font-size: 0.7rem; color: var(--dim); width: 76px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.up-error { margin-top: 6px; font-size: 0.7rem; color: var(--err); word-break: break-all; }
.up-error[hidden] { display: none; }

/* Empty State */
.empty { text-align: center; padding: 48px 24px; color: var(--muted); }
.empty-icon { font-size: 3rem; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 0.875rem; }

/* Toast */
.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 20px);
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--ok);
  color: var(--text); padding: 10px 16px; border-radius: 10px; font-size: 0.8rem;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
  transition: opacity 0.25s, transform 0.25s; z-index: 20; max-width: 90vw;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.toast.warn { border-left-color: var(--warn); }
.toast.info { border-left-color: var(--info); }

/* Footer */
.footer { margin-top: 32px; text-align: center; font-size: 0.75rem; color: var(--dim); }

@media (max-width: 520px) {
  .ov-top { gap: 12px; }
  .ring { width: 56px; height: 56px; }
  .up-speed { display: none; }
  .ov-controls .spacer { display: none; }
  .ctl, .conc { flex: 1 1 auto; justify-content: center; }
}
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
    <div class="tab" data-tab="upload" id="tab-label-upload">
      <span id="tab-upload-text">Upload</span>
      <span class="tab-badge num" id="tab-badge" hidden>0</span>
    </div>
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
      <div class="upload-target" id="upload-target"></div>
    </div>
    <input type="file" id="file-input" multiple style="display:none">

    <div class="overview" id="overview" hidden>
      <div class="ov-top">
        <div class="ring" id="ov-ring">
          <svg width="66" height="66" viewBox="0 0 66 66">
            <defs>
              <linearGradient id="ovGrad" x1="0" y1="0" x2="66" y2="66" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FF7875"/>
                <stop offset="100%" stop-color="#FF4D4F"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="33" cy="33" r="28" fill="none" stroke-width="6"/>
            <circle class="ring-fg" id="ov-ring-fg" cx="33" cy="33" r="28" fill="none" stroke-width="6"
                    stroke-dasharray="175.93" stroke-dashoffset="175.93"/>
          </svg>
          <div class="ring-label num" id="ov-pct">0%</div>
        </div>
        <div class="ov-main">
          <div class="ov-headline">
            <span id="ov-title"></span>
            <span class="sub" id="ov-bytes"></span>
          </div>
          <div class="ov-bar"><div class="ov-bar-fill" id="ov-fill"></div></div>
          <div class="ov-stats">
            <div class="stat s-total"><span class="dot"></span><span id="lbl-total"></span><b id="ov-total">0</b></div>
            <div class="stat s-done"><span class="dot"></span><span id="lbl-done"></span><b id="ov-done">0</b></div>
            <div class="stat s-active"><span class="dot"></span><span id="lbl-active"></span><b id="ov-active">0</b></div>
            <div class="stat s-wait"><span class="dot"></span><span id="lbl-wait"></span><b id="ov-wait">0</b></div>
            <div class="stat s-fail zero" id="stat-fail"><span class="dot"></span><span id="lbl-fail"></span><b id="ov-fail">0</b></div>
          </div>
          <div class="ov-meta">
            <span><span id="lbl-speed"></span> <b id="ov-speed">—</b></span>
            <span><span id="lbl-eta"></span> <b id="ov-eta">—</b></span>
          </div>
        </div>
      </div>
      <div class="ov-controls">
        <label class="conc"><span id="lbl-conc"></span>
          <select id="conc-select">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3" selected>3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <div class="spacer"></div>
        <button class="ctl" id="btn-retry"></button>
        <button class="ctl" id="btn-clear"></button>
        <button class="ctl danger" id="btn-cancel-all"></button>
      </div>
    </div>

    <div class="upload-list" id="upload-list"></div>
  </div>

  <div class="footer">Powered by A7Box</div>
</div>
<div class="toast" id="toast"></div><script>
// ============ i18n ============
const LANG = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const I18N = {
  zh: {
    subtitle: '局域网文件共享',
    browse: '浏览文件',
    upload: '上传文件',
    download: '下载',
    empty: '当前目录为空',
    uploadHint: '<strong>点击选择</strong> 或拖放文件到此处<br>支持批量选择，多个文件将并行上传',
    uploadHintMore: '<strong>继续添加文件</strong> 或拖放到此处<br>新文件会追加到当前队列',
    root: '根目录',
    targetDir: '上传到',
    queueTitle: '上传队列',
    ovRunning: '正在上传',
    ovFinished: '上传完成',
    ovPartial: '部分失败',
    ovCanceled: '已取消',
    lblTotal: '总计',
    lblDone: '已完成',
    lblActive: '上传中',
    lblWait: '待上传',
    lblFail: '失败/取消',
    lblSpeed: '速度',
    lblEta: '剩余',
    lblConc: '并发数',
    cancelAll: '全部取消',
    retryFailed: '重试失败项',
    clearDone: '清除已完成',
    st_queued: '等待中',
    st_uploading: '上传中',
    st_saving: '保存中',
    st_done: '已完成',
    st_failed: '失败',
    st_canceled: '已取消',
    actCancel: '取消',
    actRetry: '重试',
    actRemove: '移除',
    sumDone: '全部上传完成',
    sumPartial: '部分文件未上传成功，可重试',
    sumCanceled: '上传已取消',
    unitFiles: '个文件',
    calculating: '计算中…',
    finishing: '即将完成',
    errNetwork: '网络中断，连接已断开',
    uSec: '秒', uMin: '分', uHour: '小时',
  },
  en: {
    subtitle: 'LAN File Share',
    browse: 'Browse Files',
    upload: 'Upload Files',
    download: 'Download',
    empty: 'No files in current directory',
    uploadHint: '<strong>Click to select</strong> or drag files here<br>Pick several at once — they upload in parallel',
    uploadHintMore: '<strong>Add more files</strong> or drop them here<br>New files join the current queue',
    root: 'Root',
    targetDir: 'Uploading to',
    queueTitle: 'Upload queue',
    ovRunning: 'Uploading',
    ovFinished: 'Upload complete',
    ovPartial: 'Partly failed',
    ovCanceled: 'Canceled',
    lblTotal: 'Total',
    lblDone: 'Done',
    lblActive: 'Active',
    lblWait: 'Waiting',
    lblFail: 'Failed/canceled',
    lblSpeed: 'Speed',
    lblEta: 'Left',
    lblConc: 'Parallel',
    cancelAll: 'Cancel all',
    retryFailed: 'Retry failed',
    clearDone: 'Clear done',
    st_queued: 'Waiting',
    st_uploading: 'Uploading',
    st_saving: 'Saving',
    st_done: 'Done',
    st_failed: 'Failed',
    st_canceled: 'Canceled',
    actCancel: 'Cancel',
    actRetry: 'Retry',
    actRemove: 'Remove',
    sumDone: 'All uploads complete',
    sumPartial: 'Some files did not finish — you can retry them',
    sumCanceled: 'Uploads canceled',
    unitFiles: 'files',
    calculating: 'estimating…',
    finishing: 'finishing…',
    errNetwork: 'Network connection lost',
    uSec: 's', uMin: 'm', uHour: 'h',
  }
};
const t = (key) => I18N[LANG][key] || I18N.en[key] || key;

// Apply i18n
document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
document.title = 'A7Box - ' + t('subtitle');
document.getElementById('subtitle').textContent = t('subtitle');
document.getElementById('tab-label-browse').textContent = t('browse');
document.getElementById('tab-upload-text').textContent = t('upload');
document.getElementById('empty-text').textContent = t('empty');
document.getElementById('upload-text').innerHTML = t('uploadHint');
document.getElementById('lbl-total').textContent = t('lblTotal');
document.getElementById('lbl-done').textContent = t('lblDone');
document.getElementById('lbl-active').textContent = t('lblActive');
document.getElementById('lbl-wait').textContent = t('lblWait');
document.getElementById('lbl-fail').textContent = t('lblFail');
document.getElementById('lbl-speed').textContent = t('lblSpeed');
document.getElementById('lbl-eta').textContent = t('lblEta');
document.getElementById('lbl-conc').textContent = t('lblConc');
document.getElementById('btn-cancel-all').textContent = t('cancelAll');
document.getElementById('btn-retry').textContent = t('retryFailed');
document.getElementById('btn-clear').textContent = t('clearDone');
document.getElementById('ov-title').textContent = t('queueTitle');

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
      const tabs = document.querySelector('.tabs');
      if (tabs) {
        tabs.style.display = 'none';
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
    if (tabName === 'upload' && !uploadAllowed) return;
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
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
    updateTarget();

    if (files.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

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
      }
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
    }).join('');

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

// ============ Upload queue ============
const zone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadList = document.getElementById('upload-list');
const overview = document.getElementById('overview');
const badge = document.getElementById('tab-badge');
const concSelect = document.getElementById('conc-select');
const btnCancelAll = document.getElementById('btn-cancel-all');
const btnRetry = document.getElementById('btn-retry');
const btnClear = document.getElementById('btn-clear');
const RING_LEN = 175.93;

const queue = [];
let concurrency = 3;
let seq = 0;
let ticker = null;
let settled = true;

zone.addEventListener('click', () => fileInput.click());
zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', (e) => {
  e.preventDefault();
  zone.classList.remove('dragover');
  if (uploadAllowed) addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

function updateTarget() {
  document.getElementById('upload-target').innerHTML =
    t('targetDir') + ' <b>' + escapeHtml(currentPath || t('root')) + '</b>';
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || !uploadAllowed) return;
  for (const file of files) {
    const item = {
      id: 'u' + (++seq), file, name: file.name, size: file.size,
      loaded: 0, state: 'queued', error: '', xhr: null,
      speed: 0, lastLoaded: 0, lastTs: 0, rendered: '', el: null, refs: null,
    };
    queue.push(item);
    buildRow(item);
  }
  settled = false;
  pump();
  startTicker();
}

function buildRow(item) {
  const el = document.createElement('div');
  el.className = 'up-item s-queued';
  el.innerHTML =
    '<div class="up-row">' +
      '<span class="file-icon">' + getFileIcon(item.name) + '</span>' +
      '<span class="up-name"></span>' +
      '<span class="up-size num"></span>' +
      '<span class="chip queued"></span>' +
      '<span class="up-actions"></span>' +
    '</div>' +
    '<div class="up-track">' +
      '<div class="up-bar"><div class="up-fill"></div></div>' +
      '<span class="up-pct num">0%</span>' +
      '<span class="up-speed num"></span>' +
    '</div>' +
    '<div class="up-error" hidden></div>';
  el.querySelector('.up-name').textContent = item.name;
  el.querySelector('.up-name').title = item.name;
  el.querySelector('.up-size').textContent = formatSize(item.size);
  uploadList.appendChild(el);
  item.el = el;
  item.refs = {
    chip: el.querySelector('.chip'),
    actions: el.querySelector('.up-actions'),
    fill: el.querySelector('.up-fill'),
    pct: el.querySelector('.up-pct'),
    speed: el.querySelector('.up-speed'),
    err: el.querySelector('.up-error'),
  };
  renderRow(item);
}

function isSaving(item) {
  return item.state === 'uploading' && item.size > 0 && item.loaded >= item.size;
}

function renderRow(item) {
  const r = item.refs;
  const saving = isSaving(item);
  const pct = item.state === 'done' ? 100
    : (item.size > 0 ? Math.min(100, Math.round(item.loaded / item.size * 100)) : 0);
  r.fill.style.width = pct + '%';
  r.pct.textContent = pct + '%';
  r.speed.textContent = (item.state === 'uploading' && !saving && item.speed > 1024) ? formatSize(item.speed) + '/s' : '';
  const key = item.state + (saving ? ':saving' : '');
  if (item.rendered !== key) {
    item.rendered = key;
    item.el.className = 'up-item s-' + item.state + (saving ? ' is-saving' : '');
    r.chip.className = 'chip ' + (saving ? 'saving' : item.state);
    r.chip.textContent = saving ? t('st_saving') : t('st_' + item.state);
    r.err.textContent = item.error || '';
    r.err.hidden = !item.error;
    renderActions(item);
  }
}

function renderActions(item) {
  const box = item.refs.actions;
  box.innerHTML = '';
  const mk = (glyph, title, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'icon-btn' + (cls ? ' ' + cls : '');
    b.type = 'button';
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    box.appendChild(b);
  };
  if (item.state === 'queued' || item.state === 'uploading') {
    mk('✕', t('actCancel'), 'danger', () => cancelItem(item));
  } else {
    if (item.state !== 'done') mk('↻', t('actRetry'), '', () => retryItem(item));
    mk('✕', t('actRemove'), '', () => removeItem(item));
  }
}

function renderAll() { queue.forEach(renderRow); }

function cancelItem(item) {
  if (item.state === 'uploading' && item.xhr) { item.xhr.abort(); return; }
  if (item.state === 'queued') { item.state = 'canceled'; item.loaded = 0; }
  renderAll(); refresh(); pump();
}

function retryItem(item) {
  item.state = 'queued'; item.loaded = 0; item.error = ''; item.speed = 0;
  settled = false;
  renderRow(item); pump(); startTicker();
}

function removeItem(item) {
  if (item.xhr) { item.xhr.abort(); }
  const i = queue.indexOf(item);
  if (i >= 0) queue.splice(i, 1);
  if (item.el) item.el.remove();
  renderAll(); refresh(); pump();
}

function startItem(item) {
  item.state = 'uploading';
  item.loaded = 0; item.speed = 0; item.error = '';
  item.lastLoaded = 0; item.lastTs = performance.now();
  renderRow(item);

  const form = new FormData();
  form.append('file', item.file);
  if (currentPath) form.append('path', currentPath);

  const xhr = new XMLHttpRequest();
  item.xhr = xhr;
  xhr.upload.addEventListener('progress', (e) => {
    if (!e.lengthComputable) return;
    item.loaded = Math.min(e.loaded, item.size);
    renderRow(item);
  });
  xhr.addEventListener('load', () => {
    item.xhr = null;
    let data = null;
    try { data = JSON.parse(xhr.responseText); } catch (_) { /* not json */ }
    if (xhr.status === 200 && data && data.ok) {
      item.state = 'done';
      item.loaded = item.size;
    } else {
      item.state = 'failed';
      const detail = data && (data.error || (data.files && data.files[0] && data.files[0].error));
      item.error = detail || ('HTTP ' + xhr.status);
    }
    item.speed = 0;
    settledStep();
  });
  xhr.addEventListener('error', () => {
    item.xhr = null; item.state = 'failed'; item.speed = 0; item.error = t('errNetwork');
    settledStep();
  });
  xhr.addEventListener('abort', () => {
    item.xhr = null; item.speed = 0;
    if (item.state === 'uploading') item.state = 'canceled';
    settledStep();
  });
  xhr.open('POST', '/api/upload');
  xhr.send(form);
}

function settledStep() { renderAll(); refresh(); pump(); }

function pump() {
  let active = queue.filter(i => i.state === 'uploading').length;
  for (const item of queue) {
    if (active >= concurrency) break;
    if (item.state === 'queued') { startItem(item); active++; }
  }
  renderAll();
  refresh();
}

function startTicker() {
  if (ticker) return;
  ticker = setInterval(tick, 400);
}
function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

function tick() {
  const now = performance.now();
  let busy = false;
  for (const item of queue) {
    if (item.state === 'queued') { busy = true; continue; }
    if (item.state !== 'uploading') continue;
    busy = true;
    const dt = (now - item.lastTs) / 1000;
    if (dt >= 0.35) {
      const inst = Math.max(0, item.loaded - item.lastLoaded) / dt;
      item.speed = item.speed > 0 ? item.speed * 0.6 + inst * 0.4 : inst;
      item.lastLoaded = item.loaded;
      item.lastTs = now;
    }
    renderRow(item);
  }
  refresh();
  if (!busy) stopTicker();
}

function collect() {
  const s = { total: queue.length, done: 0, active: 0, wait: 0, fail: 0, canceled: 0, saving: 0, bytes: 0, loaded: 0, speed: 0 };
  for (const i of queue) {
    if (i.state === 'canceled') { s.canceled++; continue; }
    s.bytes += i.size;
    if (i.state === 'done') { s.done++; s.loaded += i.size; }
    else if (i.state === 'uploading') {
      s.active++;
      s.loaded += i.loaded;
      // Bytes are already on the wire; waiting for the server to commit them.
      if (isSaving(i)) s.saving++; else s.speed += i.speed;
    }
    else if (i.state === 'queued') { s.wait++; }
    else if (i.state === 'failed') { s.fail++; }
  }
  return s;
}

function refresh() {
  const s = collect();
  const pending = s.active + s.wait;
  const running = pending > 0;

  badge.textContent = String(pending);
  badge.hidden = pending === 0;
  overview.hidden = queue.length === 0;
  zone.classList.toggle('compact', queue.length > 0);
  document.getElementById('upload-text').innerHTML = queue.length ? t('uploadHintMore') : t('uploadHint');
  updateTarget();
  if (queue.length === 0) { stopTicker(); return; }

  const allGood = !running && s.fail === 0 && s.canceled === 0 && s.done > 0;
  const pct = s.bytes > 0 ? Math.min(100, s.loaded / s.bytes * 100) : (allGood ? 100 : 0);
  const shown = Math.floor(pct);
  document.getElementById('ov-pct').textContent = shown + '%';
  document.getElementById('ov-ring-fg').setAttribute('stroke-dashoffset', String(RING_LEN * (1 - pct / 100)));
  document.getElementById('ov-fill').style.width = pct + '%';
  document.getElementById('ov-bytes').textContent = formatSize(s.loaded) + ' / ' + formatSize(s.bytes);

  document.getElementById('ov-total').textContent = String(s.total);
  document.getElementById('ov-done').textContent = String(s.done);
  document.getElementById('ov-active').textContent = String(s.active);
  document.getElementById('ov-wait').textContent = String(s.wait);
  document.getElementById('ov-fail').textContent = String(s.fail + s.canceled);
  document.getElementById('stat-fail').classList.toggle('zero', s.fail + s.canceled === 0);

  const ring = document.getElementById('ov-ring');
  const fill = document.getElementById('ov-fill');
  ring.classList.toggle('done', allGood);
  ring.classList.toggle('partial', !running && !allGood);
  fill.classList.toggle('live', running);
  fill.classList.toggle('done', allGood);
  fill.classList.toggle('partial', !running && !allGood);

  let title = t('queueTitle');
  if (running) title = t('ovRunning');
  else if (s.fail > 0 || s.canceled > 0) title = s.done > 0 ? t('ovPartial') : t('ovCanceled');
  else title = t('ovFinished');
  document.getElementById('ov-title').textContent = title;

  document.getElementById('ov-speed').textContent =
    running && s.speed > 1024 ? formatSize(s.speed) + '/s' : '—';
  const remain = Math.max(0, s.bytes - s.loaded);
  document.getElementById('ov-eta').textContent = !running ? '—'
    : (remain === 0 ? t('finishing')
    : (s.speed > 1024 ? formatDuration(remain / s.speed) : t('calculating')));

  btnCancelAll.disabled = !running;
  btnRetry.disabled = (s.fail + s.canceled) === 0;
  btnRetry.textContent = t('retryFailed') + ((s.fail + s.canceled) ? ' (' + (s.fail + s.canceled) + ')' : '');
  btnClear.disabled = s.done === 0;
  btnClear.textContent = t('clearDone') + (s.done ? ' (' + s.done + ')' : '');

  if (!settled && !running) {
    settled = true;
    stopTicker();
    loadFiles();
    if (s.fail + s.canceled > 0) {
      showToast(s.done > 0 ? t('sumPartial') + ' · ' + s.done + '/' + s.total : t('sumCanceled'), 'warn');
    } else if (s.done > 0) {
      showToast(t('sumDone') + ' · ' + s.done + ' ' + t('unitFiles'), '');
    } else {
      showToast(t('sumCanceled'), 'info');
    }
  }
}

concSelect.addEventListener('change', () => {
  concurrency = parseInt(concSelect.value, 10) || 1;
  pump();
  if (queue.some(i => i.state === 'queued' || i.state === 'uploading')) startTicker();
});

btnCancelAll.addEventListener('click', () => {
  for (const item of queue) {
    if (item.state === 'queued') { item.state = 'canceled'; item.loaded = 0; }
    else if (item.state === 'uploading' && item.xhr) item.xhr.abort();
  }
  renderAll(); refresh(); pump();
});

btnRetry.addEventListener('click', () => {
  let revived = false;
  for (const item of queue) {
    if (item.state === 'failed' || item.state === 'canceled') {
      item.state = 'queued'; item.loaded = 0; item.error = ''; item.speed = 0;
      revived = true;
    }
  }
  if (!revived) return;
  settled = false;
  renderAll(); pump(); startTicker();
});

btnClear.addEventListener('click', () => {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].state === 'done') {
      if (queue[i].el) queue[i].el.remove();
      queue.splice(i, 1);
    }
  }
  renderAll(); refresh();
});

// ============ Toast ============
let toastTimer = null;
function showToast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast' + (kind ? ' ' + kind : ''); }, 3200);
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
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '—';
  sec = Math.round(sec);
  if (sec < 60) return sec + t('uSec');
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + t('uMin') + (s ? ' ' + s + t('uSec') : '');
  return Math.floor(m / 60) + t('uHour') + ' ' + (m % 60) + t('uMin');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Initial load
updateTarget();
loadFiles();
</script>
</body>
</html>"##;