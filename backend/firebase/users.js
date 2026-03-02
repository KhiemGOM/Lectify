import { collection, addDoc } from 'firebase/firestore';
import { doc, getDoc } from 'firebase/firestore';
import bcrypt from 'bcrypt';
import { db } from './fireBaseHelper.js';

export async function addUser(name, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const docRef = await addDoc(collection(db, 'users'), {
    username: name,
    password: hashedPassword,
  });
  console.log('Document written with ID: ', docRef.id);
}

export async function authenticateUser(userId, password) {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const comparePassword = await bcrypt.compare(
      password,
      docSnap.data().password,
    );
    console.log(comparePassword);
  } else {
    console.log('No such document!');
  }
}

