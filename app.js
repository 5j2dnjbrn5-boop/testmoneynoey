/**
 * MoneySync — Personal Finance OS (Production Version)
 */
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
  ],
  transfer: ['🔄 โอนเงินระหว่างบัญชี']
};

// Firebase Configuration (Realtime Database & Auth)
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
let currentUser = null;

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
let currentCalDate = new Date();
let syncDebounceTimer = null;
let smartParsedTemp = null;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(n) || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

// ==================== DATA MIGRATION & LOCAL STORAGE ====================
function loadStore() {
  const v1Raw = localStorage.getItem(KEY_V1);
  const v2Raw = localStorage.getItem(KEY_V2);

  let data = null;
  if (v2Raw) {
    try { data = JSON.parse(v2Raw); } catch (e) { console.error(e); }
  }

  // Safe Migration จาก V1
  let legacyTx = [];
  if (!data && v1Raw) {
    try {
      const parsed = JSON.parse(v1Raw);
      localStorage.setItem(`moneysync.backup.v1.${Date.now()}`, v1Raw);
      legacyTx = parsed.map(tx => ({
        id: tx.id || crypto.randomUUID(),
        type: tx.type || "expense",
        amount: Math.abs(Number(tx.amount)) || 0,
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
// วางต่อจากฟังก์ชัน parseCsvLine ให้สมบูรณ์
  result.push(cur);
  return result;
}

// ==================== EVENT BINDINGS ====================
document.addEventListener("DOMContentLoaded", () => {
  initAuth();

  if ($("date")) $("date").valueAsDate = new Date();
  if ($("transferDate")) $("transferDate").valueAsDate = new Date();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // History Tab Navigation
  if ($("viewListBtn")) {
    $("viewListBtn").addEventListener("click", () => {
      $("historyListView").classList.remove("hidden");
      $("historyCalView").classList.add("hidden");
      $("viewListBtn").classList.add("active-sub");
      $("viewCalBtn").classList.remove("active-sub");
    });
  }

  if ($("viewCalBtn")) {
    $("viewCalBtn").addEventListener("click", () => {
      $("historyListView").classList.add("hidden");
      $("historyCalView").classList.remove("hidden");
      $("viewCalBtn").classList.add("active-sub");
      $("viewListBtn").classList.remove("active-sub");
    });
  }

  if ($("prevCalMonth")) {
    $("prevCalMonth").addEventListener("click", () => {
      currentCalDate.setMonth(currentCalDate.getMonth() - 1);
      renderCalendar();
    });
  }
  
  if ($("nextCalMonth")) {
    $("nextCalMonth").addEventListener("click", () => {
      currentCalDate.setMonth(currentCalDate.getMonth() + 1);
      renderCalendar();
    });
  }

  // Transfer Money Drawer
  if ($("transferModalBtn")) {
    $("transferModalBtn").addEventListener("click", () => {
      $("transferBox").classList.toggle("hidden");
    });
  }
  if ($("closeTransferBtn")) {
    $("closeTransferBtn").addEventListener("click", () => {
      $("transferBox").classList.add("hidden");
    });
  }

  if ($("transferForm")) {
    $("transferForm").addEventListener("submit", e => {
      e.preventDefault();
      const fromW = $("transferFromWallet").value;
      const toW = $("transferToWallet").value;
      const amt = Number($("transferAmount").value);
      const date = $("transferDate").value;
      const note = $("transferNote").value.trim();

      if (fromW === toW) {
        alert("ไม่สามารถโอนเงินไปยังบัญชีเดียวกันได้");
        return;
      }
      if (amt <= 0) {
        alert("กรุณากรอกจำนวนเงินให้ถูกต้อง");
        return;
      }

      const payload = {
        id: crypto.randomUUID(),
        type: "transfer",
        amount: amt,
        title: "โอนเงินระหว่างบัญชี",
        category: "🔄 โอนเงินระหว่างบัญชี",
        walletId: fromW,
        toWalletId: toW,
        date: date,
        note: note,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      store.transactions.push(payload);
      saveStore();
      e.target.reset();
      if ($("transferDate")) $("transferDate").valueAsDate = new Date();
      $("transferBox").classList.add("hidden");
      showToast("โอนเงินเรียบร้อยแล้ว ✓");
      renderAll();
    });
  }

  // Smart Add Button & Preview System
  if ($("smartAddBtn")) {
    $("smartAddBtn").addEventListener("click", () => {
      const parsed = parseSmartAdd($("smartInput").value);
      if (parsed) {
        smartParsedTemp = parsed;
        $("smartTitle").value = parsed.title;
        $("smartAmount").value = parsed.amount;
        $("smartType").value = parsed.type;
        
        const cats = CATEGORIES[parsed.type];
        $("smartCategory").innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
        $("smartCategory").value = parsed.category;
        
        $("smartWallet").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
        $("smartWallet").value = parsed.walletId;

        $("smartPreviewBox").classList.remove("hidden");
      } else {
        alert("กรุณากรอกรูปแบบเช่น 'ข้าว 60' หรือ 'เงินเดือน 25000'");
      }
    });
  }

  if ($("smartType")) {
    $("smartType").addEventListener("change", e => {
      const type = e.target.value;
      const cats = CATEGORIES[type] || CATEGORIES.expense;
      $("smartCategory").innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    });
  }

  if ($("smartConfirmBtn")) {
    $("smartConfirmBtn").addEventListener("click", () => {
      const title = $("smartTitle").value.trim();
      const amount = Number($("smartAmount").value);
      if (!title || amount <= 0) {
        alert("กรุณากรอกชื่อและจำนวนเงินให้ถูกต้อง");
        return;
      }

      store.transactions.push({
        id: crypto.randomUUID(),
        title,
        amount,
        type: $("smartType").value,
        category: $("smartCategory").value,
        walletId: $("smartWallet").value,
        date: new Date().toISOString().slice(0, 10),
        note: "Smart Quick Add",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      saveStore();
      $("smartInput").value = "";
      $("smartPreviewBox").classList.add("hidden");
      showToast("บันทึกรายการสำเร็จ ✓");
      renderAll();
    });
  }

  if ($("smartCancelBtn")) {
    $("smartCancelBtn").addEventListener("click", () => {
      $("smartPreviewBox").classList.add("hidden");
    });
  }

  // Undo Delete
  if ($("undoBtn")) {
    $("undoBtn").addEventListener("click", () => {
      if (deletedTxBackup) {
        store.transactions.splice(deletedTxBackup.index, 0, deletedTxBackup.item);
        deletedTxBackup = null;
        saveStore();
        renderAll();
        showToast("คืนค่ารายการเรียบร้อยแล้ว ✓");
      }
    });
  }

  // Add / Edit Transaction Form
  if ($("txForm")) {
    $("txForm").addEventListener("submit", e => {
      e.preventDefault();
      const txId = $("txId").value;
      const type = document.querySelector('input[name="type"]:checked').value;
      const amt = Number($("amount").value);

      if (amt <= 0) {
        alert("กรุณากรอกจำนวนเงินที่มากกว่า 0");
        return;
      }

      const payload = {
        id: txId || crypto.randomUUID(),
        type,
        amount: amt,
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
  }

  // Budgets & Goals Forms
  if ($("budgetForm")) {
    $("budgetForm").addEventListener("submit", e => {
      e.preventDefault();
      const cat = $("budgetCategorySelect").value;
      const amt = Number($("budgetAmount").value);
      
      if (amt <= 0) return;

      if (!store.budgets) store.budgets = [];
      const existing = store.budgets.find(b => b.category === cat);
      if (existing) existing.amount = amt;
      else store.budgets.push({ id: crypto.randomUUID(), category: cat, amount: amt });

      saveStore();
      renderSettings();
      showToast("ตั้งงบประมาณเรียบร้อย ✓");
    });
  }

  if ($("goalForm")) {
    $("goalForm").addEventListener("submit", e => {
      e.preventDefault();
      if (!store.goals) store.goals = [];
      store.goals.push({
        id: crypto.randomUUID(),
        title: $("goalTitle").value.trim(),
        targetAmount: Number($("goalTarget").value),
        currentAmount: Number($("goalCurrent").value) || 0,
        deadline: $("goalDeadline").value
      });
      saveStore();
      e.target.reset();
      renderSettings();
      showToast("สร้างเป้าหมายเรียบร้อย ✓");
    });
  }

  if ($("recurringForm")) {
    $("recurringForm").addEventListener("submit", e => {
      e.preventDefault();
      if (!store.recurring) store.recurring = [];
      store.recurring.push({
        id: crypto.randomUUID(),
        title: $("recTitle").value.trim(),
        amount: Number($("recAmount").value),
        type: $("recType").value,
        category: $("recCategory").value,
        walletId: $("recWallet").value,
        dayOfMonth: Number($("recDay").value),
        lastGeneratedMonth: ""
      });
      saveStore();
      e.target.reset();
      renderSettings();
      showToast("เพิ่มรายการประจำเรียบร้อย ✓");
    });
  }

  document.querySelectorAll('input[name="type"]').forEach(r => {
    r.addEventListener("change", updateDropdowns);
  });

  ["searchKeyword", "filterType", "filterCategory", "filterWallet", "filterStartDate", "filterEndDate"].forEach(id => {
    if ($(id))$(id).addEventListener("input", renderFilteredTx);
  });
  if ($("historyYearSelect")) $("historyYearSelect").addEventListener("change", renderHistory);
  if ($("analyticsYearSelect")) $("analyticsYearSelect").addEventListener("change", renderAnalytics);
  if ($("compareYearSelect")) $("compareYearSelect").addEventListener("change", renderAnalytics);

  // Sync & Auth Buttons
  if ($("loginAnonBtn")) {
    $("loginAnonBtn").addEventListener("click", () => {
      if (auth) {
        auth.signInAnonymously().then(() => showToast("เข้าสู่ระบบ Anonymous สำเร็จ")).catch(err => alert(err.message));
      }
    });
  }

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", () => {
      if (auth) auth.signOut().then(() => showToast("ออกจากระบบแล้ว"));
    });
  }

  if ($("syncNowBtn")) {
    $("syncNowBtn").addEventListener("click", () => {
      syncToCloud();
      showToast("ส่งข้อมูลขึ้น Cloud แล้ว ✓");
    });
  }

  if ($("pullCloudBtn")) $("pullCloudBtn").addEventListener("click", pullFromCloud);

  // Export JSON
  if ($("exportJsonBtn")) {
    $("exportJsonBtn").addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store, null, 2));
      const a = document.createElement("a");
      a.href = dataStr;
      a.download = `moneysync-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });
  }

  // Export CSV
  if ($("exportCsvBtn")) {
    $("exportCsvBtn").addEventListener("click", () => {
      let csv = "ID,Type,Amount,Title,Category,Wallet,Date,Note\n";
      store.transactions.forEach(r => {
        const wName = (store.wallets.find(w => w.id === r.walletId) || {}).name || "";
        csv += `${escapeCsvCell(r.id)},${escapeCsvCell(r.type)},${r.amount},${escapeCsvCell(r.title)},${escapeCsvCell(r.category)},${escapeCsvCell(wName)},${escapeCsvCell(r.date)},${escapeCsvCell(r.note)}\n`;
      });
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `moneysync-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });
  }

  // Import JSON
  if ($("importJsonInput")) {
    $("importJsonInput").addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (imported.transactions && Array.isArray(imported.transactions)) {
            const existingIds = new Set(store.transactions.map(t => t.id));
            let addedCount = 0;

            imported.transactions.forEach(tx => {
              if (!existingIds.has(tx.id)) {
                store.transactions.push(tx);
                existingIds.add(tx.id);
                addedCount++;
              }
            });

            saveStore();
            renderAll();
            showToast(`นำเข้าสำเร็จ (${addedCount} รายการใหม่) ✓`);
          } else {
            alert("ไฟล์ JSON ไม่ถูกต้องตามรูปแบบ");
          }
        } catch (err) { alert("อ่านไฟล์ไม่สำเร็จ"); }
      };
      reader.readAsText(file);
    });
  }

  // Theme Toggle
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark") document.body.classList.add("dark");

  if ($("themeBtn")) {
    $("themeBtn").addEventListener("click", () => {
      document.body.classList.toggle("dark");
      const isDark = document.body.classList.contains("dark");
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
      $("themeBtn").textContent = isDark ? "☀️ ธีมสว่าง" : "☾ ธีมมืด";
    });
  }

  renderAll();
});
  if (!data) {
    data = {
      version: 2,
      wallets: [
        { id: "w_cash", name: "💵 เงินสด", type: "cash", initialBalance: 0 },
        { id: "w_bank", name: "🏦 ธนาคาร", type: "bank", initialBalance: 0 },
        { id: "w_card", name: "💳 บัตรเครดิต", type: "credit", initialBalance: 0 },
        { id: "w_ewallet", name: "📱 e-Wallet", type: "ewallet", initialBalance: 0 }
      ],
      transactions: legacyTx,
      budgets: [
        { id: "b_1", category: "🍚 อาหาร", amount: 3000 }
      ],
      goals: [],
      recurring: []
    };
  } else {
    // Migration: เพิ่ม initialBalance หากยังไม่มีใน Schema
    if (data.wallets) {
      data.wallets.forEach(w => {
        if (typeof w.initialBalance !== "number") w.initialBalance = 0;
      });
    }
    if (!data.budgets) data.budgets = [];
    if (!data.goals) data.goals = [];
    if (!data.recurring) data.recurring = [];
  }

  localStorage.setItem(KEY_V2, JSON.stringify(data));
  return data;
}

