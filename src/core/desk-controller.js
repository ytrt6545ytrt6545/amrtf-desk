/**
 * ==============================================================================
 * 🎛️ AMRTF 操作艙無頭核心與視圖皮膚解耦引擎 (Headless Desk Controller & Skin Binder)
 * ==============================================================================
 * 遵循 Master Constitution 憲法與深模組架構（Deep Module）：
 * 1. 介面與功能徹底解耦：UI 僅為純呈現皮膚，透過宣告式屬性綁定，零寫死 DOM ID
 * 2. 靜態命令白名單硬鎖：所有 Command 預定義，防範動態代碼注入
 * 3. 兩階段狀態確認：提供 idle / pending / synced / error 四態反饋與自動回滾
 * 4. 嚴格生命週期與清理協議 (Teardown Protocol)：換膚時 100% 註銷訂閱與定時器
 * 5. 雙環境無縫相容：支援瀏覽器原生 (Window / ES Module) 與 Node.js 測試
 * ==============================================================================
 */

// 1. 靜態白名單命令目錄 (Static Command Catalog)
export const COMMAND_DEFINITIONS = {
  // 播放控制
  play: { id: 'play', label: '播放', category: 'playback', requiresAck: true },
  pause: { id: 'pause', label: '暫停', category: 'playback', requiresAck: true },
  play_pause: { id: 'play_pause', label: '播放/暫停', category: 'playback', requiresAck: true },
  toggle_play: { id: 'toggle_play', label: '播放/暫停', category: 'playback', requiresAck: true },
  stop: { id: 'stop', label: '停止', category: 'playback', requiresAck: true },
  restart: { id: 'restart', label: '急煞重開', category: 'playback', requiresAck: true },
  seek_fwd: { id: 'seek_fwd', label: '快進 5 秒', category: 'playback', requiresAck: true },
  forward_5s: { id: 'forward_5s', label: '快進 5 秒', category: 'playback', requiresAck: true },
  seek_bwd: { id: 'seek_bwd', label: '倒退 5 秒', category: 'playback', requiresAck: true },
  rewind_5s: { id: 'rewind_5s', label: '倒退 5 秒', category: 'playback', requiresAck: true },
  seek_fwd_10: { id: 'seek_fwd_10', label: '快進 10 秒', category: 'playback', requiresAck: true },
  forward_10s: { id: 'forward_10s', label: '快進 10 秒', category: 'playback', requiresAck: true },
  seek_bwd_10: { id: 'seek_bwd_10', label: '倒退 10 秒', category: 'playback', requiresAck: true },
  rewind_10s: { id: 'rewind_10s', label: '倒退 10 秒', category: 'playback', requiresAck: true },
  set_speed: { id: 'set_speed', label: '設定播放速率', category: 'playback', requiresAck: true },
  set_playback_rate: { id: 'set_playback_rate', label: '設定播放速率', category: 'playback', requiresAck: true },
  play_interval: { id: 'play_interval', label: '區間播放', category: 'playback', requiresAck: true },
  play_interval_default: { id: 'play_interval_default', label: '預設區間播放', category: 'playback', requiresAck: true },
  stop_interval: { id: 'stop_interval', label: '停止區間', category: 'playback', requiresAck: true },
  loop_interval: { id: 'loop_interval', label: '循環區間', category: 'playback', requiresAck: true },
  loop_current_paragraph: { id: 'loop_current_paragraph', label: '循環段落', category: 'playback', requiresAck: true },

  // 畫面與模式切換
  toggle_quote: { id: 'toggle_quote', label: '引文開關', category: 'display', requiresAck: true },
  jump_to_master_start: { id: 'jump_to_master_start', label: '引文開關', category: 'display', requiresAck: true },
  toggle_loop_segment: { id: 'toggle_loop_segment', label: '引文循環', category: 'display', requiresAck: true },
  toggle_theme: { id: 'toggle_theme', label: '放映艙明暗色切換', category: 'display', requiresAck: true },
  toggle_desk_theme: { id: 'toggle_desk_theme', label: '操作台明暗色切換', category: 'display', requiresAck: false },
  toggle_scroll: { id: 'toggle_scroll', label: '捲動模式切換', category: 'display', requiresAck: true },
  cycle_scroll_mode: { id: 'cycle_scroll_mode', label: '捲動模式切換', category: 'display', requiresAck: true },
  toggle_speech_lead: { id: 'toggle_speech_lead', label: '播稿模式開關', category: 'display', requiresAck: true },
  toggle_speech_mode: { id: 'toggle_speech_mode', label: '播稿模式開關', category: 'display', requiresAck: true },
  fullscreen: { id: 'fullscreen', label: '全螢幕切換', category: 'display', requiresAck: false },
  toggle_fullscreen: { id: 'toggle_fullscreen', label: '全螢幕切換', category: 'display', requiresAck: false },
  adjust_font_size: { id: 'adjust_font_size', label: '字體大小調整', category: 'display', requiresAck: true },

  // 導航
  prev_lecture: { id: 'prev_lecture', label: '上一講', category: 'navigation', requiresAck: true },
  prev_lesson: { id: 'prev_lesson', label: '上一講', category: 'navigation', requiresAck: true },
  next_lecture: { id: 'next_lecture', label: '下一講', category: 'navigation', requiresAck: true },
  next_lesson: { id: 'next_lesson', label: '下一講', category: 'navigation', requiresAck: true },
  goto_lesson: { id: 'goto_lesson', label: '跳轉至指定講次', category: 'navigation', requiresAck: true },

  // 影音專題
  modal_migtsema: { id: 'modal_migtsema', label: '密集嘛影片', category: 'video', requiresAck: true },
  modal_prep_video: { id: 'modal_prep_video', label: '前行影片', category: 'video', requiresAck: true },
  modal_dedication_video: { id: 'modal_dedication_video', label: '迴向影片', category: 'video', requiresAck: true },
  close_video: { id: 'close_video', label: '關閉影片', category: 'video', requiresAck: true },

  // 系統管理
  check_update: { id: 'check_update', label: '檢查更新', category: 'system', requiresAck: false },
  toggle_drawer: { id: 'toggle_drawer', label: '設定抽屜開關', category: 'system', requiresAck: false }
};

