/* =============================================
   BELLE SALON MANAGEMENT OS — script.js
   ============================================= */

'use strict';

// ===== STATE =====
const State = {
  sales: [],
  targets: [],
  staffMaster: [],
  storeMaster: [],
  storeFilter: 'all',
  staffStoreFilter: 'all',
  charts: {}
};

// ===== COLUMN DEFINITIONS (0-indexed) =====
// A=0 店舗名(header), B=1 東京日, C=2 会計日, D=3 会計時間, E=4 会計ID,
// F=5 会計区分, G=6 区分, H=7 カテゴリ, I=8 項目名, J=9 単価, K=10 振興数,
// L=11 金額, M=12 M列, N=13 予約担当者, O=14 指名, P=15 施術担当者,
// Q=16 お客様名, R=17 お客様カナ, S=18 お客様番号, T=19 予約経路,
// U=20 性別, V=21 新規再来, W=22 支払い方法, X=23 レジ担当者, Y=24 親客, Z=25 Y列店舗名
const COL = {
  STORE_NAME: 0,     // A: 店舗名
  DATE: 2,           // C: 会計日
  ORDER_ID: 4,       // E: 会計ID
  CATEGORY: 7,       // H: カテゴリ
  ITEM: 8,           // I: 項目名
  UNIT_PRICE: 9,     // J: 単価
  AMOUNT: 11,        // L: 金額
  M: 12,             // M: 消化判定
  STAFF: 15,         // P: 施術担当者
  CUSTOMER_NAME: 16, // Q: お客様名
  CUSTOMER_ID: 18,   // S: お客様番号
  NEW_RETURN: 21,    // V: 新規再来
  Y_STORE: 25        // Z: Y列店舗名
};

// ===== UTILITY FUNCTIONS =====
const fmt = {
  yen: v => `¥${Math.round(v || 0).toLocaleString('ja-JP')}`,
  pct: v => `${Math.round(v || 0)}%`,
  num: v => Math.round(v || 0).toLocaleString('ja-JP'),
  date: d => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
  }
};

function rateClass(rate) {
  if (rate >= 80) return 'rate-high';
  if (rate >= 60) return 'rate-mid';
  return 'rate-low';
}
function progressClass(rate) {
  if (rate >= 80) return 'high';
  if (rate >= 60) return 'mid';
  return 'low';
}
function makeProgress(val, max) {
  const pct = Math.min(100, Math.round((val / (max || 1)) * 100));
  const cls = progressClass(pct);
  return `<div>${pct}%</div><div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>`;
}

// ===== CSV LOADING =====
async function loadCSV(path) {
  try {
    const resp = await fetch(path + '?v=' + Date.now());
    if (!resp.ok) return [];
    const text = await resp.text();
    const result = Papa.parse(text, { header: false, skipEmptyLines: true });
    const rows = result.data;
    if (rows.length < 2) return [];
    return rows.slice(1); // skip header row
  } catch (e) {
    console.warn(`CSV load failed: ${path}`, e);
    return [];
  }
}
async function loadCSVObj(path) {
  try {
    const resp = await fetch(path + '?v=' + Date.now());
    if (!resp.ok) return [];
    const text = await resp.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data || [];
  } catch (e) {
    console.warn(`CSV load failed: ${path}`, e);
    return [];
  }
}

// ===== DATA LOADING =====
async function loadAllData() {
  document.getElementById('loading-screen').classList.remove('hidden');
  document.getElementById('loading-screen').style.opacity = '1';
  document.getElementById('loading-screen').style.visibility = 'visible';

  try {
    const [sales, targets, staff, stores] = await Promise.all([
      loadCSV('data/sales.csv'),
      loadCSVObj('data/targets.csv'),
      loadCSVObj('data/staff_master.csv'),
      loadCSVObj('data/store_master.csv')
    ]);

    State.sales = sales;
    State.targets = targets;
    State.staffMaster = staff;
    State.storeMaster = stores;

    renderAll();

    document.getElementById('last-updated').textContent = new Date().toLocaleString('ja-JP');
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    // Set current period from data
    const dates = sales.map(r => r[COL.DATE]).filter(Boolean).sort();
    if (dates.length) {
      const d = new Date(dates[dates.length - 1]);
      document.getElementById('current-period').textContent = isNaN(d) ? '2026年3月' : `${d.getFullYear()}年${d.getMonth()+1}月`;
    }

  } catch (e) {
    console.error('Load error', e);
  }

  setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    ls.style.opacity = '0';
    ls.style.visibility = 'hidden';
    ls.classList.add('hidden');
  }, 600);
}

