// ===================================================================
// 1) เชื่อม Firebase — ต้องแก้ค่าตรงนี้เป็นของโปรเจกต์ตัวเองก่อนใช้งานจริง
//    วิธีหาไปดูใน README.md หัวข้อ "ตั้งค่า Firebase"
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, onSnapshot,
  query, orderBy, deleteDoc, updateDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAAy_EwrHSGcQGFtqaffQ3cmrbAeNc0DMw",
    authDomain: "app-hann.firebaseapp.com",
    projectId: "app-hann",
    storageBucket: "app-hann.firebasestorage.app",
    messagingSenderId: "546410969266",
    appId: "1:546410969266:web:e450067079cdbbf0a5f1ab",
    measurementId: "G-GWRLG21LKN"
  };

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);

// ===================================================================
// 2) หมวดหมู่ค่าใช้จ่าย (ไอคอน + สีพื้นหลัง)
// ===================================================================
const CATEGORIES = {
  dining:     { icon: "🍽️", bg: "#FFF1C9" },
  home:       { icon: "🧹", bg: "#DCEAFB" },
  utilities:  { icon: "📶", bg: "#E1F2E8" },
  pets:       { icon: "🐾", bg: "#FBE1E6" },
  shopping:   { icon: "🛍️", bg: "#E7E1FB" },
  other:      { icon: "📦", bg: "#E7ECEA" },
};

// ===================================================================
// 3) State + local storage (จำห้อง/ชื่อไว้ ไม่ต้องพิมพ์ใหม่ทุกครั้ง)
// ===================================================================
let state = {
  roomId: localStorage.getItem("kuhaan_room") || "",
  who: localStorage.getItem("kuhaan_who") || "", // 'a' or 'b'
  nameA: "",
  nameB: "",
  expenses: [],
};

const el = (id) => document.getElementById(id);

// ===================================================================
// 4) แท็บ "เข้าห้องเดิม" / "สร้างห้องใหม่" บนหน้าตั้งค่า
// ===================================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isCreate = btn.dataset.tab === "create";
    el("name-fields").classList.toggle("hidden", !isCreate);
    el("setup-submit").textContent = isCreate ? "สร้างห้อง" : "เข้าห้อง";
    el("setup-note").textContent = isCreate
      ? "ตั้งชื่อทั้งสองคนไว้ก่อน แล้วส่งรหัสห้องนี้ให้แฟนมาเข้าที่แท็บ \"เข้าห้องเดิม\""
      : "กรอกรหัสห้องที่แฟนตั้งไว้ ระบบจะดึงชื่อที่ตั้งไว้ตั้งแต่ตอนสร้างห้องมาให้เอง";
  });
});

// ===================================================================
// 5) หน้าตั้งค่าห้อง
// ===================================================================
el("setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const roomId = el("room-code").value.trim();
  const nameA = el("name-a").value.trim() || "คนที่ 1";
  const nameB = el("name-b").value.trim() || "คนที่ 2";
  const who = document.querySelector('#setup-form .who-choice button.selected')?.dataset.who;

  if (!roomId || !who) {
    showToast("กรอกรหัสห้อง แล้วเลือกว่าใครเป็นใครด้วยนะ");
    return;
  }

  const roomRef = doc(db, "rooms", roomId);
  const existing = await getDoc(roomRef);
  if (!existing.exists()) {
    await setDoc(roomRef, { nameA, nameB });
  }

  localStorage.setItem("kuhaan_room", roomId);
  localStorage.setItem("kuhaan_who", who);
  state.roomId = roomId;
  state.who = who;

  enterRoom();
});

document.querySelectorAll('#setup-form .who-choice button').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('#setup-form .who-choice button').forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

el("change-room-btn").addEventListener("click", () => {
  localStorage.removeItem("kuhaan_room");
  localStorage.removeItem("kuhaan_who");
  location.reload();
});

