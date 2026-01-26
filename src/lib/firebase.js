import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCs_o33GpB1L8Bp9IcrSrq-YgQuvlADaCc",
  authDomain: "flyovahelp-f9331.firebaseapp.com",
  projectId: "flyovahelp-f9331",
  storageBucket: "flyovahelp-f9331.firebasestorage.app",
  messagingSenderId: "1024928654684",
  appId: "1:1024928654684:web:e23cb5f32c11ee2b4c4d99"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); // Used for "Online/Busy" real-time status

export { auth, db, rtdb };