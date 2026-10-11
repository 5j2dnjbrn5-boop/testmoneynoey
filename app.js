const KEY_V1 = "moneysync.transactions.v1";
const KEY_V2 = "moneysync.os.v2";
const THEME_KEY = "moneysync.theme.v1";

const CATEGORIES = {
  expense: [
    '🍚 อาหาร', '🚗 เดินทาง', '🛒 ของใช้', 
    '🎬 ความบันเทิง', '📚 การเรียน', '💳 บิล/อินเทอร์เน็ต', 
    '🛍️ ช้อปปิ้ง', '🏥 สุขภาพ/ยา', '🎁 อื่น ๆ'
  ],
  income: [
    '💼 เงินเดือน', '📈 ดอกเบี้ย / ปันผล / ลงทุน', 
    '🏷️ ขายของ / รายได้เสริม', '💵 อื่น ๆ'
  ]
};

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDuFiIOd_K9P03FQcqhvGBOk5I1mHgIDkM",
  authDomain: "exam-planer-pro.firebaseapp.com",
  projectId: "exam-planer-pro",
  storageBucket: "exam-planer-pro.appspot.com",
  messagingSenderId: "350758125149",
  appId: "1:350758125149:web:539d4d90beb3e88c3497b4",
  measurementId: "G-BEKN1FH9GD",
  databaseURL: "https://exam-planer-pro-default-rtdb.firebaseio.com"
};

let db = null;
try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  }
} catch (e) {
  console.warn("Firebase Initialize Status:", e);
}

let store = loadStore();
let deletedTxBackup = null;
let currentCalDate = new Date(2026, 9, 1);
let syncDebounceTimer = null;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(n) || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

// ==================== USER ID MANAGEMENT ====================
function getOrInitUserId() {
  let uid = localStorage.getItem("moneysync.user.id");
  if (!uid) {
    uid = "user_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    localStorage.setItem("moneysync.user.id", uid);
  }
  return uid;
}

// ==================== DATA MIGRATION & STORAGE ====================
function loadStore() {
  const v1Raw = localStorage.getItem(KEY_V1);
  const v2Raw = localStorage.getItem(KEY_V2);

  if (v2Raw) {
    try { return JSON.parse(v2Raw); } catch (e) { console.error(e); }
  }

  // Safe Migration จาก Local Storage เดิม
  let legacyTx = [];
  if (v1Raw) {
    try {
      const parsed = JSON.parse(v1Raw);
      localStorage.setItem(`moneysync.backup.v1.${Date.now()}`, v1Raw);
      legacyTx = parsed.map(tx => ({
        id: tx.id || crypto.randomUUID(),
        type: tx.type || "expense",
        amount: Number(tx.amount) || 0,
        title: tx.title || "รายการเดิม",
        category: tx.category || "🎁 อื่น ๆ",
        walletId: "w_cash",
        date: tx.date || new Date().toISOString().slice(0, 10),
        note: tx.note || "",
        createdAt: tx.createdAt || Date.now(),
        updatedAt: tx.updatedAt || Date.now()
      }));
    } catch (e) { console.error("Migration Fail:", e); }
  }

  const initialStore = {
    version: 2,
    wallets: [
      { id: "w_cash", name: "💵 เงินสด", type: "cash" },
      { id: "w_bank", name: "🏦 ธนาคาร", type: "bank" },
      { id: "w_card", name: "💳 บัตรเครดิต", type: "credit" },
      { id: "w_ewallet", name: "📱 e-Wallet", type: "ewallet" }
    ],
    transactions: legacyTx,
    budgets: [
      { id: "b_1", category: "🍚 อาหาร", amount: 3000 }
    ],
    goals: [],
    recurring: []
  };

  localStorage.setItem(KEY_V2, JSON.stringify(initialStore));
  return initialStore;
}

// Save On Change + Debounce Cloud Sync (2 วิ)
function saveStore() {
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  processRecurring();

  const statusEl = $("syncStatusText");
  if (statusEl) statusEl.textContent = "สถานะ: 🟡 มีการเปลี่ยนแปลง (รอยืนยันซิงค์...)";

  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncToCloud();
  }, 2000);
}

