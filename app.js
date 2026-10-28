const KEY_V1 = "moneysync.transactions.v1";
const KEY_V2 = "moneysync.os.v2";
const THEME_KEY = "moneysync.theme.v1";

const CATEGORIES = {
  expense: [
    '🍚 อาหาร', '🚗 เดินทาง', '🛒 ของใช้', 
    '🎬 ความบันเทิง', '📚 การเรียน', '💳 บิล/อินเทอร์เน็ต', 
    '🛍️ ช้อปปิ้ง', '🏥 สุขภาพ/ยา',
    '📦 ซื้อสต็อกสินค้า', '🚚 ค่าขนส่ง/แพ็กของ', '🏪 ค่าตั้งร้าน/ค่าล็อค', '🎁 อื่น ๆ'
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
    db = firebase.firestore();
    auth = firebase.auth();
  }
} catch (e) {
  console.warn("Firebase Initialize Status:", e);
}

let store = loadStore();
store.products ||= []; store.debts ||= []; store.shopRules ||= normShopRules();
let deletedTxBackup = null;
let currentCalDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let toastTimer = null;
let cloudReady = false;
let unsubscribeTxList = null;
const OWNER_KEY = "moneysync_owner";
const LAST_SYNC_KEY = "moneysync_lastsync";
let unsubscribeSettings = null;
let settingsTimer = null;
let lastSettingsSig = null;
let viewMK = monthKey(new Date());   // เดือนที่กำลังดูในหน้าแรก

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(n) || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function pad2(n) { return String(n).padStart(2, "0"); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function pctOf(a, b) { return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0; }

function fillSelect(el, html) {
  if (!el) return;
  const prev = el.value;
  el.innerHTML = html;
  if (prev && [...el.options].some(o => o.value === prev)) el.value = prev;
}

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

  out.products = arr(s.products).filter(p => p && sid(p.id) && String(p.name || "").trim())
    .map(p => ({ id: sid(p.id), name: String(p.name).slice(0, 60), qty: Number(p.qty) || 0, cost: Math.max(0, Number(p.cost) || 0),
      price: Math.max(0, Number(p.price) || 0), min: Math.max(0, Number(p.min) || 0), updatedAt: Number(p.updatedAt) || Date.now() }));

  out.debts = arr(s.debts).filter(d => d && sid(d.id) && Number(d.amount) > 0)
    .map(d => ({ id: sid(d.id), who: String(d.who || "").slice(0, 60), amount: Number(d.amount), kind: d.kind === "payable" ? "payable" : "receivable",
      due: isDate(d.due) ? String(d.due) : "", note: String(d.note || "").slice(0, 120), paid: !!d.paid, updatedAt: Number(d.updatedAt) || Date.now() }));

  out.shopRules = normShopRules(s.shopRules);
  out.settingsAt = Number(s.settingsAt) || 0;
  return out;
}

function normShopRules(r) {
  const d = {
    sales: ["ขาย"],
    stock: ["สต็อก", "สต๊อก", "ลงของ", "ของเข้า", "ซื้อสินค้า", "ล็อตสินค้า"],
    ship: ["ค่าส่ง", "ขนส่ง", "แพ็ก", "พัสดุ"],
    setup: ["ตั้งร้าน", "จัดร้าน", "ค่าล็อค", "ค่าล็อก", "ค่าล้อค", "ค่าล๊อค", "ค่าเช่าร้าน", "ค่าเช่าที่"]
  };
  const out = {};
  Object.keys(d).forEach(k => {
    const src = r && Array.isArray(r[k]) ? r[k] : d[k];
    out[k] = [...new Set(src.map(x => String(x).replace(/\s+/g, "").toLowerCase()).filter(Boolean))].slice(0, 30);
  });
  return out;
}

function mergeStores(a, b) {
  const byId = (x, y) => { const m = new Map(x.map(i => [i.id, i])); y.forEach(i => { if (!m.has(i.id)) m.set(i.id, i); }); return [...m.values()]; };
  return { ...a, wallets: byId(a.wallets, b.wallets), transactions: byId(a.transactions, b.transactions),
    budgets: byId(a.budgets, b.budgets), goals: byId(a.goals, b.goals), recurring: byId(a.recurring, b.recurring),
    products: byId(a.products || [], b.products || []), debts: byId(a.debts || [], b.debts || []) };
}

// ==================== FIRESTORE SUB-COLLECTIONS ARCHITECTURE ====================
function setSyncStatus(text) {
  const el = $("syncStatusText");
  if (el) el.textContent = "สถานะ: " + text;
}
function cloudErr(err) {
  if (err && err.code === "permission-denied") return "Firestore Rules ไม่อนุญาต — ตรวจสอบ/Publish Rules ของ Cloud Firestore";
  if (err && err.code === "unavailable") return "ติดต่อ Firestore ไม่ได้ (ออฟไลน์?)";
  return (err && (err.code || err.message)) || "unknown";
}
function authLabel() {
  const u = auth && auth.currentUser;
  return u ? (u.email || u.displayName || "ล็อกอินแล้ว") : "ยังไม่ได้ล็อกอิน";
}

function userRef() {
  const u = auth && auth.currentUser;
  return db && u ? db.collection("users").doc(u.uid) : null;
}

function updateAccountUI() {
  const u = auth && auth.currentUser;
  const info = $("accountInfo");
  if (info) info.textContent = u ? `บัญชีที่ใช้ซิงค์: ${authLabel()}` : "ยังไม่ได้ล็อกอิน — ข้อมูลเก็บเฉพาะในเครื่องนี้";
  const li = $("googleLoginBtn"), lo = $("logoutBtn");
  if (li) li.classList.toggle("hidden", !!u);
  if (lo) lo.classList.toggle("hidden", !u);
}

function stopListening() {
  if (unsubscribeTxList) { unsubscribeTxList(); unsubscribeTxList = null; }
  if (unsubscribeSettings) { unsubscribeSettings(); unsubscribeSettings = null; }
}

// เขียนขึ้น Cloud ทีละไม่เกิน 400 รายการ (Firestore batch จำกัด 500)
async function uploadTxs(list) {
  const ref = userRef();
  if (!ref) return;
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    list.slice(i, i + 400).forEach(tx => batch.set(ref.collection("transactions").doc(tx.id), tx));
    await batch.commit();
  }
}

function settingsSig() {
  return JSON.stringify([store.shopRules, store.budgets, store.goals, store.recurring, store.debts, store.wallets]);
}

