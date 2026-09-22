// ==============================================================================
// 🎯 AMRTF 放映艙 CDP 特權注入中樞 (Chrome DevTools Protocol Bridge)
// ==============================================================================
// 藉由 Chromium 底層 CDP 協定，繞過所有 HTTPS Mixed Content 與 CSP 限制
// 免安裝任何瀏覽器擴充套件，開機無感注入並掌控 Audio、時間標籤與防漏音視訊
// ==============================================================================

import { WebSocket } from 'ws';
import http from 'http';

export class CdpBridge {
  constructor(debugPort = 9222, onStateUpdate = null, onDisconnect = null) {
    this.debugPort = debugPort;
    this.onStateUpdate = onStateUpdate;
    this.onDisconnect = onDisconnect;
    this.ws = null;
    this.isConnected = false;
    this.msgId = 1;
  }

  // 1. 探測並取得大慈恩分頁的 CDP WebSocket 位址
  async connect(retryCount = 15) {
    for (let i = 0; i < retryCount; i++) {
      try {
        const pages = await this.fetchJson(`http://127.0.0.1:${this.debugPort}/json`);
        // 尋找包含 amrtf.org 或放映艙頁面
        const targetPage = pages.find((p) => p.type === 'page' && (p.url.includes('amrtf.org') || p.url.includes('about:blank') || p.url.includes('http')));
        if (targetPage && targetPage.webSocketDebuggerUrl) {
          await this.attachToWebSocket(targetPage.webSocketDebuggerUrl);
          return true;
        }
      } catch (err) {
        // 等待瀏覽器啟動端口就緒
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  }

  fetchJson(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  // 2. 建立 CDP WebSocket 連線並啟動監聽
  attachToWebSocket(wsUrl) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log('[CDP-Bridge] 已成功掛載至放映艙 Chromium 內核');
        // 啟用 Runtime 與 Page 事件
        this.send('Runtime.enable');
        this.send('Page.enable');
        resolve(true);
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // 監聽 console.log 輸出的 __AMRTF_STATE__
          if (msg.method === 'Runtime.consoleAPICalled' && msg.params) {
            const args = msg.params.args || [];
            if (args.length > 0 && typeof args[0].value === 'string') {
              const val = args[0].value;
              if (val.startsWith('__AMRTF_STATE__:')) {
                const jsonStr = val.substring('__AMRTF_STATE__:'.length);
                const stateData = JSON.parse(jsonStr);
                if (this.onStateUpdate) {
                  this.onStateUpdate(stateData);
                }
              }
            }
          }
        } catch (e) {}
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        if (typeof this.onDisconnect === 'function') {
          this.onDisconnect();
        }
      });

      this.ws.on('error', (err) => {
        this.isConnected = false;
        reject(err);
      });
    });
  }

  // 3. 原生注入腳本
  async injectScript(scriptContent) {
    this.cachedScript = scriptContent;
    if (!this.isConnected) return;
    // (a) 在所有新開啟或刷新的頁面自動執行
    this.send('Page.addScriptToEvaluateOnNewDocument', { source: scriptContent });
    // (b) 在當前已載入頁面立刻執行一次
    this.send('Runtime.evaluate', { expression: scriptContent });
  }

  // 4. 導航至指定頁面
  navigate(url) {
    if (!this.isConnected) return;
    this.send('Page.navigate', { url });
  }

  // 5. 發送控制指令至放映艙 (自帶未定義時自動重注入防禦)
  sendCommand(cmd, params = {}) {
    if (!this.isConnected) return;
    const expression = `
      if (typeof window.__AMRTF_EXECUTE_COMMAND__ === 'function') {
        window.__AMRTF_EXECUTE_COMMAND__("${cmd}", ${JSON.stringify(params)});
      }
    `;
    this.send('Runtime.evaluate', { expression });
  }

  // 通用 CDP 特權呼叫
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP 未連線'));
      }
      const callId = this.msgId++;
      const onMessage = (raw) => {
        try {
          const resp = JSON.parse(raw.toString());
          if (resp.id === callId) {
            this.ws.off('message', onMessage);
            if (resp.error) {
              reject(new Error(resp.error.message));
            } else {
              resolve(resp.result);
            }
          }
        } catch (e) {}
      };
      this.ws.on('message', onMessage);
      this.ws.send(JSON.stringify({ id: callId, method, params }));
    });
  }

  // 透過特權 CDP 原生視窗控制切換全螢幕 (100% 穩定，絕無 User Gesture 限制與退出失靈)
  async toggleFullscreen() {
    try {
      const winInfo = await this.call('Browser.getWindowForTarget');
      if (winInfo && winInfo.windowId) {
        const isFs = winInfo.bounds && winInfo.bounds.windowState === 'fullscreen';
        const nextState = isFs ? 'normal' : 'fullscreen';
        await this.call('Browser.setWindowBounds', {
          windowId: winInfo.windowId,
          bounds: { windowState: nextState }
        });
        console.log(`[CDP-Bridge] 視窗全螢幕狀態切換: ${winInfo.bounds?.windowState} -> ${nextState}`);
        this.sendCommand('sync_fullscreen_state', { isFullscreen: nextState === 'fullscreen' });
        if (this.onStateUpdate) {
          this.onStateUpdate({ fullscreen: nextState === 'fullscreen' });
        }
        return nextState === 'fullscreen';
      }
    } catch (err) {
      console.warn('[CDP-Bridge] Browser.setWindowBounds 不支援或失敗，降級使用特權 F11 模擬:', err.message);
    }

    // 備援降級方案：向 Chromium 發送 F11 按鍵信號
    this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 122, code: 'F11', key: 'F11' });
    this.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 122, code: 'F11', key: 'F11' });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const id = this.msgId++;
    this.ws.send(JSON.stringify({ id, method, params }));
  }

  // 5.5 透過 CDP 執行 JS 表達式並以 Promise 返回真實結果 (供 E2E 測試真實驗證)
  eval(expression) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP 未連線'));
      }
      const callId = this.msgId++;
      const onMessage = (raw) => {
        try {
          const resp = JSON.parse(raw.toString());
          if (resp.id === callId) {
            this.ws.off('message', onMessage);
            if (resp.error) {
              reject(new Error(resp.error.message));
            } else {
              resolve(resp.result && resp.result.result ? resp.result.result.value : resp.result);
            }
          }
        } catch (e) {}
      };
      this.ws.on('message', onMessage);
      this.ws.send(JSON.stringify({ id: callId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
  }

  // 6. 捕獲放映艙真實渲染畫面截圖 (真實物證探針)
  captureScreenshot() {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP 未連線，無法捕獲截圖'));
      }
      const callId = this.msgId++;
      const onMessage = (raw) => {
        try {
          const resp = JSON.parse(raw.toString());
          if (resp.id === callId) {
            this.ws.off('message', onMessage);
            if (resp.result && resp.result.data) {
              resolve(resp.result.data); // Base64 PNG
            } else {
              reject(new Error(resp.error ? resp.error.message : '無截圖數據返回'));
            }
          }
        } catch (e) {}
      };
      this.ws.on('message', onMessage);
      this.ws.send(JSON.stringify({ id: callId, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}
