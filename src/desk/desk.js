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
  btnThemeToggle.addEventListener('click', () => sendCmd('set_theme'));
  btnFontLarger.addEventListener('click', () => sendCmd('adjust_font_size', { delta: 2 }));
  btnFontSmaller.addEventListener('click', () => sendCmd('adjust_font_size', { delta: -2 }));
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

  // QR Code (採用真實本機區域網路 IP，手機在同 Wi-Fi 掃碼即連！)
  btnQrCode.addEventListener('click', () => {
    const port = window.location.port || '9998';
    const hostIp = (currentLanIp && currentLanIp !== '127.0.0.1' && currentLanIp !== 'localhost') ? currentLanIp : window.location.hostname;
    const mobileUrl = `http://${hostIp}:${port}/mobile`;
    qrUrlText.textContent = mobileUrl;
    // 使用輕量 QR API 產生
    qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(mobileUrl);
    qrModal.classList.add('active');
  });

  btnCloseQr.addEventListener('click', () => {
    qrModal.classList.remove('active');
  });

  // 退出按鈕 (全域優雅關閉)
  const btnExit = document.getElementById('btnExit');
  if (btnExit) {
    btnExit.addEventListener('click', () => {
      if (confirm('確定要關閉大慈恩研討播控艙嗎？')) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'SHUTDOWN' }));
        }
        setTimeout(() => window.close(), 300);
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

    // 播放狀態 (綠 / 琥珀)
    isPlaying = !!state.isPlaying;
    if (isPlaying) {
      btnPlayPause.textContent = '⏸';
      btnPlayPause.classList.add('playing');
      statusBadge.textContent = '● LIVE';
      statusBadge.classList.add('live');
    } else {
      btnPlayPause.textContent = '▶';
      btnPlayPause.classList.remove('playing');
      statusBadge.textContent = '● READY';
      statusBadge.classList.remove('live');
    }

    // 碼表與倍速
    ledClock.textContent = (state.currentTimeStr || '00:00') + ' / ' + (state.totalTimeStr || '00:00');
    if (state.playbackRate) {
      speedBadge.textContent = `${state.playbackRate}x`;
      btnRate10.classList.toggle('active', state.playbackRate === 1.0);
      btnRate125.classList.toggle('active', state.playbackRate === 1.25);
      btnRate15.classList.toggle('active', state.playbackRate === 1.5);
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
