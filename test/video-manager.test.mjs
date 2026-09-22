/**
 * 🧪 AMRTF 影片離線快取與管理模組 (VideoManager) 單元測試
 * 採用 Node.js 原生 node:test 與 node:assert/strict
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VideoManager } from '../src/server/video-manager.js';

describe('🎬 VideoManager 離線影片管理器單元測試', () => {
  const vm = new VideoManager();

  test('✅ 應包含大慈恩研討專用 3 支影片定義 (prep, migtsema, dedication)', () => {
    const status = vm.getStatus();
    assert.ok(status.videos, '應該返回 videos 字典');
    assert.ok(status.videos.prep, '應該包含前行影片 prep');
    assert.ok(status.videos.migtsema, '應該包含密集嘛影片 migtsema');
    assert.ok(status.videos.dedication, '應該包含迴向影片 dedication');

    assert.strictEqual(status.videos.prep.filename, 'prep.mp4');
    assert.strictEqual(status.videos.migtsema.filename, 'migtsema.mp4');
    assert.strictEqual(status.videos.dedication.filename, 'dedication.mp4');
  });

  test('✅ 狀態輸出應包含儲存路徑與工具狀態', () => {
    const status = vm.getStatus();
    assert.ok(status.videoDir, '應該回傳 videoDir 目錄路徑');
    assert.ok(typeof status.hasYtDlp === 'boolean', '應該回傳 hasYtDlp 布林旗標');
    assert.ok(typeof status.isDownloading === 'boolean', '應該回傳 isDownloading 布林旗標');
  });

  test('✅ 各影片狀態應包含存在性與檔案大小欄位', () => {
    const status = vm.getStatus();
    for (const [key, item] of Object.entries(status.videos)) {
      assert.ok(typeof item.exists === 'boolean', `${key} 應包含 exists 布林值`);
      assert.ok(typeof item.sizeMb === 'number', `${key} 應包含 sizeMb 數值`);
      assert.ok(item.title, `${key} 應包含標題`);
    }
  });
});
