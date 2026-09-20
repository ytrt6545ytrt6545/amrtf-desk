// ==============================================================================
// 📡 Companion 雙向中繼客端 (Companion WebSocket Client - Port 9999)
// ==============================================================================

import { WebSocket } from 'ws';

export class CompanionBridgeClient {
  constructor(port = 9999, onCommandReceived = null) {
    this.port = port;
    this.onCommandReceived = onCommandReceived;
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this.latestState = null;
  }

  start() {
    this.connect();
  }

  connect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }

    const url = `ws://127.0.0.1:${this.port}`;
    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log(`[CompanionBridge] 已連線至 Bitfocus Companion (Port ${this.port})`);
        // 回報分頁清單
        this.ws.send(JSON.stringify({
          type: 'TABS_LIST_UPDATE',
          tabs: [{ id: 1, lessonNumber: '', lessonTitle: 'AMRTF-Desk', isFocused: true }],
          activeTabId: 1
        }));
        if (this.latestState) {
          this.syncState(this.latestState);
        }
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ACTION' || msg.type === 'COMMAND') {
            const cmd = msg.command || msg.action;
            if (this.onCommandReceived && cmd) {
              this.onCommandReceived(cmd, msg.params || msg.args || {});
            }
          }
        } catch (e) {}
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.isConnected = false;
      });
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  syncState(state) {
    this.latestState = state;
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'STATE_UPDATE',
        data: state
      }));
    }
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