// ===== DATA ANALYSIS =====

/** Get all unique stores */
function getStores() {
  const storeSet = new Set(State.sales.map(r => safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME)).filter(Boolean));
  return [...storeSet];
}

function safe(row, idx) {
  return row && row[idx] !== undefined ? String(row[idx]).trim() : '';
}
function safeNum(row, idx) {
  const v = safe(row, idx);
  return isNaN(parseFloat(v)) ? 0 : parseFloat(v);
}

/** Get unique orders (by order ID) */
function getOrders(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const id = safe(r, COL.ORDER_ID);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Filter rows by store */
function filterByStore(rows, store) {
  if (!store || store === 'all') return rows;
  return rows.filter(r => {
    const s = safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME);
    return s === store;
  });
}

/** Check if row is 新規 */
function isNew(row) { return safe(row, COL.NEW_RETURN) === '新規'; }

/** Check if item is オンダ (not オンダリフト, M≠0) */
function isOndaNew(row) {
  if (!isNew(row)) return false;
  const item = safe(row, COL.ITEM);
  return item.includes('オンダ') && !item.includes('オンダリフト') && safeNum(row, COL.M) !== 0;
}

/** Check if item is 回数券 */
function isKaisu(row) {
  const item = safe(row, COL.ITEM);
  const cat = safe(row, COL.CATEGORY);
  return item.includes('回数券') || cat.includes('回数券');
}

