// ==============================================================================
// 🚀 AMRTF-Desk 獨立播控艙主程序 (AMRTF Desktop Core Server · 健全版)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { CdpBridge } from './src/core/cdp-bridge.js';
import { WebRemoteServer } from './src/server/web-remote.js';
import { CompanionBridgeClient } from './src/server/companion-bridge.js';
import { MobileLayoutStore } from './src/server/mobile-layout-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 獲取本機真實區域網路 IPv4 (Wi-Fi 或乙太網路)
function getLanIPv4() {
  try {
    const nets = os.networkInterfaces();
    let bestIp = '';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          // 優先選 Wi-Fi 或 區域連線
          if (/wi-?fi|wlan|ethernet|乙太/i.test(name)) {
            return net.address;
          }
          if (!bestIp) bestIp = net.address;
        }
      }
    }
    return bestIp || '127.0.0.1';
  } catch (e) {
    return '127.0.0.1';
  }
}

// 講次歷史記憶與最新講次探測
const LAST_LESSON_FILE = path.join(__dirname, 'last-lesson.json');

function saveLastLesson(numStr) {
  try {
    fs.writeFileSync(LAST_LESSON_FILE, JSON.stringify({ lastLesson: numStr, updatedAt: new Date().toISOString() }), 'utf8');
  } catch (e) {}
}

async function getStartupLesson() {
  // 1. 優先讀取上次研討記憶
  let candidate = '0566';
  try {
    if (fs.existsSync(LAST_LESSON_FILE)) {
      const data = JSON.parse(fs.readFileSync(LAST_LESSON_FILE, 'utf8'));
      if (data && data.lastLesson) candidate = String(data.lastLesson).padStart(4, '0');
    }
  } catch (e) {}

  // 2. 背景非阻塞或短暫探測大慈恩官方專題頁最新發布講次
  return new Promise((resolve) => {
    const req = https.get('https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 2000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const matches = [...d.matchAll(/clear-moonlight-great-ocean-(\d+)/g)];
          if (matches.length > 0) {
            const nums = matches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
            const maxNum = Math.max(...nums);
            if (maxNum > 0) {
              const latestStr = String(maxNum).padStart(4, '0');
              console.log(`[Online-Detect] 探測到大慈恩最新講次: 第 ${latestStr} 講`);
              saveLastLesson(latestStr);
              resolve(latestStr);
              return;
            }
          }
        } catch (err) {}
        resolve(candidate);
      });
    });
    req.on('error', () => resolve(candidate));
    req.on('timeout', () => {
      req.destroy();
      resolve(candidate);
    });
  });
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🎛️ 大慈恩官網 (AMRTF) 獨立雙視窗播控艙 (AMRTF-Desk)');
console.log('═══════════════════════════════════════════════════════════════');

// 0. 自動排他性接管 (清理舊有佔用 Port 9998 / 9222 的進程)
function cleanupStaleProcesses() {
  try {
    const output = execSync('netstat -ano | findstr :9998', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = output.trim().split('\n');
    const myPid = process.pid;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (pid && pid !== myPid) {
        console.log(`[Auto-Clean] 釋放佔用 Port 9998 的舊進程: PID ${pid}`);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
      }
    }
  } catch (e) {}
}
cleanupStaleProcesses();

// 1. 探測本機 Edge / Chrome 執行檔路徑
function getBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'msedge.exe';
}

// 2. 動態讀取注入腳本 (保證即時載入磁碟最新版本)
function getInjectedScript() {
  return fs.readFileSync(path.join(__dirname, 'src', 'injected', 'amrtf-runtime.js'), 'utf8');
}

