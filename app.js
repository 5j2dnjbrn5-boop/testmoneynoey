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
  databaseURL: "https://exam-planer-pro-default-rtdb.asia-southeast1.firebasedatabase.app" 
};
let db = null;
let auth = null;
try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    auth = firebase.auth();
  }
} catch (e) {
  console.warn("Firebase Initialize Status:", e);
}

let store = loadStore();
let deletedTxBackup = null;
let currentCalDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let syncDebounceTimer = null;
let toastTimer = null;
let cloudReady = false;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(n) || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));


const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function pad2(n) { return String(n).padStart(2, "0"); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function pctOf(a, b) { return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0; }

// คงค่าที่เลือกไว้เมื่อสร้าง <option> ใหม่
function fillSelect(el, html) {
  if (!el) return;
  const prev = el.value;
  el.innerHTML = html;
  if (prev && [...el.options].some(o => o.value === prev)) el.value = prev;
}

// ตรวจและทำความสะอาดข้อมูล (ใช้ตอนโหลด / ดึงจาก Cloud / นำเข้าไฟล์)
function normalizeStore(s) {
  s = s && typeof s === "object" ? s : {};
  const arr = v => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);
  const sid = v => String(v ?? "").replace(/[^\w-]/g, "");
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
  const out = { version: 2, updatedAt: Number(s.updatedAt) || 0 };

  out.wallets = arr(s.wallets).filter(w => w && sid(w.id))
    .map(w => ({ id: sid(w.id), name: String(w.name || "บัญชี").slice(0, 40), type: String(w.type || "cash") }));
  if (!out.wallets.length) out.wallets = [
    { id: "w_cash", name: "💵 เงินสด", type: "cash" },
    { id: "w_bank", name: "🏦 ธนาคาร", type: "bank" },
    { id: "w_card", name: "💳 บัตรเครดิต", type: "credit" },
    { id: "w_ewallet", name: "📱 e-Wallet", type: "ewallet" }
  ];

  out.transactions = arr(s.transactions).filter(t => t && isDate(t.date) && Number(t.amount) > 0)
    .map(t => ({
      id: sid(t.id) || crypto.randomUUID(),
      type: t.type === "income" ? "income" : "expense",
      amount: Number(t.amount),
      title: String(t.title || "").slice(0, 80),
      category: String(t.category || "🎁 อื่น ๆ"),
      walletId: sid(t.walletId) || "w_cash",
      date: String(t.date),
      note: String(t.note || "").slice(0, 120),
      createdAt: Number(t.createdAt) || Date.now(),
      updatedAt: Number(t.updatedAt) || Date.now()
    }));

  out.budgets = arr(s.budgets).filter(b => b && sid(b.id) && Number(b.amount) > 0)
    .map(b => ({ id: sid(b.id), category: String(b.category || ""), amount: Number(b.amount) }));

  out.goals = arr(s.goals).filter(g => g && sid(g.id) && Number(g.targetAmount) > 0)
    .map(g => ({ id: sid(g.id), title: String(g.title || "").slice(0, 80), targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount) || 0, deadline: String(g.deadline || "") }));

  out.recurring = arr(s.recurring).filter(r => r && sid(r.id) && Number(r.amount) > 0)
    .map(r => ({ id: sid(r.id), title: String(r.title || "").slice(0, 80), amount: Number(r.amount),
      type: r.type === "income" ? "income" : "expense", category: String(r.category || "🎁 อื่น ๆ"),
      walletId: sid(r.walletId) || "w_bank",
      dayOfMonth: Math.min(31, Math.max(1, Number(r.dayOfMonth) || 1)),
      lastGeneratedMonth: String(r.lastGeneratedMonth || "") }));
  return out;
}

function mergeStores(a, b) {
  const byId = (x, y) => { const m = new Map(x.map(i => [i.id, i])); y.forEach(i => { if (!m.has(i.id)) m.set(i.id, i); }); return [...m.values()]; };
  return { ...a, wallets: byId(a.wallets, b.wallets), transactions: byId(a.transactions, b.transactions),
    budgets: byId(a.budgets, b.budgets), goals: byId(a.goals, b.goals), recurring: byId(a.recurring, b.recurring) };
}

// ==================== USER ID MANAGEMENT ====================
function setSyncStatus(text) {
  const el = $("syncStatusText");
  if (el) el.textContent = "สถานะ: " + text;
}
function authLabel() {
  const u = auth && auth.currentUser;
  if (!u) return "ยังไม่ได้ยืนยันตัวตน";
  return u.isAnonymous ? "ผู้ใช้ไม่ระบุตัวตน — ล็อกอิน Google เพื่อใช้ข้ามเครื่อง" : (u.email || "ล็อกอินแล้ว");
}

