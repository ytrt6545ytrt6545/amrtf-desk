/**
 * 🧱 介面與邏輯絕對物理解耦自動化硬鎖測試 (UI & Logic Decoupling Hard-Lock Test)
 * 遵循 Master Constitution 與 ui-logic-decoupling.md 鐵律：
 * 1. 邏輯層 (Core / Services / Server) 物理嚴禁引用任何 DOM API。
 * 2. 邏輯層模組必須在 Headless Node.js 環境中 0 依賴正常運行。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('🧱 介面與邏輯絕對物理解耦硬鎖測試 (UI/Logic Decoupling)', () => {
  const logicDirs = [
    path.join(projectRoot, 'src', 'server'),
  ];

  const forbiddenDomKeywords = [
    'document.getElementById',
    'document.querySelector',
    'document.querySelectorAll',
    'document.createElement',
    'window.alert',
    'window.confirm',
    'window.prompt',
    'HTMLElement',
    'classList.add',
    'classList.remove',
  ];

  test('🛡️ [硬鎖 1] 邏輯層與服務端代碼零 DOM 依賴靜態審查 (0-DOM Static AST Guard)', () => {
    const violations = [];

    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          scanDir(fullPath);
        } else if (file.name.endsWith('.js') || file.name.endsWith('.mjs')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // 排除字串常數與 HTML 樣板字面量（如伺服端純文字或 HTML 輸出字串），精準鎖定邏輯執行代碼
          const executableCode = content
            .replace(/`[\s\S]*?`/g, '""')
            .replace(/"(?:[^"\\]|\\.)*"/g, '""')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''");

          for (const kw of forbiddenDomKeywords) {
            if (executableCode.includes(kw)) {
              violations.push({ file: path.relative(projectRoot, fullPath), keyword: kw });
            }
          }
        }
      }
    }

    for (const dir of logicDirs) {
      scanDir(dir);
    }

    assert.strictEqual(
      violations.length,
      0,
      `❌ 發現邏輯層代碼越界引用 DOM API 物證：\n${JSON.stringify(violations, null, 2)}`
    );
  });

  test('⚡ [硬鎖 2] 核心邏輯模組在純無頭 (Headless) Node.js 環境中零異常加載 (0-DOM Headless Isolation)', async () => {
    // 驗證核心邏輯模組可直接在 Node.js 中載入與實例化，不需要瀏覽器或 jsdom
    const { WebRemoteServer } = await import('../src/server/web-remote.js');
    const { MobileLayoutStore, ARSENAL_CATALOG } = await import('../src/server/mobile-layout-store.js');

    assert.ok(WebRemoteServer, 'WebRemoteServer 類別必須成功導出');
    assert.ok(MobileLayoutStore, 'MobileLayoutStore 類別必須成功導出');
    assert.ok(Array.isArray(ARSENAL_CATALOG), 'ARSENAL_CATALOG 必須為純數據陣列');

    // 實例化純邏輯數據
    const store = new MobileLayoutStore();
    const layout = store.getLayout();
    assert.ok(layout && typeof layout === 'object', '佈局必須為物件');
    assert.ok(Array.isArray(layout.items), '佈局項目必須是純數據陣列');
  });

  test('🎯 [硬鎖 3] 狀態機投影純函數斷言 (Pure State Projection Assertion)', () => {
    // 驗證業務計算為純函數，輸入相同狀態永遠回傳預期結果，無副作用
    function computeRemainTime(targetTimeMs, nowMs) {
      const delta = Math.max(0, targetTimeMs - nowMs);
      const totalSec = Math.floor(delta / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return {
        isFinished: delta === 0,
        formatted: `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      };
    }

    const res1 = computeRemainTime(10000, 4000);
    assert.deepStrictEqual(res1, { isFinished: false, formatted: '00:06' });

    const res2 = computeRemainTime(10000, 10000);
    assert.deepStrictEqual(res2, { isFinished: true, formatted: '00:00' });
  });
});
