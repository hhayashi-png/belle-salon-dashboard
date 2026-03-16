#!/usr/bin/env node
/**
 * generate-weekly-report.js
 * 週次レポートを生成してSlack送信用JSONを作成する
 * 
 * 使用方法:
 *   node scripts/generate-weekly-report.js
 * 
 * 環境変数:
 *   SLACK_WEBHOOK_URL - Slack Incoming Webhook URL
 */

const fs = require('fs');
const path = require('path');

// ===== CSVパース =====
function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) {
    console.warn(`⚠ CSV not found: ${filepath}`);
    return [];
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  });
}

function parseCSVRaw(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => line.split(',').map(v => v.trim()));
}

// ===== COL INDEX =====
const COL = {
  STORE_NAME: 0, DATE: 2, ORDER_ID: 4, CATEGORY: 7, ITEM: 8,
  UNIT_PRICE: 9, AMOUNT: 11, M: 12, STAFF: 15,
  CUSTOMER_NAME: 16, CUSTOMER_ID: 18, NEW_RETURN: 21, Y_STORE: 25
};

function safe(row, idx) { return row && row[idx] !== undefined ? String(row[idx]).trim() : ''; }
function safeNum(row, idx) { const v = safe(row, idx); return isNaN(parseFloat(v)) ? 0 : parseFloat(v); }

function yen(v) { return `¥${Math.round(v || 0).toLocaleString('ja-JP')}`; }
function pct(v) { return `${Math.round(v || 0)}%`; }

// ===== データ読み込み =====
const dataDir = path.join(__dirname, '..', 'data');
const salesRows = parseCSVRaw(path.join(dataDir, 'sales.csv'));
const targets = parseCSV(path.join(dataDir, 'targets.csv'));

// ===== KPI計算 =====
function getStores() {
  return [...new Set(salesRows.map(r => safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME)).filter(Boolean))];
}

function filterByStore(rows, store) {
  return rows.filter(r => (safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME)) === store);
}

function getOrders(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const id = safe(r, COL.ORDER_ID);
    if (!id || seen.has(id)) return false;
    seen.add(id); return true;
  });
}

function isKaisu(row) {
  return safe(row, COL.ITEM).includes('回数券') || safe(row, COL.CATEGORY).includes('回数券');
}

