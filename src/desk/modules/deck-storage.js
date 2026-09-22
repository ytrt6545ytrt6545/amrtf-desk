// ==============================================================================
// 💾 AMRTF-Desk 佈局持久化與模板管理深模組 (Deck Storage Module)
// ==============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const g = root || (typeof window !== 'undefined' ? window : globalThis);
    g.DeckStorage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  const STORAGE_KEY = 'amrtf_deck_layout_v1';

  // 官方預設模板 A：全功能導播模板 (8 欄流暢佈局)
  const FULL_DIRECTOR_TEMPLATE = {
    version: '1.0.0',
    name: '全功能導播模板',
    columns: 8,
    items: [
      // 行 1: 主核心播控 (4x1 + 4x1)
      { id: 'btnPlayPause', cols: 4, rows: 1, hidden: false, label: '▶ 播放/暫停' },
      { id: 'btnStop', cols: 4, rows: 1, hidden: false, label: '⏹ 停止' },

      // 行 2: 精細跳轉與倍速 (8 顆 1x1)
      { id: 'btnRewind10', cols: 1, rows: 1, hidden: false, label: '⏪ 10s' },
      { id: 'btnRewind5', cols: 1, rows: 1, hidden: false, label: '⏪ 5s' },
      { id: 'btnForward5', cols: 1, rows: 1, hidden: false, label: '5s ⏩' },
      { id: 'btnForward10', cols: 1, rows: 1, hidden: false, label: '10s ⏩' },
      { id: 'btnRate10', cols: 1, rows: 1, hidden: false, label: '1.0x' },
      { id: 'btnRate125', cols: 1, rows: 1, hidden: false, label: '1.25x' },
      { id: 'btnRate15', cols: 1, rows: 1, hidden: false, label: '1.5x' },
      { id: 'btnFullscreen', cols: 1, rows: 1, hidden: false, label: '🖥️ 全螢幕' },

      // 行 3: 核心循環與模式 (2x1 結構)
      { id: 'btnLoopParagraph', cols: 2, rows: 1, hidden: false, label: '🔁 段落微循環' },
      { id: 'btnLoopQuote', cols: 2, rows: 1, hidden: false, label: '🔁 引文循環' },
      { id: 'btnSeekQuote', cols: 1, rows: 1, hidden: false, label: '#引文' },
      { id: 'btnSpeechMode', cols: 1, rows: 1, hidden: false, label: '🗣️ 播稿' },
      { id: 'btnScrollMode', cols: 2, rows: 1, hidden: false, label: '📜 捲動' },

      // 行 4: 講師精準區段選單卡片 (佔滿 8 欄)
      { id: 'intervalRowWidget', cols: 8, rows: 1, hidden: false, isWidget: true, label: '⏱️ 區段起訖選單' },

      // 行 5: 影片彈窗與輔助 (2x1 + 1x1 混合)
      { id: 'btnVideoMigsema', cols: 2, rows: 1, hidden: false, label: '密集嘛' },
      { id: 'btnVideoPrep', cols: 2, rows: 1, hidden: false, label: '前行' },
      { id: 'btnVideoDedication', cols: 2, rows: 1, hidden: false, label: '迴向' },
      { id: 'btnCloseVideo', cols: 2, rows: 1, hidden: false, label: '✕ 關片' },

      // 行 6: 次要輔助鍵
      { id: 'btnPrevLesson', cols: 2, rows: 1, hidden: false, label: '◀ 上講' },
      { id: 'btnNextLesson', cols: 2, rows: 1, hidden: false, label: '下講 ▶' },
      { id: 'btnThemeToggle', cols: 1, rows: 1, hidden: false, label: '🌓 主題' },
      { id: 'btnFontLarger', cols: 1, rows: 1, hidden: false, label: '🔤+' },
      { id: 'btnFontCycle', cols: 1, rows: 1, hidden: false, label: '🔤 16px' },
      { id: 'btnFontSmaller', cols: 1, rows: 1, hidden: false, label: '🔤-' }
    ]
  };

  // 官方預設模板 B：研討極簡大鍵模板 (4 顆霸氣主控鍵 + 引文與關片)
  const MINIMAL_STUDY_TEMPLATE = {
    version: '1.0.0',
    name: '研討極簡大鍵模板',
    columns: 8,
    items: [
      // 4 顆 4x2 巨型主控鍵
      { id: 'btnPlayPause', cols: 4, rows: 2, hidden: false, label: '▶ 播放/暫停' },
      { id: 'btnLoopParagraph', cols: 4, rows: 2, hidden: false, label: '🔁 段落微循環' },
      { id: 'btnStop', cols: 4, rows: 2, hidden: false, label: '⏹ 停止' },
      { id: 'btnLoopQuote', cols: 4, rows: 2, hidden: false, label: '🔁 引文循環' },

      // 輔助行
      { id: 'btnSeekQuote', cols: 2, rows: 1, hidden: false, label: '#引文' },
      { id: 'btnSpeechMode', cols: 2, rows: 1, hidden: false, label: '🗣️ 播稿' },
      { id: 'btnScrollMode', cols: 2, rows: 1, hidden: false, label: '📜 捲動' },
      { id: 'btnCloseVideo', cols: 2, rows: 1, hidden: false, label: '✕ 關片' },

      // 其餘按鈕預設收納進倉庫
      { id: 'btnRewind10', cols: 1, rows: 1, hidden: true, label: '⏪ 10s' },
      { id: 'btnRewind5', cols: 1, rows: 1, hidden: true, label: '⏪ 5s' },
      { id: 'btnForward5', cols: 1, rows: 1, hidden: true, label: '5s ⏩' },
      { id: 'btnForward10', cols: 1, rows: 1, hidden: true, label: '10s ⏩' },
      { id: 'btnRate10', cols: 1, rows: 1, hidden: true, label: '1.0x' },
      { id: 'btnRate125', cols: 1, rows: 1, hidden: true, label: '1.25x' },
      { id: 'btnRate15', cols: 1, rows: 1, hidden: true, label: '1.5x' },
      { id: 'btnFullscreen', cols: 1, rows: 1, hidden: true, label: '🖥️ 全螢幕' },
      { id: 'intervalRowWidget', cols: 8, rows: 1, hidden: true, isWidget: true, label: '⏱️ 區段起訖選單' },
      { id: 'btnVideoMigsema', cols: 2, rows: 1, hidden: true, label: '密集嘛' },
      { id: 'btnVideoPrep', cols: 2, rows: 1, hidden: true, label: '前行' },
      { id: 'btnVideoDedication', cols: 2, rows: 1, hidden: true, label: '迴向' },
      { id: 'btnPrevLesson', cols: 2, rows: 1, hidden: true, label: '◀ 上講' },
      { id: 'btnNextLesson', cols: 2, rows: 1, hidden: true, label: '下講 ▶' },
      { id: 'btnThemeToggle', cols: 2, rows: 1, hidden: true, label: '🌓 主題' },
      { id: 'btnFontLarger', cols: 1, rows: 1, hidden: true, label: '🔤+' },
      { id: 'btnFontCycle', cols: 1, rows: 1, hidden: true, label: '🔤 16px' },
      { id: 'btnFontSmaller', cols: 1, rows: 1, hidden: true, label: '🔤-' }
    ]
  };

  /**
   * 結構校驗器
   */
  function validate(layout) {
    if (!layout || typeof layout !== 'object') return false;
    if (!Array.isArray(layout.items)) return false;
    return layout.items.every(item => item && typeof item.id === 'string');
  }

  /**
   * 深拷貝工具
   */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 載入當前有效佈局
   */
  function loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validate(parsed)) {
          // 合併可能遺漏的新按鈕
          return mergeWithDefaults(parsed);
        }
      }
    } catch (e) {
      console.warn('[DeckStorage] 讀取佈局快取失敗，回退至預設全功能模板', e);
    }
    return clone(FULL_DIRECTOR_TEMPLATE);
  }

  /**
   * 保存佈局至 localStorage
   */
  function saveLayout(layout) {
    if (!validate(layout)) {
      console.error('[DeckStorage] 佈局結構校驗失敗，拒絕寫入');
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      return true;
    } catch (e) {
      console.error('[DeckStorage] 寫入 localStorage 失敗', e);
      return false;
    }
  }

  /**
   * 與預設模板比對，確保新功能按鈕不遺失
   */
  function mergeWithDefaults(current) {
    const existingIds = new Set(current.items.map(it => it.id));
    const merged = clone(current);

    FULL_DIRECTOR_TEMPLATE.items.forEach(defaultItem => {
      if (!existingIds.has(defaultItem.id)) {
        merged.items.push(clone(defaultItem));
      }
    });

    return merged;
  }

  /**
   * 匯出佈局為 JSON 字串
   */
  function exportToJson(layout) {
    return JSON.stringify(layout || loadLayout(), null, 2);
  }

  /**
   * 從 JSON 字串解析並套用佈局
   */
  function importFromJson(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (validate(parsed)) {
        const merged = mergeWithDefaults(parsed);
        saveLayout(merged);
        return { success: true, layout: merged };
      }
      return { success: false, error: 'JSON 缺少關鍵 items 陣列結構' };
    } catch (e) {
      return { success: false, error: '無效的 JSON 語法格式' };
    }
  }

  /**
   * 恢復為官方預設模板
   */
  function resetToDefault(templateType = 'full') {
    const template = templateType === 'minimal' ? MINIMAL_STUDY_TEMPLATE : FULL_DIRECTOR_TEMPLATE;
    const layout = clone(template);
    saveLayout(layout);
    return layout;
  }

  const STORAGE_KEY_TEMPLATES = 'amrtf_deck_custom_templates_v2';

  /**
   * 取得所有自訂模板字典
   */
  function getCustomTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TEMPLATES);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {}
    // 預設含全功能與研討極簡兩個初始槽位
    return {
      'full': { id: 'full', name: '全功能導播模板', layout: clone(FULL_DIRECTOR_TEMPLATE) },
      'minimal': { id: 'minimal', name: '研討極簡模板', layout: clone(MINIMAL_STUDY_TEMPLATE) }
    };
  }

  /**
   * 保存或覆寫自訂模板
   */
  function saveCustomTemplate(id, name, layout) {
    const list = getCustomTemplates();
    list[id] = {
      id,
      name: name || id,
      updatedAt: Date.now(),
      layout: clone(layout)
    };
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(list));
    } catch (e) {
      console.warn('[DeckStorage] 儲存自訂模板失敗', e);
    }
    return list;
  }

  /**
   * 載入指定模板排版
   */
  function loadTemplateById(id) {
    const list = getCustomTemplates();
    if (list[id] && list[id].layout) {
      const merged = mergeWithDefaults(list[id].layout);
      saveLayout(merged);
      return merged;
    }
    return resetToDefault(id === 'minimal' ? 'minimal' : 'full');
  }

  return {
    loadLayout,
    saveLayout,
    exportToJson,
    importFromJson,
    resetToDefault,
    getCustomTemplates,
    saveCustomTemplate,
    loadTemplateById,
    validate,
    TEMPLATES: {
      FULL: FULL_DIRECTOR_TEMPLATE,
      MINIMAL: MINIMAL_STUDY_TEMPLATE
    }
  };
});
