import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

let app = null;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("Firebase could not initialize", error);
}

// --- Google Sign-In ---
const button = document.querySelector("[data-auth-button]");
const status = document.querySelector("[data-auth-status]");
if (button) {
  if (!app) {
    button.disabled = true;
    button.title = "Google sign-in is temporarily unavailable";
  } else {
    try {
      const auth = getAuth(app);
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
}

// --- Unique Visitor Counter ---
const counterEl = document.querySelector("[data-visitor-count]");
if (counterEl && app) {
  const STORAGE_KEY = "prism_unique_visit";

  const formatCount = (num) => {
    const padded = String(Math.max(0, Math.floor(num))).padStart(6, "0");
    return `${padded.slice(0, -3)},${padded.slice(-3)}`;
  };

  const animateCount = (target) => {
    const duration = 900;
    const startVal = Math.max(0, Math.floor(target * 0.75));
    const startTime = performance.now();

    const frame = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      counterEl.textContent = formatCount(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  };

  (async () => {
    try {
      const db = getFirestore(app);
      const statsRef = doc(db, "metrics", "visitors");
      const hasVisited = localStorage.getItem(STORAGE_KEY) === "1";

      if (!hasVisited) {
        await setDoc(statsRef, { count: increment(1) }, { merge: true });
        localStorage.setItem(STORAGE_KEY, "1");
      }

      const snap = await getDoc(statsRef);
      const total = snap.exists() ? Number(snap.data().count) || 0 : 0;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            animateCount(total);
            observer.disconnect();
          }
        },
        { threshold: 0.2 }
      );
      observer.observe(counterEl);
    } catch (error) {
      console.error("Visitor counter unavailable", error);
      counterEl.textContent = "------";
    }
  })();
}