function saveStore(triggerSync = true) {
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  processRecurring();

  if (triggerSync) {
    const statusEl = $("syncStatusText");
    if (statusEl) statusEl.textContent = "สถานะการซิงค์: 🟡 มีการเปลี่ยนแปลง (รอยืนยันซิงค์...)";

    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncToCloud();
    }, 2000);
  }
}

// ==================== FIREBASE AUTH & CLOUD SYNC ====================
function initAuth() {
  if (!auth) return;

  auth.onAuthStateChanged(user => {
    currentUser = user;
    const authStatus = $("authStatusText");
    const loggedOutView = $("loggedOutView");
    const loggedInView = $("loggedInView");

    if (user) {
      if (authStatus) authStatus.textContent = `👤 ผู้ใช้: ${user.isAnonymous ? "Guest (Anonymous)" : user.email} (UID: ${user.uid.slice(0, 6)}...)`;
      if (loggedOutView) loggedOutView.classList.add("hidden");
      if (loggedInView) loggedInView.classList.remove("hidden");
      syncToCloud();
    } else {
      if (authStatus) authStatus.textContent = "👤 สถานะผู้ใช้: ไม่ได้เข้าสู่ระบบ (Guest Mode)";
      if (loggedOutView) loggedOutView.classList.remove("hidden");
      if (loggedInView) loggedInView.classList.add("hidden");
      const statusEl = $("syncStatusText");
      if (statusEl) statusEl.textContent = "สถานะการซิงค์: 🔴 ออฟไลน์ (เข้าสู่ระบบเพื่อซิงค์)";
    }
  });
}

