import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MobileLayoutStore, DEFAULT_MOBILE_LAYOUT } from '../src/server/mobile-layout-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_FILE = path.join(__dirname, 'temp-test-mobile-layout.json');

try {
  console.log('🧪 啟動 Ticket 01 單元測試: MobileLayoutStore...');
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);

  const store = new MobileLayoutStore(TEST_FILE);

  // 測試 1: 預設配置檢測
  const layout = store.getLayout();
  assert.strictEqual(layout.grid.cols, 4, 'Cols 必須為 4');
  assert.strictEqual(layout.grid.rows, 8, 'Rows 必須為 8');
  assert.ok(layout.items.length >= 6, '預設元件數需 >= 6');
  console.log('  ✅ 測試 1: 預設 4x8 配置與回退驗證通過');

  // 測試 2: 儲存自訂合法配置
  const custom = {
    grid: { cols: 4, rows: 8 },
    items: [
      { id: 'btn-play', type: 'button', col: 1, row: 1, w: 2, h: 2, action: 'play' },
      { id: 'btn-stop', type: 'button', col: 3, row: 1, w: 2, h: 2, action: 'stop' },
      { id: 'widget-teleprompter', type: 'widget', col: 1, row: 3, w: 4, h: 6 }
    ]
  };
  const saved = store.saveLayout(custom);
  assert.strictEqual(saved.items.length, 3);
  const reloaded = store.getLayout();
  assert.strictEqual(reloaded.items.length, 3);
  assert.strictEqual(reloaded.items[2].id, 'widget-teleprompter');
  console.log('  ✅ 測試 2: 自訂合法配置持久化與讀取通過');

  // 測試 3: 邊界防禦（超出 4 欄或 8 列）
  let rejected = false;
  try {
    store.saveLayout({
      grid: { cols: 4, rows: 8 },
      items: [
        { id: 'overflow-btn', type: 'button', col: 3, row: 1, w: 3, h: 1 } // col 3 + w 3 - 1 = 5 > 4 !
      ]
    });
  } catch (e) {
    rejected = true;
  }
  assert.ok(rejected, '超出邊界之項目必須被拒絕拋錯');
  console.log('  ✅ 測試 3: 超出邊界阻斷防護通過');

  // 測試 4: 重設回預設
  store.resetLayout();
  const resetLayout = store.getLayout();
  assert.strictEqual(resetLayout.items.length, DEFAULT_MOBILE_LAYOUT.items.length);
  console.log('  ✅ 測試 4: 重設預設版面通過');

  // 清理測試檔案
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  console.log('🎉 Ticket 01 單元測試全數綠燈通過！');
} catch (err) {
  console.error('❌ 測試失敗:', err);
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  process.exit(1);
}
