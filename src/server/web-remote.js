// ==============================================================================
// 📱 AMRTF 手機行動手把遙控服務 (Web Remote Server - Port 9998)
// ==============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REMOTE_HTML_PATH = path.resolve(__dirname, '../../public/remote.html');

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
          if ((payload.type === 'ACTION' || payload.type === 'COMMAND') && this.onCommandReceived) {
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
    if (fs.existsSync(REMOTE_HTML_PATH)) {
      return fs.readFileSync(REMOTE_HTML_PATH, "utf-8");
    }
    return "<!DOCTYPE html><html><body><h1>AMRTF Remote UI File Missing</h1></body></html>";
  }
}