// นำการตั้งค่าจาก Cloud มาใช้ (เฉพาะฟิลด์ที่ Cloud มีจริง)
function applySettings(d) {
  const n = normalizeStore({ ...d, transactions: [] });
  ["shopRules", "budgets", "goals", "recurring", "debts", "wallets"].forEach(k => { if (d[k] !== undefined) store[k] = n[k]; });
  store.settingsAt = n.settingsAt;
  lastSettingsSig = settingsSig();
}

// ฟังการเปลี่ยนแปลงของ Sub-collection "transactions" แบบ Realtime
function startListeningSubCollections() {
  stopListening();
  const ref = userRef();
  if (!ref) return;

  unsubscribeTxList = ref.collection("transactions").onSnapshot(snapshot => {
    let changed = false;
    const changes = snapshot.docChanges();
    const upserts = normalizeStore({ transactions: changes.filter(c => c.type !== "removed").map(c => c.doc.data()) }).transactions;
    upserts.forEach(data => {
      const idx = store.transactions.findIndex(t => t.id === data.id);
      if (idx < 0) { store.transactions.push(data); changed = true; }
      else if (JSON.stringify(store.transactions[idx]) !== JSON.stringify(data)) { store.transactions[idx] = data; changed = true; }
    });
    changes.filter(c => c.type === "removed").forEach(c => {
      const before = store.transactions.length;
      store.transactions = store.transactions.filter(t => t.id !== c.doc.id);
      if (store.transactions.length !== before) changed = true;
    });
    if (changed) { localStorage.setItem(KEY_V2, JSON.stringify(store)); renderAll(); }
    setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
  }, err => console.warn("Listen error:", err));

  unsubscribeSettings = ref.onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites || !snap.exists) return;
    const d = snap.data();
    if ((d.settingsAt || 0) > (store.settingsAt || 0)) {
      applySettings(d);
      localStorage.setItem(KEY_V2, JSON.stringify(store));
      renderAll();
      showToast("อัปเดตการตั้งค่าจากอุปกรณ์อื่นแล้ว ✓");
    }
  }, err => console.warn("Settings listen error:", err));
}

// ==================== DATA MIGRATION & STORAGE ====================
function loadStore() {
  const v1Raw = localStorage.getItem(KEY_V1);
  const v2Raw = localStorage.getItem(KEY_V2);

  if (v2Raw) {
    try { return normalizeStore(JSON.parse(v2Raw)); } catch (e) { console.error(e); }
  }

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
    budgets: [{ id: "b_1", category: "🍚 อาหาร", amount: 3000 }],
    goals: [],
    recurring: []
  };

  localStorage.setItem(KEY_V2, JSON.stringify(initialStore));
  return initialStore;
}

function saveStoreLocalOnly() {
  processRecurring();
  store.updatedAt = Date.now();
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  // ถ้าการตั้งค่า (งบ/เป้าหมาย/รายการประจำ/ลูกหนี้/คำค้นหา) เปลี่ยน ให้ส่งขึ้น Cloud อัตโนมัติ
  const sig = settingsSig();
  if (lastSettingsSig !== null && sig !== lastSettingsSig) {
    lastSettingsSig = sig;
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(syncUserSettingsToCloud, 1200);
  }
}

// อัปเดตเฉพาะ Transaction รายเอกสารไปยัง Sub-collection
async function saveTxToCloud(tx) {
  const ref = userRef();
  if (!ref) return;
  try {
    await ref.collection("transactions").doc(tx.id).set(tx);
    setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
  } catch (err) {
    console.warn("Save Tx Error:", err);
    setSyncStatus(`🔴 ซิงค์ไม่สำเร็จ: ${cloudErr(err)}`);
  }
}

// ลบ Transaction ออกจาก Sub-collection
async function deleteTxFromCloud(txId) {
  const ref = userRef();
  if (!ref) return;
  try {
    await ref.collection("transactions").doc(txId).delete();
  } catch (err) {
    console.warn("Delete Tx Error:", err);
  }
}

// ซิงค์การตั้งค่าอื่นๆ (เช่น shopRules) ไว้ที่ Root User Document
async function syncUserSettingsToCloud() {
  const ref = userRef();
  if (!ref || !cloudReady) return;
  try {
    store.settingsAt = Date.now();
    localStorage.setItem(KEY_V2, JSON.stringify(store));
    await ref.set(JSON.parse(JSON.stringify({
      shopRules: store.shopRules, budgets: store.budgets, goals: store.goals, recurring: store.recurring,
      debts: store.debts, wallets: store.wallets, settingsAt: store.settingsAt, updatedAt: Date.now()
    })), { merge: true });
    setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
  } catch (e) {
    console.warn("Sync settings error:", e);
    setSyncStatus(`🔴 ซิงค์ไม่สำเร็จ: ${cloudErr(e)}`);
  }
}

async function initialSync() {
  const ref = userRef();
  if (!ref) {
    cloudReady = false;
    stopListening();
    setSyncStatus("🟡 ใช้ข้อมูลในเครื่อง (ล็อกอิน Google เพื่อซิงค์ข้ามเครื่อง)");
    return;
  }
  try {
    setSyncStatus("🔄 กำลังโหลดข้อมูลจาก Cloud...");
    const uid = auth.currentUser.uid;
    const owner = localStorage.getItem(OWNER_KEY);
    const lastSync = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
    if (owner && owner !== uid) store = normalizeStore({});   // ข้อมูลในเครื่องเป็นของบัญชีอื่น: ไม่เอามาปนกัน

    const [snap, userDoc] = await Promise.all([ref.collection("transactions").get(), ref.get()]);
    const cloudTxs = normalizeStore({ transactions: snap.docs.map(d => d.data()) }).transactions;

    // รวมรายการตาม id: ของที่เพิ่มในเครื่องตอนออฟไลน์/ยังไม่เคยซิงค์ -> อัปโหลด, ของที่ถูกลบบนเครื่องอื่น -> ตัดออก
    const cloudMap = new Map(cloudTxs.map(t => [t.id, t]));
    const merged = new Map(cloudMap);
    const toUpload = [];
    store.transactions.forEach(t => {
      const c = cloudMap.get(t.id);
      if (!c) {
        if (owner !== uid || (t.createdAt || 0) > lastSync) { merged.set(t.id, t); toUpload.push(t); }
      } else if ((t.updatedAt || 0) > (c.updatedAt || 0)) { merged.set(t.id, t); toUpload.push(t); }
    });
    store.transactions = [...merged.values()];

    cloudReady = true;
    const cloudSet = userDoc.exists ? userDoc.data() : null;
    let pushSettings = false;
    if (cloudSet && (cloudSet.settingsAt || 0) >= (store.settingsAt || 0)) applySettings(cloudSet);
    else pushSettings = true;

    await uploadTxs(toUpload);
    if (pushSettings) await syncUserSettingsToCloud();

    localStorage.setItem(OWNER_KEY, uid);
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    localStorage.setItem(KEY_V2, JSON.stringify(store));
    lastSettingsSig = settingsSig();
    if (processRecurring()) saveStoreLocalOnly();
    renderAll();
    setSyncStatus(`🟢 ซิงค์เรียบร้อย (${authLabel()})`);
    startListeningSubCollections();
  } catch (err) {
    console.warn("Initial sync error:", err);
    setSyncStatus(`🔴 เชื่อมต่อ Cloud ไม่ได้: ${cloudErr(err)}`);
  }
}

