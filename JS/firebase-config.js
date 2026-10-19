import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
export const auth = getAuth(app);
export const db = getFirestore(app);
