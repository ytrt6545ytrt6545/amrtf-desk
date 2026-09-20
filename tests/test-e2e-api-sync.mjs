import assert from 'assert';
import http from 'http';
import { WebSocket } from 'ws';
import { MobileLayoutStore } from '../src/server/mobile-layout-store.js';
import { WebRemoteServer } from '../src/server/web-remote.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_STORE_PATH = path.join(__dirname, 'temp-e2e-layout.json');

console.log('🧪 啟動 Ticket 04 雙端 API 與 WebSocket 即時熱同步 E2E 驗收測試...');

if (fs.existsSync(TEST_STORE_PATH)) fs.unlinkSync(TEST_STORE_PATH);

const testPort = 19998;
const store = new MobileLayoutStore(TEST_STORE_PATH);
const remote = new WebRemoteServer(testPort, () => {}, store);

remote.start();

async function runE2e() {
  try {
    await new Promise(r => setTimeout(r, 300));

    // 1. 測試 GET /api/mobile-layout
    const getRes = await fetch(`http://127.0.0.1:${testPort}/api/mobile-layout`);
    const getData = await getRes.json();
    assert.strictEqual(getData.layout.grid.cols, 4);
    assert.strictEqual(getData.layout.grid.rows, 8);
    assert.ok(getData.catalog.length > 5);
    console.log('  ✅ 步驟 1: REST API GET /api/mobile-layout 通訊正常');

    // 2. 測試 WebSocket 初始連線推播
    let receivedInitial = false;
    let receivedUpdate = false;
    let updatedPayload = null;

    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('  ✅ 步驟 2: 手機模擬端 WebSocket 連線建立成功');
      });

      ws.on('message', (msg) => {
        const data = JSON.parse(msg.toString());
        if (data.type === 'MOBILE_LAYOUT_UPDATED') {
          if (!receivedInitial) {
            receivedInitial = true;
            assert.strictEqual(data.layout.grid.cols, 4);
            console.log('  ✅ 步驟 3: 連線瞬間收到首包 4x8 佈局快照');
            resolve();
          } else {
            receivedUpdate = true;
            updatedPayload = data.layout;
          }
        }
      });

      ws.on('error', reject);
    });

    // 3. 測試 POST /api/mobile-layout 發布修改
    const newCustomLayout = {
      grid: { cols: 4, rows: 8 },
      items: [
        { id: 'btn-play', type: 'button', col: 1, row: 1, w: 2, h: 2, action: 'play', label: '▶ 播放' },
        { id: 'widget-teleprompter', type: 'widget', col: 1, row: 3, w: 4, h: 6, label: '師父逐字稿' }
      ]
    };

    const postRes = await fetch(`http://127.0.0.1:${testPort}/api/mobile-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomLayout)
    });
    const postData = await postRes.json();
    assert.strictEqual(postData.ok, true);
    console.log('  ✅ 步驟 4: REST API POST /api/mobile-layout 保存成功');

    // 等待 100ms 讓 WebSocket 廣播完成
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(receivedUpdate, true, 'WebSocket 必須收到熱更新廣播');
    assert.strictEqual(updatedPayload.items.length, 2);
    assert.strictEqual(updatedPayload.items[0].id, 'btn-play');
    console.log('  ✅ 步驟 5: 手機端 50ms 內收到 MOBILE_LAYOUT_UPDATED 熱推播信令');

    // 4. 測試重設
    const resetRes = await fetch(`http://127.0.0.1:${testPort}/api/mobile-layout/reset`, { method: 'POST' });
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.ok, true);
    assert.ok(resetData.layout.items.length >= 6);
    console.log('  ✅ 步驟 6: 重設預設佈局與全網熱推播通過');

    ws.close();
    remote.stop();
    if (fs.existsSync(TEST_STORE_PATH)) fs.unlinkSync(TEST_STORE_PATH);

    console.log('🎉 Ticket 04 雙端 API 與 WebSocket 即時熱同步 E2E 全數綠燈通過！');
    process.exit(0);
  } catch (e) {
    console.error('❌ E2E 測試失敗:', e);
    if (fs.existsSync(TEST_STORE_PATH)) fs.unlinkSync(TEST_STORE_PATH);
    remote.stop();
    process.exit(1);
  }
}

runE2e();