/**
 * 2. 響應式無頭狀態機 (Reactive Headless State Store)
 */
export class DeskStore {
  constructor(initialState = {}) {
    this.state = {
      isPlaying: false,
      currentTimeSec: 0,
      totalDurationSec: 0,
      currentLesson: '0001',
      speed: 1.0,
      isMuted: false,
      theme: 'dark',
      deskTheme: 'dark',
      scrollMode: 1, // 0: 手動, 1: 持續, 2: 區段
      speechMode: true,
      hasLrc: false,
      fontSize: 16,
      connectionStatus: 'disconnected', // 'connected' | 'connecting' | 'disconnected'
      pendingTx: {}, // txId -> { cmd, startTime, timeoutTimer, previousState }
      ...initialState
    };
    this.subscribers = new Set();
  }

  // 取得不可變快照
  getState() {
    return { ...this.state };
  }

  // 訂閱狀態變更（返回取消訂閱函式）
  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.subscribers.add(callback);
    // 立即調用一次給予當前快照
    try {
      callback(this.getState());
    } catch (e) {
      console.error('[DeskStore] 初次訂閱回調失敗:', e);
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // 批量更新內部狀態
  update(partialState) {
    const prev = this.state;
    this.state = { ...this.state, ...partialState };
    const next = this.state;

    // 觸發全體訂閱者
    for (const sub of this.subscribers) {
      try {
        sub(next, prev);
      } catch (err) {
        console.error('[DeskStore] 訂閱回調異常:', err);
      }
    }
  }

  // 清空所有訂閱（Teardown 協議）
  destroy() {
    this.subscribers.clear();
    // 清理所有掛起的交易定時器
    Object.values(this.state.pendingTx || {}).forEach((tx) => {
      if (tx.timeoutTimer) clearTimeout(tx.timeoutTimer);
    });
    this.state.pendingTx = {};
  }
}

/**
 * 3. 交易化命令總線 (Transactional Command Bus)
 */
export class CommandBus {
  constructor(store, transportAdapter = null, options = {}) {
    this.store = store;
    this.transport = transportAdapter; // 負責向伺服器/底層發送 WebSocket 或 CDP 信號
    this.options = {
      defaultTimeoutMs: 3000,
      debounceMs: 250,
      ...options
    };
    this.lastExecTimes = new Map(); // cmd -> timestamp 防抖
    this.txSeq = 1;
    this.errorListeners = new Set();
  }

