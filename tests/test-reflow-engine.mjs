import assert from 'assert';
import {
  isWithinGrid,
  getOccupiedCells,
  checkOverlap,
  findNextAvailableSlot,
  resolveReflow
} from '../src/desk/modules/mobile-reflow-engine.js';

console.log('🧪 啟動 Ticket 03 單元測試: Auto-Reflow Engine (10 組極限邊界盲測)...');

try {
  // 案例 1: 邊界判斷
  assert.strictEqual(isWithinGrid(1, 1, 4, 8), true, '1,1 4x8 應合法');
  assert.strictEqual(isWithinGrid(1, 1, 5, 1), false, '跨 5 欄應不合法');
  assert.strictEqual(isWithinGrid(1, 8, 1, 2), false, '跨 9 列應不合法');
  console.log('  ✅ 案例 1: 格點邊界檢驗通過');

  // 案例 2: 格點佔用計算
  const cells = getOccupiedCells(2, 3, 2, 2);
  assert.deepStrictEqual(cells, ['2,3', '3,3', '2,4', '3,4']);
  console.log('  ✅ 案例 2: 2x2 佔用空間計算通過');

  // 案例 3: 重疊檢驗
  const a = { col: 1, row: 1, w: 2, h: 2 };
  const b = { col: 2, row: 2, w: 2, h: 2 };
  const c = { col: 3, row: 3, w: 1, h: 1 };
  assert.strictEqual(checkOverlap(a, b), true, 'a 與 b 應重疊');
  assert.strictEqual(checkOverlap(a, c), false, 'a 與 c 不應重疊');
  console.log('  ✅ 案例 3: 幾何重疊檢驗通過');

  // 案例 4: 無障礙置放
  const items0 = [
    { id: 'btn-1', col: 1, row: 1, w: 2, h: 1 },
    { id: 'btn-2', col: 3, row: 1, w: 2, h: 1 }
  ];
  const res0 = resolveReflow(items0, 'btn-1', { col: 1, row: 2, w: 2, h: 1 });
  assert.strictEqual(res0.success, true);
  assert.strictEqual(res0.items[0].row, 2);
  assert.strictEqual(res0.items[1].row, 1);
  console.log('  ✅ 案例 4: 空白格位平移通過');

  // 案例 5: 1x1 碰撞推擠
  const items1 = [
    { id: 'btn-1', col: 1, row: 1, w: 1, h: 1 },
    { id: 'btn-2', col: 2, row: 1, w: 1, h: 1 }
  ];
  const res1 = resolveReflow(items1, 'btn-1', { col: 2, row: 1, w: 1, h: 1 });
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.items[0].col, 2);
  // btn-2 應被推擠至 (3, 1) 或可用格位
  assert.ok(res1.items[1].col > 2 || res1.items[1].row > 1);
  console.log('  ✅ 案例 5: 1x1 單一碰撞推擠通過');

  // 案例 6: 放大為 2x2 碰撞推擠
  const items2 = [
    { id: 'btn-1', col: 1, row: 1, w: 1, h: 1 },
    { id: 'btn-2', col: 2, row: 1, w: 1, h: 1 },
    { id: 'btn-3', col: 1, row: 2, w: 1, h: 1 }
  ];
  const res2 = resolveReflow(items2, 'btn-1', { col: 1, row: 1, w: 2, h: 2 });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.items[0].w, 2);
  assert.strictEqual(res2.items[0].h, 2);
  // btn-2 和 btn-3 原佔 (2,1) 和 (1,2)，現在必須被推到 2x2 以外
  const occ1 = getOccupiedCells(1, 1, 2, 2);
  assert.ok(!occ1.includes(`${res2.items[1].col},${res2.items[1].row}`));
  assert.ok(!occ1.includes(`${res2.items[2].col},${res2.items[2].row}`));
  console.log('  ✅ 案例 6: 按鈕放大為 2x2 多向推擠通過');

  // 案例 7: 骨牌連續推擠
  const items3 = [
    { id: 'btn-1', col: 1, row: 1, w: 1, h: 1 },
    { id: 'btn-2', col: 2, row: 1, w: 1, h: 1 },
    { id: 'btn-3', col: 3, row: 1, w: 1, h: 1 },
    { id: 'btn-4', col: 4, row: 1, w: 1, h: 1 }
  ];
  const res3 = resolveReflow(items3, 'btn-1', { col: 1, row: 1, w: 2, h: 1 });
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.items[0].w, 2);
  // 被碰撞的 btn-2 遇到 (3,1) 與 (4,1) 障礙，自動順移換行到第 2 行 (1, 2)
  assert.strictEqual(res3.items[1].row, 2, 'btn-2 應換行順移至 row 2');
  console.log('  ✅ 案例 7: 障礙跳躍與換行推擠通過');

  // 案例 8: 滿格熔斷防禦 (當畫布已經放滿無法推擠時)
  const fullItems = [];
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= 4; c++) {
      fullItems.push({ id: `cell-${c}-${r}`, col: c, row: r, w: 1, h: 1 });
    }
  }
  // 嘗試把其中一個 1x1 變成 2x2（總格數需 33 格，超出 32 格上限）
  const resFull = resolveReflow(fullItems, 'cell-1-1', { col: 1, row: 1, w: 2, h: 2 });
  assert.strictEqual(resFull.success, false);
  assert.strictEqual(resFull.overflow, true);
  console.log('  ✅ 案例 8: 滿格 32 格溢出熔斷保護通過');

  // 案例 9: 巨幅組件後半段無空間時，自動回捲至前半段 (1, 1) 空格安置
  const itemsPrompter = [
    { id: 'btn-1', col: 1, row: 5, w: 2, h: 1 },
    { id: 'prompter', col: 1, row: 6, w: 4, h: 3 }
  ];
  // 把 btn-1 移到 (1, 6) 撞到 prompter，prompter 往下無空間（需 3 行），自動回捲至前面 (1, 1) 成功安置！
  const resP = resolveReflow(itemsPrompter, 'btn-1', { col: 1, row: 6, w: 2, h: 1 });
  assert.strictEqual(resP.success, true);
  assert.strictEqual(resP.items[1].row, 1, 'prompter 應回捲至 row 1');
  console.log('  ✅ 案例 9: 巨幅組件空間探測與回捲安置通過');

  // 案例 9b: 真正無法安置時的溢出熔斷
  const crowdedItems = [
    { id: 'btn-top', col: 1, row: 1, w: 4, h: 6 }, // 佔滿 1~6 行
    { id: 'prompter', col: 1, row: 7, w: 4, h: 2 }, // 佔滿 7~8 行
    { id: 'btn-extra', col: 1, row: 8, w: 2, h: 1 }
  ];
  // 嘗試將 btn-extra 放大為 4x2，此時畫布完全無法容納
  const resCrowded = resolveReflow(crowdedItems, 'btn-extra', { col: 1, row: 7, w: 4, h: 2 });
  assert.strictEqual(resCrowded.overflow, true, '應觸發溢出熔斷');
  console.log('  ✅ 案例 9b: 空間全數耗盡之溢出熔斷通過');

  // 案例 10: 找到可用格位演算法
  const map = new Set(['1,1', '2,1', '3,1', '4,1']); // 第 1 行全滿
  const slot = findNextAvailableSlot(map, 2, 2, 1, 1);
  assert.deepStrictEqual(slot, { col: 1, row: 2 });
  console.log('  ✅ 案例 10: 空格探測自適應換行通過');

  console.log('🎉 Ticket 03 Auto-Reflow Engine 10 組極限盲測全數 100% 綠燈通過！');
} catch (err) {
  console.error('❌ Ticket 03 測試失敗:', err);
  process.exit(1);
}
