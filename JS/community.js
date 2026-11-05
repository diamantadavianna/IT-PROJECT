import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  arrayRemove,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

// ====== ELEMEN YANG SUDAH ADA DI home.html ======
const friendsPanel = document.querySelector(".list-panel"); // panel teman (yang pertama)
const menuChat = $("menuChat");
const menuMatch = $("menuMatch");
const viewEmpty = $("viewEmpty");
const viewChat = $("viewChat");
const viewMatch = $("viewMatch");
const toast = $("toast");

// ====== ELEMEN BARU ======
const menuCommunity = $("menuCommunity");
const communityPanel = $("communityPanel");
const groupGrid = $("groupGrid");
const groupEmpty = $("groupEmpty");

const viewGroupEmpty = $("viewGroupEmpty");
const viewGroupCreate = $("viewGroupCreate");
const viewGroupChat = $("viewGroupChat");

const createForm = $("createForm");
const groupNameInput = $("groupNameInput");
const pickerList = $("pickerList");
const pickerNote = $("pickerNote");
const createError = $("createError");
const createBtn = $("createBtn");
const cancelCreateBtn = $("cancelCreateBtn");

const groupAvatar = $("groupAvatar");
const groupTitle = $("groupTitle");
const groupMembers = $("groupMembers");
const leaveBtn = $("leaveBtn");
const groupMessages = $("groupMessages");
const groupError = $("groupError");
const groupForm = $("groupForm");
const groupMessageInput = $("groupMessageInput");

// ====== DATA ======
let currentUser = null;
let myAlias = null;
let groups = [];
let currentGroup = null;
let unsubscribeMessages = null;
let pickerAliases = new Map(); // uid teman -> nama samarannya
let toastTimer = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return; // home.js yang mengarahkan ke halaman login
  currentUser = user;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    myAlias = snap.exists() ? snap.data().alias : null;
  } catch (err) {
    console.error(err);
  }
});

// ====== BANTUAN ======
function showToast(text, isError = false) {
  toast.textContent = text;
  toast.className = "toast" + (isError ? " error" : "");
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}

// Huruf pertama nama (aman untuk emoji juga)
function firstLetter(name) {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

const timeOf = (item) => (item.createdAt ? item.createdAt.toMillis() : 0);

// Tampilan di panel kanan: "empty", "create", atau "chat"
function showGroupView(name) {
  viewGroupEmpty.hidden = name !== "empty";
  viewGroupCreate.hidden = name !== "create";
  viewGroupChat.hidden = name !== "chat";
}

function stopListening() {
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = null;
}

// ====== MASUK / KELUAR MODE KOMUNITAS ======
async function openCommunity() {
  if (!currentUser) return;

  friendsPanel.hidden = true;
  communityPanel.hidden = false;
  [viewEmpty, viewChat, viewMatch].forEach((v) => (v.hidden = true));

  menuChat.classList.remove("active");
  menuMatch.classList.remove("active");
  menuCommunity.classList.add("active");

  showGroupView(currentGroup ? "chat" : "empty");
  try {
    await loadGroups();
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat komunitas: " + err.message, true);
  }
}

// Dipanggil saat user klik menu Chat atau Cari Teman Baru.
// Tampilan panel kanan sisanya diatur oleh home.js.
function closeCommunity() {
  communityPanel.hidden = true;
  friendsPanel.hidden = false;
  menuCommunity.classList.remove("active");
  showGroupView("none");
  stopListening();
  currentGroup = null;
}

menuCommunity.addEventListener("click", openCommunity);
menuChat.addEventListener("click", closeCommunity);
menuMatch.addEventListener("click", closeCommunity);

// ====== DAFTAR KOMUNITAS (TOMBOL BULAT) ======
async function loadGroups(newGroupId = null) {
  const snap = await getDocs(
    query(
      collection(db, "groups"),
      where("members", "array-contains", currentUser.uid),
    ),
  );
  groups = [];
  snap.forEach((d) => groups.push({ id: d.id, ...d.data() }));
  groups.sort((a, b) => timeOf(b) - timeOf(a));
  renderGroups(newGroupId);
}

function renderGroups(newGroupId = null) {
  groupGrid.innerHTML = "";

  // Tombol + untuk membuat komunitas baru
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "group-btn add";
  addBtn.innerHTML =
    '<span class="group-circle">+</span><span class="group-label">Buat baru</span>';
  addBtn.addEventListener("click", openCreateForm);
  groupGrid.appendChild(addBtn);

  groups.forEach((group) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-btn";
    if (currentGroup && currentGroup.id === group.id)
      btn.classList.add("active");
    if (group.id === newGroupId) btn.classList.add("new");

    // textContent supaya nama komunitas tidak dibaca sebagai kode HTML
    const circle = document.createElement("span");
    circle.className = "group-circle";
    circle.textContent = firstLetter(group.name);

    const label = document.createElement("span");
    label.className = "group-label";
    label.textContent = group.name;

    btn.append(circle, label);
    btn.addEventListener("click", () => openGroup(group.id));
    groupGrid.appendChild(btn);
  });

  groupEmpty.hidden = groups.length > 0;
}

// ====== BUAT KOMUNITAS ======
async function openCreateForm() {
  stopListening();
  currentGroup = null;
  renderGroups();

  groupNameInput.value = "";
  createError.textContent = "";
  showGroupView("create");

  try {
    await loadFriendPicker();
  } catch (err) {
    console.error(err);
    pickerList.textContent = "";
    createError.textContent = "Gagal memuat teman: " + err.message;
  }
}

