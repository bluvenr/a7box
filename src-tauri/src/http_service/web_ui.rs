// A7Box Independent HTTP Service — Tree-view Directory Listing UI
// Dark theme matching A7Box brand, tree structure with lazy-loaded subdirectories.
// Follows browser language (zh/en). Distinct from P2P web share UI.

pub const DIRECTORY_LISTING_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A7Box</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='100' y1='18' x2='100' y2='178' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0%25' stop-color='%23FF7875'/%3E%3Cstop offset='100%25' stop-color='%23FF4D4F'/%3E%3C/linearGradient%3E%3Cmask id='m'%3E%3Crect width='200' height='200' fill='white'/%3E%3Cpath d='M58 62L148 62L148 82L104 82L72 166L54 166L88 82L58 82Z' fill='black'/%3E%3C/mask%3E%3C/defs%3E%3Cpath d='M100 18L182 178L18 178Z' fill='url(%23g)' mask='url(%23m)'/%3E%3C/svg%3E">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;background:#0c0c0c;color:#d4d4d8;min-height:100vh;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:640px;margin:0 auto;padding:40px 24px 60px}

/* ── Header ── */
.hd{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.hd svg{width:36px;height:36px;flex-shrink:0}
.hd-txt{display:flex;flex-direction:column;gap:2px}
.hd-t{font-size:1.08rem;font-weight:700;color:#fafafa;letter-spacing:-.02em;line-height:1.3}
.hd-s{font-size:.74rem;color:#52525b;line-height:1.3}

/* ── Breadcrumb + summary row ── */
.bc{display:flex;gap:3px;align-items:center;font-size:.78rem;margin-bottom:14px;flex-wrap:wrap}
.bc a{color:#FF4D4F;text-decoration:none;cursor:pointer;font-weight:500;transition:opacity .15s}.bc a:hover{opacity:.75}
.bc .sp{color:#3f3f46;margin:0 4px;font-size:.65rem}
.bc .cur{color:#71717a;font-weight:500}
.bc-count{color:#444;font-size:.73rem;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}

/* ── Tree container ── */
.tree{background:#151517;border:1px solid #232328;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.15)}
.tn{border-bottom:1px solid #1e1e22}.tn:last-child{border-bottom:none}

/* ── Tree row ── */
.tr{display:flex;align-items:center;padding:11px 18px;cursor:pointer;user-select:none;transition:background .12s;text-decoration:none;color:inherit;gap:10px;position:relative}
.tr:hover{background:#1c1c20}
.tr:active{background:#202025}
/* Colored left accent on hover */
.tr::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#FF4D4F;opacity:0;transition:opacity .15s;border-radius:0 2px 2px 0}
.tr:hover::before{opacity:1}

/* ── Toggle arrow ── */
.tg{width:12px;text-align:center;font-size:.5rem;color:#52525b;flex-shrink:0;transition:transform .25s ease,color .2s;display:inline-block;line-height:1}
.tg.op{transform:rotate(90deg);color:#a1a1aa}
.tg.hid{visibility:hidden}

/* ── Icon ── */
.ic{font-size:1.15rem;flex-shrink:0;width:24px;text-align:center;line-height:1}

/* ── Name ── */
.nm{flex:1;min-width:0;font-size:.85rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .12s}

/* ── Right-side area (size ↔ copy toggle) ── */
.rt{flex-shrink:0;display:flex;align-items:center;min-width:64px;justify-content:flex-end}
.sz{color:#444;font-size:.72rem;white-space:nowrap;font-variant-numeric:tabular-nums}
.cp{display:none;align-items:center;gap:4px;color:#71717a;font-size:.72rem;cursor:pointer;padding:2px 6px;border-radius:4px;transition:color .12s,background .12s;white-space:nowrap}
@media(hover:hover){.sz{transition:opacity .15s}.tr:hover .sz{opacity:0;position:absolute;pointer-events:none}.tr:hover .cp{display:flex}}
.cp:hover{color:#fafafa;background:rgba(255,255,255,.06)}
.cp svg{width:12px;height:12px;flex-shrink:0}
.cp.ok{color:#22c55e}

/* ── Children ── */
.ch{display:none}.ch.op{display:block}

/* ── Empty / Loading ── */
.em{padding:48px 24px;text-align:center;color:#52525b;font-size:.84rem}
.em-i{font-size:2.8rem;margin-bottom:10px;opacity:.35}
.ld{padding:14px 18px 14px 54px;color:#3f3f46;font-size:.78rem;display:flex;align-items:center;gap:8px}
.ld-spin{width:14px;height:14px;border:2px solid #27272a;border-top-color:#FF4D4F;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Footer ── */
.ft{margin-top:32px;text-align:center;font-size:.65rem;color:#1e1e22;letter-spacing:.05em;text-transform:uppercase}
</style>
</head>
<body>
<div class="wrap">
  <div class="hd">
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="lg" x1="100" y1="18" x2="100" y2="178" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FF7875"/><stop offset="100%" stop-color="#FF4D4F"/></linearGradient><mask id="lm"><rect width="200" height="200" fill="white"/><path d="M58 62L148 62L148 82L104 82L72 166L54 166L88 82L58 82Z" fill="black"/></mask></defs>
      <path d="M100 18L182 178L18 178Z" fill="url(#lg)" mask="url(#lm)"/>
    </svg>
    <div class="hd-txt">
      <span class="hd-t" id="ht"></span>
      <span class="hd-s" id="sub"></span>
    </div>
  </div>
  <div class="bc" id="bc"></div>
  <div class="tree" id="tree"></div>
  <div class="ft">Powered by A7Box</div>
</div>
<script>
(function(){
var L=(navigator.language||'en').toLowerCase().indexOf('zh')===0?'zh':'en';
var T={zh:{title:'A7Box \u2014 \u7f51\u9875\u670d\u52a1',sub:'\u5c40\u57df\u7f51\u7f51\u9875\u6d4f\u89c8',root:'\u6839\u76ee\u5f55',empty:'\u5f53\u524d\u76ee\u5f55\u4e3a\u7a7a',ld:'\u52a0\u8f7d\u4e2d',sumD:'{n} \u4e2a\u6587\u4ef6\u5939',sumF:'{n} \u4e2a\u6587\u4ef6',cpLink:'\u590d\u5236\u94fe\u63a5',cpDone:'\u5df2\u590d\u5236',cpTip:'\u70b9\u51fb\u590d\u5236\u94fe\u63a5'},
       en:{title:'A7Box \u2014 Web Service',sub:'LAN Web Browser',root:'Root',empty:'Empty directory',ld:'Loading',sumD:'{n} folders',sumF:'{n} files',cpLink:'Copy link',cpDone:'Copied',cpTip:'Click to copy link'}};
var t=function(k,v){var s=T[L][k];return v!==undefined?s.replace('{n}',v):s};
document.documentElement.lang=L==='zh'?'zh-CN':'en';
document.title=t('title');
document.getElementById('ht').textContent=t('title');
document.getElementById('sub').textContent=t('sub');

var BROWSABLE=['html','htm','css','js','json','xml','svg','png','jpg','jpeg','gif','webp','bmp','ico','pdf','txt','md','log','csv','mp4','webm','mp3','wav'];

function ext(n){var i=n.lastIndexOf('.');return i>=0?n.slice(i+1).toLowerCase():'';}
function canView(n){return BROWSABLE.indexOf(ext(n))>=0;}
function fIcon(n){
  var e=ext(n),m={pdf:'\ud83d\udcc4',doc:'\ud83d\udcc4',docx:'\ud83d\udcc4',txt:'\ud83d\udcdd',md:'\ud83d\udcdd',log:'\ud83d\udcdd',
    jpg:'\ud83d\uddbc\ufe0f',jpeg:'\ud83d\uddbc\ufe0f',png:'\ud83d\uddbc\ufe0f',gif:'\ud83d\uddbc\ufe0f',webp:'\ud83d\uddbc\ufe0f',bmp:'\ud83d\uddbc\ufe0f',svg:'\ud83d\uddbc\ufe0f',
    mp4:'\ud83c\udfac',webm:'\ud83c\udfac',mp3:'\ud83c\udfb5',wav:'\ud83c\udfb5',
    zip:'\ud83d\udce6',rar:'\ud83d\udce6','7z':'\ud83d\udce6',tar:'\ud83d\udce6',gz:'\ud83d\udce6',
    js:'\ud83d\udcbb',ts:'\ud83d\udcbb',py:'\ud83d\udcbb',rs:'\ud83d\udcbb',java:'\ud83d\udcbb',go:'\ud83d\udcbb',c:'\ud83d\udcbb',cpp:'\ud83d\udcbb',h:'\ud83d\udcbb',
    html:'\ud83c\udf10',htm:'\ud83c\udf10',css:'\ud83c\udf10',json:'\ud83c\udf10',xml:'\ud83c\udf10',
    xls:'\ud83d\udcca',xlsx:'\ud83d\udcca',csv:'\ud83d\udcca'};
  return m[e]||'\ud83d\udcc4';
}
function fmtSz(b){if(!b&&b!==0)return'';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(2)+' GB';}
function esc(s){var d=document.createElement('span');d.textContent=s;return d.innerHTML;}
function fileUrl(p,n){var f=p?p+'/'+n:n;return'/'+encodeURIComponent(f);}
function depth(path){return path?path.split('/').length:0;}

/* ── Tree rendering ── */

var CPIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function fullUrl(rel){return location.origin+rel;}

function copyText(text,cb){
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(cb).catch(function(){fallbackCopy(text,cb);});
  }else{fallbackCopy(text,cb);}
}
function fallbackCopy(text,cb){
  var ta=document.createElement('textarea');
  ta.value=text;ta.style.cssText='position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');if(cb)cb();}catch(e){}
  document.body.removeChild(ta);
}

function mkCopyBtn(rel){
  var btn=document.createElement('span');
  btn.className='cp';btn.title=t('cpTip');
  btn.innerHTML=CPIcon+'<span>'+t('cpLink')+'</span>';
  btn.onclick=function(e){
    e.stopPropagation();
    var url=fullUrl(rel);
    console.log('[A7Box Copy] rel='+rel+' fullUrl='+url+' pathname='+location.pathname);
    copyText(url,function(){
      btn.innerHTML=CPIcon+'<span>'+t('cpDone')+'</span>';
      btn.classList.add('ok');
      setTimeout(function(){
        btn.innerHTML=CPIcon+'<span>'+t('cpLink')+'</span>';
        btn.classList.remove('ok');
      },1500);
    });
  };
  return btn;
}

function mkDir(name,path,d){
  var nd=document.createElement('div');nd.className='tn';
  var pl=18+d*26;
  var row='<div class="tr" style="padding-left:'+pl+'px">'
    +'<span class="tg">\u25b6</span>'
    +'<span class="ic">\ud83d\udcc1</span>'
    +'<span class="nm">'+esc(name)+'</span>'
    +'<span class="rt"><span class="cp-wrap"></span></span>'
    +'</div>';
  nd.innerHTML=row;
  var ch=document.createElement('div');ch.className='ch';nd.appendChild(ch);
  var myPath=path?path+'/'+name:name;
  var dirUrl=fileUrl(path,name);
  nd.querySelector('.cp-wrap').appendChild(mkCopyBtn(dirUrl));
  var loaded=false,open=false,tg=nd.querySelector('.tg'),rowEl=nd.querySelector('.tr');

  rowEl.onclick=function(e){
    e.stopPropagation();
    open=!open;
    ch.classList.toggle('op',open);
    tg.classList.toggle('op',open);
    if(!loaded){loaded=true;fetchDir(myPath,ch);}
  };
  return nd;
}

function mkFile(name,path,d,size){
  var nd=document.createElement('div');nd.className='tn';
  var pl=18+d*26;
  var vu=canView(name),url=fileUrl(path,name);
  var row='<div class="tr" style="padding-left:'+pl+'px">'
    +'<span class="tg hid">\u25b6</span>'
    +'<span class="ic">'+fIcon(name)+'</span>'
    +'<span class="nm" style="'+(vu?'color:#a1a1aa':'')+'">'+esc(name)+'</span>'
    +'<span class="rt"><span class="sz">'+fmtSz(size)+'</span><span class="cp-wrap"></span></span>'
    +'</div>';
  nd.innerHTML=row;
  nd.querySelector('.cp-wrap').appendChild(mkCopyBtn(url));
  nd.querySelector('.tr').onclick=function(e){
    e.stopPropagation();
    if(vu){window.open(url,'_blank');}
    else{var a=document.createElement('a');a.href=url;a.download='';document.body.appendChild(a);a.click();document.body.removeChild(a);}
  };
  return nd;
}

function fetchDir(path,container){
  container.innerHTML='<div class="ld"><span class="ld-spin"></span>'+t('ld')+'</div>';
  var url=path?'/api/files?path='+encodeURIComponent(path):'/api/files';
  fetch(url).then(function(r){return r.json();}).then(function(files){
    container.innerHTML='';
    if(!files.length){
      container.innerHTML='<div class="em"><div class="em-i">\ud83d\udcc2</div>'+t('empty')+'</div>';
      return;
    }
    files.sort(function(a,b){
      if(a.isDir&&!b.isDir)return -1;
      if(!a.isDir&&b.isDir)return 1;
      return a.name.localeCompare(b.name);
    });
    var d=depth(path),nD=0,nF=0;
    for(var i=0;i<files.length;i++){
      var f=files[i],cp=path?path+'/'+f.name:f.name;
      if(f.isDir){container.appendChild(mkDir(f.name,path,d));nD++;}
      else{container.appendChild(mkFile(f.name,path,d,f.size));nF++;}
    }
    // Update count in breadcrumb area (only for the initial page-level directory)
    if(path===initDir){
      var parts=[];
      if(nD)parts.push(t('sumD',nD));
      if(nF)parts.push(t('sumF',nF));
      var ce=document.getElementById('bc-count');
      if(ce)ce.textContent=parts.join(' \u00b7 ');
    }
  }).catch(function(){container.innerHTML='<div class="em">Error</div>';});
}

/* ── Breadcrumb ── */
function renderBc(path){
  var el=document.getElementById('bc');
  if(!path){
    el.innerHTML='<span class="cur">\ud83c\udfe0 '+t('root')+'</span><span class="bc-count" id="bc-count"></span>';
    return;
  }
  var h='<a href="/">'+t('root')+'</a>';
  var segs=path.split('/');
  for(var i=0;i<segs.length;i++){
    var sp=segs.slice(0,i+1).join('/');
    h+='<span class="sp">\u203a</span>';
    if(i<segs.length-1){
      h+='<a href="/'+encodeURIComponent(sp)+'">'+esc(segs[i])+'</a>';
    }else{
      h+='<span class="cur">'+esc(segs[i])+'</span>';
    }
  }
  h+='<span class="bc-count" id="bc-count"></span>';
  el.innerHTML=h;
}

/* ── Init ── */
var initDir=decodeURIComponent(location.pathname).replace(/^\/|\/$/g,'');
renderBc(initDir);
fetchDir(initDir,document.getElementById('tree'));

})();
</script>
</body>
</html>"##;