// ===================================================================
// 6) เข้าห้อง: subscribe ข้อมูลห้อง + รายการค่าใช้จ่ายแบบ real-time
// ===================================================================
async function enterRoom() {
  const roomRef = doc(db, "rooms", state.roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    showToast("ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง");
    return;
  }
  const room = roomSnap.data();
  state.nameA = room.nameA;
  state.nameB = room.nameB;

  el("setup-screen").classList.add("hidden");
  el("app-screen").classList.add("active");
  el("app-subtitle").textContent = `ห้อง: ${state.roomId}`;
  el("month-label").textContent = currentMonthLabel();

  document.querySelectorAll('[data-name-slot="a"]').forEach((n) => (n.textContent = room.nameA));
  document.querySelectorAll('[data-name-slot="b"]').forEach((n) => (n.textContent = room.nameB));

  const expensesRef = collection(db, "rooms", state.roomId, "expenses");
const q = query(expensesRef, orderBy("createdAt", "desc"));

onSnapshot(
  q,
  (snap) => {
    console.log("โหลดรายการ:", snap.docs.length);

    state.expenses = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    console.log("ข้อมูลทั้งหมด", state.expenses);

    renderExpenses();
    renderMonthSummary();
    renderPending();
  },
  (err) => {
    console.error("Firestore Error:", err);
  }
);
}

function currentMonthLabel() {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { month: "long", year: "numeric" }).format(new Date());
}

function inThisMonth(exp) {
  const now = new Date();
  const d = new Date(exp.createdAt);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function shareOf(exp) {
  const amt = Number(exp.amount) || 0;
  return exp.split === "full" ? amt : amt / 2;
}

// ===================================================================
// 7) สรุปยอดเดือนนี้: รวมทั้งหมด + แยกตามคนจ่าย + progress bar
// ===================================================================
function renderMonthSummary() {
  let total = 0;
  let totalA = 0;
  let totalB = 0;

  console.log("state.expenses =", state.expenses);

  for (const exp of state.expenses) {
    const amt = Number(exp.amount) || 0;

    total += amt;

    if (exp.paidBy === "a") {
      totalA += amt;
    } else {
      totalB += amt;
    }
  }

  console.log("รวม =", total);

  el("month-total-amount").textContent =
    `฿${total.toLocaleString()}`;

  el("person-a-total").textContent =
    `฿${totalA.toLocaleString()}`;

  el("person-b-total").textContent =
    `฿${totalB.toLocaleString()}`;

  const pctA = total > 0 ? (totalA / total) * 100 : 0;
  const pctB = total > 0 ? (totalB / total) * 100 : 0;

  el("progress-a").style.width = `${pctA}%`;
  el("progress-b").style.width = `${pctB}%`;
}

// ===================================================================
// 8) การ์ด "ค้างรับ" ต่อคน — นับจากรายการที่ยังไม่ได้กดติ๊กว่าเคลียร์แล้ว
// ===================================================================
function renderPending() {
  let amtA = 0, countA = 0, amtB = 0, countB = 0;
  for (const exp of state.expenses) {
    if (exp.settled) continue;
    const share = shareOf(exp);
    if (exp.paidBy === "a") { amtA += share; countA += 1; }
    else { amtB += share; countB += 1; }
  }

  
  el("pending-a-amount").textContent = `฿${Math.round(amtA).toLocaleString()}`;
  el("pending-a-count").textContent = countA === 0 ? "ไม่มีรายการค้าง" : `${countA} รายการยังไม่เคลียร์`;
  el("pending-b-amount").textContent = `฿${Math.round(amtB).toLocaleString()}`;
  el("pending-b-count").textContent = countB === 0 ? "ไม่มีรายการค้าง" : `${countB} รายการยังไม่เคลียร์`;
}

// ===================================================================
// 9) แสดงรายการค่าใช้จ่าย
// ===================================================================
function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return "วันนี้";
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short" }).format(d);
}

