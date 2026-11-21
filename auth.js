import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// Existing Firebase project from the previous site. Firebase client config is
// public by design; access control belongs in Firebase Auth / Security Rules.
const firebaseConfig = {
  apiKey: "AIzaSyCkOPw2UYG7u38ppZu4lwU-zSWJwNUd3mg",
  authDomain: "stemsstats.firebaseapp.com",
  projectId: "stemsstats",
  storageBucket: "stemsstats.firebasestorage.app",
  messagingSenderId: "711924778312",
  appId: "1:711924778312:web:7bb48d3331fa528d97df7d"
};

const button = document.querySelector("[data-auth-button]");
const status = document.querySelector("[data-auth-status]");
if (button) {
  try {
    const auth = getAuth(initializeApp(firebaseConfig));
    const provider = new GoogleAuthProvider();

    button.addEventListener("click", async () => {
      button.disabled = true;
      if (status) status.textContent = "";
      try {
        if (auth.currentUser) {
          await signOut(auth);
        } else {
          await signInWithPopup(auth, provider);
        }
      } catch (error) {
        console.error("Google sign-in failed", error);
        if (status) status.textContent = error?.code === "auth/unauthorized-domain"
          ? "This domain is not authorized for Google sign-in yet."
          : "Sign-in didn’t complete. Please try again.";
      } finally {
        button.disabled = false;
      }
    });

    onAuthStateChanged(auth, user => {
      button.textContent = user
        ? `Sign out · ${user.displayName || user.email || "Google account"}`
        : "Sign in with Google";
      button.setAttribute("aria-label", user ? "Sign out of Google account" : "Sign in with Google");
    });
  } catch (error) {
    console.error("Firebase Auth could not initialize", error);
    button.disabled = true;
    button.title = "Google sign-in is temporarily unavailable";
  }
}