// ==================== FIREBASE CLOUD SYNC ====================
function syncToCloud() {
  if (!db) {
    const statusEl = $("syncStatusText");
    if (statusEl) statusEl.textContent = "สถานะ: 🔴 ออฟไลน์ (บันทึกเฉพาะในเครื่อง)";
    return;
  }

  const statusEl = $("syncStatusText");
  if (statusEl) statusEl.textContent = "สถานะ: 🔄 กำลังส่งข้อมูลไปยัง Firebase...";

  const userId = getOrInitUserId();

  db.ref(`users/${userId}/store`).set(store)
    .then(() => {
      if (statusEl) statusEl.textContent = `สถานะ: 🟢 เชื่อมต่อ Cloud เรียบร้อย (ID: ${userId})`;
    })
    .catch(err => {
      console.warn("Cloud Sync Error:", err);
      if (statusEl) statusEl.textContent = `สถานะ: 🔴 บันทึกลง Cloud ไม่สำเร็จ (${err.message})`;
    });
}

function pullFromCloud() {
  if (!db) {
    alert("ไม่สามารถเชื่อมต่อ Firebase ได้ในขณะนี้");
    return;
  }

  const userId = getOrInitUserId();

  db.ref(`users/${userId}/store`).once("value")
    .then(snapshot => {
      const cloudData = snapshot.val();
      if (cloudData && cloudData.transactions) {
        if (confirm("พบข้อมูลบน Cloud ต้องการนำมาทับข้อมูลในเครื่องใช่หรือไม่?")) {
          store = cloudData;
          localStorage.setItem(KEY_V2, JSON.stringify(store));
          renderAll();
          showToast("ดึงข้อมูลจาก Cloud สำเร็จ ✓");
        }
      } else {
        alert("ยังไม่มีข้อมูลบน Cloud");
      }
    })
    .catch(err => alert("ดึงข้อมูลไม่สำเร็จ: " + err.message));
}

