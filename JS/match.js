import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { interestLabel } from "./interest.js";

const aliasText = document.getElementById("aliasText");
const myInterestsBox = document.getElementById("myInterests");
const idleBox = document.getElementById("idleBox");
const searchingBox = document.getElementById("searchingBox");
const resultBox = document.getElementById("resultBox");
const findBtn = document.getElementById("findBtn");
const cancelBtn = document.getElementById("cancelBtn");
const partnerAlias = document.getElementById("partnerAlias");
const sharedText = document.getElementById("sharedText");
const sharedChips = document.getElementById("sharedChips");
const chatLink = document.getElementById("chatLink");
const message = document.getElementById("message");

let currentUser = null;
let myAlias = null;
let myInterests = [];
let searching = false;
let pollTimer = null;
let unsubscribeWait = null;

// ====== TAMPILAN ======
function showBox(name) {
  idleBox.hidden = name !== "idle";
  searchingBox.hidden = name !== "searching";
  resultBox.hidden = name !== "result";
}

// Pakai textContent (bukan innerHTML) karena hobi "Lainnya" diketik user lain.
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
    window.location.href = "../HTML/login.html";
    return;
  }
  currentUser = user;
  await loadMyProfile();
});

async function loadMyProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const data = snap.exists() ? snap.data() : null;

  myInterests = data
    ? [...(data.interests || []), ...(data.customInterests || [])]
    : [];
  myAlias = data ? data.alias : null;

  if (!myAlias || myInterests.length === 0) {
    aliasText.textContent = "Profilmu belum lengkap";
    message.innerHTML =
      'Isi dan simpan profil dulu ya → <a href="../HTML/profile.html">Isi profil</a>';
    findBtn.disabled = true;
    return;
  }

  aliasText.textContent = myAlias;
  addTags(myInterestsBox, myInterests);
  await checkLeftover();
}

// Kalau tab sempat ditutup saat menunggu, cek apakah ternyata sudah dicocokkan
async function checkLeftover() {
  const ref = doc(db, "waiting", currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const chatId = snap.data().matchedChatId;
  if (chatId) {
    searching = true;
    await onMatched(chatId);
  } else {
    await deleteDoc(ref); // sisa antrean lama
  }
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
    if (d.id === currentUser.uid) return; // bukan diri sendiri
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
    console.error(err);
    return null;
  }
}

async function startSearch() {
  searching = true;
  message.textContent = "";
  showBox("searching");

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
    showBox("idle");
    message.style.color = "red";
    message.textContent = "Gagal mencari: " + err.message;
  }
}

function stopSearchTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (unsubscribeWait) unsubscribeWait();
  pollTimer = null;
  unsubscribeWait = null;
}

async function onMatched(chatId) {
  if (!searching) return; // sudah diproses
  searching = false;
  stopSearchTimers();

  await showMatch(chatId);
  await deleteDoc(doc(db, "waiting", currentUser.uid)); // keluar dari antrean
}

async function showMatch(chatId) {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return;

  const chat = snap.data();
  const myIndex = chat.members.indexOf(currentUser.uid);

  partnerAlias.textContent = chat.aliases[1 - myIndex];
  sharedText.textContent = `Kalian punya ${chat.sharedInterests.length} hobi yang sama:`;
  addTags(sharedChips, chat.sharedInterests);
  chatLink.href = `chat.html?id=${chatId}`;
  showBox("result");
}

// ====== TOMBOL ======
findBtn.addEventListener("click", startSearch);

cancelBtn.addEventListener("click", async () => {
  searching = false;
  stopSearchTimers();
  try {
    await deleteDoc(doc(db, "waiting", currentUser.uid));
  } catch (err) {
    console.error(err);
  }
  showBox("idle");
});

// Usaha terbaik: keluar dari antrean kalau tab ditutup
window.addEventListener("beforeunload", () => {
  if (searching && currentUser) {
    deleteDoc(doc(db, "waiting", currentUser.uid));
  }
});
