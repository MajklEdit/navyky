import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut as firebaseSignOut, updateProfile } from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const app = cloudConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export function watchUser(callback) {
  if (!auth) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}
export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase není nakonfigurovaný.");
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error("Google nevrátil přihlašovací token.");
    return (await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))).user;
  }
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}
export async function signInWithEmail(email, password) {
  if (!auth) throw new Error("Firebase není nakonfigurovaný.");
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}
export async function registerWithEmail(name, email, password) {
  if (!auth) throw new Error("Firebase není nakonfigurovaný.");
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const displayName = name.trim() || email.split("@")[0];
  await updateProfile(credential.user, { displayName });
  return credential.user;
}
export async function signOut() {
  if (!auth) return;
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut();
  await firebaseSignOut(auth);
}
export async function loadCloudData(uid) {
  if (!db || !uid) return null;
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}
export async function saveCloudData(uid, data) {
  if (db && uid) await setDoc(doc(db, "users", uid), { ...data, ownerUid: uid, updatedAt: serverTimestamp() }, { merge: true });
}
