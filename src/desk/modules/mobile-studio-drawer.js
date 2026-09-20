// ==============================================================================
// 📱 AMRTF-Desk 1:1 手機模擬編排艙模組 (Mobile Studio Drawer)
// 支援 4 欄 × 8 列磁吸畫布、Drag & Drop、⤡ 磁吸拉伸把手、快捷尺規與智慧推擠
// ==============================================================================

(function () {
  class MobileStudioDrawer {
    constructor() {
      this.isOpen = false;
      this.layout = null;
      this.catalog = [];
      this.activeResizingItem = null;
      this.draggedCatalogItem = null;
      this.draggedCanvasItem = null;

      this.initDom();
      this.bindEvents();
    }

    initDom() {
      // 建立抽屜容器外框
      const drawer = document.createElement('div');
      drawer.id = 'mobileStudioDrawer';
      drawer.className = 'mobile-studio-drawer';
      drawer.innerHTML = `
        <div class="studio-backdrop" id="studioBackdrop"></div>
        <div class="studio-panel">
          <!-- 頂部導航列 -->
          <div class="studio-header">
            <div class="studio-title-group">
              <span class="studio-title">📱 4×8 行動操作艙模擬編排</span>
              <span class="studio-subtitle">1:1 真實比例 · 磁吸拖曳 · 50ms 即時雙端熱同步</span>
            </div>
            <div class="studio-actions">
              <button class="studio-btn" id="btnTplMinimal">📋 精簡6鍵模板</button>
              <button class="studio-btn" id="btnTplFull">🚀 導播全功能模板</button>
              <button class="studio-btn btn-warn" id="btnStudioReset">🔄 重設預設</button>
              <button class="studio-close-btn" id="btnStudioClose" title="關閉編排艙">✕</button>
            </div>
          </div>

          <!-- 主工作區：左側 1:1 手機模擬框 + 右側元件庫存盒 -->
          <div class="studio-workspace">
            <!-- 📱 左側手機模擬器 -->
            <div class="phone-stage">
              <div class="phone-frame" id="phoneMockupFrame">
                <!-- 手機頂部聽筒造型微飾條 -->
                <div class="phone-speaker-notch"></div>
                <!-- 4 欄 × 8 列 (32格) 磁吸網格 -->
                <div class="phone-canvas-grid" id="phoneCanvasGrid"></div>
              </div>
              <div class="phone-hint">💡 提示：拖曳按鈕換位，拉伸右下角 ⤡ 或點擊尺寸膠囊改大小，放開即自動同步手機！</div>
            </div>

            <!-- 🧰 右側元件庫存盒 (Toolbox) -->
            <div class="arsenal-panel">
              <div class="arsenal-header">
                <span>🧰 按鈕與元件庫存盒</span>
                <span class="arsenal-count" id="arsenalCount">0 項可用</span>
              </div>
              <div class="arsenal-list" id="arsenalList"></div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(drawer);
    }

    bindEvents() {
      // 頂部開啟按鈕
      const toggleBtn = document.getElementById('btnMobileStudioToggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this.toggle());
      }

      // 抽屜關閉
      const closeBtn = document.getElementById('btnStudioClose');
      const backdrop = document.getElementById('studioBackdrop');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (backdrop) backdrop.addEventListener('click', () => this.close());

      // 模板切換
      const btnMinimal = document.getElementById('btnTplMinimal');
      const btnFull = document.getElementById('btnTplFull');
      const btnReset = document.getElementById('btnStudioReset');

      if (btnMinimal) btnMinimal.addEventListener('click', () => this.applyMinimalTemplate());
      if (btnFull) btnFull.addEventListener('click', () => this.applyFullTemplate());
      if (btnReset) btnReset.addEventListener('click', () => this.resetLayout());

      // 畫布放下 (Drop) 監聽
      const canvas = document.getElementById('phoneCanvasGrid');
      canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      canvas.addEventListener('drop', (e) => this.handleCanvasDrop(e));
    }

    async open() {
      this.isOpen = true;
      const drawer = document.getElementById('mobileStudioDrawer');
      drawer.classList.add('active');
      await this.fetchLayoutAndCatalog();
      this.renderCanvas();
      this.renderArsenal();
    }

    close() {
      this.isOpen = false;
      const drawer = document.getElementById('mobileStudioDrawer');
      drawer.classList.remove('active');
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    async fetchLayoutAndCatalog() {
      try {
        const res = await fetch('/api/mobile-layout');
        const data = await res.json();
        this.layout = data.layout;
        this.catalog = data.catalog || [];
      } catch (e) {
        console.error('[MobileStudio] 載入版面配置失敗:', e);
      }
    }

    renderCanvas() {
      const grid = document.getElementById('phoneCanvasGrid');
      grid.innerHTML = '';
      if (!this.layout || !this.layout.items) return;

      for (const item of this.layout.items) {
        const card = document.createElement('div');
        card.className = `mock-item ${item.type === 'widget' ? 'is-widget' : 'is-btn'} ${item.style || 'btn-secondary'}`;
        card.id = `mock-${item.id}`;
        card.style.gridColumn = `${item.col} / span ${item.w}`;
        card.style.gridRow = `${item.row} / span ${item.h}`;
        card.draggable = true;

        // 尺寸快捷顯示
        const sizeBadge = `${item.w}×${item.h}`;

        card.innerHTML = `
          <div class="mock-header">
            <span class="mock-size-badge" title="點擊切換尺寸">${sizeBadge}</span>
            <button class="mock-remove-btn" title="移回庫存盒">✕</button>
          </div>
          <div class="mock-body">
            <span class="mock-icon">${this.getItemIcon(item)}</span>
            <span class="mock-label">${item.label || item.id}</span>
          </div>
          <!-- 右下角懸浮磁吸拉伸把手 -->
          <div class="mock-resize-handle" title="拖拉改變跨欄與跨列">⤡</div>
        `;

        // 移除回到庫存
        card.querySelector('.mock-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeItemFromCanvas(item.id);
        });

        // 點擊尺寸 Badge 快速切換
        card.querySelector('.mock-size-badge').addEventListener('click', (e) => {
          e.stopPropagation();
          this.cycleItemSize(item);
        });

        // 畫布內拖曳
        card.addEventListener('dragstart', (e) => {
          this.draggedCanvasItem = item;
          e.dataTransfer.setData('text/plain', item.id);
        });

        // 拉伸把手事件
        const handle = card.querySelector('.mock-resize-handle');
        handle.addEventListener('mousedown', (e) => this.startResizing(e, item, card));

        grid.appendChild(card);
      }
    }

    renderArsenal() {
      const list = document.getElementById('arsenalList');
      list.innerHTML = '';
      const activeIds = new Set((this.layout?.items || []).map(it => it.id));
      const unplaced = this.catalog.filter(cat => !activeIds.has(cat.id));

      const countEl = document.getElementById('arsenalCount');
      if (countEl) countEl.textContent = `${unplaced.length} 項可用`;

      if (unplaced.length === 0) {
        list.innerHTML = `<div class="arsenal-empty">🎉 所有元件已全數上陣！</div>`;
        return;
      }

      for (const item of unplaced) {
        const row = document.createElement('div');
        row.className = 'arsenal-item';
        row.draggable = true;
        row.innerHTML = `
          <div class="arsenal-icon">${item.icon || '⚡'}</div>
          <div class="arsenal-info">
            <div class="arsenal-name">${item.label}</div>
            <div class="arsenal-sub">${item.defaultW}×${item.defaultH} · ${item.category}</div>
          </div>
          <button class="arsenal-add-btn" title="加入手機畫布">+ 放入</button>
        `;

        row.querySelector('.arsenal-add-btn').addEventListener('click', () => {
          this.addItemToCanvas(item);
        });

        row.addEventListener('dragstart', (e) => {
          this.draggedCatalogItem = item;
          e.dataTransfer.setData('text/plain', item.id);
        });

        list.appendChild(row);
      }
    }

    getItemIcon(item) {
      const found = this.catalog.find(c => c.id === item.id);
      if (found && found.icon) return found.icon;
      if (item.action === 'play') return '▶';
      if (item.action === 'stop') return '⏹';
      if (item.id === 'header-info') return '⏱️';
      if (item.id === 'widget-teleprompter') return '📜';
      return '⚡';
    }

    addItemToCanvas(catItem) {
      if (!window.MobileReflowEngine) return;
      const occupiedMap = window.MobileReflowEngine.buildOccupiedMap(this.layout.items);
      const slot = window.MobileReflowEngine.findNextAvailableSlot(occupiedMap, catItem.defaultW, catItem.defaultH, 1, 1);

      if (!slot) {
        this.triggerPhoneShake('畫布空間不足，無法容納該元件！');
        return;
      }

      const newItem = {
        id: catItem.id,
        type: catItem.type,
        col: slot.col,
        row: slot.row,
        w: catItem.defaultW,
        h: catItem.defaultH,
        action: catItem.action,
        label: catItem.label,
        style: catItem.style,
        category: catItem.category
      };

      this.layout.items.push(newItem);
      this.commitLayout();
    }

    removeItemFromCanvas(itemId) {
      this.layout.items = this.layout.items.filter(it => it.id !== itemId);
      this.commitLayout();
    }

    cycleItemSize(item) {
      if (!window.MobileReflowEngine) return;
      // 輪詢預設尺規順序
      const presets = [
        { w: 1, h: 1 },
        { w: 2, h: 1 },
        { w: 2, h: 2 },
        { w: 4, h: 1 },
        { w: 4, h: 2 }
      ];
      if (item.id === 'widget-teleprompter') {
        presets.push({ w: 4, h: 3 }, { w: 4, h: 4 });
      }

      const currIdx = presets.findIndex(p => p.w === item.w && p.h === item.h);
      const nextPreset = presets[(currIdx + 1) % presets.length];

      const targetRect = {
        col: Math.min(item.col, 4 - nextPreset.w + 1),
        row: Math.min(item.row, 8 - nextPreset.h + 1),
        w: nextPreset.w,
        h: nextPreset.h
      };

      const reflow = window.MobileReflowEngine.resolveReflow(this.layout.items, item.id, targetRect);
      if (reflow.success) {
        this.layout.items = reflow.items;
        this.commitLayout();
      } else {
        this.triggerPhoneShake('尺寸擴展受阻：' + (reflow.reason || '空間不足'));
      }
    }

    handleCanvasDrop(e) {
      e.preventDefault();
      const canvas = document.getElementById('phoneCanvasGrid');
      const rect = canvas.getBoundingClientRect();
      const cellW = rect.width / 4;
      const cellH = rect.height / 8;

      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const targetCol = Math.max(1, Math.min(4, Math.floor(clickX / cellW) + 1));
      const targetRow = Math.max(1, Math.min(8, Math.floor(clickY / cellH) + 1));

      if (this.draggedCanvasItem) {
        // 畫布內移動換位
        const it = this.draggedCanvasItem;
        this.draggedCanvasItem = null;
        const targetRect = {
          col: Math.min(targetCol, 4 - it.w + 1),
          row: Math.min(targetRow, 8 - it.h + 1),
          w: it.w,
          h: it.h
        };
        const reflow = window.MobileReflowEngine.resolveReflow(this.layout.items, it.id, targetRect);
        if (reflow.success) {
          this.layout.items = reflow.items;
          this.commitLayout();
        } else {
          this.triggerPhoneShake('移動碰撞：' + reflow.reason);
        }
      } else if (this.draggedCatalogItem) {
        // 從庫存盒拉入
        const cat = this.draggedCatalogItem;
        this.draggedCatalogItem = null;
        const targetRect = {
          col: Math.min(targetCol, 4 - cat.defaultW + 1),
          row: Math.min(targetRow, 8 - cat.defaultH + 1),
          w: cat.defaultW,
          h: cat.defaultH
        };

        const newItem = {
          id: cat.id,
          type: cat.type,
          col: targetRect.col,
          row: targetRect.row,
          w: targetRect.w,
          h: targetRect.h,
          action: cat.action,
          label: cat.label,
          style: cat.style,
          category: cat.category
        };

        this.layout.items.push(newItem);
        const reflow = window.MobileReflowEngine.resolveReflow(this.layout.items, cat.id, targetRect);
        if (reflow.success) {
          this.layout.items = reflow.items;
          this.commitLayout();
        } else {
          this.layout.items.pop(); // 回滾
          this.triggerPhoneShake('無法放入：空間不足');
        }
      }
    }

    startResizing(e, item, cardEl) {
      e.stopPropagation();
      e.preventDefault();
      const canvas = document.getElementById('phoneCanvasGrid');
      const rect = canvas.getBoundingClientRect();
      const cellW = rect.width / 4;
      const cellH = rect.height / 8;

      const onMouseMove = (moveEvent) => {
        const mouseX = moveEvent.clientX - rect.left;
        const mouseY = moveEvent.clientY - rect.top;

        const endCol = Math.max(item.col, Math.min(4, Math.ceil(mouseX / cellW)));
        const endRow = Math.max(item.row, Math.min(8, Math.ceil(mouseY / cellH)));

        const newW = endCol - item.col + 1;
        const newH = endRow - item.row + 1;

        if (newW !== item.w || newH !== item.h) {
          const targetRect = { col: item.col, row: item.row, w: newW, h: newH };
          const reflow = window.MobileReflowEngine.resolveReflow(this.layout.items, item.id, targetRect);
          if (reflow.success) {
            this.layout.items = reflow.items;
            this.renderCanvas();
          }
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        this.commitLayout();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    async commitLayout() {
      this.renderCanvas();
      this.renderArsenal();
      try {
        await fetch('/api/mobile-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.layout)
        });
      } catch (e) {
        console.error('[MobileStudio] 儲存佈局失敗:', e);
      }
    }

    async applyMinimalTemplate() {
      // 精簡 6 鍵模板
      this.layout = {
        version: '1.0.0',
        grid: { cols: 4, rows: 8 },
        items: [
          { id: 'header-info', type: 'widget', col: 1, row: 1, w: 4, h: 1, label: '時鐘與講次' },
          { id: 'btn-play', type: 'button', col: 1, row: 2, w: 2, h: 2, action: 'play', label: '▶ 播放', style: 'btn-play' },
          { id: 'btn-stop', type: 'button', col: 3, row: 2, w: 2, h: 2, action: 'stop', label: '⏹ 停止', style: 'btn-stop' },
          { id: 'btn-bwd', type: 'button', col: 1, row: 4, w: 2, h: 1, action: 'seek_bwd', label: '⏪ 5s 倒退', style: 'btn-secondary' },
          { id: 'btn-fwd', type: 'button', col: 3, row: 4, w: 2, h: 1, action: 'seek_fwd', label: '5s ⏩ 快進', style: 'btn-secondary' },
          { id: 'widget-teleprompter', type: 'widget', col: 1, row: 5, w: 4, h: 4, label: '師父開示逐字提詞機' }
        ]
      };
      await this.commitLayout();
    }

    async applyFullTemplate() {
      // 導播全功能模板
      this.layout = {
        version: '1.0.0',
        grid: { cols: 4, rows: 8 },
        items: [
          { id: 'header-info', type: 'widget', col: 1, row: 1, w: 4, h: 1, label: '時鐘與講次' },
          { id: 'btn-play', type: 'button', col: 1, row: 2, w: 2, h: 2, action: 'play', label: '▶ 播放', style: 'btn-play' },
          { id: 'btn-stop', type: 'button', col: 3, row: 2, w: 2, h: 2, action: 'stop', label: '⏹ 停止', style: 'btn-stop' },
          { id: 'btn-bwd', type: 'button', col: 1, row: 4, w: 2, h: 1, action: 'seek_bwd', label: '⏪ 5s 倒退', style: 'btn-secondary' },
          { id: 'btn-fwd', type: 'button', col: 3, row: 4, w: 2, h: 1, action: 'seek_fwd', label: '5s ⏩ 快進', style: 'btn-secondary' },
          { id: 'btn-quote', type: 'button', col: 1, row: 5, w: 2, h: 1, action: 'toggle_quote', label: '# 引文開關', style: 'btn-info' },
          { id: 'btn-theme', type: 'button', col: 3, row: 5, w: 2, h: 1, action: 'toggle_theme', label: '🌓 亮暗色', style: 'btn-dark' },
          { id: 'widget-teleprompter', type: 'widget', col: 1, row: 6, w: 4, h: 3, label: '師父開示逐字提詞機' }
        ]
      };
      await this.commitLayout();
    }

    async resetLayout() {
      try {
        const res = await fetch('/api/mobile-layout/reset', { method: 'POST' });
        const data = await res.json();
        this.layout = data.layout;
        this.renderCanvas();
        this.renderArsenal();
      } catch (e) {
        console.error('[MobileStudio] 重設失敗:', e);
      }
    }

    triggerPhoneShake(msg) {
      const frame = document.getElementById('phoneMockupFrame');
      if (frame) {
        frame.classList.add('shake');
        setTimeout(() => frame.classList.remove('shake'), 400);
      }
      console.warn('[MobileStudio 邊界警報]', msg);
    }
  }

  // 掛載至全域
  window.MobileStudio = new MobileStudioDrawer();
})();
