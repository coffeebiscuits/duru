// ====== [0] 전역 변수 및 설정 ======
let db = null;
let SQL = null;
let fileHandle = null;
let activeTab = 'dashboard';
let selectedYear = new Date().getFullYear();
let currentChart = null;
let listFilter = 'all'; 

const formatKRW = (v) => new Intl.NumberFormat('ko-KR').format(v) + '원';

window.onload = async () => {
  const config = { locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}` };
  try {
    if (typeof initSqlJs === 'undefined') throw new Error("SQL.js 로드 실패");
    SQL = await initSqlJs(config);
    console.log("✅ SQL.js 로드 성공");
  } catch (err) {
    alert("❌ 필수 라이브러리(SQL.js) 로드 실패.\n인터넷 연결을 확인하세요.");
    return;
  }

  const entryModal = document.getElementById('entryModal');
  if (entryModal && typeof bootstrap !== 'undefined') new bootstrap.Modal(entryModal).show();

  setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = new Date().toTimeString().split(' ')[0];
  }, 1000);

  bindAllEvents();
};

window.setListFilter = (filter) => {
  listFilter = filter;
  render();
};


// ====== [2] 이벤트 리스너 통합 바인딩 ======
function bindAllEvents() {
  
  // (1) 새 파일 만들기
  const btnNew = document.getElementById('btn-new-db');
  if (btnNew) {
    btnNew.onclick = async () => {
      if (!confirm("새 DB 파일을 생성하시겠습니까?\n(생성 후 파일만 저장되며, 화면은 초기화됩니다)")) return;

      db = new SQL.Database();
      createTables();
      
      try {
        const data = db.export();
        let saved = false;

        // 저장 시도
        if (window.showSaveFilePicker) {
            try {
                const newHandle = await window.showSaveFilePicker({
                    suggestedName: 'my_bonds.db',
                    types: [{ description: 'SQLite DB', accept: { 'application/x-sqlite3': ['.db'] } }]
                });
                const writable = await newHandle.createWritable();
                await writable.write(data);
                await writable.close();
                saved = true;
            } catch(e) {
                // 취소 시 조용히 리턴
            }
        } else {
            const blob = new Blob([data], { type: 'application/x-sqlite3' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'my_bonds.db';
            a.click();
            saved = true;
        }

        // 저장 후 메모리 비우기 (초기화)
        db = null; 
        fileHandle = null;
        
        if(saved) {
            alert("✅ 새 파일이 저장되었습니다.\n작업을 시작하려면 [파일 열기] 버튼을 눌러주세요.");
            document.getElementById('db-filename').innerText = "파일 없음";
            render(); 
        }

      } catch (err) {
        alert('오류 발생: ' + err);
        db = null;
      }
    };
  }

  // (2) 파일 열기 (API 방식)
  const openAction = async () => {
    if (window.showOpenFilePicker) {
      try {
        [fileHandle] = await window.showOpenFilePicker({
          types: [{ description: 'SQLite DB', accept: { 'application/x-sqlite3': ['.db'] } }],
          multiple: false
        });
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        db = new SQL.Database(new Uint8Array(arrayBuffer));
        
        document.getElementById('db-filename').innerText = fileHandle.name + " (편집 모드)";
        closeModal('entryModal');
        render();
      } catch (err) {
        if (err.name !== 'AbortError') alert('파일 열기 실패: ' + err);
      }
    } else {
      document.getElementById('dbInput')?.click();
    }
  };

  const btnOpen = document.getElementById('btn-open-db');
  if (btnOpen) btnOpen.onclick = openAction;
  
  const headerBtnOpen = document.getElementById('header-btn-open');
  if (headerBtnOpen) headerBtnOpen.onclick = openAction;

  // (3) 저장 버튼 (헤더)
  const headerBtnSave = document.getElementById('header-btn-save');
  if (headerBtnSave) {
    headerBtnSave.onclick = () => saveCurrentDb(true);
  }

  // (4) Input 파일 열기 (Fallback -> 정상 루트)
  const dbInput = document.getElementById('dbInput');
  if (dbInput) {
    dbInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        db = new SQL.Database(new Uint8Array(reader.result));
        
        // Input으로 열면 브라우저가 핸들을 안 줌. 일단 null.
        // 하지만 저장 버튼 누르면 핸들을 딸 것임.
        fileHandle = null; 
        
        document.getElementById('db-filename').innerText = file.name;
        closeModal('entryModal');
        render();
        
        // ★ 경고창 삭제함. 그냥 조용히 열림.
      };
      reader.readAsArrayBuffer(file);
    };
  }

  // (5) 네비게이션
  const navMenu = document.getElementById('nav-menu');
  if (navMenu) {
    navMenu.onclick = (e) => {
      const target = e.target.closest('a');
      if (target && target.dataset.tab) {
        e.preventDefault();
        activeTab = target.dataset.tab;
        render();
      }
    };
  }
  
  const hamBtn = document.getElementById('hamBtn');
  if(hamBtn) {
    hamBtn.onclick = () => {
       const sb = document.getElementById('sidebar');
       if(sb) sb.style.display = sb.style.display === 'block' ? 'none' : 'block';
    };
  }

  // (6) 폼 처리
  const addForm = document.getElementById('add-bond-form');
  if(addForm) {
    addForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      runQuery(`INSERT INTO bonds (name, account, buyDate, maturityDate, rate, buyAmount, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [fd.get('name'), fd.get('account'), fd.get('buyDate'), fd.get('maturityDate'), fd.get('rate'), Number(fd.get('buyAmount')), Number(fd.get('quantity'))]);
      closeModal('addBondModal');
      e.target.reset();
      render();
    };
  }

  const editForm = document.getElementById('edit-bond-form');
  if(editForm) {
    editForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      runQuery(`UPDATE bonds SET name=?, account=?, rate=?, buyDate=?, maturityDate=?, quantity=?, buyAmount=? WHERE id=?`, 
        [fd.get('name'), fd.get('account'), fd.get('rate'), fd.get('buyDate'), fd.get('maturityDate'), Number(fd.get('quantity')), Number(fd.get('buyAmount')), fd.get('id')]);
      closeModal('editBondModal');
      render();
    };
  }
}