function renderExpenses() {
  const list = el("expense-list");
  const empty = el("empty-state");

  if (state.expenses.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = state.expenses.map((exp) => {
    const payerName = exp.paidBy === "a" ? state.nameA : state.nameB;
    const payerInitial = (payerName || "?").trim().charAt(0).toUpperCase();
    const payerColor = exp.paidBy === "a" ? "var(--a)" : "var(--b)";
    const splitLabel = exp.split === "full" ? "ออกให้ทั้งหมด" : "หารครึ่ง";
    const amt = Number(exp.amount) || 0;
    const cat = CATEGORIES[exp.category] || CATEGORIES.other;
    const settled = !!exp.settled;

    return `
      <div class="entry ${settled ? "settled" : ""}">
        <div class="cat-icon" style="background:${cat.bg}">${cat.icon}</div>
        <div class="details">
          <div class="title">${escapeHtml(exp.title)}</div>
          <div class="meta">
            <span class="payer-avatar" style="background:${payerColor}">${payerInitial}</span>
            ${payerName} · ${splitLabel} · ${formatDate(exp.createdAt)}
          </div>
        </div>
        <div class="amount-col">
          <div class="amount">฿${amt.toLocaleString()}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="settle-btn ${settled ? "done" : ""}" data-id="${exp.id}" data-settled="${settled}" aria-label="ทำเครื่องหมายว่าเคลียร์แล้ว">✓</button>
            <button class="delete-btn" data-id="${exp.id}" aria-label="ลบรายการ">×</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "rooms", state.roomId, "expenses", btn.dataset.id));
    });
  });

  list.querySelectorAll(".settle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nowSettled = btn.dataset.settled === "true";
      await updateDoc(doc(db, "rooms", state.roomId, "expenses", btn.dataset.id), { settled: !nowSettled });
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ===================================================================
// 10) ฟอร์มเพิ่มรายการ (bottom sheet)
// ===================================================================
let pickedWho = null;
let pickedSplit = "50-50";
let pickedCategory = "dining";

el("fab-add").addEventListener("click", () => openSheet());
el("sheet-cancel").addEventListener("click", () => closeSheet());
el("sheet-backdrop").addEventListener("click", (e) => {
  if (e.target === el("sheet-backdrop")) closeSheet();
});

document.querySelectorAll('#add-form .who-choice button').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('#add-form .who-choice button').forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    pickedWho = btn.dataset.who;
  });
});

document.querySelectorAll('.split-choice button').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('.split-choice button').forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    pickedSplit = btn.dataset.split;
  });
});

document.querySelectorAll('#category-choice button').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('#category-choice button').forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    pickedCategory = btn.dataset.category;
  });
});

function openSheet() {
  el("add-form").reset();
  pickedWho = state.who; // default: assume you paid
  pickedSplit = "50-50";
  pickedCategory = "dining";
  document.querySelectorAll('#add-form .who-choice button').forEach((b) => {
    b.classList.toggle("selected", b.dataset.who === pickedWho);
  });
  document.querySelectorAll('.split-choice button').forEach((b) => {
    b.classList.toggle("selected", b.dataset.split === "50-50");
  });
  document.querySelectorAll('#category-choice button').forEach((b) => {
    b.classList.toggle("selected", b.dataset.category === "dining");
  });
  el("sheet-backdrop").classList.add("open");
}

function closeSheet() {
  el("sheet-backdrop").classList.remove("open");
}

el("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = el("expense-title").value.trim();
  const amount = Number(el("expense-amount").value);

  if (!title || !amount || !pickedWho) {
    showToast("กรอกให้ครบก่อนนะ");
    return;
  }

  await addDoc(collection(db, "rooms", state.roomId, "expenses"), {
    title,
    amount,
    category: pickedCategory,
    paidBy: pickedWho,
    split: pickedSplit,
    settled: false,
    createdAt: Date.now(),
  });

  closeSheet();
  showToast("บันทึกแล้ว");
});

// ===================================================================
// 11) toast เล็กๆ แจ้งผล
// ===================================================================
let toastTimer;
function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ===================================================================
// 12) เริ่มโปรแกรม
// ===================================================================
if (state.roomId && state.who) {
  enterRoom();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
