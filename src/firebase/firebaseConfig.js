import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAzh7zmmDql6VDyu51dYBTVqU6K-Qox1mM",
  authDomain: "dlwsus.firebaseapp.com",
  projectId: "dlwsus",
  storageBucket: "dlwsus.firebasestorage.app",
  messagingSenderId: "767514192861",
  appId: "1:767514192861:web:da081dd56d5ad769c42434",
  measurementId: "G-6GNFSF0MXS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