// ====== [3] ★ 수정된 저장 로직 (경고 없음, 자연스러운 연결) ======
async function saveCurrentDb(showMsg = true) {
  if (!db) {
    if (showMsg) alert("❌ 저장할 데이터가 없습니다.");
    return;
  }

  try {
    const data = db.export();

    // 1. 핸들이 없으면 (Input으로 열었거나 새 파일인 경우) -> 저장 위치 물어보고 핸들 획득
    if (!fileHandle) {
        if (window.showSaveFilePicker) {
            try {
                // ★ 경고 없이 바로 저장 창 띄움
                const newHandle = await window.showSaveFilePicker({
                    suggestedName: 'my_bonds.db',
                    types: [{ description: 'SQLite DB', accept: { 'application/x-sqlite3': ['.db'] } }]
                });
                
                // ★ 핵심: 사용자가 선택한 파일을 이제부터 '내 파일'로 기억함
                fileHandle = newHandle;
                
            } catch (e) {
                // 취소하면 저장 중단
                return;
            }
        }
    }

    // 2. 핸들이 있으면 (방금 얻었거나 원래 있었거나) -> 덮어쓰기
    if (fileHandle) {
      const options = { mode: 'readwrite' };
      // 권한 체크 (필요시 팝업)
      if ((await fileHandle.queryPermission(options)) !== 'granted') {
        const requestResult = await fileHandle.requestPermission(options);
        if (requestResult !== 'granted') throw new Error("권한이 없어 저장할 수 없습니다.");
      }

      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      
      // 파일명 UI 갱신
      document.getElementById('db-filename').innerText = fileHandle.name + " (저장됨)";
      
      if (showMsg) alert("✅ 저장되었습니다.");
    } 
    // 3. API 미지원 브라우저 (다운로드)
    else {
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my_bonds.db';
      a.click();
      if (showMsg) alert("✅ 다운로드 폴더에 저장되었습니다.");
    }

  } catch (err) {
    console.error(err);
    alert(`❌ 저장 실패: ${err.message}`);
  }
}

// ====== [4] 헬퍼 함수들 ======
function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el && typeof bootstrap !== 'undefined') {
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }
}