/** Compute store-level KPIs */
function computeStoreKPIs() {
  const stores = getStores();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  return stores.map(store => {
    const storeRows = filterByStore(State.sales, store);
    const orders = getOrders(storeRows);

    // Sales
    const totalSales = storeRows.reduce((s, r) => s + safeNum(r, COL.AMOUNT), 0);

    // New customers
    const newOrders = orders.filter(isNew);
    const newCount = newOrders.length;

    // Average unit price (exclude 0 yen rows)
    const paidOrders = orders.filter(r => safeNum(r, COL.AMOUNT) > 0);
    const avgUnitPrice = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

    // Contract: 新規で回数券購入
    const newContractOrders = newOrders.filter(r => {
      const orderRows = storeRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const newContractCount = newContractOrders.length;
    const newContractRate = newCount > 0 ? (newContractCount / newCount) * 100 : 0;

    // Continuation contract rate (再来で回数券)
    const returnOrders = orders.filter(r => safe(r, COL.NEW_RETURN) === '再来');
    const returnContractOrders = returnOrders.filter(r => {
      const orderRows = storeRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const continuationRate = returnOrders.length > 0 ? (returnContractOrders.length / returnOrders.length) * 100 : 0;

    // Target
    const target = State.targets.find(t => t.store === store) || {};
    const newTarget = parseFloat(target.new_target) || 0;
    const salesTarget = parseFloat(target.sales_target) || 0;
    const unitTarget = parseFloat(target.unit_price_target) || 0;
    const contractRateTarget = parseFloat(target.contract_rate_target) || 0;
    const continuationRateTarget = parseFloat(target.continuation_rate_target) || 0;

    const newAchRate = newTarget > 0 ? (newCount / newTarget) * 100 : 0;
    const salesAchRate = salesTarget > 0 ? (totalSales / salesTarget) * 100 : 0;

    return {
      store, totalSales, newCount, newTarget, newAchRate, salesTarget, salesAchRate,
      avgUnitPrice, unitTarget, newContractCount, newContractRate, contractRateTarget,
      continuationRate, continuationRateTarget,
      unitDiff: avgUnitPrice - unitTarget
    };
  });
}

/** Compute staff-level KPIs */
function computeStaffKPIs(storeFilter) {
  const sales = storeFilter === 'all' ? State.sales : filterByStore(State.sales, storeFilter);
  const staffMap = {};

  sales.forEach(r => {
    const staff = safe(r, COL.STAFF);
    if (!staff) return;
    const store = safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME);
    if (!staffMap[staff]) {
      staffMap[staff] = { name: staff, store, orders: new Set(), newOrders: new Set(), sales: 0, contractOrders: new Set(), returnOrders: new Set(), returnContractOrders: new Set() };
    }
    const orderId = safe(r, COL.ORDER_ID);
    if (orderId) {
      staffMap[staff].orders.add(orderId);
      const amount = safeNum(r, COL.AMOUNT);
      // Only count amount once per orderId
    }
    const amount = safeNum(r, COL.AMOUNT);
    staffMap[staff].sales += amount;
  });

  // Recalculate with deduplication
  const staffData = {};
  sales.forEach(r => {
    const staff = safe(r, COL.STAFF);
    if (!staff) return;
    const orderId = safe(r, COL.ORDER_ID);
    const store = safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME);
    if (!staffData[staff]) {
      staffData[staff] = { name: staff, store, orderIds: new Set(), totalSales: 0 };
    }
    if (!staffData[staff].orderIds.has(orderId)) {
      staffData[staff].orderIds.add(orderId);
    }
    staffData[staff].totalSales += safeNum(r, COL.AMOUNT);
  });

  return Object.values(staffData).map(sd => {
    const staffRows = sales.filter(r => safe(r, COL.STAFF) === sd.name);
    const orders = getOrders(staffRows);
    const newOrders = orders.filter(isNew);
    const newCount = newOrders.length;
    const paidOrders = orders.filter(r => safeNum(r, COL.AMOUNT) > 0);
    const totalSales = staffRows.reduce((s, r) => s + safeNum(r, COL.AMOUNT), 0);
    const avgUnitPrice = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

    const newContractOrders = newOrders.filter(r => {
      const orderRows = staffRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const newContractRate = newCount > 0 ? (newContractOrders.length / newCount) * 100 : 0;

    const returnOrders = orders.filter(r => safe(r, COL.NEW_RETURN) === '再来');
    const returnContractOrders = returnOrders.filter(r => {
      const orderRows = staffRows.filter(sr => safe(sr, COL.ORDER_ID) === safe(r, COL.ORDER_ID));
      return orderRows.some(isKaisu);
    });
    const continuationRate = returnOrders.length > 0 ? (returnContractOrders.length / returnOrders.length) * 100 : 0;

    return {
      name: sd.name, store: sd.store, newCount, totalSales, avgUnitPrice,
      newContractCount: newContractOrders.length, newContractRate, continuationRate
    };
  });
}

/** Compute LTV data (kaisu customers) */
function computeLTV() {
  const kaisuMap = {};
  State.sales.forEach(r => {
    if (!isKaisu(r)) return;
    const cid = safe(r, COL.CUSTOMER_ID);
    const cname = safe(r, COL.CUSTOMER_NAME);
    const store = safe(r, COL.Y_STORE) || safe(r, COL.STORE_NAME);
    const staff = safe(r, COL.STAFF);
    const date = safe(r, COL.DATE);
    const amount = safeNum(r, COL.AMOUNT);
    if (!cid) return;
    if (!kaisuMap[cid]) {
      kaisuMap[cid] = { cid, cname, store, staff, totalSales: 0, lastVisit: date, visitCount: 0 };
    }
    kaisuMap[cid].totalSales += amount;
    kaisuMap[cid].visitCount++;
    if (date > kaisuMap[cid].lastVisit) kaisuMap[cid].lastVisit = date;
  });

  const now = new Date();
  return Object.values(kaisuMap).map(c => {
    const lastDate = new Date(c.lastVisit);
    const daysSince = isNaN(lastDate) ? 0 : Math.floor((now - lastDate) / 86400000);
    let status = 'safe';
    if (daysSince > 60) status = 'danger';
    else if (daysSince > 30) status = 'warning';
    return { ...c, daysSince, status };
  });
}

// ===== RENDERING =====

function renderAll() {
  renderTabNav();
  renderOverview();
  renderStoreTab();
  renderStaffTab();
  renderRankings();
  renderLTV();
  renderAlerts();
  renderSVActions();
  checkAlertBanner();
}

function renderTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ===== OVERVIEW =====
function renderOverview() {
  const storeKPIs = computeStoreKPIs();
  const totalSales = storeKPIs.reduce((s, k) => s + k.totalSales, 0);
  const totalNew = storeKPIs.reduce((s, k) => s + k.newCount, 0);
  const totalNewTarget = storeKPIs.reduce((s, k) => s + k.newTarget, 0);
  const avgContractRate = storeKPIs.length ? storeKPIs.reduce((s, k) => s + k.newContractRate, 0) / storeKPIs.length : 0;
  const avgContinuation = storeKPIs.length ? storeKPIs.reduce((s, k) => s + k.continuationRate, 0) / storeKPIs.length : 0;
  const totalSalesTarget = storeKPIs.reduce((s, k) => s + k.salesTarget, 0);
  const salesAchRate = totalSalesTarget > 0 ? (totalSales / totalSalesTarget) * 100 : 0;
  const newAchRate = totalNewTarget > 0 ? (totalNew / totalNewTarget) * 100 : 0;

  const paidOrders = getOrders(State.sales).filter(r => safeNum(r, COL.AMOUNT) > 0);
  const avgUnit = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

  document.getElementById('overview-kpis').innerHTML = `
    <div class="kpi-card gold">
      <div class="kpi-label">総売上</div>
      <div class="kpi-value">${fmt.yen(totalSales)}</div>
      <div class="kpi-sub">目標: ${fmt.yen(totalSalesTarget)}</div>
      <div class="kpi-badge ${salesAchRate >= 80 ? 'badge-up' : salesAchRate >= 60 ? 'badge-neutral' : 'badge-down'}">${fmt.pct(salesAchRate)}</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-label">新規数</div>
      <div class="kpi-value">${totalNew}</div>
      <div class="kpi-sub">目標: ${totalNewTarget}件</div>
      <div class="kpi-badge ${newAchRate >= 80 ? 'badge-up' : newAchRate >= 60 ? 'badge-neutral' : 'badge-down'}">${fmt.pct(newAchRate)}</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">平均単価</div>
      <div class="kpi-value">${fmt.yen(avgUnit)}</div>
      <div class="kpi-sub">全店舗平均</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">新規契約率</div>
      <div class="kpi-value">${fmt.pct(avgContractRate)}</div>
      <div class="kpi-sub">平均目標: 60%</div>
    </div>
    <div class="kpi-card ${avgContinuation >= 70 ? 'green' : avgContinuation >= 50 ? 'gold' : 'red'}">
      <div class="kpi-label">継続契約率</div>
      <div class="kpi-value">${fmt.pct(avgContinuation)}</div>
      <div class="kpi-sub">平均目標: 70%</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">店舗数</div>
      <div class="kpi-value">${storeKPIs.length}</div>
      <div class="kpi-sub">稼働中</div>
    </div>
  `;

  renderCharts(storeKPIs);
}

function renderCharts(storeKPIs) {
  // Destroy existing charts
  Object.values(State.charts).forEach(c => { try { c.destroy(); } catch(e) {} });
  State.charts = {};

  const CHART_COLORS = ['#d4a843', '#2dd4bf', '#60a5fa', '#a78bfa', '#f87171', '#4ade80'];

  // Store Sales Chart
  const ctx1 = document.getElementById('chart-store-sales');
  if (ctx1) {
    State.charts.storeSales = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: storeKPIs.map(k => k.store),
        datasets: [{
          label: '売上',
          data: storeKPIs.map(k => k.totalSales),
          backgroundColor: CHART_COLORS,
          borderRadius: 6, borderSkipped: false
        }, {
          label: '目標',
          data: storeKPIs.map(k => k.salesTarget),
          backgroundColor: 'transparent',
          borderColor: '#ffffff40',
          borderWidth: 2,
          type: 'line',
          pointBackgroundColor: '#ffffff60',
          tension: 0.3
        }]
      },
      options: chartOptions('売上 (¥)')
    });
  }

  // New achievement rate
  const ctx2 = document.getElementById('chart-new-rate');
  if (ctx2) {
    State.charts.newRate = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: storeKPIs.map(k => k.store),
        datasets: [{
          data: storeKPIs.map(k => k.newCount),
          backgroundColor: CHART_COLORS,
          borderWidth: 2,
          borderColor: '#16181f'
        }]
      },
      options: {
        ...chartOptions('新規数'),
        plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa', font: { size: 12 }, padding: 16 } } }
      }
    });
  }

  // Daily chart
  const dailyData = computeDailyTotals();
  const ctx3 = document.getElementById('chart-daily');
  if (ctx3 && dailyData.labels.length) {
    State.charts.daily = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: dailyData.labels,
        datasets: [{
          label: '日別売上',
          data: dailyData.values,
          borderColor: '#d4a843',
          backgroundColor: '#d4a84318',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#d4a843',
          pointRadius: 4
        }]
      },
      options: chartOptions('売上 (¥)')
    });
  }
}