async function loadFriendPicker() {
  pickerList.textContent = "Memuat teman...";

  const snap = await getDocs(
    query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid),
    ),
  );

  pickerAliases = new Map();
  snap.forEach((d) => {
    const chat = d.data();
    const otherIndex = 1 - chat.members.indexOf(currentUser.uid);
    pickerAliases.set(chat.members[otherIndex], chat.aliases[otherIndex]);
  });

  pickerList.innerHTML = "";

  if (pickerAliases.size < 2) {
    pickerNote.textContent =
      "Kamu butuh minimal 2 teman untuk membuat komunitas. Cari teman baru dulu ya!";
    createBtn.disabled = true;
    return;
  }

  createBtn.disabled = false;
  pickerAliases.forEach((alias, uid) => {
    const label = document.createElement("label");
    label.className = "picker-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = uid;

    const name = document.createElement("span");
    name.textContent = alias;

    label.append(checkbox, name);
    pickerList.appendChild(label);
  });
  updatePickerCount();
}

function updatePickerCount() {
  const n = pickerList.querySelectorAll("input:checked").length;
  pickerNote.textContent = `Dipilih: ${n} teman (minimal 2)`;
}
pickerList.addEventListener("change", updatePickerCount);

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createError.textContent = "";

  const name = groupNameInput.value.trim();
  const chosen = [...pickerList.querySelectorAll("input:checked")].map(
    (cb) => cb.value,
  );

  if (!name) {
    createError.textContent = "Beri nama komunitas dulu ya.";
    return;
  }
  if (chosen.length < 2) {
    createError.textContent = "Pilih minimal 2 teman.";
    return;
  }
  if (chosen.length > 9) {
    createError.textContent = "Maksimal 9 teman (total 10 anggota).";
    return;
  }

  createBtn.disabled = true;

  // Peta uid -> nama samaran, untuk menampilkan nama pengirim di chat grup
  const aliases = { [currentUser.uid]: myAlias };
  chosen.forEach((uid) => (aliases[uid] = pickerAliases.get(uid)));

  try {
    const ref = await addDoc(collection(db, "groups"), {
      name: name,
      createdBy: currentUser.uid,
      members: [currentUser.uid, ...chosen],
      aliases: aliases,
      createdAt: serverTimestamp(),
    });

    await loadGroups(ref.id); // tombol bulat baru langsung muncul
    showGroupView("empty");
    showToast(`Komunitas "${name}" berhasil dibuat! Klik tombol bulatnya.`);
  } catch (err) {
    console.error(err);
    createError.textContent = "Gagal membuat komunitas: " + err.message;
  }
  createBtn.disabled = false;
});

cancelCreateBtn.addEventListener("click", () => showGroupView("empty"));

// ====== CHAT GRUP ======
function openGroup(groupId) {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;

  currentGroup = group;
  groupAvatar.textContent = firstLetter(group.name);
  groupTitle.textContent = group.name;
  groupMembers.textContent = group.members
    .map((uid) => group.aliases[uid] || "Anggota")
    .join(", ");
  groupError.textContent = "";
  groupMessageInput.value = "";

  renderGroups();
  showGroupView("chat");
  listenGroupMessages();
  groupMessageInput.focus();
}

function buildGroupGreeting() {
  const div = document.createElement("div");
  div.className = "system-msg";
  const creator = currentGroup.aliases[currentGroup.createdBy] || "seseorang";
  div.textContent = `Selamat datang di "${currentGroup.name}"! Komunitas ini dibuat oleh ${creator}. Yuk belajar bareng!`;
  return div;
}

function buildGroupBubble(msg) {
  const mine = msg.senderUid === currentUser.uid;

  const bubble = document.createElement("div");
  bubble.className = "bubble " + (mine ? "mine" : "theirs");

  // Pesan orang lain diberi nama samaran pengirimnya
  if (!mine) {
    const sender = document.createElement("span");
    sender.className = "sender";
    sender.textContent = currentGroup.aliases[msg.senderUid] || "Anggota";
    bubble.appendChild(sender);
  }

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

function listenGroupMessages() {
  stopListening();
  groupMessages.innerHTML = "";

  const groupId = currentGroup.id;
  const q = query(
    collection(db, "groups", groupId, "messages"),
    orderBy("createdAt", "asc"),
  );

  unsubscribeMessages = onSnapshot(
    q,
    (snap) => {
      if (!currentGroup || currentGroup.id !== groupId) return;

      groupMessages.innerHTML = "";
      groupMessages.appendChild(buildGroupGreeting());
      snap.forEach((d) => {
        const msg = d.data({ serverTimestamps: "estimate" });
        groupMessages.appendChild(buildGroupBubble(msg));
      });
      groupMessages.scrollTop = groupMessages.scrollHeight;
    },
    (err) => {
      console.error(err);
      groupError.textContent = "Gagal memuat pesan: " + err.message;
    },
  );
}

groupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentGroup) return;

  const text = groupMessageInput.value.trim();
  if (!text) return;

  groupMessageInput.value = "";
  groupError.textContent = "";

  try {
    await addDoc(collection(db, "groups", currentGroup.id, "messages"), {
      senderUid: currentUser.uid,
      text: text.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    groupMessageInput.value = text; // kembalikan teks supaya tidak hilang
    groupError.textContent = "Pesan gagal terkirim: " + err.message;
  }
});

// ====== KELUAR DARI KOMUNITAS ======
leaveBtn.addEventListener("click", async () => {
  if (!currentGroup) return;
  if (!confirm(`Keluar dari komunitas "${currentGroup.name}"?`)) return;

  try {
    await updateDoc(doc(db, "groups", currentGroup.id), {
      members: arrayRemove(currentUser.uid),
    });
    stopListening();
    currentGroup = null;
    await loadGroups();
    showGroupView("empty");
    showToast("Kamu sudah keluar dari komunitas.");
  } catch (err) {
    console.error(err);
    groupError.textContent = "Gagal keluar: " + err.message;
  }
});
