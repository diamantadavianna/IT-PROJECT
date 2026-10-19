import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { INTEREST_OPTIONS } from "./interest.js";

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
  if (currentStep < totalSteps) {
    nextBtn.click();
    return;
  }

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
    message.textContent = "Profil berhasil disimpan!";
  } catch (err) {
    console.error(err);
    message.style.color = "red";
    message.textContent = "Gagal menyimpan: " + err.message;
  }
  saveBtn.disabled = false;
});

const steps = document.querySelectorAll(".step");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");
const stepLabel = document.getElementById("stepLabel");
const totalSteps = steps.length;
let currentStep = 1;

function showStep(n) {
  currentStep = n;
  steps.forEach((s) =>
    s.classList.toggle("active", Number(s.dataset.step) === n),
  );
  prevBtn.hidden = n === 1;
  nextBtn.hidden = n === totalSteps;
  saveBtn.hidden = n !== totalSteps;
  progressBar.style.width = (n / totalSteps) * 100 + "%";
  stepLabel.textContent = `Langkah ${n} dari ${totalSteps}`;
  message.textContent = "";
}

function validateStep(n) {
  const fields = document.querySelectorAll(
    `.step[data-step="${n}"] input, .step[data-step="${n}"] textarea`,
  );
  for (const f of fields) {
    if (!f.reportValidity()) return false;
  }
  return true;
}

nextBtn.addEventListener("click", () => {
  if (validateStep(currentStep)) showStep(currentStep + 1);
});
prevBtn.addEventListener("click", () => showStep(currentStep - 1));

showStep(1);
