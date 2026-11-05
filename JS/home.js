import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { interestLabel } from "./interest.js";

// ====== ELEMEN HTML ======
const $ = (id) => document.getElementById(id); // singkatan untuk getElementById

const aliasText = $("aliasText");
const logoutBtn = $("logoutBtn");
const menuChat = $("menuChat");
const menuMatch = $("menuMatch");
const toast = $("toast");

const friendList = $("friendList");
const emptyState = $("emptyState");
const searchInput = $("searchInput");

const viewEmpty = $("viewEmpty");
const viewChat = $("viewChat");
const viewMatch = $("viewMatch");

const chatPartner = $("chatPartner");
const chatMessages = $("chatMessages");
const chatError = $("chatError");
const chatForm = $("chatForm");
const messageInput = $("messageInput");

const myInterestsBox = $("myInterests");
const idleBox = $("idleBox");
const searchingBox = $("searchingBox");
const resultBox = $("resultBox");
const findBtn = $("findBtn");
const cancelBtn = $("cancelBtn");
const waitNotice = $("waitNotice");
const partnerAlias = $("partnerAlias");
const sharedText = $("sharedText");
const sharedChips = $("sharedChips");
const openChatBtn = $("openChatBtn");
const searchAgainBtn = $("searchAgainBtn");
const matchMessage = $("matchMessage");

// ====== DATA YANG DISIMPAN SELAMA HALAMAN TERBUKA ======
const NOTICE_DELAY = 10000; // notifikasi "belum ada yang cocok" muncul setelah 10 detik

let currentUser = null;
let myAlias = null;
let myInterests = [];

let friends = []; // semua chat milik user ini
let friendIds = new Set(); // uid semua teman (supaya tidak dicocokkan dua kali)
let currentChat = null; // chat yang sedang terbuka
let unsubscribeMessages = null;
let lastMatchedChatId = null;

let searching = false;
let pollTimer = null;
let unsubscribeWait = null;
let noticeTimer = null;
let toastTimer = null;

// ====== TAMPILAN ======
function showToast(text, isError = false) {
  toast.textContent = text;
  toast.className = "toast" + (isError ? " error" : "");
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}

// Ganti isi panel kanan: "empty", "chat", atau "match"
function showMain(name) {
  viewEmpty.hidden = name !== "empty";
  viewChat.hidden = name !== "chat";
  viewMatch.hidden = name !== "match";
  menuChat.classList.toggle("active", name !== "match");
  menuMatch.classList.toggle("active", name === "match");
}

// Ganti bagian di dalam halaman Cari Teman: "idle", "searching", atau "result"
function showMatchBox(name) {
  idleBox.hidden = name !== "idle";
  searchingBox.hidden = name !== "searching";
  resultBox.hidden = name !== "result";
}

// Pakai textContent (bukan innerHTML) karena hobi "Lainnya" diketik user
function addTags(container, ids) {
  container.innerHTML = "";
  ids.forEach((id) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = interestLabel(id);
    container.appendChild(span);
  });
}

// ====== LOGIN & PROFIL ======
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }
  currentUser = user;

  try {
    const profileOk = await loadProfile();
    if (!profileOk) return;
    await cleanupLeftover();
    await loadFriends();
    showMain("empty");
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat data: " + err.message, true);
  }
});

async function loadProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const data = snap.exists() ? snap.data() : null;

  // Profil belum diisi -> ke halaman profil dulu
  if (!data || !data.alias) {
    window.location.href = "../profile.html";
    return false;
  }

  myAlias = data.alias;
  myInterests = [...(data.interests || []), ...(data.customInterests || [])];
  aliasText.textContent = myAlias;
  addTags(myInterestsBox, myInterests);

  if (myInterests.length === 0) {
    findBtn.disabled = true;
    matchMessage.style.color = "#333";
    matchMessage.innerHTML =
      'Pilih hobi dulu di <a href="../profile.html">Profil Saya</a> ya.';
  }
  return true;
}

// Sisa antrean dari sesi sebelumnya (kalau tab sempat ditutup saat mencari).
// Kalau sempat dicocokkan, chat-nya tetap ada di daftar teman.
async function cleanupLeftover() {
  try {
    await deleteDoc(doc(db, "waiting", currentUser.uid));
  } catch (err) {
    console.error(err);
  }
}

// ====== DAFTAR TEMAN ======
const timeOf = (chat) => (chat.createdAt ? chat.createdAt.toMillis() : 0);

function partnerAliasOf(chat) {
  const myIndex = chat.members.indexOf(currentUser.uid);
  return chat.aliases[1 - myIndex];
}

async function loadFriends() {
  const snap = await getDocs(
    query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid),
    ),
  );

  friends = [];
  friendIds = new Set();
  snap.forEach((d) => {
    const chat = { id: d.id, ...d.data() };
    friends.push(chat);
    chat.members.forEach((m) => {
      if (m !== currentUser.uid) friendIds.add(m);
    });
  });

  friends.sort((a, b) => timeOf(b) - timeOf(a)); // teman terbaru di atas
  renderFriends();
}

