/* =============================================
   BELLE SALON MANAGEMENT OS — script.js v2.0
   ============================================= */
'use strict';

const State = {
  sales: [], targets: [], storeFilter: 'all', staffStoreFilter: 'all',
  charts: {}, storeNames: [], storeShortNames: {}
};

// 列インデックス（0始まり、実際のCSVスクリーンショット準拠）
const COL = {
  STORE_FULL: 0, DATE: 2, ORDER_ID: 4, CATEGORY: 7, ITEM: 8,
  UNIT_PRICE: 9, AMOUNT: 11, M_COL: 12, STAFF: 15,
  CUSTOMER_NAME: 16, CUSTOMER_ID: 18, ROUTE: 19, NEW_RETURN: 21,
  PAYMENT: 22, Y_STORE: 24
};

const fmt = {
  yen: v => '¥' + Math.round(v||0).toLocaleString('ja-JP'),
  pct: v => Math.round(v||0) + '%',
  date: d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('ja-JP'); }
};

function safe(row,idx){ return (row&&row[idx]!=null)?String(row[idx]).trim():''; }
function safeNum(row,idx){ const v=safe(row,idx).replace(/,/g,'').replace(/¥/g,''); const n=parseFloat(v); return isNaN(n)?0:n; }
function rateClass(r){ return r>=80?'rate-high':r>=60?'rate-mid':'rate-low'; }
function progressClass(r){ return r>=80?'high':r>=60?'mid':'low'; }

