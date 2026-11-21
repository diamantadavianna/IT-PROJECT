import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Masukkan user ke waiting list (aman dipanggil berkali-kali)
export async function joinWaitingList(db, uid, alias, interests) {
  const ref = doc(db, "waiting", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Sudah antre -> update hobi saja, createdAt tidak berubah
    await updateDoc(ref, { alias, interests });
    return;
  }

  await setDoc(ref, {
    uid,
    alias,
    interests,
    createdAt: serverTimestamp(),
  });
}
