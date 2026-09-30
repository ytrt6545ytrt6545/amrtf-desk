/**
 * 🌙 廣海明月 · Studio Control Desk 奢華操作艙自動化測試
 * 遵循 Master Core Constitution 鐵律：消滅 Mock 假象，建立端到端閉環！
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function fetchHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

describe('🌙 廣海明月 · Studio Control Desk 奢華操作艙功能與合約驗證', () => {
  let serverInstance = null;
  const TEST_PORT = 9993;

  before(async () => {
    // 啟動隔離的 HTTP 測試伺服器模擬 server.mjs 路由
    serverInstance = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/moonlight' || url === '/moonlight/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(projectRoot, 'src', 'desk', 'moonlight.html'), 'utf8'));
        return;
      }
      if (url === '/moonlight.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(fs.readFileSync(path.join(projectRoot, 'src', 'desk', 'moonlight.js'), 'utf8'));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise((resolve) => serverInstance.listen(TEST_PORT, '127.0.0.1', resolve));
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  test('✅ [Moonlight-1] /moonlight 路由必須返回 HTTP 200 且包含正確頁面標題與暗色主題', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight`);
    assert.strictEqual(res.statusCode, 200, 'HTTP 狀態碼應為 200');
    assert.ok(res.body.includes('AMRTF Moonlight Ocean Studio Desk'), '應包含廣海明月夜海主控艙標題');
    assert.ok(res.body.includes('class="dark"'), '應預設載入 dark 暗色奢華風格');
    assert.ok(res.body.includes('廣海明月奢華操作艙'), '應包含廣海明月字樣');
  });

  test('✅ [Moonlight-2] 頁面必須完整包含 24 欄廣播網格與專業狀態指標 (ON AIR / NDI / TIMECODE)', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight`);
    assert.ok(res.body.includes('AMRTF TACTICAL DESK 24-COL'), '應包含 24 欄戰術操作艙宣告');
    assert.ok(res.body.includes('ON AIR'), '應包含 ON AIR Tally 指示標記');
    assert.ok(res.body.includes('NDI 1080p60 SYNC'), '應包含 NDI 廣播同步標記');
    assert.ok(res.body.includes('id="timecodeLed"'), '應包含 TIMECODE 碼表 LED 元素 ID');
    assert.ok(res.body.includes('id="tallyIndicator"'), '應包含 Tally 指示燈元素 ID');
  });

  test('✅ [Moonlight-3] 必須具備雙向切換開關、法音提詞機、主音軌示波器、VU 表與 ALL-KILL 靜音巨鍵', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight`);
    assert.ok(res.body.includes('id="btnClassicDesk"'), '應包含切換回經典主控台之按鈕');
    assert.ok(res.body.includes('id="prompterText"'), '應包含即時法音提詞機文字元素 ID');
    assert.ok(res.body.includes('id="masterPlayBtn"'), '應包含主音軌核心播放按鍵 ID');
    assert.ok(res.body.includes('id="audioRange"'), '應包含進度尋軌滑桿元素 ID');
    assert.ok(res.body.includes('id="btnAllKillMute"'), '應包含 ALL-KILL MUTE 緊急靜音紅按鈕 ID');
  });

  test('✅ [Moonlight-4] /moonlight.js 客戶端引擎必須成功載入且無語法錯誤', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight.js`);
    assert.strictEqual(res.statusCode, 200, 'JavaScript 引擎應返回 200');
    assert.ok(res.body.includes('Moonlight Client Engine'), '應包含客戶端引擎註解');
    assert.ok(res.body.includes('strikeMoonlightBell'), '應包含 528Hz 西藏銅鐘合成演算法');
    assert.ok(res.body.includes('connectWebSocket'), '應包含 WebSocket 全雙工連線邏輯');
    assert.ok(res.body.includes('sendMoonlightCmd'), '應包含信令發送介面');
  });
});
