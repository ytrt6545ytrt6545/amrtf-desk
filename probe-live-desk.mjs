// ==============================================================================
// 🔬 AMRTF-Desk 現場活體探測與功能驗證腳本 (Live Desk Probe)
// ==============================================================================

import http from 'http';

function checkHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runLiveProbe() {
  console.log('==================================================================');
  console.log('🔬 AMRTF-Desk 現場真實性與功能自動化測試');
  console.log('==================================================================\n');

  // 1. 檢測 HTTP 靜態與模組端點
  const endpoints = [
    { name: '主控台頁面 (/desk)', path: 'http://127.0.0.1:9998/desk' },
    { name: '主樣式表 (/desk.css)', path: 'http://127.0.0.1:9998/desk.css' },
    { name: '主邏輯 (/desk.js)', path: 'http://127.0.0.1:9998/desk.js' },
    { name: '持久化模組 (/modules/deck-storage.js)', path: 'http://127.0.0.1:9998/modules/deck-storage.js' },
    { name: '畫布模組 (/modules/deck-canvas.js)', path: 'http://127.0.0.1:9998/modules/deck-canvas.js' }
  ];

  console.log('--- [步驟 1/3] 正在檢驗伺服器端點健全度 ---');
  for (const ep of endpoints) {
    try {
      const res = await checkHttp(ep.path);
      if (res.status === 200) {
        console.log(`✅ [200 OK] ${ep.name} (大小: ${res.data.length} bytes)`);
      } else {
        console.error(`❌ [${res.status}] ${ep.name}`);
      }
    } catch (e) {
      console.error(`❌ 連線失敗: ${ep.name} - ${e.message}`);
    }
  }

  // 2. 檢測 9222 CDP 分頁
  console.log('\n--- [步驟 2/3] 正在探測 Chromium CDP 視窗分頁 (Port 9222) ---');
  try {
    const cdpRes = await checkHttp('http://127.0.0.1:9222/json');
    if (cdpRes.status === 200) {
      const pages = JSON.parse(cdpRes.data);
      console.log(`✅ 成功連線 CDP！目前偵測到 ${pages.length} 個分頁:`);
      pages.forEach((p, idx) => {
        console.log(`   [${idx + 1}] Type: ${p.type} | Title: "${p.title}" | URL: ${p.url}`);
      });
    }
  } catch (e) {
    console.log('ℹ️ Chromium 9222 未開放或採用非 CDP 模式啟動 (可直接透過無頭瀏覽器連線檢測)');
  }

  // 3. 檢驗 index.html 內部關鍵元素
  console.log('\n--- [步驟 3/3] 正在驗證 HTML 內部自訂畫布元素 ---');
  try {
    const deskHtml = await checkHttp('http://127.0.0.1:9998/desk');
    const html = deskHtml.data;
    
    const checks = [
      { tag: '編輯按鈕', target: 'id="btnEditLayoutToggle"' },
      { tag: '未上陣倉庫', target: 'id="deckDrawerContainer"' },
      { tag: '8 欄網格容器', target: 'id="deckGridContainer"' },
      { tag: '全功能模板按鈕', target: 'id="btnTemplateFull"' },
      { tag: '極簡模板按鈕', target: 'id="btnTemplateMinimal"' },
      { tag: '恢復預設按鈕', target: 'id="btnResetLayout"' },
      { tag: 'deck-storage 腳本引導', target: 'src="modules/deck-storage.js"' },
      { tag: 'deck-canvas 腳本引導', target: 'src="modules/deck-canvas.js"' }
    ];

    checks.forEach(c => {
      if (html.includes(c.target)) {
        console.log(`✅ ${c.tag} 存在：${c.target}`);
      } else {
        console.error(`❌ 遺漏：${c.tag}`);
      }
    });

  } catch (e) {
    console.error('❌ 讀取 /desk 失敗:', e.message);
  }

  console.log('\n==================================================================');
  console.log('🎉 現場活體探測完成！');
  console.log('==================================================================');
}

runLiveProbe();