function renderFriends() {
  const keyword = searchInput.value.trim().toLowerCase();
  const shown = friends.filter((c) =>
    partnerAliasOf(c).toLowerCase().includes(keyword),
  );

  friendList.innerHTML = "";
  emptyState.hidden = friends.length > 0;
  shown.forEach((chat) => friendList.appendChild(buildFriendItem(chat)));
}
searchInput.addEventListener("input", renderFriends);

function buildFriendItem(chat) {
  const item = document.createElement("div");
  item.className = "friend";
  if (currentChat && currentChat.id === chat.id) item.classList.add("active");

  const avatar = document.createElement("div");
  avatar.className = "friend-avatar";
  avatar.innerHTML =
    '<img src="../../Gambar/blank profile.jpeg" alt="Avatar Teman" />'; // bisa diganti dengan avatar teman kalau ada

  const info = document.createElement("div");
  info.className = "friend-info";

  const name = document.createElement("strong");
  name.textContent = partnerAliasOf(chat);

  const hobbies = document.createElement("small");
  hobbies.textContent =
    "Hobi sama: " + chat.sharedInterests.map(interestLabel).join(", ");

  info.append(name, hobbies);
  item.append(avatar, info);
  item.addEventListener("click", () => openChat(chat.id));
  return item;
}

// ====== CHAT ======
function openChat(chatId) {
  const chat = friends.find((c) => c.id === chatId);
  if (!chat) return;

  currentChat = chat;
  chatPartner.textContent = partnerAliasOf(chat);
  chatError.textContent = "";
  messageInput.value = "";

  renderFriends(); // supaya teman yang dipilih ter-highlight
  showMain("chat");
  listenMessages();
  messageInput.focus();
}

