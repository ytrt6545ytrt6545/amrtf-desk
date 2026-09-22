// ==============================================================================
// 🎬 AMRTF-Desk 影片離線快取與管理深模組 (Video Manager)
// 負責檢測本機 1080p 影片資產、提供進度回報，以及後台靜默下載
// ==============================================================================

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const assetsDir = path.join(projectRoot, 'assets', 'videos');
const binDir = path.join(projectRoot, 'bin');

export const VIDEO_CONFIGS = [
  { key: 'prep', fileName: 'prep.mp4', title: '前行緣念 (聖號/開經偈/皈依發心)', ytId: '9hFq1l8RoUM', approxMB: 10 },
  { key: 'migtsema', fileName: 'migtsema.mp4', title: '密集嘛 經典版官方 MV', ytId: 'oVynEvkuj4M', approxMB: 169 },
  { key: 'dedication', fileName: 'dedication.mp4', title: '真如老師恭誦大迴向', ytId: 'E1qFpq1i0fY', approxMB: 6 }
];

export class VideoManager {
  constructor() {
    this.isDownloading = false;
    this.currentStep = '';
    this.progress = 0;
    this.errorMsg = null;
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  }

  getStatus() {
    const list = {};
    const hasYtDlp = fs.existsSync(path.join(binDir, 'yt-dlp.exe'));
    for (const v of VIDEO_CONFIGS) {
      const p = path.join(assetsDir, v.fileName);
      const exists = fs.existsSync(p);
      let sizeMB = 0;
      if (exists) {
        try {
          sizeMB = Math.round((fs.statSync(p).size / (1024 * 1024)) * 10) / 10;
        } catch (e) {}
      }
      list[v.key] = {
        key: v.key,
        title: v.title,
        fileName: v.fileName,
        filename: v.fileName,
        exists,
        sizeMB,
        sizeMb: sizeMB,
        approxMB: v.approxMB
      };
    }

    let statusStr = 'idle';
    if (this.isDownloading) {
      statusStr = 'downloading';
    } else if (this.errorMsg) {
      statusStr = 'error';
    } else if (this.progress >= 100) {
      statusStr = 'completed';
    }

    return {
      videos: list,
      videoDir: assetsDir,
      hasYtDlp,
      isDownloading: this.isDownloading,
      status: statusStr,
      currentStep: this.currentStep,
      step: this.currentStep,
      message: this.currentStep,
      progress: this.progress,
      percent: this.progress,
      error: this.errorMsg
    };
  }

  async startDownloadAll(onProgress = null) {
    if (this.isDownloading) return this.getStatus();

    this.isDownloading = true;
    this.errorMsg = null;
    this.progress = 0;
    this.currentStep = '正在準備下載環境...';

    // 啟動非同步下載任務
    (async () => {
      try {
        const ytdlpPath = await this.ensureYtDlp();

        for (let i = 0; i < VIDEO_CONFIGS.length; i++) {
          const v = VIDEO_CONFIGS[i];
          const outPath = path.join(assetsDir, v.fileName);
          
          this.currentStep = `正在下載【${v.title}】(${i + 1}/${VIDEO_CONFIGS.length})...`;
          this.progress = Math.round((i / VIDEO_CONFIGS.length) * 100);
          if (onProgress) onProgress(this.getStatus());

          await this.downloadSingleVideo(ytdlpPath, v.ytId, outPath, (p) => {
            const overall = Math.round(((i + p / 100) / VIDEO_CONFIGS.length) * 100);
            this.progress = Math.min(99, overall);
            if (onProgress) onProgress(this.getStatus());
          });
        }

        this.progress = 100;
        this.currentStep = '🎉 全數影片下載完成！已切換至本機 1080p 原生秒播！';
      } catch (err) {
        console.error('[VideoManager] 下載影片出錯:', err);
        this.errorMsg = err.message || '下載失敗';
        this.currentStep = `❌ 下載中斷: ${this.errorMsg}`;
      } finally {
        this.isDownloading = false;
        if (onProgress) onProgress(this.getStatus());
      }
    })();

    return this.getStatus();
  }

  async ensureYtDlp() {
    const localExe = path.join(binDir, 'yt-dlp.exe');
    if (fs.existsSync(localExe)) {
      return localExe;
    }

    this.currentStep = '正在下載輕量下載引擎 yt-dlp.exe (約 17MB)...';
    const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    await this.downloadFile(downloadUrl, localExe);
    return localExe;
  }

  downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const get = (targetUrl) => {
        const client = targetUrl.startsWith('https') ? https : http;
        client.get(targetUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} 無法下載`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close(resolve);
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      };
      get(url);
    });
  }

  downloadSingleVideo(ytdlpExe, ytId, outputPath, onSingleProgress) {
    return new Promise((resolve, reject) => {
      // 優先選擇 MP4 1080p / 720p，相容性最高
      const args = [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--no-playlist',
        '--newline',
        '-o', outputPath,
        `https://www.youtube.com/watch?v=${ytId}`
      ];

      const proc = spawn(ytdlpExe, args, { windowsHide: true });

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        // 匹配 [download]  45.2% of 160.00MiB at 5.00MiB/s ETA 00:15
        const m = text.match(/\[download\]\s+([\d\.]+)%/);
        if (m && m[1]) {
          const pct = parseFloat(m[1]);
          if (!isNaN(pct) && onSingleProgress) {
            onSingleProgress(pct);
          }
        }
      });

      proc.stderr.on('data', (d) => {
        // 部分警告輸出不用拋錯
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`yt-dlp 退出碼: ${code}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }
}