function makeProgress(val,max){
  if(!max||max===0) return '<span style="color:var(--text-muted)">目標未設定</span>';
  const pct=Math.min(100,Math.round((val/max)*100));
  return '<div class="'+rateClass(pct)+'">'+pct+'%</div><div class="progress-bar"><div class="progress-fill '+progressClass(pct)+'" style="width:'+pct+'%"></div></div>';
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escA(s){ return String(s||'').replace(/"/g,'&quot;'); }

// 店舗名短縮化
function makeShortName(full){
  if(!full) return '不明';
  const m1 = full.match(/Belle\s+([^\s】]+)/);
  if(m1) return 'Belle ' + m1[1];
  const m2 = full.match(/([^\s】【]+店)/);
  if(m2) return m2[1];
  return full.length>18 ? full.slice(-15) : full;
}

function getStoreKey(row){ return safe(row,COL.STORE_FULL) || '不明'; }

// CSV読み込み
async function loadCSVRaw(path){
  try{
    const r=await fetch(path+'?nc='+Date.now());
    if(!r.ok){ console.warn('CSV not found:',path); return []; }
    const text=await r.text();
    const res=Papa.parse(text.replace(/^\uFEFF/,''),{header:false,skipEmptyLines:true});
    return res.data.length<2?[]:res.data.slice(1);
  }catch(e){ console.error(e); return []; }
}
async function loadCSVObj(path){
  try{
    const r=await fetch(path+'?nc='+Date.now());
    if(!r.ok) return [];
    const text=await r.text();
    return Papa.parse(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:true}).data||[];
  }catch(e){ return []; }
}

// メインロード
async function loadAllData(){
  showLoading(true);
  try{
    const [sales,targets]=await Promise.all([loadCSVRaw('data/sales.csv'),loadCSVObj('data/targets.csv')]);
    State.sales=sales; State.targets=targets;
    const storeSet=new Set(sales.map(r=>getStoreKey(r)).filter(Boolean));
    State.storeNames=[...storeSet];
    State.storeShortNames={};
    State.storeNames.forEach(n=>{ State.storeShortNames[n]=makeShortName(n); });
    const dates=sales.map(r=>safe(r,COL.DATE)).filter(Boolean).sort();
    if(dates.length){
      const d=new Date(dates[dates.length-1]);
      document.getElementById('current-period').textContent=isNaN(d)?'集計期間':d.getFullYear()+'年'+(d.getMonth()+1)+'月';
    }
    document.getElementById('last-updated').textContent=new Date().toLocaleString('ja-JP');
    document.getElementById('today-date').textContent=new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
    renderAll();
  }catch(e){
    console.error(e);
    document.getElementById('overview-kpis').innerHTML='<div style="color:var(--red);padding:20px">エラー:'+esc(e.message)+'</div>';
  }
  showLoading(false);
}

function showLoading(show){
  const ls=document.getElementById('loading-screen');
  if(show){ ls.style.opacity='1'; ls.style.visibility='visible'; ls.classList.remove('hidden'); }
  else{ setTimeout(()=>{ ls.style.opacity='0'; ls.style.visibility='hidden'; ls.classList.add('hidden'); },400); }
}

function filterByStore(rows,key){ if(!key||key==='all') return rows; return rows.filter(r=>getStoreKey(r)===key); }

function getUniqueOrders(rows){
  const seen=new Set();
  return rows.filter(r=>{ const id=safe(r,COL.ORDER_ID); if(!id||seen.has(id)) return false; seen.add(id); return true; });
}

function isNew(row){ return safe(row,COL.NEW_RETURN)==='新規'; }
function isReturn(row){ return safe(row,COL.NEW_RETURN)==='再来'; }

function isKaishuPurchase(row){
  const item=safe(row,COL.ITEM);
  return item.includes('回数券') && !item.includes('消化');
}

function orderHasKaishu(orderId,rows){
  return rows.some(r=>safe(r,COL.ORDER_ID)===orderId && isKaishuPurchase(r));
}

function getOrderTotal(orderId,rows){
  return rows.filter(r=>safe(r,COL.ORDER_ID)===orderId).reduce((s,r)=>s+safeNum(r,COL.AMOUNT),0);
}

// 店舗KPI計算
function computeStoreKPIs(storeFilter){
  const stores=(!storeFilter||storeFilter==='all')?State.storeNames:[storeFilter];
  return stores.map(key=>{
    const rows=filterByStore(State.sales,key);
    const totalSales=rows.reduce((s,r)=>s+safeNum(r,COL.AMOUNT),0);
    const orders=getUniqueOrders(rows);
    const newOrders=orders.filter(isNew);
    const returnOrders=orders.filter(isReturn);
    const paidOrders=orders.filter(r=>getOrderTotal(safe(r,COL.ORDER_ID),rows)>0);
    const avgUnit=paidOrders.length>0?totalSales/paidOrders.length:0;
    const newCC=newOrders.filter(r=>orderHasKaishu(safe(r,COL.ORDER_ID),rows)).length;
    const newCR=newOrders.length>0?(newCC/newOrders.length)*100:0;
    const retCC=returnOrders.filter(r=>orderHasKaishu(safe(r,COL.ORDER_ID),rows)).length;
    const contR=returnOrders.length>0?(retCC/returnOrders.length)*100:0;
    const sn=State.storeShortNames[key]||key;
    // targets.csv マッチング（店舗名の部分一致）
    const tgt=State.targets.find(t=>{
      const ts=(t.store||'').trim();
      return ts===key || key.includes(ts) || ts.includes(sn);
    })||{};
    const nTgt=parseFloat(tgt.new_target)||0;
    const sTgt=parseFloat(tgt.sales_target)||0;
    const uTgt=parseFloat(tgt.unit_price_target)||0;
    const cTgt=parseFloat(tgt.contract_rate_target)||0;
    const coTgt=parseFloat(tgt.continuation_rate_target)||0;
    return {
      key,shortName:sn,totalSales,
      newCount:newOrders.length,newTarget:nTgt,newAchRate:nTgt>0?(newOrders.length/nTgt)*100:0,
      salesTarget:sTgt,salesAchRate:sTgt>0?(totalSales/sTgt)*100:0,
      avgUnit,unitTarget:uTgt,newContractCount:newCC,newContractRate:newCR,contractTarget:cTgt,
      returnCount:returnOrders.length,returnContractCount:retCC,continuationRate:contR,continuTarget:coTgt
    };
  });
}

// スタッフKPI計算
function computeStaffKPIs(storeFilter){
  const rows=filterByStore(State.sales,storeFilter);
  const map={};
  rows.forEach(r=>{
    const s=safe(r,COL.STAFF); if(!s) return;
    const key=getStoreKey(r);
    if(!map[s]) map[s]={name:s,storeKey:key,shortStore:State.storeShortNames[key]||key};
  });
  return Object.keys(map).map(staff=>{
    const sr=rows.filter(r=>safe(r,COL.STAFF)===staff);
    const orders=getUniqueOrders(sr);
    const newO=orders.filter(isNew); const retO=orders.filter(isReturn);
    const totalSales=sr.reduce((s,r)=>s+safeNum(r,COL.AMOUNT),0);
    const paidO=orders.filter(r=>getOrderTotal(safe(r,COL.ORDER_ID),sr)>0);
    const avgUnit=paidO.length>0?totalSales/paidO.length:0;
    const nCC=newO.filter(r=>orderHasKaishu(safe(r,COL.ORDER_ID),sr)).length;
    const nCR=newO.length>0?(nCC/newO.length)*100:0;
    const rCC=retO.filter(r=>orderHasKaishu(safe(r,COL.ORDER_ID),sr)).length;
    const cR=retO.length>0?(rCC/retO.length)*100:0;
    return {...map[staff],newCount:newO.length,totalSales,avgUnit,newContractCount:nCC,newContractRate:nCR,continuationRate:cR};
  }).sort((a,b)=>b.totalSales-a.totalSales);
}

// LTV計算
function computeLTV(){
  const m={};
  State.sales.forEach(r=>{
    if(!isKaishuPurchase(r)) return;
    const cid=safe(r,COL.CUSTOMER_ID); if(!cid) return;
    const key=getStoreKey(r);
    if(!m[cid]) m[cid]={cid,cname:safe(r,COL.CUSTOMER_NAME),store:key,shortStore:State.storeShortNames[key]||key,staff:safe(r,COL.STAFF),totalSales:0,lastVisit:safe(r,COL.DATE)};
    m[cid].totalSales+=safeNum(r,COL.AMOUNT);
    if(safe(r,COL.DATE)>m[cid].lastVisit) m[cid].lastVisit=safe(r,COL.DATE);
  });
  const now=new Date();
  return Object.values(m).map(c=>{
    const last=new Date(c.lastVisit);
    const days=isNaN(last)?0:Math.floor((now-last)/86400000);
    return {...c,daysSince:days,status:days>60?'danger':days>30?'warning':'safe'};
  }).sort((a,b)=>b.daysSince-a.daysSince);
}

// レンダリング統括
function renderAll(){
  setupTabs(); renderOverview(); renderStoreTab(); renderStaffTab();
  renderRankings(); renderLTV(); renderAlerts(); renderSVActions(); renderBanner();
}

function setupTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    };
  });
}

