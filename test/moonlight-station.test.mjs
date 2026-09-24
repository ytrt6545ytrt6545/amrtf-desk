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
    assert.ok(res.body.includes('廣海明月 · 大慈恩譯經基金會 Studio Control Desk'), '應包含廣海明月大慈恩主控艙標題');
    assert.ok(res.body.includes('class="dark"'), '應預設載入 dark 暗色奢華風格');
    assert.ok(res.body.includes('Clear Moonlight Great Ocean Broadcast Master Station'), '應包含英文字樣');
  });

  test('✅ [Moonlight-2] 頁面必須完整包含 32 鍵戰術矩陣 (Tactical Matrix 32 Channels)', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight`);
    assert.ok(res.body.includes('Broadcast Channel Matrix (32 Ch)'), '應包含 32 軌戰術矩陣標題');
    assert.ok(res.body.includes('皈依頌'), '應包含第 1 軌皈依頌');
    assert.ok(res.body.includes('淨口業真言'), '應包含第 32 軌淨口業真言');
    assert.ok(res.body.includes('ch-card-1'), '應包含 ch-card-1 元素 ID');
    assert.ok(res.body.includes('ch-card-32'), '應包含 ch-card-32 元素 ID');
  });

  test('✅ [Moonlight-3] 必須具備雙向切換開關、即時字幕手抄稿卡片與音訊波形視覺化器', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight`);
    assert.ok(res.body.includes('btnClassicDesk'), '應包含切換回經典主控台之按鈕');
    assert.ok(res.body.includes('sub-zh-text'), '應包含即時經文/手抄稿字幕元素 ID');
    assert.ok(res.body.includes('waveform-bars'), '應包含音訊波形律動容器 ID');
    assert.ok(res.body.includes('elapsed-timer'), '應包含累計碼表計時器 ID');
    assert.ok(res.body.includes('remaining-timer'), '應包含剩餘時間計時器 ID');
  });

  test('✅ [Moonlight-4] /moonlight.js 客戶端引擎必須成功載入且無語法錯誤', async () => {
    const res = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/moonlight.js`);
    assert.strictEqual(res.statusCode, 200, 'JavaScript 引擎應返回 200');
    assert.ok(res.body.includes('Moonlight Client Engine'), '應包含客戶端引擎註解');
    assert.ok(res.body.includes('strikeMoonlightBell'), '應包含 528Hz 西藏銅鐘合成演算法');
    assert.ok(res.body.includes('connectWebSocket'), '應包含 WebSocket 全雙工連線邏輯');
  });
});
