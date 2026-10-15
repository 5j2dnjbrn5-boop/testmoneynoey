const KEY_V2 = "moneysync.os.v2";
const THEME_KEY = "moneysync.theme.v1";

const CATEGORIES = {
  expense: ['🍚 อาหาร', '🚗 เดินทาง', '🛒 ของใช้', '🎬 ความบันเทิง', '💳 บิล/เน็ต', '🛍️ ช้อปปิ้ง', '🏥 สุขภาพ', '🎁 อื่น ๆ'],
  income: ['💼 เงินเดือน', '📈 ลงทุน/ปันผล', '🏷️ รายได้เสริม', '💵 อื่น ๆ']
};

let store = loadStore();
let chartInstance = null;
let compareChartInstance = null;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(n) || 0);

function loadStore() {
  const v2Raw = localStorage.getItem(KEY_V2);
  if (v2Raw) {
    try { return JSON.parse(v2Raw); } catch (e) { console.error(e); }
  }
  return {
    version: 2,
    wallets: [
      { id: "w_cash", name: "💵 เงินสด" },
      { id: "w_bank", name: "🏦 ธนาคาร" },
      { id: "w_card", name: "💳 บัตรเครดิต" }
    ],
    transactions: [],
    budgets: [],
    goals: []
  };
}

function saveStore() {
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  renderAll();
}

// Smart NLP Add
function parseSmartAdd(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const amount = parseFloat(parts[parts.length - 1]);
  if (isNaN(amount)) return null;

  const title = parts.slice(0, -1).join(" ");
  let type = "expense";
  let category = "🎁 อื่น ๆ";
  let walletId = "w_cash";

  if (/เงินเดือน|โบนัส|ปันผล|ขาย/.test(title)) {
    type = "income";
    category = "💼 เงินเดือน";
    walletId = "w_bank";
  } else if (/ข้าว|ชา|กาแฟ|ก๋วยเตี๋ยว|อาหาร|ชาบู/.test(title)) {
    category = "🍚 อาหาร";
  } else if (/รถ|น้ำมัน|BTS|Grab|แท็กซี่/.test(title)) {
    category = "🚗 เดินทาง";
  } else if (/ค่าเน็ต|ค่าน้ำ|ค่าไฟ|บิล|ค่าห้อง/.test(title)) {
    category = "💳 บิล/เน็ต";
    walletId = "w_bank";
  }

  return {
    id: crypto.randomUUID(),
    type,
    amount,
    title,
    category,
    walletId,
    date: new Date().toISOString().slice(0, 10),
    note: "Smart Quick Add",
    createdAt: Date.now()
  };
}

// Render Dashboard & Chart
function renderDashboard() {
  const now = new Date();
  const thisMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const curTx = store.transactions.filter(r => r.date.startsWith(thisMK));
  const inc = curTx.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const exp = curTx.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  const totalInc = store.transactions.filter(r => r.type === "income").reduce((a, b) => a + b.amount, 0);
  const totalExp = store.transactions.filter(r => r.type === "expense").reduce((a, b) => a + b.amount, 0);

  $("totalBalance").textContent = money(totalInc - totalExp);
  $("incThisMonth").textContent = money(inc);
  $("expThisMonth").textContent = money(exp);

  renderExpenseChart(curTx.filter(r => r.type === "expense"));

  const recent = [...store.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  $("recentTxList").innerHTML = recent.length ? recent.map(txHtml).join("") : `<p class="muted">ยังไม่มีรายการบันทึก</p>`;
}

function renderExpenseChart(expenses) {
  const ctx = $("expenseChart")?.getContext("2d");
  if (!ctx) return;

  const catMap = {};
  expenses.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });

  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['ไม่มีข้อมูล'],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#ec4899'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Prompt' } } } }
    }
  });
}

function txHtml(r) {
  return `
    <div class="tx-item">
      <div class="tx-icon-badge">${r.type === "income" ? "🟢" : "🔴"}</div>
      <div class="tx-details">
        <div class="tx-title-text">${r.title}</div>
        <div class="tx-sub-text">${r.category} • ${r.date}</div>
      </div>
      <div class="tx-val ${r.type}">${r.type === "income" ? "+" : "-"}${money(r.amount)}</div>
    </div>
  `;
}

function renderAll() {
  renderDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
  if ($("date")) $("date").valueAsDate = new Date();

  $("smartAddBtn").addEventListener("click", () => {
    const parsed = parseSmartAdd($("smartInput").value);
    if (parsed) {
      store.transactions.push(parsed);
      saveStore();
      $("smartInput").value = "";
    } else {
      alert("กรุณากรอกเช่น 'ค่าอาหาร 120'");
    }
  });

  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("light");
  });

  renderAll();
});