function renderOverview(){
  const kpis=computeStoreKPIs('all');
  const tS=kpis.reduce((s,k)=>s+k.totalSales,0);
  const tN=kpis.reduce((s,k)=>s+k.newCount,0);
  const tNT=kpis.reduce((s,k)=>s+k.newTarget,0);
  const tST=kpis.reduce((s,k)=>s+k.salesTarget,0);
  const sAR=tST>0?(tS/tST)*100:0; const nAR=tNT>0?(tN/tNT)*100:0;
  const aC=kpis.length?kpis.reduce((s,k)=>s+k.newContractRate,0)/kpis.length:0;
  const aCo=kpis.length?kpis.reduce((s,k)=>s+k.continuationRate,0)/kpis.length:0;
  const allO=getUniqueOrders(State.sales);
  const paidO=allO.filter(r=>getOrderTotal(safe(r,COL.ORDER_ID),State.sales)>0);
  const avgU=paidO.length>0?tS/paidO.length:0;

  document.getElementById('overview-kpis').innerHTML=`
    <div class="kpi-card gold"><div class="kpi-label">総売上</div><div class="kpi-value">${fmt.yen(tS)}</div>
      <div class="kpi-sub">目標: ${fmt.yen(tST)}</div>
      <span class="kpi-badge ${sAR>=80?'badge-up':sAR>=60?'badge-neutral':'badge-down'}">${fmt.pct(sAR)}</span></div>
    <div class="kpi-card teal"><div class="kpi-label">新規数</div><div class="kpi-value">${tN}</div>
      <div class="kpi-sub">目標: ${tNT}件</div>
      <span class="kpi-badge ${nAR>=80?'badge-up':nAR>=60?'badge-neutral':'badge-down'}">${fmt.pct(nAR)}</span></div>
    <div class="kpi-card blue"><div class="kpi-label">平均単価</div><div class="kpi-value">${fmt.yen(avgU)}</div>
      <div class="kpi-sub">有料注文${paidO.length}件</div></div>
    <div class="kpi-card ${aC>=60?'green':aC>=40?'gold':'red'}"><div class="kpi-label">新規契約率</div><div class="kpi-value">${fmt.pct(aC)}</div><div class="kpi-sub">目標:60%</div></div>
    <div class="kpi-card ${aCo>=70?'green':aCo>=50?'gold':'red'}"><div class="kpi-label">継続契約率</div><div class="kpi-value">${fmt.pct(aCo)}</div><div class="kpi-sub">目標:70%</div></div>
    <div class="kpi-card blue"><div class="kpi-label">店舗数</div><div class="kpi-value">${State.storeNames.length}</div><div class="kpi-sub">稼働中</div></div>`;
  renderCharts(kpis);
}