async function googleLogin() {
  if (!auth) { alert("ยังเชื่อมต่อ Firebase ไม่ได้"); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      return auth.signInWithRedirect(provider);
    }
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
    alert("ล็อกอินไม่สำเร็จ: " + (err.code || err.message));
  }
}

async function logout() {
  if (!auth || !auth.currentUser) return;
  if (!confirm("ออกจากระบบ? ข้อมูลในเครื่องนี้จะถูกล้าง (ข้อมูลยังอยู่บน Cloud ของบัญชีนี้)")) return;
  stopListening();
  cloudReady = false;
  await auth.signOut();
  store = normalizeStore({});
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  renderAll();
  updateAccountUI();
  setSyncStatus("🟡 ออกจากระบบแล้ว (ใช้ข้อมูลในเครื่อง)");
}

async function pullFromCloud() {
  if (!auth || !auth.currentUser) { alert("ต้องล็อกอินด้วย Google ก่อน"); return; }
  await initialSync();
  showToast("ดึงข้อมูลล่าสุดจาก Cloud สำเร็จ ✓");
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
      const newTx = {
        id: `rec_${rec.id}_${mk}`,
        type: rec.type,
        amount: rec.amount,
        title: rec.title,
        category: rec.category,
        walletId: rec.walletId || "w_bank",
        date: `${mk}-${pad2(day)}`,
        note: "รายการประจำอัตโนมัติ",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      if (!store.transactions.some(t => t.id === newTx.id)) { store.transactions.push(newTx); saveTxToCloud(newTx); }
      rec.lastGeneratedMonth = mk;
      added = true;
    }
  });
  if (added) syncUserSettingsToCloud();
  return added;
}

window.delRecurring = function(id) {
  const idx = store.recurring.findIndex(r => r.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบรายการประจำ "${store.recurring[idx].title}"?`)) return;

  store.recurring.splice(idx, 1);
  saveStoreLocalOnly();
  syncUserSettingsToCloud();
  renderSettings();
  showToast("ลบรายการประจำแล้ว ✓");
};

window.delBudget = function(id) {
  const idx = store.budgets.findIndex(b => b.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบงบประมาณหมวด "${store.budgets[idx].category}"?`)) return;

  store.budgets.splice(idx, 1);
  saveStoreLocalOnly();
  syncUserSettingsToCloud();
  renderSettings();
  showToast("ลบงบประมาณเรียบร้อย ✓");
};

window.delGoal = function(id) {
  const idx = store.goals.findIndex(g => g.id === id);
  if (idx === -1) return;
  if (!confirm(`ยืนยันการลบเป้าหมาย "${store.goals[idx].title}"?`)) return;

  store.goals.splice(idx, 1);
  saveStoreLocalOnly();
  syncUserSettingsToCloud();
  renderSettings();
  showToast("ลบเป้าหมายแล้ว ✓");
};

window.addGoalAmount = function(id) {
  const g = store.goals.find(x => x.id === id);
  if (!g) return;
  const v = parseFloat(String(prompt(`เพิ่มเงินออมให้ "${g.title}" (บาท)`) || "").replace(/,/g, ""));
  if (!(v > 0)) return;
  g.currentAmount = Number(g.currentAmount) + v;
  saveStoreLocalOnly();
  syncUserSettingsToCloud();
  renderSettings();
  showToast("อัปเดตเป้าหมายแล้ว ✓");
};

function resetTxForm() {
  $("txForm").reset();
  $("txId").value = "";
  $("date").value = todayStr();
  $("formTxTitle").textContent = "เพิ่มรายการ";
  updateDropdowns();
}

// ==================== ROUTING & TABS ====================
// ==================== BOTTOM SHEET (เพิ่ม/แก้ไขรายการ) ====================
function openAddSheet() {
  updateDropdowns();
  $("txDeleteBtn").classList.toggle("hidden", !$("txId").value);
  $("tab-add").classList.add("sheet-open");
  $("sheetBackdrop").classList.add("show");
  document.body.classList.add("no-scroll");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("sheet-on", el.dataset.tab === "add"));
}
function closeAddSheet() {
  const s = $("tab-add"), b = $("sheetBackdrop");
  if (s) s.classList.remove("sheet-open");
  if (b) b.classList.remove("show");
  document.body.classList.remove("no-scroll");
}

function monthShift(mk, d) { const [y, m] = mk.split("-").map(Number); return monthKey(new Date(y, m - 1 + d, 1)); }
function splitCat(c) { const m = String(c).match(/^([^\p{L}\p{N}]+)\s*(.*)$/u); return m ? [m[1].trim(), m[2]] : ["•", String(c)]; }
function relDay(ds) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (ds === todayStr()) return "วันนี้";
  if (ds === `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`) return "เมื่อวาน";
  const [, mm, dd] = ds.split("-").map(Number);
  return `${dd} ${TH_MON_SHORT[mm - 1]}`;
}
function goHistory(o = {}) {
  switchTab("history");
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set("searchKeyword", ""); set("filterType", o.type || "all"); set("filterCategory", o.category || "all"); set("filterWallet", o.wallet || "all");
  const [y, m] = viewMK.split("-").map(Number);
  set("filterStartDate", o.month ? `${viewMK}-01` : ""); set("filterEndDate", o.month ? `${viewMK}-${pad2(new Date(y, m, 0).getDate())}` : "");
  renderFilteredTx();
  window.scrollTo(0, 0);
}

