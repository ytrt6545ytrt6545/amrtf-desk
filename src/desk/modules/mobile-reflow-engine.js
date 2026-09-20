// ==============================================================================
// 🧩 AMRTF-Desk 行動端 4 × 8 二維格點碰撞與智慧推擠引擎 (Auto-Reflow Engine)
// UMD 雙向兼容規範 (100% 支援瀏覽器傳統 Script 與 Node.js 單元測試)
// ==============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    // 瀏覽器全域 window / globalThis
    root.MobileReflowEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  const GRID_COLS = 4;
  const GRID_ROWS = 8;
  const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 32 格

  function isWithinGrid(col, row, w, h) {
    return col >= 1 && col + w - 1 <= GRID_COLS && row >= 1 && row + h - 1 <= GRID_ROWS;
  }

  function getOccupiedCells(col, row, w, h) {
    const cells = [];
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        cells.push(`${c},${r}`);
      }
    }
    return cells;
  }

  function checkOverlap(a, b) {
    return !(
      a.col + a.w - 1 < b.col ||
      b.col + b.w - 1 < a.col ||
      a.row + a.h - 1 < b.row ||
      b.row + b.h - 1 < a.row
    );
  }

  function buildOccupiedMap(items, excludeId = null) {
    const map = new Set();
    for (const it of items) {
      if (it.id === excludeId) continue;
      const cells = getOccupiedCells(it.col, it.row, it.w, it.h);
      cells.forEach(c => map.add(c));
    }
    return map;
  }

  function findNextAvailableSlot(occupiedMap, w, h, startCol = 1, startRow = 1) {
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
    return null;
  }

  function resolveReflow(items, movedItemId, targetRect) {
    const { col, row, w, h } = targetRect;

    if (!isWithinGrid(col, row, w, h)) {
      return { success: false, items, overflow: true, reason: '超出 4x8 格點邊界' };
    }

    const newItems = items.map(it => ({ ...it }));
    const targetIndex = newItems.findIndex(it => it.id === movedItemId);
    if (targetIndex === -1) {
      return { success: false, items, overflow: false, reason: '找不到目標元件' };
    }

    newItems[targetIndex] = { ...newItems[targetIndex], col, row, w, h };
    const targetItem = newItems[targetIndex];

    const colliders = [];
    for (let i = 0; i < newItems.length; i++) {
      if (i === targetIndex) continue;
      if (checkOverlap(targetItem, newItems[i])) {
        colliders.push(i);
      }
    }

    if (colliders.length === 0) {
      return { success: true, items: newItems, overflow: false };
    }

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

    for (const cIdx of colliders) {
      const colItem = newItems[cIdx];
      const slot = findNextAvailableSlot(occupiedMap, colItem.w, colItem.h, targetItem.col, targetItem.row) ||
                   findNextAvailableSlot(occupiedMap, colItem.w, colItem.h, 1, 1);

      if (!slot) {
        return { success: false, items, overflow: true, reason: '畫布空間不足，無法容納推擠元件' };
      }

      colItem.col = slot.col;
      colItem.row = slot.row;
      getOccupiedCells(slot.col, slot.row, colItem.w, colItem.h).forEach(c => occupiedMap.add(c));
    }

    return { success: true, items: newItems, overflow: false };
  }

  return {
    GRID_COLS,
    GRID_ROWS,
    TOTAL_CELLS,
    isWithinGrid,
    getOccupiedCells,
    checkOverlap,
    buildOccupiedMap,
    findNextAvailableSlot,
    resolveReflow
  };
});