// ==================== RECURRING ENGINE ====================
function processRecurring() {
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let added = false;

  if (!store.recurring) store.recurring = [];

  store.recurring.forEach(rec => {
    if (rec.lastGeneratedMonth !== currentMonthKey && today.getDate() >= rec.dayOfMonth) {
      const txDate = `${currentMonthKey}-${String(rec.dayOfMonth).padStart(2, '0')}`;
      store.transactions.push({
        id: crypto.randomUUID(),
        type: rec.type,
        amount: rec.amount,
        title: rec.title,
        category: rec.category,
        walletId: rec.walletId || "w_bank",
        date: txDate,
        note: "รายการประจำอัตโนมัติ",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      rec.lastGeneratedMonth = currentMonthKey;
      added = true;
    }
  });

  if (added) localStorage.setItem(KEY_V2, JSON.stringify(store));
}

window.delRecurring = function(id) {
  const idx = store.recurring.findIndex(r => r.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบรายการประจำ "${store.recurring[idx].title}"?`)) return;

  store.recurring.splice(idx, 1);
  saveStore();
  renderSettings();
  showToast("ลบรายการประจำแล้ว ✓");
};

window.delBudget = function(id) {
  const idx = store.budgets.findIndex(b => b.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบงบประมาณหมวด "${store.budgets[idx].category}"?`)) return;

  store.budgets.splice(idx, 1);
  saveStore();
  renderSettings();
  showToast("ลบงบประมาณเรียบร้อย ✓");
};

window.delGoal = function(id) {
  const idx = store.goals.findIndex(g => g.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบเป้าหมาย "${store.goals[idx].title}"?`)) return;

  store.goals.splice(idx, 1);
  saveStore();
  renderSettings();
  showToast("ลบเป้าหมายแล้ว ✓");
};

// ==================== ROUTING & TABS ====================
function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  
  const targetTab = $(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add("active");
  
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add("active");

  const titles = {
    dashboard: "🏠 หน้าหลัก",
    add: "➕ บันทึกรายการ",
    history: "📚 ประวัติการเงิน",
    analytics: "📊 วิเคราะห์รายปี",
    settings: "⚙️ ตั้งค่าระบบ"
  };
  if ($("pageTitle")) $("pageTitle").textContent = titles[tabId] || "MoneySync";

  renderAll();
}

// ==================== SMART ADD ====================
function parseSmartAdd(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const lastPart = parts[parts.length - 1];
  const amount = parseFloat(lastPart);
  if (isNaN(amount)) return null;

  const title = parts.slice(0, parts.length - 1).join(" ");
  let type = "expense";
  let category = "🎁 อื่น ๆ";

  if (/เงินเดือน|รายได้|โบนัส|ขาย|ปันผล/.test(title)) {
    type = "income";
    category = "💼 เงินเดือน";
  } else if (/ข้าว|อาหาร|กาแฟ|ชา|ก๋วยเตี๋ยว|ชาบู/.test(title)) {
    category = "🍚 อาหาร";
  } else if (/รถ|เดินทาง|น้ำมัน|แท็กซี่|BTS|MRT|Grab/.test(title)) {
    category = "🚗 เดินทาง";
  }

  return {
    id: crypto.randomUUID(),
    type,
    amount,
    title,
    category,
    walletId: "w_cash",
    date: new Date().toISOString().slice(0, 10),
    note: "Smart Quick Add",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ==================== RENDERING LOGIC ====================
function renderAll() {
  updateDropdowns();
  renderDashboard();
  renderHistory();
  renderAnalytics();
  renderSettings();
}

function updateDropdowns() {
  const typeEl = document.querySelector('input[name="type"]:checked');
  const type = typeEl ? typeEl.value : "expense";

  $("category").innerHTML = CATEGORIES[type].map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("walletSelect").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
  
  const allCats = [...CATEGORIES.expense, ...CATEGORIES.income];
  $("filterCategory").innerHTML = `<option value="all">ทุกหมวดหมู่</option>` + allCats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("filterWallet").innerHTML = `<option value="all">ทุกบัญชีเงิน</option>` + store.wallets.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("");
  $("budgetCategorySelect").innerHTML = CATEGORIES.expense.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("recCategory").innerHTML = CATEGORIES.expense.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}

function renderDashboard() {
  const now = new Date();
  const thisMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const curTx = store.transactions.filter(r => r.date.slice(0, 7) === thisMK);
  const inc = curTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const exp = curTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  const totalInc = store.transactions.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const totalExp = store.transactions.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  $("totalBalance").textContent = money(totalInc - totalExp);
  $("incThisMonth").textContent = money(inc);
  $("expThisMonth").textContent = money(exp);

  $("walletList").innerHTML = store.wallets.map(w => {
    const wTx = store.transactions.filter(r => r.walletId === w.id);
    const wBal = wTx.reduce((acc, r) => acc + (r.type === "income" ? r.amount : -r.amount), 0);
    return `<div class="wallet-card">
      <div class="wallet-name">${esc(w.name)}</div>
      <div class="wallet-bal">${money(wBal)}</div>
    </div>`;
  }).join("");

  const days = now.getDate();
  const avgDaily = exp / (days || 1);
  const saveRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
  
  $("dashboardInsights").innerHTML = `
    <p>💡 ค่าใช้จ่ายเฉลี่ยต่อวันในเดือนนี้: <strong>${money(avgDaily)}</strong></p>
    <p>📊 อัตราการออมเงิน (Saving Rate): <strong>${saveRate}%</strong></p>
  `;

  const recent = [...store.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);
  $("recentTxList").innerHTML = recent.length ? recent.map(txHtml).join("") : `<p class="muted">ยังไม่มีรายการบันทึก</p>`;
}

function txHtml(r) {
  const walletObj = store.wallets.find(w => w.id === r.walletId);
  const wName = walletObj ? walletObj.name : "";
  return `<div class="transaction">
    <div class="tx-icon">${r.type === "income" ? "🟢" : "🔴"}</div>
    <div class="tx-info">
      <div class="tx-title">${esc(r.title)}</div>
      <div class="tx-meta">${esc(r.category)} • ${esc(wName)} • ${r.date} ${r.note ? `(${esc(r.note)})` : ''}</div>
    </div>
    <div class="tx-amount ${r.type}">${r.type === "income" ? "+" : "−"}${money(r.amount)}</div>
    <div class="tx-actions">
      <button onclick="editTx('${r.id}')" class="icon-sm" title="แก้ไข">✏️</button>
      <button onclick="delTx('${r.id}')" class="icon-sm delete" title="ลบ">🗑️</button>
    </div>
  </div>`;
}

window.delTx = function(id) {
  const idx = store.transactions.findIndex(r => r.id === id);
  if (idx === -1) return;
  const item = store.transactions[idx];

  if (!confirm(`ยืนยันการลบ "${item.title}" จำนวน ${money(item.amount)}?`)) return;

  deletedTxBackup = { item, index: idx };
  store.transactions.splice(idx, 1);
  saveStore();
  renderAll();

  showToast("ลบรายการเรียบร้อย", true);
};

function showToast(msg, showUndo = false) {
  const t = $("toast");
  $("toastMsg").textContent = msg;
  const undo = $("undoBtn");
  
  if (showUndo) undo.classList.remove("hidden");
  else undo.classList.add("hidden");

  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

window.editTx = function(id) {
  const item = store.transactions.find(r => r.id === id);
  if (!item) return;

  $("txId").value = item.id;
  $("title").value = item.title;
  $("amount").value = item.amount;
  $("date").value = item.date;
  $("note").value = item.note || "";
  $("walletSelect").value = item.walletId || "w_cash";

  const radio = document.querySelector(`input[name="type"][value="${item.type}"]`);
  if (radio) radio.checked = true;
  
  updateDropdowns();
  $("category").value = item.category;

  $("formTxTitle").textContent = "✏️ แก้ไขรายการ";
  switchTab("add");
};

// ==================== HISTORY ====================
function renderHistory() {
  const years = [...new Set(store.transactions.map(r => r.date.slice(0, 4)))].sort((a, b) => b - a);
  if (!years.includes("2026")) years.push("2026");

  const yearSelect = $("historyYearSelect");
  const curSelected = yearSelect.value || "2026";
  yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === curSelected ? "selected" : ""}>${y}</option>`).join("");

  const selectedYear = yearSelect.value || "2026";
  const yearTx = store.transactions.filter(r => r.date.startsWith(selectedYear));
  const yearInc = yearTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const yearExp = yearTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  $("annualOverviewCard").innerHTML = `
    <div class="annual-grid">
      <div><span>รายรับทั้งปี</span><strong class="inc">${money(yearInc)}</strong></div>
      <div><span>รายจ่ายทั้งปี</span><strong class="exp">${money(yearExp)}</strong></div>
      <div><span>เงินสุทธิ</span><strong>${money(yearInc - yearExp)}</strong></div>
    </div>
  `;

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  $("monthlyBreakdownList").innerHTML = months.map(m => {
    const mk = `${selectedYear}-${m}`;
    const mTx = store.transactions.filter(r => r.date.startsWith(mk));
    const mInc = mTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
    const mExp = mTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

    return `<div class="month-row">
      <div class="month-name">${mk}</div>
      <div class="month-stats">
        <span class="inc">+${money(mInc)}</span>
        <span class="exp">−${money(mExp)}</span>
        <strong>${money(mInc - mExp)}</strong>
      </div>
    </div>`;
  }).join("");

  renderFilteredTx();
  renderCalendar();
}

function renderFilteredTx() {
  const q = $("searchKeyword").value.trim().toLowerCase();
  const type = $("filterType").value;
  const cat = $("filterCategory").value;
  const wallet = $("filterWallet").value;
  const start = $("filterStartDate").value;
  const end = $("filterEndDate").value;

  const filtered = store.transactions.filter(r => {
    const matchSearch = [r.title, r.note, r.category].some(v => String(v || "").toLowerCase().includes(q));
    const matchType = type === "all" || r.type === type;
    const matchCat = cat === "all" || r.category === cat;
    const matchWallet = wallet === "all" || r.walletId === wallet;
    const matchStart = !start || r.date >= start;
    const matchEnd = !end || r.date <= end;

    return matchSearch && matchType && matchCat && matchWallet && matchStart && matchEnd;
  }).sort((a, b) => b.date.localeCompare(a.date));

  $("filteredTxList").innerHTML = filtered.length ? filtered.map(txHtml).join("") : `<p class="muted">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>`;
}

// ==================== CALENDAR ====================
function renderCalendar() {
  const y = currentCalDate.getFullYear();
  const m = currentCalDate.getMonth();
  $("calMonthTitle").textContent = `${currentCalDate.toLocaleString('en', { month: 'long' })} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTx = store.transactions.filter(r => r.date === dateStr);
    const hasExp = dayTx.some(r => r.type === "expense");

    html += `<div class="cal-day ${hasExp ? 'has-exp' : ''}" onclick="selectCalDay('${dateStr}')">
      <span>${d}</span>
      ${hasExp ? '<div class="dot"></div>' : ''}
    </div>`;
  }
  $("calGrid").innerHTML = html;
}

window.selectCalDay = function(dateStr) {
  const dayTx = store.transactions.filter(r => r.date === dateStr);
  const totalExp = dayTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);
  
  $("calSelectedDayTx").innerHTML = `
    <h4>📅 รายการวันที่ ${dateStr} (รายจ่ายรวม ${money(totalExp)})</h4>
    ${dayTx.length ? dayTx.map(txHtml).join("") : '<p class="muted">ไม่มีรายการในวันนี้</p>'}
  `;
};

// ==================== ANALYTICS ====================
function renderAnalytics() {
  const years = [...new Set(store.transactions.map(r => r.date.slice(0, 4)))].sort();
  if (!years.includes("2025")) years.push("2025");
  if (!years.includes("2026")) years.push("2026");

  $("analyticsYearSelect").innerHTML = years.map(y => `<option value="${y}" ${y === "2026" ? "selected" : ""}>${y}</option>`).join("");
  $("compareYearSelect").innerHTML = years.map(y => `<option value="${y}" ${y === "2025" ? "selected" : ""}>${y}</option>`).join("");

  const y1 = $("analyticsYearSelect").value;
  const y2 = $("compareYearSelect").value;

  const y1Tx = store.transactions.filter(r => r.date.startsWith(y1));
  const y2Tx = store.transactions.filter(r => r.date.startsWith(y2));

  const y1Exp = y1Tx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);
  const y2Exp = y2Tx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  const diffPct = y2Exp ? (((y1Exp - y2Exp) / y2Exp) * 100).toFixed(1) : 0;

  $("comparisonReport").innerHTML = `
    <h3>${y2} VS ${y1}</h3>
    <p>ปี ${y1} ใช้จ่ายรวม <strong>${money(y1Exp)}</strong> (ปี ${y2} ใช้จ่าย <strong>${money(y2Exp)}</strong>)</p>
    <p>แนวโน้มค่าใช้จ่าย: <strong class="${diffPct > 0 ? 'exp' : 'inc'}">${diffPct > 0 ? '+' : ''}${diffPct}%</strong> จากปีเปรียบเทียบ</p>
  `;
}

// ==================== SETTINGS (BUDGET, GOALS, RECURRING) ====================
function renderSettings() {
  const now = new Date();
  const thisMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (!store.budgets) store.budgets = [];
  $("budgetProgressList").innerHTML = store.budgets.map(b => {
    const spent = store.transactions
      .filter(r => r.date.startsWith(thisMK) && r.category === b.category && r.type === "expense")
      .reduce((acc, r) => acc + r.amount, 0);

    const pct = Math.min(100, Math.round((spent / b.amount) * 100));
    return `<div class="budget-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div class="budget-head" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${esc(b.category)}</span>
        <div>
          <strong>${money(spent)} / ${money(b.amount)} (${pct}%)</strong>
          <button onclick="delBudget('${b.id}')" class="icon-sm delete" style="margin-left:8px;" title="ลบงบ">🗑️</button>
        </div>
      </div>
      <div class="progress-bar"><div class="fill ${pct >= 100 ? 'danger' : ''}" style="width:${pct}%"></div></div>
      ${pct >= 100 ? '<small style="color:var(--red);">⚠️ คุณใช้จ่ายเกินงบหมวดนี้แล้ว</small>' : ''}
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีการตั้งงบประมาณ</p>`;

  if (!store.goals) store.goals = [];
  $("goalsList").innerHTML = store.goals.map(g => {
    const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
    return `<div class="goal-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4>🎯 ${esc(g.title)}</h4>
        <button onclick="delGoal('${g.id}')" class="icon-sm delete" title="ลบเป้าหมาย">🗑️</button>
      </div>
      <p>${money(g.currentAmount)} / ${money(g.targetAmount)} (${pct}%)</p>
      <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <small>กำหนดเดดไลน์: ${g.deadline}</small>
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีเป้าหมายการเงิน</p>`;

  if (!store.recurring) store.recurring = [];
  $("recurringList").innerHTML = store.recurring.map(r => `
    <div class="rec-card" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid var(--line); border-radius:10px; margin-bottom:8px;">
      <div>
        <strong>${esc(r.title)}</strong> (${money(r.amount)})
        <div><small class="muted">จ่ายทุกวันที่ ${r.dayOfMonth} ของเดือน • ${esc(r.category)}</small></div>
      </div>
      <button onclick="delRecurring('${r.id}')" class="icon-sm delete" title="ลบรายการประจำ">🗑️ ลบ</button>
    </div>
  `).join("") || `<p class="muted">ยังไม่มีรายการประจำ</p>`;
}

// ==================== EVENT BINDINGS ====================
document.addEventListener("DOMContentLoaded", () => {
  if ($("date")) $("date").valueAsDate = new Date();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("viewListBtn").addEventListener("click", () => {
    $("historyListView").classList.remove("hidden");
    $("historyCalView").classList.add("hidden");
    $("viewListBtn").classList.add("active-sub");
    $("viewCalBtn").classList.remove("active-sub");
  });

  $("viewCalBtn").addEventListener("click", () => {
    $("historyListView").classList.add("hidden");
    $("historyCalView").classList.remove("hidden");
    $("viewCalBtn").classList.add("active-sub");
    $("viewListBtn").classList.remove("active-sub");
  });

  $("prevCalMonth").addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
  });
  $("nextCalMonth").addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
  });

  $("smartAddBtn").addEventListener("click", () => {
    const parsed = parseSmartAdd($("smartInput").value);
    if (parsed) {
      store.transactions.push(parsed);
      saveStore();
      $("smartInput").value = "";
      showToast("บันทึกรายการด่วนสำเร็จ ✓");
      renderAll();
    } else {
      alert("กรุณากรอกรูปแบบ เช่น 'ข้าว 60' หรือ 'เงินเดือน 25000'");
    }
  });

  $("undoBtn").addEventListener("click", () => {
    if (deletedTxBackup) {
      store.transactions.splice(deletedTxBackup.index, 0, deletedTxBackup.item);
      deletedTxBackup = null;
      saveStore();
      renderAll();
      showToast("คืนค่ารายการเรียบร้อยแล้ว ✓");
    }
  });

  $("txForm").addEventListener("submit", e => {
    e.preventDefault();
    const txId = $("txId").value;
    const type = document.querySelector('input[name="type"]:checked').value;

    const payload = {
      id: txId || crypto.randomUUID(),
      type,
      amount: Number($("amount").value),
      title: $("title").value.trim(),
      category: $("category").value,
      walletId: $("walletSelect").value,
      date: $("date").value,
      note: $("note").value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (txId) {
      const idx = store.transactions.findIndex(r => r.id === txId);
      if (idx !== -1) store.transactions[idx] = payload;
    } else {
      store.transactions.push(payload);
    }

    saveStore();
    e.target.reset();
    $("txId").value = "";
    if ($("date")) $("date").valueAsDate = new Date();
    $("formTxTitle").textContent = "➕ บันทึกรายการ";

    showToast("บันทึกข้อมูลเรียบร้อย ✓");
    switchTab("dashboard");
  });

  $("budgetForm").addEventListener("submit", e => {
    e.preventDefault();
    const cat = $("budgetCategorySelect").value;
    const amt = Number($("budgetAmount").value);
    
    if (!store.budgets) store.budgets = [];
    const existing = store.budgets.find(b => b.category === cat);
    if (existing) existing.amount = amt;
    else store.budgets.push({ id: crypto.randomUUID(), category: cat, amount: amt });

    saveStore();
    renderSettings();
    showToast("ตั้งงบประมาณเรียบร้อย ✓");
  });

  $("goalForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!store.goals) store.goals = [];
    store.goals.push({
      id: crypto.randomUUID(),
      title: $("goalTitle").value.trim(),
      targetAmount: Number($("goalTarget").value),
      currentAmount: Number($("goalCurrent").value),
      deadline: $("goalDeadline").value
    });
    saveStore();
    e.target.reset();
    renderSettings();
    showToast("สร้างเป้าหมายเรียบร้อย ✓");
  });

  $("recurringForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!store.recurring) store.recurring = [];
    store.recurring.push({
      id: crypto.randomUUID(),
      title: $("recTitle").value.trim(),
      amount: Number($("recAmount").value),
      type: $("recType").value,
      category: $("recCategory").value,
      dayOfMonth: Number($("recDay").value),
      lastGeneratedMonth: ""
    });
    saveStore();
    e.target.reset();
    renderSettings();
    showToast("เพิ่มรายการประจำเรียบร้อย ✓");
  });

  document.querySelectorAll('input[name="type"]').forEach(r => {
    r.addEventListener("change", updateDropdowns);
  });

  ["searchKeyword", "filterType", "filterCategory", "filterWallet", "filterStartDate", "filterEndDate"].forEach(id => {
    if ($(id))$(id).addEventListener("input", renderFilteredTx);
  });
  $("historyYearSelect").addEventListener("change", renderHistory);
  $("analyticsYearSelect").addEventListener("change", renderAnalytics);
  $("compareYearSelect").addEventListener("change", renderAnalytics);

  // Sync Buttons
  $("syncNowBtn").addEventListener("click", () => {
    syncToCloud();
    showToast("ส่งข้อมูลขึ้น Cloud แล้ว ✓");
  });
  $("pullCloudBtn").addEventListener("click", pullFromCloud);

  // Backup & Restore
  $("exportJsonBtn").addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `moneysync-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  $("exportCsvBtn").addEventListener("click", () => {
    let csv = "ID,Type,Amount,Title,Category,Date,Note\n";
    store.transactions.forEach(r => {
      csv += `"${r.id}","${r.type}",${r.amount},"${r.title}","${r.category}","${r.date}","${r.note || ""}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moneysync-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  $("importJsonInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.transactions && Array.isArray(imported.transactions)) {
          if (confirm("ต้องการนำเข้าข้อมูล? ข้อมูลเดิมจะถูกรวมกับข้อมูลใหม่")) {
            store.transactions = [...store.transactions, ...imported.transactions];
            saveStore();
            renderAll();
            showToast("นำเข้าข้อมูลเรียบร้อย ✓");
          }
        } else {
          alert("ไฟล์ JSON ไม่ถูกต้องตามรูปแบบ");
        }
      } catch (err) { alert("อ่านไฟล์ไม่สำเร็จ"); }
    };
    reader.readAsText(file);
  });

  // Theme
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark") document.body.classList.add("dark");

  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    $("themeBtn").textContent = isDark ? "☀️ เปลี่ยนเป็นธีมสว่าง" : "☾ เปลี่ยนเป็นธีมมืด";
  });

  renderAll();
  setTimeout(syncToCloud, 1500); // ซิงค์ครั้งแรกอัตโนมัติเมื่อเปิดแอป
});