function switchTab(tabId) {
  if (tabId === "add") { openAddSheet(); return; }
  closeAddSheet();
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  
  const targetTab = $(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add("active");
  
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add("active");

  const titles = { dashboard: "MoneySync", add: "เพิ่มรายการ", history: "ประวัติ", analytics: "วิเคราะห์", settings: "ตั้งค่า" };
  if ($("pageTitle")) $("pageTitle").textContent = titles[tabId] || "MoneySync";

  renderAll();
}

// ==================== SHOP ANALYSIS & DEBTS ====================
function toggleDebt(id) {
  const d = store.debts.find(x => x.id === id);
  if (!d) return;
  d.paid = !d.paid; d.updatedAt = Date.now();
  saveStoreLocalOnly(); renderAll();
}
function delDebt(id) {
  if (!confirm("ลบรายการนี้?")) return;
  store.debts = store.debts.filter(d => d.id !== id);
  saveStoreLocalOnly(); renderAll();
}

const SALES_CAT = CATEGORIES.income.find(c => c.includes("ขายของ"));
const STOCK_CAT = CATEGORIES.expense.find(c => c.includes("สต็อก"));
const SHIP_CAT = CATEGORIES.expense.find(c => c.includes("ขนส่ง"));
const SETUP_CAT = CATEGORIES.expense.find(c => c.includes("ตั้งร้าน"));
const TH_MON_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function shopKind(r, rules) {
  const t = r.title.replace(/\s+/g, "").toLowerCase();
  const has = list => list.some(k => t.includes(k));
  if (r.type === "income") return (r.category === SALES_CAT || has(rules.sales)) ? "sales" : null;
  if (r.category === STOCK_CAT) return "stock";
  if (r.category === SHIP_CAT) return "ship";
  if (r.category === SETUP_CAT) return "setup";
  if (has(rules.ship)) return "ship";
  if (has(rules.setup)) return "setup";
  if (has(rules.stock)) return "stock";
  return null;
}

function shopStats(prefix) {
  const g = { sales: [], stock: [], ship: [], setup: [] };
  const rules = store.shopRules || normShopRules();
  store.transactions.forEach(r => {
    if (!r.date.startsWith(prefix)) return;
    const k = shopKind(r, rules);
    if (k) g[k].push(r);
  });
  const sum = a => a.reduce((s, r) => s + r.amount, 0);
  const S = sum(g.sales), C = sum(g.stock), F = sum(g.ship), T = sum(g.setup);
  return { ...g, S, C, F, T, gross: S - C, net: S - C - F - T, orders: g.sales.length };
}

function fillRuleInputs() {
  const r = store.shopRules;
  [["ruleSales", "sales"], ["ruleStock", "stock"], ["ruleSetup", "setup"], ["ruleShip", "ship"]].forEach(([id, k]) => { $(id).value = r[k].join(", "); });
}

function topBy(rows, n = 5) {
  const m = new Map();
  rows.forEach(r => {
    const k = r.title.trim().toLowerCase();
    const o = m.get(k) || { name: r.title.trim(), amount: 0, count: 0 };
    o.amount += r.amount; o.count++; m.set(k, o);
  });
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n);
}

