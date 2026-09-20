#!/usr/bin/env node
/**
 * 🛰️ 全域信令合約靜態審計器 (Signal Contract Linter)
 * 驗證手機端 (ARSENAL_CATALOG / web-remote / mobile-studio-drawer)
 * 與放映艙 (amrtf-runtime.js) 的指令對齊狀態，0 差集方可放行。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ARSENAL_CATALOG } from '../src/server/mobile-layout-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNTIME_FILE = path.join(__dirname, '..', 'src', 'injected', 'amrtf-runtime.js');

function runAudit() {
  console.log('====================================================');
  console.log('🛰️ 正在執行【手機信令 ⟷ 放映艙指令分發】合約閉環審計...');
  console.log('====================================================');

  if (!fs.existsSync(RUNTIME_FILE)) {
    console.error(`❌ 放映艙注入腳本不存在: ${RUNTIME_FILE}`);
    process.exit(1);
  }

  const runtimeCode = fs.readFileSync(RUNTIME_FILE, 'utf8');

  // 1. 萃取放映艙中支援的指令集 (case '...' 與 COMMAND_NORMALIZE_MAP 的 keys)
  const supportedCmds = new Set();

  // 萃取 case '...'
  const caseMatches = runtimeCode.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g);
  for (const m of caseMatches) {
    supportedCmds.add(m[1]);
  }

  // 萃取 COMMAND_NORMALIZE_MAP 中的 keys
  const mapBlock = runtimeCode.match(/const\s+COMMAND_NORMALIZE_MAP\s*=\s*\{([\s\S]*?)\};/);
  if (mapBlock) {
    const keyMatches = mapBlock[1].matchAll(/['"]([^'"]+)['"]\s*:/g);
    for (const m of keyMatches) {
      supportedCmds.add(m[1]);
    }
  }

  // 2. 萃取發送端宣告的所有 actions
  const senderActions = new Set();

  // 來自 ARSENAL_CATALOG
  for (const item of ARSENAL_CATALOG) {
    if (item.action) senderActions.add(item.action);
  }

  // 來自額外常用直通信令
  const extraKnownActions = [
    'toggle_theme',
    'toggle_speech_lead',
    'toggle_scroll',
    'toggle_scroll_mode',
    'seek_quote',
    'loop_interval',
    'play_interval',
    'stop_interval',
    'prev_lecture',
    'next_lecture',
    'fullscreen',
    'close_video'
  ];
  for (const act of extraKnownActions) {
    senderActions.add(act);
  }

  // 3. 逐一比對
  let missingCount = 0;
  console.log('| 來源 Action | 放映艙支援狀態 | 判定 |');
  console.log('| :--- | :--- | :--- |');

  for (const act of Array.from(senderActions).sort()) {
    const isSupported = supportedCmds.has(act);
    if (isSupported) {
      console.log(`| \`${act}\` | ✅ 映射成功 | PASS |`);
    } else {
      console.log(`| \`${act}\` | ❌ 未在接收端找到處理器 | FAIL |`);
      missingCount++;
    }
  }

  console.log('----------------------------------------------------');
  if (missingCount > 0) {
    console.error(`🚨 [AUDIT FAILED] 發現 ${missingCount} 個未對齊的指令！物理阻斷交付！`);
    process.exit(1);
  } else {
    console.log(`🎉 [AUDIT PASSED] 全部 ${senderActions.size} 個手機端信令 100% 完美對齊放映艙！`);
    process.exit(0);
  }
}

runAudit();
