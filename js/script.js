// ====== [0] 전역 변수 및 설정 ======
let db = null;
let SQL = null;
let fileHandle = null; // ★ 파일 저장 위치를 기억하는 핵심 변수
let activeTab = 'dashboard';
let selectedYear = new Date().getFullYear();
let currentChart = null;

const formatKRW = (v) => new Intl.NumberFormat('ko-KR').format(v) + '원';

// ====== [1] 초기화 (window.onload) ======
window.onload = async () => {
  // 1. SQL.js 로드
  const config = { locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}` };
  try {
    SQL = await initSqlJs(config);
    console.log("SQL.js 로드 성공");
  } catch (err) {
    console.error(err);
    alert("필수 라이브러리(SQL.js) 로드 실패. 인터넷 연결을 확인하세요.");
    return;
  }
  
  // 2. 초기 모달 띄우기 (HTML에 존재할 경우만)
  const entryModal = document.getElementById('entryModal');
  if (entryModal) new bootstrap.Modal(entryModal).show();
  
  // 3. 시계 동작
  setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.innerText = new Date().toTimeString().split(' ')[0];
  }, 1000);
};

// ====== [2] 새 파일 만들기 (New) ======
const btnNew = document.getElementById('btn-new-db');
if(btnNew) {
  btnNew.addEventListener('click', async () => {
    if (!confirm("새 DB 파일을 만드시겠습니까?\n(주의: 기존에 열려있던 내용은 저장되지 않습니다)")) return;

    db = new SQL.Database();
    createTables();
    
    try {
      // 자동 저장 지원 브라우저 체크
      if (window.showSaveFilePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'my_bonds.db',
          types: [{ description: 'SQLite DB', accept: {'application/x-sqlite3': ['.db']} }]
        });
        
        // 파일명 UI 업데이트
        document.getElementById('db-filename').innerText = fileHandle.name + " (자동 저장 됨)";
        
        // 빈 파일 즉시 생성 (초기화)
        await saveCurrentDb(false); 
      } else {
        // 미지원 브라우저 (폴백)
        fileHandle = null;
        document.getElementById('db-filename').innerText = 'my_bonds.db (수동 저장 필요)';
        alert("이 브라우저는 '자동 저장'을 지원하지 않습니다. 저장 버튼을 누를 때마다 다운로드됩니다.");
        await saveCurrentDb(false);
      }

      // 모달 닫기
      const modalEl = document.getElementById('entryModal');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
      
      render();

    } catch (err) {
      // 사용자가 취소(AbortError)한 경우는 무시, 그 외엔 에러 표시
      if(err.name !== 'AbortError') {
          alert('파일 생성 중 오류가 발생했습니다: ' + err);
      }
    }
  });
}

// ====== [3] 파일 열기 (덮어쓰기 가능 - API 방식) ======
async function openDbFile() {
  if (window.showOpenFilePicker) {
    try {
      [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite DB', accept: {'application/x-sqlite3': ['.db']} }],
        multiple: false
      });
      
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));
      
      document.getElementById('db-filename').innerText = fileHandle.name + " (수정 모드)";

      const modalEl = document.getElementById('entryModal');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
      
      render();
    } catch (err) {
      if(err.name !== 'AbortError') alert('파일 열기 실패: ' + err);
    }
  } else {
    // API 미지원 시 input 태그 클릭 유도
    const dbInput = document.getElementById('dbInput');
    if(dbInput) dbInput.click();
  }
}

// 버튼 이벤트 연결 (존재 여부 체크 포함)
const btnOpen = document.getElementById('btn-open-db');
if(btnOpen) btnOpen.addEventListener('click', openDbFile);

const headerBtnOpen = document.getElementById('header-btn-open');
if(headerBtnOpen) headerBtnOpen.addEventListener('click', openDbFile);

const headerBtnSave = document.getElementById('header-btn-save');
if(headerBtnSave) headerBtnSave.addEventListener('click', () => saveCurrentDb(true));


// ====== [4] 파일 열기 (Fallback - Input 방식) ======
// ★ 중요: Input으로 열면 브라우저 보안상 원본 파일 경로를 알 수 없어 '덮어쓰기' 불가능
const dbInput = document.getElementById('dbInput');
if(dbInput) {
  dbInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      db = new SQL.Database(new Uint8Array(reader.result));
      
      // ★ 핵심: Input으로 열었으므로 핸들을 null로 초기화하여 '다른 이름으로 저장' 유도
      fileHandle = null; 
      document.getElementById('db-filename').innerText = file.name + " (읽기 전용 / 저장 시 다운로드)";

      const modalEl = document.getElementById('entryModal');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
      
      render();
      alert("⚠️ [주의] '파일 선택' 버튼으로 열었습니다.\n이 방식은 보안상 '덮어쓰기'가 안 되며, 저장 시 새 파일로 다운로드됩니다.");
    };
    reader.readAsArrayBuffer(file);
  });
}

// ====== [5] 핵심: 저장 로직 (덮어쓰기 vs 다운로드 분기) ======
async function saveCurrentDb(showMsg = true) {
  if (!db) {
    if(showMsg) alert("❌ 저장할 데이터가 없습니다. 먼저 파일을 만들거나 여세요.");
    return;
  }
  
  try {
    const data = db.export(); 

    // Case A: 파일 핸들이 있는 경우 (덮어쓰기 시도)
    if (fileHandle) {
      // 권한 확인 (사용자에게 팝업 뜸)
      const options = { mode: 'readwrite' };
      if ((await fileHandle.queryPermission(options)) !== 'granted') {
        const requestResult = await fileHandle.requestPermission(options);
        if (requestResult !== 'granted') {
           throw new Error("파일 쓰기 권한을 거부하셨습니다.");
        }
      }

      // 실제 쓰기 작업
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      
      if(showMsg) alert("✅ [성공] 원본 파일에 덮어쓰기 완료.");
    } 
    // Case B: 파일 핸들이 없는 경우 (다운로드 처리)
    else {
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my_bonds_backup.db'; // 구분하기 쉽게 이름 변경
      a.click();
      
      if(showMsg) alert("⚠️ [알림] 원본 파일에 덮어쓸 권한이 없습니다.\n'다운로드 폴더'에 새 파일로 저장되었습니다.");
    }
  } catch (err) {
    console.error(err);
    alert(`❌ 저장 실패:\n${err.message}`);
  }
}

// ====== [6] DB 쿼리 실행 헬퍼 ======
function runQuery(sql, params = []) {
  if(!db) {
    console.warn("DB가 없습니다.");
    return;
  }
  db.run(sql, params);
  render(); 
}

// ====== [7] 테이블 구조 생성 ======
function createTables() {
  if(!db) return;
  db.run(`CREATE TABLE IF NOT EXISTS bonds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, account TEXT, buyDate TEXT, maturityDate TEXT,
    rate REAL, buyAmount INTEGER, quantity INTEGER DEFAULT 0, 
    status TEXT DEFAULT 'active', redemptionAmount INTEGER DEFAULT 0
  );`);
  
  db.run(`CREATE TABLE IF NOT EXISTS interests (
    bond_id INTEGER, year INTEGER, month INTEGER, amount INTEGER,
    PRIMARY KEY (bond_id, year, month)
  );`);
}

// ====== [8] 데이터 조회 ======
function getBonds() {
  if (!db) return [];
  
  // 채권 기본 정보 조회
  const stmt = db.prepare("SELECT * FROM bonds");
  const result = [];
  while(stmt.step()) result.push(stmt.getAsObject());
  stmt.free();

  // 채권별 이자 정보 매핑
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

// ====== [9] 렌더링 (메인) ======
function render() {
  const area = document.getElementById('render-area');
  if(!area) return;

  area.innerHTML = '';
  
  // 사이드바 탭 활성화 상태 표시
  document.querySelectorAll('.sidebar-menu a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === activeTab);
  });

  const bonds = getBonds();
  
  if (activeTab === 'dashboard') renderDashboard(area, bonds);
  else if (activeTab === 'list') renderList(area, bonds);
  else if (activeTab === 'interest') renderInterest(area, bonds);
  else if (activeTab === 'analytics') renderAnalytics(area, bonds);
}

// --- 탭별 렌더러 함수들 ---
function renderDashboard(container, bonds) {
  const activeBonds = bonds.filter(b => b.status === 'active');
  const totalInv = activeBonds.reduce((a, c) => a + c.buyAmount, 0);
  let thisYearIncome = 0;
  bonds.forEach(b => {
    const yData = b.interests?.[new Date().getFullYear()];
    if(yData) Object.values(yData).forEach(v => thisYearIncome += v);
  });

  container.innerHTML = `
    <h3 class="mb-4 fw-bold">안녕하세요 <span class="fs-6 fw-normal text-secondary">채권 투자 현황입니다.</span></h3>
    <div class="row g-4">
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">현재 총 투자 원금</div><div class="stat-value" style="color:var(--accent-color);">${formatKRW(totalInv)}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">${new Date().getFullYear()}년 예상 이자</div><div class="stat-value">${formatKRW(thisYearIncome)}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-title">보유 채권 상품 수</div><div class="stat-value">${activeBonds.length} 개</div></div></div>
    </div>
    <div class="row mt-4">
      <div class="col-lg-8"><div class="content-box"><h5 class="fw-bold mb-4">자산 비중 (Top 5)</h5><canvas id="dashChart" height="100"></canvas></div></div>
      <div class="col-lg-4"><div class="content-box"><h5 class="fw-bold mb-4">최근 등록 자산</h5><table class="table table-hover table-borderless"><thead><tr><th>자산명</th><th>상태</th></tr></thead><tbody>
      ${bonds.slice(-4).reverse().map(b => `<tr><td class="fw-bold text-secondary">${b.name}</td><td><span class="badge-soft ${b.status==='active'?'status-wait':'status-done'}">${b.status==='active'?'보유중':'완료'}</span></td></tr>`).join('')}
      </tbody></table></div></div>
    </div>
  `;
  
  const canvas = document.getElementById('dashChart');
  if(canvas) {
      const ctx = canvas.getContext('2d');
      if(currentChart) currentChart.destroy();
      currentChart = new Chart(ctx, { type: 'bar', data: { labels: activeBonds.slice(0, 5).map(b => b.name), datasets: [{ label: '투자금액', data: activeBonds.slice(0, 5).map(b => b.buyAmount), backgroundColor: '#059669', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
  }
}

function renderList(container, bonds) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4"><h3 class="fw-bold">채권 관리</h3>
    <button class="btn btn-primary-custom rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#addBondModal">+ 채권 등록</button></div>
    <div class="content-box mt-0"><div class="table-responsive"><table class="table table-hover">
    <thead>
        <tr>
            <th>채권명</th><th>계좌</th><th>수량</th><th>매수금액</th>
            <th>이율</th><th>만기일</th><th>상태/손익</th><th>관리</th>
        </tr>
    </thead>
    <tbody>
    ${bonds.length === 0 ? '<tr><td colspan="8" class="text-center py-5 text-muted">데이터가 없습니다.</td></tr>' : 
      bonds.slice().reverse().map(b => {
        let statusBadge = `<span class="badge-soft status-wait">보유중</span>`, profitText = '';
        if(b.status === 'completed') {
          statusBadge = `<span class="badge-soft status-done">완료</span>`;
          const diff = (b.redemptionAmount || b.buyAmount) - b.buyAmount;
          profitText = diff > 0 ? `<div class="profit-plus mt-1">+${formatKRW(diff)}</div>` : (diff < 0 ? `<div class="profit-minus mt-1">${formatKRW(diff)}</div>` : `<div class="text-secondary small mt-1">원금상환</div>`);
        }
        
        return `<tr>
            <td class="fw-bold text-primary text-decoration-underline" style="cursor:pointer;" onclick="openEditModal(${b.id})">
                ${b.name}
            </td>
            <td class="text-secondary small">${b.account}</td>
            <td class="text-dark">${b.quantity ? Number(b.quantity).toLocaleString() : 0}</td>
            <td class="fw-bold text-dark">${formatKRW(b.buyAmount)}</td>
            <td style="color:var(--accent-color); font-weight:800;">${b.rate}%</td>
            <td class="text-secondary small">${b.maturityDate}</td>
            <td>${statusBadge}${profitText}</td>
            <td>
                ${b.status==='active' ? `<button onclick="toggleStatus(${b.id}, '${b.name}', ${b.buyAmount})" class="btn btn-sm btn-outline-success border-0 rounded-circle ms-1">✔️</button>` : ''}
            </td>
        </tr>`;
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
  
  const canvas = document.getElementById('anaChart');
  if(canvas) {
      const ctx = canvas.getContext('2d');
      if(currentChart) currentChart.destroy();
      currentChart = new Chart(ctx, { type: 'line', data: { labels: Array.from({length:12}, (_,i)=>`${i+1}월`), datasets: [{ label: '월별 수익', data: monthlyData, borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)', fill: true, tension: 0.4 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { color: '#f1f5f9' } } } } });
  }
}

// ====== [10] UI 이벤트 리스너 ======
const navMenu = document.getElementById('nav-menu');
if(navMenu) {
    navMenu.addEventListener('click', (e) => {
      const target = e.target.closest('a');
      if (target && target.dataset.tab) { activeTab = target.dataset.tab; render(); }
    });
}

const hamBtn = document.getElementById('hamBtn');
if(hamBtn) {
    hamBtn.addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      sb.style.display = sb.style.display === 'block' ? 'none' : 'block';
    });
}

// 채권 등록 (INSERT)
const addForm = document.getElementById('add-bond-form');
if(addForm) {
    addForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      
      runQuery(`INSERT INTO bonds (name, account, buyDate, maturityDate, rate, buyAmount, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [
          fd.get('name'), 
          fd.get('account'), 
          fd.get('buyDate'), 
          fd.get('maturityDate'), 
          fd.get('rate'), 
          Number(fd.get('buyAmount')),
          Number(fd.get('quantity'))
        ]);
      
      bootstrap.Modal.getInstance(document.getElementById('addBondModal')).hide();
      e.target.reset();
      render();
    };
}

