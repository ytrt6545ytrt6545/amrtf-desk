// ==============================================================================
// 🧩 AMRTF-Desk 行動端 4 × 8 二維格點碰撞與智慧推擠引擎 (Auto-Reflow Engine)
// 100% 純函數無副作用，支援二維空間佔用計算、重疊碰撞偵測與骨牌連鎖推擠
// ==============================================================================

export const GRID_COLS = 4;
export const GRID_ROWS = 8;
export const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 32 格

/**
 * 檢查矩形是否在 4x8 邊界內
 */
export function isWithinGrid(col, row, w, h) {
  return col >= 1 && col + w - 1 <= GRID_COLS && row >= 1 && row + h - 1 <= GRID_ROWS;
}

/**
 * 取得矩形涵蓋的所有 (c, r) 座標
 */
export function getOccupiedCells(col, row, w, h) {
  const cells = [];
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      cells.push(`${c},${r}`);
    }
  }
  return cells;
}

/**
 * 檢查兩矩形是否重疊碰撞
 */
export function checkOverlap(a, b) {
  return !(
    a.col + a.w - 1 < b.col ||
    b.col + b.w - 1 < a.col ||
    a.row + a.h - 1 < b.row ||
    b.row + b.h - 1 < a.row
  );
}

/**
 * 建立當前畫布佔用點陣圖 (排除指定 ID)
 */
export function buildOccupiedMap(items, excludeId = null) {
  const map = new Set();
  for (const it of items) {
    if (it.id === excludeId) continue;
    const cells = getOccupiedCells(it.col, it.row, it.w, it.h);
    cells.forEach(c => map.add(c));
  }
  return map;
}

/**
 * 尋找自 (startCol, startRow) 起，能完整容納 (w, h) 的下一個可用格位
 */
export function findNextAvailableSlot(occupiedMap, w, h, startCol = 1, startRow = 1) {
  for (let r = startRow; r <= GRID_ROWS - h + 1; r++) {
    const minCol = (r === startRow) ? startCol : 1;
    for (let c = minCol; c <= GRID_COLS - w + 1; c++) {
      const cells = getOccupiedCells(c, r, w, h);
      const isFree = cells.every(cell => !occupiedMap.has(cell));
      if (isFree) {
        return { col: c, row: r };
      }
    }
  }
  return null; // 無法容納（滿格）
}

/**
 * 核心推擠函式：將 movedItemId 移至或改大小為 targetRect，並自動重排碰撞元件
 * @param {Array} items - 當前畫布元件清單
 * @param {string} movedItemId - 操作中的元件 ID
 * @param {Object} targetRect - { col, row, w, h }
 * @returns {Object} { success: boolean, items: Array, overflow: boolean }
 */
export function resolveReflow(items, movedItemId, targetRect) {
  const { col, row, w, h } = targetRect;

  // 1. 基本邊界校驗
  if (!isWithinGrid(col, row, w, h)) {
    return { success: false, items, overflow: true, reason: '超出 4x8 格點邊界' };
  }

  // 深拷貝現有元件
  const newItems = items.map(it => ({ ...it }));
  const targetIndex = newItems.findIndex(it => it.id === movedItemId);
  if (targetIndex === -1) {
    return { success: false, items, overflow: false, reason: '找不到目標元件' };
  }

  // 暫時更新目標元件
  newItems[targetIndex] = { ...newItems[targetIndex], col, row, w, h };

  // 2. 檢測與目標元件碰撞的障礙物清單
  const targetItem = newItems[targetIndex];
  const colliders = [];
  for (let i = 0; i < newItems.length; i++) {
    if (i === targetIndex) continue;
    if (checkOverlap(targetItem, newItems[i])) {
      colliders.push(i);
    }
  }

  // 3. 若無碰撞，直接成功返回
  if (colliders.length === 0) {
    return { success: true, items: newItems, overflow: false };
  }

  // 4. 連鎖推擠邏輯：將障礙物依序順移至可用空格
  // 建立包含已安置元件的空間 Map
  const settledIndices = new Set([targetIndex]);
  for (let i = 0; i < newItems.length; i++) {
    if (!colliders.includes(i) && i !== targetIndex) {
      settledIndices.add(i);
    }
  }

  const occupiedMap = new Set();
  settledIndices.forEach(idx => {
    const it = newItems[idx];
    getOccupiedCells(it.col, it.row, it.w, it.h).forEach(c => occupiedMap.add(c));
  });

  // 依序為碰撞元件找尋新格位
  for (const cIdx of colliders) {
    const colItem = newItems[cIdx];
    // 優先從目標位置之後開始尋找
    const slot = findNextAvailableSlot(occupiedMap, colItem.w, colItem.h, targetItem.col, targetItem.row) ||
                 findNextAvailableSlot(occupiedMap, colItem.w, colItem.h, 1, 1);

    if (!slot) {
      // 空間耗盡，觸發滿格熔斷保護
      return { success: false, items, overflow: true, reason: '畫布空間不足，無法容納推擠元件' };
    }

    // 安置新格位
    colItem.col = slot.col;
    colItem.row = slot.row;
    getOccupiedCells(slot.col, slot.row, colItem.w, colItem.h).forEach(c => occupiedMap.add(c));
  }

  return { success: true, items: newItems, overflow: false };
}

// 支援瀏覽器環境掛載
if (typeof window !== 'undefined') {
  window.MobileReflowEngine = {
    isWithinGrid,
    getOccupiedCells,
    checkOverlap,
    buildOccupiedMap,
    findNextAvailableSlot,
    resolveReflow
  };
}
