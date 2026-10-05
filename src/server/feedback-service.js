import fs from 'fs';
import path from 'path';

/**
 * 💬 使用者意見與問題回饋服務模組 (FeedbackService)
 * 負責本地安全存檔與非同步雲端 Email 轉發至長官信箱
 */
export class FeedbackService {
  constructor(options = {}) {
    this.feedbackDir = options.feedbackDir || path.join(process.cwd(), 'data', 'feedback');
    this.targetEmail = options.targetEmail || 'truechi2687@gmail.com';
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * 處理回饋提報資料
   * @param {Object} data 提報資料 (date, lesson, clock, status, content, contact)
   * @returns {Promise<{ ok: boolean, filename: string, record: Object }>}
   */
  async processFeedback(data = {}) {
    if (!data.content || !data.content.trim()) {
      throw new Error('回饋內容不可為空');
    }

    if (!fs.existsSync(this.feedbackDir)) {
      fs.mkdirSync(this.feedbackDir, { recursive: true });
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `FEEDBACK-${timestamp}.json`;
    const filePath = path.join(this.feedbackDir, filename);

    const record = {
      timestamp: now.toISOString(),
      fillDate: data.date || now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
      lesson: data.lesson || '',
      clock: data.clock || '',
      status: data.status || '',
      content: data.content.trim(),
      contact: data.contact ? data.contact.trim() : '',
      targetEmail: this.targetEmail
    };

    // 1. 本地安全存檔備份 (100% 離線防護)
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');

    // 2. 雲端非同步直接寄送 Email 至目標信箱
    try {
      if (typeof this.fetchFn === 'function') {
        const emailEndpoint = `https://formsubmit.co/ajax/${this.targetEmail}`;
        const emailPayload = {
          _subject: `【AMRTF-Desk 使用者回饋】${record.lesson || '現場問題提報'}`,
          _template: 'table',
          _captcha: 'false',
          填寫時間: record.fillDate,
          研討講次: record.lesson || '未知講次',
          時間碼: record.clock || '未知時間',
          現場狀態: record.status || '',
          回饋內容: record.content,
          提報者聯絡方式: record.contact || '（未留下聯絡方式）'
        };

        this.fetchFn(emailEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(emailPayload)
        }).catch(err => {
          console.warn('[Feedback] 雲端寄信通道警告 (可能處於離線狀態):', err.message);
        });
      }
    } catch (e) {
      console.warn('[Feedback] 雲端發送非同步異常:', e.message);
    }

    return {
      ok: true,
      filename,
      filePath,
      record
    };
  }
}