// 인라인 이벤트 함수 (HTML 문자열 내에서 호출됨)
window.deleteBond = (id) => {
  if(confirm('이 채권을 정말 삭제하시겠습니까?')) { 
    runQuery("DELETE FROM bonds WHERE id = ?", [id]);
    runQuery("DELETE FROM interests WHERE bond_id = ?", [id]);
    render(); 
  }
};

window.toggleStatus = (id, name, buyAmt) => {
  const inputVal = prompt(`'${name}' 채권의 만기(상환) 금액을 입력하세요.\n(미 입력시 매수금액과 동일)`, buyAmt);
  if (inputVal !== null) {
    const finalAmt = inputVal.trim() === '' ? buyAmt : Number(inputVal);
    runQuery("UPDATE bonds SET status = 'completed', redemptionAmount = ? WHERE id = ?", [finalAmt, id]);
    render();
  }
};

window.updateInterest = (id, y, m, v) => {
  // SQLite UPSERT: 있으면 업데이트, 없으면 삽입
  runQuery(`INSERT INTO interests (bond_id, year, month, amount) VALUES (?, ?, ?, ?) 
          ON CONFLICT(bond_id, year, month) DO UPDATE SET amount = ?`, [id, y, m, v, v]);
  render(); 
};

window.changeYear = (v) => { selectedYear = v; render(); };