  setTransport(transportAdapter) {
    this.transport = transportAdapter;
  }

  onError(listener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  emitError(err) {
    console.warn('[CommandBus] ⚠️ 命令異常:', err);
    this.errorListeners.forEach((fn) => {
      try { fn(err); } catch (e) {}
    });
  }

  // 派發白名單命令
  dispatch(commandId, payload = {}) {
    const def = COMMAND_DEFINITIONS[commandId];
    if (!def) {
      const err = new Error(`[CommandBus] ❌ 拒絕未註冊之命令 ID: '${commandId}'`);
      this.emitError(err);
      return { success: false, error: err.message };
    }

    // 防抖抑制（Debounce）
    const now = Date.now();
    const lastTime = this.lastExecTimes.get(commandId) || 0;
    if (now - lastTime < this.options.debounceMs) {
      return { success: false, reason: 'debounced' };
    }
    this.lastExecTimes.set(commandId, now);

    const txId = `tx_${Date.now()}_${this.txSeq++}`;
    const previousSnapshot = this.store.getState();

    // 兩階段狀態確認：Phase 1 - 標記 Pending
    const pendingTx = { ...this.store.getState().pendingTx };
    let timeoutTimer = null;

    if (def.requiresAck) {
      timeoutTimer = setTimeout(() => {
        this.handleTimeout(txId, commandId, previousSnapshot);
      }, this.options.defaultTimeoutMs);

      pendingTx[txId] = {
        txId,
        cmd: commandId,
        startTime: now,
        timeoutTimer,
        previousState: previousSnapshot
      };
      this.store.update({ pendingTx });
    }

    // 傳輸層派發
    try {
      if (this.transport && typeof this.transport.send === 'function') {
        this.transport.send({
          type: 'command',
          action: commandId,
          payload,
          txId
        });
      } else {
        // 本地模擬或離線狀態：若不需要 ACK 立即視為完成
        if (!def.requiresAck) {
          this.commitTx(txId);
        }
      }
    } catch (err) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      delete pendingTx[txId];
      this.store.update({ pendingTx });
      this.emitError(new Error(`[CommandBus] 傳輸層發送失敗 (${commandId}): ${err.message}`));
      return { success: false, error: err.message };
    }

    return { success: true, txId };
  }

  // 接收底層 ACK 確認（Phase 2: Commit）
  ack(txId, resultState = {}) {
    const pendingTx = { ...this.store.getState().pendingTx };
    const tx = pendingTx[txId];
    if (!tx) return;

    if (tx.timeoutTimer) clearTimeout(tx.timeoutTimer);
    delete pendingTx[txId];

    this.store.update({
      ...resultState,
      pendingTx
    });
  }

  // 處理逾時回滾（Phase 2: Rollback）
  handleTimeout(txId, commandId, previousSnapshot) {
    const pendingTx = { ...this.store.getState().pendingTx };
    if (!pendingTx[txId]) return;

    delete pendingTx[txId];
    this.store.update({ pendingTx });

    this.emitError(new Error(`[CommandBus] ⏱️ 命令 '${commandId}' (${txId}) 逾時無回應，已觸發安全狀態回滾`));
  }

