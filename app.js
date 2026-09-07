// ===================================================================
// 1) เชื่อม Firebase — ต้องแก้ค่าตรงนี้เป็นของโปรเจกต์ตัวเองก่อนใช้งานจริง
//    วิธีหาไปดูใน README.md หัวข้อ "ตั้งค่า Firebase"
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, onSnapshot,
  query, orderBy, deleteDoc, getDoc,
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
};

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);

// ===================================================================
// 2) State + local storage (จำห้อง/ชื่อไว้ ไม่ต้องพิมพ์ใหม่ทุกครั้ง)
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
// 3) หน้าตั้งค่าห้อง (ครั้งแรกที่เปิด หรือกด "เปลี่ยนห้อง")
// ===================================================================
el("setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const roomId = el("room-code").value.trim();
  const nameA = el("name-a").value.trim() || "คนที่ 1";
  const nameB = el("name-b").value.trim() || "คนที่ 2";
  const who = document.querySelector('.who-choice button.selected')?.dataset.who;

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
// 4) เข้าห้อง: subscribe ข้อมูลห้อง + รายการค่าใช้จ่ายแบบ real-time
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
  el("room-label").textContent = `ห้อง: ${state.roomId} · ${room.nameA} & ${room.nameB}`;

  document.querySelectorAll('[data-name-slot="a"]').forEach((n) => (n.textContent = room.nameA));
  document.querySelectorAll('[data-name-slot="b"]').forEach((n) => (n.textContent = room.nameB));

  const expensesRef = collection(db, "rooms", state.roomId, "expenses");
  const q = query(expensesRef, orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    state.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderExpenses();
    renderBalance();
  });
}

// ===================================================================
// 5) คำนวณยอดค้าง — netA บวก = B ค้าง A, ลบ = A ค้าง B
// ===================================================================
function renderBalance() {
  let netA = 0;
  for (const exp of state.expenses) {
    const amt = Number(exp.amount) || 0;
    const share = exp.split === "full" ? amt : amt / 2;
    netA += exp.paidBy === "a" ? share : -share;
  }

  const balanceEl = el("balance-line");
  const amountEl = el("balance-amount");
  const rounded = Math.round(Math.abs(netA));

  if (rounded === 0) {
    balanceEl.innerHTML = "ตอนนี้เคลียร์กันพอดี";
    amountEl.textContent = "฿0";
    amountEl.className = "balance-amount";
  } else if (netA > 0) {
    balanceEl.innerHTML = `<strong data-name-slot="b">${state.nameB}</strong> ค้าง <strong data-name-slot="a">${state.nameA}</strong>`;
    amountEl.textContent = `฿${rounded.toLocaleString()}`;
    amountEl.className = "balance-amount tone-a";
  } else {
    balanceEl.innerHTML = `<strong data-name-slot="a">${state.nameA}</strong> ค้าง <strong data-name-slot="b">${state.nameB}</strong>`;
    amountEl.textContent = `฿${rounded.toLocaleString()}`;
    amountEl.className = "balance-amount tone-b";
  }
}

// ===================================================================
// 6) แสดงรายการค่าใช้จ่าย
// ===================================================================
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
    const dotColor = exp.paidBy === "a" ? "var(--a)" : "var(--b)";
    const splitLabel = exp.split === "full" ? "ออกให้ทั้งหมด" : "หารครึ่ง";
    const amt = Number(exp.amount) || 0;
    return `
      <div class="entry">
        <span class="who-dot" style="background:${dotColor}"></span>
        <div class="details">
          <div class="title">${escapeHtml(exp.title)}</div>
          <div class="meta">${payerName} จ่าย · ${splitLabel}</div>
        </div>
        <div class="amount">฿${amt.toLocaleString()}</div>
        <button class="delete-btn" data-id="${exp.id}" aria-label="ลบรายการ">×</button>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "rooms", state.roomId, "expenses", btn.dataset.id));
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ===================================================================
// 7) ฟอร์มเพิ่มรายการ (bottom sheet)
// ===================================================================
let pickedWho = null;
let pickedSplit = "50-50";

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

function openSheet() {
  el("add-form").reset();
  pickedWho = state.who; // default: assume you paid
  pickedSplit = "50-50";
  document.querySelectorAll('#add-form .who-choice button').forEach((b) => {
    b.classList.toggle("selected", b.dataset.who === pickedWho);
  });
  document.querySelectorAll('.split-choice button').forEach((b) => {
    b.classList.toggle("selected", b.dataset.split === "50-50");
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
    paidBy: pickedWho,
    split: pickedSplit,
    createdAt: Date.now(),
  });

  closeSheet();
  showToast("บันทึกแล้ว");
});

// ===================================================================
// 8) toast เล็กๆ แจ้งผล
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
// 9) เริ่มโปรแกรม: ถ้ามีห้องจำไว้แล้วให้เข้าห้องเลย ไม่งั้นโชว์หน้าตั้งค่า
// ===================================================================
if (state.roomId && state.who) {
  enterRoom();
}

// ===================================================================
// 10) ลงทะเบียน service worker เพื่อให้ใช้เป็น PWA ได้
// ===================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // ไม่ critical ถ้า register ไม่ได้ (เช่น เปิดจาก file:// ตอน dev)
    });
  });
}
