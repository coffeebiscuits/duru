// ====== 전역 변수 ======
let db = null;
let SQL = null;
let fileHandle = null; // 파일 핸들 (자동 저장용)
let activeTab = 'dashboard';
let selectedYear = new Date().getFullYear();
let currentChart = null;

const formatKRW = (v) => new Intl.NumberFormat('ko-KR').format(v) + '원';

// ====== 초기화 ======
window.onload = async () => {
  const config = { locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}` };
  SQL = await initSqlJs(config);
  
  new bootstrap.Modal(document.getElementById('entryModal')).show();
  
  setInterval(() => {
    document.getElementById('clock').innerText = new Date().toTimeString().split(' ')[0];
  }, 1000);
};

// ====== [1] 새 파일 만들기 (New) ======
document.getElementById('btn-new-db').addEventListener('click', async () => {
  db = new SQL.Database();
  createTables();
  
  try {
    // 저장할 파일 위치를 먼저 지정받음 (핸들 확보)
    if (window.showSaveFilePicker) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'my_bonds.db',
        types: [{ description: 'SQLite DB', accept: {'application/x-sqlite3': ['.db']} }]
      });
      await autoSave(); // 빈 파일 최초 저장
    }
    bootstrap.Modal.getInstance(document.getElementById('entryModal')).hide();
    render();
  } catch (err) {
    if(err.name !== 'AbortError') alert('파일 생성 중 오류: ' + err);
  }
});

// ====== [2] 파일 열기 (Open & Auto-Sync) ======
document.getElementById('btn-open-db').addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    // Modern Browser (PC Chrome/Edge): 직접 열기 및 핸들 확보
    try {
      [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite DB', accept: {'application/x-sqlite3': ['.db']} }]
      });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));
      
      bootstrap.Modal.getInstance(document.getElementById('entryModal')).hide();
      render();
    } catch (err) {
      if(err.name !== 'AbortError') alert('파일 열기 실패: ' + err);
    }
  } else {
    // Fallback (Mobile/Safari): 기존 input 방식
    document.getElementById('dbInput').click();
  }
});

// Fallback Input Change Handler
document.getElementById('dbInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    db = new SQL.Database(new Uint8Array(reader.result));
    bootstrap.Modal.getInstance(document.getElementById('entryModal')).hide();
    render();
  };
  reader.readAsArrayBuffer(file);
});

// ====== [핵심] 자동 저장 로직 ======
async function autoSave() {
  if (!db) return;
  const data = db.export(); // Binary Data

  const statusEl = document.getElementById('saveStatus');
  statusEl.innerText = '저장 중...';
  statusEl.className = 'badge rounded-pill text-bg-warning border fw-normal';

  try {
    if (fileHandle) {
      // 1. 핸들이 있으면 해당 파일에 덮어쓰기
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } else {
      // 2. 핸들이 없으면(모바일 등) 다운로드 트리거 (어쩔 수 없음)
      // 사용자 경험을 위해 매번 다운로드보다는, 변경 시 알림을 주거나 필요 시 다운로드하도록 유도할 수 있음.
      // 여기서는 지시대로 '즉시 저장'을 위해 다운로드 실행
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my_bonds_autosave.db';
      a.click();
    }
    statusEl.innerText = '저장됨';
    statusEl.className = 'badge rounded-pill text-bg-success border fw-normal';
  } catch (err) {
    console.error(err);
    statusEl.innerText = '저장 실패';
    statusEl.className = 'badge rounded-pill text-bg-danger border fw-normal';
  }
}

// ====== DB Mutation Helper (변경 발생 시 자동 저장) ======
function runQuery(sql, params = []) {
  db.run(sql, params);
  autoSave(); // 쿼리 실행 후 즉시 저장
}

// ====== 테이블 스키마 ======
function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS bonds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, account TEXT, buyDate TEXT, maturityDate TEXT,
    rate REAL, buyAmount INTEGER, status TEXT DEFAULT 'active', redemptionAmount INTEGER DEFAULT 0
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS interests (
    bond_id INTEGER, year INTEGER, month INTEGER, amount INTEGER,
    PRIMARY KEY (bond_id, year, month)
  );`);
}

// ====== 데이터 조회 ======
function getBonds() {
  if (!db) return [];
  const stmt = db.prepare("SELECT * FROM bonds");
  const result = [];
  while(stmt.step()) result.push(stmt.getAsObject());
  stmt.free();

  return result.map(bond => {
    const iStmt = db.prepare("SELECT year, month, amount FROM interests WHERE bond_id = :id");
    iStmt.bind({':id': bond.id});
    const interests = {};
    while(iStmt.step()) {
      const row = iStmt.getAsObject();
      if(!interests[row.year]) interests[row.year] = {};
      interests[row.year][row.month] = row.amount;
    }
    iStmt.free();
    return { ...bond, interests };
  });
}

