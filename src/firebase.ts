import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAeeqhMTqwDR6BoYBGnLxXVK9evKzWF01g",
  authDomain: "songuess-9b9d7.firebaseapp.com",
  projectId: "songuess-9b9d7",
  storageBucket: "songuess-9b9d7.firebasestorage.app",
  messagingSenderId: "51366666623",
  appId: "1:51366666623:web:f0c726855d4f9f024fba4a",
  measurementId: "G-6BM9B0KN8G"
};

const app = initializeApp(firebaseConfig);

let analytics: any = null;
isSupported().then(supported => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
export const auth = getAuth(app);
export const db = getFirestore(app);

export const signIn = async () => {
  return await signInAnonymously(auth);
};