function syncToCloud() {
  if (!db || !currentUser) {
    const statusEl = $("syncStatusText");
    if (statusEl) statusEl.textContent = "สถานะการซิงค์: 🔴 ออฟไลน์ (บันทึกในเครื่อง)";
    return;
  }

  const statusEl = $("syncStatusText");
  if (statusEl) statusEl.textContent = "สถานะการซิงค์: 🔄 กำลังส่งข้อมูลไปยัง Firebase...";

  db.ref(`users/${currentUser.uid}/store`).set(store)
    .then(() => {
      if (statusEl) statusEl.textContent = `สถานะการซิงค์: 🟢 ซิงค์กับ Cloud เรียบร้อยแล้ว ✓`;
    })
    .catch(err => {
      console.warn("Cloud Sync Error:", err);
      if (statusEl) statusEl.textContent = `สถานะการซิงค์: 🔴 ล้มเหลว (${err.message})`;
    });
}

function pullFromCloud() {
  if (!db || !currentUser) {
    alert("กรุณาเข้าสู่ระบบก่อนดึงข้อมูลจาก Cloud");
    return;
  }

  db.ref(`users/${currentUser.uid}/store`).once("value")
    .then(snapshot => {
      const cloudData = snapshot.val();
      if (cloudData && cloudData.transactions) {
        if (confirm("พบข้อมูลบน Cloud ต้องการดึงมาทับข้อมูลในเครื่องใช่หรือไม่? (แนะนำให้ Export JSON สำรองไว้ก่อน)")) {
          store = cloudData;
          saveStore(false);
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
        amount: Math.abs(Number(rec.amount)) || 0,
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

// ==================== SMART QUICK ADD ====================
function parseSmartAdd(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const lastPart = parts[parts.length - 1];
  const amount = parseFloat(lastPart);
  if (isNaN(amount) || amount <= 0) return null;

  const title = parts.slice(0, parts.length - 1).join(" ");
  let type = "expense";
  let category = "🎁 อื่น ๆ";

  if (/เงินเดือน|รายได้|โบนัส|ขาย|ปันผล/.test(title)) {
    type = "income";
    category = "💼 เงินเดือน";
  } else if (/ข้าว|อาหาร|กาแฟ|ชา|ก๋วยเตี๋ยว|ชาบู|ขนม/.test(title)) {
    category = "🍚 อาหาร";
  } else if (/รถ|เดินทาง|น้ำมัน|แท็กซี่|BTS|MRT|Grab/.test(title)) {
    category = "🚗 เดินทาง";
  } else if (/เน็ต|บิล|ค่าน้ำ|ค่าไฟ|โทรศัพท์/.test(title)) {
    category = "💳 บิล/อินเทอร์เน็ต";
  }

  return { title, amount, type, category, walletId: "w_cash" };
}

// ==================== CALCULATION HELPERS ====================
function calculateWalletBalance(walletId) {
  const wallet = store.wallets.find(w => w.id === walletId);
  const initial = wallet ? (wallet.initialBalance || 0) : 0;

  const txs = store.transactions.filter(t => t.walletId === walletId || t.toWalletId === walletId);
  
  let total = initial;
  txs.forEach(t => {
    if (t.type === "income") {
      if (t.walletId === walletId) total += t.amount;
    } else if (t.type === "expense") {
      if (t.walletId === walletId) total -= t.amount;
    } else if (t.type === "transfer") {
      if (t.walletId === walletId) total -= t.amount; // ต้นทาง หักออก
      if (t.toWalletId === walletId) total += t.amount; // ปลายทาง บวกเข้า
    }
  });

  return total;
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
  $("recWallet").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");

  $("transferFromWallet").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
  $("transferToWallet").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
}

function renderDashboard() {
  const now = new Date();
  const thisMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // รายรับ/รายจ่ายประจำเดือน (ไม่รวมโอนเงิน)
  const curTx = store.transactions.filter(r => r.date.slice(0, 7) === thisMK);
  const inc = curTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const exp = curTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  // คำนวณยอดเงินรวมทุกกระเป๋า (คำนวณจาก Initial Balance + Transactions)
  const totalBalance = store.wallets.reduce((acc, w) => acc + calculateWalletBalance(w.id), 0);

  $("totalBalance").textContent = money(totalBalance);
  $("incThisMonth").textContent = money(inc);
  $("expThisMonth").textContent = money(exp);

  // Wallet Grid
  $("walletList").innerHTML = store.wallets.map(w => {
    const bal = calculateWalletBalance(w.id);
    return `<div class="wallet-card">
      <div class="wallet-name">${esc(w.name)}</div>
      <div class="wallet-bal">${money(bal)}</div>
    </div>`;
  }).join("");

  // Insights
  const days = now.getDate();
  const avgDaily = exp / (days || 1);
  const saveRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
  
  $("dashboardInsights").innerHTML = `
    <p>💡 ค่าใช้จ่ายเฉลี่ยต่อวันในเดือนนี้: <strong>${money(avgDaily)}</strong></p>
    <p>📊 อัตราการออมเงินเดือนนี้ (Saving Rate): <strong>${saveRate}%</strong></p>
  `;

  // Recent Transactions (Top 5)
  const recent = [...store.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);
  $("recentTxList").innerHTML = recent.length ? recent.map(txHtml).join("") : `<p class="muted">ยังไม่มีรายการบันทึก</p>`;
}

function txHtml(r) {
  const walletObj = store.wallets.find(w => w.id === r.walletId);
  const toWalletObj = store.wallets.find(w => w.id === r.toWalletId);
  
  let wText = walletObj ? walletObj.name : "";
  if (r.type === "transfer" && toWalletObj) {
    wText = `${walletObj ? walletObj.name : ''} ➔ ${toWalletObj.name}`;
  }

  let icon = "🔴";
  let sign = "−";
  let amtClass = "expense";

  if (r.type === "income") {
    icon = "🟢";
    sign = "+";
    amtClass = "income";
  } else if (r.type === "transfer") {
    icon = "🔄";
    sign = "";
    amtClass = "transfer";
  }

  return `<div class="transaction">
    <div class="tx-icon">${icon}</div>
    <div class="tx-info">
      <div class="tx-title">${esc(r.title)}</div>
      <div class="tx-meta">${esc(r.category)} • ${esc(wText)} • ${r.date} ${r.note ? `(${esc(r.note)})` : ''}</div>
    </div>
    <div class="tx-amount ${amtClass}">${sign}${money(r.amount)}</div>
    <div class="tx-actions">
      <button onclick="editTx('${r.id}')" class="icon-sm" title="แก้ไข" aria-label="แก้ไข">✏️</button>
      <button onclick="delTx('${r.id}')" class="icon-sm delete" title="ลบ" aria-label="ลบ">🗑️</button>
    </div>
  </div>`;
}

// Delete & Edit Handlers
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

window.editTx = function(id) {
  const item = store.transactions.find(r => r.id === id);
  if (!item) return;

  if (item.type === "transfer") {
    // แสดงกล่องโอนเงินเพื่อแก้ไข
    $("transferAmount").value = item.amount;
    $("transferFromWallet").value = item.walletId;
    $("transferToWallet").value = item.toWalletId;
    $("transferDate").value = item.date;
    $("transferNote").value = item.note || "";
    $("transferBox").classList.remove("hidden");
    // ลบรายการเดิมออกชั่วคราวเพื่อรอการบันทึกใหม่
    store.transactions = store.transactions.filter(t => t.id !== id);
    switchTab("dashboard");
    return;
  }

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

function showToast(msg, showUndo = false) {
  const t = $("toast");
  $("toastMsg").textContent = msg;
  const undo = $("undoBtn");
  
  if (showUndo) undo.classList.remove("hidden");
  else undo.classList.add("hidden");

  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

// ==================== HISTORY & FILTERS ====================
function renderHistory() {
  const years = [...new Set(store.transactions.map(r => r.date.slice(0, 4)))].sort((a, b) => b - a);
  const currentYearStr = new Date().getFullYear().toString();
  if (!years.includes(currentYearStr)) years.push(currentYearStr);

  const yearSelect = $("historyYearSelect");
  const curSelected = yearSelect.value || currentYearStr;
  yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === curSelected ? "selected" : ""}>${y}</option>`).join("");

  const selectedYear = yearSelect.value || currentYearStr;
  const yearTx = store.transactions.filter(r => r.date.startsWith(selectedYear));
  const yearInc = yearTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const yearExp = yearTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  $("annualOverviewCard").innerHTML = `
    <div class="annual-grid">
      <div><span>รายรับทั้งปี</span><strong class="inc">${money(yearInc)}</strong></div>
      <div><span>รายจ่ายทั้งปี</span><strong class="exp">${money(yearExp)}</strong></div>
      <div><span>สุทธิ</span><strong>${money(yearInc - yearExp)}</strong></div>
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
    const matchWallet = wallet === "all" || r.walletId === wallet || r.toWalletId === wallet;
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
  $("calMonthTitle").textContent = `${currentCalDate.toLocaleString('default', { month: 'long' })} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTx = store.transactions.filter(r => r.date === dateStr);
    const hasExp = dayTx.some(r => r.type === "expense");

    html += `<div class="cal-day ${hasExp ? 'has-exp' : ''}" onclick="selectCalDay('${dateStr}')" role="button" aria-label="วันที่ ${d}">
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
  const curY = new Date().getFullYear();
  const prevY = curY - 1;

  if (!years.includes(String(prevY))) years.push(String(prevY));
  if (!years.includes(String(curY))) years.push(String(curY));

  $("analyticsYearSelect").innerHTML = years.map(y => `<option value="${y}" ${y === String(curY) ? "selected" : ""}>${y}</option>`).join("");
  $("compareYearSelect").innerHTML = years.map(y => `<option value="${y}" ${y === String(prevY) ? "selected" : ""}>${y}</option>`).join("");

  const y1 = $("analyticsYearSelect").value;
  const y2 = $("compareYearSelect").value;

  const y1Tx = store.transactions.filter(r => r.date.startsWith(y1));
  const y2Tx = store.transactions.filter(r => r.date.startsWith(y2));

  const y1Exp = y1Tx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);
  const y2Exp = y2Tx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  const diffPct = y2Exp ? (((y1Exp - y2Exp) / y2Exp) * 100).toFixed(1) : 0;

  $("comparisonReport").innerHTML = `
    <h3>ปี ${y2} VS ปี ${y1}</h3>
    <p>ปี ${y1} ใช้จ่ายรวม <strong>${money(y1Exp)}</strong> (ปี ${y2} ใช้จ่าย <strong>${money(y2Exp)}</strong>)</p>
    <p>แนวโน้มค่าใช้จ่าย: <strong class="${diffPct > 0 ? 'exp' : 'inc'}">${diffPct > 0 ? '+' : ''}${diffPct}%</strong> จากปีเปรียบเทียบ</p>
  `;
}

// ==================== SETTINGS (INITIAL BALANCES, BUDGETS, GOALS, RECURRING) ====================
function renderSettings() {
  const now = new Date();
  const thisMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Wallet Initial Balance Setup
  $("walletInitialList").innerHTML = store.wallets.map(w => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
      <span>${esc(w.name)}</span>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="number" step="0.01" value="${w.initialBalance || 0}" onchange="updateWalletInitialBalance('${w.id}', this.value)" style="width:120px; padding:6px;">
        <span>บาท</span>
      </div>
    </div>
  `).join("");

  // Budgets
  if (!store.budgets) store.budgets = [];
  $("budgetProgressList").innerHTML = store.budgets.map(b => {
    const spent = store.transactions
      .filter(r => r.date.startsWith(thisMK) && r.category === b.category && r.type === "expense")
      .reduce((acc, r) => acc + r.amount, 0);

    const pct = Math.min(100, Math.round((spent / (b.amount || 1)) * 100));
    return `<div class="budget-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div class="budget-head" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${esc(b.category)}</span>
        <div>
          <strong>${money(spent)} / ${money(b.amount)} (${pct}%)</strong>
          <button onclick="delBudget('${b.id}')" class="icon-sm delete" style="margin-left:8px;" title="ลบงบ" aria-label="ลบงบ">🗑️</button>
        </div>
      </div>
      <div class="progress-bar"><div class="fill ${pct >= 100 ? 'danger' : ''}" style="width:${pct}%"></div></div>
      ${pct >= 100 ? '<small style="color:var(--red);">⚠️ คุณใช้จ่ายเกินงบหมวดนี้แล้ว</small>' : ''}
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีการตั้งงบประมาณ</p>`;

  // Goals
  if (!store.goals) store.goals = [];
  $("goalsList").innerHTML = store.goals.map(g => {
    const pct = Math.min(100, Math.round((g.currentAmount / (g.targetAmount || 1)) * 100));
    return `<div class="goal-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4>🎯 ${esc(g.title)}</h4>
        <button onclick="delGoal('${g.id}')" class="icon-sm delete" title="ลบเป้าหมาย" aria-label="ลบเป้าหมาย">🗑️</button>
      </div>
      <p>${money(g.currentAmount)} / ${money(g.targetAmount)} (${pct}%)</p>
      <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <small>กำหนดเดดไลน์: ${g.deadline}</small>
    </div>`;
  }).join("") || `<p class="muted">ยังไม่มีเป้าหมายการเงิน</p>`;

  // Recurring
  if (!store.recurring) store.recurring = [];
  $("recurringList").innerHTML = store.recurring.map(r => `
    <div class="rec-card" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid var(--line); border-radius:10px; margin-bottom:8px;">
      <div>
        <strong>${esc(r.title)}</strong> (${money(r.amount)})
        <div><small class="muted">จ่ายทุกวันที่ ${r.dayOfMonth} ของเดือน • ${esc(r.category)}</small></div>
      </div>
      <button onclick="delRecurring('${r.id}')" class="icon-sm delete" title="ลบรายการประจำ" aria-label="ลบ">🗑️ ลบ</button>
    </div>
  `).join("") || `<p class="muted">ยังไม่มีรายการประจำ</p>`;
}

window.updateWalletInitialBalance = function(id, val) {
  const wallet = store.wallets.find(w => w.id === id);
  if (wallet) {
    wallet.initialBalance = Number(val) || 0;
    saveStore();
    renderDashboard();
  }
};

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

// ==================== CSV HELPERS ====================
function escapeCsvCell(cell) {
  const str = String(cell ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsvLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        result.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  result.push(cur);
  return result;
}

// ==================== EVENT BINDINGS ====================
document.addEventListener("DOMContentLoaded", () => {
  initAuth();

  if ($("date")) $("date").valueAsDate = new Date();
  if ($("transferDate")) $("transferDate").valueAsDate = new Date();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // History Tab Navigation
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

  // Transfer Money Drawer
  $("transferModalBtn").addEventListener("click", () => {
    $("transferBox").classList.toggle("hidden");
  });
  $("closeTransferBtn").addEventListener("click", () => {
    $("transferBox").classList.add("hidden");
  });

  $("transferForm").addEventListener("submit", e => {
    e.preventDefault();
    const fromW = $("transferFromWallet").value;
    const toW = $("transferToWallet").value;
    const amt = Number($("transferAmount").value);
    const date = $("transferDate").value;
    const note = $("transferNote").value.trim();

    if (fromW === toW) {
      alert("ไม่สามารถโอนเงินไปยังบัญชีเดียวกันได้");
      return;
    }
    if (amt <= 0) {
      alert("กรุณากรอกจำนวนเงินให้ถูกต้อง");
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      type: "transfer",
      amount: amt,
      title: "โอนเงินระหว่างบัญชี",
      category: "🔄 โอนเงินระหว่างบัญชี",
      walletId: fromW,
      toWalletId: toW,
      date: date,
      note: note,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    store.transactions.push(payload);
    saveStore();
    e.target.reset();
    if ($("transferDate")) $("transferDate").valueAsDate = new Date();
    $("transferBox").classList.add("hidden");
    showToast("โอนเงินเรียบร้อยแล้ว ✓");
    renderAll();
  });

  // Smart Add Button & Preview System
  $("smartAddBtn").addEventListener("click", () => {
    const parsed = parseSmartAdd($("smartInput").value);
    if (parsed) {
      smartParsedTemp = parsed;
      $("smartTitle").value = parsed.title;
      $("smartAmount").value = parsed.amount;
      $("smartType").value = parsed.type;
      
      const cats = CATEGORIES[parsed.type];
      $("smartCategory").innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      $("smartCategory").value = parsed.category;
      
      $("smartWallet").innerHTML = store.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
      $("smartWallet").value = parsed.walletId;

      $("smartPreviewBox").classList.remove("hidden");
    } else {
      alert("กรุณากรอกรูปแบบเช่น 'ข้าว 60' หรือ 'เงินเดือน 25000'");
    }
  });

  $("smartType").addEventListener("change", e => {
    const type = e.target.value;
    const cats = CATEGORIES[type] || CATEGORIES.expense;
    $("smartCategory").innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  });

  $("smartConfirmBtn").addEventListener("click", () => {
    const title = $("smartTitle").value.trim();
    const amount = Number($("smartAmount").value);
    if (!title || amount <= 0) {
      alert("กรุณากรอกชื่อและจำนวนเงินให้ถูกต้อง");
      return;
    }

    store.transactions.push({
      id: crypto.randomUUID(),
      title,
      amount,
      type: $("smartType").value,
      category: $("smartCategory").value,
      walletId: $("smartWallet").value,
      date: new Date().toISOString().slice(0, 10),
      note: "Smart Quick Add",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    saveStore();
    $("smartInput").value = "";
    $("smartPreviewBox").classList.add("hidden");
    showToast("บันทึกรายการสำเร็จ ✓");
    renderAll();
  });

  $("smartCancelBtn").addEventListener("click", () => {
    $("smartPreviewBox").classList.add("hidden");
  });

  // Undo Delete
  $("undoBtn").addEventListener("click", () => {
    if (deletedTxBackup) {
      store.transactions.splice(deletedTxBackup.index, 0, deletedTxBackup.item);
      deletedTxBackup = null;
      saveStore();
      renderAll();
      showToast("คืนค่ารายการเรียบร้อยแล้ว ✓");
    }
  });

  // Add / Edit Transaction Form
  $("txForm").addEventListener("submit", e => {
    e.preventDefault();
    const txId = $("txId").value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const amt = Number($("amount").value);

    if (amt <= 0) {
      alert("กรุณากรอกจำนวนเงินที่มากกว่า 0");
      return;
    }

    const payload = {
      id: txId || crypto.randomUUID(),
      type,
      amount: amt,
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

  // Budgets & Goals Forms
  $("budgetForm").addEventListener("submit", e => {
    e.preventDefault();
    const cat = $("budgetCategorySelect").value;
    const amt = Number($("budgetAmount").value);
    
    if (amt <= 0) return;

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
      currentAmount: Number($("goalCurrent").value) || 0,
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
      walletId: $("recWallet").value,
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

  // Sync & Auth Buttons
  if ($("loginAnonBtn")) {
    $("loginAnonBtn").addEventListener("click", () => {
      if (auth) {
        auth.signInAnonymously().then(() => showToast("เข้าสู่ระบบ Anonymous สำเร็จ")).catch(err => alert(err.message));
      }
    });
  }

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", () => {
      if (auth) auth.signOut().then(() => showToast("ออกจากระบบแล้ว"));
    });
  }

  $("syncNowBtn").addEventListener("click", () => {
    syncToCloud();
    showToast("ส่งข้อมูลขึ้น Cloud แล้ว ✓");
  });
  $("pullCloudBtn").addEventListener("click", pullFromCloud);

  // Export JSON
  $("exportJsonBtn").addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `moneysync-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  // Export CSV (Excel Friendly with UTF-8 BOM)
  $("exportCsvBtn").addEventListener("click", () => {
    let csv = "ID,Type,Amount,Title,Category,Wallet,Date,Note\n";
    store.transactions.forEach(r => {
      const wName = (store.wallets.find(w => w.id === r.walletId) || {}).name || "";
      csv += `${escapeCsvCell(r.id)},${escapeCsvCell(r.type)},${r.amount},${escapeCsvCell(r.title)},${escapeCsvCell(r.category)},${escapeCsvCell(wName)},${escapeCsvCell(r.date)},${escapeCsvCell(r.note)}\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moneysync-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  // Import JSON with Deduplication
  $("importJsonInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.transactions && Array.isArray(imported.transactions)) {
          const existingIds = new Set(store.transactions.map(t => t.id));
          let addedCount = 0;

          imported.transactions.forEach(tx => {
            if (!existingIds.has(tx.id)) {
              store.transactions.push(tx);
              existingIds.add(tx.id);
              addedCount++;
            }
          });

          saveStore();
          renderAll();
          showToast(`นำเข้าสำเร็จ (${addedCount} รายการใหม่) ✓`);
        } else {
          alert("ไฟล์ JSON ไม่ถูกต้องตามรูปแบบ");
        }
      } catch (err) { alert("อ่านไฟล์ไม่สำเร็จ"); }
    };
    reader.readAsText(file);
  });

  // Theme Toggle
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark") document.body.classList.add("dark");

  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    $("themeBtn").textContent = isDark ? "☀️ ธีมสว่าง" : "☾ ธีมมืด";
  });

  renderAll();
});