// ====== 렌더링 (기존 로직 동일) ======
function render() {
  const area = document.getElementById('render-area');
  area.innerHTML = '';
  document.querySelectorAll('.sidebar-menu a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === activeTab);
  });

  const bonds = getBonds();
  if (activeTab === 'dashboard') renderDashboard(area, bonds);
  else if (activeTab === 'list') renderList(area, bonds);
  else if (activeTab === 'interest') renderInterest(area, bonds);
  else if (activeTab === 'analytics') renderAnalytics(area, bonds);
}

// --- 탭별 렌더러 ---
function renderDashboard(container, bonds) {
  const activeBonds = bonds.filter(b => b.status === 'active');
  const totalInv = activeBonds.reduce((a, c) => a + c.buyAmount, 0);
  let thisYearIncome = 0;
  bonds.forEach(b => {
    const yData = b.interests?.[new Date().getFullYear()];
    if(yData) Object.values(yData).forEach(v => thisYearIncome += v);
  });

  container.innerHTML = `
    <h3 class="mb-4 fw-bold">안녕하세요 👋 <span class="fs-6 fw-normal text-secondary">오늘의 투자 현황입니다.</span></h3>
    <div class="row g-4">
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">현재 총 투자 원금</div><div class="stat-value" style="color:var(--accent-color);">${formatKRW(totalInv)}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">${new Date().getFullYear()}년 예상 이자</div><div class="stat-value">${formatKRW(thisYearIncome)}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">운용 종목 수</div><div class="stat-value">${activeBonds.length} 개</div></div></div>
    </div>
    <div class="row mt-4">
      <div class="col-lg-8"><div class="content-box"><h5 class="fw-bold mb-4">자산 비중 (Top 5)</h5><canvas id="dashChart" height="100"></canvas></div></div>
      <div class="col-lg-4"><div class="content-box"><h5 class="fw-bold mb-4">최근 등록 자산</h5><table class="table table-hover table-borderless"><thead><tr><th>자산명</th><th>상태</th></tr></thead><tbody>
      ${bonds.slice(-4).reverse().map(b => `<tr><td class="fw-bold text-secondary">${b.name}</td><td><span class="badge-soft ${b.status==='active'?'status-wait':'status-done'}">${b.status==='active'?'보유중':'완료'}</span></td></tr>`).join('')}
      </tbody></table></div></div>
    </div>
  `;
  const ctx = document.getElementById('dashChart').getContext('2d');
  if(currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, { type: 'bar', data: { labels: activeBonds.slice(0, 5).map(b => b.name), datasets: [{ label: '투자금액', data: activeBonds.slice(0, 5).map(b => b.buyAmount), backgroundColor: '#059669', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
}

function renderList(container, bonds) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4"><h3 class="fw-bold">자산 관리</h3><button class="btn btn-primary-custom rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#addBondModal">+ 새 자산 등록</button></div>
    <div class="content-box mt-0"><div class="table-responsive"><table class="table table-hover"><thead><tr><th>채권명</th><th>계좌</th><th>매수금액</th><th>이율</th><th>만기일</th><th>상태/손익</th><th>관리</th></tr></thead><tbody>
    ${bonds.length === 0 ? '<tr><td colspan="7" class="text-center py-5 text-muted">데이터가 없습니다.</td></tr>' : 
      bonds.slice().reverse().map(b => {
        let statusBadge = `<span class="badge-soft status-wait">보유중</span>`, profitText = '';
        if(b.status === 'completed') {
          statusBadge = `<span class="badge-soft status-done">완료</span>`;
          const diff = (b.redemptionAmount || b.buyAmount) - b.buyAmount;
          profitText = diff > 0 ? `<div class="profit-plus mt-1">+${formatKRW(diff)}</div>` : (diff < 0 ? `<div class="profit-minus mt-1">${formatKRW(diff)}</div>` : `<div class="text-secondary small mt-1">원금상환</div>`);
        }
        return `<tr><td class="fw-bold">${b.name}</td><td class="text-secondary small">${b.account}</td><td class="fw-bold text-dark">${formatKRW(b.buyAmount)}</td><td style="color:var(--accent-color); font-weight:800;">${b.rate}%</td><td class="text-secondary small">${b.maturityDate}</td><td>${statusBadge}${profitText}</td>
        <td><button onclick="deleteBond(${b.id})" class="btn btn-sm btn-outline-danger border-0 rounded-circle">🗑️</button>${b.status==='active' ? `<button onclick="toggleStatus(${b.id}, '${b.name}', ${b.buyAmount})" class="btn btn-sm btn-outline-success border-0 rounded-circle ms-1">✔️</button>` : ''}</td></tr>`;
      }).join('')}
    </tbody></table></div></div>
  `;
}

function renderInterest(container, bonds) {
  container.innerHTML = `
    <h3 class="mb-4 fw-bold">이자 수취 관리</h3><div class="content-box mt-0"><div class="mb-3"><select onchange="changeYear(this.value)" class="form-select w-auto fw-bold text-secondary border-0 bg-light">${[2024, 2025, 2026, 2027, 2028].map(y => `<option value="${y}" ${selectedYear==y?'selected':''}>📅 ${y}년 데이터</option>`).join('')}</select></div>
    <div class="table-responsive"><table class="table table-bordered text-center" style="border-color:#e2e8f0;"><thead><tr><th class="text-start bg-light">자산명</th><th class="bg-light text-dark">합계</th>${Array.from({length:12}, (_,i)=>`<th>${i+1}월</th>`).join('')}</tr></thead><tbody>
    ${bonds.map(b => {
      const yData = b.interests?.[selectedYear] || {};
      const rowTotal = Object.values(yData).reduce((a,v)=>a+(Number(v)||0), 0);
      return `<tr><td class="text-start fw-bold text-secondary">${b.name}</td><td class="fw-bold text-dark bg-light">${rowTotal.toLocaleString()}</td>${Array.from({length:12}, (_,i)=>`<td style="min-width:80px;"><input type="number" value="${yData[i+1]||''}" onchange="updateInterest(${b.id}, ${selectedYear}, ${i+1}, this.value)" class="input-interest"></td>`).join('')}</tr>`;
    }).join('')}
    </tbody></table></div></div>
  `;
}

function renderAnalytics(container, bonds) {
  const totalLife = bonds.reduce((a, c) => a + c.buyAmount, 0);
  let totalInterest = 0, capitalGain = 0;
  bonds.forEach(b => {
    Object.values(b.interests || {}).forEach(y => Object.values(y).forEach(v => totalInterest += v));
    if(b.status === 'completed') capitalGain += (b.redemptionAmount - b.buyAmount);
  });
  const totalProfit = totalInterest + capitalGain;
  const monthlyData = Array(12).fill(0).map((_, i) => { let sum=0; bonds.forEach(b => sum += (b.interests?.[selectedYear]?.[i+1] || 0)); return sum; });

  container.innerHTML = `
    <h3 class="mb-4 fw-bold">수익 통계</h3><div class="row g-4"><div class="col-md-6"><div class="stat-card"><div class="stat-title">누적 총 투자액</div><div class="stat-value text-secondary">${formatKRW(totalLife)}</div></div></div>
    <div class="col-md-6"><div class="stat-card"><div class="stat-title">누적 실현 손익 (이자+매매차익)</div><div class="stat-value" style="color:var(--accent-color);">${totalProfit > 0 ? '+' : ''}${formatKRW(totalProfit)}</div><div class="small text-secondary mt-1">이자수익: ${formatKRW(totalInterest)} / 차익: ${formatKRW(capitalGain)}</div></div></div></div>
    <div class="content-box"><h5 class="fw-bold">${selectedYear}년 월별 이자 수익 추이</h5><canvas id="anaChart" height="100"></canvas></div>
  `;
  const ctx = document.getElementById('anaChart').getContext('2d');
  if(currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, { type: 'line', data: { labels: Array.from({length:12}, (_,i)=>`${i+1}월`), datasets: [{ label: '월별 수익', data: monthlyData, borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)', fill: true, tension: 0.4 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { color: '#f1f5f9' } } } } });
}

// ====== 이벤트 핸들러 & Auto Save 적용 ======

document.getElementById('nav-menu').addEventListener('click', (e) => {
  const target = e.target.closest('a');
  if (target && target.dataset.tab) { activeTab = target.dataset.tab; render(); }
});

document.getElementById('hamBtn').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  sb.style.display = sb.style.display === 'block' ? 'none' : 'block';
});

// [변경점] db.run 대신 runQuery(자동저장) 사용
document.getElementById('add-bond-form').onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  runQuery(`INSERT INTO bonds (name, account, buyDate, maturityDate, rate, buyAmount) VALUES (?, ?, ?, ?, ?, ?)`, 
    [fd.get('name'), fd.get('account'), fd.get('buyDate'), fd.get('maturityDate'), fd.get('rate'), Number(fd.get('buyAmount'))]);
  
  bootstrap.Modal.getInstance(document.getElementById('addBondModal')).hide();
  e.target.reset();
  render();
};

window.deleteBond = (id) => {
  if(confirm('삭제하시겠습니까?')) { 
    // 트랜잭션 개념 대신 순차 실행
    runQuery("DELETE FROM bonds WHERE id = ?", [id]);
    runQuery("DELETE FROM interests WHERE bond_id = ?", [id]);
    render(); 
  }
};

window.toggleStatus = (id, name, buyAmt) => {
  const inputVal = prompt(`'${name}' 채권의 만기(상환) 금액을 입력하세요.\n(입력 미시 매수금액과 동일)`, buyAmt);
  if (inputVal !== null) {
    const finalAmt = inputVal.trim() === '' ? buyAmt : Number(inputVal);
    runQuery("UPDATE bonds SET status = 'completed', redemptionAmount = ? WHERE id = ?", [finalAmt, id]);
    render();
  }
};

window.updateInterest = (id, y, m, v) => {
  runQuery(`INSERT INTO interests (bond_id, year, month, amount) VALUES (?, ?, ?, ?) 
          ON CONFLICT(bond_id, year, month) DO UPDATE SET amount = ?`, [id, y, m, v, v]);
  render(); // 이자 수정은 잦으므로 렌더링 최적화 고려 가능하나 여기선 즉시 반영
};

window.changeYear = (v) => { selectedYear = v; render(); };