function computeDailyTotals() {
  const daily = {};
  State.sales.forEach(r => {
    const date = safe(r, COL.DATE);
    if (!date) return;
    daily[date] = (daily[date] || 0) + safeNum(r, COL.AMOUNT);
  });
  const sorted = Object.keys(daily).sort();
  return { labels: sorted, values: sorted.map(d => daily[d]) };
}

function chartOptions(label) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#a1a1aa', font: { size: 12 } } },
      tooltip: {
        backgroundColor: '#1c1f28',
        borderColor: '#ffffff22',
        borderWidth: 1,
        titleColor: '#f4f4f5',
        bodyColor: '#a1a1aa',
        callbacks: {
          label: ctx => {
            const v = ctx.raw;
            return v >= 1000 ? ` ¥${Math.round(v).toLocaleString()}` : ` ${v}件`;
          }
        }
      }
    },
    scales: {
      x: { ticks: { color: '#71717a' }, grid: { color: '#ffffff08' } },
      y: { ticks: { color: '#71717a' }, grid: { color: '#ffffff08' } }
    }
  };
}

// ===== STORE TAB =====
function renderStoreTab() {
  const stores = getStores();
  const filterEl = document.getElementById('store-filter');
  filterEl.innerHTML = `<button class="filter-btn ${State.storeFilter === 'all' ? 'active' : ''}" data-store="all">全店舗</button>` +
    stores.map(s => `<button class="filter-btn ${State.storeFilter === s ? 'active' : ''}" data-store="${s}">${s}</button>`).join('');

  filterEl.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.storeFilter = btn.dataset.store;
      renderStoreTab();
    });
  });

  const storeKPIs = computeStoreKPIs().filter(k => State.storeFilter === 'all' || k.store === State.storeFilter);

  // Store KPI Cards
  document.getElementById('store-kpi-cards').innerHTML = storeKPIs.map(k => `
    <div class="store-kpi-card">
      <div class="store-kpi-name">🏪 ${k.store}</div>
      <div class="store-metrics">
        <div class="store-metric">
          <div class="store-metric-label">売上</div>
          <div class="store-metric-val" style="color:var(--gold)">${fmt.yen(k.totalSales)}</div>
        </div>
        <div class="store-metric">
          <div class="store-metric-label">売上達成率</div>
          <div class="store-metric-val ${rateClass(k.salesAchRate)}">${fmt.pct(k.salesAchRate)}</div>
        </div>
        <div class="store-metric">
          <div class="store-metric-label">新規数 / 目標</div>
          <div class="store-metric-val" style="color:var(--teal)">${k.newCount} / ${k.newTarget}</div>
        </div>
        <div class="store-metric">
          <div class="store-metric-label">新規達成率</div>
          <div class="store-metric-val ${rateClass(k.newAchRate)}">${fmt.pct(k.newAchRate)}</div>
        </div>
        <div class="store-metric">
          <div class="store-metric-label">新規契約率</div>
          <div class="store-metric-val ${rateClass(k.newContractRate)}">${fmt.pct(k.newContractRate)}</div>
        </div>
        <div class="store-metric">
          <div class="store-metric-label">継続契約率</div>
          <div class="store-metric-val ${rateClass(k.continuationRate)}">${fmt.pct(k.continuationRate)}</div>
        </div>
      </div>
    </div>
  `).join('');

  // Store Table
  document.getElementById('store-table-body').innerHTML = storeKPIs.map(k => `
    <tr>
      <td><strong>${k.store}</strong></td>
      <td class="${rateClass(k.newAchRate)}">${k.newCount}</td>
      <td>${k.newTarget}</td>
      <td class="progress-cell">${makeProgress(k.newCount, k.newTarget)}</td>
      <td>${fmt.yen(k.totalSales)}</td>
      <td>${fmt.yen(k.salesTarget)}</td>
      <td class="progress-cell">${makeProgress(k.totalSales, k.salesTarget)}</td>
      <td>${fmt.yen(k.avgUnitPrice)}</td>
      <td>${fmt.yen(k.unitTarget)}</td>
      <td class="${rateClass(k.newContractRate)}">${fmt.pct(k.newContractRate)}</td>
      <td class="${rateClass(k.continuationRate)}">${fmt.pct(k.continuationRate)}</td>
    </tr>
  `).join('');
}

