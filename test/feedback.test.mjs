import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FeedbackService } from '../src/server/feedback-service.js';

describe('💬 [FeedbackService] 使用者意見與問題回饋服務測試', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amrtf-feedback-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  test('🛡️ 空白內容必須被嚴格阻擋並拋出例外', async () => {
    const service = new FeedbackService({ feedbackDir: tempDir });
    await assert.rejects(
      async () => {
        await service.processFeedback({ content: '   ' });
      },
      /回饋內容不可為空/
    );
  });

  test('💾 本地 JSON 安全存檔備份與欄位完整性驗證 (100% 離線防護)', async () => {
    let capturedFetchUrl = null;
    let capturedFetchOptions = null;

    const mockFetch = async (url, options) => {
      capturedFetchUrl = url;
      capturedFetchOptions = options;
      return { ok: true, json: async () => ({ success: true }) };
    };

    const service = new FeedbackService({
      feedbackDir: tempDir,
      targetEmail: 'truechi2687@gmail.com',
      fetchFn: mockFetch
    });

    const inputData = {
      date: '2026-10-05 21:30',
      lesson: '第 123 講',
      clock: '14:25',
      status: '第 123 講 ｜ 14:25 ｜ 宣紙淺色 ｜ 持續捲動 ｜ 播稿關',
      content: '希望在頂部增加快捷時間書籤功能！',
      contact: '王小明 (Line: test1234)'
    };

    const result = await service.processFeedback(inputData);

    assert.strictEqual(result.ok, true);
    assert.ok(result.filename.startsWith('FEEDBACK-'));
    assert.strictEqual(fs.existsSync(result.filePath), true);

    const savedContent = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
    assert.strictEqual(savedContent.targetEmail, 'truechi2687@gmail.com');
    assert.strictEqual(savedContent.lesson, '第 123 講');
    assert.strictEqual(savedContent.clock, '14:25');
    assert.strictEqual(savedContent.content, '希望在頂部增加快捷時間書籤功能！');
    assert.strictEqual(savedContent.contact, '王小明 (Line: test1234)');
    assert.strictEqual(savedContent.fillDate, '2026-10-05 21:30');

    // 驗證 Email 轉發 Payload 正確發往 truechi2687@gmail.com
    assert.strictEqual(capturedFetchUrl, 'https://formsubmit.co/ajax/truechi2687@gmail.com');
    assert.ok(capturedFetchOptions);
    assert.strictEqual(capturedFetchOptions.headers.Referer, 'https://my-amrtf.web.app/feedback');
    assert.strictEqual(capturedFetchOptions.headers.Origin, 'https://my-amrtf.web.app');
    const body = JSON.parse(capturedFetchOptions.body);
    assert.strictEqual(body._subject, '【AMRTF-Desk 使用者回饋】第 123 講');
    assert.strictEqual(body._template, 'table');
    assert.strictEqual(body._captcha, 'false');
    assert.strictEqual(body.研討講次, '第 123 講');
    assert.strictEqual(body.時間碼, '14:25');
    assert.strictEqual(body.回饋內容, '希望在頂部增加快捷時間書籤功能！');
    assert.strictEqual(body.提報者聯絡方式, '王小明 (Line: test1234)');
  });

  test('🌐 雲端發送失敗 (離線/斷網) 時本地備份依然必須百分之百成功', async () => {
    const brokenFetch = () => {
      return Promise.reject(new Error('Network Offline Simulation'));
    };

    const service = new FeedbackService({
      feedbackDir: tempDir,
      targetEmail: 'truechi2687@gmail.com',
      fetchFn: brokenFetch
    });

    const result = await service.processFeedback({
      lesson: '第 01 講',
      clock: '00:00',
      content: '離線時的回饋測試'
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.existsSync(result.filePath), true);
    const saved = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
    assert.strictEqual(saved.content, '離線時的回饋測試');
  });
});
