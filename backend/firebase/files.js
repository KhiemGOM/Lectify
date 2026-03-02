import { collection, addDoc } from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from './fireBaseHelper.js';

export async function addFiles(userId, file) {
  const docRef = await addDoc(collection(db, 'files'), {
    user_id: userId,
    filename: file.filename,
    slides: file.slides,
  });
}

export async function getFiles(userId) {
  const q = query(collection(db, 'files'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.exists()) {
    return querySnapshot;
  } else {
    throw new Error('Could not find record.');
  }
}

