// Connexion à Firebase. La configuration web est publique par nature : la sécurité repose sur firestore.rules.
// En mode démo (npm run dev:demo), tout passe par les émulateurs locaux : le vrai projet n'est jamais touché.
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export const usingEmulators = import.meta.env.VITE_FIREBASE_EMULATORS === "1";

const production = {
  apiKey: "AIzaSyCwod_P_0-6km-4SFbHRjrvmwlsxKY4WKU",
  authDomain: "taekwondo-score-app.firebaseapp.com",
  projectId: "taekwondo-score-app",
  storageBucket: "taekwondo-score-app.firebasestorage.app",
  messagingSenderId: "737996284937",
  appId: "1:737996284937:web:efb8170c37ed5f260d84d8",
};
const demo = { apiKey: "demo-key", authDomain: "demo-taekwondo-score.firebaseapp.com", projectId: "demo-taekwondo-score" };

const app = initializeApp(usingEmulators ? demo : production);
export const auth = getAuth(app);
export const db = getFirestore(app);
auth.languageCode = "fr";

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
