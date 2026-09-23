// ==============================================================================
// 🎛️ AMRTF 操作主控台交互邏輯 (Control Desk JS · 全量 Companion 按鈕版)
// ==============================================================================

(function () {
  let isPlaying = false;
  let isMiniMode = false;
  let isLoopQuote = false;
  let isLoopParagraph = false;
  let isSpeechMode = true;
  let currentScrollMode = 1;
  const scrollLabels = ['手動', '持續', '區段'];

  // DOM 元件
  const statusBadge = document.getElementById('statusBadge');
  const lessonBadge = document.getElementById('lessonBadge');
  const ledClock = document.getElementById('ledClock');
  const speedBadge = document.getElementById('speedBadge');
  const prompterText = document.getElementById('prompterText');

  // 按鈕
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnStop = document.getElementById('btnStop');
  const btnRewind10 = document.getElementById('btnRewind10');
  const btnRewind5 = document.getElementById('btnRewind5');
  const btnForward5 = document.getElementById('btnForward5');
  const btnForward10 = document.getElementById('btnForward10');
  const btnRate10 = document.getElementById('btnRate10');
  const btnRate125 = document.getElementById('btnRate125');
  const btnRate15 = document.getElementById('btnRate15');

  const btnSeekQuote = document.getElementById('btnSeekQuote');
  const btnLoopQuote = document.getElementById('btnLoopQuote');
  const btnLoopParagraph = document.getElementById('btnLoopParagraph');
  const btnPrevLesson = document.getElementById('btnPrevLesson');
  const btnNextLesson = document.getElementById('btnNextLesson');
  const btnSpeechMode = document.getElementById('btnSpeechMode');
  const btnScrollMode = document.getElementById('btnScrollMode');

  const btnVideoMigsema = document.getElementById('btnVideoMigsema');
  const btnVideoPrep = document.getElementById('btnVideoPrep');
  const btnVideoDedication = document.getElementById('btnVideoDedication');
  const btnCloseVideo = document.getElementById('btnCloseVideo');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const btnDeskThemeToggle = document.getElementById('btnDeskThemeToggle');
  const updateBadgeDot = document.getElementById('updateBadgeDot');
  const currentVersionBadge = document.getElementById('currentVersionBadge');
  const versionStatusTag = document.getElementById('versionStatusTag');
  const updateNotesContainer = document.getElementById('updateNotesContainer');
  const updateNotesBody = document.getElementById('updateNotesBody');
  const btnCheckUpdate = document.getElementById('btnCheckUpdate');
  const btnApplyUpdate = document.getElementById('btnApplyUpdate');
  const btnDownloadRelease = document.getElementById('btnDownloadRelease');
  const btnFontLarger = document.getElementById('btnFontLarger');
  const btnFontSmaller = document.getElementById('btnFontSmaller');
  const btnFullscreen = document.getElementById('btnFullscreen');

  // 講師手抄稿精準區段選單 DOM
  const selectIntervalStart = document.getElementById('selectIntervalStart');
  const selectIntervalEnd = document.getElementById('selectIntervalEnd');
  const btnPlayInterval = document.getElementById('btnPlayInterval');
  const btnLoopInterval = document.getElementById('btnLoopInterval');
  const btnStopInterval = document.getElementById('btnStopInterval');

  const btnMiniToggle = document.getElementById('btnMiniToggle');
  const btnQrCode = document.getElementById('btnQrCode');
  const qrModal = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const qrUrlText = document.getElementById('qrUrlText');
  const btnCloseQr = document.getElementById('btnCloseQr');

  let currentLanIp = window.location.hostname;
  let cachedMarkersJson = '';

  // 主動向伺服器拉取真實區域網路 IPv4
  fetch('/api/info')
    .then(r => r.json())
    .then(info => {
      if (info && info.lanIp) currentLanIp = info.lanIp;
    })
    .catch(() => {});

  // 與主程序建立全雙工 WebSocket 連線
  const wsUrl = 'ws://' + window.location.host;
  let ws = null;

  function connectWs() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      console.log('[Desk] 已連線至主控核心');
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'INIT_INFO' && msg.data && msg.data.lanIp) {
          currentLanIp = msg.data.lanIp;
        } else if (msg.type === 'STATE_UPDATE' && msg.data) {
          if (msg.data.lanIp) currentLanIp = msg.data.lanIp;
          handleStateUpdate(msg.data);
          if (window.MobileStudio && window.MobileStudio.syncLiveState) {
            window.MobileStudio.syncLiveState(msg.data);
          }
        } else if (msg.type === 'VIDEO_DOWNLOAD_PROGRESS' && msg.data) {
          handleVideoProgress(msg.data);
        }
      } catch (err) {}
    };
    ws.onclose = () => {
      setTimeout(connectWs, 1500);
    };
  }

  connectWs();

  function sendCmd(cmd, params = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'COMMAND', command: cmd, params }));
    }
  }
  window.sendDeskCommand = sendCmd;

  // 狀態燈點擊支援手動強制重連放映艙 CDP
  if (statusBadge) {
    statusBadge.addEventListener('click', () => {
      statusBadge.textContent = '● 正在重連...';
      sendCmd('reconnect_screen');
    });
  }

  // 1. 播控行
  btnPlayPause.addEventListener('click', () => sendCmd('toggle_play'));
  btnStop.addEventListener('click', () => sendCmd('restart'));

  // 2. 秒數與倍速
  btnRewind10.addEventListener('click', () => sendCmd('rewind_10s'));
  btnRewind5.addEventListener('click', () => sendCmd('rewind_5s'));
  btnForward5.addEventListener('click', () => sendCmd('forward_5s'));
  btnForward10.addEventListener('click', () => sendCmd('forward_10s'));
  btnRate10.addEventListener('click', () => sendCmd('set_playback_rate', { rate: 1.0 }));
  btnRate125.addEventListener('click', () => sendCmd('set_playback_rate', { rate: 1.25 }));
  btnRate15.addEventListener('click', () => sendCmd('set_playback_rate', { rate: 1.5 }));

  // 3. 引文循環、講次、閱讀模式
  btnSeekQuote.addEventListener('click', () => sendCmd('jump_to_master_start'));
  btnLoopQuote.addEventListener('click', () => sendCmd('toggle_loop_segment'));
  btnLoopParagraph.addEventListener('click', () => sendCmd('loop_current_paragraph'));
  btnPrevLesson.addEventListener('click', () => sendCmd('prev_lesson'));
  btnNextLesson.addEventListener('click', () => sendCmd('next_lesson'));
  btnSpeechMode.addEventListener('click', () => sendCmd('toggle_speech_mode'));
  btnScrollMode.addEventListener('click', () => sendCmd('cycle_scroll_mode'));

  // 3.5 講師精準區段選單播控
  btnPlayInterval.addEventListener('click', () => {
    const start = parseFloat(selectIntervalStart.value) || 0;
    const end = parseFloat(selectIntervalEnd.value) || 0;
    if (end > start) {
      sendCmd('play_interval', { start, end, loop: false });
    } else {
      alert('播放終點秒數必須大於起點秒數！');
    }
  });

  btnLoopInterval.addEventListener('click', () => {
    const start = parseFloat(selectIntervalStart.value) || 0;
    const end = parseFloat(selectIntervalEnd.value) || 0;
    if (end > start) {
      sendCmd('play_interval', { start, end, loop: true });
    } else {
      alert('循環終點秒數必須大於起點秒數！');
    }
  });

  btnStopInterval.addEventListener('click', () => {
    sendCmd('stop_interval');
    sendCmd('pause');
  });

  // 雙向動態互斥約束引擎（單向觸發、徹底消滅雙向夾擊死鎖）：
  // 1. 操作員選擇「起」：約束「迄」選單（迄裡面 <= 起的時間變灰 disabled，若訖點小於等於起，自動順推至下一合法段落）；
  // 2. 操作員選擇「迄」：約束「起」選單（起裡面 >= 訖的時間變灰 disabled，若起點大於等於訖，自動逆推至前一合法段落）；
  // 3. 全量初始化：根據起點約束迄點，起點選單所有段落完全開放自由可見，杜絕兩邊互相銬死！
  function updateIntervalOptionsConstraints(changedTarget = 'init') {
    let s = parseFloat(selectIntervalStart.value) || 0;
    let e = parseFloat(selectIntervalEnd.value) || 0;

    if (changedTarget === 'start' || changedTarget === 'init') {
      // 依據「起」約束「迄」
      let validEndFound = false;
      Array.from(selectIntervalEnd.options).forEach((opt) => {
        const val = parseFloat(opt.value) || 0;
        const shouldDisable = val <= s;
        opt.disabled = shouldDisable;
        if (!shouldDisable && val === e) {
          validEndFound = true;
        }
      });
      // 若當前「迄」落在不合法區間 (<= 起)，自動順推至大於起的下一個合法選項
      if (!validEndFound) {
        const nextValidOpt = Array.from(selectIntervalEnd.options).find(opt => !opt.disabled);
        if (nextValidOpt) {
          selectIntervalEnd.value = nextValidOpt.value;
          e = parseFloat(nextValidOpt.value) || 0;
        }
      }
      // 確保「起」選單所有段落（除最後一段不能當起點外）全數開放自由點選
      const totalStarts = selectIntervalStart.options.length;
      Array.from(selectIntervalStart.options).forEach((opt, idx) => {
        opt.disabled = idx === totalStarts - 1 && totalStarts > 1;
      });
    } else if (changedTarget === 'end') {
      // 依據「迄」約束「起」
      let validStartFound = false;
      Array.from(selectIntervalStart.options).forEach((opt) => {
        const val = parseFloat(opt.value) || 0;
        const shouldDisable = val >= e;
        opt.disabled = shouldDisable;
        if (!shouldDisable && val === s) {
          validStartFound = true;
        }
      });
      // 若當前「起」落在不合法區間 (>= 迄)，自動逆推至小於訖的前一個合法選項
      if (!validStartFound) {
        const validStarts = Array.from(selectIntervalStart.options).filter(opt => !opt.disabled);
        if (validStarts.length > 0) {
          selectIntervalStart.value = validStarts[validStarts.length - 1].value;
          s = parseFloat(selectIntervalStart.value) || 0;
        }
      }
    }
  }

  selectIntervalStart.addEventListener('change', () => {
    updateIntervalOptionsConstraints('start');
  });

  selectIntervalEnd.addEventListener('change', () => {
    updateIntervalOptionsConstraints('end');
  });

  // 4. 影片彈窗與視覺控制
  btnVideoMigsema.addEventListener('click', () => sendCmd('modal_migtsema'));
  btnVideoPrep.addEventListener('click', () => sendCmd('modal_prep_video'));
  btnVideoDedication.addEventListener('click', () => sendCmd('modal_dedication_video'));
  btnCloseVideo.addEventListener('click', () => sendCmd('modal_close'));
  // ==============================================================================
  // 🌞 / 🌙 大慈恩明暗雙風格主題切換模組 (Parchment Light / Zen Dark)
  // ==============================================================================
  const THEME_STORAGE_KEY = 'amrtf_theme';

  function getSavedTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; // 長官指定：預設宣紙明亮風格
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(isDark ? 'theme-dark' : 'theme-light');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');

    if (btnDeskThemeToggle) {
      btnDeskThemeToggle.textContent = isDark ? '🌙' : '🌞';
      btnDeskThemeToggle.title = isDark ? '目前為主控台玄木暗黑風格（點擊切換為宣紙明亮）' : '目前為主控台宣紙明亮風格（點擊切換為玄木暗黑）';
    }
  }

  function toggleTheme() {
    const currentTheme = getSavedTheme();
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  }

  // 頂部按鈕專責控制主控台自身明暗風格
  if (btnDeskThemeToggle) {
    btnDeskThemeToggle.addEventListener('click', toggleTheme);
  }
  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;

  // 立即套用保存的主題或預設宣紙明亮風格
  applyTheme(getSavedTheme());

  // 🌓 下方鍵盤矩陣按鈕 100% 恢復崇高使命：精準控制大慈恩放映端手抄稿深淺色！
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => sendCmd('set_theme'));
  }

  btnFontLarger.addEventListener('click', () => sendCmd('adjust_font_size', { delta: 1.5 }));
  btnFontSmaller.addEventListener('click', () => sendCmd('adjust_font_size', { delta: -1.5 }));

  // 字級循環按鈕：100% 配合大慈恩官方原生安全範圍與 1.5px 步進整數刻度 (13px ➔ 16px ➔ 19px ➔ 22px ➔ 13px)
  let currentFontSize = 16;
  const btnFontCycle = document.getElementById('btnFontCycle');
  if (btnFontCycle) {
    btnFontCycle.addEventListener('click', () => {
      const presets = [13, 16, 19, 22];
      let next = presets[0];
      for (const p of presets) {
        if (p > currentFontSize) {
          next = p;
          break;
        }
      }
      currentFontSize = next;
      btnFontCycle.textContent = `🔤 ${next}px`;
      sendCmd('adjust_font_size', { value: next });
    });
  }

  // 起訖單元淡雅透明色彩切換
  const btnIntervalColor = document.getElementById('btnIntervalColor');
  const intervalRowWidget = document.getElementById('intervalRowWidget');
  const INTERVAL_THEMES = ['int-theme-gold', 'int-theme-emerald', 'int-theme-cyan', 'int-theme-purple'];
  let currentThemeIdx = 0;
  const savedTheme = localStorage.getItem('amrtf_interval_theme') || 'int-theme-gold';
  if (intervalRowWidget) {
    INTERVAL_THEMES.forEach(t => intervalRowWidget.classList.remove(t));
    intervalRowWidget.classList.add(savedTheme);
    currentThemeIdx = Math.max(0, INTERVAL_THEMES.indexOf(savedTheme));
  }
  if (btnIntervalColor && intervalRowWidget) {
    btnIntervalColor.addEventListener('click', (e) => {
      e.stopPropagation();
      INTERVAL_THEMES.forEach(t => intervalRowWidget.classList.remove(t));
      currentThemeIdx = (currentThemeIdx + 1) % INTERVAL_THEMES.length;
      const nextTheme = INTERVAL_THEMES[currentThemeIdx];
      intervalRowWidget.classList.add(nextTheme);
      localStorage.setItem('amrtf_interval_theme', nextTheme);
    });
  }

  // 起訖單元文字大小切換
  const btnIntervalFontSize = document.getElementById('btnIntervalFontSize');
  const INTERVAL_FONTS = ['int-font-sm', 'int-font-md', 'int-font-lg', 'int-font-xl'];
  let currentFontIdx = 1; // 預設 md
  const savedFont = localStorage.getItem('amrtf_interval_font') || 'int-font-md';
  if (intervalRowWidget) {
    INTERVAL_FONTS.forEach(f => intervalRowWidget.classList.remove(f));
    intervalRowWidget.classList.add(savedFont);
    currentFontIdx = Math.max(0, INTERVAL_FONTS.indexOf(savedFont));
  }
  if (btnIntervalFontSize && intervalRowWidget) {
    btnIntervalFontSize.addEventListener('click', (e) => {
      e.stopPropagation();
      INTERVAL_FONTS.forEach(f => intervalRowWidget.classList.remove(f));
      currentFontIdx = (currentFontIdx + 1) % INTERVAL_FONTS.length;
      const nextFont = INTERVAL_FONTS[currentFontIdx];
      intervalRowWidget.classList.add(nextFont);
      localStorage.setItem('amrtf_interval_font', nextFont);
    });
  }

  // 全域按鈕字體比例放大 (100% / 125% / 150% / 175% / 200%)
  const btnScaleToggle = document.getElementById('btnScaleToggle');
  const SCALE_CLASSES = ['', 'btn-scale-125', 'btn-scale-150', 'btn-scale-175', 'btn-scale-200'];
  const SCALE_LABELS = ['🔤 100%', '🔤 125%', '🔤 150%', '🔤 175%', '🔤 200%'];
  let currentScaleIdx = 0;
  const savedScale = localStorage.getItem('amrtf_btn_scale') || '';
  if (savedScale) {
    currentScaleIdx = Math.max(0, SCALE_CLASSES.indexOf(savedScale));
    if (currentScaleIdx === 0 && (savedScale === 'btn-scale-120' || savedScale === 'btn-scale-140')) {
      currentScaleIdx = savedScale === 'btn-scale-120' ? 1 : 2;
    }
    const activeCls = SCALE_CLASSES[currentScaleIdx];
    if (activeCls) document.body.classList.add(activeCls);
    if (btnScaleToggle) btnScaleToggle.textContent = SCALE_LABELS[currentScaleIdx];
  }
  if (btnScaleToggle) {
    btnScaleToggle.addEventListener('click', () => {
      // 根據當前 DOM 上已有的 class 決定當前 index，防止閉包狀態與 DOM 脫鉤
      const curCls = SCALE_CLASSES.find(cls => cls && document.body.classList.contains(cls)) || '';
      let curIdx = SCALE_CLASSES.indexOf(curCls);
      if (curIdx < 0) curIdx = 0;

      // 清除所有可能的全域比例 class
      SCALE_CLASSES.forEach(cls => { if (cls) document.body.classList.remove(cls); });
      document.body.classList.remove('btn-scale-120', 'btn-scale-140');

      currentScaleIdx = (curIdx + 1) % SCALE_CLASSES.length;
      const nextCls = SCALE_CLASSES[currentScaleIdx];
      if (nextCls) document.body.classList.add(nextCls);
      btnScaleToggle.textContent = SCALE_LABELS[currentScaleIdx];
      localStorage.setItem('amrtf_btn_scale', nextCls);
    });
  }

  // 自訂名稱模板選單與儲存
  const selectDeckTemplate = document.getElementById('selectDeckTemplate');
  const btnSaveDeckTemplate = document.getElementById('btnSaveDeckTemplate');

  function refreshTemplateOptions() {
    if (!selectDeckTemplate || !window.DeckStorage) return;
    const customs = window.DeckStorage.getCustomTemplates();
    selectDeckTemplate.innerHTML = '';
    for (const [id, tpl] of Object.entries(customs)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = tpl.name || id;
      selectDeckTemplate.appendChild(opt);
    }
  }

  refreshTemplateOptions();

  if (selectDeckTemplate) {
    selectDeckTemplate.addEventListener('change', () => {
      const targetId = selectDeckTemplate.value;
      if (window.DeckStorage && window.DeckCanvas) {
        const layout = window.DeckStorage.loadTemplateById(targetId);
        window.DeckCanvas.render(layout);
      }
    });
  }

  if (btnSaveDeckTemplate) {
    btnSaveDeckTemplate.addEventListener('click', () => {
      if (!window.DeckStorage || !window.DeckCanvas) return;
      const currentLayout = window.DeckCanvas.exportCurrentLayout();
      const currentId = selectDeckTemplate.value;
      const customs = window.DeckStorage.getCustomTemplates();
      const defaultName = customs[currentId]?.name || '自訂排版';
      const newName = prompt('請輸入要儲存的模板名稱：', defaultName);
      if (!newName || !newName.trim()) return;

      const targetId = (currentId === 'full' || currentId === 'minimal')
        ? 'custom_' + Date.now()
        : currentId;

      window.DeckStorage.saveCustomTemplate(targetId, newName.trim(), currentLayout);
      refreshTemplateOptions();
      selectDeckTemplate.value = targetId;
      alert(`✅ 模板「${newName.trim()}」已成功儲存！隨時可在選單中一鍵切換。`);
    });
  }

  btnFullscreen.addEventListener('click', () => {
    // 專注控制第二螢幕大慈恩放映艙網頁全螢幕，不干擾主控台本身視窗
    sendCmd('toggle_fullscreen');
  });

  // 視窗右上角按 ✕ 關閉時，連動關閉放映艙網頁並退出伺服器釋放記憶體
  const triggerShutdown = () => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'SHUTDOWN' }));
      }
      navigator.sendBeacon('/api/shutdown');
    } catch (e) {}
  };
  window.addEventListener('beforeunload', triggerShutdown);
  window.addEventListener('pagehide', triggerShutdown);

  // 折疊 Mini 懸浮條
  btnMiniToggle.addEventListener('click', () => {
    isMiniMode = !isMiniMode;
    document.body.classList.toggle('mini-mode', isMiniMode);
    btnMiniToggle.textContent = isMiniMode ? '🗖' : '🗕';
  });

  // QR Code (支援 Firebase 雲端純掃碼直通 與 區域網路 LAN 雙軌切換)
  const tabCloudQr = document.getElementById('tabCloudQr');
  const tabLanQr = document.getElementById('tabLanQr');
  const qrTitle = document.getElementById('qrTitle');
  const qrRoomBadge = document.getElementById('qrRoomBadge');
  const qrHint = document.getElementById('qrHint');

  let cloudRelayData = null;
  let currentQrMode = 'cloud'; // 'cloud' | 'lan'

  function updateQrDisplay() {
    const port = window.location.port || '9998';
    const hostIp = (currentLanIp && currentLanIp !== '127.0.0.1' && currentLanIp !== 'localhost') ? currentLanIp : window.location.hostname;
    const lanUrl = `http://${hostIp}:${port}/mobile`;

    if (currentQrMode === 'cloud') {
      if (tabCloudQr) tabCloudQr.classList.add('active');
      if (tabLanQr) tabLanQr.classList.remove('active');
      if (qrTitle) qrTitle.textContent = '☁️ 手機雲端純掃碼遙控';
      if (qrHint) qrHint.textContent = '✨ 零手動輸入 · 32碼密碼學安全金鑰已封裝於 QR Code';

      if (cloudRelayData && cloudRelayData.cloudUrl) {
        if (qrRoomBadge) qrRoomBadge.textContent = `房間：${cloudRelayData.roomId}`;
        qrUrlText.textContent = cloudRelayData.cloudUrl;
        qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(cloudRelayData.cloudUrl);
      } else {
        if (qrRoomBadge) qrRoomBadge.textContent = '房間：連線中...';
        qrUrlText.textContent = '正在獲取雲端中繼房間代碼...';
      }
    } else {
      if (tabCloudQr) tabCloudQr.classList.remove('active');
      if (tabLanQr) tabLanQr.classList.add('active');
      if (qrTitle) qrTitle.textContent = '📶 區域網路 LAN 遙控';
      if (qrHint) qrHint.textContent = '需手機與主控台連接在同一個 Wi-Fi 區域網路';
      if (qrRoomBadge) qrRoomBadge.textContent = `內網 IP：${hostIp}`;
      qrUrlText.textContent = lanUrl;
      qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(lanUrl);
    }
  }

  if (tabCloudQr) {
    tabCloudQr.addEventListener('click', () => {
      currentQrMode = 'cloud';
      updateQrDisplay();
    });
  }

  if (tabLanQr) {
    tabLanQr.addEventListener('click', () => {
      currentQrMode = 'lan';
      updateQrDisplay();
    });
  }

  btnQrCode.addEventListener('click', async () => {
    qrModal.classList.add('active');
    updateQrDisplay();

    // 背景非同步拉取最新雲端房間 Token
    try {
      const res = await fetch('/api/cloud-relay/status');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.relay) {
          cloudRelayData = json.relay;
          if (currentQrMode === 'cloud') {
            updateQrDisplay();
          }
        }
      }
    } catch (e) {
      console.warn('[Desk] 拉取雲端中繼資訊失敗:', e);
    }
  });

  btnCloseQr.addEventListener('click', () => {
    qrModal.classList.remove('active');
  });

  // ==============================================================================
  // ⚙️ 右側滑出半透明系統設定控制艙 (Settings Drawer & Video Manager UI)
  // ==============================================================================
  const btnSettingsToggle = document.getElementById('btnSettingsToggle');
  const btnSettingsClose = document.getElementById('btnSettingsClose');
  const settingsBackdrop = document.getElementById('settingsBackdrop');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const videoStatusList = document.getElementById('videoStatusList');
  const btnDownloadVideos = document.getElementById('btnDownloadVideos');
  const downloadProgressContainer = document.getElementById('downloadProgressContainer');
  const downloadProgressFill = document.getElementById('downloadProgressFill');
  const downloadStatusText = document.getElementById('downloadStatusText');
  const settingsLanIp = document.getElementById('settingsLanIp');
  const settingsFsStatus = document.getElementById('settingsFsStatus');
  const btnToggleFsSettings = document.getElementById('btnToggleFsSettings');

  function openSettings() {
    if (settingsDrawer) settingsDrawer.classList.add('open');
    if (settingsBackdrop) settingsBackdrop.classList.add('active');
    if (settingsLanIp) settingsLanIp.textContent = `${currentLanIp}:9998`;
    refreshVideoStatus();
    checkSystemUpdate(false);
  }

  function closeSettings() {
    if (settingsDrawer) settingsDrawer.classList.remove('open');
    if (settingsBackdrop) settingsBackdrop.classList.remove('active');
  }

  // ==============================================================================
  // 📦 系統版本檢測與自動更新管理 (GitHub 遠端聯動與熱更新)
  // ==============================================================================
  let isCheckingUpdate = false;

  async function checkSystemUpdate(isManual = false) {
    if (isCheckingUpdate) return;
    isCheckingUpdate = true;
    if (versionStatusTag && isManual) {
      versionStatusTag.textContent = '正在探測遠端版本...';
      versionStatusTag.classList.remove('has-update');
    }

    try {
      const res = await fetch('/api/system/check-update');
      const data = await res.json();
      if (!data || !data.ok) throw new Error(data.error || '無法獲取版本資訊');

      if (currentVersionBadge) {
        currentVersionBadge.textContent = `v${data.currentVersion || '1.0.0'}`;
      }

      if (data.hasUpdate) {
        // 發現新版本！
        if (updateBadgeDot) updateBadgeDot.style.display = 'block';
        if (versionStatusTag) {
          versionStatusTag.textContent = `🎉 發現新版 v${data.latestVersion}`;
          versionStatusTag.classList.add('has-update');
        }
        if (updateNotesContainer && updateNotesBody) {
          updateNotesContainer.style.display = 'block';
          updateNotesBody.textContent = data.releaseNotes || '無更新備註';
        }
        if (data.isGitRepo) {
          if (btnApplyUpdate) {
            btnApplyUpdate.style.display = 'inline-block';
            btnApplyUpdate.textContent = `⚡ 立即升級至 v${data.latestVersion} (Git Pull)`;
          }
          if (btnDownloadRelease) btnDownloadRelease.style.display = 'none';
        } else {
          if (btnApplyUpdate) btnApplyUpdate.style.display = 'none';
          if (btnDownloadRelease) {
            btnDownloadRelease.style.display = 'inline-block';
            if (data.htmlUrl) btnDownloadRelease.href = data.htmlUrl;
          }
        }
        if (isManual) {
          alert(`🎉 發現新版本 v${data.latestVersion}！\n\n更新亮點：\n${data.releaseNotes || '請查看下方更新說明面板'}`);
        }
      } else {
        // 已是最新或離線
        if (updateBadgeDot) updateBadgeDot.style.display = 'none';
        if (versionStatusTag) {
          versionStatusTag.textContent = data.offline ? '⚠️ 現場離線 (無外網)' : '✅ 已是最新版本';
          versionStatusTag.classList.remove('has-update');
        }
        if (updateNotesContainer && updateNotesBody) {
          updateNotesContainer.style.display = 'block';
          updateNotesBody.textContent = data.releaseNotes || '當前版本已是最新穩定版。';
        }
        if (data.isGitRepo && btnApplyUpdate) {
          btnApplyUpdate.style.display = 'inline-block';
          btnApplyUpdate.textContent = '⚡ 檢查並同步主幹最新代碼 (Git Pull)';
        } else if (btnApplyUpdate) {
          btnApplyUpdate.style.display = 'none';
        }
        if (btnDownloadRelease) btnDownloadRelease.style.display = 'none';
        if (isManual) {
          alert(data.offline ? '⚠️ 目前處於現場離線模式，無法連線至 GitHub 伺服器。' : `✅ 目前已是最新版本 (v${data.currentVersion})！\n\n詳細版本更新說明已在下方展開。`);
        }
      }
    } catch (err) {
      if (versionStatusTag) {
        versionStatusTag.textContent = '檢查失敗';
        versionStatusTag.classList.remove('has-update');
      }
      if (isManual) alert('檢查更新失敗: ' + err.message);
    } finally {
      isCheckingUpdate = false;
    }
  }

  async function applySystemUpdate() {
    if (!confirm('確定要執行一鍵熱更新嗎？\n系統將自動自 GitHub 拉取最新程式碼。')) return;
    if (btnApplyUpdate) {
      btnApplyUpdate.disabled = true;
      btnApplyUpdate.textContent = '⏳ 正在拉取最新代碼...';
    }
    try {
      const res = await fetch('/api/system/apply-update', { method: 'POST' });
      const data = await res.json();
      if (!data || !data.ok) throw new Error(data.message || '更新失敗');
      alert(data.message || '更新完成！請重啟系統以生效。');
      checkSystemUpdate(false);
    } catch (err) {
      alert('更新失敗: ' + err.message);
    } finally {
      if (btnApplyUpdate) {
        btnApplyUpdate.disabled = false;
        btnApplyUpdate.textContent = '⚡ 一鍵熱更新 (Git Pull)';
      }
    }
  }

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => checkSystemUpdate(true));
  }

  if (btnApplyUpdate) {
    btnApplyUpdate.addEventListener('click', applySystemUpdate);
  }

  // 開機自動靜默探測一次
  setTimeout(() => {
    checkSystemUpdate(false);
  }, 1000);

  if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings();
    });
  }

  if (btnSettingsClose) {
    btnSettingsClose.addEventListener('click', closeSettings);
  }

  if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', closeSettings);
  }

  if (btnToggleFsSettings) {
    btnToggleFsSettings.addEventListener('click', () => {
      sendCmd('toggle_fullscreen');
    });
  }

  // 全域鍵盤快捷鍵：Esc 關閉設定艙 / 彈窗
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettings();
      if (qrModal) qrModal.classList.remove('active');
    }
  });

  // 刷新 3 支研討影片本地檔案快取狀態
  async function refreshVideoStatus() {
    if (!videoStatusList) return;
    try {
      const res = await fetch('/api/videos/status');
      const data = await res.json();
      if (!data || !data.videos) return;

      videoStatusList.innerHTML = '';
      let allReady = true;
      for (const [key, v] of Object.entries(data.videos)) {
        if (!v.exists) allReady = false;
        const card = document.createElement('div');
        card.className = 'video-status-card';
        card.innerHTML = `
          <div class="video-card-left">
            <span class="video-card-title">${v.title || key}</span>
            <span class="video-card-meta">${v.filename}</span>
          </div>
          <div>
            ${v.exists 
              ? `<span class="video-badge ready">✅ 已就緒 (${v.sizeMb} MB)</span>` 
              : `<span class="video-badge missing">⚠️ 尚未下載</span>`}
          </div>
        `;
        videoStatusList.appendChild(card);
      }

      if (btnDownloadVideos) {
        if (allReady) {
          btnDownloadVideos.textContent = '✅ 本機 3 支影片皆已就緒 (可點擊重新下載)';
          btnDownloadVideos.classList.remove('btn-primary');
        } else {
          btnDownloadVideos.textContent = '⬇️ 一鍵自動下載全部影片到本機';
          btnDownloadVideos.classList.add('btn-primary');
        }
      }
    } catch (err) {
      videoStatusList.innerHTML = `<div class="video-status-loading" style="color: #f87171;">無法取得影片狀態：${err.message}</div>`;
    }
  }

  // 一鍵自動觸發後台下載 3 支影片
  async function triggerVideoDownload() {
    if (btnDownloadVideos) {
      btnDownloadVideos.disabled = true;
      btnDownloadVideos.textContent = '⏳ 正在向伺服器請求下載...';
    }
    if (downloadProgressContainer) {
      downloadProgressContainer.style.display = 'block';
    }
    if (downloadProgressFill) {
      downloadProgressFill.style.width = '5%';
    }
    if (downloadStatusText) {
      downloadStatusText.textContent = '正在準備下載工具 (yt-dlp)...';
    }

    try {
      const res = await fetch('/api/videos/download', { method: 'POST' });
      const result = await res.json();
      const isSuccess = result && (result.success === true || result.ok === true);
      if (!isSuccess) {
        const errMsg = result.error || result.message || '伺服器未回傳成功信號';
        alert(`下載啟動失敗: ${errMsg}`);
        if (btnDownloadVideos) {
          btnDownloadVideos.disabled = false;
          btnDownloadVideos.textContent = '⬇️ 一鍵自動下載全部影片到本機';
        }
      }
    } catch (err) {
      alert(`請求失敗: ${err.message}`);
      if (btnDownloadVideos) {
        btnDownloadVideos.disabled = false;
        btnDownloadVideos.textContent = '⬇️ 一鍵自動下載全部影片到本機';
      }
    }
  }

  if (btnDownloadVideos) {
    btnDownloadVideos.addEventListener('click', triggerVideoDownload);
  }

  // 接收後台 WebSocket 廣播的即時下載進度
  function handleVideoProgress(data) {
    if (!downloadProgressContainer) return;
    downloadProgressContainer.style.display = 'block';

    const pct = Math.max(0, Math.min(100, Math.round(data.percent !== undefined ? data.percent : (data.progress || 0))));
    if (downloadProgressFill) {
      downloadProgressFill.style.width = `${pct}%`;
    }
    if (downloadStatusText) {
      const title = data.title || data.key || '影片';
      const isCompleted = data.status === 'completed' || (!data.isDownloading && pct >= 100);
      const isError = data.status === 'error' || (data.error && !data.isDownloading);

      if (isCompleted) {
        downloadStatusText.textContent = `🎉 全部影片已成功下載並放置於 assets/videos/！`;
        if (btnDownloadVideos) {
          btnDownloadVideos.disabled = false;
          btnDownloadVideos.textContent = '✅ 本機 3 支影片皆已就緒 (可點擊重新下載)';
          btnDownloadVideos.classList.remove('btn-primary');
        }
        refreshVideoStatus();
      } else if (isError) {
        downloadStatusText.textContent = `❌ 下載中斷: ${data.error || '未知錯誤'}`;
        if (btnDownloadVideos) {
          btnDownloadVideos.disabled = false;
          btnDownloadVideos.textContent = '⬇️ 重新嘗試下載全部影片';
        }
      } else if (data.status === 'downloading') {
        const stepDesc = data.currentStep || data.step || `正在下載 ${title}`;
        downloadStatusText.textContent = `${stepDesc} (${pct}%)`;
      } else {
        downloadStatusText.textContent = data.currentStep || data.message || `下載中 (${pct}%)...`;
      }
    }
  }

  // 退出按鈕 (全域優雅關閉)
  const btnExit = document.getElementById('btnExit');
  if (btnExit) {
    btnExit.addEventListener('click', () => {
      if (confirm('確定要關閉大慈恩研討播控艙嗎？')) {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'SHUTDOWN' }));
          }
          navigator.sendBeacon('/api/shutdown');
        } catch (e) {}
        setTimeout(() => window.close(), 150);
      }
    });
  }

  // 點擊講次標籤快速跳轉
  lessonBadge.title = '點擊跳轉指定講次';
  lessonBadge.addEventListener('click', () => {
    const target = prompt('請輸入要跳轉的講次編號：', '');
    if (target && target.trim()) {
      const raw = target.trim();
      const lessonNumber = /^\d+$/.test(raw) ? raw.padStart(4, '0') : raw;
      sendCmd('goto_lesson', { lessonNumber });
    }
  });

  // 狀態推播處理
  function handleStateUpdate(state) {
    if (!state) return;

    // 播放狀態 (綠 / 琥珀 / 斷線紅)
    isPlaying = !!state.isPlaying;
    const isScreenConnected = state.screenConnected !== false;

    if (!isScreenConnected) {
      statusBadge.textContent = '● 放映艙未連線 (點擊重連)';
      statusBadge.className = 'status-badge disconnected';
      statusBadge.title = '放映艙 CDP 尚未連通，點擊嘗試手動重新連線';
      btnPlayPause.textContent = '▶';
      btnPlayPause.classList.remove('playing');
    } else if (isPlaying) {
      btnPlayPause.textContent = '⏸';
      btnPlayPause.classList.add('playing');
      statusBadge.textContent = '● LIVE';
      statusBadge.className = 'status-badge live';
      statusBadge.title = '放映艙播映中，連線同步正常';
    } else {
      btnPlayPause.textContent = '▶';
      btnPlayPause.classList.remove('playing');
      statusBadge.textContent = '● 已同步';
      statusBadge.className = 'status-badge ready';
      statusBadge.title = '放映艙連線正常已同步';
    }

    // 碼表與倍速
    ledClock.textContent = (state.currentTimeStr || '00:00') + ' / ' + (state.totalTimeStr || '00:00');
    if (state.playbackRate) {
      speedBadge.textContent = `${state.playbackRate}x`;
      btnRate10.classList.toggle('active', state.playbackRate === 1.0);
      btnRate125.classList.toggle('active', state.playbackRate === 1.25);
      btnRate15.classList.toggle('active', state.playbackRate === 1.5);
    }

    // 全螢幕狀態同步至設定艙
    if (settingsFsStatus && state.fullscreen !== undefined) {
      settingsFsStatus.textContent = state.fullscreen ? '🖥️ 全螢幕播放中' : '獨立視窗 (視窗化)';
      settingsFsStatus.style.color = state.fullscreen ? '#38bdf8' : '#f1f5f9';
    }

    // 字體大小同步
    if (state.fontSize !== undefined) {
      currentFontSize = Math.round(state.fontSize);
      if (btnFontCycle) {
        btnFontCycle.textContent = `🔤 ${currentFontSize}px`;
      }
    }

    // 講次標題
    if (state.lessonNumber || state.lessonTitle) {
      lessonBadge.textContent = state.lessonNumber ? `第 ${state.lessonNumber} 講` : state.lessonTitle;
    }

    // 提詞機
    if (state.currentSubtitle && state.currentSubtitle.trim()) {
      prompterText.textContent = state.currentSubtitle;
    }

    // 捲動模式：狀態直接顯示於按鈕，手動為淡色，持續/區段為深色
    if (state.scrollMode !== undefined) {
      currentScrollMode = state.scrollMode;
      const label = state.scrollModeLabel || scrollLabels[currentScrollMode] || '手動';
      btnScrollMode.textContent = `📜 ${label}`;
      const isManual = currentScrollMode === 0;
      btnScrollMode.classList.toggle('active-deep', !isManual);
      btnScrollMode.classList.toggle('idle-light', isManual);
    }

    // 播稿模式：ON 為深色，OFF 為淺色；若無 LRC 則標註提示
    isSpeechMode = !!state.speechMode;
    const hasLrc = state.hasLrc !== undefined ? !!state.hasLrc : true;
    btnSpeechMode.classList.toggle('active-deep', isSpeechMode);
    btnSpeechMode.classList.toggle('idle-light', !isSpeechMode);
    if (!hasLrc) {
      btnSpeechMode.title = '⚠️ 本講次大慈恩官網無逐字字幕 (LRC) 播稿資訊';
      btnSpeechMode.style.opacity = '0.65';
    } else {
      btnSpeechMode.title = '切換播稿模式 (逐字高亮)';
      btnSpeechMode.style.opacity = '1';
    }

    // 循環模式
    isLoopQuote = state.looping && state.loopType === 'quote';
    isLoopParagraph = state.looping && state.loopType === 'paragraph';
    btnLoopQuote.classList.toggle('active', isLoopQuote);
    btnLoopParagraph.classList.toggle('active', isLoopParagraph);

    // 區段播映狀態反饋
    if (state.interval) {
      const isIntervalActive = !!state.interval.enabled;
      btnPlayInterval.classList.toggle('active', isIntervalActive && !state.interval.loop);
      btnLoopInterval.classList.toggle('active', isIntervalActive && !!state.interval.loop);
      btnStopInterval.style.display = isIntervalActive ? 'inline-block' : 'none';
    }

    // 動態填充手抄稿各段秒數下拉選單 (供講師隨選指定起訖)
    if (state.markers && Array.isArray(state.markers) && state.markers.length > 0) {
      const markersJson = JSON.stringify(state.markers);
      if (markersJson !== cachedMarkersJson) {
        cachedMarkersJson = markersJson;
        const curStartVal = selectIntervalStart.value;
        const curEndVal = selectIntervalEnd.value;

        selectIntervalStart.innerHTML = '';
        selectIntervalEnd.innerHTML = '';

        state.markers.forEach((m) => {
          const optStart = document.createElement('option');
          optStart.value = m.sec;
          optStart.textContent = `${m.label} (起)`;
          selectIntervalStart.appendChild(optStart);

          const optEnd = document.createElement('option');
          optEnd.value = m.sec;
          optEnd.textContent = `${m.label} (訖)`;
          selectIntervalEnd.appendChild(optEnd);
        });

        // 恢復或設定合理初始值
        if (curStartVal && Array.from(selectIntervalStart.options).some(o => o.value === curStartVal)) {
          selectIntervalStart.value = curStartVal;
        } else {
          selectIntervalStart.value = state.markers[0].sec;
        }

        if (curEndVal && Array.from(selectIntervalEnd.options).some(o => o.value === curEndVal)) {
          selectIntervalEnd.value = curEndVal;
        } else {
          // 終點預設為第 2 段或最後一段
          const defaultEndIdx = Math.min(state.markers.length - 1, 1);
          selectIntervalEnd.value = state.markers[defaultEndIdx].sec;
        }

        // 初始化雙向互斥約束
        updateIntervalOptionsConstraints();
      }
    }

    // 同步放映艙當前字級至按鈕
    if (state.fontSize) {
      currentFontSize = state.fontSize;
      const btnFontCycle = document.getElementById('btnFontCycle');
      if (btnFontCycle) {
        btnFontCycle.textContent = `🔤 ${currentFontSize}px`;
      }
    }
  }

  // ==============================================================================
  // 🎛️ 初始化 8 欄磁吸自訂畫布引擎 (Deck Canvas Mount)
  // ==============================================================================
  const btnEditLayoutToggle = document.getElementById('btnEditLayoutToggle');
  const deckDrawerContainer = document.getElementById('deckDrawerContainer');
  const deckDrawerList = document.getElementById('deckDrawerList');
  const deckGridContainer = document.getElementById('deckGridContainer');

  const btnTemplateFull = document.getElementById('btnTemplateFull');
  const btnTemplateMinimal = document.getElementById('btnTemplateMinimal');
  const btnResetLayout = document.getElementById('btnResetLayout');
  const btnExportLayout = document.getElementById('btnExportLayout');
  const fileImportLayout = document.getElementById('fileImportLayout');

  if (window.DeckCanvas && deckGridContainer) {
    window.DeckCanvas.init({
      gridContainer: deckGridContainer,
      drawerContainer: deckDrawerContainer,
      drawerList: deckDrawerList,
      statusBadge: statusBadge
    });

    if (btnEditLayoutToggle) {
      btnEditLayoutToggle.onclick = () => window.DeckCanvas.toggleMode();
    }

    if (btnTemplateFull) {
      btnTemplateFull.onclick = () => window.DeckCanvas.applyTemplate('full');
    }

    if (btnTemplateMinimal) {
      btnTemplateMinimal.onclick = () => window.DeckCanvas.applyTemplate('minimal');
    }

    if (btnResetLayout) {
      btnResetLayout.onclick = () => {
        if (confirm('確定要恢復為官方全功能預設佈局嗎？')) {
          window.DeckCanvas.applyTemplate('full');
        }
      };
    }

    if (btnExportLayout) {
      btnExportLayout.onclick = () => window.DeckCanvas.exportConfig();
    }

    if (fileImportLayout) {
      fileImportLayout.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          window.DeckCanvas.importConfig(evt.target.result);
          fileImportLayout.value = '';
        };
        reader.readAsText(file);
      };
    }
  }
})();
