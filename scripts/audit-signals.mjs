#!/usr/bin/env node
/**
 * 🛰️ 全域信令合約真實性靜態審計器 (Signal Contract Hard-Lock Linter)
 * 遵循 Master Constitution 鐵律：徹底消滅 Mock 假象與寫死假清單！
 * 
 * 靜態掃描所有前端發送端 (web-remote.js, mobile-studio-drawer.js, desk.js, ARSENAL_CATALOG)
 * 比對中間路由 (server.mjs dispatchCommand) 與終端執行者 (amrtf-runtime.js)，
 * 發送端與接收端差集必須為 0 (S_client ⊆ S_receivers)，否則物理阻斷 CI 與發布！
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ARSENAL_CATALOG } from '../src/server/mobile-layout-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 檔案路徑清單
const FILES = {
  webRemote: path.join(projectRoot, 'src', 'server', 'web-remote.js'),
  mobileDrawer: path.join(projectRoot, 'src', 'desk', 'modules', 'mobile-studio-drawer.js'),
  deskJs: path.join(projectRoot, 'src', 'desk', 'desk.js'),
  companionBridge: path.join(projectRoot, 'src', 'server', 'companion-bridge.js'),
  serverMjs: path.join(projectRoot, 'server.mjs'),
  runtimeJs: path.join(projectRoot, 'src', 'injected', 'amrtf-runtime.js')
};

// 輔助函式：從文字中根據正則提取指令並附帶檔案及行號資訊
function extractSignalsWithLocation(filePath, regexes) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    for (const re of regexes) {
      // 確保正則為全域搜尋
      const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = globalRe.exec(line)) !== null) {
        if (m[1] && !m[1].includes('${') && !m[1].includes('+')) {
          results.push({
            cmd: m[1].trim(),
            file: path.relative(projectRoot, filePath),
            line: lineNum,
            snippet: line.trim()
          });
        }
      }
    }
  });

  return results;
}

function runAudit() {
  console.log('================================================================');
  console.log('🛰️ 正在執行【真信號全鏈路 · 前端發送 ⟷ 後端/放映艙分發】差集硬鎖審計');
  console.log('================================================================\n');

  // 1. 抽取所有前端發送端的信令
  const senders = [];

  // (1) web-remote.js 中的 sendCommand('...')
  senders.push(...extractSignalsWithLocation(FILES.webRemote, [
    /sendCommand\(\s*['"]([^'"]+)['"]/g
  ]));

  // (2) mobile-studio-drawer.js 中的 sendLiveCmd('...')
  senders.push(...extractSignalsWithLocation(FILES.mobileDrawer, [
    /sendLiveCmd\(\s*['"]([^'"]+)['"]/g
  ]));

  // (3) desk.js 中的 sendCmd('...')
  senders.push(...extractSignalsWithLocation(FILES.deskJs, [
    /sendCmd\(\s*['"]([^'"]+)['"]/g
  ]));

  // (4) ARSENAL_CATALOG 中的 action 定義（實體按鈕鍵盤目錄）
  if (Array.isArray(ARSENAL_CATALOG)) {
    for (const item of ARSENAL_CATALOG) {
      if (item.action) {
        senders.push({
          cmd: item.action,
          file: 'src/server/mobile-layout-store.js (ARSENAL_CATALOG)',
          line: 0,
          snippet: `id: ${item.id}, label: ${item.label}`
        });
      }
    }
  }

  // 去重並建立發送端信令對照表
  const senderMap = new Map(); // cmd -> Array of locations
  for (const s of senders) {
    if (!senderMap.has(s.cmd)) {
      senderMap.set(s.cmd, []);
    }
    senderMap.get(s.cmd).push(s);
  }

  console.log(`📡 [前端掃描] 於前端原始碼共捕獲 ${senderMap.size} 種發送信令 (來自 ${senders.length} 處實體呼叫點)。\n`);

  // 2. 抽取接收端支援的所有信令
  // 接收端包含兩層：
  // A. server.mjs 的 dispatchCommand (中間路由器，攔截導航、視窗等特權信令)
  // B. amrtf-runtime.js (放映艙終端執行者，處理播控、段落、引文等)
  const serverHandlers = new Set();
  const runtimeHandlers = new Set();

  // A. 掃描 server.mjs
  if (fs.existsSync(FILES.serverMjs)) {
    const serverCode = fs.readFileSync(FILES.serverMjs, 'utf8');
    const dispatchMatches = serverCode.matchAll(/cmd\s*===\s*['"]([^'"]+)['"]/g);
    for (const m of dispatchMatches) serverHandlers.add(m[1]);
    const caseMatches = serverCode.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g);
    for (const m of caseMatches) serverHandlers.add(m[1]);
  }

  // B. 掃描 amrtf-runtime.js
  if (fs.existsSync(FILES.runtimeJs)) {
    const runtimeCode = fs.readFileSync(FILES.runtimeJs, 'utf8');
    // (a) COMMAND_NORMALIZE_MAP
    const mapBlock = runtimeCode.match(/const\s+COMMAND_NORMALIZE_MAP\s*=\s*\{([\s\S]*?)\};/);
    if (mapBlock) {
      const keyMatches = mapBlock[1].matchAll(/['"]([^'"]+)['"]\s*:/g);
      for (const m of keyMatches) {
        runtimeHandlers.add(m[1]);
      }
    }
    // (b) switch (cmd) case '...'
    const caseMatches = runtimeCode.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g);
    for (const m of caseMatches) {
      runtimeHandlers.add(m[1]);
    }
  }

  console.log(`🛡️ [接收端掃描] 捕獲支援清單:`);
  console.log(`   - server.mjs (中樞攔截): ${serverHandlers.size} 個 [${Array.from(serverHandlers).join(', ')}]`);
  console.log(`   - amrtf-runtime.js (放映艙): ${runtimeHandlers.size} 個\n`);

  // 3. 差集計算：S_client \ (S_server ∪ S_runtime)
  const missing = [];
  const matched = [];

  for (const [cmd, locs] of senderMap.entries()) {
    const handledByServer = serverHandlers.has(cmd);
    const handledByRuntime = runtimeHandlers.has(cmd);

    if (handledByServer || handledByRuntime) {
      const target = handledByServer ? 'server.mjs' : 'amrtf-runtime.js';
      matched.push({ cmd, target, locCount: locs.length });
    } else {
      missing.push({ cmd, locs });
    }
  }

  // 4. 印出審計報告
  matched.sort((a, b) => a.cmd.localeCompare(b.cmd));
  console.log('| 發送信令 (Client Action) | 接收處理端 (Receiver) | 呼叫點次數 | 判定 |');
  console.log('| :--- | :--- | :---: | :---: |');
  for (const item of matched) {
    console.log(`| \`${item.cmd}\` | ${item.target} | ${item.locCount} | ✅ PASS |`);
  }

  if (missing.length > 0) {
    console.log('\n🚨 ==================== 發現致命信令差集 (FAIL) ====================');
    console.error(`❌ 共發現 ${missing.length} 個前端已發送，但後端與放映艙皆未實作的脫節信令：\n`);
    for (const item of missing) {
      console.error(`🔴 脫節信令: 【${item.cmd}】`);
      for (const l of item.locs) {
        console.error(`   - 檔案: ${l.file}:${l.line}`);
        if (l.snippet) console.error(`     代碼: ${l.snippet}`);
      }
    }
    console.log('==================================================================');
    console.error(`🚨 [AUDIT HARD-LOCK TRIGGERED] 信令合約差集大於 0，物理阻斷發布！`);
    process.exit(1);
  }

  // 5. 特殊業務合約深度檢驗：講次跳轉 (goto_lesson & load_lecture) 雙協議合約檢驗
  console.log('\n🔍 [深度合約檢查] 正在驗證講次跳轉關鍵鏈路...');
  if (!serverHandlers.has('goto_lesson')) {
    console.error('❌ server.mjs 必須具備 goto_lesson 處理器！');
    process.exit(1);
  }
  if (!serverHandlers.has('load_lecture')) {
    console.error('❌ server.mjs 必須具備 load_lecture 雙向相容處理器！');
    process.exit(1);
  }
  console.log('   ✅ goto_lesson / load_lecture 雙協議在 server.mjs 完全具備且對齊！');

  console.log('\n----------------------------------------------------------------');
  console.log(`🎉 [AUDIT ALL PASS] 靜態審計通過！前端共 ${senderMap.size} 種信令 100% 存在真實處理端，差集為 0！`);
  console.log('----------------------------------------------------------------\n');
  process.exit(0);
}

runAudit();
