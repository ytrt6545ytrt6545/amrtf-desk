// ==============================================================================
// 🎛️ AMRTF-Desk 廣播級 8 欄磁吸畫布與自訂操作艙引擎 (Deck Canvas Module · 健全修復版)
// ==============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const g = root || (typeof window !== 'undefined' ? window : globalThis);
    g.DeckCanvas = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  let currentMode = 'run'; // 'run' | 'edit'
  let currentLayout = null;
  let gridContainer = null;
  let drawerContainer = null;
  let drawerList = null;
  let statusBadge = null;
  let stashPool = null;

  // 永久常駐原生 DOM 元素快取池 (Native Elements Pool)
  // 核心鐵律：初次載入一次性鎖定所有原生按鈕，絕對嚴禁任何垃圾回收銷毀！
  const nativePool = new Map();

  let draggedItemId = null;
  let sizePickerModal = null;
  let activePickerItemId = null;

  /**
   * 初始化畫布
   */
  function init(options) {
    gridContainer = options.gridContainer;
    drawerContainer = options.drawerContainer;
    drawerList = options.drawerList;
    statusBadge = options.statusBadge;
    stashPool = document.getElementById('deckStashPool');

    if (!stashPool) {
      stashPool = document.createElement('div');
      stashPool.id = 'deckStashPool';
      stashPool.style.cssText = 'display: none !important;';
      document.body.appendChild(stashPool);
    }

    if (!gridContainer) {
      console.error('[DeckCanvas] 缺少必要的 gridContainer 容器');
      return;
    }

    // 1. 確保起訖選單內部的區間播放按鈕不被拆散
    const intervalRow = document.getElementById('intervalRowWidget');
    if (intervalRow) {
      ['btnPlayInterval', 'btnLoopInterval', 'btnStopInterval'].forEach(btnId => {
        const b = document.getElementById(btnId);
        if (b && b.parentNode !== intervalRow) {
          intervalRow.appendChild(b);
        }
      });
    }

    // 2. 一次性鎖定所有原生獨立頂層組件 (嚴格排除 interval-row 內部的子按鈕)
    const allKeycaps = document.querySelectorAll('#deckGridContainer > .keycap-btn, #deckGridContainer > .interval-row, #deckStashPool > .keycap-btn, #deckStashPool > .interval-row, .deck-grid-cell > .keycap-btn, .deck-grid-cell > .interval-row');
    allKeycaps.forEach(el => {
      // 確保排除 interval-row 內部的小按鈕
      if (el.closest('.interval-row') && !el.classList.contains('interval-row')) {
        return;
      }
      const id = el.id || (el.classList.contains('interval-row') ? 'intervalRowWidget' : null);
      if (id && !nativePool.has(id)) {
        nativePool.set(id, el);
      }
    });

    console.log(`🔒 [DeckCanvas] 永久原生快取池已鎖定 ${nativePool.size} 顆核心獨立組件`);

    // 3. 載入持久化佈局配置
    currentLayout = window.DeckStorage ? window.DeckStorage.loadLayout() : null;

    // 3. 建立快速尺寸選擇彈窗
    createSizePickerModal();

    // 4. 首次渲染
    renderCanvas();

    // 5. 鍵盤快捷鍵監聽: Ctrl+E 切換自訂態, Esc 退出自訂態
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        toggleMode();
      } else if (e.key === 'Escape' && currentMode === 'edit') {
        setMode('run');
      }
    });

    console.log('[DeckCanvas] 8 欄磁吸畫布引擎（無損節點池版）已就緒');
  }

  /**
   * 建立尺寸快速選擇浮窗
   */
  function createSizePickerModal() {
    if (document.getElementById('deckSizePickerModal')) return;

    sizePickerModal = document.createElement('div');
    sizePickerModal.id = 'deckSizePickerModal';
    sizePickerModal.className = 'deck-size-picker-modal';
    sizePickerModal.innerHTML = `
      <div class="size-picker-card">
        <div class="size-picker-title">⚡ 快速尺寸調整</div>
        <div class="size-picker-grid">
          <button class="size-opt-btn" data-cols="1" data-rows="1">1 × 1<br><small>緊湊標籤</small></button>
          <button class="size-opt-btn" data-cols="2" data-rows="1">2 × 1<br><small>標準寬鍵</small></button>
          <button class="size-opt-btn" data-cols="2" data-rows="2">2 × 2<br><small>正方大鍵</small></button>
          <button class="size-opt-btn" data-cols="4" data-rows="1">4 × 1<br><small>半行橫條</small></button>
          <button class="size-opt-btn" data-cols="4" data-rows="2">4 × 2<br><small>巨型主控鍵</small></button>
          <button class="size-opt-btn" data-cols="8" data-rows="1">8 × 1<br><small>滿版橫條</small></button>
          <button class="size-opt-btn" data-cols="8" data-rows="2">8 × 2<br><small>全版模組</small></button>
        </div>
        <div class="size-picker-actions">
          <button class="size-cancel-btn" id="btnCancelSizePicker">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(sizePickerModal);

    // 監聽尺寸按鈕點擊
    sizePickerModal.querySelectorAll('.size-opt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cols = parseInt(btn.getAttribute('data-cols'), 10);
        const rows = parseInt(btn.getAttribute('data-rows'), 10);
        if (activePickerItemId) {
          resizeItem(activePickerItemId, cols, rows);
        }
        closeSizePicker();
      });
    });

    sizePickerModal.querySelector('#btnCancelSizePicker').addEventListener('click', (e) => {
      e.stopPropagation();
      closeSizePicker();
    });

    sizePickerModal.addEventListener('click', (e) => {
      if (e.target === sizePickerModal) closeSizePicker();
    });
  }

  function openSizePicker(itemId) {
    activePickerItemId = itemId;
    if (sizePickerModal) {
      sizePickerModal.classList.add('show');
    }
  }

  function closeSizePicker() {
    activePickerItemId = null;
    if (sizePickerModal) {
      sizePickerModal.classList.remove('show');
    }
  }

  /**
   * 切換模式 (run <-> edit)
   */
  function toggleMode() {
    setMode(currentMode === 'run' ? 'edit' : 'run');
  }

  /**
   * 設定特定模式
   */
  function setMode(mode) {
    currentMode = mode;
    const body = document.body;
    const editToggleBtn = document.getElementById('btnEditLayoutToggle');

    if (mode === 'edit') {
      body.classList.add('mode-custom-editing');
      if (editToggleBtn) {
        editToggleBtn.innerHTML = '💾 完成儲存';
        editToggleBtn.classList.add('active-editing');
      }
      if (drawerContainer) drawerContainer.classList.add('show');
    } else {
      body.classList.remove('mode-custom-editing');
      if (editToggleBtn) {
        editToggleBtn.innerHTML = '🛠️ 編輯佈局';
        editToggleBtn.classList.remove('active-editing');
      }
      if (drawerContainer) drawerContainer.classList.remove('show');
      closeSizePicker();
      if (window.DeckStorage && currentLayout) {
        window.DeckStorage.saveLayout(currentLayout);
      }
    }

    renderDrawer();
    console.log(`[DeckCanvas] 模式切換為: ${mode}`);
  }

  /**
   * 核心渲染：無損節點池流轉 (Zero-Orphan Render Engine)
   */
  function renderCanvas() {
    if (!currentLayout || !currentLayout.items) return;

    // 先將所有原生節點暫時集中暫存至 stashPool，徹底防止 innerHTML = '' 時節點被銷毀
    nativePool.forEach(el => {
      if (el.parentNode && el.parentNode !== stashPool) {
        stashPool.appendChild(el);
      }
    });

    // 清空網格格位外框
    gridContainer.innerHTML = '';

    // 依序掛載可見項目
    currentLayout.items.forEach(item => {
      const nativeEl = nativePool.get(item.id);
      if (!nativeEl) return;

      // 若被隱藏，維持在 stashPool 內部，不掛到 grid
      if (item.hidden) {
        nativeEl.style.display = 'none';
        return;
      }

      nativeEl.style.display = '';

      // 建立包裝外框 .deck-grid-cell
      const cell = document.createElement('div');
      cell.className = 'deck-grid-cell';
      cell.setAttribute('data-id', item.id);
      cell.setAttribute('data-cols', item.cols || 2);
      cell.setAttribute('data-rows', item.rows || 1);
      cell.style.gridColumn = `span ${Math.min(item.cols || 2, 8)}`;
      cell.style.gridRow = `span ${item.rows || 1}`;

      // 附加階梯式尺寸 class
      updateSizeClasses(cell, item.cols || 2, item.rows || 1);

      // 把手 1: 右上角關閉 ✕ (加大點擊感應區，確證一擊必中)
      const closeBtn = document.createElement('button');
      closeBtn.className = 'cell-btn-close';
      closeBtn.innerHTML = '✕';
      closeBtn.title = '隱藏並收納至倉庫';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        hideItem(item.id);
      });

      // 把手 2: 右下角拉伸 ⤡ (點擊即呼出尺寸面板)
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'cell-handle-resize';
      resizeHandle.innerHTML = '⤡';
      resizeHandle.title = '點擊切換大小 (1x1 ~ 4x2)';
      resizeHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openSizePicker(item.id);
      });

      // 右鍵選單快捷尺寸
      cell.addEventListener('contextmenu', (e) => {
        if (currentMode === 'edit') {
          e.preventDefault();
          openSizePicker(item.id);
        }
      });

      // 拖曳相關事件
      cell.draggable = true;
      cell.addEventListener('dragstart', handleDragStart);
      cell.addEventListener('dragover', handleDragOver);
      cell.addEventListener('dragleave', handleDragLeave);
      cell.addEventListener('drop', handleDrop);
      cell.addEventListener('dragend', handleDragEnd);

      // 自訂模式下阻斷按鈕點擊，但不阻斷拖曳
      cell.addEventListener('click', (e) => {
        if (currentMode === 'edit') {
          // 自訂模式下純粹阻斷播放，不主動跳彈窗干擾操作員
          if (!e.target.closest('.cell-btn-close') && !e.target.closest('.cell-handle-resize')) {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      }, true);

      // 將原生按鈕移入外框
      cell.appendChild(nativeEl);
      cell.appendChild(closeBtn);
      cell.appendChild(resizeHandle);
      gridContainer.appendChild(cell);
    });

    renderDrawer();
  }

  function updateSizeClasses(cell, cols, rows) {
    cell.classList.remove('sz-1x1', 'sz-2x1', 'sz-2x2', 'sz-4x1', 'sz-4x2', 'sz-8x1', 'sz-8x2');
    cell.classList.add(`sz-${cols}x${rows}`);
  }

  /**
   * 渲染頂部未上陣倉庫 (Drawer)
   */
  function renderDrawer() {
    if (!drawerList || !currentLayout) return;

    drawerList.innerHTML = '';
    const hiddenItems = currentLayout.items.filter(item => item.hidden);

    if (hiddenItems.length === 0) {
      drawerList.innerHTML = '<span class="drawer-empty-hint">所有按鈕皆在畫布上（倉庫為空）</span>';
      return;
    }

    hiddenItems.forEach(item => {
      const tag = document.createElement('button');
      tag.className = 'drawer-tag-btn';
      tag.innerHTML = `+ ${item.label || item.id}`;
      tag.title = '點擊立即召回畫布';
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        recallItem(item.id);
      });
      drawerList.appendChild(tag);
    });
  }

  /**
   * 隱藏按鈕 (安全移入暫存池)
   */
  function hideItem(id) {
    const item = currentLayout.items.find(it => it.id === id);
    if (item) {
      item.hidden = true;
      renderCanvas();
      if (window.DeckStorage) window.DeckStorage.saveLayout(currentLayout);
    }
  }

  /**
   * 召回按鈕 (放回網格)
   */
  function recallItem(id) {
    const item = currentLayout.items.find(it => it.id === id);
    if (item) {
      item.hidden = false;
      renderCanvas();
      if (window.DeckStorage) window.DeckStorage.saveLayout(currentLayout);
    }
  }

  /**
   * 調整按鈕尺寸
   */
  function resizeItem(id, cols, rows) {
    const item = currentLayout.items.find(it => it.id === id);
    if (item) {
      item.cols = Math.min(Math.max(cols, 1), 8);
      item.rows = Math.min(Math.max(rows, 1), 4);
      renderCanvas();
      if (window.DeckStorage) window.DeckStorage.saveLayout(currentLayout);
    }
  }

  /**
   * 拖曳處理事件 (支援精準插入與平滑視覺導引)
   */
  function handleDragStart(e) {
    if (currentMode !== 'edit') {
      e.preventDefault();
      return;
    }
    draggedItemId = this.getAttribute('data-id');
    this.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItemId);
  }

  function handleDragOver(e) {
    if (currentMode !== 'edit') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!this.classList.contains('is-dragging')) {
      this.classList.add('drag-over-target');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over-target');
  }

  function handleDrop(e) {
    if (currentMode !== 'edit') return;
    e.preventDefault();
    this.classList.remove('drag-over-target');

    const targetId = this.getAttribute('data-id');
    if (!draggedItemId || draggedItemId === targetId) return;

    // 交換順序
    const items = currentLayout.items;
    const fromIndex = items.findIndex(it => it.id === draggedItemId);
    const toIndex = items.findIndex(it => it.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const movedItem = items.splice(fromIndex, 1)[0];
      items.splice(toIndex, 0, movedItem);
      renderCanvas();
      if (window.DeckStorage) window.DeckStorage.saveLayout(currentLayout);
    }
  }

  function handleDragEnd() {
    this.classList.remove('is-dragging');
    document.querySelectorAll('.deck-grid-cell').forEach(cell => {
      cell.classList.remove('drag-over-target');
    });
    draggedItemId = null;
  }

  /**
   * 套用模板 (全功能 / 極簡)
   */
  function applyTemplate(type) {
    if (!window.DeckStorage) return;
    currentLayout = window.DeckStorage.resetToDefault(type);
    renderCanvas();
    console.log(`✅ [DeckCanvas] 成功套用 ${type} 模板，所有節點已安全同步`);
  }

  /**
   * 匯出配置 JSON
   */
  function exportConfig() {
    if (!window.DeckStorage || !currentLayout) return;
    const json = window.DeckStorage.exportToJson(currentLayout);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amrtf-deck-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 匯入配置 JSON
   */
  function importConfig(jsonString) {
    if (!window.DeckStorage) return;
    const res = window.DeckStorage.importFromJson(jsonString);
    if (res.success) {
      currentLayout = res.layout;
      renderCanvas();
      alert('✅ 佈局匯入成功！');
    } else {
      alert(`⚠️ 匯入失敗：${res.error}`);
    }
  }

  return {
    init,
    setMode,
    toggleMode,
    getMode: () => currentMode,
    getLayout: () => currentLayout,
    applyTemplate,
    exportConfig,
    importConfig
  };
});