function renderCharts(kpis){
  Object.values(State.charts).forEach(c=>{try{c.destroy();}catch(e){}});
  State.charts={};
  const COLS=['#d4a843','#2dd4bf','#60a5fa','#a78bfa','#f87171','#4ade80'];
  const labels=kpis.map(k=>k.shortName);
  const opts={responsive:true,maintainAspectRatio:true,
    plugins:{legend:{labels:{color:'#a1a1aa',font:{size:11}}},
      tooltip:{backgroundColor:'#1c1f28',borderColor:'#ffffff22',borderWidth:1,titleColor:'#f4f4f5',bodyColor:'#a1a1aa',
        callbacks:{label:ctx=>{ const v=ctx.raw; return v>=10000?' ¥'+Math.round(v).toLocaleString():' '+v+'件'; }}}},
    scales:{x:{ticks:{color:'#71717a',maxRotation:30},grid:{color:'#ffffff08'}},y:{ticks:{color:'#71717a'},grid:{color:'#ffffff08'}}}};

  const c1=document.getElementById('chart-store-sales');
  if(c1) State.charts.s=new Chart(c1,{type:'bar',data:{labels,datasets:[
    {label:'売上',data:kpis.map(k=>k.totalSales),backgroundColor:COLS,borderRadius:6,borderSkipped:false},
    {label:'目標',data:kpis.map(k=>k.salesTarget),type:'line',borderColor:'#ffffff40',backgroundColor:'transparent',borderWidth:2,pointBackgroundColor:'#ffffff60',tension:0.3}
  ]},options:opts});

  const c2=document.getElementById('chart-new-rate');
  if(c2) State.charts.n=new Chart(c2,{type:'doughnut',data:{labels,datasets:[{data:kpis.map(k=>k.newCount),backgroundColor:COLS,borderWidth:2,borderColor:'#16181f'}]},
    options:{...opts,plugins:{legend:{position:'bottom',labels:{color:'#a1a1aa',font:{size:11},padding:10}}}}});

  const daily={};
  State.sales.forEach(r=>{ const d=safe(r,COL.DATE); if(!d) return; daily[d]=(daily[d]||0)+safeNum(r,COL.AMOUNT); });
  const dk=Object.keys(daily).sort();
  const c3=document.getElementById('chart-daily');
  if(c3&&dk.length) State.charts.d=new Chart(c3,{type:'line',data:{labels:dk,datasets:[
    {label:'日別売上',data:dk.map(d=>daily[d]),borderColor:'#d4a843',backgroundColor:'#d4a84318',fill:true,tension:0.4,pointBackgroundColor:'#d4a843',pointRadius:4}
  ]},options:opts});
}

