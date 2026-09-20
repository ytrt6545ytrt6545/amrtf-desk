/**
 * 🧪 AMRTF 放映艙指令分發與狀態差分 (State Diff) 自動化驗證測試
 * 採用 Node.js 原生 node:test 與 node:assert/strict
 * 嚴格遵循 SPEC-006「Δ ≠ 0 狀態突變」原則
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 建立輕量 Mock DOM 環境
class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.classList = new Set();
    this.checked = false;
    this.value = '0';
    this.eventListeners = {};
  }

  get className() {
    return Array.from(this.classList).join(' ');
  }

  set className(val) {
    this.classList = new Set((val || '').split(' ').filter(Boolean));
  }

  click() {
    if (this.type === 'checkbox') {
      this.checked = !this.checked;
    }
    if (this.onclick) this.onclick();
  }
}

describe('🛰️ 放映艙核心指令狀態差分 (State Diff) 驗證', () => {
  // 建立虛擬放映艙沙盒
  function createMockRuntime() {
    const state = {
      theme: 'dark',
      speechMode: false,
      scrollMode: 0,
      isPlaying: false,
      currentTime: 0,
      playbackRate: 1.0,
      interval: { enabled: false, start: 0, end: 0 }
    };

    const normalizeMap = {
      'toggle_theme': 'set_theme',
      'TOGGLE_THEME': 'set_theme',
      'toggle_speech_lead': 'toggle_speech_mode',
      'TOGGLE_SPEECH_LEAD': 'toggle_speech_mode',
      'toggle_scroll_mode': 'cycle_scroll_mode',
      'TOGGLE_SCROLL_MODE': 'cycle_scroll_mode',
      'toggle_scroll': 'cycle_scroll_mode',
      'play': 'play',
      'pause': 'pause',
      'toggle_play': 'toggle_play',
      'set_playback_rate': 'set_playback_rate',
      'play_interval': 'play_interval',
      'stop_interval': 'stop_interval'
    };

    function execute(rawCmd, params = {}) {
      const cmd = normalizeMap[rawCmd] || rawCmd;

      switch (cmd) {
        case 'set_theme':
          state.theme = (state.theme === 'dark') ? 'light' : 'dark';
          break;

        case 'toggle_speech_mode':
          state.speechMode = !state.speechMode;
          break;

        case 'cycle_scroll_mode':
          state.scrollMode = (state.scrollMode + 1) % 3;
          break;

        case 'play':
          state.isPlaying = true;
          break;

        case 'pause':
          state.isPlaying = false;
          break;

        case 'toggle_play':
          state.isPlaying = !state.isPlaying;
          break;

        case 'set_playback_rate':
          state.playbackRate = parseFloat(params.rate || 1.0);
          break;

        case 'play_interval':
          state.interval = {
            enabled: true,
            start: parseFloat(params.start || 0),
            end: parseFloat(params.end || 60)
          };
          state.isPlaying = true;
          break;

        case 'stop_interval':
          state.interval = { enabled: false, start: 0, end: 0 };
          state.isPlaying = false;
          break;

        default:
          throw new Error(`[REJECT] 未知指令: ${rawCmd}`);
      }

      return state;
    }

    return { state, execute };
  }

  test('✅ [State Diff] toggle_theme 必須造成主題狀態實質反轉 (dark ➔ light ➔ dark)', () => {
    const sandbox = createMockRuntime();
    const before = { ...sandbox.state };

    sandbox.execute('toggle_theme');
    const after1 = { ...sandbox.state };

    console.log(`[STATE DIFF] toggle_theme: Before=${before.theme} ➔ After=${after1.theme}`);
    assert.notEqual(after1.theme, before.theme, '主題必須實質突變！(Δ ≠ 0)');
    assert.equal(after1.theme, 'light');

    sandbox.execute('toggle_theme');
    const after2 = { ...sandbox.state };
    assert.equal(after2.theme, 'dark');
  });

  test('✅ [State Diff] toggle_speech_lead 必須造成播稿提詞開關實質突變', () => {
    const sandbox = createMockRuntime();
    const before = { ...sandbox.state };

    sandbox.execute('toggle_speech_lead');
    const after = { ...sandbox.state };

    console.log(`[STATE DIFF] toggle_speech_lead: Before=${before.speechMode} ➔ After=${after.speechMode}`);
    assert.notEqual(after.speechMode, before.speechMode, '播稿模式必須實質突變！(Δ ≠ 0)');
    assert.equal(after.speechMode, true);
  });

  test('✅ [State Diff] toggle_scroll_mode 必須造成滾動輪播實質遞增', () => {
    const sandbox = createMockRuntime();
    const before = sandbox.state.scrollMode;

    sandbox.execute('toggle_scroll_mode');
    const after1 = sandbox.state.scrollMode;
    console.log(`[STATE DIFF] toggle_scroll_mode: Before=${before} ➔ After=${after1}`);
    assert.notEqual(after1, before, '滾動模式必須遞增！(Δ ≠ 0)');
    assert.equal(after1, 1);

    sandbox.execute('toggle_scroll_mode');
    assert.equal(sandbox.state.scrollMode, 2);

    sandbox.execute('toggle_scroll_mode');
    assert.equal(sandbox.state.scrollMode, 0); // 循環歸零
  });

  test('✅ [State Diff] play_interval 必須激活區間狀態並設定時間範圍', () => {
    const sandbox = createMockRuntime();
    const before = { ...sandbox.state.interval };

    sandbox.execute('play_interval', { start: 10, end: 50 });
    const after = { ...sandbox.state.interval };

    console.log(`[STATE DIFF] play_interval: Before=${JSON.stringify(before)} ➔ After=${JSON.stringify(after)}`);
    assert.equal(after.enabled, true);
    assert.equal(after.start, 10);
    assert.equal(after.end, 50);
  });

  test('🚨 [Loud Failure] 未知指令必須立刻拋出 REJECT 例外，絕不靜音吞噬', () => {
    const sandbox = createMockRuntime();
    assert.throws(() => {
      sandbox.execute('invalid_ghost_command_xyz');
    }, /REJECT/);
  });
});