// ==================== DATA MIGRATION & STORAGE ====================
function loadStore() {
  const v1Raw = localStorage.getItem(KEY_V1);
  const v2Raw = localStorage.getItem(KEY_V2);

  if (v2Raw) {
    try { return normalizeStore(JSON.parse(v2Raw)); } catch (e) { console.error(e); }
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
    updatedAt: 0,
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
  processRecurring();
  store.updatedAt = Date.now();
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  setSyncStatus("🟡 มีการเปลี่ยนแปลง (รอซิงค์...)");
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(syncToCloud, 2000);
}

// ==================== FIREBASE CLOUD SYNC ====================
function syncToCloud() {
  if (!cloudReady) return Promise.resolve();
  return pushStore();
}

function pushStore() {
  const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
  if (!db || !uid) {
    setSyncStatus("🔴 ออฟไลน์ (บันทึกเฉพาะในเครื่อง)");
    return Promise.resolve();
  }
  setSyncStatus("🔄 กำลังส่งข้อมูลไปยัง Firebase...");
  return db.ref(`users/${uid}/store`).set(JSON.parse(JSON.stringify(store)))
    .then(() => setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`))
    .catch(err => {
      console.warn("Cloud Sync Error:", err);
      setSyncStatus(`🔴 ซิงค์ไม่สำเร็จ (${err.message})`);
    });
}

function applyCloudStore(cloud) {
  store = cloud;
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  renderAll();
}

// เปิดแอป: ล็อกอินแบบไม่ระบุตัวตน -> เทียบเวลา -> ใช้ข้อมูลที่ใหม่กว่า (ไม่เขียนทับมั่ว)
async function initialSync() {
  if (!db || !auth) { cloudReady = true; setSyncStatus("🔴 ออฟไลน์ (บันทึกเฉพาะในเครื่อง)"); return; }
  try {
    setSyncStatus("🔄 กำลังตรวจสอบข้อมูลบน Cloud...");
    if (!auth.currentUser) await auth.signInAnonymously();
    const snap = await db.ref(`users/${auth.currentUser.uid}/store`).once("value");
    const raw = snap.val();
    const cloud = raw ? normalizeStore(raw) : null;
    const localTime = store.updatedAt || 0;

    if (!cloud) {
      cloudReady = true;
      await pushStore();
    } else if (cloud.updatedAt > localTime) {
      if (store.transactions.length === 0 || confirm("พบข้อมูลบน Cloud ที่ใหม่กว่าในเครื่อง ต้องการใช้ข้อมูลจาก Cloud หรือไม่?")) {
        applyCloudStore(cloud);
        showToast("ดึงข้อมูลล่าสุดจาก Cloud แล้ว ✓");
        setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
      } else {
        cloudReady = true;
        await pushStore();
      }
    } else if (cloud.updatedAt < localTime) {
      cloudReady = true;
      await pushStore();
    } else {
      setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
    }
    cloudReady = true;
  } catch (err) {
    console.warn("Initial sync error:", err);
    setSyncStatus(`🔴 เชื่อมต่อ Cloud ไม่ได้ (${err.message})`);
  }
}

async function googleLogin() {
  if (!auth) { alert("ยังเชื่อมต่อ Firebase ไม่ได้"); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        await auth.currentUser.linkWithPopup(provider);
      } catch (e) {
        if (e.code === "auth/credential-already-in-use" && e.credential) await auth.signInWithCredential(e.credential);
        else throw e;
      }
    } else {
      await auth.signInWithPopup(provider);
    }
    cloudReady = false;
    await initialSync();
  } catch (err) {
    alert("ล็อกอินไม่สำเร็จ: " + err.message);
  }
}

function pullFromCloud() {
  const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
  if (!db || !uid) { alert("ยังเชื่อมต่อ Firebase ไม่ได้ในขณะนี้"); return; }
  db.ref(`users/${uid}/store`).once("value")
    .then(snapshot => {
      const raw = snapshot.val();
      if (!raw) { alert("ยังไม่มีข้อมูลบน Cloud"); return; }
      if (!confirm("พบข้อมูลบน Cloud ต้องการนำมาทับข้อมูลในเครื่องใช่หรือไม่?")) return;
      applyCloudStore(normalizeStore(raw));
      showToast("ดึงข้อมูลจาก Cloud สำเร็จ ✓");
    })
    .catch(err => alert("ดึงข้อมูลไม่สำเร็จ: " + err.message));
}

// ==================== RECURRING ENGINE ====================
function processRecurring() {
  const today = new Date();
  const mk = monthKey(today);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let added = false;
  store.recurring.forEach(rec => {
    const day = Math.min(Math.max(Number(rec.dayOfMonth) || 1, 1), lastDay);
    if (rec.lastGeneratedMonth !== mk && today.getDate() >= day) {
      store.transactions.push({
        id: crypto.randomUUID(),
        type: rec.type,
        amount: rec.amount,
        title: rec.title,
        category: rec.category,
        walletId: rec.walletId || "w_bank",
        date: `${mk}-${pad2(day)}`,
        note: "รายการประจำอัตโนมัติ",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      rec.lastGeneratedMonth = mk;
      added = true;
    }
  });
  return added;
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

window.addGoalAmount = function(id) {
  const g = store.goals.find(x => x.id === id);
  if (!g) return;
  const v = parseFloat(String(prompt(`เพิ่มเงินออมให้ "${g.title}" (บาท)`) || "").replace(/,/g, ""));
  if (!(v > 0)) return;
  g.currentAmount = Number(g.currentAmount) + v;
  saveStore();
  renderSettings();
  showToast("อัปเดตเป้าหมายแล้ว ✓");
};

function resetTxForm() {
  $("txForm").reset();
  $("txId").value = "";
  $("date").value = todayStr();
  $("formTxTitle").textContent = "➕ บันทึกรายการ";
  updateDropdowns();
}

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
  const t = text.trim().replace(/\s*บาท$/, "").split(/\s+/);
  if (t.length < 2) return null;
  const num = s => {
    s = s.replace(/^฿|บาท$/g, "").replace(/,/g, "");
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  };
  let amount = num(t[t.length - 1]);
  let title;
  if (!isNaN(amount)) title = t.slice(0, -1).join(" ");
  else { amount = num(t[0]); title = t.slice(1).join(" "); }
  if (isNaN(amount) || amount <= 0 || !title) return null;

  let type = "expense";
  let category = "🎁 อื่น ๆ";
  if (/เงินเดือน|โบนัส/.test(title)) { type = "income"; category = "💼 เงินเดือน"; }
  else if (/ปันผล|ดอกเบี้ย|ลงทุน/.test(title)) { type = "income"; category = "📈 ดอกเบี้ย / ปันผล / ลงทุน"; }
  else if (/ขาย|รายได้/.test(title)) { type = "income"; category = "🏷️ ขายของ / รายได้เสริม"; }
  else if (/ข้าว|อาหาร|กาแฟ|ชานม|ชาไข่มุก|ก๋วยเตี๋ยว|ชาบู|น้ำ|ขนม/.test(title)) category = "🍚 อาหาร";
  else if (/รถ|เดินทาง|น้ำมัน|แท็กซี่|BTS|MRT|Grab|วิน/i.test(title)) category = "🚗 เดินทาง";
  else if (/หนัง|เกม|Netflix|Spotify/i.test(title)) category = "🎬 ความบันเทิง";
  else if (/ค่าไฟ|ค่าน้ำ|เน็ต|อินเทอร์เน็ต|บิล|ค่าโทรศัพท์/.test(title)) category = "💳 บิล/อินเทอร์เน็ต";
  else if (/ยา|หมอ|โรงพยาบาล|คลินิก/.test(title)) category = "🏥 สุขภาพ/ยา";
  else if (/เสื้อ|กางเกง|รองเท้า|ช้อป/.test(title)) category = "🛍️ ช้อปปิ้ง";

  return {
    id: crypto.randomUUID(), type, amount, title, category,
    walletId: "w_cash", date: todayStr(), note: "Smart Quick Add",
    createdAt: Date.now(), updatedAt: Date.now()
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
  const recType = $("recType").value === "income" ? "income" : "expense";
  const opt = c => `<option value="${esc(c)}">${esc(c)}</option>`;
  const walletOpts = store.wallets.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("");

  fillSelect($("category"), CATEGORIES[type].map(opt).join(""));
  fillSelect($("walletSelect"), walletOpts);
  fillSelect($("recWallet"), walletOpts);
  fillSelect($("recCategory"), CATEGORIES[recType].map(opt).join(""));
  fillSelect($("budgetCategorySelect"), CATEGORIES.expense.map(opt).join(""));
  fillSelect($("filterCategory"), `<option value="all">ทุกหมวดหมู่</option>` + [...CATEGORIES.expense, ...CATEGORIES.income].map(opt).join(""));
  fillSelect($("filterWallet"), `<option value="all">ทุกบัญชีเงิน</option>` + walletOpts);
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
  const w = store.wallets.find(x => x.id === r.walletId);
  const id = esc(r.id);
  const kind = r.type === "income" ? "income" : "expense";
  return `<div class="transaction">
    <div class="tx-icon">${kind === "income" ? "🟢" : "🔴"}</div>
    <div class="tx-info">
      <div class="tx-title">${esc(r.title)}</div>
      <div class="tx-meta">${esc(r.category)} • ${esc(w ? w.name : "")} • ${esc(r.date)} ${r.note ? `(${esc(r.note)})` : ""}</div>
    </div>
    <div class="tx-amount ${kind}">${kind === "income" ? "+" : "−"}${money(r.amount)}</div>
    <div class="tx-actions">
      <button data-act="edit" data-id="${id}" class="icon-sm" title="แก้ไข" aria-label="แก้ไข">✏️</button>
      <button data-act="del" data-id="${id}" class="icon-sm delete" title="ลบ" aria-label="ลบ">🗑️</button>
    </div>
  </div>`;
}

window.delTx = function(id) {
  const idx = store.transactions.findIndex(r => r.id === id);
  if (idx === -1) return;
  deletedTxBackup = { item: store.transactions[idx], index: idx };
  store.transactions.splice(idx, 1);
  saveStore();
  renderAll();
  showToast("ลบรายการเรียบร้อย", true);
};

function showToast(msg, showUndo = false) {
  const t = $("toast");
  $("toastMsg").textContent = msg;
  $("undoBtn").classList.toggle("hidden", !showUndo);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), showUndo ? 6000 : 3000);
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
  const curYear = String(new Date().getFullYear());
  const years = [...new Set(store.transactions.map(r => r.date.slice(0, 4)))].sort((a, b) => b - a);
  if (!years.includes(curYear)) { years.push(curYear); years.sort((a, b) => b - a); }

  const yearSelect = $("historyYearSelect");
  const curSelected = yearSelect.value || curYear;
  yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === curSelected ? "selected" : ""}>${y}</option>`).join("");

  const selectedYear = yearSelect.value || curYear;
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
      <div class="month-name">${THAI_MONTHS[Number(m) - 1]} ${esc(selectedYear)}</div>
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
  $("calMonthTitle").textContent = `${currentCalDate.toLocaleString('th-TH', { month: 'long' })} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTx = store.transactions.filter(r => r.date === dateStr);
    const hasExp = dayTx.some(r => r.type === "expense");

    html += `<div class="cal-day ${hasExp ? 'has-exp' : ''}" data-act="day" data-id="${dateStr}">
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
  const cy = new Date().getFullYear();
  const set = new Set(store.transactions.map(r => r.date.slice(0, 4)));
  set.add(String(cy)); set.add(String(cy - 1));
  const years = [...set].sort();
  const a = $("analyticsYearSelect"), c = $("compareYearSelect");
  const keep = (el, def) => (years.includes(el.value) ? el.value : def);
  const v1 = keep(a, String(cy)), v2 = keep(c, String(cy - 1));
  const opts = years.map(y => `<option value="${y}">${y}</option>`).join("");
  a.innerHTML = opts; c.innerHTML = opts;
  a.value = v1; c.value = v2;

  const sum = (rows, type) => rows.filter(r => r.type === type).reduce((s, r) => s + r.amount, 0);
  const y1Tx = store.transactions.filter(r => r.date.startsWith(v1));
  const y2Tx = store.transactions.filter(r => r.date.startsWith(v2));
  const y1Exp = sum(y1Tx, "expense"), y2Exp = sum(y2Tx, "expense");
  const y1Inc = sum(y1Tx, "income"), y2Inc = sum(y2Tx, "income");
  const diff = y2Exp ? ((y1Exp - y2Exp) / y2Exp) * 100 : 0;

  $("comparisonReport").innerHTML = `
    <h3>${v2} VS ${v1}</h3>
    <p>ปี ${v1} ใช้จ่ายรวม <strong>${money(y1Exp)}</strong> (ปี ${v2} ใช้จ่าย <strong>${money(y2Exp)}</strong>)</p>
    <p>ปี ${v1} รายรับรวม <strong>${money(y1Inc)}</strong> (ปี ${v2} รายรับ <strong>${money(y2Inc)}</strong>)</p>
    <p>แนวโน้มค่าใช้จ่าย: <strong class="${diff > 0 ? 'exp' : 'inc'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</strong> จากปีเปรียบเทียบ</p>
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

    const pct = pctOf(spent, b.amount);
    return `<div class="budget-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div class="budget-head" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${esc(b.category)}</span>
        <div>
          <strong>${money(spent)} / ${money(b.amount)} (${pct}%)</strong>
          <button data-act="del-budget" data-id="${esc(b.id)}" class="icon-sm delete" style="margin-left:8px;" title="ลบงบ">🗑️</button>
        </div>
      </div>
      <div class="progress-bar"><div class="fill ${pct >= 100 ? 'danger' : ''}" style="width:${pct}%"></div></div>
      ${pct >= 100 ? '<small style="color:var(--red);">⚠️ คุณใช้จ่ายเกินงบหมวดนี้แล้ว</small>' : ''}
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีการตั้งงบประมาณ</p>`;

  if (!store.goals) store.goals = [];
  $("goalsList").innerHTML = store.goals.map(g => {
    const pct = pctOf(g.currentAmount, g.targetAmount);
    return `<div class="goal-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4>🎯 ${esc(g.title)}</h4>
        <button data-act="del-goal" data-id="${esc(g.id)}" class="icon-sm delete" title="ลบเป้าหมาย">🗑️</button>
      </div>
      <p>${money(g.currentAmount)} / ${money(g.targetAmount)} (${pct}%)</p>
      <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <small>กำหนดเดดไลน์: ${esc(g.deadline)}</small> <button data-act="goal-add" data-id="${esc(g.id)}" class="icon-sm" style="margin-left:8px;">＋ เพิ่มเงินออม</button>
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีเป้าหมายการเงิน</p>`;

  if (!store.recurring) store.recurring = [];
  $("recurringList").innerHTML = store.recurring.map(r => `
    <div class="rec-card" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid var(--line); border-radius:10px; margin-bottom:8px;">
      <div>
        <strong>${esc(r.title)}</strong> (${money(r.amount)})
        <div><small class="muted">จ่ายทุกวันที่ ${r.dayOfMonth} ของเดือน • ${esc(r.category)}</small></div>
      </div>
      <button data-act="del-rec" data-id="${esc(r.id)}" class="icon-sm delete" title="ลบรายการประจำ">🗑️ ลบ</button>
    </div>
  `).join("") || `<p class="muted">ยังไม่มีรายการประจำ</p>`;
}

// ==================== EVENT BINDINGS ====================
document.addEventListener("DOMContentLoaded", () => {
  if ($("date")) $("date").value = todayStr();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "add") resetTxForm();
      switchTab(btn.dataset.tab);
    });
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
      if (idx !== -1) store.transactions[idx] = { ...payload, createdAt: store.transactions[idx].createdAt };
    } else {
      store.transactions.push(payload);
    }

    saveStore();
    e.target.reset();
    $("txId").value = "";
    if ($("date")) $("date").value = todayStr();
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
      walletId: $("recWallet").value,
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
    if (cloudReady) pushStore().then(() => showToast("ส่งข้อมูลขึ้น Cloud แล้ว ✓"));
    else initialSync();
  });
  $("pullCloudBtn").addEventListener("click", () => pullFromCloud());
  $("googleLoginBtn").addEventListener("click", googleLogin);
  $("recType").addEventListener("change", updateDropdowns);

  // ปุ่มในรายการ (แทน onclick inline)
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const actions = { edit: editTx, del: delTx, day: selectCalDay, "del-budget": delBudget, "del-goal": delGoal, "del-rec": delRecurring, "goal-add": addGoalAmount };
    const fn = actions[el.dataset.act];
    if (fn) fn(el.dataset.id);
  });

  // Backup & Restore
  $("exportJsonBtn").addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `moneysync-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  $("exportCsvBtn").addEventListener("click", () => {
    const cell = v => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const wName = id => (store.wallets.find(w => w.id === id) || {}).name || "";
    const rows = [["ID", "Type", "Amount", "Title", "Category", "Wallet", "Date", "Note"]];
    store.transactions.forEach(r => rows.push([r.id, r.type, r.amount, r.title, r.category, wName(r.walletId), r.date, r.note || ""]));
    const csv = "\uFEFF" + rows.map(row => row.map((v, i) => (i === 2 ? v : cell(v))).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moneysync-transactions-${todayStr()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
            store = mergeStores(store, normalizeStore(imported));
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
  const prefersDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  if (savedTheme === "dark" || (!savedTheme && prefersDark)) document.body.classList.add("dark");
  $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀️" : "☾";

  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    $("themeBtn").textContent = isDark ? "☀️" : "☾";
  });

  if (processRecurring()) saveStore();
  renderAll();
  initialSync();
});
