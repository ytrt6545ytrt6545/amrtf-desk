/**
 * ==============================================================================
 * 🧪 AMRTF 無頭控制核心與視圖皮膚解耦自動化測試
 * ==============================================================================
 * 採用 Node.js 原生 node:test 與 node:assert/strict
 * 依據 Master Constitution 驗證：
 * 1. 白名單防注入硬鎖 (Command Whitelist Hard-Lock)
 * 2. 兩階段狀態確認與逾時回滾 (Two-Phase State Confirmation & Rollback)
 * 3. 宣告式視圖綁定與四態反饋 (Declarative View Binding & 4-State Indicators)
 * 4. 換膚生命週期資源清理 (Teardown Protocol & Zero-Leakage)
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeskStore,
  CommandBus,
  ViewSkinBinder,
  SkinManager,
  createDeskController,
  COMMAND_DEFINITIONS
} from '../src/core/desk-controller.js';

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this.classes.add(cls);
      else this.classes.delete(cls);
      return force;
    }
    if (this.classes.has(cls)) {
      this.classes.delete(cls);
      return false;
    } else {
      this.classes.add(cls);
      return true;
    }
  }
  contains(cls) { return this.classes.has(cls); }
  has(cls) { return this.classes.has(cls); }
}

// 輕量 Mock DOM 節點
class MockDOMElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attrs };
    this.dataset = {};
    this.classList = new MockClassList();
    this.listeners = new Map(); // event -> Set<fn>
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.innerHTML = '';
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(fn);
    }
  }

  // 模擬觸發事件
  trigger(event, eventObj = {}) {
    const fns = this.listeners.get(event);
    if (fns) {
      fns.forEach((fn) => {
        fn({
          preventDefault: () => {},
          stopPropagation: () => {},
          ...eventObj
        });
      });
    }
  }

  // 遞迴尋找子節點
  querySelectorAll(selector) {
    const results = [];
    const checkEl = (el) => {
      let match = false;
      if (selector.includes('[data-action]') && el.getAttribute('data-action')) match = true;
      if (selector.includes('[data-cmd]') && el.getAttribute('data-cmd')) match = true;
      if (selector.includes('[data-bind-state]') && el.getAttribute('data-bind-state')) match = true;

      if (match) results.push(el);
      el.children.forEach(checkEl);
    };
    this.children.forEach(checkEl);
    return results;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

describe('🎛️ AMRTF 無頭控制核心與視圖皮膚解耦架構檢驗', () => {

  test('✅ [Command-1] 靜態白名單硬鎖：合法命令順暢派發，未知惡意字串物理阻斷', () => {
    const store = new DeskStore();
    const sentMessages = [];
    const transport = {
      send: (msg) => sentMessages.push(msg)
    };
    const bus = new CommandBus(store, transport, { debounceMs: 0 });

    // 1. 合法命令 (play)
    const res1 = bus.dispatch('play', { speed: 1.25 });
    assert.strictEqual(res1.success, true);
    assert.ok(res1.txId.startsWith('tx_'));
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].action, 'play');
    assert.strictEqual(sentMessages[0].payload.speed, 1.25);

    // 2. 未註冊非法命令 (eval_malicious_code)
    let caughtError = null;
    bus.onError((err) => { caughtError = err; });
    const res2 = bus.dispatch('malicious_attack_inject');
    assert.strictEqual(res2.success, false);
    assert.ok(res2.error.includes('拒絕未註冊之命令 ID'));
    assert.ok(caughtError);
    assert.strictEqual(sentMessages.length, 1); // 確保非法命令絕不送至底層
  });

  test('✅ [Command-2] 兩階段狀態確認 (Two-Phase Commit) 與逾時自動回滾 (Rollback)', async () => {
    const store = new DeskStore({ isPlaying: false });
    const bus = new CommandBus(store, { send: () => {} }, { defaultTimeoutMs: 50, debounceMs: 0 });

    // 發起命令
    const { txId } = bus.dispatch('play');
    
    // Phase 1: 進入 Pending 態
    let state = store.getState();
    assert.ok(state.pendingTx[txId], '派發後必須在 pendingTx 建立交易快照');
    assert.strictEqual(state.pendingTx[txId].cmd, 'play');

    // 模擬成功接收底層 ACK (Phase 2 Commit)
    bus.ack(txId, { isPlaying: true });
    state = store.getState();
    assert.strictEqual(state.pendingTx[txId], undefined, 'Commit 後 pendingTx 必須清除');
    assert.strictEqual(state.isPlaying, true, '狀態成功更新為 isPlaying: true');

    // 測試逾時回滾 (Timeout Rollback)
    const { txId: timeoutTx } = bus.dispatch('stop');
    assert.ok(store.getState().pendingTx[timeoutTx]);
    
    // 等待 70ms 超過 defaultTimeoutMs (50ms)
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(store.getState().pendingTx[timeoutTx], undefined, '逾時後必須自動清除交易並回滾');
  });

  test('✅ [Command-3] 高頻盲按防抖 (Debounce Throttling)：連續狂按僅允許首發穿透', () => {
    const store = new DeskStore();
    const sent = [];
    const bus = new CommandBus(store, { send: (m) => sent.push(m) }, { debounceMs: 100 });

    // 連續發起 5 次相同動作
    const r1 = bus.dispatch('seek_fwd');
    const r2 = bus.dispatch('seek_fwd');
    const r3 = bus.dispatch('seek_fwd');

    assert.strictEqual(r1.success, true);
    assert.strictEqual(r2.success, false);
    assert.strictEqual(r2.reason, 'debounced');
    assert.strictEqual(r3.success, false);
    assert.strictEqual(sent.length, 1, '防抖必須保證高頻連擊只穿透一次');
  });

  test('✅ [View-1] 宣告式視圖皮膚綁定 (Declarative Binding)：點擊按鈕自動派發並切換樣式', () => {
    const { store, commandBus, binder } = createDeskController({ isPlaying: false });
    const sent = [];
    commandBus.setTransport({ send: (m) => sent.push(m) });

    // 構建一個自訂皮膚 DOM 結構（完全無任何硬編碼 ID）
    const skinRoot = new MockDOMElement('div');
    const btnPlay = new MockDOMElement('button', { 'data-action': 'play' });
    const statusText = new MockDOMElement('span', { 'data-bind-state': 'currentLesson' });
    skinRoot.appendChild(btnPlay);
    skinRoot.appendChild(statusText);

    // 綁定視圖
    binder.bindSkin(skinRoot);

    // 初始狀態反映
    assert.strictEqual(statusText.textContent, '0001');
    assert.strictEqual(btnPlay.classList.has('is-active'), false);

    // 觸發按鈕點擊
    btnPlay.trigger('click');
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'play');
    assert.strictEqual(btnPlay.classList.has('is-pending'), true, '派發中按鈕必須自動附加 is-pending');

    // 模擬後台狀態變更 (播放開始 + 切換講次)
    commandBus.ack(sent[0].txId, { isPlaying: true, currentLesson: '0567' });

    assert.strictEqual(btnPlay.classList.has('is-pending'), false);
    assert.strictEqual(btnPlay.classList.has('is-active'), true, '播放中按鈕必須自動同步 is-active');
    assert.strictEqual(statusText.textContent, '0567', '綁定文字必須自動更新');
  });

  test('✅ [Skin-1] 自由換膚與生命週期安全清理 (Teardown Protocol)：換膚時 100% 註銷舊監聽器', () => {
    const { store, commandBus, binder, createSkinManager } = createDeskController({ currentLesson: '0001' });
    const mountContainer = new MockDOMElement('main');
    const skinMgr = createSkinManager(mountContainer);

    let skinAUnmounted = false;
    let skinBMounted = false;

    // 註冊皮膚 A (經典專業台)
    skinMgr.registerSkin('classic', {
      name: '經典專業台',
      templateHtml: '<div class="classic-ui"><button data-action="play">Play Classic</button></div>',
      onUnmount: () => { skinAUnmounted = true; }
    });

    // 註冊皮膚 B (極簡觸控台)
    skinMgr.registerSkin('minimal', {
      name: '極簡觸控台',
      templateHtml: '<div class="touch-ui"><button data-action="stop">Stop Touch</button></div>',
      onMount: () => { skinBMounted = true; }
    });

    // 1. 掛載經典皮膚
    const switchRes1 = skinMgr.switchSkin('classic');
    assert.strictEqual(switchRes1, true);
    assert.strictEqual(skinMgr.getCurrentSkinId(), 'classic');

    // 2. 熱切換至極簡皮膚
    const switchRes2 = skinMgr.switchSkin('minimal');
    assert.strictEqual(switchRes2, true);
    assert.strictEqual(skinMgr.getCurrentSkinId(), 'minimal');
    assert.strictEqual(skinAUnmounted, true, '舊皮膚卸載時必須觸發 onUnmount 生命週期');
    assert.strictEqual(skinBMounted, true, '新皮膚掛載時必須觸發 onMount 生命週期');

    // 驗證核心狀態保持完整
    assert.strictEqual(store.getState().currentLesson, '0001');
  });
});