// ===== STAFF TAB =====
function renderStaffTab() {
  const stores = getStores();
  const filterEl = document.getElementById('staff-store-filter');
  filterEl.innerHTML = `<button class="filter-btn ${State.staffStoreFilter === 'all' ? 'active' : ''}" data-store="all">全店舗</button>` +
    stores.map(s => `<button class="filter-btn ${State.staffStoreFilter === s ? 'active' : ''}" data-store="${s}">${s}</button>`).join('');

  filterEl.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.staffStoreFilter = btn.dataset.store;
      renderStaffTab();
    });
  });

  const staffKPIs = computeStaffKPIs(State.staffStoreFilter);

  document.getElementById('staff-table-body').innerHTML = staffKPIs.map(s => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${s.store}</td>
      <td>${s.newCount}</td>
      <td>${fmt.yen(s.totalSales)}</td>
      <td>${fmt.yen(s.avgUnitPrice)}</td>
      <td>${s.newContractCount}</td>
      <td class="${rateClass(s.newContractRate)}">${fmt.pct(s.newContractRate)}</td>
      <td class="${rateClass(s.continuationRate)}">${fmt.pct(s.continuationRate)}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">データがありません</td></tr>';
}

// ===== RANKINGS =====
function renderRankings() {
  const staffKPIs = computeStaffKPIs('all');

  const rankFn = (arr, key, fmt_fn, label) => {
    const sorted = [...arr].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 5);
    return sorted.map((s, i) => `
      <div class="rank-item">
        <div class="rank-num ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'other'}">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${s.name}</div>
          <div class="rank-store">${s.store}</div>
        </div>
        <div class="rank-val">${fmt_fn(s[key])}</div>
      </div>
    `).join('');
  };

  document.querySelector('#rank-sales .ranking-list').innerHTML = rankFn(staffKPIs, 'totalSales', fmt.yen, '売上');
  document.querySelector('#rank-contract .ranking-list').innerHTML = rankFn(staffKPIs, 'newContractRate', v => fmt.pct(v), '契約率');
  document.querySelector('#rank-unit .ranking-list').innerHTML = rankFn(staffKPIs, 'avgUnitPrice', fmt.yen, '単価');
  document.querySelector('#rank-new .ranking-list').innerHTML = rankFn(staffKPIs, 'newCount', v => `${v}件`, '新規');
}

