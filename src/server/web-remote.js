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

    /* 沉雕金屬外框凹槽 (Stream Deck Recessed Bezel Housing) */
    .deck-item {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: stretch;
      border-radius: 12px;
      position: relative;
      overflow: hidden;
      background: linear-gradient(145deg, #222733, #0d1017);
      padding: 3px;
      box-shadow: inset 0 2px 5px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06);
    }

    /* 3D 壓克力透光水晶鍵帽本體 (Crystal Acrylic Cap) */
    .deck-btn {
      cursor: pointer;
      border: none;
      padding: 0;
      background: transparent;
    }
    .deck-btn-crystal {
      width: 100%;
      height: 100%;
      border-radius: 9px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow: inset 0 1.5px 2px rgba(255,255,255,0.65), inset 0 -3px 6px rgba(0,0,0,0.65), 0 3px 6px rgba(0,0,0,0.35);
      transition: transform 0.08s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.08s ease, filter 0.08s ease;
    }

    /* 頂部拋物弧面反光罩 (Curved Specular Sheen) */
    .deck-btn-crystal::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 3px;
      right: 3px;
      height: 42%;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.12) 65%, transparent 100%);
      border-radius: 8px 8px 50% 50% / 8px 8px 25% 25%;
      pointer-events: none;
      z-index: 2;
      transition: opacity 0.08s ease;
    }

    /* 三維機械開關按壓微動反饋 (Tactile Micro-Switch Feedback) */
    .deck-btn:active .deck-btn-crystal {
      transform: translateY(2px) scale(0.96);
      box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.95), 0 1px 2px rgba(0, 0, 0, 0.4);
      filter: brightness(1.15);
    }
    .deck-btn:active .deck-btn-crystal::before {
      opacity: 0.22;
    }

    /* Stream Deck 經典圖文配置 */
    .btn-glyph {
      font-size: 24px;
      line-height: 1;
      z-index: 3;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
      margin-bottom: 2px;
    }
    .btn-label {
      font-size: 10px;
      font-weight: 800;
      color: rgba(255,255,255,0.92);
      z-index: 3;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9);
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 92%;
      text-align: center;
    }
    /* 寬扁按鈕 (h = 1 且 w >= 2): Stream Deck 經典精緻橫向排版 */
    .deck-btn.span-wide .deck-btn-crystal {
      flex-direction: row;
      gap: 6px;
      padding: 0 6px;
    }
    .deck-btn.span-wide .btn-glyph {
      font-size: 18px;
      margin-bottom: 0;
    }
    .deck-btn.span-wide .btn-label {
      font-size: 11px;
      margin-top: 0;
    }

    /* 按鈕樣式調色盤 (高彩度 LCD 背光色相) */
    .btn-play .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #00a2ff, #005ce6 60%, #003899); }
    .btn-play.playing .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #ffb300, #d97706 60%, #8c4a00); }
    .btn-stop .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #ff4d4d, #cc1111 60%, #770000); }
    .btn-secondary .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #a855f7, #7e22ce 60%, #4c1182); }
    .btn-info .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #00e5ff, #00a3cc 60%, #005a73); }
    .btn-warning .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #fb923c, #ea580c 60%, #8c2e04); }
    .btn-primary .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #38bdf8, #0284c7 60%, #034f78); }
    .btn-dark .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #334155, #1e293b 60%, #0f172a); }
    .btn-video .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #ffd700, #d49b00 60%, #805500); }
    .btn-close-video .deck-btn-crystal { background: radial-gradient(circle at 50% 28%, #64748b, #334155 60%, #1e293b); }

    /* 嵌入式 LCD 液晶監視艙基底 (起訖模組 / 提詞機 / 時鐘) */
    .lcd-monitor-screen {
      width: 100%;
      height: 100%;
      border-radius: 9px;
      background: #080a10;
      border: 1.5px solid #232936;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.85);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* 時鐘與講次 Widget */
    .widget-header-info .lcd-monitor-screen {
      padding: 4px 8px;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .widget-header-info .led-time {
      font-family: monospace;
      font-size: 20px;
      font-weight: 900;
      color: #00e5ff;
      text-shadow: 0 0 8px rgba(0,229,255,0.45);
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
    .widget-teleprompter .lcd-monitor-screen {
      padding: 8px 10px;
      align-items: stretch;
      justify-content: flex-start;
    }
    .prompter-header {
      font-size: 10px;
      color: #00e5ff;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      border-bottom: 1px solid rgba(0,229,255,0.15);
      padding-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .prompter-content {
      flex: 1;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.5;
      color: #00e676;
      text-shadow: 0 0 2px rgba(0,230,118,0.25);
      word-break: break-word;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .prompter-content::-webkit-scrollbar { width: 3px; }
    .prompter-content::-webkit-scrollbar-thumb { background: #232936; border-radius: 3px; }

    /* ⏱️ 手機端起訖段落控制艙 Widget */
    .widget-interval-box .lcd-monitor-screen {
      padding: 6px;
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
      background: #0f1420;
      border: 1px solid #232d3d;
      border-radius: 6px;
      padding: 2px 4px;
      overflow: hidden;
    }
    .field-tag {
      font-size: 11px;
      font-weight: 900;
      color: #00e5ff;
      margin-right: 4px;
    }
    .mobile-select {
      flex: 1;
      background: #0f1420;
      border: none;
      color: #f8fafc;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      width: 100%;
      color-scheme: dark;
    }
    .mobile-select option {
      background-color: #111827 !important;
      color: #f8fafc !important;
      padding: 6px 8px;
    }
    .mobile-select option:disabled {
      color: #64748b !important;
      background-color: #0b0f19 !important;
      text-decoration: line-through;
    }
    .interval-btn-row {
      display: flex;
      gap: 6px;
      width: 100%;
    }
    /* 嵌入式微型水晶操作鍵 */
    .int-action-btn {
      flex: 1;
      padding: 6px 0;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      font-weight: 900;
      color: #ffffff;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4);
      transition: transform 0.08s ease, filter 0.08s ease;
    }
    .int-action-btn:active {
      transform: translateY(1px) scale(0.96);
      box-shadow: inset 0 2px 5px rgba(0,0,0,0.9);
      filter: brightness(1.2);
    }
    .btn-int-play { background: radial-gradient(circle at 50% 30%, #ffaa00, #d97706 60%, #8c4a00); }
    .btn-int-loop { background: radial-gradient(circle at 50% 30%, #a855f7, #7e22ce 60%, #4c1182); }
    .btn-int-stop { background: radial-gradient(circle at 50% 30%, #64748b, #475569 60%, #334155); }

    /* ⏱️ 手機端起訖獨立字級切換鈕 */
    .int-scale-btn {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(0, 229, 255, 0.4);
      color: #00e5ff;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .int-scale-btn:active {
      transform: scale(0.92);
    }

    /* ⏱️ 起訖獨立字級檔位 (可單獨調控) */
    .widget-interval-box.int-font-sm .field-tag,
    .widget-interval-box.int-font-sm .mobile-select { font-size: 12px !important; }
    .widget-interval-box.int-font-md .field-tag,
    .widget-interval-box.int-font-md .mobile-select { font-size: 15px !important; font-weight: 800 !important; }
    .widget-interval-box.int-font-lg .field-tag,
    .widget-interval-box.int-font-lg .mobile-select { font-size: 18px !important; font-weight: 900 !important; }
    .widget-interval-box.int-font-xl .field-tag,
    .widget-interval-box.int-font-xl .mobile-select { font-size: 22px !important; font-weight: 900 !important; }

    /* 🔤 手機字體全域放縮支援 (100% ➔ 125% ➔ 150% ➔ 175% ➔ 200%) */
    /* 125% / 120% */
    body.mobile-font-125 .btn-label, body.mobile-font-120 .btn-label { font-size: 15px !important; font-weight: 900 !important; max-width: 96% !important; }
    body.mobile-font-125 .btn-glyph, body.mobile-font-120 .btn-glyph { font-size: 28px !important; }
    body.mobile-font-125 .deck-btn.span-wide .btn-label, body.mobile-font-120 .deck-btn.span-wide .btn-label { font-size: 15px !important; font-weight: 900 !important; }
    body.mobile-font-125 .int-action-btn, body.mobile-font-120 .int-action-btn { font-size: 14.5px !important; font-weight: 900 !important; }
    body.mobile-font-125 .field-tag, body.mobile-font-120 .field-tag { font-size: 13.5px !important; }
    body.mobile-font-125 .mobile-select, body.mobile-font-120 .mobile-select { font-size: 13.5px !important; }

    /* 150% / 140% */
    body.mobile-font-150 .btn-label, body.mobile-font-140 .btn-label { font-size: 17.5px !important; font-weight: 900 !important; max-width: 98% !important; }
    body.mobile-font-150 .btn-glyph, body.mobile-font-140 .btn-glyph { font-size: 33px !important; }
    body.mobile-font-150 .deck-btn.span-wide .btn-label, body.mobile-font-140 .deck-btn.span-wide .btn-label { font-size: 17.5px !important; font-weight: 900 !important; }
    body.mobile-font-150 .int-action-btn, body.mobile-font-140 .int-action-btn { font-size: 16.5px !important; font-weight: 900 !important; }
    body.mobile-font-150 .field-tag, body.mobile-font-140 .field-tag { font-size: 15.5px !important; font-weight: 900 !important; }
    body.mobile-font-150 .mobile-select, body.mobile-font-140 .mobile-select { font-size: 15.5px !important; font-weight: 800 !important; }

    /* 175% */
    body.mobile-font-175 .btn-label { font-size: 20px !important; font-weight: 900 !important; max-width: 98% !important; }
    body.mobile-font-175 .btn-glyph { font-size: 37px !important; }
    body.mobile-font-175 .deck-btn.span-wide .btn-label { font-size: 20px !important; font-weight: 900 !important; }
    body.mobile-font-175 .int-action-btn { font-size: 18.5px !important; font-weight: 900 !important; }
    body.mobile-font-175 .field-tag { font-size: 17.5px !important; font-weight: 900 !important; }
    body.mobile-font-175 .mobile-select { font-size: 17.5px !important; font-weight: 900 !important; }

    /* 200% (極限大字震撼體驗) */
    body.mobile-font-200 .btn-label { font-size: 22.5px !important; font-weight: 900 !important; max-width: 98% !important; }
    body.mobile-font-200 .btn-glyph { font-size: 42px !important; }
    body.mobile-font-200 .deck-btn.span-wide .btn-label { font-size: 22px !important; font-weight: 900 !important; }
    body.mobile-font-200 .int-action-btn { font-size: 20px !important; font-weight: 900 !important; }
    body.mobile-font-200 .field-tag { font-size: 20px !important; font-weight: 900 !important; }
    body.mobile-font-200 .mobile-select { font-size: 20px !important; font-weight: 900 !important; }

    /* 📖 講次與時鐘卡片可點擊提示光暈 */
    .clickable-header-lcd {
      cursor: pointer !important;
      transition: all 0.15s ease !important;
    }
    .clickable-header-lcd:hover {
      box-shadow: inset 0 0 12px rgba(0, 229, 255, 0.3), 0 0 12px rgba(0, 229, 255, 0.45) !important;
      border-color: #00e5ff !important;
    }
    .clickable-header-lcd:active {
      transform: scale(0.97);
      filter: brightness(1.15);
    }

    /* 📖 廣播級暗黑水晶講次直通艙 Modal */
    .lecture-modal-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(3, 7, 18, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 10000;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .lecture-modal-backdrop.show {
      display: flex;
    }
    .lecture-modal-card {
      background: linear-gradient(160deg, #111827, #0b0f19);
      border: 1.5px solid #00e5ff;
      border-radius: 16px;
      box-shadow: 0 0 25px rgba(0, 229, 255, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.2);
      width: 100%;
      max-width: 330px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: modal-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modal-pop {
      from { transform: scale(0.9) translateY(10px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }
    .lecture-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 229, 255, 0.2);
      padding-bottom: 6px;
    }
    .lecture-modal-title {
      font-size: 14px;
      font-weight: 900;
      color: #00e5ff;
      letter-spacing: 0.5px;
    }
    .lecture-modal-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      font-weight: 900;
      cursor: pointer;
      padding: 0 4px;
    }
    .lecture-modal-close:hover { color: #f8fafc; }
    .lecture-modal-display {
      background: #030712;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .lecture-display-raw {
      font-family: monospace;
      font-size: 32px;
      font-weight: 900;
      color: #38bdf8;
      letter-spacing: 2px;
      line-height: 1.1;
      min-height: 36px;
      display: flex;
      align-items: center;
    }
    .lecture-display-preview {
      font-size: 12px;
      font-weight: 700;
      color: #10b981;
      margin-top: 2px;
    }
    .lecture-pad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .pad-btn {
      padding: 12px 0;
      border-radius: 10px;
      border: 1px solid #1e293b;
      background: linear-gradient(145deg, #1e293b, #0f172a);
      color: #f8fafc;
      font-size: 18px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.5);
      transition: all 0.08s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pad-btn:active {
      transform: scale(0.94);
      filter: brightness(1.2);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
    }
    .pad-clear {
      background: linear-gradient(145deg, #334155, #1e293b);
      color: #f87171;
      font-size: 13px;
    }
    .pad-go {
      background: radial-gradient(circle at 50% 30%, #00e5ff, #0284c7 70%, #034f78);
      color: #ffffff;
      font-size: 14px;
      border-color: #38bdf8;
      box-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
    }

    .mobile-scale-pill {
      position: fixed;
      bottom: 8px;
      right: 8px;
      z-index: 9999;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 20px;
      backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      cursor: pointer;
    }
  </style>
</head>
<body>
  <!-- 📖 講次直通艙 Modal (支援 3/03/003/0003 智慧補零跳轉) -->
  <div class="lecture-modal-backdrop" id="lectureModalBackdrop">
    <div class="lecture-modal-card">
      <div class="lecture-modal-header">
        <span class="lecture-modal-title">📖 講次快速直通艙</span>
        <button class="lecture-modal-close" id="btnLectureModalClose">✕</button>
      </div>
      <div class="lecture-modal-display">
        <div class="lecture-display-raw" id="lectureDisplayRaw">0000</div>
        <div class="lecture-display-preview" id="lectureDisplayPreview">預覽: 請點按輸入講次</div>
      </div>
      <div class="lecture-pad-grid">
        <button class="pad-btn pad-num" data-num="1">1</button>
        <button class="pad-btn pad-num" data-num="2">2</button>
        <button class="pad-btn pad-num" data-num="3">3</button>
        <button class="pad-btn pad-num" data-num="4">4</button>
        <button class="pad-btn pad-num" data-num="5">5</button>
        <button class="pad-btn pad-num" data-num="6">6</button>
        <button class="pad-btn pad-num" data-num="7">7</button>
        <button class="pad-btn pad-num" data-num="8">8</button>
        <button class="pad-btn pad-num" data-num="9">9</button>
        <button class="pad-btn pad-clear" id="btnPadClear">⌫ 清除</button>
        <button class="pad-btn pad-num" data-num="0">0</button>
        <button class="pad-btn pad-go" id="btnPadGo">🚀 前往</button>
      </div>
    </div>
  </div>

  <button class="mobile-scale-pill" id="btnMobileScale" title="一鍵放大手機按鈕文字">🔤 100%</button>
  <div id="mobileDeckGrid">
    <div style="grid-column: 1 / span 4; grid-row: 4 / span 1; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:14px;">
      📡 正在連線 AMRTF 4×8 播控艙...
    </div>
  </div>

  <script>
    let isPlaying = false;
    let currentLayout = null;
    let currentState = null;

    // 🔤 手機字體放縮控制 (100% ➔ 125% ➔ 150% ➔ 175% ➔ 200%)
    const btnScale = document.getElementById('btnMobileScale');
    const scales = ['100', '125', '150', '175', '200'];
    let currentScale = localStorage.getItem('amrtf_mobile_font_scale') || '100';
    if (currentScale === '120') currentScale = '125';
    if (currentScale === '140') currentScale = '150';
    function applyScale(s) {
      scales.forEach(sc => document.body.classList.remove('mobile-font-' + sc));
      document.body.classList.remove('mobile-font-120', 'mobile-font-140');
      if (s !== '100') document.body.classList.add('mobile-font-' + s);
      if (btnScale) btnScale.textContent = '🔤 ' + s + '%';
    }
    applyScale(currentScale);
    if (btnScale) {
      btnScale.addEventListener('click', (e) => {
        e.stopPropagation();
        let idx = scales.indexOf(currentScale);
        idx = (idx + 1) % scales.length;
        currentScale = scales[idx];
        localStorage.setItem('amrtf_mobile_font_scale', currentScale);
        applyScale(currentScale);
      });
    }

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
            el.innerHTML = '<div class="lcd-monitor-screen clickable-header-lcd" id="btnHeaderInfoJump" title="點擊輸入講次跳轉 (例: 3/03/0003)">' +
                             '<div class="led-time" id="ledTime">00:00 / 00:00</div>' +
                             '<div class="lesson-title" id="lessonTitle">AMRTF 4×8 就緒</div>' +
                           '</div>';
            el.onclick = () => openLectureJumpModal();
          } else if (item.id === 'widget-teleprompter') {
            el.className += ' widget-teleprompter';
            el.innerHTML = '<div class="lcd-monitor-screen">' +
                             '<div class="prompter-header"><span>師父開示逐字提詞</span><span id="prompterStatus">即時</span></div>' +
                             '<div class="prompter-content" id="prompterBox">手抄稿即時提詞就緒...</div>' +
                           '</div>';
          } else if (item.id === 'widget-interval') {
            el.className += ' widget-interval-box';
            el.innerHTML = '<div class="lcd-monitor-screen">' +
                             '<div class="interval-select-row">' +
                               '<div class="interval-field">' +
                                 '<span class="field-tag">起</span>' +
                                 '<select class="mobile-select" id="mobileSelectStart"><option value="0">00:00 起點</option></select>' +
                               '</div>' +
                               '<div class="interval-field">' +
                                 '<span class="field-tag">訖</span>' +
                                 '<select class="mobile-select" id="mobileSelectEnd"><option value="0">00:00 訖點</option></select>' +
                               '</div>' +
                               '<button class="int-scale-btn" id="btnMobileIntScale" title="單獨切換起訖字級 (小/中/大/特大)">🔤</button>' +
                             '</div>' +
                             '<div class="interval-btn-row">' +
                               '<button class="int-action-btn btn-int-play" id="btnMobilePlayInterval">▶ 區間</button>' +
                               '<button class="int-action-btn btn-int-loop" id="btnMobileLoopInterval">🔁 循環</button>' +
                               '<button class="int-action-btn btn-int-stop" id="btnMobileStopInterval">⏹ 急煞</button>' +
                             '</div>' +
                           '</div>';
            setTimeout(() => setupMobileIntervalEvents(), 20);
          }
        } else {
          // 一般按鈕 (Stream Deck 3D 水晶透光鍵帽)
          el.className += ' deck-btn ' + (item.style || 'btn-secondary');
          if (item.w >= 2 && item.h >= 2) el.className += ' span-2x2';
          else if (item.h === 1 && item.w >= 2) el.className += ' span-wide';

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

          // 清理多餘 emoji 前後贅字，避免圖文重複
          let labelText = item.label || item.id;
          labelText = labelText.replace(/^[▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡\s]+/, '')
                               .replace(/[\s▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡]+$/, '').trim() || labelText;

          el.innerHTML = '<div class="deck-btn-crystal">' +
                           '<div class="btn-glyph">' + icon + '</div>' +
                           '<div class="btn-label">' + labelText + '</div>' +
                         '</div>';

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

    function updateMobileIntervalConstraints(changedTarget = 'init') {
      const selStart = document.getElementById('mobileSelectStart');
      const selEnd = document.getElementById('mobileSelectEnd');
      if (!selStart || !selEnd || selStart.options.length === 0 || selEnd.options.length === 0) return;

      let s = parseFloat(selStart.value) || 0;
      let e = parseFloat(selEnd.value) || 0;

      if (changedTarget === 'start' || changedTarget === 'init') {
        // 依據「起」約束「訖」
        let validEndFound = false;
        Array.from(selEnd.options).forEach((opt) => {
          const val = parseFloat(opt.value) || 0;
          const shouldDisable = val <= s;
          opt.disabled = shouldDisable;
          if (!shouldDisable && val === e) {
            validEndFound = true;
          }
        });
        // 若當前「訖」落在不合法區間 (<= 起)，自動順推至大於起點的下一個合法選項
        if (!validEndFound) {
          const nextValidOpt = Array.from(selEnd.options).find(opt => !opt.disabled);
          if (nextValidOpt) {
            selEnd.value = nextValidOpt.value;
            e = parseFloat(nextValidOpt.value) || 0;
          }
        }
        // 確保「起」選單最後一段不能當起點（除僅有 1 個選項外）
        const totalStarts = selStart.options.length;
        Array.from(selStart.options).forEach((opt, idx) => {
          opt.disabled = idx === totalStarts - 1 && totalStarts > 1;
        });
      } else if (changedTarget === 'end') {
        // 依據「訖」約束「起」
        let validStartFound = false;
        Array.from(selStart.options).forEach((opt) => {
          const val = parseFloat(opt.value) || 0;
          const shouldDisable = val >= e;
          opt.disabled = shouldDisable;
          if (!shouldDisable && val === s) {
            validStartFound = true;
          }
        });
        // 若當前「起」落在不合法區間 (>= 訖)，自動逆推至小於訖點的前一個合法選項
        if (!validStartFound) {
          const validStarts = Array.from(selStart.options).filter(opt => !opt.disabled);
          if (validStarts.length > 0) {
            selStart.value = validStarts[validStarts.length - 1].value;
            s = parseFloat(selStart.value) || 0;
          }
        }
      }
    }

    function setupMobileIntervalEvents() {
      const btnPlay = document.getElementById('btnMobilePlayInterval');
      const btnLoop = document.getElementById('btnMobileLoopInterval');
      const btnStop = document.getElementById('btnMobileStopInterval');
      const selStart = document.getElementById('mobileSelectStart');
      const selEnd = document.getElementById('mobileSelectEnd');

      if (selStart && !selStart.dataset.bound) {
        selStart.dataset.bound = 'true';
        selStart.onchange = () => updateMobileIntervalConstraints('start');
      }
      if (selEnd && !selEnd.dataset.bound) {
        selEnd.dataset.bound = 'true';
        selEnd.onchange = () => updateMobileIntervalConstraints('end');
      }

      if (btnPlay && !btnPlay.dataset.bound) {
        btnPlay.dataset.bound = 'true';
        btnPlay.onclick = () => {
          const start = parseFloat(selStart?.value) || 0;
          const end = parseFloat(selEnd?.value) || 0;
          if (end > start) {
            sendCommand('play_interval', { start, end, loop: false });
          } else {
            alert('訖點 (' + end + 's) 必須大於起點 (' + start + 's)！請選擇後續段落。');
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
            alert('訖點 (' + end + 's) 必須大於起點 (' + start + 's)！請選擇後續段落。');
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

      // 🔤 起訖獨立字級切換 (小 ➔ 中 ➔ 大 ➔ 特大)
      const btnIntScale = document.getElementById('btnMobileIntScale');
      const box = btnPlay ? btnPlay.closest('.widget-interval-box') : document.querySelector('.widget-interval-box');
      const INT_FONTS = ['int-font-sm', 'int-font-md', 'int-font-lg', 'int-font-xl'];
      const INT_LABELS = ['小', '中', '大', '特大'];
      let curIntFont = localStorage.getItem('amrtf_mobile_interval_font') || 'int-font-md';

      function applyIntFont(f) {
        if (!box) return;
        INT_FONTS.forEach(cls => box.classList.remove(cls));
        box.classList.add(f);
        const idx = INT_FONTS.indexOf(f);
        if (btnIntScale) btnIntScale.textContent = '🔤' + INT_LABELS[idx >= 0 ? idx : 1];
      }
      applyIntFont(curIntFont);

      if (btnIntScale && !btnIntScale.dataset.bound) {
        btnIntScale.dataset.bound = 'true';
        btnIntScale.onclick = (e) => {
          e.stopPropagation();
          let idx = INT_FONTS.indexOf(curIntFont);
          idx = (idx + 1) % INT_FONTS.length;
          curIntFont = INT_FONTS[idx];
          localStorage.setItem('amrtf_mobile_interval_font', curIntFont);
          applyIntFont(curIntFont);
          triggerHaptic();
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
        // 核心修復：廣播端 markers 秒數欄位為 m.sec
        const timeVal = parseFloat(m.sec ?? m.seconds ?? m.time ?? 0);
        const rawLabel = m.label || m.title || ('第 ' + (idx + 1) + ' 段');
        const min = Math.floor(timeVal / 60).toString().padStart(2, '0');
        const s = Math.floor(timeVal % 60).toString().padStart(2, '0');
        const timeDisplay = m.timeStr || (min + ':' + s);

        // 智慧去重：去除 rawLabel 前綴若已帶有 timeDisplay (例如 "00:00 (起點)" -> "(起點)")，消滅疊字！
        const escapedTime = timeDisplay.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const cleanLabel = (rawLabel || '').replace(new RegExp('^' + escapedTime + '\\s*'), '').trim();
        const displayLabel = cleanLabel ? (timeDisplay + ' ' + cleanLabel) : timeDisplay;

        const optS = document.createElement('option');
        optS.value = timeVal;
        optS.textContent = displayLabel;
        optS.style.backgroundColor = '#111827';
        optS.style.color = '#f8fafc';
        selStart.appendChild(optS);

        const optE = document.createElement('option');
        optE.value = timeVal;
        optE.textContent = displayLabel;
        optE.style.backgroundColor = '#111827';
        optE.style.color = '#f8fafc';
        selEnd.appendChild(optE);
      });

      if (curStartVal && Array.from(selStart.options).some(o => o.value === curStartVal)) {
        selStart.value = curStartVal;
      }
      if (curEndVal && Array.from(selEnd.options).some(o => o.value === curEndVal)) {
        selEnd.value = curEndVal;
      } else if (markers.length > 1) {
        selEnd.selectedIndex = Math.min(1, markers.length - 1);
      }

      // 初始化雙向防呆約束與變色
      updateMobileIntervalConstraints('init');
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

    // 📖 講次快速直通艙 Modal 核心控制器 (支援 3/03/003/0003 補零防呆)
    let currentLectureInput = '';

    function formatLectureNumber(raw) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return null;
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num <= 0 || num > 2000) return null;
      return num.toString().padStart(4, '0');
    }

    function openLectureJumpModal() {
      currentLectureInput = '';
      updateLectureDisplay();
      const modal = document.getElementById('lectureModalBackdrop');
      if (modal) {
        modal.classList.add('show');
        triggerHaptic();
      }
    }

    function closeLectureJumpModal() {
      const modal = document.getElementById('lectureModalBackdrop');
      if (modal) {
        modal.classList.remove('show');
        currentLectureInput = '';
        triggerHaptic();
      }
    }

    function updateLectureDisplay() {
      const rawEl = document.getElementById('lectureDisplayRaw');
      const prevEl = document.getElementById('lectureDisplayPreview');
      if (!rawEl || !prevEl) return;

      if (!currentLectureInput) {
        rawEl.textContent = '----';
        rawEl.style.color = '#64748b';
        prevEl.textContent = '預覽: 請點按輸入講次 (例: 3, 03, 566)';
        prevEl.style.color = '#94a3b8';
      } else {
        rawEl.textContent = currentLectureInput;
        rawEl.style.color = '#38bdf8';
        const formatted = formatLectureNumber(currentLectureInput);
        if (formatted) {
          prevEl.textContent = '預覽: 第 ' + formatted + ' 講 (符合 0003 格式)';
          prevEl.style.color = '#10b981';
        } else {
          prevEl.textContent = '⚠️ 請輸入 1 ~ 2000 之間的講次';
          prevEl.style.color = '#f87171';
        }
      }
    }

    function setupLectureModalEvents() {
      const closeBtn = document.getElementById('btnLectureModalClose');
      const backdrop = document.getElementById('lectureModalBackdrop');
      const clearBtn = document.getElementById('btnPadClear');
      const goBtn = document.getElementById('btnPadGo');

      if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = 'true';
        closeBtn.onclick = (e) => { e.stopPropagation(); closeLectureJumpModal(); };
      }
      if (backdrop && !backdrop.dataset.bound) {
        backdrop.dataset.bound = 'true';
        backdrop.onclick = (e) => {
          if (e.target === backdrop) closeLectureJumpModal();
        };
      }
      if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = 'true';
        clearBtn.onclick = (e) => {
          e.stopPropagation();
          triggerHaptic();
          if (currentLectureInput.length > 0) {
            currentLectureInput = currentLectureInput.slice(0, -1);
          }
          updateLectureDisplay();
        };
      }
      if (goBtn && !goBtn.dataset.bound) {
        goBtn.dataset.bound = 'true';
        goBtn.onclick = (e) => {
          e.stopPropagation();
          const formatted = formatLectureNumber(currentLectureInput);
          if (formatted) {
            triggerHaptic();
            sendCommand('goto_lesson', { lessonNumber: formatted, lectureId: formatted });
            closeLectureJumpModal();
          } else {
            alert('講次編號不正確，請輸入 1 到 2000 之間的數字！');
          }
        };
      }

      const numBtns = document.querySelectorAll('.pad-num');
      numBtns.forEach(btn => {
        if (!btn.dataset.bound) {
          btn.dataset.bound = 'true';
          btn.onclick = (e) => {
            e.stopPropagation();
            triggerHaptic();
            const num = btn.getAttribute('data-num');
            if (currentLectureInput.length < 4) {
              currentLectureInput += num;
              updateLectureDisplay();
            }
          };
        }
      });
    }

    // 初始化彈窗監聽
    setTimeout(() => setupLectureModalEvents(), 50);

    connectWs();
  </script>
</body>
</html>`;
  }
}