// 3. 啟動整合 HTTP 與 WebSocket 伺服器 (Port 9998)
let activeState = null;
let deskWsClients = new Set();
let screenProcess = null;
let deskProcess = null;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/desk' || url === '/desk/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'src', 'desk', 'index.html'), 'utf8'));
    return;
  }

  // 📱 行動端自訂 4x8 版面 API 路由
  if (url === '/api/mobile-layout') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        layout: mobileLayoutStore.getLayout(),
        catalog: mobileLayoutStore.getCatalog()
      }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const saved = mobileLayoutStore.saveLayout(parsed);
          webRemote.broadcastMobileLayout(saved);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true, layout: saved }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }
  }

  if (url === '/api/mobile-layout/reset' && req.method === 'POST') {
    const reset = mobileLayoutStore.resetLayout();
    webRemote.broadcastMobileLayout(reset);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, layout: reset }));
    return;
  }
  if (url === '/desk.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'src', 'desk', 'desk.css'), 'utf8'));
    return;
  }
  if (url === '/desk.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'src', 'desk', 'desk.js'), 'utf8'));
    return;
  }
  if (url.startsWith('/modules/')) {
    const modPath = path.join(__dirname, 'src', 'desk', url);
    if (fs.existsSync(modPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(modPath, 'utf8'));
      return;
    }
  }
  if (url === '/' || url === '/mobile') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(webRemote.getMobileHtml());
    return;
  }

  // 支援本機離線影片靜態與 HTTP 206 分段串流 (零記憶體負擔)
  if (url.startsWith('/videos/')) {
    const fileName = path.basename(url);
    const filePath = path.join(__dirname, 'assets', 'videos', fileName);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return;
      }

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': '*'
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }
  }

  if (url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ lanIp: getLanIPv4(), port: 9998 }));
    return;
  }

  // 接收前端視窗關閉連動信標 (長官按 ✕ 時順便關閉網頁並徹底釋放 SERVER)
  if (url === '/api/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, message: '關閉中...' }));
    console.log('[System] 收到 /api/shutdown 退出信標，即刻執行全域關閉三部曲！');
    setTimeout(shutdownApp, 100);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  deskWsClients.add(ws);

  // 初次連線立即同步真實 LAN IP
  ws.send(JSON.stringify({
    type: 'INIT_INFO',
    data: { lanIp: getLanIPv4(), port: 9998 }
  }));

  if (activeState) {
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', data: { ...activeState, lanIp: getLanIPv4() } }));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'SHUTDOWN') {
        console.log('[System] 收到 WebSocket 退出指令，正在關閉放映艙並退出伺服器...');
        shutdownApp();
        return;
      }
      if (msg.type === 'COMMAND' || msg.type === 'ACTION') {
        const cmd = msg.command || msg.cmd;
        dispatchCommand(cmd, msg.params || {});
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    deskWsClients.delete(ws);
    console.log(`[Desk] 操作艙連線中斷，剩餘活躍連線數: ${deskWsClients.size}`);
    // 當長官把主控台視窗按 ✕ 關閉且無客戶端連線時，延遲 1.5 秒自動關閉放映艙與伺服器
    if (deskWsClients.size === 0) {
      setTimeout(() => {
        if (deskWsClients.size === 0) {
          console.log('[System] 操作艙視窗已全數關閉，自動清理放映艙並退出伺服器釋放記憶體');
          shutdownApp();
        }
      }, 1500);
    }
  });
});

