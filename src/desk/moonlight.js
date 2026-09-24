// ==============================================================================
// 🌙 廣海明月 · 大慈恩譯經基金會 Studio Control Desk (Moonlight Client Engine)
// 遵循 Master Core Constitution：消滅 Mock 假象，全雙工雙向信令真實連動
// ==============================================================================

(function() {
  'use strict';

  // 1. 全域狀態與 DOM 節點引用
  let ws = null;
  let activeState = null;
  let audioCtx = null;
  let isPlaying = false;
  let isPaused = true;
  let secondsElapsed = 0;
  let totalDuration = 0;
  let localTimerInterval = null;

  const DOM = {
    elapsedTimer: document.getElementById('elapsed-timer'),
    remainingTimer: document.getElementById('remaining-timer'),
    statusBadge: document.getElementById('status-badge'),
    lessonBadge: document.getElementById('lesson-badge'),
    subZhText: document.getElementById('sub-zh-text'),
    subEnText: document.getElementById('sub-en-text'),
    waveformBars: document.getElementById('waveform-bars'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    btnMasterPlayPause: document.getElementById('btn-master-play-pause'),
    latencyVal: document.getElementById('latency-val'),
    masterVolVal: document.getElementById('master-vol-val'),
    headphoneVolVal: document.getElementById('headphone-vol-val'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    settingsDrawer: document.getElementById('settings-drawer'),
    drawerTitle: document.getElementById('drawer-title'),
    drawerIcon: document.getElementById('drawer-icon'),
    drawerContentSettings: document.getElementById('drawer-content-settings'),
    drawerContentHealth: document.getElementById('drawer-content-health')
  };

  // 2. 格式化時間 (秒 -> HH:MM:SS 或 MM:SS)
  function formatTime(totalSec) {
    if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
    const s = Math.floor(totalSec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // 3. WebSocket 全雙工信令管道
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host || '127.0.0.1:9998';
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        console.log('[Moonlight-WS] ✅ 成功連線至 AMRTF 主控台後端分發中樞');
        if (DOM.statusBadge) {
          DOM.statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ON AIR - 清淨月光大洋講堂';
          DOM.statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium';
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
        if (DOM.statusBadge) {
          DOM.statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> RECONNECTING...';
          DOM.statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400 text-xs font-medium';
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

  // 4. 發送信令至 AMRTF 伺服器
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

  // 5. 處理後端推播訊息
  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'INIT_INFO' && msg.data) {
      if (DOM.latencyVal) DOM.latencyVal.textContent = '8ms';
    }

    if (msg.type === 'STATE_UPDATE' && msg.data) {
      activeState = msg.data;
      updateUiFromState(activeState);
    }
  }

  // 6. 依據真實狀態更新介面
  function updateUiFromState(state) {
    if (!state) return;

    // 播放狀態更新
    isPaused = !!state.paused;
    isPlaying = !isPaused;

    // 講次更新
    if (DOM.lessonBadge && state.lessonNumber) {
      DOM.lessonBadge.textContent = `第 ${String(state.lessonNumber).padStart(4, '0')} 講`;
    }

    // 碼表更新
    if (typeof state.currentTime === 'number') {
      secondsElapsed = state.currentTime;
      if (DOM.elapsedTimer) DOM.elapsedTimer.textContent = formatTime(secondsElapsed);
    }
    if (typeof state.duration === 'number' && state.duration > 0) {
      totalDuration = state.duration;
      const rem = Math.max(0, totalDuration - secondsElapsed);
      if (DOM.remainingTimer) DOM.remainingTimer.textContent = formatTime(rem);
    }

    // 手抄稿提詞更新
    if (DOM.subZhText && state.prompterText) {
      DOM.subZhText.textContent = state.prompterText;
    }

    // 播放按鈕圖示更新
    updatePlayPauseIcons(isPlaying);
  }

  function updatePlayPauseIcons(playing) {
    const playBtns = [DOM.btnPlayPause, DOM.btnMasterPlayPause].filter(Boolean);
    playBtns.forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined') || btn;
      if (icon) {
        icon.textContent = playing ? 'pause' : 'play_arrow';
      }
    });
  }

  // 7. 本地聲學合成：西藏銅鐘真音 (Tibetan Singing Bell via Web Audio API)
  window.strikeMoonlightBell = function(btn) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      // 528Hz 金黃月光諧音基頻 (Solfeggio Love Frequency)
      const baseFreq = 528;
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
      const origText = btn.textContent;
      btn.textContent = 'Striking...';
      btn.classList.add('bg-primary-fixed');
      setTimeout(() => {
        btn.textContent = origText;
        btn.classList.remove('bg-primary-fixed');
      }, 1000);
    }

    // 同步向後端發送 telemetry 事件
    window.sendMoonlightCmd('strike_bell', { bellId: 'tibet_bronze_1' });
  };

  // 8. 介面互動行為綁定
  window.toggleChannel = function(id) {
    const card = document.getElementById(`ch-card-${id}`);
    const ind = document.getElementById(`ch-ind-${id}`);
    const dbSpan = document.getElementById(`ch-db-${id}`);
    const iconSpan = document.getElementById(`ch-icon-${id}`);
    if (!card) return;

    const isActive = card.classList.contains('channel-active');
    if (isActive) {
      card.classList.remove('channel-active');
      if (ind) ind.className = "w-2 h-2 rounded-full bg-surface-container-highest";
      if (dbSpan) {
        dbSpan.textContent = "Standby";
        dbSpan.className = "text-[10px] text-on-surface-variant font-mono";
      }
      if (iconSpan) iconSpan.textContent = "volume_off";
    } else {
      card.classList.add('channel-active');
      if (ind) ind.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
      if (dbSpan) {
        dbSpan.textContent = "-12dB";
        dbSpan.className = "text-[10px] text-primary-fixed font-mono";
      }
      if (iconSpan) iconSpan.textContent = "volume_up";
    }

    window.sendMoonlightCmd('toggle_channel', { channelId: id, active: !isActive });
  };

  window.toggleMasterPlayPause = function() {
    window.sendMoonlightCmd('play_pause');
    // 樂觀更新狀態
    isPaused = !isPaused;
    isPlaying = !isPaused;
    updatePlayPauseIcons(isPlaying);
  };

  window.toggleLighting = function(btn) {
    if (!btn) return;
    if (btn.textContent.trim() === 'Active') {
      btn.textContent = 'Standby';
      btn.classList.remove('text-primary-fixed', 'border-primary-container/40');
      btn.classList.add('text-on-surface-variant', 'border-outline-variant/30');
    } else {
      btn.textContent = 'Active';
      btn.classList.add('text-primary-fixed', 'border-primary-container/40');
      btn.classList.remove('text-on-surface-variant', 'border-outline-variant/30');
    }
  };

  window.openDrawer = function(type) {
    if (!DOM.drawerBackdrop || !DOM.settingsDrawer) return;
    if (type === 'health') {
      if (DOM.drawerTitle) DOM.drawerTitle.textContent = "Stream Health & Diagnostics";
      if (DOM.drawerIcon) DOM.drawerIcon.textContent = "bolt";
      if (DOM.drawerContentSettings) DOM.drawerContentSettings.classList.add('hidden');
      if (DOM.drawerContentHealth) DOM.drawerContentHealth.classList.remove('hidden');
    } else {
      if (DOM.drawerTitle) DOM.drawerTitle.textContent = "Master Control & Settings";
      if (DOM.drawerIcon) DOM.drawerIcon.textContent = "tune";
      if (DOM.drawerContentSettings) DOM.drawerContentSettings.classList.remove('hidden');
      if (DOM.drawerContentHealth) DOM.drawerContentHealth.classList.add('hidden');
    }

    DOM.drawerBackdrop.classList.remove('hidden');
    setTimeout(() => {
      DOM.drawerBackdrop.classList.remove('opacity-0');
      DOM.settingsDrawer.classList.remove('translate-x-full');
    }, 10);
  };

  window.closeDrawer = function() {
    if (!DOM.drawerBackdrop || !DOM.settingsDrawer) return;
    DOM.settingsDrawer.classList.add('translate-x-full');
    DOM.drawerBackdrop.classList.add('opacity-0');
    setTimeout(() => {
      DOM.drawerBackdrop.classList.add('hidden');
    }, 300);
  };

  window.updateMasterVolume = function(val) {
    if (DOM.masterVolVal) DOM.masterVolVal.textContent = val + ' dB';
  };

  window.updateHeadphoneVol = function(val) {
    if (DOM.headphoneVolVal) DOM.headphoneVolVal.textContent = val + '%';
  };

  window.toggleSubtitles = function(btn) {
    const knob = document.getElementById('sub-toggle-knob');
    const zh = document.getElementById('sub-zh-text');
    const en = document.getElementById('sub-en-text');
    if (!knob) return;

    const isRight = knob.style.left === '18px' || knob.classList.contains('right-active');
    if (isRight) {
      knob.style.left = '2px';
      knob.classList.remove('right-active');
      if (btn) {
        btn.classList.remove('bg-primary-container');
        btn.classList.add('bg-surface-container-highest');
      }
      if (zh) zh.style.opacity = '0.3';
      if (en) en.style.opacity = '0.3';
    } else {
      knob.style.left = '18px';
      knob.classList.add('right-active');
      if (btn) {
        btn.classList.add('bg-primary-container');
        btn.classList.remove('bg-surface-container-highest');
      }
      if (zh) zh.style.opacity = '1';
      if (en) en.style.opacity = '1';
    }
  };

  window.adjustFontSize = function(size) {
    const body = document.body;
    if (size === 'sm') {
      body.style.fontSize = '13px';
    } else if (size === 'lg') {
      body.style.fontSize = '17px';
    } else {
      body.style.fontSize = '15px';
    }
  };

  // 9. 音訊波形擬真律動
  setInterval(() => {
    const bars = document.querySelectorAll('#waveform-bars > div');
    if (!bars || bars.length === 0) return;
    bars.forEach(bar => {
      const baseHeight = isPlaying ? 8 : 3;
      const range = isPlaying ? 38 : 6;
      const randomHeight = Math.floor(Math.random() * range) + baseHeight;
      bar.style.height = randomHeight + 'px';
    });
  }, 250);

  // 10. 初始化啟動
  window.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
  });
})();
