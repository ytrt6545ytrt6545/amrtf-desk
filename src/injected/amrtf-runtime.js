// ==============================================================================
// 📦 AMRTF 放映艙原生注入核心 (Injected Full Runtime)
// ==============================================================================
// 完整整合原廠 Companion 模組所有 Actions 與 DOM 控制器
// ==============================================================================

(function () {
  if (window.__AMRTF_INJECTED_READY__) return;
  window.__AMRTF_INJECTED_READY__ = true;

  console.log('[AMRTF-Desk] 原生放映艙全功能注入核心已就緒 (v1.2.0-Pro)');

  // 🛡️ 護欄三：全域靜默吸收大慈恩官方暫態 Alert（徹底根除「音檔仍在準備中...」系統模態彈窗）
  try {
    const rawAlert = window.alert;
    window.alert = function (msg) {
      if (typeof msg === 'string' && (msg.includes('準備中') || msg.includes('首播期間') || msg.includes('無播稿資訊'))) {
        console.warn('[AMRTF-Desk] 已靜默吸收官方暫態警告彈窗:', msg);
        return;
      }
      return rawAlert.apply(this, arguments);
    };
  } catch (e) {}

  // 🛡️ 護欄二：預寫 LocalStorage（大慈恩官方播放器初始化時將自動讀取持續捲動模式）
  try {
    localStorage.setItem('amrtf_autoscroll', JSON.stringify('1'));
  } catch (e) {}

  // 🛡️ 護欄四：劫持並校準官方 startAutoScroll（音訊未按播放或到達區間終點時，強制 play=false 紋絲不動）
  let internalStartAutoScroll = window.startAutoScroll;
  try {
    Object.defineProperty(window, 'startAutoScroll', {
      configurable: true,
      enumerable: true,
      get() {
        return function (audio_time_start, play) {
          const audio = getAudio();
          // 若音訊處於暫停/結束狀態，或區間播映已結束，強制拒絕滾動遞迴並清除動畫！
          if ((audio && (audio.paused || audio.ended)) || (intervalConfig && !intervalConfig.enabled && isIntervalStoppedJustNow)) {
            play = false;
            freezeScroll();
            return;
          }

          // 官方原生 startAutoScroll 自然推進
          if (typeof internalStartAutoScroll === 'function') {
            return internalStartAutoScroll.call(this, audio_time_start, play);
          }
        };
      },
      set(fn) {
        internalStartAutoScroll = fn;
      }
    });
  } catch (e) {}

  let statusThrottleTimer = null;
  let loopConfig = { enabled: false, start: 0, end: 0, type: 'none' };
  let intervalConfig = { enabled: false, start: 0, end: 0, loop: false };
  let isIntervalStoppedJustNow = false;
  let intervalPollTimer = null;
  let scrollModes = ['手動', '持續', '區段'];

  // 解析當前手抄稿所有「段落結尾」秒數時間標記 (嚴格排除逐字短句，只取大慈恩官方每段末尾的標籤)
  function getParagraphTimeMarkers() {
    // 大慈恩官方段落標籤核心為 span.seek-to（帶有 data-label 與 data-time）或段落跳轉標籤 a.mvt（帶有 data-t）
    // 嚴格排除 span.lrc 與逐字句字幕標籤（data-s），避免產生 00:01, 00:02 等極碎時間
    const elements = Array.from(document.querySelectorAll('span.seek-to[data-time], a.mvt[data-t], span.seek-to[data-label]'));
    const map = new Map();
    for (const el of elements) {
      const rawTime = el.getAttribute('data-time') || el.getAttribute('data-t');
      const label = el.getAttribute('data-label') || el.textContent.trim();
      const sec = parseFloat(rawTime);
      if (!isNaN(sec) && sec >= 0) {
        const rounded = Math.round(sec);
        if (!map.has(rounded)) {
          const m = label && label.match(/\d{1,2}:\d{2}/) ? label.match(/\d{1,2}:\d{2}/)[0] : formatTime(rounded);
          map.set(rounded, m);
        }
      }
    }
    if (!map.has(0)) map.set(0, '00:00');
    return Array.from(map.entries())
      .map(([sec, label]) => ({ sec, label }))
      .sort((a, b) => a.sec - b.sec);
  }

  function getAudio() {
    return document.querySelector('audio');
  }

  function getLessonNumber() {
    const metaVol = document.querySelector('meta[name="volume"]');
    if (metaVol && metaVol.content) return metaVol.content;
    const bodyVol = document.body?.getAttribute('data-volume');
    if (bodyVol) return bodyVol;
    const match = window.location.pathname.match(/-(\d+)\/?$/);
    return match ? match[1] : '';
  }

  function getLessonTitle() {
    const entryTitle = document.querySelector('h1.entry-title, h2.entry-title, h1.page-title');
    if (entryTitle && entryTitle.textContent.trim()) {
      return entryTitle.textContent.trim();
    }
    return document.title.split('-')[0].trim();
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function parseTimeToSeconds(str) {
    if (str === null || str === undefined || str === '') return 0;
    if (typeof str === 'number') return str;
    const clean = String(str).trim().replace(/^#/, '');
    if (clean.includes(':') || clean.includes('：')) {
      const parts = clean.split(/[:：]/).map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  // 取得頁面中所有師父開示引文區塊的時間範圍清單
  function getAllMasterAudioRanges() {
    const ranges = [];

    // 1. 優先匹配現代大慈恩 blockquote 內的 LRC 逐字字幕標籤 (data-s / data-e)
    const blockquotes = document.querySelectorAll('blockquote');
    for (const bq of blockquotes) {
      const lrcSpans = bq.querySelectorAll('span[data-s], span.lrc, span.seek-to');
      if (lrcSpans.length > 0) {
        let bStart = Infinity;
        let lastSpan = null;
        lrcSpans.forEach(span => {
          const s = parseFloat(span.getAttribute('data-s') || '0');
          if (!isNaN(s) && s > 0 && s < bStart) bStart = s;
          lastSpan = span;
        });

        if (lastSpan && bStart < Infinity) {
          const lastS = parseFloat(lastSpan.getAttribute('data-s') || '0');
          const lastE = parseFloat(lastSpan.getAttribute('data-e') || '0');
          let bEnd = 0;

          if (!isNaN(lastE) && lastE > lastS) {
            // 若官方標註最後一句間隔 > 3.0s (含大量空白與下段開頭)，緊縮在講完後 +2.5s
            if (lastE - lastS > 3.0) {
              bEnd = Math.min(lastE - 1.5, lastS + 2.5);
            } else {
              // 一般句子提早 0.6 秒在尾部微靜音處俐落結算，防範 timeupdate 250ms 滯後吃進下一句
              bEnd = Math.max(lastS + 1.0, lastE - 0.6);
            }
          } else {
            bEnd = lastS + 2.0;
          }

          if (bEnd > bStart) {
            ranges.push({ start: bStart, end: bEnd });
          }
        }
      }
    }

    // 2. 次級匹配：若無 blockquote，尋找帶有 .scripture-fangsong、.quote、.citation 的區塊
    if (ranges.length === 0) {
      const quoteContainers = document.querySelectorAll('.scripture-fangsong, .quote, .citation');
      for (const qc of quoteContainers) {
        const lrcSpans = qc.querySelectorAll('span[data-s], span.lrc');
        if (lrcSpans.length > 0) {
          let bStart = Infinity;
          let lastSpan = null;
          lrcSpans.forEach(span => {
            const s = parseFloat(span.getAttribute('data-s') || '0');
            if (!isNaN(s) && s > 0 && s < bStart) bStart = s;
            lastSpan = span;
          });
          if (lastSpan && bStart < Infinity) {
            const lastS = parseFloat(lastSpan.getAttribute('data-s') || '0');
            const lastE = parseFloat(lastSpan.getAttribute('data-e') || '0');
            let bEnd = (!isNaN(lastE) && lastE > lastS) ? Math.max(lastS + 1.0, lastE - 0.6) : lastS + 2.0;
            if (bEnd > bStart) {
              ranges.push({ start: bStart, end: bEnd });
            }
          }
        }
      }
    }

    // 3. Fallback：向下相容舊版靜態文字標註 (如包含 #時間戳 的超連結或「錄音起訖」)
    if (ranges.length === 0) {
      const links = document.querySelectorAll('a[href*="#"]');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent || '';
        if (text.includes('師父開示') || text.includes('錄音起訖') || a.classList.contains('audio-record')) {
          const timeMatch = href.match(/#(\d+[:：]\d+)/);
          if (timeMatch) {
            const start = parseTimeToSeconds(timeMatch[1]);
            if (start > 0) ranges.push({ start, end: start + 60 });
            break;
          }
        }
      }
    }

    if (ranges.length === 0) {
      const spans = document.querySelectorAll('span, p, div');
      for (const s of spans) {
        const t = s.textContent || '';
        const m = t.match(/錄音起訖[：:\s]*(\d{1,2}[:：]\d{2})\s*[-~～至]\s*(\d{1,2}[:：]\d{2})/);
        if (m) {
          const start = parseTimeToSeconds(m[1]);
          const end = parseTimeToSeconds(m[2]);
          if (start > 0) ranges.push({ start, end });
          break;
        }
      }
    }

    return ranges.sort((a, b) => a.start - b.start);
  }

  // 取得目標引文區間（支援多段引文順序切換）
  function parseMasterAudioRange(currentTime = 0) {
    const ranges = getAllMasterAudioRanges();
    if (ranges.length === 0) return { start: 0, end: 0 };
    if (ranges.length === 1) return ranges[0];

    // 多段引文時，優先尋找下一個未到達的引文起點（跳躍門檻留 1 秒緩衝）
    const nextRange = ranges.find(r => r.start > currentTime + 1);
    if (nextRange) return nextRange;

    // 若全部引文都已播過，循環回第 1 段
    return ranges[0];
  }

  // 取得當前播放點的前 N 句與後 M 句完整語音區間 (預設前 3 句、後 3 句)
  function getSurroundingSentenceRange(currentTime, beforeCount = 3, afterCount = 3) {
    const lrcList = Array.from(document.querySelectorAll('span.lrc, span[data-s], span.seek-to'));
    if (lrcList.length === 0) {
      return {
        start: Math.max(0, currentTime - 10),
        end: currentTime + 15
      };
    }

    // 找出當前播放時間對應的字幕短句索引
    let curIndex = -1;
    for (let i = 0; i < lrcList.length; i++) {
      const s = parseFloat(lrcList[i].getAttribute('data-s') || '0');
      const e = parseFloat(lrcList[i].getAttribute('data-e') || '999999');
      if (currentTime >= s && currentTime <= e) {
        curIndex = i;
        break;
      }
      if (s > currentTime) {
        curIndex = Math.max(0, i - 1);
        break;
      }
    }
    if (curIndex === -1) {
      curIndex = lrcList.length - 1;
    }

    // 前兩句與後兩句的邊界索引
    const startIndex = Math.max(0, curIndex - beforeCount);
    const endIndex = Math.min(lrcList.length - 1, curIndex + afterCount);

    const startSpan = lrcList[startIndex];
    const endSpan = lrcList[endIndex];

    const start = parseFloat(startSpan.getAttribute('data-s') || '0');
    const lastS = parseFloat(endSpan.getAttribute('data-s') || '0');
    const lastE = parseFloat(endSpan.getAttribute('data-e') || '0');

    let end = 0;
    if (!isNaN(lastE) && lastE > lastS) {
      if (lastE - lastS > 3.0) {
        end = Math.min(lastE - 1.0, lastS + 2.5);
      } else {
        end = Math.max(lastS + 1.0, lastE - 0.4);
      }
    } else {
      end = lastS + 2.5;
    }

    return {
      start,
      end: Math.max(start + 2.0, end)
    };
  }

  // 取得手抄稿大段落結尾跳轉標記 (黃金大段落選單 · 實測 22 個官方段落)
  let cachedParagraphMarkers = null;
  function getParagraphTimeMarkers() {
    if (cachedParagraphMarkers && cachedParagraphMarkers.length >= 5) {
      return cachedParagraphMarkers;
    }

    const markers = [];
    const seenSec = new Set();

    // 00:00 起點必備
    markers.push({ sec: 0, label: '00:00 (起點)' });
    seenSec.add(0);

    // 鎖定手抄稿段落結尾的跳轉標籤: a.mvt[data-time], a.mvt-seekto[data-time], span.seek-to[data-time]
    const elements = document.querySelectorAll('a.mvt[data-time], a.mvt-seekto[data-time], span.seek-to[data-time]');
    elements.forEach(el => {
      const raw = el.getAttribute('data-time') || el.textContent;
      const sec = Math.round(parseFloat(raw) || 0);
      const text = el.textContent.trim();
      // 排除空錨點，只取有文字標示之段落結尾跳轉標籤
      if (sec > 0 && text && !seenSec.has(sec)) {
        seenSec.add(sec);
        markers.push({
          sec: sec,
          label: `${formatTime(sec)} (段落)`
        });
      }
    });

    markers.sort((a, b) => a.sec - b.sec);
    if (markers.length >= 5) {
      cachedParagraphMarkers = markers;
    }
    return markers;
  }

  // 持續性段落感知哨：一旦大慈恩官方 20+ 段落 DOM 渲染完成，立即自動推播操作艙
  const paragraphSentryTimer = setInterval(() => {
    const list = getParagraphTimeMarkers();
    if (list && list.length >= 5) {
      clearInterval(paragraphSentryTimer);
      console.log(`[AMRTF-Desk] 手抄稿 ${list.length} 個黃金段落已載入完畢，即刻推播操作艙！`);
      notifyStateUpdate();
    }
  }, 400);

  function getCurrentSubtitle(currentTime) {
    const lrcSpans = Array.from(document.querySelectorAll('span.seek-to, span[data-s], span.lrc'));
    if (lrcSpans.length > 0) {
      let currentSpan = null;
      for (let i = 0; i < lrcSpans.length; i++) {
        const s = lrcSpans[i];
        const t = s.hasAttribute('data-time') ? parseTimeToSeconds(s.getAttribute('data-time')) : parseFloat(s.getAttribute('data-s') || '0');
        if (!isNaN(t) && t <= currentTime + 0.5) {
          currentSpan = s;
        } else if (!isNaN(t) && t > currentTime + 0.5) {
          break;
        }
      }
      if (currentSpan) {
        const p = currentSpan.closest('p') || currentSpan;
        return p.textContent.trim();
      }
    }
    const activeP = document.querySelector('.entry-content p.speaking, .entry-content p.active');
    if (activeP) return activeP.textContent.trim();
    return '';
  }

  // 回報最新狀態
  function notifyStateUpdate() {
    const audio = getAudio();
    const currentTime = audio ? audio.currentTime : 0;
    const duration = audio && !isNaN(audio.duration) ? audio.duration : 0;
    const isPlaying = audio ? !audio.paused && !audio.ended : false;
    const playbackRate = audio ? audio.playbackRate : 1.0;

    const isLight = document.body.classList.contains('amec_theme') ||
                    document.querySelector('input[name="bottom_toolbar_theme"]:checked')?.value === '1';

    const scrollModeChecked = document.querySelector('input[name="bottom_toolbar_autoscroll"]:checked');
    const scrollMode = scrollModeChecked ? parseInt(scrollModeChecked.value, 10) : 0;

    const speechModeInput = document.getElementById('bottom_toolbar_speechmode');
    const speechMode = speechModeInput ? speechModeInput.checked : false;

    const fontSlider = document.getElementById('setFontSlider');
    const fontSize = fontSlider ? parseFloat(fontSlider.value) : 16;

    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const masterRange = parseMasterAudioRange();
    const subtitle = getCurrentSubtitle(currentTime);
    const hasLrc = (window.jQuery ? window.jQuery('span.lrc').length > 0 : false) || document.querySelectorAll('span.lrc').length > 0;

    const payload = {
      type: 'STATE_UPDATE',
      data: {
        lessonNumber: getLessonNumber(),
        lessonTitle: getLessonTitle(),
        isPlaying,
        currentTime: Math.round(currentTime * 10) / 10,
        currentTimeStr: formatTime(currentTime),
        duration: Math.round(duration * 10) / 10,
        totalTimeStr: formatTime(duration),
        playbackRate,
        theme: isLight ? 'light' : 'dark',
        scrollMode,
        scrollModeLabel: scrollModes[scrollMode] || '手動',
        speechMode,
        hasLrc,
        fontSize,
        isFullscreen,
        looping: loopConfig.enabled,
        loopType: loopConfig.type,
        interval: intervalConfig,
        markers: getParagraphTimeMarkers(),
        masterRange,
        currentSubtitle: subtitle,
        volume: audio ? Math.round(audio.volume * 100) : 100,
        muted: audio ? !!audio.muted : false,
      }
    };

    console.log('__AMRTF_STATE__:' + JSON.stringify(payload.data));
  }

  function scheduleStateUpdate() {
    if (statusThrottleTimer) return;
    statusThrottleTimer = setTimeout(() => {
      statusThrottleTimer = null;
      notifyStateUpdate();
    }, 150);
  }

  // 🛑 急煞定格機制：徹底中斷 jQuery 滾動動畫與所有非同步計時器，防範音訊停了畫面繼續往下跑
  function freezeScroll() {
    try {
      // 1. 徹底清空 jQuery 所有動畫佇列 (清除 queue 並立即停止當前動畫)
      if (window.jQuery) {
        window.jQuery('html, body').stop(true, false);
        window.jQuery('*').stop(true, false);
      }
      // 2. 清除大慈恩官方所有滾動定時器
      if (window.stepScrollTimer) {
        clearTimeout(window.stepScrollTimer);
        window.stepScrollTimer = null;
      }
      if (window.lrcTimer) {
        clearTimeout(window.lrcTimer);
        window.lrcTimer = null;
      }
      if (window.lrcNextTimer) {
        clearTimeout(window.lrcNextTimer);
        window.lrcNextTimer = null;
      }
    } catch (e) {}
  }

  // ⏱️ 高精細區間急煞哨兵（20ms 高頻掃描，徹底消滅 HTML5 timeupdate 250ms 滯後引發的「跑出下一段1秒雜音」）
  function checkIntervalTick() {
    if (!intervalConfig.enabled || intervalConfig.end <= intervalConfig.start) return;
    const audio = getAudio();
    if (!audio) return;
    const cur = audio.currentTime;
    // 提早 0.25 秒在句尾靜音處俐落結算，杜絕瀏覽器解碼管線吃進下一個段落首音！
    const threshold = Math.max(intervalConfig.start + 0.5, intervalConfig.end - 0.25);

    if (cur >= threshold) {
      if (intervalConfig.loop) {
        audio.currentTime = intervalConfig.start;
        audio.play().catch(() => {});
      } else {
        isIntervalStoppedJustNow = true;
        intervalConfig.enabled = false;
        if (intervalPollTimer) {
          clearInterval(intervalPollTimer);
          intervalPollTimer = null;
        }
        freezeScroll();
        doPause();
        audio.currentTime = intervalConfig.end;
        freezeScroll();
        // 連續多重波次急煞，徹底中斷原生非同步完成回呼與 jQuery 緩衝動畫
        setTimeout(freezeScroll, 50);
        setTimeout(freezeScroll, 150);
        setTimeout(freezeScroll, 300);
        setTimeout(() => {
          isIntervalStoppedJustNow = false;
        }, 800);
      }
      scheduleStateUpdate();
    }
  }

  // ==============================================================================
  // 🎯 方案 A：動態視口中央鎖定哨兵 (Dynamic Center-Lock Sentinel)
  // 解決字體過大時，當前播講反黑文字沉入視窗底部、被遮蔽或超出螢幕之排版幾何問題
  // ==============================================================================
  let lastCenterLockTime = 0;
  let userManualScrollUntil = 0;

  // 監聽操作員手動滾輪與觸控，若操作員正在翻閱，短暫讓位 3 秒避免搶奪控制權
  if (typeof window !== 'undefined') {
    window.addEventListener('wheel', () => {
      userManualScrollUntil = Date.now() + 3000;
    }, { passive: true });
    window.addEventListener('touchmove', () => {
      userManualScrollUntil = Date.now() + 3000;
    }, { passive: true });
  }

  // 官方原生播稿自然滾動引導（拔除外來自創煞車與強制 scrollIntoView）
  function syncActiveSpanCenterLock(curTime) {
    // 100% 尊重大慈恩官方原生播稿引擎滾動，絕不外加任何截斷或置中干擾
  }

  // 監聽 Audio 事件
  function bindAudio() {
    const audio = getAudio();
    if (!audio) {
      setTimeout(bindAudio, 500);
      return;
    }
    audio.addEventListener('play', () => {
      // 操作員主動按下播放時，若處於持續/區段模式，觸發平滑同步捲動
      if (typeof window.startAutoScroll === 'function') {
        const checked = document.querySelector('input[name="bottom_toolbar_autoscroll"]:checked');
        if (checked && (checked.value === '1' || checked.value === '2')) {
          window.startAutoScroll(audio.currentTime, true);
        }
      }
      scheduleStateUpdate();
    });
    audio.addEventListener('pause', () => {
      // 操作員暫停時立即定格，中斷任何滾動動畫
      if (intervalPollTimer) {
        clearInterval(intervalPollTimer);
        intervalPollTimer = null;
      }
      freezeScroll();
      scheduleStateUpdate();
    });

    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime;

      // 1. 處理區間精準播映結算
      checkIntervalTick();

      // 2. 處理引文與段落微循環
      if (loopConfig.enabled && loopConfig.end > loopConfig.start) {
        if (cur >= loopConfig.end) {
          audio.currentTime = loopConfig.start;
          audio.play().catch(() => {});
        }
      }

      scheduleStateUpdate();
    });
    audio.addEventListener('ratechange', scheduleStateUpdate);
    scheduleStateUpdate();
  }
  bindAudio();

  // ==============================================================================
  // 🚀 開機自律引擎：鎖定「播稿模式 ON」與「持續捲動」為啟動預設狀態 (含音訊就緒防護閘門)
  // ==============================================================================
  function enforceStartupDefaults() {
    let attempts = 0;
    let cachedMarkerCount = 0;
    let startupSpeechDone = false;
    const maxAttempts = 50; // 50 * 150ms ≈ 7.5 秒高頻守護，防範 DOM 與 Audio CDN 非同步延遲

    // 🛡️ 校正 localStorage 舊版超標髒數據（防止官方 AJAX 成功時從 localStorage 重設為 40/60 導致異常）
    try {
      const rawStored = localStorage.getItem('amrtf_fontsize2');
      if (rawStored) {
        const parsed = parseFloat(rawStored.replace(/["']/g, ''));
        if (parsed > 22 || parsed < 10) {
          localStorage.setItem('amrtf_fontsize2', JSON.stringify("16"));
          const slider = document.getElementById('setFontSlider');
          if (slider) slider.value = 16;
        }
      }
    } catch (e) {}
    const intervalId = setInterval(() => {
      attempts++;
      let speechDone = false;
      let scrollDone = false;

      // 0. 手抄稿段落感知哨：一旦偵測到內文 23+ 段落完成渲染，立即增量推播
      const curMarkers = getParagraphTimeMarkers();
      if (curMarkers.length > cachedMarkerCount) {
        cachedMarkerCount = curMarkers.length;
        scheduleStateUpdate();
      }

      // 0.1 注入【觀眾純淨放映護盾】(隱藏頂部播放條、右側捲軸、乾擾公告，保留純淨手抄稿文字)
      if (!document.getElementById('amrtf-screen-purity-shield')) {
        const tag = document.createElement('style');
        tag.id = 'amrtf-screen-purity-shield';
        tag.textContent = `
          /* 1. 徹底消滅原生垂直與水平捲軸，保留平滑滾動功能給觀眾最乾淨畫面 */
          html, body {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          html::-webkit-scrollbar, body::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }

          /* 2. 徹底隱藏頂部原生音訊播放條與時間條 (移出可視區但保留 DOM 結構供 JS 點火) */
          #audio-player-container, .mejs-container, .mejs-controls, .mejs-time-rail, .mejs-time, .mejs-playpause-button {
            position: fixed !important;
            top: -9999px !important;
            left: -9999px !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
          }

          /* 3. 隱藏左下角或右上角公告與提示徽章 */
          #omw-announcement, .omw-announcement-btn, .modal-backdrop, .fixed-notice, .announcement-badge, .site-notice {
            display: none !important;
            visibility: hidden !important;
          }

          /* 4. 手抄稿閱讀區域純淨置頂 (不需為頂部播放條預留 90px 空白) */
          body, #page, .entry-content, .reading-content {
            padding-top: 24px !important;
            padding-bottom: 160px !important;
          }

          /* 5. 劇院全螢幕放映時，外層與劇院層全面禁止捲軸溢出 */
          html.amrtf-theater-active, body.amrtf-theater-active {
            overflow: hidden !important;
            scrollbar-width: none !important;
          }
          html.amrtf-theater-active::-webkit-scrollbar, body.amrtf-theater-active::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          #amrtf-theater-overlay {
            overflow: hidden !important;
          }
        `;
        document.head.appendChild(tag);
      }

      // 1. 播稿模式開關 (Speech Mode -> 長官指示：載入成功後檢查播稿是否開啟，沒有開啟幫忙開啟，然後真實反映狀態)
      const speechInput = document.getElementById('bottom_toolbar_speechmode');
      if (speechInput) {
        // 掛載雙向監聽器，一旦網頁端變動立即推播
        if (!speechInput.__amrtf_speech_bound) {
          speechInput.__amrtf_speech_bound = true;
          speechInput.addEventListener('change', () => scheduleStateUpdate());
          speechInput.addEventListener('input', () => scheduleStateUpdate());
        }

        const hasLrc = (window.jQuery ? window.jQuery('span.lrc').length > 0 : false) || document.querySelectorAll('span.lrc').length > 0;
        if (!startupSpeechDone) {
          if (hasLrc && !speechInput.checked) {
            speechInput.click();
            try {
              speechInput.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
          }
          if (speechInput.checked || !hasLrc) {
            startupSpeechDone = true;
            scheduleStateUpdate();
          }
        }
        speechDone = true;
      }

      // 2. 捲動模式 (Scroll Mode -> 持續 / index 1)
      // 🛡️ 護欄一：音訊就緒閘門（Audio Ready Gate），必須等待音檔 metadata 載入完畢才點擊，避免觸發大慈恩 alert('音檔仍在準備中...')
      const audio = getAudio();
      const isAudioReady = window.playerReady === true || (audio && (audio.readyState >= 1 || (!isNaN(audio.duration) && audio.duration > 0)));

      const scrollRadio1 = document.getElementById('bottom_toolbar_autoscroll-1');
      const scrollLabel1 = document.querySelector('label[for="bottom_toolbar_autoscroll-1"]');
      const checkedScroll = document.querySelector('input[name="bottom_toolbar_autoscroll"]:checked');

      if (scrollRadio1 || scrollLabel1) {
        if (checkedScroll && checkedScroll.value === '1') {
          scrollDone = true;
        } else if (isAudioReady) {
          // 音訊就緒後才安全點擊切換
          if (scrollLabel1) scrollLabel1.click();
          else if (scrollRadio1) scrollRadio1.click();
          const nowChecked = document.querySelector('input[name="bottom_toolbar_autoscroll"]:checked');
          scrollDone = !!(nowChecked && nowChecked.value === '1');
        }
      }

      // 3. 原生字級拉桿監聽：一旦在網頁拉動立即排程推播，忠實反映大慈恩官方原生狀態
      const fontSlider = document.getElementById('setFontSlider');
      if (fontSlider && !fontSlider.__amrtf_listening) {
        fontSlider.__amrtf_listening = true;
        fontSlider.addEventListener('input', () => scheduleStateUpdate());
        fontSlider.addEventListener('change', () => scheduleStateUpdate());
      }

      // 未按播放時，確保頁面 100% 定格不偷跑
      if (audio && (audio.paused || audio.ended) && window.jQuery) {
        window.jQuery('html,body').stop(true, false);
      }

      // 4. 長官指定：開機預設曜石玄木深色手抄稿皮膚 (Zen Dark)
      if (document.body.classList.contains('amec_theme')) {
        applyTheme('dark');
      }

      if (speechDone && scrollDone && curMarkers.length >= 10) {
        clearInterval(intervalId);
        console.log(`[AMRTF-Desk] 開機狀態與 ${curMarkers.length} 個黃金段落已全數就緒！`);
        if (audio && (audio.paused || audio.ended) && window.jQuery) {
          window.jQuery('html,body').stop(true, false);
        }
        scheduleStateUpdate();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        scheduleStateUpdate();
      }
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceStartupDefaults);
  } else {
    enforceStartupDefaults();
  }

  // 檢查音訊元素是否具備有效來源 (防止官網 AJAX 延遲期間盲目 play 導致錯誤)
  function isAudioReady(audio) {
    if (!audio) return false;
    return !!(audio.currentSrc || audio.src || audio.querySelector('source[src]'));
  }

  // 核心操作輔助
  function doPlay() {
    const audio = getAudio();

    // 1. 絕對優先觸發大慈恩官網的原生播放按鈕 (此為官網 AJAX 動態載入音檔來源的點火開關，絕不可阻斷)
    const playBtn = document.querySelector('button[aria-label="播放"], button[title="播放"], .mejs-play button, .mejs-playpause-button button');
    if (playBtn) {
      try { playBtn.click(); } catch (e) {}
    }

    // 2. 調用 mediaelement.js 實例 API
    try {
      if (window.mejs && window.mejs.players) {
        for (const k in window.mejs.players) {
          window.mejs.players[k].play();
        }
      }
    } catch (e) {}

    // 3. 原生 HTML5 audio 備援 (僅在已具備來源時調用，杜絕空來源拋出 NotSupportedError)
    if (audio && audio.paused) {
      if (isAudioReady(audio)) {
        const playPromise = audio.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            showActionHud('▶️ 播放受阻: 請點擊視窗解除靜音限制', 'error');
          } else {
            console.warn('[AMRTF-Desk] 原生播放捕獲:', err.message);
          }
          notifyStateUpdate();
          return err;
        });
        window.__AMRTF_LAST_PLAY_PROMISE__ = playPromise;
        playPromise.then(() => {
          delete window.__AMRTF_LAST_PLAY_PROMISE__;
          notifyStateUpdate();
        });
      } else {
        console.log('[AMRTF-Desk] 原生按鈕已點火，等待官網音訊來源完成加載...');
      }
    }
    return true;
  }

  function doPause() {
    freezeScroll();
    // 1. 原生 HTML5 audio 絕對優先急煞
    const audio = getAudio();
    if (audio) {
      try {
        audio.pause();
      } catch (e) {
        console.warn('[AMRTF-Desk] 原生 pause 例外 (已安全吸收):', e);
      }
    }
    // 2. 調用 mediaelement.js 實例 API 徹底同步
    try {
      if (window.mejs && window.mejs.players) {
        for (const k in window.mejs.players) {
          window.mejs.players[k].pause();
        }
      }
    } catch (e) {}
    // 3. 清除未決的 playPromise 避免未決競態
    if (window.__AMRTF_LAST_PLAY_PROMISE__) {
      delete window.__AMRTF_LAST_PLAY_PROMISE__;
    }
    freezeScroll();
    notifyStateUpdate();
  }

  function seekAudio(targetSec, shouldPlay = true) {
    const audio = getAudio();
    const target = Math.max(0, parseFloat(targetSec) || 0);

    // 只有在明確要求播放時才觸發歌詞 click，防止從頭急煞或歸零暫停時被官網點擊事件強行重開播放
    if (shouldPlay) {
      const seekElements = Array.from(document.querySelectorAll('span.seek-to, [data-time], span.lrc, span[data-s]'));
      for (const el of seekElements) {
        const t = el.hasAttribute('data-time') ? parseTimeToSeconds(el.getAttribute('data-time')) : parseFloat(el.getAttribute('data-s') || '0');
        if (!isNaN(t) && Math.abs(t - target) < 0.5) {
          try { el.click(); break; } catch (e) {}
        }
      }
    }

    if (audio) {
      if (isAudioReady(audio)) {
        try { audio.currentTime = target; } catch (e) {}
        if (shouldPlay && audio.paused) doPlay();
      } else {
        // 音訊尚在載入中，掛載單次就緒監聽
        const onReady = () => {
          audio.removeEventListener('canplay', onReady);
          audio.removeEventListener('loadedmetadata', onReady);
          try { audio.currentTime = target; } catch (e) {}
          if (shouldPlay && audio.paused) doPlay();
        };
        audio.addEventListener('canplay', onReady, { once: true });
        audio.addEventListener('loadedmetadata', onReady, { once: true });
      }
    }
    scheduleStateUpdate();
  }

  function applyTheme(targetTheme) {
    const isLightNow = document.body.classList.contains('amec_theme');
    let makeLight = !isLightNow;
    if (targetTheme === 'dark') makeLight = false;
    else if (targetTheme === 'light') makeLight = true;

    const targetId = makeLight ? 'bottom_toolbar_theme-1' : 'bottom_toolbar_theme-0';
    const label = document.querySelector(`label[for="${targetId}"]`);
    if (label) label.click();
    else document.body.classList.toggle('amec_theme', makeLight);
    scheduleStateUpdate();
  }

  // ============================================================================
  // 🎬 劇院級獨立全螢幕放映引擎 (Theater Mode Engine - 方案 3 本地秒播 ＋ 雙軌備援)
  // 徹底消滅右上角關閉字樣、外掛字幕與頂部標題，100% 純淨全螢幕廣播級播出
  // ============================================================================
  const VIDEO_MAPPING = {
    migtsema: 'oVynEvkuj4M',   // 密集嘛 經典版 Official MV
    prep: '9hFq1l8RoUM',       // 前行：三稱本師聖號、開經偈、大乘皈依發心
    dedication: 'E1qFpq1i0fY'  // 迴向：真如老師恭誦大迴向
  };

  let currentYtPlayer = null;
  let isTheaterActive = false;

  function loadYouTubeIframeApi(callback) {
    if (window.YT && window.YT.Player) {
      callback();
      return;
    }
    const existing = document.getElementById('amrtf-yt-script');
    if (!existing) {
      const tag = document.createElement('script');
      tag.id = 'amrtf-yt-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const checkTimer = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(checkTimer);
        callback();
      }
    }, 100);
  }

  let theaterSessionToken = 0;

  async function playTheaterVideo(videoKey) {
    // 1. 暫停背景音檔
    doPause();

    // 2. 先自癒清理任何舊劇院與舊彈窗，防止連續點擊堆疊死鎖與聲音重疊（立即停播前一部影片）
    closeTheaterVideo();

    const currentToken = ++theaterSessionToken;
    isTheaterActive = true;

    // 鎖定外層捲軸溢出，杜絕全螢幕影片右側露出滾動條
    try {
      document.documentElement.classList.add('amrtf-theater-active');
      document.body.classList.add('amrtf-theater-active');
    } catch (e) {}

    // 3. 動態建立全螢幕純黑劇院覆蓋層 (頂級 z-index，完全無邊框無任何浮動按鈕)
    const overlay = document.createElement('div');
    overlay.id = 'amrtf-theater-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'background: #000000',
      'z-index: 2147483647',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'margin: 0',
      'padding: 0',
      'overflow: hidden'
    ].join(' !important;') + ' !important;';

    // 播放器容器 (支援微過掃描以完美覆蓋任何雲端標題)
    const playerContainer = document.createElement('div');
    playerContainer.id = 'amrtf-theater-player-container';
    playerContainer.style.cssText = 'width: 100vw; height: 100vh; pointer-events: auto; background: #000000; display: flex; align-items: center; justify-content: center; overflow: hidden;';
    overlay.appendChild(playerContainer);

    document.documentElement.appendChild(overlay);

    // 4. 進入實體全螢幕 (雙重請求保障)
    try {
      if (!document.fullscreenElement) {
        (overlay.requestFullscreen || document.documentElement.requestFullscreen).call(overlay || document.documentElement).catch(() => {});
      }
    } catch (e) {}

    // 5. 探測本機原生高畫質影片 (Port 9998 HTTP 206 串流)
    const localVideoUrl = `http://127.0.0.1:9998/videos/${videoKey}.mp4`;
    let hasLocalFile = false;
    try {
      const resp = await fetch(localVideoUrl, { method: 'HEAD' });
      if (resp.ok && resp.status === 200) {
        hasLocalFile = true;
      }
    } catch (e) {
      hasLocalFile = false;
    }

    if (!isTheaterActive || currentToken !== theaterSessionToken) {
      if (overlay) overlay.remove();
      return;
    }

    if (hasLocalFile) {
      // ======================================================================
      // 🏆 方案 3 終極首選：本機原生影音秒播 (0 延遲、0 外掛字幕、0 頂部標題、0 控制列)
      // ======================================================================
      console.log(`[AMRTF Theater] 啟用本機離線廣播級原生秒播: ${localVideoUrl}`);
      const video = document.createElement('video');
      video.id = 'amrtf-theater-native-video';
      video.src = localVideoUrl;
      video.autoplay = true;
      video.controls = false; // 絕對 0 控制列、0 進度條
      video.style.cssText = 'width: 100vw; height: 100vh; object-fit: contain; background: #000000; outline: none; border: none;';
      
      // 播放結束：自動銷毀退出全螢幕回到手抄稿原位！
      video.onended = () => {
        console.log('[AMRTF Theater] 本機影片播完，自動退出全螢幕回到手抄稿！');
        closeTheaterVideo();
      };

      playerContainer.appendChild(video);
      try {
        video.play().catch(() => {});
      } catch (err) {}
    } else {
      // ======================================================================
      // 🛡️ 方案 2 雙軌降級保險：YouTube IFrame API 深度淨化
      // ======================================================================
      console.log(`[AMRTF Theater] 本機檔案未就緒，啟用 YouTube 雲端雙軌備援: ${videoKey}`);
      let videoId = VIDEO_MAPPING[videoKey] || videoKey;
      try {
        if (videoKey === 'migtsema') {
          const iframe = document.querySelector('#omw-114567 iframe');
          const m = iframe?.getAttribute('src')?.match(/embed\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        } else if (videoKey === 'prep') {
          const iframe = document.querySelector('#omw-32781 iframe');
          const m = iframe?.getAttribute('src')?.match(/embed\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        } else if (videoKey === 'dedication') {
          const iframe = document.querySelector('#modal_omw_33934 iframe, #omw-33934 iframe');
          const m = iframe?.getAttribute('src')?.match(/embed\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        }
      } catch (e) {}

      const ytTarget = document.createElement('div');
      ytTarget.id = 'amrtf-yt-player-target';
      ytTarget.style.cssText = 'width: 100vw; height: 100vh; transform: scale(1.04); transform-origin: center center;';
      playerContainer.appendChild(ytTarget);

      loadYouTubeIframeApi(() => {
        if (!isTheaterActive) return;
        try {
          currentYtPlayer = new window.YT.Player('amrtf-yt-player-target', {
            videoId: videoId,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 1,
              controls: 0,        // 拔除底部所有控制列、時間條與圖示
              rel: 0,
              modestbranding: 1,
              fs: 0,
              playsinline: 0,
              enablejsapi: 1,
              iv_load_policy: 3,   // 關閉影片註釋與片尾卡片
              cc_load_policy: 0,   // 預設關閉 CC 字幕
              origin: window.location.origin
            },
            events: {
              onReady: (evt) => {
                try {
                  // 徹底卸載 CC 字幕模組，杜絕下方拼音/中文字幕
                  if (evt.target.unloadModule) evt.target.unloadModule('captions');
                  evt.target.playVideo();
                } catch (e) {}
              },
              onStateChange: (evt) => {
                // 0 === YT.PlayerState.ENDED (播完自動關閉回到手抄稿)
                if (evt.data === 0) {
                  console.log('[AMRTF Theater] 雲端影片播完，自動關閉退出全螢幕回到手抄稿！');
                  closeTheaterVideo();
                }
              }
            }
          });
        } catch (err) {
          console.warn('[AMRTF Theater] YT Player 建立失敗，降級 iframe:', err);
          ytTarget.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&enablejsapi=1&cc_load_policy=0" style="width:100vw;height:100vh;border:none;" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
        }
      });
    }

    scheduleStateUpdate();
  }

  function closeTheaterVideo() {
    isTheaterActive = false;
    theaterSessionToken++;

    // 解除劇院捲軸鎖定
    try {
      document.documentElement.classList.remove('amrtf-theater-active');
      document.body.classList.remove('amrtf-theater-active');
    } catch (e) {}

    // 1. 安全退出實體全螢幕
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}

    // 2. 激進銷毀原生 <video> 解碼管線 (遵守 8GB RAM 零洩漏鐵律，確保任何播放中的影片瞬間急煞中斷)
    document.querySelectorAll('video').forEach((vid) => {
      try {
        vid.pause();
        vid.currentTime = 0;
        if (vid.id.startsWith('amrtf-theater')) {
          vid.removeAttribute('src');
          vid.load();
          vid.remove();
        }
      } catch (e) {}
    });

    // 3. 銷毀 YouTube Player 實例
    if (currentYtPlayer) {
      try {
        currentYtPlayer.stopVideo();
        currentYtPlayer.destroy();
      } catch (e) {}
      currentYtPlayer = null;
    }

    // 4. 移除純黑劇院覆蓋層
    const overlay = document.getElementById('amrtf-theater-overlay');
    if (overlay) {
      overlay.remove();
    }

    // 5. 清理可能殘留的原生 OMW Modal 與遮罩
    document.querySelectorAll('.omw-modal.open, .omw-modal-overlay, .fancybox-container, .modal-backdrop').forEach((el) => {
      try {
        el.classList.remove('open');
        el.style.display = 'none';
      } catch (e) {}
    });

    scheduleStateUpdate();
  }

  // 監聽鍵盤 ESC / Q 與 全螢幕變更事件：一旦使用者主動退出全螢幕，劇院層自動安全關閉
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Escape' || e.key === 'q' || e.key === 'Q') && isTheaterActive) {
      closeTheaterVideo();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    // 若退出了實體全螢幕且當前劇院還掛著，代表使用者按了瀏覽器 ESC，自動清理覆蓋層
    if (!document.fullscreenElement && isTheaterActive) {
      closeTheaterVideo();
    }
  });

  // ============================================================================
  // 🛰️ 操作狀態紀錄 (長官指示：大慈恩畫面不出現操作狀態說明，保持觀眾純淨畫面)
  // ============================================================================
  function showActionHud(text, type = 'info') {
    // 徹底清理任何歷史殘留之 HUD DOM 節點
    const oldHud = document.getElementById('amrtf-action-hud');
    if (oldHud) {
      try { oldHud.remove(); } catch (e) {}
    }
    // 僅在終端/控制台打印遙測日誌，絕不向大慈恩大螢幕 DOM 注入任何浮動提示框！
    console.log(`[AMRTF Action] (${type}) ${text}`);
  }

  // 指令正規化轉譯表 (消滅大小寫與發送端歷史命名脫節)
  const COMMAND_NORMALIZE_MAP = {
    // 亮暗主題
    'toggle_theme': 'set_theme',
    'TOGGLE_THEME': 'set_theme',
    'theme': 'set_theme',
    'set_theme': 'set_theme',
    // 播稿提詞
    'toggle_speech_lead': 'toggle_speech_mode',
    'TOGGLE_SPEECH_LEAD': 'toggle_speech_mode',
    'toggle_speech_mode': 'toggle_speech_mode',
    'TOGGLE_SPEECH_MODE': 'toggle_speech_mode',
    'speech_mode': 'toggle_speech_mode',
    'set_speech_mode': 'set_speech_mode',
    'SET_SPEECH_MODE': 'set_speech_mode',
    // 滾動模式
    'toggle_scroll_mode': 'cycle_scroll_mode',
    'TOGGLE_SCROLL_MODE': 'cycle_scroll_mode',
    'toggle_scroll': 'cycle_scroll_mode',
    'cycle_scroll': 'cycle_scroll_mode',
    'cycle_scroll_mode': 'cycle_scroll_mode',
    'CYCLE_SCROLL_MODE': 'cycle_scroll_mode',
    'set_scroll_mode': 'set_scroll_mode',
    'SET_SCROLL_MODE': 'set_scroll_mode',
    // 引文導航
    'seek_quote': 'jump_to_master_start',
    'toggle_quote': 'jump_to_master_start',
    'SEEK_QUOTE': 'jump_to_master_start',
    'TOGGLE_QUOTE': 'jump_to_master_start',
    'jump_to_master_start': 'jump_to_master_start',
    // 前後講切換
    'prev_lecture': 'prev_lesson',
    'PREV_LECTURE': 'prev_lesson',
    'prev_lesson': 'prev_lesson',
    'PREV_LESSON': 'prev_lesson',
    'next_lecture': 'next_lesson',
    'NEXT_LECTURE': 'next_lesson',
    'next_lesson': 'next_lesson',
    'NEXT_LESSON': 'next_lesson',
    // 全螢幕
    'fullscreen': 'toggle_fullscreen',
    'FULLSCREEN': 'toggle_fullscreen',
    'toggle_fullscreen': 'toggle_fullscreen',
    'TOGGLE_FULLSCREEN': 'toggle_fullscreen',
    'sync_fullscreen_state': 'sync_fullscreen_state',
    // 基礎播放
    'play': 'play',
    'PLAY': 'play',
    'pause': 'pause',
    'PAUSE': 'pause',
    'toggle_play': 'toggle_play',
    'TOGGLE_PLAY': 'toggle_play',
    'stop': 'restart',
    'restart': 'restart',
    'STOP': 'restart',
    'seek_bwd': 'rewind_10s',
    'seek_fwd': 'forward_10s',
    'SEEK_BACKWARD': 'rewind_5s',
    'SEEK_FORWARD': 'forward_5s',
    'rewind_5s': 'rewind_5s',
    'forward_5s': 'forward_5s',
    'rewind_10s': 'rewind_10s',
    'forward_10s': 'forward_10s',
    // 循環與區間
    'loop_interval': 'toggle_loop_segment',
    'LOOP_INTERVAL': 'toggle_loop_segment',
    'toggle_loop_segment': 'toggle_loop_segment',
    'SET_LOOP_MODE': 'toggle_loop_segment',
    'loop_current_paragraph': 'loop_current_paragraph',
    'play_interval': 'play_interval',
    'play_interval_default': 'play_interval',
    'stop_interval': 'stop_interval',
    // 速度與字級
    'set_playback_rate': 'set_playback_rate',
    'SET_SPEED': 'set_playback_rate',
    'adjust_font_size': 'adjust_font_size',
    'ADJUST_FONT_SIZE': 'adjust_font_size',
    // 劇院影片
    'modal_migtsema': 'modal_migtsema',
    'TRIGGER_MIGSEMA': 'modal_migtsema',
    'modal_prep_video': 'modal_prep_video',
    'TRIGGER_PREP': 'modal_prep_video',
    'modal_dedication_video': 'modal_dedication_video',
    'TRIGGER_DEDICATION': 'modal_dedication_video',
    'modal_close': 'modal_close',
    'close_video': 'modal_close',
    'CLOSE_VIDEO': 'modal_close',
    'stop_video': 'modal_close',
    'STOP_VIDEO': 'modal_close',
    'set_volume': 'set_volume',
    'SET_VOLUME': 'set_volume',
    'toggle_mute': 'toggle_mute',
    'TOGGLE_MUTE': 'toggle_mute'
  };

  // 指令分發中心 (100% 完整對標 Companion 與手機端 Actions)
  window.__AMRTF_EXECUTE_COMMAND__ = function (rawCmd, params = {}) {
    const audio = getAudio();
    const cmd = COMMAND_NORMALIZE_MAP[rawCmd] || rawCmd;
    window.__AMRTF_LAST_COMMAND__ = { cmd, rawCmd, params, timestamp: Date.now() };
    window.__AMRTF_GET_LOOP_CONFIG__ = () => loopConfig;

    switch (cmd) {
      case 'toggle_play':
        if (audio && !audio.paused && !audio.ended) {
          doPause();
          showActionHud('⏸️ 已暫停播放');
        } else {
          if (doPlay()) {
            showActionHud('▶️ 開始播放');
          }
        }
        break;

      case 'play':
        if (doPlay()) {
          showActionHud('▶️ 開始播放');
        }
        break;

      case 'pause':
        doPause();
        showActionHud('⏸️ 已暫停播放');
        break;

      case 'restart':
        if (audio && isAudioReady(audio)) {
          seekAudio(0, false);
        }
        doPause();
        showActionHud('⏹️ 重新回到起點');
        break;

      case 'rewind_5s':
        if (audio) {
          if (isAudioReady(audio)) {
            seekAudio(audio.currentTime - 5);
            showActionHud('⏪ 快退 5 秒');
          } else {
            showActionHud('⏳ 音檔載入中...');
          }
        }
        break;

      case 'forward_5s':
        if (audio) {
          if (isAudioReady(audio)) {
            seekAudio(audio.currentTime + 5);
            showActionHud('⏩ 快進 5 秒');
          } else {
            showActionHud('⏳ 音檔載入中...');
          }
        }
        break;

      case 'rewind_10s':
        if (audio) {
          if (isAudioReady(audio)) {
            seekAudio(audio.currentTime - 10);
            showActionHud('⏪ 快退 10 秒');
          } else {
            showActionHud('⏳ 音檔載入中...');
          }
        }
        break;

      case 'forward_10s':
        if (audio) {
          if (isAudioReady(audio)) {
            seekAudio(audio.currentTime + 10);
            showActionHud('⏩ 快進 10 秒');
          } else {
            showActionHud('⏳ 音檔載入中...');
          }
        }
        break;

      case 'seek_relative':
      case 'SEEK_RELATIVE':
        if (audio) seekAudio(audio.currentTime + (params.seconds || 0));
        break;

      case 'seek_absolute':
      case 'SEEK_ABSOLUTE':
        seekAudio(parseTimeToSeconds(params.time || params.seconds));
        break;

      case 'jump_to_master_start':
        if (!audio || !isAudioReady(audio)) {
          showActionHud('⏳ 音檔載入中...');
          break;
        }
        const curTime = audio.currentTime;
        const range = parseMasterAudioRange(curTime);
        if (range.start >= 0) {
          seekAudio(range.start, true);
          showActionHud(`🎯 引文起點: ${formatClock(range.start)}`);
        } else {
          showActionHud('ℹ️ 當前無引文區間');
        }
        break;

      case 'toggle_loop_segment':
        if (loopConfig.enabled && loopConfig.type === 'quote') {
          loopConfig = { enabled: false, start: 0, end: 0, type: 'none' };
          showActionHud('🔁 引文循環：關閉');
        } else {
          if (!audio || !isAudioReady(audio)) {
            showActionHud('⏳ 音檔載入中...');
            break;
          }
          const curT = audio.currentTime;
          const allRanges = getAllMasterAudioRanges();
          let r = allRanges.find(item => curT >= item.start - 1 && curT <= item.end + 1);
          if (!r) r = parseMasterAudioRange(curT);

          if (r.start >= 0 && r.end > r.start) {
            loopConfig = { enabled: true, start: r.start, end: r.end, type: 'quote' };
            if (curT < r.start || curT > r.end) {
              seekAudio(r.start, true);
            }
            showActionHud(`🔁 引文循環：${formatClock(r.start)}~${formatClock(r.end)}`);
          } else {
            showActionHud('⚠️ 未偵測到有效引文區間');
          }
        }
        scheduleStateUpdate();
        break;

      case 'loop_current_paragraph':
        if (loopConfig.enabled && loopConfig.type === 'paragraph') {
          loopConfig = { enabled: false, start: 0, end: 0, type: 'none' };
          showActionHud('🔂 段落循環：關閉');
        } else if (audio && isAudioReady(audio)) {
          const cur = audio.currentTime;
          const r = getSurroundingSentenceRange(cur, 3, 3);
          loopConfig = { enabled: true, start: r.start, end: r.end, type: 'paragraph' };
          seekAudio(r.start, true);
          showActionHud('🔂 段落循環：開啟');
        } else {
          showActionHud('⏳ 音檔載入中...');
        }
        scheduleStateUpdate();
        break;

      case 'play_interval': {
        if (!audio || !isAudioReady(audio)) {
          showActionHud('⏳ 音檔載入中...');
          break;
        }
        const iStart = Math.max(0, parseFloat(params.start) || 0);
        const iEnd = Math.max(iStart + 0.5, parseFloat(params.end) || (audio ? audio.duration : iStart + 60));
        const iLoop = !!params.loop;
        intervalConfig = { enabled: true, start: iStart, end: iEnd, loop: iLoop };
        loopConfig = { enabled: false, start: 0, end: 0, type: 'none' };
        if (intervalPollTimer) {
          clearInterval(intervalPollTimer);
          intervalPollTimer = null;
        }
        intervalPollTimer = setInterval(checkIntervalTick, 20);
        seekAudio(iStart, true);
        showActionHud(`⏱️ 區間播放: ${formatClock(iStart)} ~ ${formatClock(iEnd)}`);
        scheduleStateUpdate();
        break;
      }

      case 'stop_interval':
        intervalConfig = { enabled: false, start: 0, end: 0, loop: false };
        if (intervalPollTimer) {
          clearInterval(intervalPollTimer);
          intervalPollTimer = null;
        }
        showActionHud('🔓 已解除循環模式');
        scheduleStateUpdate();
        break;

      case 'set_speed':
      case 'set_playback_rate':
        const rate = parseFloat(params.rate || params.speed || params.value || 1.0);
        if (audio) audio.playbackRate = rate;
        showActionHud(`⚡ 語速切換至: ${rate}x`);
        scheduleStateUpdate();
        break;

      case 'prev_lesson': {
        const prevLink = document.querySelector('.nav-previous a, a[rel="prev"]');
        if (prevLink) {
          showActionHud('⏮️ 跳轉前一講');
          prevLink.click();
        } else {
          showActionHud('ℹ️ 已是第一講');
        }
        break;
      }

      case 'next_lesson': {
        const nextLink = document.querySelector('.nav-next a, a[rel="next"]');
        if (nextLink) {
          showActionHud('⏭️ 跳轉下一講');
          nextLink.click();
        } else {
          showActionHud('ℹ️ 已是最後一講');
        }
        break;
      }

      case 'set_theme': {
        applyTheme(params.theme);
        const isDarkNow = !document.body.classList.contains('amec_theme');
        showActionHud(isDarkNow ? '🌙 已切換為深色模式' : '☀️ 已切換為淺色模式');
        break;
      }

      case 'toggle_speech_mode':
      case 'set_speech_mode': {
        const input = document.getElementById('bottom_toolbar_speechmode');
        if (input) {
          if (params && params.enabled !== undefined) {
            if (input.checked !== !!params.enabled) {
              input.click();
              try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
            }
          } else {
            input.click();
            try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
          }
          showActionHud(input.checked ? '🎙️ 播稿模式已開啟' : '📖 播稿模式已關閉');
        } else {
          showActionHud('ℹ️ 本講次無官方播稿功能');
        }
        scheduleStateUpdate();
        break;
      }

      case 'cycle_scroll_mode': {
        const curChecked = document.querySelector('input[name="bottom_toolbar_autoscroll"]:checked');
        const curVal = curChecked ? parseInt(curChecked.value, 10) : 0;
        const nextVal = (curVal + 1) % 3;
        const nextRadio = document.getElementById(`bottom_toolbar_autoscroll-${nextVal}`);
        const nextLabel = document.querySelector(`label[for="bottom_toolbar_autoscroll-${nextVal}"]`);
        if (nextLabel) nextLabel.click();
        else if (nextRadio) nextRadio.click();
        const scrollNames = ['手動', '持續', '區段'];
        showActionHud(`📜 滾動模式: ${scrollNames[nextVal] || nextVal}`);
        setTimeout(scheduleStateUpdate, 50);
        break;
      }

      case 'set_scroll_mode': {
        const mode = params.mode !== undefined ? String(params.mode) : '1';
        const targetRadio = document.getElementById(`bottom_toolbar_autoscroll-${mode}`);
        const targetLabel = document.querySelector(`label[for="bottom_toolbar_autoscroll-${mode}"]`);
        if (targetLabel) targetLabel.click();
        else if (targetRadio) targetRadio.click();
        showActionHud(`📜 滾動模式已設定: ${mode}`);
        break;
      }

      case 'adjust_font_size': {
        const fontSlider = document.getElementById('setFontSlider');
        let newSize = 16;
        if (fontSlider) {
          const min = parseFloat(fontSlider.min) || 10;
          const max = parseFloat(fontSlider.max) || 22;
          const step = parseFloat(fontSlider.step) || 1;
          const currentSize = parseFloat(fontSlider.value) || 16;

          if (params.value !== undefined && !isNaN(parseFloat(params.value))) {
            newSize = parseFloat(params.value);
          } else if (params.delta !== undefined && !isNaN(parseFloat(params.delta))) {
            newSize = currentSize + parseFloat(params.delta);
          } else {
            const delta = step * 1.5;
            newSize = currentSize + delta;
          }

          // 恪守長官指示：不竄改官方 DOM max/min，100% 配合大慈恩原生拉桿安全邊界 (10 ~ 22px)
          newSize = Math.max(min, Math.min(max, Math.round(newSize * 10) / 10));
          fontSlider.value = newSize;
          fontSlider.dispatchEvent(new Event('input', { bubbles: true }));
          fontSlider.dispatchEvent(new Event('change', { bubbles: true }));

          // 保持與大慈恩官方 localStorage 儲存格式 100% 同步
          try {
            localStorage.setItem('amrtf_fontsize2', JSON.stringify(String(newSize)));
          } catch (e) {}

          showActionHud(`🔤 字級大小: ${newSize}px`);
        }

        // 徹底拔除外來暴力 CSS 覆蓋，100% 尊重官方原生樣式與排版機制
        const oldOverride = document.getElementById('amrtf-large-font-override');
        if (oldOverride) {
          oldOverride.remove();
        }

        scheduleStateUpdate();
        break;
      }

      case 'sync_fullscreen_state': {
        const isFs = !!params.isFullscreen;
        document.body.classList.toggle('amrtf-fs-active', isFs);
        showActionHud(isFs ? '⛶ 進入全螢幕放映' : '⛶ 退出全螢幕 (視窗化)');
        scheduleStateUpdate();
        break;
      }

      case 'toggle_fullscreen':
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().then(() => {
            showActionHud('⛶ 進入全螢幕放映');
          }).catch(() => {
            // 若 DOM 手勢受限，依賴外層 CDP 視窗控制
          });
        } else {
          document.exitFullscreen().then(() => {
            showActionHud('⛶ 退出全螢幕');
          }).catch(() => {});
        }
        break;

      case 'modal_migtsema':
        showActionHud('🎬 啟動密集嘛全螢幕劇院');
        playTheaterVideo('migtsema');
        break;

      case 'modal_prep_video':
        showActionHud('🎬 啟動前行全螢幕劇院');
        playTheaterVideo('prep');
        break;

      case 'modal_dedication_video':
        showActionHud('🎬 啟動迴向全螢幕劇院');
        playTheaterVideo('dedication');
        break;

      case 'modal_close':
        showActionHud('✖️ 關閉劇院放映');
        closeTheaterVideo();
        break;

      case 'set_volume': {
        const audio = getAudio();
        let rawVol = params.volume !== undefined ? params.volume : (params.value !== undefined ? params.value : 100);
        let vol = parseFloat(rawVol);
        if (isNaN(vol)) vol = 100;
        if (vol > 1) vol = vol / 100; // 正規化至 0.0 ~ 1.0
        vol = Math.max(0, Math.min(1, vol));
        if (audio) {
          audio.volume = vol;
          audio.muted = (vol === 0);
        }
        showActionHud(`🔊 音量: ${Math.round(vol * 100)}%`);
        scheduleStateUpdate();
        break;
      }

      case 'toggle_mute': {
        const audio = getAudio();
        if (audio) {
          audio.muted = !audio.muted;
          showActionHud(audio.muted ? '🔇 靜音' : `🔊 音量: ${Math.round(audio.volume * 100)}%`);
          scheduleStateUpdate();
        }
        break;
      }

      default:
        console.error(`[AMRTF_EXECUTE_COMMAND_REJECT] 🚨 未知或未支援指令: "${rawCmd}" (正規化: "${cmd}")`, params);
        showActionHud(`🚨 未知指令: ${rawCmd}`, 'error');
        break;
    }

    scheduleStateUpdate();
  };
})();
