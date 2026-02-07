// ====== 시계 ======
setInterval(() => {
  const n = new Date();
  document.getElementById('clock').innerText = n.toTimeString().split(' ')[0];
}, 1000);

// ====== 사이드바 토글 (모바일) ======
document.getElementById('hamBtn').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  sb.style.display = sb.style.display === 'block' ? 'none' : 'block';
});

// ====== 데이터 및 상태 초기화 ======
let bonds = JSON.parse(localStorage.getItem('bond_manager_v6_data')) || [];
let activeTab = 'dashboard';
let selectedYear = new Date().getFullYear();
let currentChart = null;

const formatKRW = (v) => new Intl.NumberFormat('ko-KR').format(v) + '원';
const saveData = () => localStorage.setItem('bond_manager_v6_data', JSON.stringify(bonds));

// ====== 메인 렌더링 함수 ======
function render() {
  const area = document.getElementById('render-area');
  area.innerHTML = '';
  
  // 탭 활성화 처리
  document.querySelectorAll('.sidebar-menu a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === activeTab);
  });

  // 탭에 따른 화면 전환
  if (activeTab === 'dashboard') renderDashboard(area);
  else if (activeTab === 'list') renderList(area);
  else if (activeTab === 'interest') renderInterest(area);
  else if (activeTab === 'analytics') renderAnalytics(area);
}

// 1. 대시보드 렌더링
function renderDashboard(container) {
  const activeBonds = bonds.filter(b => b.status === 'active');
  const totalInv = activeBonds.reduce((a, c) => a + Number(c.buyAmount), 0);
  let thisYearIncome = 0;
  bonds.forEach(b => {
    const yData = b.interests?.[new Date().getFullYear()];
    if(yData) Object.values(yData).forEach(v => thisYearIncome += (Number(v)||0));
  });

  container.innerHTML = `
    <h3 class="mb-4" style="font-weight:800; letter-spacing:-0.5px;">안녕하세요 👋 <span style="font-size:1rem; color:var(--text-sub); font-weight:500; letter-spacing:0;">오늘의 투자 현황입니다.</span></h3>
    <div class="row g-4">
      <div class="col-md-4">
        <div class="stat-card">
          <div class="stat-title">현재 총 투자 원금</div>
          <div class="stat-value" style="color:var(--accent-color);">${formatKRW(totalInv)}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <div class="stat-title">${new Date().getFullYear()}년 예상 이자</div>
          <div class="stat-value">${formatKRW(thisYearIncome)}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <div class="stat-title">운용 종목 수</div>
          <div class="stat-value">${activeBonds.length} 개</div>
        </div>
      </div>
    </div>
    <div class="row mt-4">
       <div class="col-lg-8">
         <div class="content-box">
           <h5 style="color:var(--text-main); font-weight:700; margin-bottom:20px;">자산 비중 (Top 5)</h5>
           <canvas id="dashChart" height="100"></canvas>
         </div>
       </div>
       <div class="col-lg-4">
         <div class="content-box">
           <h5 style="color:var(--text-main); font-weight:700; margin-bottom:20px;">최근 등록 자산</h5>
           <table class="table table-hover table-borderless">
             <thead><tr><th>자산명</th><th>상태</th></tr></thead>
             <tbody>
               ${bonds.slice(-4).reverse().map(b => `
                 <tr>
                   <td class="fw-bold text-secondary">${b.name}</td>
                   <td><span class="badge-soft ${b.status==='active'?'status-wait':'status-done'}">${b.status==='active'?'보유중':'완료'}</span></td>
                 </tr>
               `).join('')}
             </tbody>
           </table>
         </div>
       </div>
    </div>
  `;
  
  const ctx = document.getElementById('dashChart').getContext('2d');
  if(currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: activeBonds.slice(0, 5).map(b => b.name),
      datasets: [{ label: '투자금액', data: activeBonds.slice(0, 5).map(b => b.buyAmount), backgroundColor: '#059669', borderRadius: 6 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
    }
  });
}