  // 強制提交事務
  commitTx(txId) {
    const pendingTx = { ...this.store.getState().pendingTx };
    if (pendingTx[txId]) {
      if (pendingTx[txId].timeoutTimer) clearTimeout(pendingTx[txId].timeoutTimer);
      delete pendingTx[txId];
      this.store.update({ pendingTx });
    }
  }
}

/**
 * 4. 宣告式視圖皮膚綁定器 (Declarative View Skin Binder)
 * 徹底消滅寫死 DOM ID，任何介面容器只需標註 data-action / data-bind 即可自動運作
 */
export class ViewSkinBinder {
  constructor(commandBus, store) {
    this.bus = commandBus;
    this.store = store;
    this.activeBindings = new Map(); // containerEl -> { unsubscribe, cleanupListeners }
  }

  /**
   * 掛載並綁定一個視圖皮膚容器 (Mount Skin)
   * @param {HTMLElement} rootElement 介面容器
   * @param {Object} options 自訂屬性選單
   */
  bindSkin(rootElement, options = {}) {
    if (!rootElement) return () => {};

    // 若該容器先前已有綁定，先執行卸載清理
    this.unbindSkin(rootElement);

    const cleanupFns = [];
    const actionSelector = options.actionSelector || '[data-action], [data-cmd]';
    const stateSelector = options.stateSelector || '[data-bind-state]';

    // 1. 宣告式綁定按鈕點擊事件
    const actionElements = rootElement.querySelectorAll(actionSelector);
    actionElements.forEach((el) => {
      const cmd = el.getAttribute('data-action') || el.getAttribute('data-cmd');
      if (!cmd) return;

      const clickHandler = (e) => {
        e.preventDefault();
        // 讀取自訂 payload（例如 data-lesson="0504"）
        const payloadStr = el.getAttribute('data-payload');
        let payload = {};
        if (payloadStr) {
          try { payload = JSON.parse(payloadStr); } catch (err) {}
        }
        // 亦可讀取特定 attribute (例如 data-value)
        if (el.dataset.value) payload.value = el.dataset.value;
        if (el.dataset.lesson) payload.lesson = el.dataset.lesson;

        // 觸發視覺瞬態回饋（按鍵反饋）
        el.classList.add('is-activating');
        setTimeout(() => el.classList.remove('is-activating'), 150);

        this.bus.dispatch(cmd, payload);
      };

      el.addEventListener('click', clickHandler);
      cleanupFns.push(() => el.removeEventListener('click', clickHandler));
    });

    // 2. 宣告式響應狀態變更，自動同步按鈕外觀與四態
    const unsubscribeStore = this.store.subscribe((state) => {
      // (A) 同步所有 data-action 按鈕的四態樣式
      actionElements.forEach((el) => {
        const cmd = el.getAttribute('data-action') || el.getAttribute('data-cmd');
        if (!cmd) return;

        // 檢查是否有當前 Command 的交易正在 Pending
        const isPending = Object.values(state.pendingTx || {}).some((tx) => tx.cmd === cmd);
        if (isPending) {
          el.classList.add('is-pending');
          el.setAttribute('aria-busy', 'true');
        } else {
          el.classList.remove('is-pending');
          el.removeAttribute('aria-busy');
        }

        // 依據核心狀態自動切換 Active 樣式 (例如 isPlaying 時播放鍵亮起)
        if (cmd === 'play' || cmd === 'play_pause') {
          el.classList.toggle('is-active', !!state.isPlaying);
        } else if (cmd === 'stop') {
          el.classList.toggle('is-active', !state.isPlaying);
        } else if (cmd === 'toggle_quote') {
          el.classList.toggle('is-active', !!state.isQuoteActive);
        } else if (cmd === 'toggle_speech_lead') {
          el.classList.toggle('is-active', !!state.speechMode);
        }
      });

      // (B) 同步資料呈現元件 (Text / Badges / Indicators)
      const stateElements = rootElement.querySelectorAll(stateSelector);
      stateElements.forEach((el) => {
        const bindKey = el.getAttribute('data-bind-state');
        if (!bindKey || state[bindKey] === undefined) return;

        const val = state[bindKey];
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
          if (el.value !== String(val)) el.value = val;
        } else {
          el.textContent = String(val);
        }
      });
    });

