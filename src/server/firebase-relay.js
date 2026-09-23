/**
 * AMRTF 大慈恩雲端手機遙控中繼器 (Firebase Relay Manager)
 * 遵循「100% 密碼學純掃碼、多房間物理隔離、差分信令與零垃圾自毀」架構
 * 支援 Firebase Realtime Database 原生 SSE 雙向穿透，跨越 AP 隔離與 Mixed Content
 */

import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

export class FirebaseRelayManager {
  /**
   * @param {Object} options
   * @param {Function} options.dispatchCommand 接收手機信令後的派發回呼
   * @param {string} [options.hostingDomain] Firebase Hosting 網域
   * @param {string} [options.rtdbUrl] Firebase Realtime Database 根網址
   * @param {string} [options.storageFile] 房間憑證持久化路徑
   */
  constructor(options = {}) {
    this.dispatchCommand = options.dispatchCommand || (() => {});
    this.hostingDomain = options.hostingDomain || 'https://my-amrtf.web.app';
    this.rtdbUrl = options.rtdbUrl || process.env.FIREBASE_RTDB_URL || 'https://directordeck-bba31-default-rtdb.asia-southeast1.firebasedatabase.app';
    this.mobileLayoutStore = options.mobileLayoutStore || null;

    // 1. 每次啟動產生全新隨機高熵 Token 與 Room ID (恪守長官指示：不固化房間，下課即焚 Zero-Garbage)
    this.token = options.token || this.generateSecureToken();
    this.roomId = options.roomId || this.generateRoomId();

    // 3. 取得初始 4×8 自訂版面
    this.currentLayout = this.mobileLayoutStore ? this.mobileLayoutStore.getLayout() : null;

    // 記憶體中繼房間池 (支援本地回環測試與 100 間虛擬教室多租戶隔離)
    this.activeRooms = new Map();
    this.registerLocalRoom(this.roomId, this.token, this.currentLayout);

    // 當前放映快照狀態
    this.currentState = {
      lesson: 1,
      title: '大慈恩研討課堂',
      page: 1,
      total_pages: 1,
      is_playing: false,
      current_time: 0,
      duration: 0,
      is_muted: false,
      markers: [],
      updated_at: Date.now()
    };

    this.rtdbStreamReq = null;
    this.isDestroyed = false;
    this.lastStateSyncTime = 0;
    this.stateSyncDebounceTimer = null;
    this.processedCommandIds = new Set();

    this.enableCloud = !!options.enableCloud;

    console.log(`☁️ [Firebase-Relay] 雲端中繼模組已初始化`);
    console.log(`   └─ 房間識別 (Room ID): ${this.roomId}`);
    console.log(`   └─ 安全金鑰 (Token): ${this.token}`);
    console.log(`   └─ 純掃碼直通 URL: ${this.getRemoteUrl()}`);

    // 非同步啟動 Firebase 雲端穿透中繼 (若啟用)
    if (this.enableCloud) {
      this.initCloudBridge();
    }
  }

  /**
   * 生成 32 碼密碼學安全隨機 Token (Base64URL)
   */
  generateSecureToken() {
    return crypto.randomBytes(24).toString('base64url');
  }

