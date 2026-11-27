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
import { joinWaitingList } from "./waiting.js";

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
const menuSettings = $("menuSettings");
const viewSettings = $("viewSettings");
const autoThemeBox = $("autoThemeBox");
const lightStartInput = $("lightStartInput");
const darkStartInput = $("darkStartInput");
const resetThemeBtn = $("resetThemeBtn");
const friendPanel = document.querySelector(".list-panel:not(#communityPanel)");
const communityPanel = $("communityPanel");
const menuCommunity = $("menuCommunity");
const groupViewIds = ["viewGroupEmpty", "viewGroupCreate", "viewGroupChat"];

// ====== DATA YANG DISIMPAN SELAMA HALAMAN TERBUKA ======
let currentUser = null;
let myAlias = null;
let myInterests = [];

let friends = []; // semua chat milik user ini
let friendIds = new Set(); // uid semua teman (supaya tidak dicocokkan dua kali)
let currentChat = null;
let unsubscribeMessages = null;
let unsubscribeChats = null;
let lastChatSeenAt = 0;
let lastMatchedChatId = null;

let searching = false;
let handlingMatch = false;
let toastTimer = null;

// ====== TAMPILAN ======
function showToast(text, isError = false, ms = 4000) {
  toast.textContent = text;
  toast.className = "toast" + (isError ? " error" : "");
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), ms);
}

// Ganti isi panel kanan: "empty", "chat", atau "match"
function showMain(name) {
  // Tutup semua tampilan Komunitas, balik ke daftar teman
  groupViewIds.forEach((id) => ($(id).hidden = true));
  communityPanel.hidden = true;
  friendPanel.hidden = false;
  menuCommunity.classList.remove("active");

  viewEmpty.hidden = name !== "empty";
  viewChat.hidden = name !== "chat";
  viewMatch.hidden = name !== "match";
  viewSettings.hidden = name !== "settings";
  menuChat.classList.toggle("active", name === "empty" || name === "chat");
  menuMatch.classList.toggle("active", name === "match");
  menuSettings.classList.toggle("active", name === "settings");
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
    const data = d.data();
    if (d.id === currentUser.uid) return; // bukan diri sendiri
    if (friendIds.has(d.id)) return; // sudah jadi teman

    const shared = data.interests.filter((i) => myInterests.includes(i));
    if (shared.length === 0) return;

    candidates.push({
      uid: d.id,
      alias: data.alias,
      shared,
      waitingSince: data.createdAt ? data.createdAt.toMillis() : now,
    });
  });

  // Hobi sama terbanyak dulu; kalau sama, yang paling lama menunggu didahulukan
  candidates.sort(
    (a, b) =>
      b.shared.length - a.shared.length || a.waitingSince - b.waitingSince,
  );

  for (const c of candidates) {
    const chatId = await claim(c);
    if (chatId) return chatId;
  }
  return null;
}