// ====== [11] 채권 수정/삭제 모달 로직 ======
window.openEditModal = (id) => {
  if (!db) return;
  
  const stmt = db.prepare("SELECT * FROM bonds WHERE id = :id");
  stmt.bind({':id': id});
  if (stmt.step()) {
    const bond = stmt.getAsObject();
    
    // 수정 폼에 데이터 채우기
    const form = document.getElementById('edit-bond-form');
    if(form) {
        form.querySelector('[name=id]').value = bond.id;
        form.querySelector('[name=name]').value = bond.name;
        form.querySelector('[name=account]').value = bond.account;
        form.querySelector('[name=rate]').value = bond.rate;
        form.querySelector('[name=buyDate]').value = bond.buyDate;
        form.querySelector('[name=maturityDate]').value = bond.maturityDate;
        form.querySelector('[name=quantity]').value = bond.quantity || 0;
        form.querySelector('[name=buyAmount]').value = bond.buyAmount;
    }
    
    // 모달 내 삭제 버튼 이벤트 재정의
    const delBtn = document.getElementById('btn-delete-on-modal');
    if(delBtn) {
        delBtn.onclick = () => {
            if(confirm('정말 이 채권 데이터를 삭제하시겠습니까?\n(복구할 수 없습니다)')) {
                runQuery("DELETE FROM bonds WHERE id = ?", [bond.id]);
                runQuery("DELETE FROM interests WHERE bond_id = ?", [bond.id]);
                bootstrap.Modal.getInstance(document.getElementById('editBondModal')).hide();
                render();
            }
        };
    }

    // 모달 표시
    new bootstrap.Modal(document.getElementById('editBondModal')).show();
  }
  stmt.free();
};

const editForm = document.getElementById('edit-bond-form');
if(editForm) {
    editForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get('id');

      runQuery(`UPDATE bonds SET 
        name=?, account=?, rate=?, buyDate=?, maturityDate=?, quantity=?, buyAmount=?
        WHERE id=?`, 
        [
          fd.get('name'), 
          fd.get('account'), 
          fd.get('rate'), 
          fd.get('buyDate'), 
          fd.get('maturityDate'), 
          Number(fd.get('quantity')),
          Number(fd.get('buyAmount')),
          id
        ]);

      bootstrap.Modal.getInstance(document.getElementById('editBondModal')).hide();
      render();
    };
}