  /**
   * 生成 8 碼房間識別代碼 (排除易混淆字符 0, O, 1, I)
   */
  generateRoomId() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return `ROOM-${code}`;
  }

  /**
   * 註冊本地/記憶體沙盒房間
   */
  registerLocalRoom(roomId, token, layout = null) {
    this.activeRooms.set(roomId, {
      roomId,
      token,
      clients: new Set(),
      layout: layout || (this.mobileLayoutStore ? this.mobileLayoutStore.getLayout() : null),
      state: { ...this.currentState },
      created_at: Date.now()
    });
  }

  /**
   * 取得房間自訂版面
   */
  getRoomLayout(roomId, token) {
    if (!this.validateAccess(roomId, token)) return null;
    const room = this.activeRooms.get(roomId);
    return room ? room.layout : null;
  }

  /**
   * 取得房間放映狀態
   */
  getRoomState(roomId, token) {
    if (!this.validateAccess(roomId, token)) return null;
    const room = this.activeRooms.get(roomId);
    return room ? room.state : null;
  }

  /**
   * 取得手機純掃碼直通 URL
   */
  getRemoteUrl(baseDomain = null, hostParam = null) {
    const domain = baseDomain || this.hostingDomain;
    let url = `${domain}/?room=${encodeURIComponent(this.roomId)}&token=${encodeURIComponent(this.token)}`;
    if (hostParam) {
      url += `&host=${encodeURIComponent(hostParam)}`;
    }
    return url;
  }

  /**
   * 取得給主控台前端渲染的雲端中繼資訊
   */
  getRelayInfo(localOrigin = '') {
    let hostParam = null;
    if (localOrigin) {
      try {
        const u = new URL(localOrigin);
        hostParam = u.host;
      } catch (e) {
        hostParam = localOrigin.replace(/^https?:\/\//, '');
      }
    }

    if (this.mobileLayoutStore) {
      this.currentLayout = this.mobileLayoutStore.getLayout();
      const r = this.activeRooms.get(this.roomId);
      if (r) r.layout = this.currentLayout;
    }

    return {
      enabled: true,
      roomId: this.roomId,
      token: this.token,
      cloudUrl: this.getRemoteUrl(null, null),
      localUrl: localOrigin ? `${localOrigin}/mobile-app/?room=${encodeURIComponent(this.roomId)}&token=${encodeURIComponent(this.token)}` : '',
      state: this.currentState,
      layout: this.currentLayout
    };
  }

  /**
   * 校驗請求的 Room 與 Token
   */
  validateAccess(roomId, token) {
    if (!roomId || !token) return false;
    const room = this.activeRooms.get(roomId);
    if (!room) return false;
    return room.token === token;
  }

  /**
   * 接收手機端傳來的指令 (經過 Token 校驗)
   */
  handleIncomingCommand(roomId, token, action, payload = {}) {
    if (!this.validateAccess(roomId, token)) {
      console.warn(`🔒 [Firebase-Relay] 拒絕未經授權之信令: room=${roomId}`);
      return { success: false, error: 'UNAUTHORIZED_TOKEN' };
    }

    try {
      this.dispatchCommand(action, payload);
      return { success: true, action };
    } catch (err) {
      console.error(`❌ [Firebase-Relay] 派發信令錯誤:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 當主控台修改 4×8 版面時，熱推播給本地客戶端與雲端
   */
  broadcastMobileLayout(layout) {
    this.currentLayout = layout;
    const room = this.activeRooms.get(this.roomId);
    if (room) {
      room.layout = layout;
      const envelope = JSON.stringify({
        type: 'MOBILE_LAYOUT_UPDATED',
        room: this.roomId,
        layout: layout
      });
      for (const client of room.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          try { client.send(envelope); } catch (e) {}
        }
      }
    }
    // 同步至 Firebase 雲端 RTDB
    this.pushLayoutToCloud(layout);
    // 連動更新 state 中的版面版本號，雙重觸發手機端熱突變
    this.broadcastState({ layout_version: layout.updatedAt || Date.now() });
  }

  /**
   * 放映狀態突變時，廣播更新至房間與雲端
   */
  broadcastState(partialState = {}) {
    Object.assign(this.currentState, partialState, { updated_at: Date.now() });

    const room = this.activeRooms.get(this.roomId);
    if (room) {
      room.state = { ...this.currentState };
      const envelope = JSON.stringify({
        type: 'ROOM_STATE_SYNC',
        room: this.roomId,
        state: this.currentState
      });
      for (const client of room.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(envelope);
        }
      }
    }

    // 防抖同步至 Firebase 雲端 RTDB (300ms 節流，重要段落 markers 立即同步)
    this.scheduleStateSyncToCloud(partialState.markers !== undefined);
  }

  /**
   * 註冊 WebSocket 客戶端至專屬房間
   */
  attachClient(roomId, token, wsClient) {
    if (!this.validateAccess(roomId, token)) {
      wsClient.close(4001, 'Unauthorized Room or Token');
      return false;
    }

    const room = this.activeRooms.get(roomId);
    room.clients.add(wsClient);

    wsClient.send(JSON.stringify({
      type: 'ROOM_STATE_SYNC',
      room: roomId,
      state: room.state
    }));

    if (room.layout) {
      wsClient.send(JSON.stringify({
        type: 'MOBILE_LAYOUT_UPDATED',
        room: roomId,
        layout: room.layout
      }));
    }

    wsClient.on('close', () => {
      room.clients.delete(wsClient);
    });

    return true;
  }

  // ==============================================================================
  // ☁️ Firebase Realtime Database 穿透中繼核心
  // ==============================================================================

  async callRtdb(pathStr, method = 'GET', body = null, force = false) {
    if (!this.rtdbUrl || (this.isDestroyed && !force)) return null;
    const url = `${this.rtdbUrl}${pathStr}.json`;
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== null) {
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, opts);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // 靜默容錯，防止外網連線短暫抖動影響本機播控
    }
    return null;
  }

  async initCloudBridge() {
    try {
      // 1. 於雲端註冊房間元數據 (Meta)
      await this.callRtdb(`/amrtf/rooms/${this.roomId}/meta`, 'PUT', {
        roomId: this.roomId,
        token: this.token,
        created_at: Date.now()
      });

      // 2. 初始化雲端 4×8 版面
      if (this.currentLayout) {
        await this.pushLayoutToCloud(this.currentLayout);
      }

      // 3. 初始化雲端初始狀態
      await this.callRtdb(`/amrtf/rooms/${this.roomId}/state`, 'PUT', this.currentState);

      // 4. 啟動指令即時串流監聽器 (SSE)
      this.startCloudCommandStream();
      console.log(`🌐 [Firebase-Relay] 雲端即時資料庫穿透中繼已激活！(亞洲東南機房 Low-Latency)`);
    } catch (err) {
      console.warn(`⚠️ [Firebase-Relay] 雲端初始化提醒:`, err.message);
    }
  }

  async pushLayoutToCloud(layout) {
    if (!layout) return;
    await this.callRtdb(`/amrtf/rooms/${this.roomId}/layout`, 'PUT', layout);
  }

  scheduleStateSyncToCloud(immediate = false) {
    const now = Date.now();
    if (immediate || now - this.lastStateSyncTime > 1500) {
      if (this.stateSyncDebounceTimer) {
        clearTimeout(this.stateSyncDebounceTimer);
        this.stateSyncDebounceTimer = null;
      }
      this.lastStateSyncTime = now;
      this.callRtdb(`/amrtf/rooms/${this.roomId}/state`, 'PUT', this.currentState);
    } else if (!this.stateSyncDebounceTimer) {
      this.stateSyncDebounceTimer = setTimeout(() => {
        this.stateSyncDebounceTimer = null;
        this.lastStateSyncTime = Date.now();
        this.callRtdb(`/amrtf/rooms/${this.roomId}/state`, 'PUT', this.currentState);
      }, 500);
    }
  }

  startCloudCommandStream() {
    if (this.isDestroyed || !this.rtdbUrl) return;

    try {
      const streamUrl = `${this.rtdbUrl}/amrtf/rooms/${this.roomId}/commands.json`;
      const parsed = new URL(streamUrl);

      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'Accept': 'text/event-stream' }
      };

      this.rtdbStreamReq = https.get(options, (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留尚未成行的殘餘

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              const rawData = line.replace('data:', '').trim();
              if (rawData && rawData !== 'null') {
                this.handleCloudStreamData(eventType, rawData);
              }
            }
          }
        });

        res.on('end', () => {
          if (!this.isDestroyed) {
            setTimeout(() => this.startCloudCommandStream(), 3000);
          }
        });
      });

      this.rtdbStreamReq.on('error', () => {
        if (!this.isDestroyed) {
          setTimeout(() => this.startCloudCommandStream(), 5000);
        }
      });
    } catch (e) {
      if (!this.isDestroyed) {
        setTimeout(() => this.startCloudCommandStream(), 5000);
      }
    }
  }

  handleCloudStreamData(eventType, rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (!parsed || parsed.data === undefined || parsed.data === null) return;

      const path = parsed.path || '/';
      const data = parsed.data;

      const commandsToProcess = [];

      if (path === '/') {
        // 全量快照：{ [cmdId]: { action, token, payload } }
        if (typeof data === 'object') {
          for (const [cmdId, cmdObj] of Object.entries(data)) {
            if (cmdObj && typeof cmdObj === 'object' && cmdObj.action) {
              commandsToProcess.push({ cmdId, cmdData: cmdObj });
            }
          }
        }
      } else {
        // 增量單筆推送：path 為 "/-P2Ap..."，data 為 { action, token, payload }
        const cmdId = path.replace(/^\//, '').split('/')[0];
        if (cmdId && data && typeof data === 'object' && data.action) {
          commandsToProcess.push({ cmdId, cmdData: data });
        }
      }

      for (const { cmdId, cmdData } of commandsToProcess) {
        if (this.processedCommandIds.has(cmdId)) continue;
        this.processedCommandIds.add(cmdId);

        // 限制已處理命令快取大小
        if (this.processedCommandIds.size > 200) {
          const firstKey = this.processedCommandIds.values().next().value;
          this.processedCommandIds.delete(firstKey);
        }

        // 驗證 Token 安全防護
        if (cmdData.token === this.token) {
          console.log(`📱 [雲端穿透信令] 成功執行手機指令: 【${cmdData.action}】`, cmdData.payload || {});
          try {
            this.dispatchCommand(cmdData.action, cmdData.payload || {});
          } catch (e) {
            console.error('執行指令失敗:', e);
          }

          // 零垃圾自毀：刪除已執行的指令
          this.callRtdb(`/amrtf/rooms/${this.roomId}/commands/${cmdId}`, 'DELETE');
        } else {
          console.warn(`🔒 [Firebase-Relay] 拒絕未經授權之雲端信令: room=${this.roomId}`);
        }
      }
    } catch (e) {
      console.warn('[Firebase-Relay] 解析雲端串流異常:', e);
    }
  }

  /**
   * 銷毀房間 (符合 onDisconnect 自毀機制，零垃圾積累 Zero-Garbage)
   */
  async destroyRoom(roomId, eraseCloud = true) {
    if (this.stateSyncDebounceTimer) {
      clearTimeout(this.stateSyncDebounceTimer);
      this.stateSyncDebounceTimer = null;
    }
    if (this.rtdbStreamReq) {
      try { this.rtdbStreamReq.destroy(); } catch (e) {}
    }
    const room = this.activeRooms.get(roomId);
    if (room) {
      for (const client of room.clients) {
        try { client.close(1000, 'Room destroyed'); } catch (e) {}
      }
      this.activeRooms.delete(roomId);
    }
    if (eraseCloud) {
      try {
        await this.callRtdb(`/amrtf/rooms/${roomId}`, 'DELETE', null, true);
        console.log(`🧹 [Firebase-Relay] 房間 ${roomId} 已安全銷毀 (Zero-Garbage)`);
      } catch (e) {}
    }
    this.isDestroyed = true;
  }
}
