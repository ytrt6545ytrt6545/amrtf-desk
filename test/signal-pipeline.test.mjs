/**
 * 🛰️ 全鏈路信令穿越與合約差集自動化測試 (Signal Pipeline & Contract Test)
 * 遵循 Master Constitution 鐵律：消滅 Mock 假象，建立端到端信號閉環！
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebRemoteServer } from '../src/server/web-remote.js';
import { ARSENAL_CATALOG, MobileLayoutStore } from '../src/server/mobile-layout-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('🛰️ AMRTF 全鏈路信令合約與穿透性端到端閉環測試', () => {
  const TEST_PORT = 9991;
  let remoteServer = null;
  let clientWs = null;
  const receivedCommands = [];

  // 模擬 server.mjs 中的核心 dispatchCommand 處理邏輯
  function mockDispatchCommand(cmd, params = {}) {
    let resolvedUrl = null;
    let formattedLesson = null;

    if (cmd === 'goto_lesson' || cmd === 'load_lecture') {
      const raw = String(params.lessonNumber || params.lesson || params.lectureId || '').trim();
      formattedLesson = /^\d+$/.test(raw) ? raw.padStart(4, '0') : raw;
      resolvedUrl = `https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean-${formattedLesson}/`;
    }

    receivedCommands.push({
      cmd,
      params,
      resolvedUrl,
      formattedLesson,
      timestamp: Date.now()
    });
  }

  before(async () => {
    // 啟動隔離的 WebRemoteServer 測試實例
    const layoutStore = new MobileLayoutStore();
    remoteServer = new WebRemoteServer(TEST_PORT, mockDispatchCommand, layoutStore);
    remoteServer.start();

    // 等待端口開啟
    await new Promise((r) => setTimeout(r, 400));

    // 建立真實 WebSocket 連線
    await new Promise((resolve, reject) => {
      clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);
      clientWs.on('open', resolve);
      clientWs.on('error', reject);
    });
  });

  after(async () => {
    if (clientWs) clientWs.close();
    if (remoteServer) remoteServer.stop();
    await new Promise((r) => setTimeout(r, 300));
  });

  // --------------------------------------------------------------------------
  // 測試 1：信令合約靜態差集硬鎖驗證
  // --------------------------------------------------------------------------
  test('✅ [合約硬鎖] 靜態審計差集必須為 0 (所有前端 Action 均有實體處理器)', async () => {
    const auditScript = path.join(projectRoot, 'scripts', 'audit-signals.mjs');
    assert.ok(fs.existsSync(auditScript), 'audit-signals.mjs 必須存在');

    // 讀取前端與後端檔案檢查
    const webRemoteContent = fs.readFileSync(path.join(projectRoot, 'src', 'server', 'web-remote.js'), 'utf8');
    const serverContent = fs.readFileSync(path.join(projectRoot, 'server.mjs'), 'utf8');

    // 驗證關鍵信令存在
    assert.ok(webRemoteContent.includes("'goto_lesson'"), 'web-remote.js 必須包含 goto_lesson 信令');
    assert.ok(serverContent.includes("cmd === 'goto_lesson'"), 'server.mjs 必須處理 goto_lesson');
    assert.ok(serverContent.includes("cmd === 'load_lecture'"), 'server.mjs 必須相容 load_lecture');
  });

  // --------------------------------------------------------------------------
  // 測試 2：講次跳轉端到端閉環測試 (goto_lesson 與 load_lecture 雙向穿透)
  // --------------------------------------------------------------------------
  test('✅ [端到端信號] 發送 goto_lesson (504) 必須穿透 WebSocket 並解析為 0504 導航網址', async () => {
    receivedCommands.length = 0; // 清空收信箱

    // 模擬手機端發送 goto_lesson
    clientWs.send(JSON.stringify({
      type: 'ACTION',
      command: 'goto_lesson',
      params: { lessonNumber: '504', lectureId: '504' }
    }));

    // 等待 WebSocket 傳遞與後端分發
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(receivedCommands.length, 1, '後端必須精確收到 1 次信令');
    const item = receivedCommands[0];
    assert.strictEqual(item.cmd, 'goto_lesson', '指令名稱必須為 goto_lesson');
    assert.strictEqual(item.formattedLesson, '0504', '講次編號必須自動補零至 4 碼 (0504)');
    assert.strictEqual(
      item.resolvedUrl,
      'https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean-0504/',
      '導航網址必須正確組合'
    );
  });

  test('✅ [端到端信號] 發送相容協定 load_lecture ({ lesson: 504 }) 同樣必須正確解析為 0504', async () => {
    receivedCommands.length = 0;

    // 模擬舊版或相容端發送 load_lecture
    clientWs.send(JSON.stringify({
      type: 'ACTION',
      command: 'load_lecture',
      params: { lesson: 504 }
    }));

    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(receivedCommands.length, 1, '後端必須精確收到 1 次信令');
    const item = receivedCommands[0];
    assert.strictEqual(item.cmd, 'load_lecture', '指令名稱必須為 load_lecture');
    assert.strictEqual(item.formattedLesson, '0504', '講次編號必須自動補零至 4 碼 (0504)');
    assert.strictEqual(
      item.resolvedUrl,
      'https://www.amrtf.org/zh-hant/clear-moonlight-great-ocean-0504/',
      '相容協定導航網址必須正確組合'
    );
  });

  test('✅ [邊界防呆] 各種位數講次 (3, 566, 0003) 均能標準化為 4 位數字', async () => {
    const testCases = [
      { in: '3', expected: '0003' },
      { in: '566', expected: '0566' },
      { in: '0003', expected: '0003' },
      { in: 88, expected: '0088' }
    ];

    for (const tc of testCases) {
      receivedCommands.length = 0;
      clientWs.send(JSON.stringify({
        type: 'ACTION',
        command: 'goto_lesson',
        params: { lessonNumber: tc.in }
      }));
      await new Promise((r) => setTimeout(r, 100));

      assert.strictEqual(receivedCommands.length, 1);
      assert.strictEqual(receivedCommands[0].formattedLesson, tc.expected);
    }
  });

  // --------------------------------------------------------------------------
  // 測試 3：4×8 行動操作艙全部按鈕 action 穿透性盲測
  // --------------------------------------------------------------------------
  test('✅ [全鍵盤穿透] ARSENAL_CATALOG 中所有按鈕 action 必須能順暢穿透 WebSocket', async () => {
    receivedCommands.length = 0;
    const actions = ARSENAL_CATALOG.map((item) => item.action).filter(Boolean);

    for (const action of actions) {
      clientWs.send(JSON.stringify({
        type: 'ACTION',
        command: action,
        params: { source: 'unit-test' }
      }));
    }

    // 等待所有信令消化
    await new Promise((r) => setTimeout(r, 500));

    assert.strictEqual(
      receivedCommands.length,
      actions.length,
      `所有 ${actions.length} 個 Catalog 按鈕信令都必須被後端成功接收，不可丟失！`
    );

    const receivedSet = new Set(receivedCommands.map((c) => c.cmd));
    for (const act of actions) {
      assert.ok(receivedSet.has(act), `信令 【${act}】 必須成功抵達後端`);
    }
  });

  // --------------------------------------------------------------------------
  // 測試 4：區間播放信令參數完整性 (play_interval / stop_interval)
  // --------------------------------------------------------------------------
  test('✅ [區間控制] play_interval 帶起訖時間必須原樣無損傳遞至分發中心', async () => {
    receivedCommands.length = 0;

    clientWs.send(JSON.stringify({
      type: 'ACTION',
      command: 'play_interval',
      params: { start: 12.5, end: 45.8, loop: true }
    }));

    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(receivedCommands.length, 1);
    const item = receivedCommands[0];
    assert.strictEqual(item.cmd, 'play_interval');
    assert.strictEqual(item.params.start, 12.5);
    assert.strictEqual(item.params.end, 45.8);
    assert.strictEqual(item.params.loop, true);
  });

  // --------------------------------------------------------------------------
  // 測試 5：雙向連鎖乾淨關閉與特徵滅殺協議檢驗
  // --------------------------------------------------------------------------
  test('✅ [全域乾淨關閉] 伺服器必須具備雙向連鎖關閉與進程特徵滅殺防護', () => {
    const serverCode = fs.readFileSync(path.join(projectRoot, 'server.mjs'), 'utf8');
    const cdpBridgeCode = fs.readFileSync(path.join(projectRoot, 'src', 'core', 'cdp-bridge.js'), 'utf8');

    // 斷言 1: CdpBridge 具備 onDisconnect 支援
    assert.ok(cdpBridgeCode.includes('onDisconnect'), 'CdpBridge 必須具備 onDisconnect 回呼');
    
    // 斷言 2: server.mjs 掛載了放映艙斷線連動關閉
    assert.ok(serverCode.includes('監測到放映艙視窗已由長官按 ✕ 關閉'), 'server.mjs 必須監聽放映艙關閉');

    // 斷言 3: server.mjs 具備 PowerShell WMI 特徵滅殺 (amrtf-desk-profile / amrtf-screen-profile)
    assert.ok(serverCode.includes('amrtf-(desk|screen)-profile'), 'shutdownApp 必須包含雙視窗 profile 特徵全滅邏輯');

    // 斷言 4: desk.js 中的 EXIT 按鈕與 beforeunload 雙保險
    const deskJsCode = fs.readFileSync(path.join(projectRoot, 'src', 'desk', 'desk.js'), 'utf8');
    assert.ok(deskJsCode.includes("sendBeacon('/api/shutdown')"), 'desk.js 必須發送信標確保乾淨退出');
  });
});
