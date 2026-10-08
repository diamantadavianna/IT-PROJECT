import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const provider = new GoogleAuthProvider();

const googleLoginButton = document.getElementById("google-login-btn");

googleLoginButton.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);

    const user = result.user;

    console.log("Login berhasil!");
    console.log("Nama:", user.displayName);
    console.log("Email:", user.email);
    console.log("UID:", user.uid);

    window.location.href = "home.html";
  } catch (error) {
    console.error(error);
    alert(error.code);
  }
});
