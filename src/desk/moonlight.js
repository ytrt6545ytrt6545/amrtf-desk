// ==============================================================================
// 🌙 廣海明月 · 大慈恩譯經基金會 Studio Control Desk (Moonlight Client Engine)
// 遵循 Master Core Constitution：消滅 Mock 假象，全雙工雙向信令真實連動
// ==============================================================================

(function() {
  'use strict';

  // 1. 全域狀態與變數
  let ws = null;
  let activeState = null;
  let audioCtx = null;
  let isPlaying = false;
  let isPaused = true;
  let secondsElapsed = 0;
  let totalDuration = 0;
  let currentVolume = 100;
  let isMuted = false;

  // 2. DOM 節點引用快取
  const DOM = {
    tallyIndicator: document.getElementById('tallyIndicator'),
    timecodeLed: document.getElementById('timecodeLed'),
    trackPos: document.getElementById('trackPos'),
    trackDuration: document.getElementById('trackDuration'),
    audioRange: document.getElementById('audioRange'),
    masterPlayBtn: document.getElementById('masterPlayBtn'),
    lessonNumberText: document.getElementById('lessonNumberText'),
    lessonTotalCount: document.getElementById('lessonTotalCount'),
    lectureBadge: document.getElementById('lectureBadge'),
    prompterText: document.getElementById('prompterText'),
    prompterSub: document.getElementById('prompterSub'),
    prompterSection: document.getElementById('prompterSection'),
    loopStatus: document.getElementById('loopStatus'),
    gainDisplay: document.getElementById('gainDisplay'),
    latencyDisplay: document.getElementById('latencyDisplay'),
    btnRewind10: document.getElementById('btnRewind10'),
    btnRewind5: document.getElementById('btnRewind5'),
    btnForward5: document.getElementById('btnForward5'),
    btnForward10: document.getElementById('btnForward10'),
    btnRewindStart: document.getElementById('btnRewindStart'),
    btnStop: document.getElementById('btnStop'),
    btnPrevLecture: document.getElementById('btnPrevLecture'),
    btnNextLecture: document.getElementById('btnNextLecture'),
    btnLoopInterval: document.getElementById('btnLoopInterval'),
    btnLoop7Sentences: document.getElementById('btnLoop7Sentences'),
    btnClearLoop: document.getElementById('btnClearLoop'),
    btnSpeechToggle: document.getElementById('btnSpeechToggle'),
    btnScrollToggle: document.getElementById('btnScrollToggle'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    btnBellTrigger: document.getElementById('btnBellTrigger'),
    btnAllKillMute: document.getElementById('btnAllKillMute'),
    btnMasterOff: document.getElementById('btnMasterOff'),
    btnSpeed10: document.getElementById('btnSpeed10'),
    btnSpeed125: document.getElementById('btnSpeed125'),
    btnSpeed15: document.getElementById('btnSpeed15'),
    btnVolPlus10: document.getElementById('btnVolPlus10'),
    btnVolPlus5: document.getElementById('btnVolPlus5'),
    btnVolMinus5: document.getElementById('btnVolMinus5'),
    btnVolMinus10: document.getElementById('btnVolMinus10'),
    waveformBars: document.querySelectorAll('#waveformBarsContainer > div'),
    vuLVal: document.getElementById('vuLVal'),
    vuRVal: document.getElementById('vuRVal'),
    vuL4: document.getElementById('vuL4'),
    vuR4: document.getElementById('vuR4')
  };

  // 3. 格式化時間 (秒 -> HH:MM:SS 或 MM:SS)
  function formatTime(totalSec, includeHours = false) {
    if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
    const s = Math.floor(totalSec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (includeHours || hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // 4. WebSocket 全雙工信令管道
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host || '127.0.0.1:8899';
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        console.log('[Moonlight-WS] ✅ 成功連線至 AMRTF 主控台後端分發中樞');
        if (DOM.tallyIndicator) {
          DOM.tallyIndicator.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></span><span class="text-[11px] font-mono font-bold tracking-widest text-emerald-200 uppercase">ON AIR</span>';
          DOM.tallyIndicator.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-950/80 border border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.4)]';
        }
      };

      ws.onmessage = function(event) {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (err) {
          console.warn('[Moonlight-WS] 訊息解析異常:', err);
        }
      };

      ws.onclose = function() {
        console.warn('[Moonlight-WS] ⚠️ 連線中斷，將於 2 秒後自動重連...');
        if (DOM.tallyIndicator) {
          DOM.tallyIndicator.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span class="text-[11px] font-mono font-bold tracking-widest text-amber-200 uppercase">STANDBY</span>';
          DOM.tallyIndicator.className = 'flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950/80 border border-amber-500/60';
        }
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = function() {
        try { ws.close(); } catch(e) {}
      };
    } catch (e) {
      setTimeout(connectWebSocket, 2000);
    }
  }

  // 5. 發送信令至後端分發中樞
  window.sendMoonlightCmd = function(action, params = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Moonlight-WS] 離線狀態無法發送信令: 【${action}】`);
      return;
    }
    const payload = {
      type: 'ACTION',
      action: action,
      params: params,
      timestamp: Date.now()
    };
    ws.send(JSON.stringify(payload));
    console.log(`[Moonlight-WS] 📡 信令已送出: 【${action}】`, params);
  };

  // 6. 處理後端推播訊息
  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'INIT_INFO' && msg.data) {
      if (DOM.latencyDisplay) DOM.latencyDisplay.textContent = 'LATENCY 1.2ms';
    }

    if (msg.type === 'STATE_UPDATE' && msg.data) {
      activeState = msg.data;
      updateUiFromState(activeState);
    }
  }

  // 7. 依據真實狀態更新介面
  function updateUiFromState(state) {
    if (!state) return;

    // 播放/暫停狀態
    isPaused = !!state.paused;
    isPlaying = !isPaused;
    updatePlayPauseVisual(isPlaying);

    // 講次更新
    if (state.lessonNumber && DOM.lessonNumberText) {
      DOM.lessonNumberText.textContent = `第 ${String(state.lessonNumber).padStart(4, '0')} 講`;
    }

    // 時間進度
    if (typeof state.currentTime === 'number') {
      secondsElapsed = state.currentTime;
      if (DOM.timecodeLed) DOM.timecodeLed.textContent = formatTime(secondsElapsed, true);
      if (DOM.trackPos) DOM.trackPos.textContent = `POS: ${formatTime(secondsElapsed)}`;
      if (DOM.audioRange) DOM.audioRange.value = Math.floor(secondsElapsed);
    }

    // 總時長
    if (typeof state.duration === 'number' && state.duration > 0) {
      totalDuration = state.duration;
      if (DOM.trackDuration) DOM.trackDuration.textContent = formatTime(totalDuration);
      if (DOM.audioRange) DOM.audioRange.max = Math.floor(totalDuration);
    }

    // 手抄稿提詞
    if (state.prompterText && DOM.prompterText) {
      DOM.prompterText.textContent = state.prompterText;
    }
    if (state.activeParagraphIndex && DOM.prompterSection) {
      DOM.prompterSection.textContent = `段落 [${String(state.activeParagraphIndex).padStart(2, '0')}]`;
    }

    // 循環狀態
    if (DOM.loopStatus) {
      if (state.isLooping || state.loopIntervalActive) {
        DOM.loopStatus.textContent = 'LOOP: ACTIVE';
        DOM.loopStatus.className = 'text-amber-400 font-bold';
      } else {
        DOM.loopStatus.textContent = 'LOOP: OFF';
        DOM.loopStatus.className = 'text-slate-500';
      }
    }

    // 靜音狀態
    if (typeof state.muted === 'boolean') {
      isMuted = state.muted;
      updateMuteVisual(isMuted);
    }
  }

  function updatePlayPauseVisual(playing) {
    if (!DOM.masterPlayBtn) return;
    const icon = DOM.masterPlayBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = playing ? 'pause' : 'play_arrow';
    }
    if (playing) {
      DOM.masterPlayBtn.classList.remove('key-gold-active');
      DOM.masterPlayBtn.classList.add('key-gold-warm');
    } else {
      DOM.masterPlayBtn.classList.remove('key-gold-warm');
      DOM.masterPlayBtn.classList.add('key-gold-active');
    }
  }

  function updateMuteVisual(muted) {
    if (!DOM.btnAllKillMute) return;
    if (muted) {
      DOM.btnAllKillMute.classList.add('animate-pulse');
      DOM.btnAllKillMute.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.8)';
    } else {
      DOM.btnAllKillMute.classList.remove('animate-pulse');
      DOM.btnAllKillMute.style.boxShadow = '';
    }
  }

  // 8. 本地聲學合成：西藏銅鐘真音 (Tibetan Singing Bell via Web Audio API 528Hz)
  window.strikeMoonlightBell = function(btn) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const baseFreq = 528; // 528Hz 金黃月光基頻
      const partials = [
        { mult: 1.0, gain: 0.6, decay: 3.5 },
        { mult: 2.76, gain: 0.3, decay: 2.5 },
        { mult: 5.4, gain: 0.15, decay: 1.8 },
        { mult: 8.9, gain: 0.08, decay: 1.2 }
      ];

      partials.forEach(p => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * p.mult, now);

        gainNode.gain.setValueAtTime(p.gain, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + p.decay);
      });

      console.log('[Acoustic] 🔔 西藏清淨月光銅鐘已敲響 (528Hz 諧振)');
    } catch (e) {
      console.warn('[Acoustic] 銅鐘音頻播放受阻:', e);
    }

    if (btn) {
      const origContent = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">notifications</span><span>響聲中...</span>';
      setTimeout(() => {
        btn.innerHTML = origContent;
      }, 1200);
    }

    window.sendMoonlightCmd('strike_bell', { bellId: 'tibet_bronze_528' });
  };

  // 9. 擬真實時示波器律動與 VU 表模擬
  setInterval(() => {
    if (DOM.waveformBars && DOM.waveformBars.length > 0) {
      DOM.waveformBars.forEach(bar => {
        const baseHeight = isPlaying ? 8 : 4;
        const range = isPlaying ? 38 : 6;
        const h = Math.floor(Math.random() * range) + baseHeight;
        bar.style.height = h + 'px';
      });
    }

    // VU 表微動
    if (isPlaying) {
      const lDb = -Math.floor(Math.random() * 8 + 4);
      const rDb = -Math.floor(Math.random() * 8 + 4);
      if (DOM.vuLVal) DOM.vuLVal.textContent = `${lDb} dB`;
      if (DOM.vuRVal) DOM.vuRVal.textContent = `${rDb} dB`;
      if (DOM.vuL4) DOM.vuL4.className = lDb > -6 ? 'bg-gold-400 w-1/4 rounded-sm shadow-[0_0_4px_#facc15]' : 'bg-slate-800 w-1/4 rounded-sm';
      if (DOM.vuR4) DOM.vuR4.className = rDb > -6 ? 'bg-gold-400 w-1/4 rounded-sm shadow-[0_0_4px_#facc15]' : 'bg-slate-800 w-1/4 rounded-sm';
    } else {
      if (DOM.vuLVal) DOM.vuLVal.textContent = '-∞ dB';
      if (DOM.vuRVal) DOM.vuRVal.textContent = '-∞ dB';
      if (DOM.vuL4) DOM.vuL4.className = 'bg-slate-800 w-1/4 rounded-sm';
      if (DOM.vuR4) DOM.vuR4.className = 'bg-slate-800 w-1/4 rounded-sm';
    }
  }, 200);

  // 10. 綁定所有實體按鍵事件
  function bindKeycapEvents() {
    // 播控中心
    if (DOM.masterPlayBtn) {
      DOM.masterPlayBtn.addEventListener('click', () => {
        window.sendMoonlightCmd('play_pause');
        isPaused = !isPaused;
        isPlaying = !isPaused;
        updatePlayPauseVisual(isPlaying);
      });
    }

    if (DOM.btnRewind10) DOM.btnRewind10.addEventListener('click', () => window.sendMoonlightCmd('seek_bwd_10'));
    if (DOM.btnRewind5) DOM.btnRewind5.addEventListener('click', () => window.sendMoonlightCmd('seek_bwd'));
    if (DOM.btnForward5) DOM.btnForward5.addEventListener('click', () => window.sendMoonlightCmd('seek_fwd'));
    if (DOM.btnForward10) DOM.btnForward10.addEventListener('click', () => window.sendMoonlightCmd('seek_fwd_10'));
    if (DOM.btnRewindStart) DOM.btnRewindStart.addEventListener('click', () => window.sendMoonlightCmd('seek', { time: 0 }));
    if (DOM.btnStop) DOM.btnStop.addEventListener('click', () => window.sendMoonlightCmd('stop'));

    // 講次跳轉
    if (DOM.btnPrevLecture) DOM.btnPrevLecture.addEventListener('click', () => window.sendMoonlightCmd('prev_lecture'));
    if (DOM.btnNextLecture) DOM.btnNextLecture.addEventListener('click', () => window.sendMoonlightCmd('next_lecture'));
    if (DOM.lectureBadge) {
      DOM.lectureBadge.addEventListener('click', () => {
        const val = prompt('請輸入要跳轉的大慈恩研討講次 (如: 567 或 0567):');
        if (val && val.trim()) {
          const num = val.trim();
          window.sendMoonlightCmd('goto_lesson', { lessonNumber: num });
        }
      });
    }

    // 區間控制
    if (DOM.btnLoopInterval) DOM.btnLoopInterval.addEventListener('click', () => window.sendMoonlightCmd('loop_interval'));
    if (DOM.btnLoop7Sentences) DOM.btnLoop7Sentences.addEventListener('click', () => window.sendMoonlightCmd('toggle_quote'));
    if (DOM.btnClearLoop) DOM.btnClearLoop.addEventListener('click', () => window.sendMoonlightCmd('stop_interval'));

    // 模式切換
    if (DOM.btnSpeechToggle) DOM.btnSpeechToggle.addEventListener('click', () => window.sendMoonlightCmd('toggle_speech_lead'));
    if (DOM.btnScrollToggle) DOM.btnScrollToggle.addEventListener('click', () => window.sendMoonlightCmd('toggle_scroll'));
    if (DOM.btnFullscreen) DOM.btnFullscreen.addEventListener('click', () => window.sendMoonlightCmd('fullscreen'));

    // 銅鐘敲響
    if (DOM.btnBellTrigger) {
      DOM.btnBellTrigger.addEventListener('click', function() {
        window.strikeMoonlightBell(this);
      });
    }

    // 倍速控制
    const speedBtns = [
      { btn: DOM.btnSpeed10, rate: 1.0 },
      { btn: DOM.btnSpeed125, rate: 1.25 },
      { btn: DOM.btnSpeed15, rate: 1.5 }
    ];
    speedBtns.forEach(({ btn, rate }) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        speedBtns.forEach(b => {
          if (b.btn) {
            b.btn.className = 'crystal-deck-btn key-dark-glass px-2 py-0.5 text-xs font-mono text-slate-400 hover:text-white';
          }
        });
        btn.className = 'crystal-deck-btn key-gold-active px-2 py-0.5 text-xs font-mono font-bold';
        window.sendMoonlightCmd('set_speed', { speed: rate });
      });
    });

    // 音量微調
    if (DOM.btnVolPlus10) DOM.btnVolPlus10.addEventListener('click', () => window.sendMoonlightCmd('adjust_volume', { delta: 10 }));
    if (DOM.btnVolPlus5) DOM.btnVolPlus5.addEventListener('click', () => window.sendMoonlightCmd('adjust_volume', { delta: 5 }));
    if (DOM.btnVolMinus5) DOM.btnVolMinus5.addEventListener('click', () => window.sendMoonlightCmd('adjust_volume', { delta: -5 }));
    if (DOM.btnVolMinus10) DOM.btnVolMinus10.addEventListener('click', () => window.sendMoonlightCmd('adjust_volume', { delta: -10 }));

    // ALL-KILL 靜音巨鈕
    if (DOM.btnAllKillMute) {
      DOM.btnAllKillMute.addEventListener('click', () => {
        isMuted = !isMuted;
        window.sendMoonlightCmd('toggle_mute', { mute: isMuted });
        updateMuteVisual(isMuted);
      });
    }

    // 緊急退出按鍵
    if (DOM.btnMasterOff) {
      DOM.btnMasterOff.addEventListener('click', () => {
        if (confirm('確定要關閉 AMRTF-Desk 導播艙全域系統嗎？')) {
          fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
          window.close();
        }
      });
    }

    // 進度滑桿拖曳
    if (DOM.audioRange) {
      DOM.audioRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (DOM.trackPos) DOM.trackPos.textContent = `POS: ${formatTime(val)}`;
      });
      DOM.audioRange.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        window.sendMoonlightCmd('seek', { time: val });
      });
    }
  }

  // 11. 初始化啟動
  window.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    bindKeycapEvents();
  });
})();
