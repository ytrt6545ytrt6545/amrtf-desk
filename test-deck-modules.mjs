// ==============================================================================
// 🧪 AMRTF-Desk 自訂佈局深模組單元與邊界測試 (Test Deck Modules)
// ==============================================================================

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// 模擬瀏覽器 localStorage 與 DOM 環境
const localStorageMock = (function () {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
})();

globalThis.localStorage = localStorageMock;

// 載入 deck-storage.js
const storageFile = path.resolve('projects/amrtf-desk/src/desk/modules/deck-storage.js');
const storageCode = fs.readFileSync(storageFile, 'utf8');

// 執行包裝
eval(storageCode);
const DeckStorage = globalThis.DeckStorage;

console.log('--- 開始執行 DeckStorage 單元測試 ---');

// 1. 預設佈局載入測試
const initialLayout = DeckStorage.loadLayout();
assert.ok(initialLayout, '應能成功載入預設佈局');
assert.strictEqual(initialLayout.columns, 8, '網格應固定為 8 欄');
assert.ok(Array.isArray(initialLayout.items), 'items 應為陣列');
assert.ok(initialLayout.items.length >= 20, '全功能模板應包含所有核心按鈕');
console.log(`✅ [1/5] 預設佈局驗證通過 (共有 ${initialLayout.items.length} 顆按鈕)`);

// 2. 儲存與讀取一致性測試
initialLayout.items[0].cols = 4;
initialLayout.items[0].rows = 2;
DeckStorage.saveLayout(initialLayout);

const loadedLayout = DeckStorage.loadLayout();
assert.strictEqual(loadedLayout.items[0].cols, 4, '儲存之 cols 應正確還原');
assert.strictEqual(loadedLayout.items[0].rows, 2, '儲存之 rows 應正確還原');
console.log('✅ [2/5] localStorage 序列化與讀寫一致性驗證通過');

// 3. 模板切換測試
const minimalLayout = DeckStorage.resetToDefault('minimal');
assert.strictEqual(minimalLayout.name, '研討極簡大鍵模板', '應能切換至研討極簡模板');
const visibleItems = minimalLayout.items.filter(it => !it.hidden);
const hiddenItems = minimalLayout.items.filter(it => it.hidden);
assert.ok(visibleItems.length <= 10, '極簡模板之可見按鈕應大幅精簡');
assert.ok(hiddenItems.length > 0, '極簡模板應有按鈕收納至倉庫');
console.log(`✅ [3/5] 模板切換驗證通過 (可見: ${visibleItems.length}, 倉庫收納: ${hiddenItems.length})`);

// 4. JSON 匯出與匯入測試
const exportedJson = DeckStorage.exportToJson(minimalLayout);
assert.ok(typeof exportedJson === 'string' && exportedJson.length > 50, '應能順暢匯出 JSON 字串');

const importRes = DeckStorage.importFromJson(exportedJson);
assert.strictEqual(importRes.success, true, '合法 JSON 應能成功匯入');
console.log('✅ [4/5] JSON 配置匯出與匯入驗證通過');

// 5. 異常與毀損 JSON 防禦測試
const badJson = '{"invalid": 123}';
const badRes = DeckStorage.importFromJson(badJson);
assert.strictEqual(badRes.success, false, '無效結構應被安全拒絕');

const corruptedJson = '{bad json string...';
const corruptedRes = DeckStorage.importFromJson(corruptedJson);
assert.strictEqual(corruptedRes.success, false, '損毀語法應被安全拒絕');
console.log('✅ [5/5] 異常毀損防禦與安全降級驗證通過');

console.log('\n🎉 所有 DeckStorage 單元測試全部 100% 通過！');