// 2. 자산 리스트 렌더링
function renderList(container) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 style="font-weight:800; letter-spacing:-0.5px;">자산 관리</h3>
      <button class="btn btn-primary-custom rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#addBondModal">+ 새 자산 등록</button>
    </div>
    <div class="content-box mt-0">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>채권명</th><th>계좌</th><th>매수금액</th><th>이율</th><th>만기일</th><th>상태/손익</th><th>관리</th></tr></thead>
          <tbody>
            ${bonds.length === 0 ? '<tr><td colspan="7" class="text-center py-5 text-muted fw-bold">데이터가 없습니다.</td></tr>' : 
              bonds.slice().reverse().map(b => {
                let statusBadge = `<span class="badge-soft status-wait">보유중</span>`;
                let profitText = '';
                
                if(b.status === 'completed') {
                  statusBadge = `<span class="badge-soft status-done">완료</span>`;
                  const diff = (b.redemptionAmount || b.buyAmount) - b.buyAmount;
                  if(diff > 0) profitText = `<div class="profit-plus mt-1">+${formatKRW(diff)}</div>`;
                  else if(diff < 0) profitText = `<div class="profit-minus mt-1">${formatKRW(diff)}</div>`;
                  else profitText = `<div class="text-secondary small mt-1">원금상환</div>`;
                }

                return `
                <tr>
                  <td class="fw-bold">${b.name}</td>
                  <td class="text-secondary small">${b.account}</td>
                  <td class="fw-bold text-dark">${formatKRW(b.buyAmount)}</td>
                  <td style="color:var(--accent-color); font-weight:800;">${b.rate}%</td>
                  <td class="text-secondary small">${b.maturityDate}</td>
                  <td>${statusBadge}${profitText}</td>
                  <td>
                    <button onclick="deleteBond(${b.id})" class="btn btn-sm btn-outline-danger border-0 rounded-circle" title="삭제">🗑️</button>
                    ${b.status==='active' ? `<button onclick="toggleStatus(${b.id}, '${b.name}', ${b.buyAmount})" class="btn btn-sm btn-outline-success border-0 rounded-circle ms-1" title="상환(만기) 처리">✔️</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 3. 이자 수취 관리 렌더링
function renderInterest(container) {
  container.innerHTML = `
    <h3 class="mb-4" style="font-weight:800; letter-spacing:-0.5px;">이자 수취 관리</h3>
    <div class="content-box mt-0">
      <div class="mb-3 d-flex align-items-center gap-2">
         <select onchange="changeYear(this.value)" class="form-select w-auto fw-bold text-secondary border-0 bg-light">
           ${[2024, 2025, 2026, 2027, 2028].map(y => `<option value="${y}" ${selectedYear==y?'selected':''}>📅 ${y}년 데이터</option>`).join('')}
         </select>
      </div>
      <div class="table-responsive">
        <table class="table table-bordered text-center" style="border-color:#e2e8f0;">
          <thead>
            <tr>
              <th class="text-start bg-light">자산명</th>
              <th class="bg-light text-dark">합계</th>
              ${Array.from({length:12}, (_,i)=>`<th>${i+1}월</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${bonds.map(b => {
              const yData = b.interests?.[selectedYear] || {};
              const rowTotal = Object.values(yData).reduce((a,v)=>a+(Number(v)||0), 0);
              return `
                <tr>
                  <td class="text-start fw-bold text-secondary">${b.name}</td>
                  <td class="fw-bold text-dark bg-light">${rowTotal.toLocaleString()}</td>
                  ${Array.from({length:12}, (_,i)=>`
                    <td style="min-width:80px;"><input type="number" value="${yData[i+1]||''}" onchange="updateInterest(${b.id}, ${selectedYear}, ${i+1}, this.value)" class="input-interest"></td>
                  `).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 4. 수익 통계 렌더링
function renderAnalytics(container) {
  const totalLife = bonds.reduce((a, c) => a + Number(c.buyAmount), 0);
  
  // 누적 실현 손익 = (모든 이자 수익) + (완료된 채권의 자본 차익)
  let totalInterest = 0;
  let capitalGain = 0;

  bonds.forEach(b => {
    Object.values(b.interests || {}).forEach(y => Object.values(y).forEach(v => totalInterest += (Number(v)||0)));
    if(b.status === 'completed' && b.redemptionAmount !== undefined) {
      capitalGain += (Number(b.redemptionAmount) - Number(b.buyAmount));
    }
  });
  
  const totalProfit = totalInterest + capitalGain;
  const monthlyData = Array(12).fill(0).map((_, i) => {
    let sum = 0;
    bonds.forEach(b => sum += (Number(b.interests?.[selectedYear]?.[i+1]) || 0));
    return sum;
  });

  container.innerHTML = `
    <h3 class="mb-4" style="font-weight:800; letter-spacing:-0.5px;">수익 통계</h3>
    <div class="row g-4">
      <div class="col-md-6">
        <div class="stat-card">
          <div class="stat-title">누적 총 투자액</div>
          <div class="stat-value text-secondary">${formatKRW(totalLife)}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="stat-card">
          <div class="stat-title">누적 실현 손익 (이자+매매차익)</div>
          <div class="stat-value" style="color:var(--accent-color);">
            ${totalProfit > 0 ? '+' : ''}${formatKRW(totalProfit)}
          </div>
          <div class="small text-secondary mt-1">이자수익: ${formatKRW(totalInterest)} / 차익: ${formatKRW(capitalGain)}</div>
        </div>
      </div>
    </div>
    <div class="content-box">
      <h5 style="color:var(--text-main); font-weight:700;">${selectedYear}년 월별 이자 수익 추이</h5>
      <canvas id="anaChart" height="100"></canvas>
    </div>
  `;
  
  const ctx = document.getElementById('anaChart').getContext('2d');
  if(currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({length:12}, (_,i)=>`${i+1}월`),
      datasets: [{
        label: '월별 수익', data: monthlyData, borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)',
        fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: '#059669'
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { color: '#f1f5f9' } } }
    }
  });
}

// ====== 이벤트 핸들러 (Global Window Functions for HTML OnClick) ======

// 탭 전환
document.getElementById('nav-menu').addEventListener('click', (e) => {
  const target = e.target.closest('a');
  if (target && target.dataset.tab) {
    activeTab = target.dataset.tab;
    render();
  }
});

// 새 채권 등록 폼 제출
document.getElementById('add-bond-form').onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  bonds.push({
    id: Date.now(),
    name: fd.get('name'), account: fd.get('account'),
    buyDate: fd.get('buyDate'), maturityDate: fd.get('maturityDate'),
    rate: fd.get('rate'), buyAmount: Number(fd.get('buyAmount')),
    status: 'active', interests: {}
  });
  saveData();
  const modalEl = document.getElementById('addBondModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.hide();
  e.target.reset();
  render();
};

// 상환(만기) 처리
window.toggleStatus = (id, name, buyAmt) => {
  const inputVal = prompt(`'${name}' 채권의 만기(상환) 금액을 입력하세요.\n(입력하지 않으면 매수금액(${formatKRW(buyAmt)})과 동일하게 처리됩니다.)`, buyAmt);
  if (inputVal !== null) { 
    const finalAmt = inputVal.trim() === '' ? buyAmt : Number(inputVal);
    bonds = bonds.map(b => b.id === id ? { ...b, status: 'completed', redemptionAmount: finalAmt } : b);
    saveData(); 
    render();
  }
};

// 채권 삭제
window.deleteBond = (id) => {
  if(confirm('삭제하시겠습니까?')) { bonds = bonds.filter(b => b.id !== id); saveData(); render(); }
};

// 이자 금액 수정
window.updateInterest = (id, y, m, v) => {
  bonds = bonds.map(b => {
    if(b.id === id) {
      if(!b.interests) b.interests = {};
      if(!b.interests[y]) b.interests[y] = {};
      b.interests[y][m] = v;
    }
    return b;
  });
  saveData(); render();
};

// 연도 변경
window.changeYear = (v) => { selectedYear = v; render(); };

// 초기 실행
render();