// Pesan sapaan otomatis (dibuat di halaman, tidak disimpan di database)
function buildGreeting() {
  const div = document.createElement("div");
  div.className = "system-msg";
  const hobbies = currentChat.sharedInterests.map(interestLabel).join(", ");
  div.textContent = `Halo! Kita punya hobi yang cocok yaitu ${hobbies}. Yuk mulai ngobrol!`;
  return div;
}

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
  if (unsubscribeMessages) unsubscribeMessages(); // berhenti mendengarkan chat sebelumnya
  chatMessages.innerHTML = "";

  const chatId = currentChat.id;
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc"),
  );

  unsubscribeMessages = onSnapshot(
    q,
    (snap) => {
      if (!currentChat || currentChat.id !== chatId) return;

      chatMessages.innerHTML = "";
      chatMessages.appendChild(buildGreeting());
      snap.forEach((d) => {
        const msg = d.data({ serverTimestamps: "estimate" });
        chatMessages.appendChild(buildBubble(msg));
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    (err) => {
      console.error(err);
      chatError.textContent = "Gagal memuat pesan: " + err.message;
    },
  );
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentChat) return;

  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  chatError.textContent = "";

  try {
    await addDoc(collection(db, "chats", currentChat.id, "messages"), {
      senderUid: currentUser.uid,
      text: text.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    messageInput.value = text; // kembalikan teks supaya tidak hilang
    chatError.textContent = "Pesan gagal terkirim: " + err.message;
  }
});

// ====== PENCOCOKAN ======
async function tryMatch() {
  const snap = await getDocs(
    query(
      collection(db, "waiting"),
      where("interests", "array-contains-any", myInterests.slice(0, 30)),
    ),
  );

  const now = Date.now();
  const candidates = [];

  snap.forEach((d) => {
    if (d.id === currentUser.uid) return; // bukan diri sendiri
    if (friendIds.has(d.id)) return; // sudah jadi teman
    const data = d.data();
    if (data.matchedChatId) return; // sudah dapat pasangan
    const seen = data.lastSeen ? data.lastSeen.toMillis() : now;
    if (now - seen > 60000) return; // sudah lama tidak aktif

    const shared = data.interests.filter((i) => myInterests.includes(i));
    candidates.push({
      uid: d.id,
      alias: data.alias,
      shared,
      rand: Math.random(),
    });
  });

  // Paling banyak hobi sama dulu (3, 2, 1). Kalau sama, urutannya acak.
  candidates.sort(
    (a, b) => b.shared.length - a.shared.length || a.rand - b.rand,
  );

  for (const c of candidates) {
    const chatId = await claim(c);
    if (chatId) return chatId;
  }
  return null;
}

// "Ambil" satu orang dari antrean. Pakai transaction supaya
// satu orang tidak bisa diambil dua kali pada waktu yang sama.
async function claim(c) {
  const chatRef = doc(collection(db, "chats"));
  const theirRef = doc(db, "waiting", c.uid);
  const myRef = doc(db, "waiting", currentUser.uid);

  try {
    return await runTransaction(db, async (tx) => {
      const theirSnap = await tx.get(theirRef);
      const mySnap = await tx.get(myRef);

      if (!theirSnap.exists() || theirSnap.data().matchedChatId) return null;
      if (mySnap.exists() && mySnap.data().matchedChatId) return null;

      tx.set(chatRef, {
        members: [currentUser.uid, c.uid],
        aliases: [myAlias, c.alias],
        sharedInterests: c.shared,
        createdAt: serverTimestamp(),
      });
      tx.update(theirRef, { matchedChatId: chatRef.id });
      if (mySnap.exists()) tx.update(myRef, { matchedChatId: chatRef.id });

      return chatRef.id;
    });
  } catch (err) {
    console.error("Gagal claim:", err);
    matchMessage.style.color = "red";
    matchMessage.textContent = "Gagal mencocokkan: " + err.message;
    return null;
  }
}

async function startSearch() {
  searching = true;
  matchMessage.textContent = "";
  showMatchBox("searching");

  waitNotice.hidden = true;
  noticeTimer = setTimeout(() => {
    if (searching) waitNotice.hidden = false;
  }, NOTICE_DELAY);

  try {
    // 1. Coba langsung cocokkan dengan yang sudah menunggu
    const chatId = await tryMatch();
    if (chatId) {
      await onMatched(chatId);
      return;
    }

    // 2. Tidak ada yang cocok -> masuk antrean
    const myRef = doc(db, "waiting", currentUser.uid);
    await setDoc(myRef, {
      uid: currentUser.uid,
      alias: myAlias,
      interests: myInterests,
      matchedChatId: null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });

    // 3. Kalau ada orang lain yang mencocokkan kita, kita langsung tahu
    unsubscribeWait = onSnapshot(myRef, (snap) => {
      if (snap.exists() && snap.data().matchedChatId) {
        onMatched(snap.data().matchedChatId);
      }
    });

    // 4. Tiap 8 detik: tandai masih aktif + coba cari lagi
    pollTimer = setInterval(async () => {
      if (!searching) return;
      try {
        await updateDoc(myRef, { lastSeen: serverTimestamp() });
        const id = await tryMatch();
        if (id) await onMatched(id);
      } catch (err) {
        console.error(err);
      }
    }, 8000);
  } catch (err) {
    console.error(err);
    searching = false;
    stopSearchTimers();
    showMatchBox("idle");
    matchMessage.style.color = "red";
    matchMessage.textContent = "Gagal mencari: " + err.message;
  }
}

function stopSearchTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (unsubscribeWait) unsubscribeWait();
  if (noticeTimer) clearTimeout(noticeTimer);
  pollTimer = null;
  unsubscribeWait = null;
  noticeTimer = null;
  waitNotice.hidden = true;
}

async function onMatched(chatId) {
  if (!searching) return; // sudah diproses
  searching = false;
  stopSearchTimers();
  lastMatchedChatId = chatId;

  try {
    await loadFriends(); // daftar teman otomatis bertambah

    const chat = friends.find((c) => c.id === chatId);
    if (chat) {
      partnerAlias.textContent = partnerAliasOf(chat);
      sharedText.textContent = `Kalian punya ${chat.sharedInterests.length} hobi yang sama:`;
      addTags(sharedChips, chat.sharedInterests);
      if (viewMatch.hidden) {
        showToast("Kamu dapat teman baru: " + partnerAliasOf(chat) + " 🎉");
      }
    }
    showMatchBox("result");

    await deleteDoc(doc(db, "waiting", currentUser.uid)); // keluar dari antrean
  } catch (err) {
    console.error(err);
    showToast("Terjadi masalah: " + err.message, true);
  }
}

// ====== TOMBOL & MENU ======
menuChat.addEventListener("click", () =>
  showMain(currentChat ? "chat" : "empty"),
);
menuMatch.addEventListener("click", () => showMain("match"));

findBtn.addEventListener("click", startSearch);

cancelBtn.addEventListener("click", async () => {
  searching = false;
  stopSearchTimers();
  try {
    await deleteDoc(doc(db, "waiting", currentUser.uid));
  } catch (err) {
    console.error(err);
  }
  showMatchBox("idle");
});

openChatBtn.addEventListener("click", () => {
  if (lastMatchedChatId) openChat(lastMatchedChatId);
  showMatchBox("idle");
});

searchAgainBtn.addEventListener("click", () => showMatchBox("idle"));

logoutBtn.addEventListener("click", async () => {
  await signOut(auth); // setelah ini onAuthStateChanged mengarahkan ke login
});

// Usaha terbaik: keluar dari antrean kalau tab ditutup
window.addEventListener("beforeunload", () => {
  if (searching && currentUser) {
    deleteDoc(doc(db, "waiting", currentUser.uid));
  }
});