function renderStoreTab(){
  const fe=document.getElementById('store-filter');
  fe.innerHTML='<button class="filter-btn '+(State.storeFilter==='all'?'active':'')+'" data-store="all">全店舗</button>'+
    State.storeNames.map(n=>'<button class="filter-btn '+(State.storeFilter===n?'active':'')+'" data-store="'+escA(n)+'">'+(State.storeShortNames[n]||n)+'</button>').join('');
  fe.querySelectorAll('.filter-btn').forEach(b=>{ b.onclick=()=>{ State.storeFilter=b.dataset.store; renderStoreTab(); }; });

  const kpis=computeStoreKPIs(State.storeFilter);
  document.getElementById('store-kpi-cards').innerHTML=kpis.map(k=>`
    <div class="store-kpi-card">
      <div class="store-kpi-name">🏪 ${esc(k.shortName)}</div>
      <div class="store-kpi-fullname" title="${escA(k.key)}">${esc(k.key)}</div>
      <div class="store-metrics">
        <div class="store-metric"><div class="store-metric-label">売上</div><div class="store-metric-val" style="color:var(--gold)">${fmt.yen(k.totalSales)}</div></div>
        <div class="store-metric"><div class="store-metric-label">売上達成率</div><div class="store-metric-val ${rateClass(k.salesAchRate)}">${k.salesTarget?fmt.pct(k.salesAchRate):'—'}</div></div>
        <div class="store-metric"><div class="store-metric-label">新規数/目標</div><div class="store-metric-val" style="color:var(--teal)">${k.newCount} / ${k.newTarget||'—'}</div></div>
        <div class="store-metric"><div class="store-metric-label">新規達成率</div><div class="store-metric-val ${rateClass(k.newAchRate)}">${k.newTarget?fmt.pct(k.newAchRate):'—'}</div></div>
        <div class="store-metric"><div class="store-metric-label">平均単価</div><div class="store-metric-val" style="color:var(--blue)">${fmt.yen(k.avgUnit)}</div></div>
        <div class="store-metric"><div class="store-metric-label">新規契約率</div><div class="store-metric-val ${rateClass(k.newContractRate)}">${fmt.pct(k.newContractRate)}</div></div>
        <div class="store-metric"><div class="store-metric-label">再来数</div><div class="store-metric-val">${k.returnCount}</div></div>
        <div class="store-metric"><div class="store-metric-label">継続契約率</div><div class="store-metric-val ${rateClass(k.continuationRate)}">${fmt.pct(k.continuationRate)}</div></div>
      </div>
    </div>`).join('');

  document.getElementById('store-table-body').innerHTML=kpis.map(k=>`
    <tr>
      <td title="${escA(k.key)}"><strong>${esc(k.shortName)}</strong></td>
      <td class="${rateClass(k.newAchRate)}">${k.newCount}</td>
      <td>${k.newTarget||'—'}</td>
      <td class="progress-cell">${makeProgress(k.newCount,k.newTarget)}</td>
      <td>${fmt.yen(k.totalSales)}</td>
      <td>${k.salesTarget?fmt.yen(k.salesTarget):'—'}</td>
      <td class="progress-cell">${makeProgress(k.totalSales,k.salesTarget)}</td>
      <td>${fmt.yen(k.avgUnit)}</td>
      <td>${k.unitTarget?fmt.yen(k.unitTarget):'—'}</td>
      <td class="${rateClass(k.newContractRate)}">${fmt.pct(k.newContractRate)}</td>
      <td class="${rateClass(k.continuationRate)}">${fmt.pct(k.continuationRate)}</td>
    </tr>`).join('')||'<tr><td colspan="11" style="text-align:center;color:var(--text-muted)">データなし</td></tr>';
}