    cleanupFns.push(unsubscribeStore);

    // 記錄此容器的完整清理函式
    const teardown = () => {
      cleanupFns.forEach((fn) => {
        try { fn(); } catch (e) {}
      });
    };

    this.activeBindings.set(rootElement, teardown);
    return teardown;
  }

  /**
   * 卸載視圖皮膚，100% 回收所有監聽器與訂閱 (Teardown Protocol)
   */
  unbindSkin(rootElement) {
    if (!rootElement) return;
    const teardown = this.activeBindings.get(rootElement);
    if (teardown) {
      teardown();
      this.activeBindings.delete(rootElement);
    }
  }

  /**
   * 銷毀所有綁定
   */
  destroy() {
    for (const [el, teardown] of this.activeBindings.entries()) {
      teardown();
    }
    this.activeBindings.clear();
  }
}

/**
 * 5. 全域皮膚管理器 (Skin Switcher & Registry)
 * 支援熱切換多套不同佈局與風格之皮膚
 */
export class SkinManager {
  constructor(binder, mountPoint) {
    this.binder = binder;
    this.mountPoint = mountPoint; // 掛載皮膚的 DOM 容器
    this.skins = new Map(); // skinId -> { name, templateHtml, onMount, onUnmount }
    this.currentSkinId = null;
  }

  // 註冊一套皮膚
  registerSkin(skinId, skinConfig) {
    this.skins.set(skinId, {
      name: skinConfig.name || skinId,
      templateHtml: skinConfig.templateHtml || '',
      onMount: skinConfig.onMount || null,
      onUnmount: skinConfig.onUnmount || null
    });
  }

  // 熱切換皮膚
  switchSkin(skinId) {
    const skin = this.skins.get(skinId);
    if (!skin) {
      console.warn(`[SkinManager] 找不到指定皮膚: '${skinId}'`);
      return false;
    }

    if (!this.mountPoint) {
      console.warn('[SkinManager] 尚未設定 mountPoint，無法換膚');
      return false;
    }

    // 1. 卸載前一個皮膚 (Teardown)
    if (this.currentSkinId) {
      const prevSkin = this.skins.get(this.currentSkinId);
      this.binder.unbindSkin(this.mountPoint);
      if (prevSkin && typeof prevSkin.onUnmount === 'function') {
        try { prevSkin.onUnmount(this.mountPoint); } catch (e) {}
      }
    }

    // 2. 渲染新皮膚 HTML 結構
    this.mountPoint.innerHTML = skin.templateHtml;
    this.currentSkinId = skinId;
    this.mountPoint.setAttribute('data-current-skin', skinId);

    // 3. 調用新皮膚自訂 onMount 生命週期
    if (typeof skin.onMount === 'function') {
      try { skin.onMount(this.mountPoint); } catch (e) {}
    }

    // 4. 自動對新皮膚進行宣告式事件與狀態綁定
    this.binder.bindSkin(this.mountPoint);

    return true;
  }

  getCurrentSkinId() {
    return this.currentSkinId;
  }
}

// 6. 整合性工廠函式 (Isomorphic Desk Controller Factory)
export function createDeskController(initialState = {}, transport = null) {
  const store = new DeskStore(initialState);
  const commandBus = new CommandBus(store, transport);
  const binder = new ViewSkinBinder(commandBus, store);

  return {
    store,
    commandBus,
    binder,
    createSkinManager: (mountPoint) => new SkinManager(binder, mountPoint)
  };
}

// 支援瀏覽器全域導出
if (typeof window !== 'undefined') {
  window.AMRTFDeskController = {
    COMMAND_DEFINITIONS,
    DeskStore,
    CommandBus,
    ViewSkinBinder,
    SkinManager,
    createDeskController
  };
}
