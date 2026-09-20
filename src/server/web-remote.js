// ==============================================================================
// 📱 AMRTF 手機行動手把遙控服務 (Web Remote Server - Port 9998)
// ==============================================================================

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';

export class WebRemoteServer {
  constructor(port = 9998, onCommandReceived = null, mobileLayoutStore = null) {
    this.port = port;
    this.onCommandReceived = onCommandReceived;
    this.mobileLayoutStore = mobileLayoutStore;
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.latestState = null;
  }

  // 取得本機區網 IPv4 位址
  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  getRemoteUrl() {
    return `http://${this.getLocalIp()}:${this.port}`;
  }

  start() {
    this.server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];

      if (url === '/api/mobile-layout') {
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            layout: this.mobileLayoutStore ? this.mobileLayoutStore.getLayout() : null,
            catalog: this.mobileLayoutStore ? this.mobileLayoutStore.getCatalog() : []
          }));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (!this.mobileLayoutStore) throw new Error('MobileLayoutStore 未初始化');
              const saved = this.mobileLayoutStore.saveLayout(parsed);
              this.broadcastMobileLayout(saved);
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
        if (!this.mobileLayoutStore) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: false, error: 'MobileLayoutStore 未初始化' }));
          return;
        }
        const reset = this.mobileLayoutStore.resetLayout();
        this.broadcastMobileLayout(reset);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, layout: reset }));
        return;
      }

      // CORS Preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      if (url === '/' || url === '/index.html' || url === '/mobile') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getMobileHtml());
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      // 連線瞬間傳送最新快照
      if (this.latestState) {
        ws.send(JSON.stringify({ type: 'STATE_UPDATE', data: this.latestState }));
      }

      // 連線瞬間傳送最新手機佈局
      if (this.mobileLayoutStore) {
        ws.send(JSON.stringify({ type: 'MOBILE_LAYOUT_UPDATED', layout: this.mobileLayoutStore.getLayout() }));
      }

      ws.on('message', (msg) => {
        try {
          const payload = JSON.parse(msg.toString());
          if (payload.type === 'ACTION' && this.onCommandReceived) {
            this.onCommandReceived(payload.command, payload.params || {});
          }
        } catch (e) {}
      });

      ws.on('close', () => this.clients.delete(ws));
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[WebRemote] 行動遙控網頁服務已啟動：${this.getRemoteUrl()}`);
    });
  }

  broadcastState(state) {
    this.latestState = state;
    const msg = JSON.stringify({ type: 'STATE_UPDATE', data: state });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  broadcastMobileLayout(layout) {
    const msg = JSON.stringify({ type: 'MOBILE_LAYOUT_UPDATED', layout });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (e) {}
      }
    }
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }

  getMobileHtml() {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>AMRTF 4×8 行動操作艙</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-tap-highlight-color: transparent; }
    html, body {
      width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px)) 6px;
      display: flex;
      flex-direction: column;
    }
    #mobileDeckGrid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(8, 1fr);
      gap: 6px;
      width: 100%;
      height: 100%;
    }
    /* 積木元件基底 */
    .deck-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      transition: transform 0.08s ease, filter 0.08s ease;
    }
    .deck-btn {
      border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
      font-weight: 800;
      color: #ffffff;
      text-align: center;
      padding: 4px;
    }
    .deck-btn:active {
      transform: scale(0.95);
      filter: brightness(1.2);
    }
    .deck-btn .btn-icon {
      font-size: 24px;
      line-height: 1;
      margin-bottom: 2px;
    }
    .deck-btn .btn-text {
      font-size: 13px;
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 巨大按鈕時加大字體 */
    .deck-btn.span-2x2 .btn-icon { font-size: 40px; margin-bottom: 4px; }
    .deck-btn.span-2x2 .btn-text { font-size: 18px; }

    /* 按鈕樣式調色盤 (對標廣播級高對比) */
    .btn-play { background: linear-gradient(135deg, #059669, #047857); border-color: #10b981; }
    .btn-play.playing { background: linear-gradient(135deg, #d97706, #b45309); border-color: #f59e0b; }
    .btn-stop { background: linear-gradient(135deg, #334155, #1e293b); border-color: #475569; }
    .btn-secondary { background: linear-gradient(135deg, #1e293b, #0f172a); border-color: #334155; }
    .btn-info { background: linear-gradient(135deg, #0284c7, #0369a1); border-color: #38bdf8; }
    .btn-warning { background: linear-gradient(135deg, #ea580c, #c2410c); border-color: #fb923c; }
    .btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); border-color: #60a5fa; }
    .btn-dark { background: linear-gradient(135deg, #18181b, #09090b); border-color: #27272a; }
    .btn-video { background: linear-gradient(135deg, #1e3a8a, #172554); border-color: #3b82f6; }
    .btn-close-video { background: linear-gradient(135deg, #7f1d1d, #450a0a); border-color: #ef4444; }

    /* 時鐘與講次 Widget */
    .widget-header-info {
      background: #020617;
      border: 1px solid #1e293b;
      padding: 4px 8px;
      justify-content: center;
      text-align: center;
    }
    .widget-header-info .led-time {
      font-family: monospace;
      font-size: 20px;
      font-weight: 900;
      color: #38bdf8;
      text-shadow: 0 0 8px rgba(56,189,248,0.35);
      line-height: 1.1;
    }
    .widget-header-info .lesson-title {
      font-size: 11px;
      color: #94a3b8;
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
    }

    /* 師父逐字稿提詞機 Widget */
    .widget-teleprompter {
      background: #0a0f1d;
      border: 1px solid #1e293b;
      padding: 8px 10px;
      align-items: stretch;
      justify-content: flex-start;
      overflow: hidden;
    }
    .prompter-header {
      font-size: 10px;
      color: #64748b;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding-bottom: 2px;
    }
    .prompter-content {
      flex: 1;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.5;
      color: #cbd5e1;
      word-break: break-word;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .prompter-content::-webkit-scrollbar { width: 3px; }
    .prompter-content::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

    /* ⏱️ 手機端起訖段落控制艙 Widget */
    .widget-interval-box {
      background: #050a15;
      border: 1px solid #1e293b;
      padding: 6px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 5px;
    }
    .interval-select-row {
      display: flex;
      gap: 6px;
      width: 100%;
    }
    .interval-field {
      flex: 1;
      display: flex;
      align-items: center;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 2px 4px;
      overflow: hidden;
    }
    .field-tag {
      font-size: 11px;
      font-weight: 900;
      color: #38bdf8;
      margin-right: 4px;
    }
    .mobile-select {
      flex: 1;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      width: 100%;
    }
    .mobile-select option {
      background: #0f172a;
      color: #f8fafc;
    }
    .interval-btn-row {
      display: flex;
      gap: 6px;
      width: 100%;
    }
    .int-action-btn {
      flex: 1;
      padding: 6px 0;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      font-weight: 900;
      color: #ffffff;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.4);
    }
    .int-action-btn:active {
      transform: scale(0.95);
    }
    .btn-int-play { background: linear-gradient(135deg, #d97706, #b45309); }
    .btn-int-loop { background: linear-gradient(135deg, #ea580c, #c2410c); }
    .btn-int-stop { background: linear-gradient(135deg, #475569, #334155); }
  </style>
</head>
<body>
  <div id="mobileDeckGrid">
    <div style="grid-column: 1 / span 4; grid-row: 4 / span 1; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:14px;">
      📡 正在連線 AMRTF 4×8 播控艙...
    </div>
  </div>

  <script>
    let isPlaying = false;
    let currentLayout = null;
    let currentState = null;

    const wsUrl = 'ws://' + window.location.host + '/ws';
    let ws = null;

    function connectWs() {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => console.log('[Mobile] WS 已連線');
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'MOBILE_LAYOUT_UPDATED') {
            currentLayout = msg.layout;
            renderDeck();
          } else if (msg.type === 'STATE_UPDATE') {
            currentState = msg.data;
            updateStateDisplay();
          }
        } catch (e) {
          console.error('[Mobile] WS 解析錯誤:', e);
        }
      };
      ws.onclose = () => {
        console.warn('[Mobile] WS 斷線，2秒後重連');
        setTimeout(connectWs, 2000);
      };
    }

    function triggerHaptic() {
      if (navigator.vibrate) {
        try { navigator.vibrate(35); } catch(e){}
      }
    }

    function sendCommand(cmd, params = {}) {
      triggerHaptic();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ACTION', command: cmd, params }));
      }
    }

    function renderDeck() {
      if (!currentLayout || !currentLayout.items) return;
      const grid = document.getElementById('mobileDeckGrid');
      grid.innerHTML = '';

      for (const item of currentLayout.items) {
        const el = document.createElement('div');
        el.id = 'deck-item-' + item.id;
        el.className = 'deck-item';
        el.style.gridColumn = item.col + ' / span ' + item.w;
        el.style.gridRow = item.row + ' / span ' + item.h;

        if (item.type === 'widget') {
          if (item.id === 'header-info') {
            el.className += ' widget-header-info';
            el.innerHTML = '<div class="led-time" id="ledTime">00:00 / 00:00</div>' +
                           '<div class="lesson-title" id="lessonTitle">AMRTF 4×8 就緒</div>';
          } else if (item.id === 'widget-teleprompter') {
            el.className += ' widget-teleprompter';
            el.innerHTML = '<div class="prompter-header"><span>師父開示逐字提詞</span><span id="prompterStatus">即時</span></div>' +
                           '<div class="prompter-content" id="prompterBox">手抄稿即時提詞就緒...</div>';
          } else if (item.id === 'widget-interval') {
            el.className += ' widget-interval-box';
            el.innerHTML = '<div class="interval-select-row">' +
                             '<div class="interval-field">' +
                               '<span class="field-tag">起</span>' +
                               '<select class="mobile-select" id="mobileSelectStart"><option value="0">00:00 起點</option></select>' +
                             '</div>' +
                             '<div class="interval-field">' +
                               '<span class="field-tag">迄</span>' +
                               '<select class="mobile-select" id="mobileSelectEnd"><option value="0">00:00 訖點</option></select>' +
                             '</div>' +
                           '</div>' +
                           '<div class="interval-btn-row">' +
                             '<button class="int-action-btn btn-int-play" id="btnMobilePlayInterval">▶ 區間</button>' +
                             '<button class="int-action-btn btn-int-loop" id="btnMobileLoopInterval">🔁 循環</button>' +
                             '<button class="int-action-btn btn-int-stop" id="btnMobileStopInterval">⏹ 急煞</button>' +
                           '</div>';
            setTimeout(() => setupMobileIntervalEvents(), 20);
          }
        } else {
          // 一般按鈕
          el.className += ' deck-btn ' + (item.style || 'btn-secondary');
          if (item.w >= 2 && item.h >= 2) el.className += ' span-2x2';

          let icon = '⚡';
          if (item.action === 'play') icon = isPlaying ? '⏸' : '▶';
          else if (item.action === 'stop') icon = '⏹';
          else if (item.action === 'seek_bwd') icon = '⏪';
          else if (item.action === 'seek_fwd') icon = '⏩';
          else if (item.action === 'toggle_quote') icon = '#';
          else if (item.action === 'toggle_theme') icon = '🌓';
          else if (item.action === 'toggle_scroll') icon = '📜';
          else if (item.action === 'toggle_speech_lead') icon = '🗣️';
          else if (item.action === 'loop_interval') icon = '🔁';
          else if (item.action === 'prev_lecture') icon = '⏮';
          else if (item.action === 'next_lecture') icon = '⏭';
          else if (item.action === 'fullscreen') icon = '⛶';
          else if (item.action === 'modal_migtsema' || item.action === 'modal_prep_video' || item.action === 'modal_dedication_video') icon = '🎬';
          else if (item.action === 'close_video') icon = '✕';

          el.innerHTML = '<div class="btn-icon">' + icon + '</div>' +
                         '<div class="btn-text">' + (item.label || item.id) + '</div>';

          el.onclick = () => handleButtonClick(item);
        }

        grid.appendChild(el);
      }
      updateStateDisplay();
    }

    function handleButtonClick(item) {
      if (item.action === 'play') {
        sendCommand('TOGGLE_PLAY');
      } else if (item.action === 'stop') {
        sendCommand('STOP');
      } else if (item.action === 'seek_bwd') {
        sendCommand('SEEK_BACKWARD', { seconds: 5 });
      } else if (item.action === 'seek_fwd') {
        sendCommand('SEEK_FORWARD', { seconds: 5 });
      } else if (item.action === 'toggle_quote') {
        sendCommand('TOGGLE_QUOTE');
      } else if (item.action === 'toggle_theme') {
        sendCommand('TOGGLE_THEME');
      } else if (item.action === 'toggle_scroll') {
        sendCommand('TOGGLE_SCROLL_MODE');
      } else if (item.action === 'toggle_speech_lead') {
        sendCommand('TOGGLE_SPEECH_LEAD');
      } else if (item.action === 'loop_interval') {
        sendCommand('LOOP_INTERVAL');
      } else if (item.action === 'prev_lecture') {
        sendCommand('PREV_LECTURE');
      } else if (item.action === 'next_lecture') {
        sendCommand('NEXT_LECTURE');
      } else if (item.action === 'fullscreen') {
        sendCommand('FULLSCREEN');
      } else if (item.action) {
        // 通用直通信令 (包含 modal_migtsema, modal_prep_video, modal_dedication_video, close_video 等)
        sendCommand(item.action);
      }
    }

    function setupMobileIntervalEvents() {
      const btnPlay = document.getElementById('btnMobilePlayInterval');
      const btnLoop = document.getElementById('btnMobileLoopInterval');
      const btnStop = document.getElementById('btnMobileStopInterval');
      const selStart = document.getElementById('mobileSelectStart');
      const selEnd = document.getElementById('mobileSelectEnd');

      if (btnPlay && !btnPlay.dataset.bound) {
        btnPlay.dataset.bound = 'true';
        btnPlay.onclick = () => {
          const start = parseFloat(selStart?.value) || 0;
          const end = parseFloat(selEnd?.value) || 0;
          if (end > start) {
            sendCommand('play_interval', { start, end, loop: false });
          } else {
            alert('訖點必須大於起點！');
          }
        };
      }
      if (btnLoop && !btnLoop.dataset.bound) {
        btnLoop.dataset.bound = 'true';
        btnLoop.onclick = () => {
          const start = parseFloat(selStart?.value) || 0;
          const end = parseFloat(selEnd?.value) || 0;
          if (end > start) {
            sendCommand('play_interval', { start, end, loop: true });
          } else {
            alert('訖點必須大於起點！');
          }
        };
      }
      if (btnStop && !btnStop.dataset.bound) {
        btnStop.dataset.bound = 'true';
        btnStop.onclick = () => {
          sendCommand('stop_interval');
          sendCommand('pause');
        };
      }

      if (currentState && currentState.markers) {
        populateMobileIntervalOptions(currentState.markers);
      }
    }

    let lastRenderedMarkerCount = 0;
    function populateMobileIntervalOptions(markers) {
      if (!Array.isArray(markers) || markers.length === 0) return;
      if (markers.length === lastRenderedMarkerCount) return;
      lastRenderedMarkerCount = markers.length;

      const selStart = document.getElementById('mobileSelectStart');
      const selEnd = document.getElementById('mobileSelectEnd');
      if (!selStart || !selEnd) return;

      const curStartVal = selStart.value;
      const curEndVal = selEnd.value;

      selStart.innerHTML = '';
      selEnd.innerHTML = '';

      markers.forEach((m, idx) => {
        const timeVal = parseFloat(m.seconds || m.time || 0);
        const labelText = m.label || m.title || ('第 ' + (idx + 1) + ' 段');

        const optS = document.createElement('option');
        optS.value = timeVal;
        optS.textContent = ((m.timeStr || '') + ' ' + labelText).trim();
        selStart.appendChild(optS);

        const optE = document.createElement('option');
        optE.value = timeVal;
        optE.textContent = ((m.timeStr || '') + ' ' + labelText).trim();
        selEnd.appendChild(optE);
      });

      if (curStartVal) selStart.value = curStartVal;
      if (curEndVal) selEnd.value = curEndVal;
      else if (markers.length > 1) selEnd.selectedIndex = 1;
    }

    function updateStateDisplay() {
      if (!currentState) return;
      const ledTime = document.getElementById('ledTime');
      const lessonTitle = document.getElementById('lessonTitle');
      const prompterBox = document.getElementById('prompterBox');

      const timeText = currentState.timeStr || ((currentState.currentTimeStr || '00:00') + ' / ' + (currentState.totalTimeStr || '00:00'));
      if (ledTime && timeText) {
        ledTime.textContent = timeText;
      }
      const titleText = currentState.title || (currentState.lessonTitle ? ((currentState.lessonNumber ? '第 ' + currentState.lessonNumber + ' 講 ' : '') + currentState.lessonTitle) : null);
      if (lessonTitle && titleText) {
        lessonTitle.textContent = titleText;
      }
      const subtitleText = currentState.activeText || currentState.currentSubtitle;
      if (prompterBox && subtitleText) {
        prompterBox.textContent = subtitleText;
      }

      if (currentState.markers) {
        populateMobileIntervalOptions(currentState.markers);
      }

      // 同步播放鈕狀態高亮
      isPlaying = (currentState.playing !== undefined) ? !!currentState.playing : !!currentState.isPlaying;
      const playBtn = document.getElementById('deck-item-btn-play');
      if (playBtn) {
        if (isPlaying) {
          playBtn.classList.add('playing');
          const iconEl = playBtn.querySelector('.btn-icon');
          if (iconEl) iconEl.textContent = '⏸';
          const textEl = playBtn.querySelector('.btn-text');
          if (textEl) textEl.textContent = '暫停';
        } else {
          playBtn.classList.remove('playing');
          const iconEl = playBtn.querySelector('.btn-icon');
          if (iconEl) iconEl.textContent = '▶';
          const textEl = playBtn.querySelector('.btn-text');
          if (textEl) textEl.textContent = '播放';
        }
      }
    }

    connectWs();
  </script>
</body>
</html>`;
  }
}
