// ==============================================================================
// 📱 AMRTF-Desk 1:1 手機模擬編排艙模組 (Mobile Studio Drawer · 真機互動預覽版)
// 支援 4×8 磁吸畫布、Drag & Drop、⤡ 拉伸、尺寸降級適應、覆蓋置換與「🎮 真機操作預覽」
// ==============================================================================

(function () {
  class MobileStudioDrawer {
    constructor() {
      this.isOpen = false;
      this.mode = 'edit'; // 'edit' | 'preview'
      this.currentProfile = 'full'; // 'full' | 'minimal'
      this.fontScale = localStorage.getItem('amrtf_mobile_font_scale') || '100';
      this.layout = null;
      this.catalog = [];
      this.liveState = null;
      this.draggedCatalogItem = null;
      this.draggedCanvasItem = null;

      this.initDom();
      this.bindEvents();
    }

    initDom() {
      const drawer = document.createElement('div');
      drawer.id = 'mobileStudioDrawer';
      drawer.className = 'mobile-studio-drawer';
      drawer.innerHTML = `
        <div class="studio-backdrop" id="studioBackdrop"></div>
        <div class="studio-panel">
          <!-- 頂部導航列 -->
          <div class="studio-header">
            <div class="studio-title-group">
              <span class="studio-title">📱 4×8 行動操作艙編排與實機預覽</span>
              <span class="studio-subtitle" id="studioSubTitle">1:1 真實比例 · 磁吸拖曳 · 50ms 即時雙端熱同步</span>
            </div>
            <div class="studio-actions">
              <!-- 🔤 手機按鈕字體比例切換 -->
              <button class="studio-btn" id="btnStudioFontScale" title="一鍵切換手機按鈕字體比例 (100%/120%/140%)" style="min-width: 68px;">🔤 ${this.fontScale}%</button>
              <!-- 🎮 模式切換鈕 -->
              <button class="studio-btn btn-mode-toggle" id="btnStudioModeToggle">🎮 切換真機預覽操作</button>
              <button class="studio-btn" id="btnTplMinimal">📋 精簡6鍵模板</button>
              <button class="studio-btn active" id="btnTplFull" style="border-color:#38bdf8;">🚀 導播全功能模板</button>
              <button class="studio-btn btn-warn" id="btnStudioReset">🔄 重設當前</button>
              <button class="studio-close-btn" id="btnStudioClose" title="關閉編排艙">✕</button>
            </div>
          </div>

          <!-- 主工作區：左側 1:1 手機模擬框 + 右側元件庫存盒 -->
          <div class="studio-workspace">
            <!-- 📱 左側手機模擬器 -->
            <div class="phone-stage">
              <div class="phone-frame" id="phoneMockupFrame">
                <div class="phone-speaker-notch"></div>
                <div class="phone-canvas-grid" id="phoneCanvasGrid"></div>
              </div>
              <div class="phone-hint" id="phoneHintText">💡 提示：點擊右側庫存即可加入；拖曳按鈕換位；點擊頂部「🎮」可直接在電腦上實機點按！</div>
            </div>

            <!-- 🧰 右側元件庫存盒 (Toolbox) -->
            <div class="arsenal-panel" id="arsenalPanel">
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
      const toggleBtn = document.getElementById('btnMobileStudioToggle');
      if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggle());

      const closeBtn = document.getElementById('btnStudioClose');
      const backdrop = document.getElementById('studioBackdrop');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (backdrop) backdrop.addEventListener('click', () => this.close());

      // 🔤 手機字體放縮切換 (100% ➔ 125% ➔ 150% ➔ 175% ➔ 200%)
      const btnFontScale = document.getElementById('btnStudioFontScale');
      if (btnFontScale) {
        btnFontScale.addEventListener('click', () => {
          const scales = ['100', '125', '150', '175', '200'];
          let curIdx = scales.indexOf(this.fontScale);
          curIdx = (curIdx + 1) % scales.length;
          this.fontScale = scales[curIdx];
          btnFontScale.textContent = `🔤 ${this.fontScale}%`;
          localStorage.setItem('amrtf_mobile_font_scale', this.fontScale);
          this.renderCanvas();
        });
      }

      // 模式切換按鈕
      const modeBtn = document.getElementById('btnStudioModeToggle');
      if (modeBtn) modeBtn.addEventListener('click', () => this.toggleMode());

      // 模板與重設
      const btnMinimal = document.getElementById('btnTplMinimal');
      const btnFull = document.getElementById('btnTplFull');
      const btnReset = document.getElementById('btnStudioReset');

      if (btnMinimal) btnMinimal.addEventListener('click', () => this.switchProfile('minimal'));
      if (btnFull) btnFull.addEventListener('click', () => this.switchProfile('full'));
      if (btnReset) btnReset.addEventListener('click', () => this.resetLayout());

      // 畫布放下 (Drop) 監聽
      const canvas = document.getElementById('phoneCanvasGrid');
      canvas.addEventListener('dragover', (e) => {
        if (this.mode !== 'edit') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      canvas.addEventListener('drop', (e) => this.handleCanvasDrop(e));
    }

    async switchProfile(profile) {
      this.currentProfile = profile;
      const btnMinimal = document.getElementById('btnTplMinimal');
      const btnFull = document.getElementById('btnTplFull');
      if (btnMinimal && btnFull) {
        btnMinimal.classList.toggle('active', profile === 'minimal');
        btnFull.classList.toggle('active', profile === 'full');
        btnMinimal.style.borderColor = profile === 'minimal' ? '#38bdf8' : '';
        btnFull.style.borderColor = profile === 'full' ? '#38bdf8' : '';
      }
      await this.fetchLayoutAndCatalog();
      this.renderCanvas();
      this.renderArsenal();
    }

    toggleMode() {
      this.mode = (this.mode === 'edit') ? 'preview' : 'edit';
      const modeBtn = document.getElementById('btnStudioModeToggle');
      const subTitle = document.getElementById('studioSubTitle');
      const hintText = document.getElementById('phoneHintText');
      const arsenal = document.getElementById('arsenalPanel');

      if (this.mode === 'preview') {
        modeBtn.textContent = '🛠️ 返回編輯排版模式';
        modeBtn.style.background = '#059669';
        modeBtn.style.borderColor = '#10b981';
        subTitle.textContent = '● 真機互動預覽中 · 在電腦上點擊直接遙控放映艙！';
        hintText.textContent = '🎮 預覽模式已啟用：直接點擊手機螢幕按鈕，現場放映艙同步響應！';
        if (arsenal) arsenal.style.opacity = '0.4';
      } else {
        modeBtn.textContent = '🎮 切換真機預覽操作';
        modeBtn.style.background = '#1e293b';
        modeBtn.style.borderColor = '#334155';
        subTitle.textContent = '1:1 真實比例 · 磁吸拖曳 · 50ms 即時雙端熱同步';
        hintText.textContent = '💡 提示：點擊右側庫存即可加入；拖曳按鈕換位；點擊頂部「🎮」可直接在電腦上實機點按！';
        if (arsenal) arsenal.style.opacity = '1';
      }

      this.renderCanvas();
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
        const res = await fetch(`/api/mobile-layout?profile=${this.currentProfile}`);
        const data = await res.json();
        this.layout = data.layout;
        this.catalog = data.catalog || [];
      } catch (e) {
        console.error('[MobileStudio] 載入版面配置失敗:', e);
      }
    }

    getEngine() {
      return window.MobileReflowEngine || globalThis.MobileReflowEngine;
    }

    renderCanvas() {
      const grid = document.getElementById('phoneCanvasGrid');
      grid.innerHTML = '';
      grid.className = `phone-canvas-grid mobile-font-${this.fontScale}`;
      if (!this.layout || !this.layout.items) return;

      const isEdit = (this.mode === 'edit');

      for (const item of this.layout.items) {
        const card = document.createElement('div');
        card.className = `mock-item ${item.type === 'widget' ? 'is-widget' : 'is-btn'} ${item.style || 'btn-secondary'}`;
        card.id = `mock-${item.id}`;
        card.style.gridColumn = `${item.col} / span ${item.w}`;
        card.style.gridRow = `${item.row} / span ${item.h}`;
        card.draggable = isEdit;

        if (item.type === 'widget') {
          if (item.id === 'header-info') {
            card.className += ' widget-header-info';
            card.innerHTML = `
              <div class="lcd-monitor-screen ${!isEdit ? 'clickable-header-lcd' : ''}" title="${!isEdit ? '點擊輸入講次跳轉 (例: 3/03/0003)' : ''}">
                ${isEdit ? `
                <div class="mock-header">
                  <span class="mock-size-badge" title="切換尺寸">${item.w}×${item.h}</span>
                  <button class="mock-remove-btn" title="移回庫存">✕</button>
                </div>` : ''}
                <div class="led-time" id="mockLedTime">00:00 / 00:00</div>
                <div class="lesson-title" id="mockLessonTitle">AMRTF 模擬就緒</div>
                ${isEdit ? '<div class="mock-resize-handle" title="拖拉尺寸">⤡</div>' : ''}
              </div>
            `;
            if (!isEdit) {
              card.onclick = () => this.openMockLectureJumpModal();
            }
          } else if (item.id === 'widget-teleprompter') {
            card.className += ' widget-teleprompter';
            card.innerHTML = `
              <div class="lcd-monitor-screen">
                ${isEdit ? `
                <div class="mock-header">
                  <span class="mock-size-badge" title="切換尺寸">${item.w}×${item.h}</span>
                  <button class="mock-remove-btn" title="移回庫存">✕</button>
                </div>` : ''}
                <div class="prompter-header"><span>師父開示逐字提詞</span><span>即時</span></div>
                <div class="prompter-content" id="mockPrompterBox">手抄稿即時提詞中...</div>
                ${isEdit ? '<div class="mock-resize-handle" title="拖拉尺寸">⤡</div>' : ''}
              </div>
            `;
          } else if (item.id === 'widget-interval') {
            const savedIntFont = localStorage.getItem('amrtf_mobile_interval_font') || 'int-font-md';
            card.className += ` widget-interval-box ${savedIntFont}`;
            card.innerHTML = `
              <div class="lcd-monitor-screen">
                ${isEdit ? `
                <div class="mock-header">
                  <span class="mock-size-badge" title="切換尺寸">${item.w}×${item.h}</span>
                  <button class="mock-remove-btn" title="移回庫存">✕</button>
                </div>` : ''}
                <div class="interval-select-row">
                  <div class="interval-field">
                    <span class="field-tag">起</span>
                    <select class="mobile-select" id="mockIntervalStart"><option value="0">00:00 起點</option></select>
                  </div>
                  <div class="interval-field">
                    <span class="field-tag">訖</span>
                    <select class="mobile-select" id="mockIntervalEnd"><option value="0">00:00 訖點</option></select>
                  </div>
                  <button class="int-scale-btn" id="btnMockIntScale" title="單獨切換起訖字級 (小/中/大/特大)">🔤</button>
                </div>
                <div class="interval-btn-row">
                  <button class="int-action-btn btn-int-play" id="btnMockPlayInterval">▶ 區間</button>
                  <button class="int-action-btn btn-int-loop" id="btnMockLoopInterval">🔁 循環</button>
                  <button class="int-action-btn btn-int-stop" id="btnMockStopInterval">⏹ 急煞</button>
                </div>
                ${isEdit ? '<div class="mock-resize-handle" title="拖拉尺寸">⤡</div>' : ''}
              </div>
            `;
            setTimeout(() => this.bindMockIntervalEvents(card), 20);
          }
        } else {
          // 一般按鈕 (Stream Deck 3D 水晶透光鍵帽)
          if (item.w >= 2 && item.h >= 2) card.className += ' span-2x2';
          else if (item.h === 1 && item.w >= 2) card.className += ' span-wide';

          let labelText = item.label || item.id;
          labelText = labelText.replace(/^[▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡\s]+/, '')
                               .replace(/[\s▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡]+$/, '').trim() || labelText;

          const sizeBadge = `${item.w}×${item.h}`;
          card.innerHTML = `
            <div class="mock-item-crystal">
              ${isEdit ? `
              <div class="mock-header">
                <span class="mock-size-badge" title="點擊切換尺寸">${sizeBadge}</span>
                <button class="mock-remove-btn" title="移回庫存盒">✕</button>
              </div>` : ''}
              <div class="mock-body">
                <span class="mock-icon">${this.getItemIcon(item)}</span>
                <span class="mock-label">${labelText}</span>
              </div>
              ${isEdit ? '<div class="mock-resize-handle" title="拖拉改變跨欄與跨列">⤡</div>' : ''}
            </div>
          `;

          // 在真機預覽模式下，點擊卡片直接發送信令！
          if (!isEdit) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
              this.dispatchLiveCommand(item);
            });
          }
        }

        if (isEdit) {
          const removeBtn = card.querySelector('.mock-remove-btn');
          if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.removeItemFromCanvas(item.id);
            });
          }

          const sizeBadgeEl = card.querySelector('.mock-size-badge');
          if (sizeBadgeEl) {
            sizeBadgeEl.addEventListener('click', (e) => {
              e.stopPropagation();
              this.cycleItemSize(item);
            });
          }

          card.addEventListener('dragstart', (e) => {
            this.draggedCanvasItem = item;
            e.dataTransfer.setData('text/plain', item.id);
          });

          const handle = card.querySelector('.mock-resize-handle');
          if (handle) {
            handle.addEventListener('mousedown', (e) => this.startResizing(e, item, card));
          }
        }

        grid.appendChild(card);
      }

      this.updateMockLiveState();
    }

    updateMockIntervalConstraints(changedTarget = 'init') {
      const selStart = document.getElementById('mockIntervalStart');
      const selEnd = document.getElementById('mockIntervalEnd');
      if (!selStart || !selEnd || selStart.options.length === 0 || selEnd.options.length === 0) return;

      let s = parseFloat(selStart.value) || 0;
      let e = parseFloat(selEnd.value) || 0;

      if (changedTarget === 'start' || changedTarget === 'init') {
        // 依據「起」約束「訖」
        let validEndFound = false;
        Array.from(selEnd.options).forEach((opt) => {
          const val = parseFloat(opt.value) || 0;
          const shouldDisable = val <= s;
          opt.disabled = shouldDisable;
          if (!shouldDisable && val === e) {
            validEndFound = true;
          }
        });
        // 若當前「訖」落在不合法區間 (<= 起)，自動順推至大於起點的下一個合法選項
        if (!validEndFound) {
          const nextValidOpt = Array.from(selEnd.options).find(opt => !opt.disabled);
          if (nextValidOpt) {
            selEnd.value = nextValidOpt.value;
            e = parseFloat(nextValidOpt.value) || 0;
          }
        }
        // 確保「起」選單最後一段不能當起點（除僅有 1 個選項外）
        const totalStarts = selStart.options.length;
        Array.from(selStart.options).forEach((opt, idx) => {
          opt.disabled = idx === totalStarts - 1 && totalStarts > 1;
        });
      } else if (changedTarget === 'end') {
        // 依據「訖」約束「起」
        let validStartFound = false;
        Array.from(selStart.options).forEach((opt) => {
          const val = parseFloat(opt.value) || 0;
          const shouldDisable = val >= e;
          opt.disabled = shouldDisable;
          if (!shouldDisable && val === s) {
            validStartFound = true;
          }
        });
        // 若當前「起」落在不合法區間 (>= 訖)，自動逆推至小於訖點的前一個合法選項
        if (!validStartFound) {
          const validStarts = Array.from(selStart.options).filter(opt => !opt.disabled);
          if (validStarts.length > 0) {
            selStart.value = validStarts[validStarts.length - 1].value;
            s = parseFloat(selStart.value) || 0;
          }
        }
      }
    }

    bindMockIntervalEvents(container) {
      const btnPlay = container.querySelector('#btnMockPlayInterval');
      const btnLoop = container.querySelector('#btnMockLoopInterval');
      const btnStop = container.querySelector('#btnMockStopInterval');
      const selStart = container.querySelector('#mockIntervalStart');
      const selEnd = container.querySelector('#mockIntervalEnd');

      // 起訖雙向防呆約束與變色聯動
      if (selStart && !selStart.dataset.bound) {
        selStart.dataset.bound = 'true';
        selStart.onchange = () => this.updateMockIntervalConstraints('start');
      }
      if (selEnd && !selEnd.dataset.bound) {
        selEnd.dataset.bound = 'true';
        selEnd.onchange = () => this.updateMockIntervalConstraints('end');
      }

      if (btnPlay) {
        btnPlay.onclick = (e) => {
          e.stopPropagation();
          const start = parseFloat(selStart?.value) || 0;
          const end = parseFloat(selEnd?.value) || 0;
          if (end > start) {
            this.sendLiveCmd('play_interval', { start, end, loop: false });
          } else {
            alert(`訖點 (${end}s) 必須大於起點 (${start}s)！請選擇後續段落。`);
          }
        };
      }
      if (btnLoop) {
        btnLoop.onclick = (e) => {
          e.stopPropagation();
          const start = parseFloat(selStart?.value) || 0;
          const end = parseFloat(selEnd?.value) || 0;
          if (end > start) {
            this.sendLiveCmd('play_interval', { start, end, loop: true });
          } else {
            alert(`訖點 (${end}s) 必須大於起點 (${start}s)！請選擇後續段落。`);
          }
        };
      }
      if (btnStop) {
        btnStop.onclick = (e) => {
          e.stopPropagation();
          this.sendLiveCmd('stop_interval');
          this.sendLiveCmd('pause');
        };
      }

      // 🔤 起訖獨立字級切換
      const btnIntScale = container.querySelector('#btnMockIntScale');
      const INT_FONTS = ['int-font-sm', 'int-font-md', 'int-font-lg', 'int-font-xl'];
      const INT_LABELS = ['小', '中', '大', '特大'];
      let curIntFont = localStorage.getItem('amrtf_mobile_interval_font') || 'int-font-md';

      const applyMockIntFont = (f) => {
        INT_FONTS.forEach(cls => container.classList.remove(cls));
        container.classList.add(f);
        const idx = INT_FONTS.indexOf(f);
        if (btnIntScale) btnIntScale.textContent = '🔤' + INT_LABELS[idx >= 0 ? idx : 1];
      };
      applyMockIntFont(curIntFont);

      if (btnIntScale) {
        btnIntScale.onclick = (e) => {
          e.stopPropagation();
          let idx = INT_FONTS.indexOf(curIntFont);
          idx = (idx + 1) % INT_FONTS.length;
          curIntFont = INT_FONTS[idx];
          localStorage.setItem('amrtf_mobile_interval_font', curIntFont);
          applyMockIntFont(curIntFont);
        };
      }

      if (this.liveState && this.liveState.markers) {
        this.populateMockIntervalOptions(this.liveState.markers);
      }
    }

    populateMockIntervalOptions(markers) {
      if (!Array.isArray(markers) || markers.length === 0) return;
      const selStart = document.getElementById('mockIntervalStart');
      const selEnd = document.getElementById('mockIntervalEnd');
      if (!selStart || !selEnd) return;

      const curStart = selStart.value;
      const curEnd = selEnd.value;

      selStart.innerHTML = '';
      selEnd.innerHTML = '';

      markers.forEach((m, idx) => {
        // 核心修復：廣播端 markers 秒數欄位為 m.sec
        const timeVal = parseFloat(m.sec ?? m.seconds ?? m.time ?? 0);
        const rawLabel = m.label || m.title || `第 ${idx + 1} 段`;
        const min = Math.floor(timeVal / 60).toString().padStart(2, '0');
        const s = Math.floor(timeVal % 60).toString().padStart(2, '0');
        const timeDisplay = m.timeStr || (min + ':' + s);

        // 智慧去重：去除 rawLabel 前綴若已帶有 timeDisplay (例如 "00:00 (起點)" -> "(起點)")，消滅疊字！
        const escapedTime = timeDisplay.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const cleanLabel = (rawLabel || '').replace(new RegExp(`^${escapedTime}\\s*`), '').trim();
        const displayLabel = cleanLabel ? `${timeDisplay} ${cleanLabel}` : timeDisplay;

        const optS = document.createElement('option');
        optS.value = timeVal;
        optS.textContent = displayLabel;
        optS.style.backgroundColor = '#111827';
        optS.style.color = '#f8fafc';
        selStart.appendChild(optS);

        const optE = document.createElement('option');
        optE.value = timeVal;
        optE.textContent = displayLabel;
        optE.style.backgroundColor = '#111827';
        optE.style.color = '#f8fafc';
        selEnd.appendChild(optE);
      });

      if (curStart && Array.from(selStart.options).some(o => o.value === curStart)) {
        selStart.value = curStart;
      }
      if (curEnd && Array.from(selEnd.options).some(o => o.value === curEnd)) {
        selEnd.value = curEnd;
      } else if (markers.length > 1) {
        selEnd.selectedIndex = Math.min(1, markers.length - 1);
      }

      // 初始化雙向防呆約束與變色
      this.updateMockIntervalConstraints('init');
    }

    /**
     * 真機指令發送器 (直通電腦端主控台信令中樞)
     */
    sendLiveCmd(cmd, params = {}) {
      console.log(`[MobileStudio 🎮 真機遙控] 發送信令: ${cmd}`, params);
      if (typeof window.sendDeskCommand === 'function') {
        window.sendDeskCommand(cmd, params);
      } else {
        console.warn('window.sendDeskCommand 未就緒');
      }
    }

    dispatchLiveCommand(item) {
      const act = item.action;
      if (act === 'play') this.sendLiveCmd('toggle_play');
      else if (act === 'stop') this.sendLiveCmd('restart');
      else if (act === 'seek_bwd') this.sendLiveCmd('rewind_10s');
      else if (act === 'seek_fwd') this.sendLiveCmd('forward_10s');
      else if (act === 'toggle_quote') this.sendLiveCmd('seek_quote');
      else if (act === 'toggle_theme') this.sendLiveCmd('toggle_theme');
      else if (act === 'toggle_scroll') this.sendLiveCmd('toggle_scroll_mode');
      else if (act === 'toggle_speech_lead') this.sendLiveCmd('toggle_speech_lead');
      else if (act === 'loop_interval') this.sendLiveCmd('play_interval', { loop: true });
      else if (act === 'prev_lecture') this.sendLiveCmd('prev_lecture');
      else if (act === 'next_lecture') this.sendLiveCmd('next_lecture');
      else if (act === 'fullscreen') this.sendLiveCmd('toggle_fullscreen');
      else if (act) this.sendLiveCmd(act);
    }

    /**
     * 接收主控台即時狀態同步 (供時鐘/字幕/按鈕即時跳動)
     */
    syncLiveState(state) {
      this.liveState = state;
      this.updateMockLiveState();
    }

    updateMockLiveState() {
      if (!this.liveState) return;
      const led = document.getElementById('mockLedTime');
      const title = document.getElementById('mockLessonTitle');
      const prompter = document.getElementById('mockPrompterBox');

      if (led && this.liveState.timeStr) led.textContent = this.liveState.timeStr;
      if (title && this.liveState.title) title.textContent = this.liveState.title;
      if (prompter && this.liveState.activeText) prompter.textContent = this.liveState.activeText;

      if (this.liveState.markers) {
        this.populateMockIntervalOptions(this.liveState.markers);
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

        row.addEventListener('click', () => {
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
      if (item.action === 'modal_migtsema' || item.action === 'modal_prep_video' || item.action === 'modal_dedication_video') return '🎬';
      if (item.action === 'close_video') return '✕';
      if (item.id === 'header-info') return '⏱️';
      if (item.id === 'widget-teleprompter') return '📜';
      if (item.id === 'widget-interval') return '⏱️';
      return '⚡';
    }

    addItemToCanvas(catItem) {
      const engine = this.getEngine();
      if (!engine) return;

      let occupiedMap = engine.buildOccupiedMap(this.layout.items);

      const sizeCandidates = [
        { w: catItem.defaultW, h: catItem.defaultH }
      ];
      if (catItem.defaultW > 2 || catItem.defaultH > 1) {
        sizeCandidates.push({ w: Math.min(2, catItem.defaultW), h: 1 });
      }
      if (catItem.defaultW > 1 || catItem.defaultH > 1) {
        sizeCandidates.push({ w: 1, h: 1 });
      }

      let foundSlot = null;
      let chosenSize = null;

      for (const sz of sizeCandidates) {
        const slot = engine.findNextAvailableSlot(occupiedMap, sz.w, sz.h, 1, 1);
        if (slot) {
          foundSlot = slot;
          chosenSize = sz;
          break;
        }
      }

      if (!foundSlot) {
        const prompter = this.layout.items.find(it => it.id === 'widget-teleprompter');
        if (prompter && prompter.h > 2) {
          prompter.h = 2;
          occupiedMap = engine.buildOccupiedMap(this.layout.items);
          for (const sz of sizeCandidates) {
            const slot = engine.findNextAvailableSlot(occupiedMap, sz.w, sz.h, 1, 1);
            if (slot) {
              foundSlot = slot;
              chosenSize = sz;
              break;
            }
          }
        }
      }

      if (!foundSlot) {
        this.triggerPhoneShake('畫布空間不足！請先按 ✕ 移除或縮小其他按鈕');
        return;
      }

      const newItem = {
        id: catItem.id,
        type: catItem.type,
        col: foundSlot.col,
        row: foundSlot.row,
        w: chosenSize.w,
        h: chosenSize.h,
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
      const engine = this.getEngine();
      if (!engine) return;

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

      const reflow = engine.resolveReflow(this.layout.items, item.id, targetRect);
      if (reflow.success) {
        this.layout.items = reflow.items;
        this.commitLayout();
      } else {
        this.triggerPhoneShake('尺寸擴展受阻：' + (reflow.reason || '空間不足'));
      }
    }

    handleCanvasDrop(e) {
      e.preventDefault();
      const engine = this.getEngine();
      if (!engine) return;

      const canvas = document.getElementById('phoneCanvasGrid');
      const rect = canvas.getBoundingClientRect();
      const cellW = rect.width / 4;
      const cellH = rect.height / 8;

      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const targetCol = Math.max(1, Math.min(4, Math.floor(clickX / cellW) + 1));
      const targetRow = Math.max(1, Math.min(8, Math.floor(clickY / cellH) + 1));

      if (this.draggedCanvasItem) {
        const it = this.draggedCanvasItem;
        this.draggedCanvasItem = null;
        const targetRect = {
          col: Math.min(targetCol, 4 - it.w + 1),
          row: Math.min(targetRow, 8 - it.h + 1),
          w: it.w,
          h: it.h
        };
        const reflow = engine.resolveReflow(this.layout.items, it.id, targetRect);
        if (reflow.success) {
          this.layout.items = reflow.items;
          this.commitLayout();
        } else {
          this.triggerPhoneShake('移動碰撞：' + reflow.reason);
        }
      } else if (this.draggedCatalogItem) {
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
        let reflow = engine.resolveReflow(this.layout.items, cat.id, targetRect);

        if (reflow.success) {
          this.layout.items = reflow.items;
          this.commitLayout();
        } else {
          this.layout.items.pop();
          const colliders = this.layout.items.filter(it => engine.checkOverlap(targetRect, it));
          if (colliders.length > 0) {
            const colliderIds = new Set(colliders.map(c => c.id));
            this.layout.items = this.layout.items.filter(it => !colliderIds.has(it.id));
            this.layout.items.push(newItem);
            this.commitLayout();
          } else {
            this.triggerPhoneShake('無法放入：空間不足');
          }
        }
      }
    }

    startResizing(e, item, cardEl) {
      e.stopPropagation();
      e.preventDefault();
      const engine = this.getEngine();
      if (!engine) return;

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
          const reflow = engine.resolveReflow(this.layout.items, item.id, targetRect);
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
          body: JSON.stringify({ ...this.layout, profile: this.currentProfile })
        });
      } catch (e) {
        console.error('[MobileStudio] 儲存佈局失敗:', e);
      }
    }

    async resetLayout() {
      try {
        const res = await fetch(`/api/mobile-layout/reset?profile=${this.currentProfile}`, { method: 'POST' });
        const data = await res.json();
        this.layout = data.layout;
        this.renderCanvas();
        this.renderArsenal();
      } catch (e) {
        console.error('[MobileStudio] 重設失敗:', e);
      }
    }

    // 📖 模擬器講次快速直通艙 Modal 核心控制器 (支援 3/03/003/0003 補零防呆)
    initMockLectureModal() {
      let modal = document.getElementById('mockLectureModalBackdrop');
      if (modal) return modal;

      const screen = document.querySelector('.phone-screen') || document.body;
      modal = document.createElement('div');
      modal.id = 'mockLectureModalBackdrop';
      modal.className = 'lecture-modal-backdrop';
      modal.innerHTML = `
        <div class="lecture-modal-card">
          <div class="lecture-modal-header">
            <span class="lecture-modal-title">📖 講次快速直通艙</span>
            <button class="lecture-modal-close" id="btnMockLectureModalClose">✕</button>
          </div>
          <div class="lecture-modal-display">
            <div class="lecture-display-raw" id="mockLectureDisplayRaw">----</div>
            <div class="lecture-display-preview" id="mockLectureDisplayPreview">預覽: 請點按輸入講次</div>
          </div>
          <div class="lecture-pad-grid">
            <button class="pad-btn mock-pad-num" data-num="1">1</button>
            <button class="pad-btn mock-pad-num" data-num="2">2</button>
            <button class="pad-btn mock-pad-num" data-num="3">3</button>
            <button class="pad-btn mock-pad-num" data-num="4">4</button>
            <button class="pad-btn mock-pad-num" data-num="5">5</button>
            <button class="pad-btn mock-pad-num" data-num="6">6</button>
            <button class="pad-btn mock-pad-num" data-num="7">7</button>
            <button class="pad-btn mock-pad-num" data-num="8">8</button>
            <button class="pad-btn mock-pad-num" data-num="9">9</button>
            <button class="pad-btn pad-clear" id="btnMockPadClear">⌫ 清除</button>
            <button class="pad-btn mock-pad-num" data-num="0">0</button>
            <button class="pad-btn pad-go" id="btnMockPadGo">🚀 前往</button>
          </div>
        </div>
      `;
      screen.appendChild(modal);

      this.mockLectureInput = '';

      const closeBtn = modal.querySelector('#btnMockLectureModalClose');
      const clearBtn = modal.querySelector('#btnMockPadClear');
      const goBtn = modal.querySelector('#btnMockPadGo');

      closeBtn.onclick = (e) => { e.stopPropagation(); this.closeMockLectureJumpModal(); };
      modal.onclick = (e) => {
        if (e.target === modal) this.closeMockLectureJumpModal();
      };
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.mockLectureInput.length > 0) {
          this.mockLectureInput = this.mockLectureInput.slice(0, -1);
        }
        this.updateMockLectureDisplay();
      };
      goBtn.onclick = (e) => {
        e.stopPropagation();
        const formatted = this.formatLectureNumber(this.mockLectureInput);
        if (formatted) {
          this.sendLiveCmd('goto_lesson', { lessonNumber: formatted, lectureId: formatted });
          this.closeMockLectureJumpModal();
        } else {
          alert('講次編號不正確，請輸入 1 到 2000 之間的數字！');
        }
      };

      const numBtns = modal.querySelectorAll('.mock-pad-num');
      numBtns.forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const num = btn.getAttribute('data-num');
          if (this.mockLectureInput.length < 4) {
            this.mockLectureInput += num;
            this.updateMockLectureDisplay();
          }
        };
      });

      return modal;
    }

    formatLectureNumber(raw) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return null;
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num <= 0 || num > 2000) return null;
      return num.toString().padStart(4, '0');
    }

    openMockLectureJumpModal() {
      const modal = this.initMockLectureModal();
      this.mockLectureInput = '';
      this.updateMockLectureDisplay();
      modal.classList.add('show');
    }

    closeMockLectureJumpModal() {
      const modal = document.getElementById('mockLectureModalBackdrop');
      if (modal) {
        modal.classList.remove('show');
        this.mockLectureInput = '';
      }
    }

    updateMockLectureDisplay() {
      const rawEl = document.getElementById('mockLectureDisplayRaw');
      const prevEl = document.getElementById('mockLectureDisplayPreview');
      if (!rawEl || !prevEl) return;

      if (!this.mockLectureInput) {
        rawEl.textContent = '----';
        rawEl.style.color = '#64748b';
        prevEl.textContent = '預覽: 請點按輸入講次 (例: 3, 03, 566)';
        prevEl.style.color = '#94a3b8';
      } else {
        rawEl.textContent = this.mockLectureInput;
        rawEl.style.color = '#38bdf8';
        const formatted = this.formatLectureNumber(this.mockLectureInput);
        if (formatted) {
          prevEl.textContent = `預覽: 第 ${formatted} 講 (符合 0003 格式)`;
          prevEl.style.color = '#10b981';
        } else {
          prevEl.textContent = '⚠️ 請輸入 1 ~ 2000 之間的講次';
          prevEl.style.color = '#f87171';
        }
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

  window.MobileStudio = new MobileStudioDrawer();
})();