function renderStaffTab(){
  const fe=document.getElementById('staff-store-filter');
  fe.innerHTML='<button class="filter-btn '+(State.staffStoreFilter==='all'?'active':'')+'" data-store="all">全店舗</button>'+
    State.storeNames.map(n=>'<button class="filter-btn '+(State.staffStoreFilter===n?'active':'')+'" data-store="'+escA(n)+'">'+(State.storeShortNames[n]||n)+'</button>').join('');
  fe.querySelectorAll('.filter-btn').forEach(b=>{ b.onclick=()=>{ State.staffStoreFilter=b.dataset.store; renderStaffTab(); }; });

  const staff=computeStaffKPIs(State.staffStoreFilter);
  document.getElementById('staff-table-body').innerHTML=staff.map(s=>`
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.shortStore)}</td>
      <td>${s.newCount}</td>
      <td>${fmt.yen(s.totalSales)}</td>
      <td>${fmt.yen(s.avgUnit)}</td>
      <td>${s.newContractCount}</td>
      <td class="${rateClass(s.newContractRate)}">${fmt.pct(s.newContractRate)}</td>
      <td class="${rateClass(s.continuationRate)}">${fmt.pct(s.continuationRate)}</td>
    </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">データなし</td></tr>';
}

function renderRankings(){
  const staff=computeStaffKPIs('all');
  function rl(arr,key,ff){
    return [...arr].sort((a,b)=>(b[key]||0)-(a[key]||0)).slice(0,5).map((s,i)=>`
      <div class="rank-item">
        <div class="rank-num ${['r1','r2','r3','other','other'][i]}">${i+1}</div>
        <div class="rank-info"><div class="rank-name">${esc(s.name)}</div><div class="rank-store">${esc(s.shortStore)}</div></div>
        <div class="rank-val">${ff(s[key])}</div>
      </div>`).join('');
  }
  document.querySelector('#rank-sales .ranking-list').innerHTML=rl(staff,'totalSales',fmt.yen);
  document.querySelector('#rank-contract .ranking-list').innerHTML=rl(staff,'newContractRate',v=>fmt.pct(v));
  document.querySelector('#rank-unit .ranking-list').innerHTML=rl(staff,'avgUnit',fmt.yen);
  document.querySelector('#rank-new .ranking-list').innerHTML=rl(staff,'newCount',v=>v+'件');
}

function renderLTV(){
  const ltv=computeLTV();
  const tot=ltv.reduce((s,c)=>s+c.totalSales,0);
  const avg=ltv.length?tot/ltv.length:0;
  document.getElementById('ltv-kpis').innerHTML=`
    <div class="kpi-card gold"><div class="kpi-label">回数券総売上</div><div class="kpi-value">${fmt.yen(tot)}</div></div>
    <div class="kpi-card teal"><div class="kpi-label">回数券顧客数</div><div class="kpi-value">${ltv.length}</div></div>
    <div class="kpi-card blue"><div class="kpi-label">顧客平均LTV</div><div class="kpi-value">${fmt.yen(avg)}</div></div>
    <div class="kpi-card red"><div class="kpi-label">離脱リスク</div><div class="kpi-value">${ltv.filter(c=>c.status==='danger').length}</div><div class="kpi-sub">60日以上未来店</div></div>`;
  document.getElementById('ltv-table-body').innerHTML=ltv.map(c=>`
    <tr>
      <td><strong>${esc(c.cname)}</strong></td>
      <td style="color:var(--text-muted);font-size:11px">${c.cid}</td>
      <td>${esc(c.shortStore)}</td>
      <td>${esc(c.staff)}</td>
      <td>${fmt.yen(c.totalSales)}</td>
      <td style="color:var(--gold);font-weight:700">${fmt.yen(c.totalSales)}</td>
      <td>${fmt.date(c.lastVisit)}</td>
      <td><span class="ltv-status ${c.status}">${c.status==='danger'?'⚠ 離脱リスク':c.status==='warning'?'要フォロー':'✓ 正常'}</span></td>
    </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">回数券データなし</td></tr>';
}

function renderAlerts(){
  const kpis=computeStoreKPIs('all');
  const ltv=computeLTV();
  const hpb=kpis.filter(k=>k.newTarget>0&&k.newAchRate<80).map(k=>`
    <div class="alert-card hpb">
      <div class="alert-card-title">📉 新規目標未達 — ${esc(k.shortName)}</div>
      <div class="alert-card-body">現在 ${k.newCount}件 / 目標 ${k.newTarget}件<br>達成率: <strong>${fmt.pct(k.newAchRate)}</strong></div>
      <div class="alert-action"><div class="alert-action-label">推奨アクション</div>
        <div>→ HPBクーポン見直し・追加</div><div>→ 口コミキャンペーン実施</div></div>
    </div>`).join('');
  document.getElementById('hpb-alerts').innerHTML='<div class="alert-section-title">📣 HPB集客アラート</div><div class="alert-cards">'+(hpb||'<div class="alert-card ok"><div class="alert-card-title">✅ 全店舗 正常</div><div class="alert-card-body">目標80%以上達成中</div></div>')+'</div>';

  const churn=ltv.filter(c=>c.status!=='safe').slice(0,10).map(c=>`
    <div class="alert-card churn">
      <div class="alert-card-title">⚠ 離脱アラート — ${esc(c.cname)}</div>
      <div class="alert-card-body">店舗: ${esc(c.shortStore)}<br>担当: ${esc(c.staff)}<br>最終来店: <strong>${c.daysSince}日前</strong><br>回数券売上: ${fmt.yen(c.totalSales)}</div>
      <div class="alert-action"><div class="alert-action-label">推奨アクション</div><div>→ DM送信</div><div>→ 電話フォロー</div></div>
    </div>`).join('');
  document.getElementById('churn-alerts').innerHTML='<div class="alert-section-title">🚨 顧客離脱アラート</div><div class="alert-cards">'+(churn||'<div class="alert-card ok"><div class="alert-card-title">✅ 離脱リスクなし</div><div class="alert-card-body">対象顧客はいません</div></div>')+'</div>';
}

function renderSVActions(){
  const kpis=computeStoreKPIs('all'); const acts=[];
  kpis.forEach(k=>{
    if(k.newCount>0&&k.newContractRate<50) acts.push({level:'urgent',store:k.shortName,issue:'契約率低下',data:'現在 '+fmt.pct(k.newContractRate),list:['カウンセリング同席','ロープレ実施','成功事例共有']});
    else if(k.contractTarget>0&&k.newContractRate<k.contractTarget&&k.newCount>0) acts.push({level:'warning',store:k.shortName,issue:'契約率 要注意',data:'現在 '+fmt.pct(k.newContractRate)+' / 目標 '+fmt.pct(k.contractTarget),list:['カウンセリング振り返り','お客様の声収集']});
    if(k.newTarget>0&&k.newAchRate<70) acts.push({level:'urgent',store:k.shortName,issue:'新規不足',data:k.newCount+'件 / 目標'+k.newTarget+'件 ('+fmt.pct(k.newAchRate)+')',list:['HPBクーポン改善','口コミ促進','掲載内容見直し']});
    else if(k.newTarget>0&&k.newAchRate<80) acts.push({level:'info',store:k.shortName,issue:'新規数 要強化',data:k.newCount+'件 / 目標'+k.newTarget+'件',list:['HPBクーポン改善','口コミ投稿促進']});
    if(k.unitTarget>0&&k.avgUnit<k.unitTarget&&k.newCount>0) acts.push({level:'warning',store:k.shortName,issue:'平均単価低下',data:'現在 '+fmt.yen(k.avgUnit)+' / 目標 '+fmt.yen(k.unitTarget),list:['上位メニュー提案強化','オプション訴求改善']});
  });
  document.getElementById('sv-actions').innerHTML=acts.length?acts.map(a=>`
    <div class="sv-card ${a.level}">
      <div class="sv-card-store">${esc(a.store)}</div>
      <div class="sv-card-issue">${a.issue}</div>
      <div class="sv-card-data">${a.data}</div>
      <ul class="sv-actions-list">${a.list.map(x=>'<li>'+x+'</li>').join('')}</ul>
    </div>`).join(''):`<div class="sv-card info" style="grid-column:1/-1"><div class="sv-card-store">全店舗</div><div class="sv-card-issue">✅ 全KPI正常</div><div class="sv-card-data">特段のアクション不要です</div></div>`;
}

function renderBanner(){
  const kpis=computeStoreKPIs('all');
  const issues=kpis.filter(k=>(k.newTarget>0&&k.newAchRate<70)||(k.newCount>0&&k.newContractRate<50));
  const b=document.getElementById('alert-banner');
  if(issues.length){ b.textContent='⚠ 要注意: '+issues.map(k=>k.shortName).join('、')+' で重要指標が基準を下回っています。「アラート」タブを確認してください。'; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('today-date').textContent=new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  loadAllData();
});
