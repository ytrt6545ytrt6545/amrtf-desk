import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LAYOUT_FILE = path.join(DATA_DIR, 'mobile-layout.json');

// 預設 4 欄 × 8 列黃金版面（完美 32 格，提詞機佔 4×3 絕不切字）
export const DEFAULT_MOBILE_LAYOUT = {
  version: '1.0.0',
  grid: { cols: 4, rows: 8 },
  items: [
    { id: 'header-info', type: 'widget', col: 1, row: 1, w: 4, h: 1, label: '時鐘與講次', category: 'info' },
    { id: 'btn-play', type: 'button', col: 1, row: 2, w: 2, h: 2, action: 'play', label: '▶ 播放', style: 'btn-play', category: 'playback' },
    { id: 'btn-stop', type: 'button', col: 3, row: 2, w: 2, h: 2, action: 'stop', label: '⏹ 停止', style: 'btn-stop', category: 'playback' },
    { id: 'btn-bwd', type: 'button', col: 1, row: 4, w: 2, h: 1, action: 'seek_bwd', label: '⏪ 5s 倒退', style: 'btn-secondary', category: 'playback' },
    { id: 'btn-fwd', type: 'button', col: 3, row: 4, w: 2, h: 1, action: 'seek_fwd', label: '5s ⏩ 快進', style: 'btn-secondary', category: 'playback' },
    { id: 'btn-quote', type: 'button', col: 1, row: 5, w: 2, h: 1, action: 'toggle_quote', label: '# 引文開關', style: 'btn-info', category: 'display' },
    { id: 'btn-theme', type: 'button', col: 3, row: 5, w: 2, h: 1, action: 'toggle_theme', label: '🌓 亮暗色', style: 'btn-dark', category: 'display' },
    { id: 'widget-teleprompter', type: 'widget', col: 1, row: 6, w: 4, h: 3, label: '師父開示逐字提詞機', category: 'display' }
  ]
};

// 所有可用按鈕與組件庫存清單 (Arsenal Catalog)
export const ARSENAL_CATALOG = [
  { id: 'header-info', type: 'widget', defaultW: 4, defaultH: 1, label: '時鐘與講次', category: 'info', icon: '⏱️' },
  { id: 'widget-teleprompter', type: 'widget', defaultW: 4, defaultH: 3, label: '師父開示逐字提詞機', category: 'display', icon: '📜' },
  { id: 'btn-play', type: 'button', defaultW: 2, defaultH: 2, action: 'play', label: '▶ 播放', style: 'btn-play', category: 'playback', icon: '▶' },
  { id: 'btn-stop', type: 'button', defaultW: 2, defaultH: 2, action: 'stop', label: '⏹ 停止', style: 'btn-stop', category: 'playback', icon: '⏹' },
  { id: 'btn-bwd', type: 'button', defaultW: 2, defaultH: 1, action: 'seek_bwd', label: '⏪ 5s 倒退', style: 'btn-secondary', category: 'playback', icon: '⏪' },
  { id: 'btn-fwd', type: 'button', defaultW: 2, defaultH: 1, action: 'seek_fwd', label: '5s ⏩ 快進', style: 'btn-secondary', category: 'playback', icon: '⏩' },
  { id: 'btn-quote', type: 'button', defaultW: 2, defaultH: 1, action: 'toggle_quote', label: '# 引文開關', style: 'btn-info', category: 'display', icon: '#' },
  { id: 'btn-theme', type: 'button', defaultW: 2, defaultH: 1, action: 'toggle_theme', label: '🌓 亮暗色', style: 'btn-dark', category: 'display', icon: '🌓' },
  { id: 'btn-scroll-mode', type: 'button', defaultW: 2, defaultH: 1, action: 'toggle_scroll', label: '📜 持續捲動', style: 'btn-primary', category: 'display', icon: '📜' },
  { id: 'btn-speech-lead', type: 'button', defaultW: 2, defaultH: 1, action: 'toggle_speech_lead', label: '🗣️ 播稿模式', style: 'btn-primary', category: 'display', icon: '🗣️' },
  { id: 'btn-loop-interval', type: 'button', defaultW: 2, defaultH: 1, action: 'loop_interval', label: '🔁 段落循環', style: 'btn-warning', category: 'playback', icon: '🔁' },
  { id: 'btn-prev-lecture', type: 'button', defaultW: 2, defaultH: 1, action: 'prev_lecture', label: '⏮ 上一講', style: 'btn-secondary', category: 'navigation', icon: '⏮' },
  { id: 'btn-next-lecture', type: 'button', defaultW: 2, defaultH: 1, action: 'next_lecture', label: '⏭ 下一講', style: 'btn-secondary', category: 'navigation', icon: '⏭' },
  { id: 'btn-fullscreen', type: 'button', defaultW: 2, defaultH: 1, action: 'fullscreen', label: '⛶ 全螢幕', style: 'btn-dark', category: 'display', icon: '⛶' }
];

export class MobileLayoutStore {
  constructor(filePath = LAYOUT_FILE) {
    this.filePath = filePath;
    this.ensureDataDir();
  }

  ensureDataDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  getLayout() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (this.validate(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('[MobileLayoutStore] 讀取配置失敗，回退至預設佈局:', e.message);
    }
    return JSON.parse(JSON.stringify(DEFAULT_MOBILE_LAYOUT));
  }

  saveLayout(layoutData) {
    if (!this.validate(layoutData)) {
      throw new Error('佈局資料結構不合法或超出 4x8 邊界');
    }
    const cleanData = {
      version: layoutData.version || '1.0.0',
      updatedAt: Date.now(),
      grid: { cols: 4, rows: 8 },
      items: layoutData.items.map(item => ({
        id: String(item.id),
        type: item.type === 'widget' ? 'widget' : 'button',
        col: Number(item.col),
        row: Number(item.row),
        w: Number(item.w),
        h: Number(item.h),
        action: item.action ? String(item.action) : undefined,
        label: String(item.label || item.id),
        style: item.style ? String(item.style) : undefined,
        category: item.category ? String(item.category) : undefined
      }))
    };
    fs.writeFileSync(this.filePath, JSON.stringify(cleanData, null, 2), 'utf8');
    return cleanData;
  }

  resetLayout() {
    const defaultData = JSON.parse(JSON.stringify(DEFAULT_MOBILE_LAYOUT));
    defaultData.updatedAt = Date.now();
    fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf8');
    return defaultData;
  }

  validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.grid || data.grid.cols !== 4 || data.grid.rows !== 8) return false;
    if (!Array.isArray(data.items)) return false;

    for (const it of data.items) {
      if (!it.id || typeof it.id !== 'string') return false;
      const col = Number(it.col);
      const row = Number(it.row);
      const w = Number(it.w);
      const h = Number(it.h);
      if (isNaN(col) || isNaN(row) || isNaN(w) || isNaN(h)) return false;
      if (col < 1 || col > 4) return false;
      if (row < 1 || row > 8) return false;
      if (w < 1 || col + w - 1 > 4) return false;
      if (h < 1 || row + h - 1 > 8) return false;
    }
    return true;
  }

  getCatalog() {
    return ARSENAL_CATALOG;
  }
}