function computeStoreKPIs() {
  return getStores().map(store => {
    const storeRows = filterByStore(salesRows, store);
    const orders = getOrders(storeRows);
    const totalSales = storeRows.reduce((s, r) => s + safeNum(r, COL.AMOUNT), 0);
    const newOrders = orders.filter(r => safe(r, COL.NEW_RETURN) === '新規');
    const newCount = newOrders.length;
    const paidOrders = orders.filter(r => safeNum(r, COL.AMOUNT) > 0);
    const avgUnitPrice = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

    const newContractOrders = newOrders.filter(r => {
      const orderRows = storeRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const newContractRate = newCount > 0 ? (newContractOrders.length / newCount) * 100 : 0;

    const returnOrders = orders.filter(r => safe(r, COL.NEW_RETURN) === '再来');
    const returnContractOrders = returnOrders.filter(r => {
      const orderRows = storeRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const continuationRate = returnOrders.length > 0 ? (returnContractOrders.length / returnOrders.length) * 100 : 0;

    const target = targets.find(t => t.store === store) || {};
    const newTarget = parseFloat(target.new_target) || 0;
    const salesTarget = parseFloat(target.sales_target) || 0;
    const contractRateTarget = parseFloat(target.contract_rate_target) || 0;
    const newAchRate = newTarget > 0 ? (newCount / newTarget) * 100 : 0;
    const salesAchRate = salesTarget > 0 ? (totalSales / salesTarget) * 100 : 0;

    return { store, totalSales, newCount, newTarget, newAchRate, salesTarget, salesAchRate,
             avgUnitPrice, newContractRate, contractRateTarget, continuationRate };
  });
}

function computeStaffRankings() {
  const staffMap = {};
  salesRows.forEach(r => {
    const staff = safe(r, COL.STAFF);
    if (!staff) return;
    if (!staffMap[staff]) {
      staffMap[staff] = { name: staff, store: safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME), totalSales: 0, newCount: 0, contractCount: 0 };
    }
    staffMap[staff].totalSales += safeNum(r, COL.AMOUNT);
  });

  Object.keys(staffMap).forEach(staff => {
    const staffRows = salesRows.filter(r => safe(r, COL.STAFF) === staff);
    const orders = getOrders(staffRows);
    const newOrders = orders.filter(r => safe(r, COL.NEW_RETURN) === '新規');
    staffMap[staff].newCount = newOrders.length;
    const contractOrders = newOrders.filter(r => {
      const orderRows = staffRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    staffMap[staff].contractCount = contractOrders.length;
    staffMap[staff].contractRate = newOrders.length > 0 ? (contractOrders.length / newOrders.length) * 100 : 0;
  });

  return Object.values(staffMap);
}

function computeChurnAlerts() {
  const kaisuMap = {};
  salesRows.forEach(r => {
    if (!isKaisu(r)) return;
    const cid = safe(r, COL.CUSTOMER_ID);
    const cname = safe(r, COL.CUSTOMER_NAME);
    const date = safe(r, COL.DATE);
    const amount = safeNum(r, COL.AMOUNT);
    if (!cid) return;
    if (!kaisuMap[cid]) kaisuMap[cid] = { cid, cname, lastVisit: date, totalSales: 0 };
    kaisuMap[cid].totalSales += amount;
    if (date > kaisuMap[cid].lastVisit) kaisuMap[cid].lastVisit = date;
  });
  const now = new Date();
  return Object.values(kaisuMap).map(c => {
    const last = new Date(c.lastVisit);
    const days = isNaN(last) ? 0 : Math.floor((now - last) / 86400000);
    return { ...c, daysSince: days, risk: days > 60 ? 'high' : days > 30 ? 'medium' : 'low' };
  }).filter(c => c.risk !== 'low');
}

// ===== Slackメッセージ生成 =====
function generateSlackReport() {
  const storeKPIs = computeStoreKPIs();
  const staffRankings = computeStaffRankings();
  const churnAlerts = computeChurnAlerts();
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const totalSales = storeKPIs.reduce((s, k) => s + k.totalSales, 0);
  const totalNew = storeKPIs.reduce((s, k) => s + k.newCount, 0);
  const totalNewTarget = storeKPIs.reduce((s, k) => s + k.newTarget, 0);
  const avgContractRate = storeKPIs.length ? storeKPIs.reduce((s, k) => s + k.newContractRate, 0) / storeKPIs.length : 0;

  // SVアクション生成
  const svActions = [];
  storeKPIs.forEach(k => {
    if (k.newContractRate < 50) svActions.push(`【${k.store}】契約率低下(${pct(k.newContractRate)}) → カウンセリング同席・トーク改善`);
    if (k.newAchRate < 70) svActions.push(`【${k.store}】新規不足(${k.newCount}/${k.newTarget}件) → HPBクーポン改善・口コミ促進`);
    if (k.avgUnitPrice < 10000) svActions.push(`【${k.store}】平均単価低下 → 上位メニュー提案強化`);
  });

  // HPBアラート
  const hpbAlerts = storeKPIs
    .filter(k => k.newAchRate < 80)
    .map(k => `⚠ ${k.store}: 新規${k.newCount}/${k.newTarget}件 (${pct(k.newAchRate)}達成)`);

  // スタッフランキング（売上Top3）
  const salesRank = [...staffRankings].sort((a, b) => b.totalSales - a.totalSales).slice(0, 3);
  const contractRank = [...staffRankings].sort((a, b) => b.contractRate - a.contractRate).slice(0, 3);

  const report = `
━━━━━━━━━━━━━━━━━━━━
📊 *週次サロンレポート*
${today}
━━━━━━━━━━━━━━━━━━━━

■ *全体KPI*
💴 総売上: *${yen(totalSales)}*
✨ 新規: *${totalNew}件* (目標${totalNewTarget}件)
📝 平均契約率: *${pct(avgContractRate)}*

━━━━━━━━━━━━━━━━━━━━
■ *店舗別進捗*
${storeKPIs.map(k => `
🏪 *${k.store}*
  売上: ${yen(k.totalSales)} (${pct(k.salesAchRate)})
  新規: ${k.newCount}件/${k.newTarget}件 (${pct(k.newAchRate)})
  契約率: ${pct(k.newContractRate)} | 継続率: ${pct(k.continuationRate)}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━
■ *スタッフランキング*

💴 売上Top3
${salesRank.map((s, i) => `${['🥇','🥈','🥉'][i]} ${s.name} ${yen(s.totalSales)}`).join('\n')}

📝 契約率Top3
${contractRank.map((s, i) => `${['🥇','🥈','🥉'][i]} ${s.name} ${pct(s.contractRate)}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━
${hpbAlerts.length ? `■ *HPBアラート*\n${hpbAlerts.join('\n')}\n推奨: 口コミ強化・クーポン見直し\n\n━━━━━━━━━━━━━━━━━━━━` : ''}
${churnAlerts.length ? `■ *顧客離脱アラート*\n${churnAlerts.slice(0, 5).map(c => `⚠ ${c.cname} (最終来店${c.daysSince}日前)`).join('\n')}\n推奨: DM送信・電話フォロー\n\n━━━━━━━━━━━━━━━━━━━━` : ''}
${svActions.length ? `■ *SVアクション*\n${svActions.join('\n')}\n\n━━━━━━━━━━━━━━━━━━━━` : ''}

✅ 詳細はダッシュボードを確認してください
`.trim();

  return report;
}

// ===== 出力 =====
const report = generateSlackReport();
console.log(report);

// ファイル保存（GitHub Actionsで使用）
const outputPath = path.join(__dirname, '..', 'weekly-report.txt');
fs.writeFileSync(outputPath, report, 'utf-8');
console.log(`\n✅ レポートを ${outputPath} に保存しました`);

module.exports = { generateSlackReport };
