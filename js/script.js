// ====== [0] 전역 변수 및 설정 ======
let db = null;
let SQL = null;
let fileHandle = null; // ★ 파일 핸들 (저장 위치 기억)
let activeTab = 'dashboard';
let selectedYear = new Date().getFullYear();
let currentChart = null;

const formatKRW = (v) => new Intl.NumberFormat('ko-KR').format(v) + '원';

// ====== [1] 메인 실행 (페이지 로드 후 작동) ======
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

// ====== [2] 이벤트 리스너 통합 바인딩 ======
function bindAllEvents() {
  
  // (1) 새 파일 만들기 (생성 -> 저장 -> 초기화)
  const btnNew = document.getElementById('btn-new-db');
  if (btnNew) {
    btnNew.onclick = async () => {
      if (!confirm("새 DB 파일을 생성하시겠습니까?\n(생성 후 파일만 저장되며, 자동으로 열리지 않습니다)")) return;

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
                if (e.name !== 'AbortError') alert(e);
            }
        } else {
            const blob = new Blob([data], { type: 'application/x-sqlite3' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'my_bonds.db';
            a.click();
            saved = true;
        }

        // 저장 성공 여부와 관계없이, 새 파일 로직은 여기서 끝 (메모리 비움)
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

  // (2) 파일 열기 (API 방식 우선)
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

  // (3) 저장 버튼 (헤더) -> ★ 여기가 핵심 수정됨
  const headerBtnSave = document.getElementById('header-btn-save');
  if (headerBtnSave) {
    headerBtnSave.onclick = () => saveCurrentDb(true);
  }

  // (4) Input 파일 열기 (Fallback) -> ★ 이제 여기서도 나중에 저장 가능하게 처리
  const dbInput = document.getElementById('dbInput');
  if (dbInput) {
    dbInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        db = new SQL.Database(new Uint8Array(reader.result));
        
        // Input으로 열면 처음엔 핸들이 없음 (null)
        fileHandle = null; 
        
        document.getElementById('db-filename').innerText = file.name + " (편집 중 - 저장 시 위치 지정 필요)";
        closeModal('entryModal');
        render();
        
        // ★ 경고 메시지 삭제: "덮어쓰기 안됩니다"라고 말하지 않음. 저장 누르면 되게 할 거니까.
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

// ====== [3] ★ 스마트 저장 로직 (어떻게 열었든 덮어쓰기 되게 함) ======
async function saveCurrentDb(showMsg = true) {
  if (!db) {
    if (showMsg) alert("❌ 저장할 데이터가 없습니다.");
    return;
  }

  try {
    const data = db.export();

    // 1. 핸들이 없으면(파일 선택으로 연 경우) -> 핸들을 먼저 만든다!
    if (!fileHandle) {
        if (window.showSaveFilePicker) {
            // 사용자에게 "어떤 파일에 덮어쓸까요?" 물어봄 (최초 1회)
            if(showMsg) alert("⚠️ 현재 '파일 선택' 모드로 열려있습니다.\n저장할 파일(원본)을 선택해주시면, 앞으로 계속 덮어쓰기 됩니다.");
            
            try {
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'my_bonds.db',
                    types: [{ description: 'SQLite DB', accept: { 'application/x-sqlite3': ['.db'] } }]
                });
                // 핸들 획득 성공! 이제 아래 로직으로 흐름
            } catch (e) {
                // 취소하면 저장 안함
                return;
            }
        }
    }

    // 2. 핸들이 있으면 (또는 방금 만들었으면) -> 덮어쓰기 실행
    if (fileHandle) {
      const options = { mode: 'readwrite' };
      // 권한 체크
      if ((await fileHandle.queryPermission(options)) !== 'granted') {
        const requestResult = await fileHandle.requestPermission(options);
        if (requestResult !== 'granted') throw new Error("파일 쓰기 권한이 거부되었습니다.");
      }

      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      
      // 파일명 UI 갱신 (저장됨 표시)
      document.getElementById('db-filename').innerText = fileHandle.name + " (저장됨)";
      
      if (showMsg) alert("✅ [저장 완료] 파일에 안전하게 저장되었습니다.");
    } 
    // 3. API 미지원 브라우저 (최후의 수단)
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

// --- 탭별 서브 렌더러 ---
function renderDashboard(container, bonds) {
  const activeBonds = bonds.filter(b => b.status === 'active');
  const totalInv = activeBonds.reduce((a, c) => a + c.buyAmount, 0);
  let thisYearIncome = 0;
  bonds.forEach(b => {
    const yData = b.interests?.[new Date().getFullYear()];
    if (yData) Object.values(yData).forEach(v => thisYearIncome += v);
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
  if (canvas && typeof Chart !== 'undefined') {
    const ctx = canvas.getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, { type: 'bar', data: { labels: activeBonds.slice(0, 5).map(b => b.name), datasets: [{ label: '투자금액', data: activeBonds.slice(0, 5).map(b => b.buyAmount), backgroundColor: '#059669', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
  }
}

function renderList(container, bonds) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4"><h3 class="fw-bold">채권 관리</h3>
    <button class="btn btn-primary-custom rounded-pill px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#addBondModal">+ 채권 등록</button></div>
    <div class="content-box mt-0"><div class="table-responsive"><table class="table table-hover">
    <thead><tr><th>채권명</th><th>계좌</th><th>수량</th><th>매수금액</th><th>이율</th><th>만기일</th><th>상태/손익</th><th>관리</th></tr></thead>
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
            <td class="fw-bold text-primary text-decoration-underline" style="cursor:pointer;" onclick="openEditModal(${b.id})">${b.name}</td>
            <td class="text-secondary small">${b.account}</td>
            <td class="text-dark">${b.quantity ? Number(b.quantity).toLocaleString() : 0}</td>
            <td class="fw-bold text-dark">${formatKRW(b.buyAmount)}</td>
            <td style="color:var(--accent-color); font-weight:800;">${b.rate}%</td>
            <td class="text-secondary small">${b.maturityDate}</td>
            <td>${statusBadge}${profitText}</td>
            <td>${b.status==='active' ? `<button onclick="toggleStatus(${b.id}, '${b.name}', ${b.buyAmount})" class="btn btn-sm btn-outline-success border-0 rounded-circle ms-1">✔️</button>` : ''}</td>
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