function runQuery(sql, params = []) {
  if (!db) return;
  db.run(sql, params);
  render();
}

function createTables() {
  if (!db) return;
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

function getBonds() {
  if (!db) return [];
  const stmt = db.prepare("SELECT * FROM bonds");
  const result = [];
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();

  return result.map(bond => {
    const iStmt = db.prepare("SELECT year, month, amount FROM interests WHERE bond_id = :id");
    iStmt.bind({ ':id': bond.id });
    const interests = {};
    while (iStmt.step()) {
      const row = iStmt.getAsObject();
      if (!interests[row.year]) interests[row.year] = {};
      interests[row.year][row.month] = row.amount;
    }
    iStmt.free();
    return { ...bond, interests };
  });
}

// ====== [5] 렌더링 로직 ======
function render() {
  const area = document.getElementById('render-area');
  if (!area) return; 

  if (!db) {
      area.innerHTML = '';
      return;
  }

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

// --- 대시보드 탭 ---
function renderDashboard(container, bonds) {
  const currentYear = new Date().getFullYear();
  const activeBonds = bonds.filter(b => b.status === 'active');
  const totalInv = activeBonds.reduce((a, c) => a + c.buyAmount, 0);

  // 올해 상환 예정 데이터 계산
  const scheduledBonds = activeBonds.filter(b => {
    return b.maturityDate && parseInt(b.maturityDate.substring(0, 4)) === currentYear;
  });
  const scheduledAmount = scheduledBonds.reduce((a, c) => a + c.buyAmount, 0);
  const scheduledCount = scheduledBonds.length;

  // 망가진 레이아웃을 정리하고 유령 코드(slice/map)를 완전히 제거함
  container.innerHTML = `
    <h3 class="mb-4 fw-bold">안녕하세요 <span class="fs-6 fw-normal text-secondary">채권 투자 현황입니다.</span></h3>
    
    <div class="row g-4 mb-4">
      <div class="col-md-4">
        <div class="stat-card h-100">
          <div class="stat-title">현재 총 투자 원금</div>
          <div class="stat-value" style="color:var(--accent-color);">${formatKRW(totalInv)}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card h-100">
          <div class="stat-title">보유 채권 상품 수</div>
          <div class="stat-value">${activeBonds.length} 개</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card h-100">
          <div class="stat-title">${currentYear}년 상환 예정 금액</div>
          <div class="stat-value">${formatKRW(scheduledAmount)}</div>
          <div class="small text-secondary mt-1" style="font-size: 0.85rem;">총 ${scheduledCount}건</div>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-12">
        <div class="content-box">
          <h5 class="fw-bold mb-4">자산 비중 (Top 5)</h5>
          <div style="height: 300px; position: relative;">
            <canvas id="dashChart"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvas = document.getElementById('dashChart');
  if (canvas && typeof Chart !== 'undefined') {
    const ctx = canvas.getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, { 
      type: 'bar', 
      data: { 
        labels: activeBonds.slice(0, 5).map(b => b.name), 
        datasets: [{ 
          label: '투자금액', 
          data: activeBonds.slice(0, 5).map(b => b.buyAmount), 
          backgroundColor: '#059669', 
          borderRadius: 6 
        }] 
      }, 
      options: { 
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, 
          x: { grid: { display: false } } 
        } 
      } 
    });
  }
}

function renderList(container, bonds) {
  const filteredBonds = bonds.filter(b => {
    if (listFilter === 'all') return true;
    if (listFilter === 'active') return b.status === 'active';
    if (listFilter === 'completed') return b.status === 'completed';
    return true;
  });

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="fw-bold">채권 관리</h3>
      <button class="btn btn-primary-custom rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#addBondModal">+ 채권 등록</button>
    </div>

    <div class="mb-4 d-flex gap-2">
      <button onclick="setListFilter('all')" class="btn ${listFilter === 'all' ? 'btn-dark' : 'btn-outline-secondary'} rounded-pill px-3 btn-sm">전체</button>
      <button onclick="setListFilter('active')" class="btn ${listFilter === 'active' ? 'btn-success' : 'btn-outline-secondary'} rounded-pill px-3 btn-sm">보유중</button>
      <button onclick="setListFilter('completed')" class="btn ${listFilter === 'completed' ? 'btn-primary' : 'btn-outline-secondary'} rounded-pill px-3 btn-sm">상환완료</button>
    </div>

    <div class="content-box mt-0">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>채권명</th>
              <th>계좌</th>
              <th>매수일</th>
              <th>만기일</th>
              <th>이율</th>
              <th>수량</th>
              <th>매수금액</th>
              <th>상태/전체손익</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
          ${filteredBonds.length === 0 ? `<tr><td colspan="9" class="text-center py-5 text-muted">${listFilter === 'all' ? '데이터가 없습니다.' : '해당 조건의 채권이 없습니다.'}</td></tr>` : 
            filteredBonds.slice().reverse().map(b => {
              // 1. 누적 이자 계산
              let totalInterest = 0;
              if (b.interests) {
                Object.values(b.interests).forEach(yearData => {
                  Object.values(yearData).forEach(amount => {
                    totalInterest += (Number(amount) || 0);
                  });
                });
              }

              // 2. 자본 차익 계산 (상환 완료 시에만 발생)
              let capitalGain = 0;
              if (b.status === 'completed') {
                capitalGain = (b.redemptionAmount || b.buyAmount) - b.buyAmount;
              }

              // 3. 전체 손익 계산
              const netProfit = totalInterest + capitalGain;

              // 4. UI 뱃지 및 텍스트 설정
              let statusBadge = b.status === 'completed' 
                ? `<span class="badge-soft status-done">완료</span>` 
                : `<span class="badge-soft status-wait">보유중</span>`;

              const profitClass = netProfit > 0 ? 'profit-plus' : (netProfit < 0 ? 'profit-minus' : 'text-secondary');
              const sign = netProfit > 0 ? '+' : '';

              const profitText = `
                <div class="${profitClass} fw-bold mt-1">${sign}${formatKRW(netProfit)}</div>
                <div class="text-muted" style="font-size: 0.7rem;">
                  (차익: ${formatKRW(capitalGain)}, 이자: ${formatKRW(totalInterest)})
                </div>
              `;
              
              return `<tr>
                  <td class="fw-bold text-primary text-decoration-underline" style="cursor:pointer;" onclick="openEditModal(${b.id})">${b.name}</td>
                  <td class="text-secondary small">${b.account}</td>
                  <td class="text-secondary small">${b.buyDate}</td>
                  <td class="text-secondary small">${b.maturityDate}</td>
                  <td style="color:var(--accent-color); font-weight:800;">${b.rate}%</td>
                  <td class="text-dark">${b.quantity ? Number(b.quantity).toLocaleString() : 0}</td>
                  <td class="fw-bold text-dark">${formatKRW(b.buyAmount)}</td>
                  <td>${statusBadge}${profitText}</td>
                  <td>
                      ${b.status === 'active' 
                        ? `<button onclick="toggleStatus(${b.id}, '${b.name}', ${b.buyAmount})" class="btn btn-sm btn-outline-success border-0 rounded-circle ms-1" title="만기 처리">✔️</button>` 
                        : `<button onclick="revertStatus(${b.id}, '${b.name}')" class="btn btn-sm btn-outline-warning border-0 rounded-circle ms-1" title="상태 되돌리기">🔄</button>`
                      }
                  </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


// ====== 연도 범위를 동적으로 가져오는 헬퍼 함수 ======
function getAvailableYears(bonds) {
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear, currentYear + 1]); // 기본적으로 올해와 내년은 포함

  bonds.forEach(b => {
    if (b.buyDate) years.add(parseInt(b.buyDate.substring(0, 4)));
    if (b.maturityDate && b.maturityDate !== '9999') {
        years.add(parseInt(b.maturityDate.substring(0, 4)));
    }
    // 이미 이자 기록이 있는 연도도 포함
    if (b.interests) {
      Object.keys(b.interests).forEach(y => years.add(parseInt(y)));
    }
  });

  // 숫자로 변환 후 오름차순 정렬 (유효하지 않은 연도는 필터링)
  return Array.from(years)
    .filter(y => y > 1900 && y < 2100) 
    .sort((a, b) => a - b);
}

function renderInterest(container, bonds) {
  const selYear = parseInt(selectedYear);
  const yearOptions = getAvailableYears(bonds); // 동적으로 연도 목록 가져오기

  container.innerHTML = `
    <h3 class="mb-4 fw-bold">이자 수취 관리</h3>
    <div class="content-box mt-0">
      <div class="mb-3">
        <select onchange="changeYear(this.value)" class="form-select w-auto fw-bold text-secondary border-0 bg-light">
          ${yearOptions.map(y => `
            <option value="${y}" ${selYear === y ? 'selected' : ''}>📅 ${y}년 데이터</option>
          `).join('')}
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
          ${bonds
            .filter(b => {
              if (!b.buyDate) return false;
              const buyYear = parseInt(b.buyDate.substring(0, 4));
              const maturityYear = b.maturityDate ? parseInt(b.maturityDate.substring(0, 4)) : 9999;
              return buyYear <= selYear && maturityYear >= selYear;
            })
            .map(b => {
              const yData = b.interests?.[selYear] || {};
              const rowTotal = Object.values(yData).reduce((a,v)=>a+(Number(v)||0), 0);
              return `
                <tr>
                  <td class="text-start fw-bold text-secondary">${b.name}</td>
                  <td class="fw-bold text-dark bg-light">${rowTotal.toLocaleString()}</td>
                  ${Array.from({length:12}, (_,i)=>`
                    <td style="min-width:80px;">
                      <input type="number" value="${yData[i+1]||''}" 
                        onchange="updateInterest(${b.id}, ${selYear}, ${i+1}, this.value)" 
                        class="input-interest">
                    </td>
                  `).join('')}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
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
  if (canvas && typeof Chart !== 'undefined') {
    const ctx = canvas.getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, { type: 'line', data: { labels: Array.from({length:12}, (_,i)=>`${i+1}월`), datasets: [{ label: '월별 수익', data: monthlyData, borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)', fill: true, tension: 0.4 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { color: '#f1f5f9' } } } } });
  }
}

// ====== [6] 인라인 이벤트용 함수 ======
window.deleteBond = (id) => {
  if (confirm('이 채권을 정말 삭제하시겠습니까?')) {
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
  runQuery(`INSERT INTO interests (bond_id, year, month, amount) VALUES (?, ?, ?, ?) ON CONFLICT(bond_id, year, month) DO UPDATE SET amount = ?`, [id, y, m, v, v]);
  render();
};

window.changeYear = (v) => { selectedYear = v; render(); };

// 모달 바인딩
window.openEditModal = (id) => {
  if (!db) return;
  const stmt = db.prepare("SELECT * FROM bonds WHERE id = :id");
  stmt.bind({ ':id': id });
  if (stmt.step()) {
    const bond = stmt.getAsObject();
    const form = document.getElementById('edit-bond-form');
    if (form) {
      form.querySelector('[name=id]').value = bond.id;
      form.querySelector('[name=name]').value = bond.name;
      form.querySelector('[name=account]').value = bond.account;
      form.querySelector('[name=rate]').value = bond.rate;
      form.querySelector('[name=buyDate]').value = bond.buyDate;
      form.querySelector('[name=maturityDate]').value = bond.maturityDate;
      form.querySelector('[name=quantity]').value = bond.quantity || 0;
      form.querySelector('[name=buyAmount]').value = bond.buyAmount;
    }

    const delBtn = document.getElementById('btn-delete-on-modal');
    if (delBtn) {
      delBtn.onclick = () => {
        if (confirm('정말 삭제하시겠습니까?')) {
          runQuery("DELETE FROM bonds WHERE id = ?", [bond.id]);
          runQuery("DELETE FROM interests WHERE bond_id = ?", [bond.id]);
          closeModal('editBondModal');
          render();
        }
      };
    }
    
    const editModal = document.getElementById('editBondModal');
    if(editModal && typeof bootstrap !== 'undefined') new bootstrap.Modal(editModal).show();
  }
  stmt.free();
};


window.revertStatus = (id, name) => {
  if (confirm(`'${name}' 채권을 다시 '보유중' 상태로 되돌리시겠습니까?`)) {
    // status를 active로, 상환금액을 0으로 초기화
    runQuery("UPDATE bonds SET status = 'active', redemptionAmount = 0 WHERE id = ?", [id]);
    render();
  }
};