// Buat chat dengan orang di waiting list. Orang itu TETAP di waiting list.
// ID chat tetap (uid diurutkan) -> kalau chat-nya sudah ada, rules menolak
// (karena hanya boleh create), jadi tidak mungkin ada chat ganda.
async function claim(c) {
  const chatId = [currentUser.uid, c.uid].sort().join("_");

  try {
    await setDoc(doc(db, "chats", chatId), {
      members: [currentUser.uid, c.uid],
      aliases: [myAlias, c.alias],
      sharedInterests: c.shared,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return chatId;
  } catch (err) {
    console.error("Gagal membuat chat:", err);
    return null;
  }
}

async function startSearch() {
  if (searching) return;
  searching = true;
  matchMessage.textContent = "";
  waitNotice.hidden = true;
  showMatchBox("searching");

  try {
    const chatId = await tryMatch();
    if (chatId) {
      await handleMatched(chatId);
      return;
    }

    // Belum ada yang cocok -> pastikan kita tetap ada di waiting list
    await joinWaitingList(db, currentUser.uid, myAlias, myInterests);
    waitNotice.hidden = false;
  } catch (err) {
    console.error(err);
    showMatchBox("idle");
    matchMessage.style.color = "red";
    matchMessage.textContent = "Gagal mencari: " + err.message;
  } finally {
    searching = false;
  }
}

// Dipanggil baik oleh orang yang mencari, maupun orang yang ditemukan
async function handleMatched(chatId) {
  if (handlingMatch) return;
  handlingMatch = true;
  lastMatchedChatId = chatId;

  try {
    await loadFriends(); // daftar teman otomatis bertambah

    const chat = friends.find((c) => c.id === chatId);
    if (chat) {
      partnerAlias.textContent = partnerAliasOf(chat);
      sharedText.textContent = `Kalian punya ${chat.sharedInterests.length} hobi yang sama:`;
      addTags(sharedChips, chat.sharedInterests);
      showToast(
        "Kamu dapat teman baru: " +
          partnerAliasOf(chat) +
          " 🎉 Cek daftar Teman Chat!",
      );
    }
    showMatchBox("result");
  } catch (err) {
    console.error(err);
    showToast("Terjadi masalah: " + err.message, true);
  } finally {
    handlingMatch = false;
  }
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
    showMain("empty");
    watchChats(); // daftar teman + notifikasi teman baru (realtime)

    // Pastikan user selalu ada di waiting list (termasuk user lama)
    if (myInterests.length > 0) {
      await joinWaitingList(db, currentUser.uid, myAlias, myInterests);
    }
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
  lastChatSeenAt = data.lastChatSeenAt ? data.lastChatSeenAt.toMillis() : 0;
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

// ====== DAFTAR TEMAN ======
const timeOf = (chat) => (chat.createdAt ? chat.createdAt.toMillis() : 0);

function partnerAliasOf(chat) {
  const myIndex = chat.members.indexOf(currentUser.uid);
  return chat.aliases[1 - myIndex];
}

function setFriendsFromSnap(snap) {
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

async function loadFriends() {
  const snap = await getDocs(
    query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid),
    ),
  );
  setFriendsFromSnap(snap);
}

// Dengarkan chat milik kita. Kalau ada chat baru yang dibuat ORANG LAIN
// (yaitu orang lain mencari dan menemukan kita), kasih tahu.
// Ini jalan saat web terbuka, dan juga saat user baru login lagi.
function watchChats() {
  if (unsubscribeChats) unsubscribeChats();

  unsubscribeChats = onSnapshot(
    query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid),
    ),
    (snap) => {
      setFriendsFromSnap(snap);

      let newCount = 0;
      let lastAlias = "";

      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data();

        // abaikan chat lama (tanpa createdBy) dan chat yang kita buat sendiri
        if (!data.createdBy || data.createdBy === currentUser.uid) return;

        const created = data.createdAt ? data.createdAt.toMillis() : Date.now();
        if (created <= lastChatSeenAt) return; // sudah pernah diberi tahu

        newCount++;
        lastAlias = partnerAliasOf(data);
      });

      if (newCount > 0) {
        showToast(
          newCount === 1
            ? `Kamu dapat teman baru: ${lastAlias} 🎉`
            : `Kamu dapat ${newCount} teman baru 🎉`,
          false,
          8000,
        );
        markChatsSeen();
      }
    },
    (err) => console.error(err),
  );
}

// Simpan "terakhir kali user diberi tahu" supaya notifikasi tidak muncul berulang
async function markChatsSeen() {
  lastChatSeenAt = Date.now();
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      lastChatSeenAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
  }
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

// ====== TOMBOL & MENU ======
menuChat.addEventListener("click", () =>
  showMain(currentChat ? "chat" : "empty"),
);
menuMatch.addEventListener("click", () => showMain("match"));

findBtn.addEventListener("click", startSearch);

cancelBtn.addEventListener("click", () => showMatchBox("idle"));

openChatBtn.addEventListener("click", () => {
  if (lastMatchedChatId) openChat(lastMatchedChatId);
  showMatchBox("idle");
});

searchAgainBtn.addEventListener("click", () => showMatchBox("idle"));

// ====== PENGATURAN ======
function renderThemeSettings() {
  const s = window.ThemeSettings.get();
  document.querySelector(`input[name="themeMode"][value="${s.mode}"]`).checked =
    true;
  lightStartInput.value = s.lightStart;
  darkStartInput.value = s.darkStart;
  autoThemeBox.hidden = s.mode !== "auto";
}

document.querySelectorAll('input[name="themeMode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    window.ThemeSettings.set({ mode: radio.value });
    autoThemeBox.hidden = radio.value !== "auto";
  });
});

function onHourChange(input, key) {
  const hour = parseInt(input.value, 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    renderThemeSettings(); // input tidak valid -> kembalikan nilai lama
    return;
  }
  window.ThemeSettings.set({ [key]: hour });
}
lightStartInput.addEventListener("change", () =>
  onHourChange(lightStartInput, "lightStart"),
);
darkStartInput.addEventListener("change", () =>
  onHourChange(darkStartInput, "darkStart"),
);

resetThemeBtn.addEventListener("click", () => {
  window.ThemeSettings.reset();
  renderThemeSettings();
  showToast("Pengaturan tema dikembalikan ke default");
});

menuSettings.addEventListener("click", () => {
  renderThemeSettings();
  showMain("settings");
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth); // setelah ini onAuthStateChanged mengarahkan ke login
});
