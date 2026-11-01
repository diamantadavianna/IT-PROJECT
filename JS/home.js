import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { interestLabel } from "./interest.js";

const aliasText = document.getElementById("aliasText");
const friendList = document.getElementById("friendList");
const emptyState = document.getElementById("emptyState");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }
  currentUser = user;

  try {
    const profileOk = await loadProfile();
    if (profileOk) await loadFriends();
  } catch (err) {
    console.error(err);
    message.textContent = "Gagal memuat data: " + err.message;
  }
});

// Kalau profil belum diisi, arahkan ke halaman profil dulu
async function loadProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const data = snap.exists() ? snap.data() : null;

  if (!data || !data.alias) {
    window.location.href = "../profile.html";
    return false;
  }
  aliasText.textContent = data.alias;
  return true;
}

async function loadFriends() {
  const snap = await getDocs(
    query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid),
    ),
  );

  const chats = [];
  snap.forEach((d) => chats.push({ id: d.id, ...d.data() }));

  // Teman terbaru di atas
  const time = (c) => (c.createdAt ? c.createdAt.toMillis() : 0);
  chats.sort((a, b) => time(b) - time(a));

  friendList.innerHTML = "";
  emptyState.hidden = chats.length > 0;
  chats.forEach((chat) => friendList.appendChild(buildFriendCard(chat)));
}

// Pakai textContent supaya teks dari database tidak dibaca sebagai kode HTML
function buildFriendCard(chat) {
  const myIndex = chat.members.indexOf(currentUser.uid);

  const card = document.createElement("a");
  card.className = "friend";
  card.href = `chat.html?id=${chat.id}`;

  const avatar = document.createElement("div");
  avatar.className = "friend-avatar";
  avatar.textContent = "🙂";

  const info = document.createElement("div");
  info.className = "friend-info";

  const name = document.createElement("strong");
  name.textContent = chat.aliases[1 - myIndex];

  const hobbies = document.createElement("small");
  hobbies.textContent =
    "Hobi sama: " + chat.sharedInterests.map(interestLabel).join(", ");

  info.append(name, hobbies);
  card.append(avatar, info);
  return card;
}

logoutBtn.addEventListener("click", async () => {
  await signOut(auth); // setelah ini onAuthStateChanged otomatis mengarahkan ke login
});
