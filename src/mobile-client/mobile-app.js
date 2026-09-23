/**
 * AMRTF 大慈恩雲端手機 4×8 行動操作艙 (Mobile Studio Controller)
 * 100% 密碼學純掃碼、4×8 磁吸水晶動態渲染、雙通道彈性容災、講次直通艙
 */

(() => {
  'use strict';

  // 1. 解析網址安全參數
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  const token = urlParams.get('token');
  const hostParam = urlParams.get('host');

  const unauthorizedScreen = document.getElementById('unauthorizedScreen');
  const authorizedApp = document.getElementById('authorizedApp');

  // 未帶合法 Token 啟動物理阻斷
  if (!roomId || !token || token.trim().length < 16) {
    if (unauthorizedScreen) unauthorizedScreen.classList.remove('hidden');
    if (authorizedApp) authorizedApp.classList.add('hidden');
    console.warn('[AMRTF-Mobile] 缺少合法房間或安全金鑰，已啟動純掃碼門禁阻斷');
    return;
  }

  // 解鎖主操作艙
  if (unauthorizedScreen) unauthorizedScreen.classList.add('hidden');
  if (authorizedApp) authorizedApp.classList.remove('hidden');

  // DOM 元素引用
  const roomLabel = document.getElementById('roomLabel');
  const statusDot = document.getElementById('statusDot');
  const relayStat = document.getElementById('relayStat');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const btnWakeLock = document.getElementById('btnWakeLock');
  const btnMobileScale = document.getElementById('btnMobileScale');
  const mobileDeckGrid = document.getElementById('mobileDeckGrid');

  if (roomLabel) roomLabel.textContent = roomId;

  // 全域狀態存儲
  let isPlaying = false;
  let isMuted = false;
  let currentTimeSec = 0;
  let totalDurationSec = 0;
  let currentLayout = null;
  let currentState = null;
  let timerInterval = null;
  let wakeLockSentinel = null;
  let ws = null;
  let commMode = 'probing'; // 'ws' | 'cloud' | 'probing'

  // 微震反饋封裝
  const triggerHaptic = (ms = 25) => {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  };

  // ==============================================================================
  // 🔤 2. 手機字體放縮控制 (100% ➔ 125% ➔ 150% ➔ 175% ➔ 200%)
  // ==============================================================================
  const scales = ['100', '125', '150', '175', '200'];
  let currentScale = localStorage.getItem('amrtf_mobile_font_scale') || '100';
  if (currentScale === '120') currentScale = '125';
  if (currentScale === '140') currentScale = '150';

  function applyScale(s) {
    scales.forEach(sc => document.body.classList.remove('mobile-font-' + sc));
    document.body.classList.remove('mobile-font-120', 'mobile-font-140');
    document.body.classList.add('mobile-font-' + s);
    if (btnMobileScale) btnMobileScale.textContent = '🔤 ' + s + '%';
  }
  applyScale(currentScale);

  if (btnMobileScale) {
    btnMobileScale.addEventListener('click', (e) => {
      e.stopPropagation();
      let idx = scales.indexOf(currentScale);
      idx = (idx + 1) % scales.length;
      currentScale = scales[idx];
      localStorage.setItem('amrtf_mobile_font_scale', currentScale);
      applyScale(currentScale);
      triggerHaptic(15);
    });
  }

  // ==============================================================================
  // 🌓 3. 雙風格主題切換 (宣紙雅白 / 玄木禪境)
  // ==============================================================================
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(isDark ? 'theme-dark' : 'theme-light');
    localStorage.setItem('amrtf_mobile_theme', isDark ? 'dark' : 'light');
  }
  const savedTheme = localStorage.getItem('amrtf_mobile_theme') || 'dark';
  applyTheme(savedTheme);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      triggerHaptic(15);
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  // ==============================================================================
  // ☀️ 4. 螢幕常亮控制 (Screen Wake Lock API)
  // ==============================================================================
  const initWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        if (btnWakeLock) {
          btnWakeLock.textContent = '☀️';
          btnWakeLock.title = '螢幕常亮中';
        }
      } catch (err) {
        if (btnWakeLock) btnWakeLock.textContent = '🌤️';
      }
    } else if (btnWakeLock) {
      btnWakeLock.style.display = 'none';
    }
  };
  initWakeLock();

  if (btnWakeLock) {
    btnWakeLock.addEventListener('click', async () => {
      triggerHaptic(15);
      if (!wakeLockSentinel) {
        await initWakeLock();
      } else {
        try {
          await wakeLockSentinel.release();
          wakeLockSentinel = null;
          btnWakeLock.textContent = '🌙';
          btnWakeLock.title = '螢幕常亮已關閉';
        } catch (e) {}
      }
    });
  }

  // ==============================================================================
  // ⏱️ 5. 本地時間與計時碼表內插
  // ==============================================================================
  const formatTime = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const startLocalTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (isPlaying) {
        currentTimeSec += 1;
        const ledTime = document.getElementById('ledTime');
        if (ledTime) {
          ledTime.textContent = `${formatTime(currentTimeSec)} / ${formatTime(totalDurationSec)}`;
        }
      }
    }, 1000);
  };
  startLocalTimer();

  // ==============================================================================
  // 📖 6. 講次快速直通艙 Modal
  // ==============================================================================
  const lectureModalBackdrop = document.getElementById('lectureModalBackdrop');
  const btnLectureModalClose = document.getElementById('btnLectureModalClose');
  const lectureDisplayRaw = document.getElementById('lectureDisplayRaw');
  const lectureDisplayPreview = document.getElementById('lectureDisplayPreview');
  const btnPadClear = document.getElementById('btnPadClear');
  const btnPadGo = document.getElementById('btnPadGo');

  let enteredLectureDigits = '';

  function openLectureJumpModal() {
    enteredLectureDigits = '';
    updateLectureModalDisplay();
    if (lectureModalBackdrop) lectureModalBackdrop.classList.add('show');
    triggerHaptic(20);
  }

  function closeLectureJumpModal() {
    if (lectureModalBackdrop) lectureModalBackdrop.classList.remove('show');
    enteredLectureDigits = '';
  }

  function updateLectureModalDisplay() {
    if (!lectureDisplayRaw || !lectureDisplayPreview) return;
    if (enteredLectureDigits.length === 0) {
      lectureDisplayRaw.textContent = '0000';
      lectureDisplayPreview.textContent = '請點按數字輸入講次 (例: 3 或 0003)';
      lectureDisplayPreview.style.color = '#94a3b8';
    } else {
      const padded = enteredLectureDigits.padStart(4, '0');
      lectureDisplayRaw.textContent = padded;
      lectureDisplayPreview.textContent = `導航預覽: 第 ${padded} 講`;
      lectureDisplayPreview.style.color = '#10b981';
    }
  }

  if (btnLectureModalClose) btnLectureModalClose.onclick = closeLectureJumpModal;
  if (lectureModalBackdrop) {
    lectureModalBackdrop.onclick = (e) => {
      if (e.target === lectureModalBackdrop) closeLectureJumpModal();
    };
  }

  document.querySelectorAll('.pad-num').forEach(btn => {
    btn.onclick = () => {
      const num = btn.getAttribute('data-num');
      if (enteredLectureDigits.length < 4) {
        enteredLectureDigits += num;
        updateLectureModalDisplay();
        triggerHaptic(15);
      }
    };
  });

  if (btnPadClear) {
    btnPadClear.onclick = () => {
      if (enteredLectureDigits.length > 0) {
        enteredLectureDigits = enteredLectureDigits.slice(0, -1);
      } else {
        enteredLectureDigits = '';
      }
      updateLectureModalDisplay();
      triggerHaptic(15);
    };
  }

  if (btnPadGo) {
    btnPadGo.onclick = () => {
      if (enteredLectureDigits.length === 0) {
        alert('請先輸入講次數字！');
        return;
      }
      const padded = enteredLectureDigits.padStart(4, '0');
      sendCommand('goto_lesson', { lessonNumber: padded, lesson: padded });
      closeLectureJumpModal();
      triggerHaptic(40);
    };
  }

  // ==============================================================================
  // 🎮 7. 4×8 磁吸水晶操作網格動態組裝引擎 (Data-Driven UI Render Engine)
  // ==============================================================================
  function renderDeck(layoutToRender = null) {
    const layout = layoutToRender || currentLayout;
    if (!layout || !layout.items || !mobileDeckGrid) return;
    currentLayout = layout;

    mobileDeckGrid.innerHTML = '';

    for (const item of layout.items) {
      const el = document.createElement('div');
      el.id = 'deck-item-' + item.id;
      el.className = 'deck-item';
      el.style.gridColumn = `${item.col} / span ${item.w}`;
      el.style.gridRow = `${item.row} / span ${item.h}`;

      if (item.type === 'widget') {
        if (item.id === 'header-info') {
          el.className += ' widget-header-info';
          el.innerHTML = '<div class="lcd-monitor-screen clickable-header-lcd" id="btnHeaderInfoJump" title="點擊輸入講次跳轉 (例: 3/03/0003)">' +
                           '<div class="led-time" id="ledTime">00:00 / 00:00</div>' +
                           '<div class="lesson-title" id="lessonTitle">AMRTF 4×8 就緒</div>' +
                         '</div>';
          el.onclick = () => openLectureJumpModal();
        } else if (item.id === 'widget-teleprompter') {
          el.className += ' widget-teleprompter';
          el.innerHTML = '<div class="lcd-monitor-screen">' +
                           '<div class="prompter-header"><span>師父開示逐字提詞</span><span id="prompterStatus">即時</span></div>' +
                           '<div class="prompter-content" id="prompterBox">手抄稿即時提詞就緒...</div>' +
                         '</div>';
        } else if (item.id === 'widget-interval') {
          el.className += ' widget-interval-box';
          el.innerHTML = '<div class="lcd-monitor-screen">' +
                           '<div class="interval-select-row">' +
                             '<div class="interval-field">' +
                               '<span class="field-tag">起</span>' +
                               '<select class="mobile-select" id="mobileSelectStart"><option value="0">00:00 起點</option></select>' +
                             '</div>' +
                             '<div class="interval-field">' +
                               '<span class="field-tag">訖</span>' +
                               '<select class="mobile-select" id="mobileSelectEnd"><option value="0">00:00 訖點</option></select>' +
                             '</div>' +
                             '<button class="int-scale-btn" id="btnMobileIntScale" title="單獨切換起訖字級 (小/中/大/特大)">🔤</button>' +
                           '</div>' +
                           '<div class="interval-btn-row">' +
                             '<button class="int-action-btn btn-int-play" id="btnMobilePlayInterval">▶ 區間</button>' +
                             '<button class="int-action-btn btn-int-loop" id="btnMobileLoopInterval">🔁 循環</button>' +
                             '<button class="int-action-btn btn-int-stop" id="btnMobileStopInterval">⏹ 急煞</button>' +
                           '</div>' +
                         '</div>';
          setTimeout(() => setupMobileIntervalEvents(), 30);
        }
      } else {
        // Stream Deck 3D 水晶鍵帽
        el.className += ' deck-btn ' + (item.style || 'btn-secondary');
        if (item.w >= 2 && item.h >= 2) el.className += ' span-2x2';
        else if (item.h === 1 && item.w >= 2) el.className += ' span-wide';

        let icon = '⚡';
        if (item.action === 'play' || item.action === 'toggle_play') {
          icon = isPlaying ? '⏸' : '▶';
          if (isPlaying) el.className += ' playing';
        } else if (item.action === 'stop') icon = '⏹';
        else if (item.action === 'seek_bwd' || item.action === 'rewind_5s') icon = '⏪';
        else if (item.action === 'seek_fwd' || item.action === 'forward_5s') icon = '⏩';
        else if (item.action === 'toggle_quote') icon = '#';
        else if (item.action === 'toggle_theme' || item.action === 'set_theme') icon = '🌓';
        else if (item.action === 'toggle_scroll') icon = '📜';
        else if (item.action === 'toggle_speech_lead') icon = '🗣️';
        else if (item.action === 'loop_interval') icon = '🔁';
        else if (item.action === 'prev_lecture' || item.action === 'prev_lesson') icon = '⏮';
        else if (item.action === 'next_lecture' || item.action === 'next_lesson') icon = '⏭';
        else if (item.action === 'fullscreen' || item.action === 'toggle_fullscreen') icon = '⛶';
        else if (item.action === 'modal_migtsema' || item.action === 'modal_prep_video' || item.action === 'modal_dedication_video') icon = '🎬';
        else if (item.action === 'close_video' || item.action === 'modal_close') icon = '✕';
        else if (item.action === 'toggle_mute') icon = isMuted ? '🔇' : '🔊';

        let labelText = item.label || item.id;
        labelText = labelText.replace(/^[▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡🔇🔊\s]+/, '')
                             .replace(/[\s▶⏸⏹⏪⏩#🌓📜🗣️🔁⏮⏭⛶🎬✕⏱️⚡🔇🔊]+$/, '').trim() || labelText;

        el.innerHTML = '<div class="deck-btn-crystal">' +
                         '<div class="btn-glyph">' + icon + '</div>' +
                         '<div class="btn-label">' + labelText + '</div>' +
                       '</div>';

        el.onclick = () => handleButtonClick(item);
      }

      mobileDeckGrid.appendChild(el);
    }

    updateStateDisplay();
  }

  function handleButtonClick(item) {
    triggerHaptic(30);
    const act = item.action;
    if (act === 'play' || act === 'toggle_play') {
      sendCommand('TOGGLE_PLAY');
    } else if (act === 'stop') {
      sendCommand('STOP');
    } else if (act === 'seek_bwd' || act === 'rewind_5s') {
      sendCommand('SEEK_BACKWARD', { seconds: 5 });
    } else if (act === 'seek_fwd' || act === 'forward_5s') {
      sendCommand('SEEK_FORWARD', { seconds: 5 });
    } else if (act === 'toggle_quote') {
      sendCommand('TOGGLE_QUOTE');
    } else if (act === 'toggle_theme' || act === 'set_theme') {
      sendCommand('TOGGLE_THEME');
    } else if (act === 'toggle_scroll') {
      sendCommand('TOGGLE_SCROLL_MODE');
    } else if (act === 'toggle_speech_lead') {
      sendCommand('TOGGLE_SPEECH_LEAD');
    } else if (act === 'loop_interval') {
      sendCommand('LOOP_INTERVAL');
    } else if (act === 'prev_lecture' || act === 'prev_lesson') {
      sendCommand('PREV_LECTURE');
    } else if (act === 'next_lecture' || act === 'next_lesson') {
      sendCommand('NEXT_LECTURE');
    } else if (act === 'fullscreen' || act === 'toggle_fullscreen') {
      sendCommand('FULLSCREEN');
    } else if (act === 'toggle_mute') {
      sendCommand('TOGGLE_MUTE');
    } else if (act) {
      sendCommand(act, item.params || {});
    }
  }

  // ==============================================================================
  // ⏱️ 8. 起訖段落控制連動
  // ==============================================================================
  function updateMobileIntervalConstraints(changedTarget = 'init') {
    const selStart = document.getElementById('mobileSelectStart');
    const selEnd = document.getElementById('mobileSelectEnd');
    if (!selStart || !selEnd || selStart.options.length === 0 || selEnd.options.length === 0) return;

    let s = parseFloat(selStart.value) || 0;
    let e = parseFloat(selEnd.value) || 0;

    if (changedTarget === 'start' || changedTarget === 'init') {
      let validEndFound = false;
      Array.from(selEnd.options).forEach((opt) => {
        const val = parseFloat(opt.value) || 0;
        const shouldDisable = val <= s;
        opt.disabled = shouldDisable;
        if (!shouldDisable && val === e) validEndFound = true;
      });
      if (!validEndFound) {
        const nextValidOpt = Array.from(selEnd.options).find(opt => !opt.disabled);
        if (nextValidOpt) {
          selEnd.value = nextValidOpt.value;
          e = parseFloat(nextValidOpt.value) || 0;
        }
      }
      const totalStarts = selStart.options.length;
      Array.from(selStart.options).forEach((opt, idx) => {
        opt.disabled = idx === totalStarts - 1 && totalStarts > 1;
      });
    } else if (changedTarget === 'end') {
      let validStartFound = false;
      Array.from(selStart.options).forEach((opt) => {
        const val = parseFloat(opt.value) || 0;
        const shouldDisable = val >= e;
        opt.disabled = shouldDisable;
        if (!shouldDisable && val === s) validStartFound = true;
      });
      if (!validStartFound) {
        const validStarts = Array.from(selStart.options).filter(opt => !opt.disabled);
        if (validStarts.length > 0) {
          selStart.value = validStarts[validStarts.length - 1].value;
          s = parseFloat(selStart.value) || 0;
        }
      }
    }
  }

  function setupMobileIntervalEvents() {
    const btnPlay = document.getElementById('btnMobilePlayInterval');
    const btnLoop = document.getElementById('btnMobileLoopInterval');
    const btnStop = document.getElementById('btnMobileStopInterval');
    const selStart = document.getElementById('mobileSelectStart');
    const selEnd = document.getElementById('mobileSelectEnd');

    if (selStart && !selStart.dataset.bound) {
      selStart.dataset.bound = 'true';
      selStart.onchange = () => updateMobileIntervalConstraints('start');
    }
    if (selEnd && !selEnd.dataset.bound) {
      selEnd.dataset.bound = 'true';
      selEnd.onchange = () => updateMobileIntervalConstraints('end');
    }

    if (btnPlay && !btnPlay.dataset.bound) {
      btnPlay.dataset.bound = 'true';
      btnPlay.onclick = () => {
        const start = parseFloat(selStart?.value) || 0;
        const end = parseFloat(selEnd?.value) || 0;
        if (end > start) {
          sendCommand('play_interval', { start, end, loop: false });
        } else {
          alert('訖點必須大於起點！請選擇後續段落。');
        }
      };
    }
    if (btnLoop && !btnLoop.dataset.bound) {
      btnLoop.dataset.bound = 'true';
      btnLoop.onclick = () => {
        const start = parseFloat(selStart?.value) || 0;
        const end = parseFloat(selEnd?.value) || 0;
        if (end > start) {
          sendCommand('play_interval', { start, end, loop: true });
        } else {
          alert('訖點必須大於起點！請選擇後續段落。');
        }
      };
    }
    if (btnStop && !btnStop.dataset.bound) {
      btnStop.dataset.bound = 'true';
      btnStop.onclick = () => {
        sendCommand('stop_interval');
        sendCommand('pause');
      };
    }

    const btnIntScale = document.getElementById('btnMobileIntScale');
    const box = document.querySelector('.widget-interval-box');
    const INT_FONTS = ['int-font-sm', 'int-font-md', 'int-font-lg', 'int-font-xl'];
    const INT_LABELS = ['小', '中', '大', '特大'];
    let curIntFont = localStorage.getItem('amrtf_mobile_interval_font') || 'int-font-md';

    function applyIntFont(f) {
      if (!box) return;
      INT_FONTS.forEach(cls => box.classList.remove(cls));
      box.classList.add(f);
      const idx = INT_FONTS.indexOf(f);
      if (btnIntScale) btnIntScale.textContent = '🔤' + INT_LABELS[idx >= 0 ? idx : 1];
    }
    applyIntFont(curIntFont);

    if (btnIntScale && !btnIntScale.dataset.bound) {
      btnIntScale.dataset.bound = 'true';
      btnIntScale.onclick = (e) => {
        e.stopPropagation();
        let idx = INT_FONTS.indexOf(curIntFont);
        idx = (idx + 1) % INT_FONTS.length;
        curIntFont = INT_FONTS[idx];
        localStorage.setItem('amrtf_mobile_interval_font', curIntFont);
        applyIntFont(curIntFont);
        triggerHaptic(15);
      };
    }

    if (currentState && currentState.markers) {
      populateMobileIntervalOptions(currentState.markers);
    }
  }

  let lastRenderedMarkerCount = 0;
  function populateMobileIntervalOptions(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return;
    if (markers.length === lastRenderedMarkerCount) return;
    lastRenderedMarkerCount = markers.length;

    const selStart = document.getElementById('mobileSelectStart');
    const selEnd = document.getElementById('mobileSelectEnd');
    if (!selStart || !selEnd) return;

    selStart.innerHTML = '';
    selEnd.innerHTML = '';

    markers.forEach((m, idx) => {
      const timeVal = parseFloat(m.sec ?? m.seconds ?? m.time ?? 0);
      const rawLabel = m.label || m.title || ('第 ' + (idx + 1) + ' 段');
      const min = Math.floor(timeVal / 60).toString().padStart(2, '0');
      const s = Math.floor(timeVal % 60).toString().padStart(2, '0');
      const timeDisplay = m.timeStr || (min + ':' + s);

      const escapedTime = timeDisplay.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const cleanLabel = (rawLabel || '').replace(new RegExp('^' + escapedTime + '\\s*'), '').trim();
      const displayLabel = cleanLabel ? (timeDisplay + ' ' + cleanLabel) : timeDisplay;

      const optS = document.createElement('option');
      optS.value = String(timeVal);
      optS.textContent = displayLabel;
      selStart.appendChild(optS);

      const optE = document.createElement('option');
      optE.value = String(timeVal);
      optE.textContent = displayLabel;
      selEnd.appendChild(optE);
    });

    if (selEnd.options.length > 1) {
      selEnd.selectedIndex = 1;
    }
    updateMobileIntervalConstraints('init');
  }

  // ==============================================================================
  // 📡 9. 狀態更新渲染
  // ==============================================================================
  function updateStateDisplay(state = null) {
    if (state) currentState = state;
    if (!currentState) return;

    if (currentState.isPlaying !== undefined || currentState.is_playing !== undefined || currentState.playing !== undefined) {
      const p = currentState.isPlaying ?? currentState.is_playing ?? currentState.playing;
      isPlaying = !!p;
      const playBtn = document.querySelector('.btn-play');
      if (playBtn) {
        if (isPlaying) {
          playBtn.classList.add('playing');
          const glyph = playBtn.querySelector('.btn-glyph');
          if (glyph) glyph.textContent = '⏸';
        } else {
          playBtn.classList.remove('playing');
          const glyph = playBtn.querySelector('.btn-glyph');
          if (glyph) glyph.textContent = '▶';
        }
      }
    }

    if (currentState.is_muted !== undefined || currentState.muted !== undefined) {
      isMuted = !!(currentState.is_muted ?? currentState.muted);
    }

    if (currentState.currentTime !== undefined || currentState.current_time !== undefined) {
      currentTimeSec = Number(currentState.currentTime ?? currentState.current_time) || 0;
    }
    if (currentState.duration !== undefined) {
      totalDurationSec = Number(currentState.duration) || 0;
    }

    const ledTime = document.getElementById('ledTime');
    if (ledTime) {
      const curStr = currentState.currentTimeStr || formatTime(currentTimeSec);
      const totStr = currentState.totalTimeStr || formatTime(totalDurationSec);
      ledTime.textContent = `${curStr} / ${totStr}`;
    }

    const lessonTitle = document.getElementById('lessonTitle');
    if (lessonTitle) {
      const rawLesson = currentState.lessonNumber || currentState.lesson;
      const lessonNum = rawLesson ? `第 ${rawLesson} 講` : (currentState.lessonTitle || '大慈恩研討課堂');
      const pageStr = currentState.page ? ` (第 ${currentState.page} 頁)` : '';
      lessonTitle.textContent = `${lessonNum}${pageStr}`;
    }

    const prompterBox = document.getElementById('prompterBox');
    if (prompterBox) {
      const text = currentState.currentSubtitle || currentState.transcript || currentState.prompter_text || currentState.current_quote;
      if (text && prompterBox.textContent !== text) {
        prompterBox.textContent = text;
      }
    }

    if (currentState.markers && Array.isArray(currentState.markers) && currentState.markers.length > 0) {
      populateMobileIntervalOptions(currentState.markers);
    }

    if (currentState.layout_version && currentState.layout_version !== lastLoadedLayoutVersion) {
      fetchRoomLayout(true);
    }
  }

  // ==============================================================================
  // 🚀 10. 雙通道連線 (Firebase RTDB 原生 HTTPS 雲端穿透 ＋ 本地 WebSocket 直通)
  // ==============================================================================
  const RTDB_URL = 'https://directordeck-bba31-default-rtdb.asia-southeast1.firebasedatabase.app';

  function sendCommand(action, payload = {}) {
    triggerHaptic(25);
    const envelope = {
      type: 'ROOM_COMMAND',
      room: roomId,
      token: token,
      action: action,
      payload: payload,
      timestamp: Date.now()
    };

    // 1. 若區域網路 WebSocket 可用，發送
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }

    // 2. 雲端 RTDB 佇列發送 (原生 HTTPS，無 Mixed Content 阻斷，延遲 <50ms)
    fetch(`${RTDB_URL}/amrtf/rooms/${encodeURIComponent(roomId)}/commands.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    }).catch(err => {
      console.warn('[AMRTF-Mobile] 雲端信令派發異常:', err);
    });
  }

  let lastLoadedLayoutVersion = 0;

  // 嘗試拉取房間版面 (從雲端 RTDB 取得該教室專屬 4×8 配置)
  async function fetchRoomLayout(force = false) {
    try {
      const res = await fetch(`${RTDB_URL}/amrtf/rooms/${encodeURIComponent(roomId)}/layout.json`);
      if (res.ok) {
        const layout = await res.json();
        if (layout && layout.items && Array.isArray(layout.items)) {
          const v = layout.updatedAt || 0;
          if (force || v !== lastLoadedLayoutVersion || !currentLayout) {
            lastLoadedLayoutVersion = v;
            renderDeck(layout);
            return true;
          }
        }
      }
    } catch (e) {}
    return false;
  }

  // 嘗試拉取房間放映狀態 (含起訖段落 markers 清單)
  async function pollRoomState() {
    try {
      const res = await fetch(`${RTDB_URL}/amrtf/rooms/${encodeURIComponent(roomId)}/state.json`);
      if (res.ok) {
        const state = await res.json();
        if (state && typeof state === 'object') {
          updateStateDisplay(state);
        }
      }
    } catch (e) {}
  }

  // 雲端放映狀態 SSE 即時串流監聽
  function startCloudStream() {
    try {
      const es = new EventSource(`${RTDB_URL}/amrtf/rooms/${encodeURIComponent(roomId)}/state.json`);
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const state = (parsed && parsed.data !== undefined) ? parsed.data : parsed;
          if (state && typeof state === 'object') {
            updateStateDisplay(state);
          }
        } catch (e) {}
      };
      es.onerror = () => {
        // SSE 若斷線交由定時輪詢保底
      };
    } catch (e) {}
  }

  // 雲端自訂 4×8 版面 SSE 即時串流監聽 (微秒級熱突變)
  function startCloudLayoutStream() {
    try {
      const esLayout = new EventSource(`${RTDB_URL}/amrtf/rooms/${encodeURIComponent(roomId)}/layout.json`);
      esLayout.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const layout = (parsed && parsed.data !== undefined) ? parsed.data : parsed;
          if (layout && layout.items && Array.isArray(layout.items)) {
            console.log('📱 [AMRTF-Mobile] 捕獲雲端版面熱推播，即刻刷新 4×8 水晶操作艙！');
            lastLoadedLayoutVersion = layout.updatedAt || Date.now();
            renderDeck(layout);
          }
        } catch (e) {}
      };
      esLayout.onerror = () => {};
    } catch (e) {}
  }

  function startCloudPolling() {
    commMode = 'cloud';
    if (statusDot) statusDot.className = 'status-dot online';
    if (relayStat) relayStat.textContent = '雲端直通 (<50ms)';
    // 立即拉取 layout 與 state
    fetchRoomLayout(true);
    pollRoomState();
    startCloudStream();
    startCloudLayoutStream();
    // 雲端定時雙軌輪詢雙重保底 (狀態 1 秒一次，版面 3 秒一次)
    setInterval(pollRoomState, 1000);
    setInterval(() => fetchRoomLayout(false), 3000);
  }

  function connectRelay() {
    // 優先探測主機目標
    const targetHost = hostParam || (window.location.hostname !== 'localhost' && !window.location.hostname.endsWith('web.app') ? window.location.host : null);

    // 若在 HTTPS 網頁環境且目標 host 是非加密 IP，直接走雲端通道 (防範瀏覽器 Mixed Content 阻斷)
    const isHttps = window.location.protocol === 'https:';
    if (!targetHost || isHttps) {
      startCloudPolling();
      return;
    }

    const wsUrl = `ws://${targetHost}/ws-relay?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        commMode = 'ws';
        if (statusDot) statusDot.className = 'status-dot online';
        if (relayStat) relayStat.textContent = '局域直通 (<10ms)';
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'MOBILE_LAYOUT_UPDATED' && msg.layout) {
            renderDeck(msg.layout);
          } else if (msg.type === 'ROOM_STATE_SYNC' && msg.state) {
            updateStateDisplay(msg.state);
          } else if (msg.type === 'STATE_UPDATE' && msg.data) {
            updateStateDisplay(msg.data);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        startCloudPolling();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      startCloudPolling();
    }
  }

  // 11. 預設 4×8 降級版面 (確保零等待秒開)
  const defaultFallbackLayout = {
    profile: 'full',
    items: [
      { id: 'header-info', type: 'widget', col: 1, row: 1, w: 4, h: 1 },
      { id: 'play', type: 'button', label: '播放', action: 'play', style: 'btn-play', col: 1, row: 2, w: 2, h: 2 },
      { id: 'stop', type: 'button', label: '急煞停止', action: 'stop', style: 'btn-stop', col: 3, row: 2, w: 2, h: 2 },
      { id: 'seek_bwd', type: 'button', label: '退 5 秒', action: 'seek_bwd', style: 'btn-secondary', col: 1, row: 4, w: 2, h: 1 },
      { id: 'seek_fwd', type: 'button', label: '進 5 秒', action: 'seek_fwd', style: 'btn-secondary', col: 3, row: 4, w: 2, h: 1 },
      { id: 'toggle_quote', type: 'button', label: '引文起點', action: 'toggle_quote', style: 'btn-info', col: 1, row: 5, w: 2, h: 1 },
      { id: 'toggle_theme', type: 'button', label: '放映換色', action: 'toggle_theme', style: 'btn-dark', col: 3, row: 5, w: 2, h: 1 },
      { id: 'widget-teleprompter', type: 'widget', col: 1, row: 6, w: 4, h: 2 },
      { id: 'widget-interval', type: 'widget', col: 1, row: 8, w: 4, h: 1 }
    ]
  };

  // 先以降級版面秒開，再從房間拉取動態最新版面
  renderDeck(defaultFallbackLayout);
  connectRelay();

  // 暴露全域調試句柄 (供標準測試與 E2E 驗證)
  window.__AMRTF_MOBILE__ = {
    roomId,
    token,
    hostParam,
    renderDeck,
    sendCommand,
    updateStateDisplay,
    updateUiState: updateStateDisplay, // 向後兼容
    getCurrentLayout: () => currentLayout,
    getCurrentState: () => currentState
  };

})();
