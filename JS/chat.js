import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { interestLabel } from "./interest.js";

const chatId = new URLSearchParams(window.location.search).get("id");

const partnerName = document.getElementById("partnerName");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const errorMsg = document.getElementById("errorMsg");

let currentUser = null;
let chat = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login.html"; // sesuaikan dengan lokasi login.html
    return;
  }
  currentUser = user;

  if (!chatId) {
    showError("Chat tidak ditemukan.");
    return;
  }
  await openChat();
});

async function openChat() {
  try {
    const snap = await getDoc(doc(db, "chats", chatId));
    if (!snap.exists()) throw new Error("not-found");
    chat = snap.data();
    if (!chat.members.includes(currentUser.uid)) throw new Error("not-member");
  } catch (err) {
    console.error(err);
    partnerName.textContent = "-";
    showError("Chat tidak ditemukan atau kamu tidak punya akses.");
    return;
  }

  const myIndex = chat.members.indexOf(currentUser.uid);
  partnerName.textContent = chat.aliases[1 - myIndex];
  chatForm.hidden = false;
  listenMessages();
}

// Greeting otomatis (dibuat di halaman, tidak disimpan di database)
function buildGreeting() {
  const div = document.createElement("div");
  div.className = "system-msg";
  const hobbies = chat.sharedInterests.map(interestLabel).join(", ");
  div.textContent = `Halo! Kita punya hobi yang cocok yaitu ${hobbies}. Yuk mulai ngobrol!`;
  return div;
}

// Pakai textContent (bukan innerHTML) supaya pesan tidak bisa menyisipkan kode
function buildBubble(msg) {
  const bubble = document.createElement("div");
  bubble.className =
    "bubble " + (msg.senderUid === currentUser.uid ? "mine" : "theirs");

  const text = document.createElement("p");
  text.textContent = msg.text;

  const time = document.createElement("span");
  time.className = "time";
  if (msg.createdAt) {
    time.textContent = msg.createdAt
      .toDate()
      .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  bubble.append(text, time);
  return bubble;
}

function listenMessages() {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc"),
  );

  onSnapshot(
    q,
    (snap) => {
      messagesEl.innerHTML = "";
      messagesEl.appendChild(buildGreeting());
      snap.forEach((d) => {
        const msg = d.data({ serverTimestamps: "estimate" });
        messagesEl.appendChild(buildBubble(msg));
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    },
    (err) => {
      console.error(err);
      showError("Gagal memuat pesan: " + err.message);
    },
  );
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  errorMsg.textContent = "";

  try {
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderUid: currentUser.uid,
      text: text.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    messageInput.value = text; // kembalikan teks supaya tidak hilang
    showError("Pesan gagal terkirim: " + err.message);
  }
});

function showError(text) {
  errorMsg.textContent = text;
}