function renderShopAnalysis() {
  const cy = new Date().getFullYear();
  const yrs = new Set(store.transactions.map(r => r.date.slice(0, 4))); yrs.add(String(cy));
  const yEl = $("shopYear"), mEl = $("shopMonth");
  const firstY = !yEl.options.length, firstM = !mEl.options.length;
  fillSelect(yEl, [...yrs].sort().map(y => `<option value="${y}">${y}</option>`).join(""));
  fillSelect(mEl, `<option value="0">ทั้งปี</option>` + THAI_MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join(""));
  if (firstY) yEl.value = String(cy);
  if (firstM) mEl.value = String(new Date().getMonth() + 1);
  const year = Number(yEl.value) || cy, month = Number(mEl.value) || 0;

  const prefix = month ? `${year}-${pad2(month)}` : String(year);
  const prevPrefix = month ? (month === 1 ? `${year - 1}-12` : `${year}-${pad2(month - 1)}`) : String(year - 1);
  const prevLabel = month ? "เดือนก่อน" : "ปีก่อน";
  const cur = shopStats(prefix), prev = shopStats(prevPrefix);

  const chg = (c, p, goodUp = true) => {
    if (!p) return c ? '<small class="kpi-delta muted">ใหม่</small>' : "";
    const pc = ((c - p) / Math.abs(p)) * 100;
    return `<small class="kpi-delta ${(goodUp ? pc >= 0 : pc <= 0) ? "inc" : "exp"}">${pc >= 0 ? "▲" : "▼"} ${Math.abs(pc).toFixed(0)}% vs ${prevLabel}</small>`;
  };
  const margin = cur.S > 0 ? (cur.gross / cur.S) * 100 : 0;
  const avg = cur.orders ? cur.S / cur.orders : 0;
  const card = (label, val, extra = "", cls = "") => `<div class="card ${cls}"><span>${label}</span><strong>${val}</strong>${extra}</div>`;
  const when = month ? `${THAI_MONTHS[month - 1]} ${year}` : `ปี ${year}`;
  $("shopKpis").innerHTML =
    `<div class="kpi-hero ${cur.net >= 0 ? "pos" : "neg"}"><span>กำไรสุทธิ · ${when}</span><strong>${money(cur.net)}</strong>${chg(cur.net, prev.net)}</div>` +
    card("ยอดขาย", money(cur.S), chg(cur.S, prev.S), "income") +
    card("ต้นทุนสินค้า (ซื้อสต็อก/ลงของ)", money(cur.C), chg(cur.C, prev.C, false), "expense") +
    card("กำไรขั้นต้น", money(cur.gross), chg(cur.gross, prev.gross)) +
    card("อัตรากำไรขั้นต้น", cur.S > 0 ? margin.toFixed(1) + "%" : "–") +
    card("ค่าตั้งร้าน/ค่าล็อค", money(cur.T), chg(cur.T, prev.T, false), "expense") +
    card("ค่าขนส่ง/แพ็กของ", money(cur.F), chg(cur.F, prev.F, false), "expense") +
    card("บิลขาย", `${cur.orders} บิล`, cur.orders ? `<small class="kpi-delta muted">เฉลี่ย ${money(avg)}/บิล</small>` : "", "wide") +
    `<p class="muted-sm kpi-caption">จับรายการได้: ขาย ${cur.sales.length} · ซื้อสต็อก ${cur.stock.length} · ค่าตั้งร้าน ${cur.setup.length} · ค่าส่ง ${cur.ship.length} รายการ (ดูจากหมวดหมู่หรือคำในชื่อรายการ)</p>`;

  const tips = [];
  if (cur.S > 0 && cur.C > 0) tips.push(`ทุก ฿1 ที่ซื้อสต็อก ขายได้ ฿${(cur.S / cur.C).toFixed(2)}`);
  if (cur.C > cur.S && cur.C > 0) tips.push(`⚠️ ซื้อสต็อกมากกว่ายอดขาย ${money(cur.C - cur.S)} (อาจเป็นการเตรียมของ หรือของยังขายไม่ออก)`);
  if (cur.T > 0 && cur.S > 0) tips.push(`ค่าตั้งร้าน/ค่าล็อครวม ${money(cur.T)} (${((cur.T / cur.S) * 100).toFixed(1)}% ของยอดขาย)`);
  if (cur.net < 0) tips.push(`⚠️ ช่วงนี้ขาดทุนสุทธิ ${money(-cur.net)}`);
  else if (cur.S > 0) tips.push(`✅ กำไรสุทธิ ${money(cur.net)} (${((cur.net / cur.S) * 100).toFixed(1)}% ของยอดขาย)`);
  $("shopInsight").innerHTML = tips.length ? tips.map(t => `<p>${esc(t)}</p>`).join("") : '<p class="muted">ยังไม่มีรายการขาย/ซื้อสต็อกในช่วงนี้ — บันทึกรายรับหมวด "ขายของ" และรายจ่ายหมวด "ซื้อสต็อกสินค้า"</p>';

  const mon = Array.from({ length: 12 }, (_, i) => shopStats(`${year}-${pad2(i + 1)}`));
  const mx = Math.max(...mon.flatMap(x => [x.S, x.C]));
  if (!mx) $("shopChart").innerHTML = '<p class="muted">ยังไม่มีข้อมูลในปีนี้</p>';
  else {
    const gw = 464 / 12, base = 160, mh = 140;
    const bars = mon.map((x, i) => {
      const gx = 8 + i * gw, hs = (x.S / mx) * mh, hc = (x.C / mx) * mh;
      return `${month === i + 1 ? `<rect x="${gx - 2}" y="4" width="${gw - 2}" height="172" rx="4" fill="var(--accent)" opacity="0.1"/>` : ""}
        <rect x="${gx + 3}" y="${base - hs}" width="13" height="${hs}" rx="2" fill="#16a34a"><title>ยอดขาย ${esc(money(x.S))}</title></rect>
        <rect x="${gx + 18}" y="${base - hc}" width="13" height="${hc}" rx="2" fill="#f59e0b"><title>ซื้อสต็อก ${esc(money(x.C))}</title></rect>
        <text class="sh-axis" x="${gx + 17}" y="176" text-anchor="middle">${TH_MON_SHORT[i]}</text>`;
    }).join("");
    $("shopChart").innerHTML = `<svg viewBox="0 0 480 184" role="img" aria-label="ยอดขายเทียบต้นทุนซื้อสต็อกรายเดือน ปี ${year}"><line x1="8" x2="472" y1="160" y2="160" stroke="var(--line)"/>${bars}</svg>
      <div class="chart-legend"><span><i style="background:#16a34a"></i>ยอดขาย</span><span><i style="background:#f59e0b"></i>ซื้อสต็อก</span></div>`;
  }

  const rank = (list, cls) => list.length ? list.map(x => `<div class="rank-row"><div class="rank-head"><span>${esc(x.name)} <small class="muted">× ${x.count}</small></span><strong>${money(x.amount)}</strong></div><div class="rank-bar ${cls}"><i style="width:${((x.amount / list[0].amount) * 100).toFixed(1)}%"></i></div></div>`).join("") : '<p class="muted">ยังไม่มีข้อมูลในช่วงนี้</p>';
  $("shopTopSales").innerHTML = rank(topBy(cur.sales), "") + '<p class="muted-sm">จัดกลุ่มตามชื่อรายการ — ตั้งชื่อให้เหมือนกัน เช่น "เสื้อยืดคอกลม" ระบบจะรวมยอดให้</p>';
  $("shopTopStock").innerHTML = rank(topBy(cur.stock), "stock");
  $("shopTopOther").innerHTML = rank(topBy([...cur.setup, ...cur.ship]), "stock");

  const wd = Array(7).fill(0);
  cur.sales.forEach(r => { wd[new Date(r.date + "T00:00:00").getDay()] += r.amount; });
  const wmax = Math.max(...wd);
  $("shopWeekday").innerHTML = wmax ? wd.map((v, i) => `<div class="rank-row"><div class="rank-head"><span>${TH_DAYS[i]}${v === wmax ? " 🏅" : ""}</span><strong>${money(v)}</strong></div><div class="rank-bar"><i style="width:${((v / wmax) * 100).toFixed(1)}%"></i></div></div>`).join("") : '<p class="muted">ยังไม่มีข้อมูลการขายในช่วงนี้</p>';
}

function renderDebts() {
  const today = todayStr();
  const D = [...store.debts].sort((a, b) => a.paid - b.paid || (a.due || "9999").localeCompare(b.due || "9999"));
  const open = D.filter(d => !d.paid);
  const sum = k => open.filter(d => d.kind === k).reduce((s, d) => s + d.amount, 0);
  $("debtSummary").innerHTML = `<div class="annual-grid" style="grid-template-columns:1fr 1fr"><div><span>ลูกค้าค้างจ่ายเรา</span><strong class="inc">${money(sum("receivable"))}</strong></div>
    <div><span>เราค้างจ่ายร้านส่ง</span><strong class="exp">${money(sum("payable"))}</strong></div></div>`;
  $("debtList").innerHTML = D.length ? D.map(d => {
    const id = esc(d.id), late = !d.paid && d.due && d.due < today;
    return `<div class="transaction" style="${d.paid ? "opacity:.55" : ""}"><div class="tx-icon">${d.kind === "receivable" ? "🟢" : "🔴"}</div>
      <div class="tx-info"><div class="tx-title">${esc(d.who)}${d.paid ? " ✓" : ""}</div>
      <div class="tx-meta">${d.kind === "receivable" ? "ลูกค้าค้างจ่าย" : "ค้างจ่ายร้านส่ง"}${d.due ? ` · กำหนด ${esc(d.due)}` : ""}${late ? ' <span class="exp">เลยกำหนด</span>' : ""}${d.note ? ` · ${esc(d.note)}` : ""}</div></div>
      <div class="tx-amount ${d.kind === "receivable" ? "income" : "expense"}">${money(d.amount)}</div>
      <div class="tx-actions"><button data-act="debt-paid" data-id="${id}" class="icon-sm" aria-label="สลับสถานะชำระแล้ว" title="${d.paid ? "ยกเลิกชำระ" : "ชำระแล้ว"}">${d.paid ? "↩" : "✓"}</button>
      <button data-act="debt-del" data-id="${id}" class="icon-sm delete" aria-label="ลบ">🗑️</button></div></div>`;
  }).join("") : '<p class="muted">ไม่มีรายการค้างชำระ</p>';
}