function broadcastToDesk(state) {
  const merged = { ...(activeState || {}), ...state };
  // 快照持久化：若歷史已有豐富段落清單，新推播若只有 1 個或為空，永久保留豐富清單防止覆蓋
  if (activeState && activeState.markers && activeState.markers.length > 1) {
    if (!state.markers || state.markers.length <= 1) {
      merged.markers = activeState.markers;
    }
  }
  activeState = merged;
  const msg = JSON.stringify({ type: 'STATE_UPDATE', data: { ...activeState, lanIp: getLanIPv4() } });
  for (const client of deskWsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// 4. 跨端信令調度中樞
function dispatchCommand(cmd, params = {}) {
  console.log(`[Dispatch] 執行指令: ${cmd}`, params);

  // 專門處理講次跳轉指令
  if (cmd === 'goto_lesson') {
    const raw = String(params.lessonNumber || params.lesson || '').trim();
    const num = /^\d+$/.test(raw) ? raw.padStart(4, '0') : raw;
    saveLastLesson(num); // 記憶最新研討講次
    const url = `https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean-${num}/`;
    console.log(`[Navigation] 導航至講次: ${url}`);
    cdpBridge.navigate(url);
    return;
  }

  // 專門處理放映艙網頁全螢幕切換
  if (cmd === 'toggle_fullscreen') {
    // 1. 優先觸發放映艙網頁內核原生全螢幕 API
    cdpBridge.sendCommand('toggle_fullscreen');
    // 2. 備援特權模擬：向 Chromium 放映艙發送 F11 信號
    setTimeout(() => {
      cdpBridge.toggleFullscreen();
    }, 150);
    return;
  }

  cdpBridge.sendCommand(cmd, params);
}

// 5. 啟動輔助模組
const cdpBridge = new CdpBridge(9222, (state) => {
  broadcastToDesk(state);
  webRemote.broadcastState(state);
  companionClient.syncState(state);
});

const mobileLayoutStore = new MobileLayoutStore();
const webRemote = new WebRemoteServer(9998, dispatchCommand, mobileLayoutStore);
const companionClient = new CompanionBridgeClient(9999, dispatchCommand);

// 6. 優雅退出與子進程清理 (長官按 ✕ 時順便關閉網頁並徹底釋放 SERVER)
function shutdownApp() {
  console.log('[System] 正在執行全域關閉三部曲（關閉放映艙、釋放端口、退出伺服器）...');
  try {
    if (screenProcess && screenProcess.pid) {
      try { execSync(`taskkill /F /PID ${screenProcess.pid} /T`, { stdio: 'ignore' }); } catch (e) {}
    }
    if (deskProcess && deskProcess.pid) {
      try { execSync(`taskkill /F /PID ${deskProcess.pid} /T`, { stdio: 'ignore' }); } catch (e) {}
    }
    // 徹底釋放放映艙 9222 佔用進程
    try {
      const netstat9222 = execSync('netstat -ano | findstr :9222', { encoding: 'utf8' });
      netstat9222.split('\n').forEach(l => {
        const p = l.trim().split(/\s+/).pop();
        if (p && p !== '0' && p !== process.pid.toString()) {
          try { execSync(`taskkill /F /PID ${p} /T`, { stdio: 'ignore' }); } catch (err) {}
        }
      });
    } catch (e) {}
  } catch (e) {}

  try { server.close(); } catch (e) {}
  try { wss.close(); } catch (e) {}
  console.log('✅ 所有放映艙視窗與背景服務已徹底關閉，記憶體完全釋放。');
  process.exit(0);
}

process.on('SIGINT', shutdownApp);
process.on('SIGTERM', shutdownApp);

// 8. 視窗真實性檢驗哨兵 (Window Reality Sentinel · 絕不自我欺騙)
async function verifyWindowReality(timeoutMs = 6000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const psCmd = `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match 'msedge|chrome') } | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json`;
      const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) {
        const parsed = JSON.parse(out);
        const windows = Array.isArray(parsed) ? parsed : [parsed];
        if (windows.length > 0) {
          return { ok: true, windows };
        }
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, windows: [] };
}

// 7. 啟動主流程
server.listen(9998, '0.0.0.0', async () => {
  const lanIp = getLanIPv4();
  console.log(`✅ [1/4] 主控台與手機遙控伺服器已就緒: http://127.0.0.1:9998/desk`);
  console.log(`📱 [LAN IP] 手機掃碼直連網址: http://${lanIp}:9998/mobile`);
  companionClient.start();

  const browserBin = getBrowserExecutable();
  
  // 自動探測並載入最新講次 (開機即是最新研討進度！)
  const startupLesson = await getStartupLesson();
  const targetUrl = `https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean-${startupLesson}/`;
  console.log(`📖 [Startup] 預設載入最新研討講次: 第 ${startupLesson} 講 (${targetUrl})`);

  // (0) 清理舊有的 Profile 鎖定 (防止 Edge SingletonLock 吞噬新視窗)
  for (const prof of ['amrtf-desk-profile', 'amrtf-screen-profile']) {
    const pDir = path.join('C:\\temp', prof);
    for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      try { fs.unlinkSync(path.join(pDir, f)); } catch (e) {}
    }
  }

  // (A) 優先在主螢幕左側 (X: 30, Y: 40) 拉起操作主控台視窗 (啟用 9223 CDP 偵測與禁快取)
  console.log('⏳ [2/4] 正在拉起主控台操作艙視窗 (主螢幕左側，CDP 9223)...');
  deskProcess = spawn(browserBin, [
    `--app=http://127.0.0.1:9998/desk`,
    '--remote-debugging-port=9223',
    '--disable-cache',
    '--window-position=30,40',
    '--window-size=580,720',
    '--user-data-dir=C:\\temp\\amrtf-desk-profile',
    '--new-window',
    '--no-first-run'
  ], { detached: true, stdio: 'ignore' });
  deskProcess.unref();

  deskProcess.on('exit', (code) => {
    // Edge 啟動器派生視窗後父進程會正常返回 0，不應當作視窗關閉
    console.log(`[System] 主控台啟動程序已移交後台 (code: ${code})`);
  });

  // (B) 在主螢幕右側 (X: 630, Y: 40) 拉起大慈恩放映艙視窗
  console.log('⏳ [3/4] 正在拉起大慈恩放映艙視窗 (主螢幕右側，免手勢有聲)...');
  screenProcess = spawn(browserBin, [
    `--app=${targetUrl}`,
    '--remote-debugging-port=9222',
    '--window-position=630,40',
    '--window-size=1000,800',
    '--user-data-dir=C:\\temp\\amrtf-screen-profile',
    '--new-window',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=PreloadMediaEngagementData,AutoplayIgnoreWebAudio',
    '--disable-extensions',
    '--no-first-run'
  ], { detached: true, stdio: 'ignore' });
  screenProcess.unref();

  screenProcess.on('exit', () => {
    console.log('[System] 放映艙視窗已退出');
  });

  // (C) 掛載 CDP 注入代碼
  console.log('⏳ [4/4] 正在掛載 CDP 特權注入管線...');
  const connected = await cdpBridge.connect(25);
  if (connected) {
    await cdpBridge.injectScript(getInjectedScript());
    console.log('🔗 [CDP] 特權腳本注入完成');

    // 嘗試捕獲放映艙即時渲染像素 (真實視覺物證)
    try {
      const screenshotBase64 = await cdpBridge.captureScreenshot();
      if (screenshotBase64) {
        const snapPath = path.join(__dirname, 'runtime-snapshot.png');
        fs.writeFileSync(snapPath, Buffer.from(screenshotBase64, 'base64'));
        console.log(`📸 [Visual-Truth] 成功捕獲放映艙即時渲染快照: ${snapPath}`);
      }
    } catch (err) {
      console.log(`⚠️ [Visual-Truth] 快照捕獲跳過: ${err.message}`);
    }
  } else {
    console.log('⚠️ [CDP] 延遲掛載，將在背景自動重試...');
  }

  // (D) 物理驗證：檢驗 Windows 桌面真實視窗 HWND
  console.log('🔍 [Window-Verify] 正在向 Windows DWM 檢驗可見視窗 Handle...');
  const verifyRes = await verifyWindowReality(5000);
  if (verifyRes.ok) {
    console.log(`🎯 [Window-Verified] 檢測到真實桌面視窗 (共 ${verifyRes.windows.length} 個):`);
    for (const w of verifyRes.windows) {
      console.log(`   • PID ${w.Id}: "${w.MainWindowTitle || '(無標題)'}" (HWND: ${w.MainWindowHandle})`);
    }
  } else {
    console.log('❌ [Ghost-Window-Alert] 警告：Windows 桌面未檢測到有效 MainWindowHandle！');
    console.log('   💡 原因排查：進程可能在背景幽靈運行、被父進程隔離或被既有瀏覽器實例吞噬。');
  }
});
