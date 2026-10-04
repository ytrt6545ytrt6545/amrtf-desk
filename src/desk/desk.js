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

  // 按鈕與防抖哨兵
  let lastPlayPauseClickTime = 0;
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
  const btnScrollManual = document.getElementById('btnScrollManual');
  const btnScrollContinuous = document.getElementById('btnScrollContinuous');
  const btnScrollSection = document.getElementById('btnScrollSection');

  const btnVideoMigsema = document.getElementById('btnVideoMigsema');
  const btnVideoPrep = document.getElementById('btnVideoPrep');
  const btnVideoDedication = document.getElementById('btnVideoDedication');
  const btnCloseVideo = document.getElementById('btnCloseVideo');
  const btnStopVideo = document.getElementById('btnStopVideo');

  const btnVolumeMute = document.getElementById('btnVolumeMute');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const volumeIcon = document.getElementById('volumeIcon');
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

  let lastCmdTime = 0;
  let lastCmdName = '';
  function sendCmd(cmd, params = {}) {
    const now = Date.now();
    // 🎛️ 物理防抖硬鎖：80ms 內對高頻微抖動進行過濾，杜絕機械雙重擊發，同時絕不吞噬操作員正常快速連按
    if (cmd === lastCmdName && (now - lastCmdTime < 80) && (cmd === 'restart' || cmd === 'cycle_scroll_mode' || cmd === 'toggle_speech_mode' || cmd === 'toggle_fullscreen')) {
      console.warn(`[Desk-Debounce] 抑制 80ms 內高頻重複信令: ${cmd}`);
      return;
    }
    lastCmdTime = now;
    lastCmdName = cmd;
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

  // 🎛️ 註：所有實體按鍵（播放、快進倒退、倍速、講次、閱讀模式、區段循環等）
  // 已全數收斂至下方無頭解耦中樞 [data-action]，此處嚴禁重複綁定 direct click 以免引發 1ms 雙重觸發！


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

  // 4. 影片彈窗與視覺控制 (切換新影片前強制急煞上一部影片，徹底消滅聲音疊加)
  function playVideoExclusive(cmdName) {
    sendCmd('stop_video');
    setTimeout(() => sendCmd(cmdName), 30);
  }

  if (btnVideoMigsema) btnVideoMigsema.addEventListener('click', () => playVideoExclusive('modal_migtsema'));
  if (btnVideoPrep) btnVideoPrep.addEventListener('click', () => playVideoExclusive('modal_prep_video'));
  if (btnVideoDedication) btnVideoDedication.addEventListener('click', () => playVideoExclusive('modal_dedication_video'));
  if (btnCloseVideo) btnCloseVideo.addEventListener('click', () => sendCmd('modal_close'));
  if (btnStopVideo) btnStopVideo.addEventListener('click', () => sendCmd('stop_video'));

  // 5. 捲動模式三聯分段按鍵切換 (手動 / 持續 / 區段 隨選即切，純文字無圖)
  function updateScrollModeButtons(mode) {
    const m = parseInt(mode, 10);
    if (btnScrollManual) btnScrollManual.classList.toggle('active', m === 0);
    if (btnScrollContinuous) btnScrollContinuous.classList.toggle('active', m === 1);
    if (btnScrollSection) btnScrollSection.classList.toggle('active', m === 2);
  }

  if (btnScrollManual) {
    btnScrollManual.addEventListener('click', () => {
      updateScrollModeButtons(0);
      sendCmd('set_scroll_mode', { mode: '0' });
    });
  }
  if (btnScrollContinuous) {
    btnScrollContinuous.addEventListener('click', () => {
      updateScrollModeButtons(1);
      sendCmd('set_scroll_mode', { mode: '1' });
    });
  }
  if (btnScrollSection) {
    btnScrollSection.addEventListener('click', () => {
      updateScrollModeButtons(2);
      sendCmd('set_scroll_mode', { mode: '2' });
    });
  }

  // 6. 方案 A 網頁音量控制 (走帶倍速旁精巧滑桿 ＋ 靜音切換 ＋ 數值反饋 ＋ LocalStorage 記憶)
  function updateVolumeUI(vol, muted) {
    const v = Math.round(vol);
    if (volumeSlider) volumeSlider.value = v;
    if (volumeValue) volumeValue.textContent = `${v}%`;
    if (volumeIcon) {
      if (muted || v === 0) {
        volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
      } else {
        volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
      }
    }
  }

  if (volumeSlider) {
    const savedVol = localStorage.getItem('amrtf_desk_volume') || '100';
    volumeSlider.value = savedVol;
    if (volumeValue) volumeValue.textContent = `${savedVol}%`;
    const onVolumeChange = (e) => {
      const v = parseInt(e.target.value, 10);
      if (volumeValue) volumeValue.textContent = `${v}%`;
      localStorage.setItem('amrtf_desk_volume', String(v));
      sendCmd('set_volume', { volume: v });
    };
    volumeSlider.addEventListener('input', onVolumeChange);
    volumeSlider.addEventListener('change', onVolumeChange);
  }

  if (btnVolumeMute) {
    btnVolumeMute.addEventListener('click', () => sendCmd('toggle_mute'));
  }
  // ==============================================================================
  // 🌞 / 🌙 大慈恩明暗雙風格主題切換模組 (Parchment Light / Zen Dark)
  // ==============================================================================
  const THEME_STORAGE_KEY = 'amrtf_theme';

  function getSavedTheme() {
    return 'dark'; // 長官指定（選項 A）：徹底取消宣紙明亮皮膚，全域統一鎖定曜石玄木曜金尊榮深色風格
  }

  function applyTheme(theme) {
    // 永遠強制曜石玄木深色風格
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    if (btnDeskThemeToggle) {
      btnDeskThemeToggle.textContent = '🌙';
      btnDeskThemeToggle.title = '目前為主控台曜石玄木曜金深色風格 (已鎖定)';
      btnDeskThemeToggle.style.display = 'none'; // 隱藏日夜切換鈕
    }
  }

  function toggleTheme() {
    // 選項 A 鎖定深色風格，保持相容性空操作
    applyTheme('dark');
  }

  // 頂部按鈕專責控制主控台自身明暗風格（選項 A 鎖定深色）
  if (btnDeskThemeToggle) {
    btnDeskThemeToggle.addEventListener('click', toggleTheme);
  }
  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;

  // 立即套用曜石玄木深色風格
  applyTheme('dark');

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

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 音訊滑桿實時雙向跳轉與預覽連動 (長官指定：進度條實時雙向連動)
  let isSeekingAudio = false;
  const audioSeekerEl = document.getElementById('audioSeeker');
  if (audioSeekerEl) {
    audioSeekerEl.addEventListener('input', () => {
      isSeekingAudio = true;
      const targetSec = parseFloat(audioSeekerEl.value) || 0;
      if (ledClock) {
        const dur = parseFloat(audioSeekerEl.max) || 0;
        ledClock.textContent = `${formatTime(targetSec)} / ${formatTime(dur)}`;
      }
    });
    audioSeekerEl.addEventListener('change', () => {
      isSeekingAudio = false;
      const targetSec = parseFloat(audioSeekerEl.value) || 0;
      sendCmd('seek_absolute', { seconds: targetSec });
    });
  }

  // 放映端手抄稿深淺色雙聯分段按鍵 (長官指定：比照手動/持續/區間相同模式，實時反映真實情況)
  const btnScreenDark = document.getElementById('btnScreenDark');
  const btnScreenLight = document.getElementById('btnScreenLight');

  function updateScreenThemeButtons(theme) {
    const isDark = theme !== 'light'; // 預設黑曜深色
    if (btnScreenDark) btnScreenDark.classList.toggle('active', isDark);
    if (btnScreenLight) btnScreenLight.classList.toggle('active', !isDark);
  }

  if (btnScreenDark) {
    btnScreenDark.addEventListener('click', () => {
      sendCmd('set_theme', { theme: 'dark' });
      updateScreenThemeButtons('dark');
    });
  }
  if (btnScreenLight) {
    btnScreenLight.addEventListener('click', () => {
      sendCmd('set_theme', { theme: 'light' });
      updateScreenThemeButtons('light');
    });
  }

  // 字級拉桿連動
  const fontSizeSliderEl = document.getElementById('fontSizeSlider');
  const fontScaleDisplayEl = document.getElementById('fontScaleDisplay');
  if (fontSizeSliderEl) {
    fontSizeSliderEl.addEventListener('input', () => {
      const val = parseFloat(fontSizeSliderEl.value) || 16;
      if (fontScaleDisplayEl) fontScaleDisplayEl.textContent = `A+ ${val.toFixed(1)}px`;
      sendCmd('adjust_font_size', { value: val });
    });
  }

  // ==============================================================================
  // 🎛️ 全域無頭解耦信令委派中樞 (Decoupled Action Dispatcher)
  // 不依賴寫死 DOM ID，所有帶有 data-action 屬性之組件均可直接觸發信令！
  // ==============================================================================
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    if (!action) return;

    actionEl.classList.add('is-activating');
    setTimeout(() => actionEl.classList.remove('is-activating'), 150);

    switch (action) {
      case 'play_pause':
      case 'toggle_play': {
        const isCurrentlyPlaying = btnPlayPause && btnPlayPause.classList.contains('playing');
        const nextPlaying = !isCurrentlyPlaying;
        if (btnPlayPause) btnPlayPause.classList.toggle('playing', nextPlaying);
        const glyph = document.getElementById('playGlyph');
        if (glyph) {
          glyph.innerHTML = nextPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
        }
        const loopParagraphLabel = document.getElementById('loopParagraphLabel');
        if (loopParagraphLabel) {
          loopParagraphLabel.textContent = nextPlaying ? '⏸ 暫停' : '▶ 播放';
        }
        sendCmd('toggle_play');
        break;
      }
      case 'forward_10s':
      case 'seek_fwd_10':
        sendCmd('forward_10s');
        break;
      case 'forward_5s':
      case 'seek_fwd':
        sendCmd('forward_5s');
        break;
      case 'rewind_5s':
      case 'seek_bwd':
        sendCmd('rewind_5s');
        break;
      case 'rewind_10s':
      case 'seek_bwd_10':
        sendCmd('rewind_10s');
        break;
      case 'restart':
      case 'stop':
        sendCmd('restart');
        break;
      case 'prev_lesson':
      case 'prev_lecture':
        sendCmd('prev_lesson');
        break;
      case 'next_lesson':
      case 'next_lecture':
        sendCmd('next_lesson');
        break;
      case 'reload_lesson':
        sendCmd('goto_lesson', { lessonNumber: lessonBadge ? lessonBadge.textContent.replace(/\D/g, '') : '0567' });
        break;
      case 'toggle_speech_mode':
      case 'toggle_speech_lead':
        isSpeechMode = !isSpeechMode;
        if (btnSpeechMode) btnSpeechMode.classList.toggle('active', isSpeechMode);
        sendCmd('toggle_speech_mode');
        break;
      case 'cycle_scroll_mode':
      case 'toggle_scroll':
        currentScrollMode = (currentScrollMode + 1) % scrollLabels.length;
        if (btnScrollMode) {
          btnScrollMode.textContent = `📜 ${scrollLabels[currentScrollMode]}`;
          btnScrollMode.classList.toggle('active', currentScrollMode > 0);
        }
        sendCmd('cycle_scroll_mode');
        break;
      case 'fullscreen':
      case 'toggle_fullscreen':
        sendCmd('toggle_fullscreen');
        break;
      case 'toggle_theme':
      case 'set_theme': {
        const targetTheme = actionEl ? actionEl.getAttribute('data-theme') : null;
        if (targetTheme) {
          sendCmd('set_theme', { theme: targetTheme });
          updateScreenThemeButtons(targetTheme);
        } else {
          sendCmd('set_theme');
        }
        break;
      }
      case 'modal_prep_video':
        sendCmd('stop_video');
        setTimeout(() => sendCmd('modal_prep_video'), 30);
        break;
      case 'modal_migtsema':
        sendCmd('stop_video');
        setTimeout(() => sendCmd('modal_migtsema'), 30);
        break;
      case 'modal_dedication_video':
        sendCmd('stop_video');
        setTimeout(() => sendCmd('modal_dedication_video'), 30);
        break;
      case 'stop_video':
      case 'close_video':
        sendCmd('stop_video');
        break;
      case 'set_scroll_mode': {
        const mode = actionEl.getAttribute('data-mode') || '0';
        updateScrollModeButtons(mode);
        sendCmd('set_scroll_mode', { mode });
        break;
      }
      case 'toggle_mute':
        sendCmd('toggle_mute');
        break;
      case 'set_speed': {
        const r = parseFloat(actionEl.dataset.value || actionEl.textContent) || 1.0;
        sendCmd('set_playback_rate', { rate: r });
        document.querySelectorAll('.rate-btn').forEach(btn => {
          const v = parseFloat(btn.dataset.value || btn.textContent) || 1.0;
          btn.classList.toggle('active', Math.abs(v - r) < 0.05);
        });
        break;
      }
      case 'loop_interval':
      case 'play_interval':
        const start = parseFloat(selectIntervalStart ? selectIntervalStart.value : 0) || 0;
        const end = parseFloat(selectIntervalEnd ? selectIntervalEnd.value : 0) || 0;
        if (end > start) {
          sendCmd('play_interval', { start, end, loop: true });
        } else {
          sendCmd('loop_current_paragraph');
        }
        break;
      case 'loop_current_paragraph':
        sendCmd('loop_current_paragraph');
        break;
      case 'stop_interval':
        sendCmd('stop_interval');
        break;
      case 'toggle_quote':
      case 'jump_to_master_start':
        sendCmd('jump_to_master_start');
        break;
      case 'toggle_loop_segment':
        sendCmd('toggle_loop_segment');
        break;
    }
  });

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

  // 全域按鈕字體比例放大 (100% / 125% / 150%) - 長官指定上限 150%
  const btnScaleToggle = document.getElementById('btnScaleToggle');
  const SCALE_CLASSES = ['', 'btn-scale-125', 'btn-scale-150'];
  const SCALE_LABELS = ['🔤 100%', '🔤 125%', '🔤 150%'];
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

      // 清除所有可能的全域比例 class (含歷史 175%, 200%)
      SCALE_CLASSES.forEach(cls => { if (cls) document.body.classList.remove(cls); });
      document.body.classList.remove('btn-scale-120', 'btn-scale-140', 'btn-scale-175', 'btn-scale-200');

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

  // 視窗關閉由後端 WebSocket 連線池生命週期與寬限計時器自動管理；
  // 嚴禁在 beforeunload / pagehide 盲目調用 /api/shutdown，否則頁面切換或重新整理會瞬間觸發全域殉爆閃退！
  // 真正退出請透過頂部導航列之 btnExit「🚪」紅色退出按鈕。

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
  const syncProgressContainer = document.getElementById('syncProgressContainer');
  const syncProgressStatus = document.getElementById('syncProgressStatus');
  const syncProgressPercent = document.getElementById('syncProgressPercent');
  const syncProgressFill = document.getElementById('syncProgressFill');

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

      // 更新說明已依長官指示去除，永遠維持隱藏
      if (updateNotesContainer) updateNotesContainer.style.display = 'none';

      if (data.hasUpdate) {
        // 發現新版本！
        if (updateBadgeDot) updateBadgeDot.style.display = 'block';
        if (versionStatusTag) {
          versionStatusTag.textContent = `🎉 發現新版 v${data.latestVersion}`;
          versionStatusTag.classList.add('has-update');
        }
        if (data.isGitRepo) {
          if (btnApplyUpdate) {
            btnApplyUpdate.style.display = 'inline-block';
            btnApplyUpdate.textContent = `⚡ 升級至 v${data.latestVersion} (同步)`;
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
          alert(`🎉 發現新版本 v${data.latestVersion}！\n\n點擊下方「⚡ 同步」即可自動更新。`);
        }
      } else {
        // 已是最新或離線
        if (updateBadgeDot) updateBadgeDot.style.display = 'none';
        if (versionStatusTag) {
          versionStatusTag.textContent = data.offline ? '⚠️ 現場離線 (無外網)' : '✅ 已是最新版本';
          versionStatusTag.classList.remove('has-update');
        }
        if (data.isGitRepo && btnApplyUpdate) {
          btnApplyUpdate.style.display = 'inline-block';
          btnApplyUpdate.textContent = '⚡ 同步';
        } else if (btnApplyUpdate) {
          btnApplyUpdate.style.display = 'none';
        }
        if (btnDownloadRelease) btnDownloadRelease.style.display = 'none';
        if (isManual) {
          alert(data.offline ? '⚠️ 目前處於現場離線模式，無法連線至 GitHub 伺服器。' : `✅ 目前已是最新版本 (v${data.currentVersion})！`);
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
    if (!confirm('確定要執行同步嗎？\n系統將自動自 GitHub 拉取最新程式碼並更新資產。')) return;
    if (btnApplyUpdate) {
      btnApplyUpdate.disabled = true;
      btnApplyUpdate.textContent = '⏳ 正在同步...';
    }

    // 啟動流暢同步進度條
    if (syncProgressContainer) syncProgressContainer.style.display = 'block';
    let currentPct = 10;
    const updateProgressUI = (pct, text) => {
      if (syncProgressFill) syncProgressFill.style.width = `${pct}%`;
      if (syncProgressPercent) syncProgressPercent.textContent = `${pct}%`;
      if (syncProgressStatus) syncProgressStatus.textContent = text;
    };

    updateProgressUI(15, '⏳ 正在連線雲端倉庫...');

    const timer = setInterval(() => {
      if (currentPct < 85) {
        currentPct += Math.floor(Math.random() * 12) + 5;
        if (currentPct > 85) currentPct = 85;
        const text = currentPct < 50 ? '⏳ 正在拉取最新代碼與資源...' : '⏳ 正在校驗並替換本機資產...';
        updateProgressUI(currentPct, text);
      }
    }, 200);

    try {
      const res = await fetch('/api/system/apply-update', { method: 'POST' });
      const data = await res.json();
      clearInterval(timer);

      if (!data || !data.ok) throw new Error(data.message || '更新失敗');

      // 達到 100% 成功
      updateProgressUI(100, '🎉 同步成功！資產已更新完畢');

      setTimeout(() => {
        alert(data.message || '🎉 同步成功！即將重新載入主控台...');
        location.reload();
      }, 800);
    } catch (err) {
      clearInterval(timer);
      updateProgressUI(currentPct, `❌ 同步失敗: ${err.message}`);
      if (syncProgressFill) syncProgressFill.style.background = '#ef4444';
      alert('更新失敗: ' + err.message);
    } finally {
      if (btnApplyUpdate) {
        btnApplyUpdate.disabled = false;
        btnApplyUpdate.textContent = '⚡ 同步';
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
      const playGlyph = document.getElementById('playGlyph');
      if (playGlyph) {
        playGlyph.innerHTML = '<path d="M8 5v14l11-7z"/>';
      } else if (btnPlayPause) {
        btnPlayPause.textContent = '▶';
      }
      if (btnPlayPause) btnPlayPause.classList.remove('playing');
    } else if (isPlaying) {
      const playGlyph = document.getElementById('playGlyph');
      if (playGlyph) {
        playGlyph.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      } else if (btnPlayPause) {
        btnPlayPause.textContent = '⏸';
      }
      if (btnPlayPause) btnPlayPause.classList.add('playing');
      const loopParagraphLabel = document.getElementById('loopParagraphLabel');
      if (loopParagraphLabel) loopParagraphLabel.textContent = '⏸ 暫停';
      statusBadge.textContent = '● LIVE';
      statusBadge.className = 'status-badge live';
      statusBadge.title = '放映艙播映中，連線同步正常';
    } else {
      const playGlyph = document.getElementById('playGlyph');
      if (playGlyph) {
        playGlyph.innerHTML = '<path d="M8 5v14l11-7z"/>';
      } else if (btnPlayPause) {
        btnPlayPause.textContent = '▶';
      }
      if (btnPlayPause) btnPlayPause.classList.remove('playing');
      const loopParagraphLabel = document.getElementById('loopParagraphLabel');
      if (loopParagraphLabel) loopParagraphLabel.textContent = '▶ 播放';
      statusBadge.textContent = '● 已同步';
      statusBadge.className = 'status-badge ready';
      statusBadge.title = '放映艙連線正常已同步';
    }

    // 碼表與倍速
    if (ledClock) {
      ledClock.textContent = (state.currentTimeStr || '00:00') + ' / ' + (state.totalTimeStr || '00:00');
    }
    const timeElapsed = document.getElementById('timeElapsed');
    if (timeElapsed && state.currentTimeStr) {
      timeElapsed.textContent = `已播 ${state.currentTimeStr}`;
    }
    const timeRemaining = document.getElementById('timeRemaining');
    if (timeRemaining && state.totalTimeStr) {
      timeRemaining.textContent = `剩餘 ${state.totalTimeStr}`;
    }
    // 進度條實時雙向連動 (支援 state.currentTime 與相容 state.currentTimeSec)
    const audioSeeker = document.getElementById('audioSeeker');
    const curSec = state.currentTime !== undefined ? state.currentTime : state.currentTimeSec;
    const durSec = state.duration !== undefined ? state.duration : state.totalDurationSec;
    if (audioSeeker) {
      if (durSec !== undefined && durSec > 0) {
        audioSeeker.max = durSec;
      }
      if (curSec !== undefined && !isSeekingAudio) {
        audioSeeker.value = curSec;
      }
    }

    if (state.playbackRate) {
      speedBadge.textContent = `${state.playbackRate}x`;
      const curRate = parseFloat(state.playbackRate) || 1.0;
      document.querySelectorAll('.rate-btn').forEach(btn => {
        const v = parseFloat(btn.dataset.value || btn.textContent) || 1.0;
        btn.classList.toggle('active', Math.abs(v - curRate) < 0.05);
      });
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
      const fontScaleDisplay = document.getElementById('fontScaleDisplay');
      if (fontScaleDisplay) {
        fontScaleDisplay.textContent = `A+ ${Number(state.fontSize).toFixed(1)}px`;
      }
      const fontSizeSlider = document.getElementById('fontSizeSlider');
      if (fontSizeSlider && Math.abs(parseFloat(fontSizeSlider.value) - state.fontSize) > 0.4) {
        fontSizeSlider.value = state.fontSize;
      }
    }

    // 講次標題與編號
    if (state.lessonNumber || state.lessonTitle) {
      const num = state.lessonNumber || (state.lessonTitle ? state.lessonTitle.replace(/\D/g, '') : '');
      const padNum = /^\d+$/.test(num) ? num.padStart(4, '0') : num;
      if (lessonBadge) lessonBadge.textContent = padNum ? `第 ${padNum} 講` : state.lessonTitle;
      const quickNum = document.getElementById('lessonQuickNum');
      if (quickNum && padNum) quickNum.textContent = padNum;
    }

    // 提詞機
    if (state.currentSubtitle && state.currentSubtitle.trim()) {
      if (prompterText) prompterText.textContent = state.currentSubtitle;
    }

    // 捲動模式：如實同步手動、持續、區段三鍵高亮
    if (state.scrollMode !== undefined) {
      currentScrollMode = state.scrollMode;
      updateScrollModeButtons(currentScrollMode);
      if (btnScrollMode) {
        const label = state.scrollModeLabel || scrollLabels[currentScrollMode] || '手動';
        btnScrollMode.textContent = `📜 ${label}`;
        const isManual = currentScrollMode === 0;
        btnScrollMode.classList.toggle('active', !isManual);
      }
    }

    // 方案 A 音量狀態雙向同步 (支援外部或手機端調節時同步主控台)
    if (state.volume !== undefined) {
      updateVolumeUI(state.volume, !!state.muted);
    }

    // 放映端手抄稿深淺色狀態實時同步 (長官指定：採手動/持續/區間相同模式，實時反映真實情況)
    if (state.theme !== undefined) {
      updateScreenThemeButtons(state.theme);
    }

    // 播稿模式：長官指定：啟動時要亮，沒有啟動不亮
    isSpeechMode = !!state.speechMode;
    const hasLrc = state.hasLrc !== undefined ? !!state.hasLrc : true;
    btnSpeechMode.classList.toggle('active', isSpeechMode);
    btnSpeechMode.classList.remove('active-deep', 'idle-light');
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

    // 區段播映狀態反饋 (長官指定：釋放循環按鈕三等分常駐，未激活時暗淡，激活時發光亮紅，絕不露空底槽)
    if (state.interval) {
      const isIntervalActive = !!state.interval.enabled;
      btnPlayInterval.classList.toggle('active', isIntervalActive && !state.interval.loop);
      btnLoopInterval.classList.toggle('active', isIntervalActive && !!state.interval.loop);
      btnStopInterval.style.display = 'block';
      btnStopInterval.classList.toggle('active-live', isIntervalActive);
      btnStopInterval.classList.toggle('idle-disabled', !isIntervalActive);
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

  // ==============================================================================
  // 🎨 無頭控制核心與動態換膚管理器接入 (Headless Engine & Dynamic Skin Switcher)
  // ==============================================================================
  function initHeadlessDeskArchitecture() {
    const ControllerModule = window.AMRTFDeskController;
    if (!ControllerModule) {
      // 若非同步模組尚未就緒，短暫延遲重試
      setTimeout(initHeadlessDeskArchitecture, 50);
      return;
    }

    const { createDeskController } = ControllerModule;
    const deckContainer = document.getElementById('deckGridContainer');
    const btnSkinToggle = document.getElementById('btnSkinToggle');

    // 建立無頭控制器實例
    const deskCtrl = createDeskController({
      currentLesson: lessonBadge ? lessonBadge.textContent : '0001'
    }, {
      send: (msg) => {
        sendCmd(msg.action, msg.payload || {});
      }
    });
    window.deskCtrl = deskCtrl;

    if (!deckContainer) return;

    // 預先保存原始經典皮膚 HTML 樣板
    const classicTemplateHtml = deckContainer.innerHTML;

    // 建立皮膚切換器
    const skinMgr = deskCtrl.createSkinManager(deckContainer);
    window.skinMgr = skinMgr;

    // 1. 註冊皮膚：經典全功能操作艙
    skinMgr.registerSkin('classic', {
      name: '經典全功能操作艙',
      templateHtml: classicTemplateHtml,
      onMount: () => {
        if (btnSkinToggle) btnSkinToggle.textContent = '🎨 經典';
        // 恢復經典畫布之自訂功能
        if (window.DeckCanvas && typeof window.DeckCanvas.bindAllKeycaps === 'function') {
          window.DeckCanvas.bindAllKeycaps();
        }
      }
    });

    // 2. 註冊皮膚：Stream Deck 4×8 水晶戰術矩陣
    skinMgr.registerSkin('crystal', {
      name: '4×8 水晶戰術矩陣',
      templateHtml: `
        <div class="crystal-skin-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; padding: 12px 6px;">
          <button class="keycap-btn btn-play-pause" data-action="toggle_play" style="grid-column: span 2; height: 72px; font-size: 24px; font-weight: bold;">▶ / ⏸ 播控</button>
          <button class="keycap-btn btn-stop" data-action="restart" style="grid-column: span 2; height: 72px; font-size: 24px; font-weight: bold; background: #e11d48 !important;">⏹ 急煞停止</button>
          <button class="keycap-btn" data-action="rewind_5s" style="height: 58px;">⏪ 5s</button>
          <button class="keycap-btn" data-action="forward_5s" style="height: 58px;">5s ⏩</button>
          <button class="keycap-btn btn-quote" data-action="toggle_quote" style="height: 58px;"># 引文開關</button>
          <button class="keycap-btn" data-action="toggle_theme" style="height: 58px;">🌓 明暗風格</button>
          <button class="keycap-btn" data-action="prev_lesson" style="grid-column: span 2; height: 58px;">◀ 上一講次</button>
          <button class="keycap-btn" data-action="next_lesson" style="grid-column: span 2; height: 58px;">下一講次 ▶</button>
          <button class="keycap-btn active-deep" data-action="toggle_speech_mode" style="grid-column: span 2; height: 58px;">🗣️ 官方播稿</button>
          <button class="keycap-btn active-deep" data-action="cycle_scroll_mode" style="grid-column: span 2; height: 58px;">📜 持續捲動</button>
        </div>
      `,
      onMount: () => {
        if (btnSkinToggle) btnSkinToggle.textContent = '💎 水晶';
      }
    });

    // 3. 註冊皮膚：極簡巨型盲按艙
    skinMgr.registerSkin('minimal', {
      name: '極簡巨型盲按艙',
      templateHtml: `
        <div class="minimal-skin-flex" style="display: flex; gap: 14px; width: 100%; height: 100%; align-items: center; justify-content: center; padding: 16px;">
          <button class="keycap-btn btn-play-pause" data-action="toggle_play" style="flex: 3; height: 110px; font-size: 38px; font-weight: 900;">▶ / ⏸</button>
          <button class="keycap-btn btn-stop" data-action="restart" style="flex: 2; height: 110px; font-size: 32px; font-weight: 900; background: #e11d48 !important;">⏹ 停</button>
          <button class="keycap-btn" data-action="rewind_5s" style="flex: 1.5; height: 110px; font-size: 24px;">⏪ 5s</button>
          <button class="keycap-btn" data-action="forward_5s" style="flex: 1.5; height: 110px; font-size: 24px;">5s ⏩</button>
          <button class="keycap-btn" data-action="toggle_fullscreen" style="flex: 1; height: 110px; font-size: 30px;">🖥️</button>
        </div>
      `,
      onMount: () => {
        if (btnSkinToggle) btnSkinToggle.textContent = '⚡ 極簡';
      }
    });

    // 預設掛載經典皮膚並綁定
    skinMgr.switchSkin('classic');

    // 頂部按鈕點擊：循環切換皮膚 (classic ➔ crystal ➔ minimal)
    if (btnSkinToggle) {
      const skinOrder = ['classic', 'crystal', 'minimal'];
      let currentIdx = 0;
      btnSkinToggle.addEventListener('click', () => {
        currentIdx = (currentIdx + 1) % skinOrder.length;
        const targetSkin = skinOrder[currentIdx];
        skinMgr.switchSkin(targetSkin);
      });
    }

    console.log('✅ [HeadlessController] 無頭控制核心與皮膚管理器已成功掛載，自由換膚機制就緒！');
  }

  // 啟動無頭架構
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeadlessDeskArchitecture);
  } else {
    initHeadlessDeskArchitecture();
  }
})();