// ===== LTV =====
function renderLTV() {
  const ltvData = computeLTV();
  const totalKaisuSales = ltvData.reduce((s, c) => s + c.totalSales, 0);
  const avgLTV = ltvData.length ? totalKaisuSales / ltvData.length : 0;

  document.getElementById('ltv-kpis').innerHTML = `
    <div class="kpi-card gold">
      <div class="kpi-label">回数券総売上</div>
      <div class="kpi-value">${fmt.yen(totalKaisuSales)}</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-label">回数券顧客数</div>
      <div class="kpi-value">${ltvData.length}</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">顧客平均LTV</div>
      <div class="kpi-value">${fmt.yen(avgLTV)}</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">離脱リスク顧客</div>
      <div class="kpi-value">${ltvData.filter(c => c.status === 'danger').length}</div>
      <div class="kpi-sub">60日以上未来店</div>
    </div>
  `;

  document.getElementById('ltv-table-body').innerHTML = ltvData.map(c => `
    <tr>
      <td><strong>${c.cname}</strong></td>
      <td style="color:var(--text-muted);font-size:11px">${c.cid}</td>
      <td>${c.store}</td>
      <td>${c.staff}</td>
      <td>${fmt.yen(c.totalSales)}</td>
      <td style="color:var(--gold);font-weight:700">${fmt.yen(c.totalSales)}</td>
      <td>${fmt.date(c.lastVisit)}</td>
      <td><span class="ltv-status ${c.status}">${c.status === 'danger' ? '⚠ 離脱リスク' : c.status === 'warning' ? '要フォロー' : '✓ 正常'}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">回数券データがありません</td></tr>';
}

// ===== ALERTS =====
function renderAlerts() {
  const storeKPIs = computeStoreKPIs();
  const ltvData = computeLTV();

  // HPB Alerts
  const hpbAlerts = storeKPIs.map(k => {
    const issues = [];
    if (k.newAchRate < 80) {
      issues.push({
        type: 'hpb',
        title: `📉 新規目標未達 - ${k.store}`,
        body: `現在 ${k.newCount}件 / 目標 ${k.newTarget}件<br>達成率: <strong>${fmt.pct(k.newAchRate)}</strong>`,
        actions: ['HPBクーポン見直し', '口コミキャンペーン実施', '掲載画像・テキスト改善']
      });
    }
    return issues;
  }).flat();

  if (!hpbAlerts.length) {
    hpbAlerts.push({ type: 'ok', title: '✅ HPB集客 正常', body: '全店舗、新規目標の80%以上を達成しています。', actions: [] });
  }

  document.getElementById('hpb-alerts').innerHTML = `
    <div class="alert-section-title">📣 HPB集客アラート</div>
    <div class="alert-cards">
      ${hpbAlerts.map(a => `
        <div class="alert-card ${a.type}">
          <div class="alert-card-title">${a.title}</div>
          <div class="alert-card-body">${a.body}</div>
          ${a.actions.length ? `<div class="alert-action"><div class="alert-action-label">推奨アクション</div>${a.actions.map(ac => `<div>→ ${ac}</div>`).join('')}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  // Churn Alerts
  const churnCustomers = ltvData.filter(c => c.status === 'danger' || c.status === 'warning');
  const churnCards = churnCustomers.length
    ? churnCustomers.map(c => `
      <div class="alert-card churn">
        <div class="alert-card-title">⚠ 離脱アラート - ${c.cname}</div>
        <div class="alert-card-body">
          顧客ID: ${c.cid}<br>
          担当: ${c.staff}<br>
          最終来店: <strong>${c.daysSince}日前</strong><br>
          回数券売上: ${fmt.yen(c.totalSales)}
        </div>
        <div class="alert-action">
          <div class="alert-action-label">推奨アクション</div>
          <div>→ DM送信</div>
          <div>→ 電話フォロー</div>
          <div>→ 担当スタッフが直接連絡</div>
        </div>
      </div>
    `).join('')
    : `<div class="alert-card ok"><div class="alert-card-title">✅ 顧客離脱 正常</div><div class="alert-card-body">離脱リスクのある顧客はいません。</div></div>`;

  document.getElementById('churn-alerts').innerHTML = `
    <div class="alert-section-title">🚨 顧客離脱アラート</div>
    <div class="alert-cards">${churnCards}</div>
  `;
}

// ===== SV ACTIONS =====
function renderSVActions() {
  const storeKPIs = computeStoreKPIs();
  const actions = [];

  storeKPIs.forEach(k => {
    if (k.newContractRate < 50) {
      actions.push({
        level: 'urgent',
        store: k.store,
        issue: '契約率低下',
        data: `現在 ${fmt.pct(k.newContractRate)} (目標 ${fmt.pct(k.contractRateTarget)})`,
        actions: ['カウンセリング同席でトーク確認', 'ロープレ・クロージング改善', 'ベストプラクティス共有会実施']
      });
    } else if (k.newContractRate < k.contractRateTarget) {
      actions.push({
        level: 'warning',
        store: k.store,
        issue: '契約率 要注意',
        data: `現在 ${fmt.pct(k.newContractRate)} (目標 ${fmt.pct(k.contractRateTarget)})`,
        actions: ['カウンセリング内容の振り返り', 'お客様の声を収集']
      });
    }

    if (k.avgUnitPrice < k.unitTarget && k.unitTarget > 0) {
      actions.push({
        level: 'warning',
        store: k.store,
        issue: '平均単価低下',
        data: `現在 ${fmt.yen(k.avgUnitPrice)} (目標 ${fmt.yen(k.unitTarget)})`,
        actions: ['上位メニュー提案トークの強化', 'オプション訴求改善', 'スタッフ別単価分析']
      });
    }

    if (k.newAchRate < 70) {
      actions.push({
        level: 'urgent',
        store: k.store,
        issue: '新規不足',
        data: `現在 ${k.newCount}件 / 目標 ${k.newTarget}件 (${fmt.pct(k.newAchRate)})`,
        actions: ['HPBクーポン改善・追加', '口コミ促進キャンペーン', '掲載プロフィール見直し', 'SNS集客強化']
      });
    } else if (k.newAchRate < 80) {
      actions.push({
        level: 'info',
        store: k.store,
        issue: '新規数 要強化',
        data: `現在 ${k.newCount}件 / 目標 ${k.newTarget}件 (${fmt.pct(k.newAchRate)})`,
        actions: ['HPBクーポン改善', '口コミ投稿促進']
      });
    }
  });

  if (!actions.length) {
    document.getElementById('sv-actions').innerHTML = `
      <div class="sv-card info" style="grid-column:1/-1">
        <div class="sv-card-store">全店舗</div>
        <div class="sv-card-issue">✅ 全KPI正常</div>
        <div class="sv-card-data">現在、特段のSVアクションは必要ありません。</div>
      </div>
    `;
    return;
  }

  document.getElementById('sv-actions').innerHTML = actions.map(a => `
    <div class="sv-card ${a.level}">
      <div class="sv-card-store">${a.store}</div>
      <div class="sv-card-issue">${a.issue}</div>
      <div class="sv-card-data">${a.data}</div>
      <ul class="sv-actions-list">
        ${a.actions.map(ac => `<li>${ac}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

// ===== ALERT BANNER =====
function checkAlertBanner() {
  const storeKPIs = computeStoreKPIs();
  const critical = storeKPIs.filter(k => k.newAchRate < 70 || k.newContractRate < 50);
  const banner = document.getElementById('alert-banner');
  if (critical.length) {
    banner.textContent = `⚠ 要注意: ${critical.map(k => k.store).join('、')} で重要指標が基準を下回っています。「アラート」タブを確認してください。`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  loadAllData();
});