function renderShop() {
  store.products ||= []; store.debts ||= []; store.shopRules ||= normShopRules();
  if ($("rulesBox") && !$("rulesBox").open) fillRuleInputs();
  if ($("shopKpis")) renderShopAnalysis();
  if ($("debtList")) renderDebts();
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
  else if (/ตั้งร้าน|จัดร้าน|ค่าล็อ|ค่าล้อ|ค่าล๊อ|ค่าเช่าร้าน/.test(title)) category = "🏪 ค่าตั้งร้าน/ค่าล็อค";
  else if (/สต็อก|สต๊อก|ลงของ|ของเข้า|ซื้อสินค้า|ล็อตสินค้า/.test(title)) category = "📦 ซื้อสต็อกสินค้า";
  else if (/ค่าส่ง|ขนส่ง|แพ็ก|พัสดุ/.test(title)) category = "🚚 ค่าขนส่ง/แพ็กของ";
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
  renderShop();
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

function renderDonut() {
  const box = $("donutChart");
  if (!box) return;
  const mk = viewMK;
  const byCat = {};
  store.transactions.filter(r => r.type === "expense" && r.date.startsWith(mk))
    .forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (!total) { box.innerHTML = '<p class="muted">ยังไม่มีรายจ่ายในเดือนนี้</p>'; return; }

  const PALETTE = ["#4f46e5", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];
  let items = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name, cat: name, v, color: PALETTE[i % PALETTE.length] }));
  if (items.length > 5) {
    const rest = items.slice(5).reduce((s, x) => s + x.v, 0);
    items = items.slice(0, 5);
    items.push({ name: "อื่น ๆ", v: rest, color: "#94a3b8" });
  }

  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = items.map(x => {
    const len = (x.v / total) * C;
    const s = `<circle cx="90" cy="90" r="${R}" ${x.cat ? `data-act="cat" data-id="${esc(x.cat)}" style="cursor:pointer"` : ""} fill="none" stroke="${x.color}" stroke-width="28" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len;
    return s;
  }).join("");
  const legend = items.map(x => `<li ${x.cat ? `data-act="cat" data-id="${esc(x.cat)}" role="button" tabindex="0"` : ""}><span class="dn-dot" style="background:${x.color}"></span><span class="dn-name">${esc(x.name)}</span><span class="dn-val">${esc(money(x.v))} · ${Math.round((x.v / total) * 100)}%</span></li>`).join("");

  box.innerHTML = `<div class="donut-wrap">
    <svg viewBox="0 0 180 180" role="img" aria-label="สัดส่วนรายจ่ายเดือนนี้ รวม ${esc(money(total))}">
      <g transform="rotate(-90 90 90)">${segs}</g>
      <text class="dn-sub" x="90" y="86" text-anchor="middle">รายจ่ายรวม</text>
      <text class="dn-total" x="90" y="106" text-anchor="middle">${esc(money(total))}</text>
    </svg>
    <ul class="donut-legend">${legend}</ul>
  </div>`;
}

function renderCashFlow() {
  const box = $("cashFlowChart");
  if (!box) return;
  const mk = viewMK;
  const rows = store.transactions.filter(r => r.date.startsWith(mk));
  const inc = rows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const byCat = {};
  rows.filter(r => r.type === "expense").forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
  const exp = Object.values(byCat).reduce((s, v) => s + v, 0);
  if (!inc && !exp) { box.innerHTML = '<p class="muted">ยังไม่มีรายการในเดือนนี้</p>'; return; }

  const PALETTE = ["#4f46e5", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];
  let items = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name, cat: name, v, color: PALETTE[i % PALETTE.length] }));
  if (items.length > 5) {
    const rest = items.slice(5).reduce((s, x) => s + x.v, 0);
    items = items.slice(0, 5);
    items.push({ name: "อื่น ๆ", v: rest, color: "#94a3b8" });
  }
  if (inc > exp) items.push({ name: "💰 เหลือเก็บ", v: inc - exp, color: "#16a34a" });

  const total = Math.max(inc, exp), H = 200, MIN = 36;
  const slots = items.map(x => Math.max(MIN, (x.v / total) * H));
  const svgH = Math.max(H, slots.reduce((s, v) => s + v, 0)) + 8;
  const top = (svgH - H) / 2;
  let ly = top, ry = 4, paths = "", nodes = "", labels = "";

  items.forEach((x, i) => {
    const h = Math.max(1.5, (x.v / total) * H);
    const ry0 = ry + (slots[i] - h) / 2, cy = ry + slots[i] / 2;
    paths += `<path d="M100,${ly} C195,${ly} 195,${ry0} 290,${ry0} L290,${ry0 + h} C195,${ry0 + h} 195,${ly + h} 100,${ly + h} Z" fill="${x.color}" opacity="0.35"/>`;
    nodes += `<rect x="290" y="${ry0}" width="12" height="${h}" rx="2" fill="${x.color}"/>`;
    labels += `<text class="cf-label" x="310" y="${cy - 2}">${esc(x.name)}</text><text class="cf-sub" x="310" y="${cy + 12}">${esc(money(x.v))} · ${Math.round((x.v / total) * 100)}%</text>`;
    ly += h; ry += slots[i];
  });

  const incH = (inc / total) * H;
  let src = "";
  if (inc > 0) src += `<rect x="88" y="${top}" width="12" height="${incH}" rx="2" fill="#16a34a"/><text class="cf-src" x="82" y="${top + incH / 2 - 2}">รายรับ</text><text class="cf-sub cf-src" x="82" y="${top + incH / 2 + 12}">${esc(money(inc))}</text>`;
  if (exp > inc) src += `<rect x="88" y="${top + incH}" width="12" height="${H - incH}" rx="2" fill="#dc2626"/><text class="cf-src cf-neg" x="82" y="${top + incH + (H - incH) / 2 + 4}">ใช้เกิน</text>`;

  const note = exp > inc
    ? `ใช้จ่ายเกินรายรับ ${money(exp - inc)} ในเดือนนี้`
    : `ออมได้ ${Math.round(((inc - exp) / inc) * 100)}% ของรายรับเดือนนี้`;
  box.innerHTML = `<svg viewBox="0 0 480 ${svgH}" role="img" aria-label="ผังกระแสเงินเดือนนี้: รายรับ ${money(inc)} รายจ่าย ${money(exp)}">${paths}${nodes}${src}${labels}</svg><p class="muted-sm">${esc(note)}</p>`;
}

function renderDashboard() {
  renderDonut();
  renderCashFlow();
  const mk = viewMK, prevMK = monthShift(mk, -1);
  const inMonth = key => store.transactions.filter(r => r.date.startsWith(key));
  const sum = (rows, type) => rows.filter(r => r.type === type).reduce((a, r) => a + r.amount, 0);
  const catSum = rows => { const o = {}; rows.filter(r => r.type === "expense").forEach(r => { o[r.category] = (o[r.category] || 0) + r.amount; }); return o; };
  const rows = inMonth(mk), prevRows = inMonth(prevMK);
  const inc = sum(rows, "income"), exp = sum(rows, "expense"), flow = inc - exp, prevExp = sum(prevRows, "expense");
  const bal = store.transactions.reduce((a, r) => a + (r.type === "income" ? r.amount : -r.amount), 0);
  const [y, m] = mk.split("-").map(Number);

  $("monthLabel").textContent = `${THAI_MONTHS[m - 1]} ${y}`;
  $("totalBalance").textContent = money(bal);
  $("incThisMonth").textContent = money(inc);
  $("expThisMonth").textContent = money(exp);
  const fe = $("cashFlowNet");
  fe.textContent = (flow > 0 ? "+" : flow < 0 ? "−" : "") + money(Math.abs(flow));
  fe.className = flow > 0 ? "inc" : flow < 0 ? "exp" : "";

  // Insight จากข้อมูลจริงเท่านั้น
  const cur = catSum(rows), prv = catSum(prevRows);
  let st = "good", title = "การเงินเดือนนี้ปกติดี";
  const lines = [];
  if (!rows.length) { st = "good"; title = "ยังไม่มีรายการในเดือนนี้"; lines.push("เริ่มบันทึกรายการแรกได้จากปุ่ม + ด้านล่าง"); }
  else if (exp > inc) { st = "bad"; title = "กำลังใช้เกินรายรับ"; lines.push(`ใช้จ่าย ${money(exp)} จากรายรับ ${money(inc)} — เกินอยู่ ${money(exp - inc)}`); }
  else if (inc > 0 && exp > inc * 0.8) { st = "warn"; title = "ใกล้ถึงขีดรายรับ"; lines.push(`ใช้ไปแล้ว ${Math.round((exp / inc) * 100)}% ของรายรับเดือนนี้ (เหลือ ${money(inc - exp)})`); }
  else if (inc > 0) lines.push(`เหลือเก็บ ${money(inc - exp)} (${Math.round(((inc - exp) / inc) * 100)}% ของรายรับ)`);
  if (rows.length && prevExp > 0) lines.push(`ค่าใช้จ่ายรวม${exp >= prevExp ? "สูง" : "ต่ำ"}กว่าเดือนก่อน ${Math.abs(((exp - prevExp) / prevExp) * 100).toFixed(0)}%`);
  const rise = Object.entries(cur).filter(([c, v]) => prv[c] > 0 && v > prv[c] * 1.1).sort((a, b) => b[1] / prv[b[0]] - a[1] / prv[a[0]])[0];
  if (rise) lines.push(`${splitCat(rise[0])[1]} สูงกว่าเดือนก่อน ${Math.round((rise[1] / prv[rise[0]] - 1) * 100)}%`);
  store.budgets.filter(b => (cur[b.category] || 0) > b.amount).forEach(b => lines.push(`เกินงบหมวด ${splitCat(b.category)[1]} อยู่ ${money(cur[b.category] - b.amount)}`));
  $("dashboardInsights").innerHTML = `<div class="insight ${st}"><b>${esc(title)}</b>${lines.map(l => `<p>${esc(l)}</p>`).join("")}</div>`;

  // Wallets (แตะเพื่อดูรายการของบัญชี)
  $("walletList").innerHTML = store.wallets.map(w => {
    const wb = store.transactions.filter(r => r.walletId === w.id).reduce((a, r) => a + (r.type === "income" ? r.amount : -r.amount), 0);
    return `<button class="wallet-card" data-act="wallet" data-id="${esc(w.id)}"><span class="wallet-name">${esc(w.name)}</span><span class="wallet-bal">${money(wb)}</span></button>`;
  }).join("");

  // สรุปกระแสเงินแบบกะทัดรัด (มือถือ)
  const top = Object.entries(cur).sort((a, b) => b[1] - a[1]).slice(0, 5), scale = Math.max(inc, exp) || 1;
  $("flowCompact").innerHTML = exp ? `<div class="flow-total"><span>รายรับ</span><b class="inc">${money(inc)}</b></div>` + top.map(([c, v]) => {
    const [ic, n] = splitCat(c);
    return `<div class="flow-row"><span>${esc(ic)} ${esc(n)}</span><i style="--w:${((v / scale) * 100).toFixed(1)}%"></i><em>${Math.round((v / exp) * 100)}%</em></div>`;
  }).join("") : '<p class="muted">ยังไม่มีรายจ่ายในเดือนนี้</p>';

  // Chips จากรายการที่บันทึกซ้ำบ่อยจริง
  const freq = new Map();
  store.transactions.forEach(r => { const k = `${r.title.trim()}|${r.amount}`; const o = freq.get(k) || { t: r.title.trim(), a: r.amount, c: r.category, n: 0 }; o.n++; freq.set(k, o); });
  $("smartChips").innerHTML = [...freq.values()].filter(o => o.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3)
    .map(o => `<button type="button" class="chip" data-act="chip" data-id="${esc(o.t + " " + o.a)}">${esc(splitCat(o.c)[0])} ${esc(o.t)} ${money(o.a)}</button>`).join("");

  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);
  $("recentTxList").innerHTML = recent.length ? recent.map(txHtml).join("") : '<p class="muted">ยังไม่มีรายการในเดือนนี้</p>';
}

function txHtml(r) {
  const w = store.wallets.find(x => x.id === r.walletId);
  const kind = r.type === "income" ? "income" : "expense";
  const [ic, name] = splitCat(r.category);
  const time = r.createdAt ? new Date(r.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
  const wn = w ? splitCat(w.name)[1] || w.name : "";
  return `<button type="button" class="tx" data-act="edit" data-id="${esc(r.id)}" aria-label="แก้ไข ${esc(r.title)}">
    <span class="tx-ic">${esc(ic)}</span>
    <span class="tx-main"><span class="tx-t">${esc(r.title)}</span><span class="tx-m">${esc(name)}${wn ? " · " + esc(wn) : ""}</span><span class="tx-m">${esc(relDay(r.date))}${time ? " · " + time : ""}</span></span>
    <span class="tx-a ${kind}">${kind === "income" ? "+" : "−"}${money(r.amount)}</span></button>`;
}

window.delTx = function(id) {
  const idx = store.transactions.findIndex(r => r.id === id);
  if (idx === -1) return;
  deletedTxBackup = { item: store.transactions[idx], index: idx };
  store.transactions.splice(idx, 1);
  saveStoreLocalOnly();
  deleteTxFromCloud(id); // สั่งลบเฉพาะ Document ใน Cloud
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

  $("formTxTitle").textContent = "แก้ไขรายการ";
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
      saveStoreLocalOnly();
      saveTxToCloud(parsed); // อัปโหลดแยก Document
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
      saveTxToCloud(deletedTxBackup.item);
      deletedTxBackup = null;
      saveStoreLocalOnly();
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

    saveStoreLocalOnly();
    saveTxToCloud(payload); // อัปโหลดแยก Document

    e.target.reset();
    $("txId").value = "";
    if ($("date")) $("date").value = todayStr();
    $("formTxTitle").textContent = "เพิ่มรายการ";

    showToast("บันทึกข้อมูลเรียบร้อย ✓");
    closeAddSheet();
    renderAll();
  });

  $("budgetForm").addEventListener("submit", e => {
    e.preventDefault();
    const cat = $("budgetCategorySelect").value;
    const amt = Number($("budgetAmount").value);
    
    if (!store.budgets) store.budgets = [];
    const existing = store.budgets.find(b => b.category === cat);
    if (existing) existing.amount = amt;
    else store.budgets.push({ id: crypto.randomUUID(), category: cat, amount: amt });

    saveStoreLocalOnly();
    syncUserSettingsToCloud();
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
    saveStoreLocalOnly();
    syncUserSettingsToCloud();
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
    saveStoreLocalOnly();
    syncUserSettingsToCloud();
    e.target.reset();
    renderSettings();
    showToast("เพิ่มรายการประจำเรียบร้อย ✓");
  });

  document.querySelectorAll('input[name="type"]').forEach(r => {
    r.addEventListener("change", updateDropdowns);
  });

  ["searchKeyword", "filterType", "filterCategory", "filterWallet", "filterStartDate", "filterEndDate"].forEach(id => {
    if ($(id)) $(id).addEventListener("input", renderFilteredTx);
  });
  $("historyYearSelect").addEventListener("change", renderHistory);
  $("analyticsYearSelect").addEventListener("change", renderAnalytics);
  $("compareYearSelect").addEventListener("change", renderAnalytics);

  // Sync Buttons
  $("syncNowBtn").addEventListener("click", () => {
    if (cloudReady) pullFromCloud();
    else initialSync();
  });
  $("pullCloudBtn").addEventListener("click", () => pullFromCloud());
  $("googleLoginBtn").addEventListener("click", googleLogin);
  $("logoutBtn").addEventListener("click", logout);
  $("monthPrev").addEventListener("click", () => { viewMK = monthShift(viewMK, -1); renderDashboard(); });
  $("monthNext").addEventListener("click", () => { viewMK = monthShift(viewMK, 1); renderDashboard(); });
  $("sheetClose").addEventListener("click", closeAddSheet);
  $("sheetBackdrop").addEventListener("click", closeAddSheet);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAddSheet(); });
  $("txDeleteBtn").addEventListener("click", () => { const id = $("txId").value; if (!id) return; closeAddSheet(); resetTxForm(); delTx(id); });
  if (window.matchMedia && matchMedia("(min-width: 768px)").matches) $("flowDetails").open = true;

  ["shopYear", "shopMonth"].forEach(id => $(id).addEventListener("change", renderShop));
  document.querySelectorAll("#analyticsSeg button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#analyticsSeg button").forEach(x => x.classList.toggle("active-sub", x === b));
    $("anaYear").classList.toggle("hidden", b.dataset.view !== "year");
    $("anaShop").classList.toggle("hidden", b.dataset.view !== "shop");
  }));
  $("rulesSaveBtn").addEventListener("click", () => {
    const read = id => $(id).value.split(/[,，\n]/);
    store.shopRules = normShopRules({ sales: read("ruleSales"), stock: read("ruleStock"), setup: read("ruleSetup"), ship: read("ruleShip") });
    saveStoreLocalOnly(); syncUserSettingsToCloud(); fillRuleInputs(); renderShop(); showToast("บันทึกคำค้นหาแล้ว ✓");
  });
  $("rulesResetBtn").addEventListener("click", () => {
    store.shopRules = normShopRules();
    saveStoreLocalOnly(); syncUserSettingsToCloud(); fillRuleInputs(); renderShop(); showToast("คืนค่าเริ่มต้นแล้ว");
  });
  $("debtForm").addEventListener("submit", e => {
    e.preventDefault();
    const amount = Number($("dAmount").value);
    if (!(amount > 0) || !$("dWho").value.trim()) return;
    store.debts.push({ id: crypto.randomUUID(), who: $("dWho").value.trim(), amount, kind: $("dKind").value === "payable" ? "payable" : "receivable",
      due: $("dDue").value || "", note: $("dNote").value.trim(), paid: false, updatedAt: Date.now() });
    saveStoreLocalOnly(); renderAll(); e.target.reset();
    showToast("เพิ่มรายการแล้ว ✓");
  });
  $("recType").addEventListener("change", updateDropdowns);

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const actions = { edit: editTx, del: delTx, day: selectCalDay, "del-budget": delBudget, "del-goal": delGoal, "del-rec": delRecurring,
      cat: id => goHistory({ category: id, type: "expense", month: true }), "cat-all": () => goHistory({ type: "expense", month: true }),
      wallet: id => goHistory({ wallet: id }), chip: v => { $("smartInput").value = v; $("smartInput").focus(); }, "goal-add": addGoalAmount,
      "debt-paid": toggleDebt, "debt-del": delDebt };
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
    reader.onload = async evt => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.transactions && Array.isArray(imported.transactions)) {
          if (confirm("ต้องการนำเข้าข้อมูล? ข้อมูลเดิมจะถูกรวมกับข้อมูลใหม่")) {
            store = mergeStores(store, normalizeStore(imported));
            saveStoreLocalOnly();
            if (cloudReady) await uploadTxs(store.transactions);
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

  lastSettingsSig = settingsSig();
  if (processRecurring()) saveStoreLocalOnly();
  renderAll();
  updateAccountUI();
  if (auth) auth.onAuthStateChanged(() => { updateAccountUI(); initialSync(); });
  else setSyncStatus("🔴 ออฟไลน์ (โหลด Firebase ไม่สำเร็จ)");
});
