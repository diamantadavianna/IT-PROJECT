import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2ebT051AvRSELCp-j3k23yziMKPRFrAk",
  authDomain: "it-project-2becd.firebaseapp.com",
  projectId: "it-project-2becd",
  storageBucket: "it-project-2becd.firebasestorage.app",
  messagingSenderId: "113493120104",
  appId: "1:113493120104:web:0c12cf14774f7998afd7dd",
  measurementId: "G-GP6JJ3HKNS",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const INTEREST_OPTIONS = [
  { id: "Musik", label: "Main musik" },
  { id: "menyanyi", label: "Menyanyi" },
  { id: "menggambar", label: "Menggambar" },
  { id: "menulis", label: "Menulis" },
  { id: "membaca", label: "Membaca buku" },
  { id: "belajar", label: "Belajar" },
  { id: "fotografi", label: "Fotografi" },
  { id: "basket", label: "Basket" },
  { id: "sepakbola", label: "Futsal" },
  { id: "badminton", label: "Badminton" },
  { id: "voli", label: "Voli" },
  { id: "floorball", label: "Floorball" },
  { id: "padel", label: "Padel" },
  { id: "renang", label: "Renang" },
  { id: "gaming", label: "Gaming" },
  { id: "coding", label: "Coding" },
  { id: "robotik", label: "Robotik" },
  { id: "desain", label: "Desain grafis" },
  { id: "film", label: "Menonton film" },
  { id: "memasak", label: "Memasak" },
  { id: "traveling", label: "Traveling" },
  { id: "dance", label: "Dance" },
];

const form = document.getElementById("profileForm");
const message = document.getElementById("message");
const saveBtn = document.getElementById("saveBtn");
const avatar = document.getElementById("avatar");
const nameInput = document.getElementById("displayName");
const interestList = document.getElementById("interestList");
const otherCheck = document.getElementById("otherCheck");
const otherBox = document.getElementById("otherBox");
const otherInput = document.getElementById("otherInput");

let currentUser = null;
let currentAlias = null;

function generateAlias() {
  const animals = [
    "Kucing",
    "Elang",
    "Panda",
    "Rubah",
    "Kelinci",
    "Harimau",
    "Lumba-lumba",
  ];
  const traits = [
    "Ceria",
    "Misterius",
    "Kreatif",
    "Santai",
    "Berani",
    "Lincah",
    "Tenang",
  ];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${pick(animals)} ${pick(traits)} #${num}`;
}

function renderInterests() {
  INTEREST_OPTIONS.forEach((opt) => {
    const label = document.createElement("label");
    label.className = "chip";
    label.innerHTML = `<input type="checkbox" value="${opt.id}"><span>${opt.label}</span>`;
    interestList.appendChild(label);
  });
}
renderInterests();

otherCheck.addEventListener("change", () => {
  otherBox.hidden = !otherCheck.checked;
  if (otherCheck.checked) otherInput.focus();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../HTML/login.html";
    return;
  }
  currentUser = user;
  await loadProfile();
});

async function loadProfile() {
  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    currentAlias = data.alias || null;
    nameInput.value = data.displayName || "";
    document.getElementById("age").value = data.age || "";
    document.getElementById("city").value = data.city || "";
    document.getElementById("bio").value = data.bio || "";

    // Gender
    if (data.gender) {
      const genderRadio = document.querySelector(
        `input[name="gender"][value="${data.gender}"]`,
      );
      if (genderRadio) genderRadio.checked = true;
    }

    (data.interests || []).forEach((id) => {
      const cb = interestList.querySelector(`input[value="${id}"]`);
      if (cb) cb.checked = true;
    });

    if (data.customInterests && data.customInterests.length > 0) {
      otherCheck.checked = true;
      otherBox.hidden = false;
      otherInput.value = data.customInterests.join(", ");
    }
  }
  updateAvatar();
}

function updateAvatar() {
  const name = nameInput.value.trim();
  avatar.textContent = name ? name[0].toUpperCase() : "?";
}
nameInput.addEventListener("input", updateAvatar);

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const interests = [...interestList.querySelectorAll("input:checked")].map(
    (cb) => cb.value,
  );

  let customInterests = [];
  if (otherCheck.checked) {
    customInterests = otherInput.value
      .split(",")
      .map((i) => i.trim().toLowerCase().slice(0, 20))
      .filter((i) => i !== "")
      .slice(0, 3);
  }

  if (interests.length + customInterests.length === 0) {
    message.style.color = "red";
    message.textContent = "Pilih minimal 1 hobi ya!";
    return;
  }

  const selectedGender = document.querySelector('input[name="gender"]:checked');

  saveBtn.disabled = true;
  message.style.color = "#333";
  message.textContent = "Menyimpan...";

  try {
    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        displayName: nameInput.value.trim(),
        gender: selectedGender ? selectedGender.value : null,
        age: Number(document.getElementById("age").value) || null,
        city: document.getElementById("city").value.trim(),
        bio: document.getElementById("bio").value.trim(),
        interests: interests,
        customInterests: customInterests,
        alias: currentAlias || (currentAlias = generateAlias()),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    message.style.color = "green";
    message.textContent = "Profil berhasil disimpan! ✅";
  } catch (err) {
    console.error(err);
    message.style.color = "red";
    message.textContent = "Gagal menyimpan: " + err.message;
  }
  saveBtn.disabled = false;
});
