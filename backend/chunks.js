import { collection, addDoc } from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from './fireBaseHelper.js';

export async function addChunk(userId, filename, chunk) {
  const docRef = await addDoc(collection(db, 'chunks'), {
    filename: filename,
    chunk: chunk,
    user_id: userId,
  });
}

export async function getChunks(userId) {
  const q = query(collection(db, 'chunks'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.exists()) {
    return querySnapshot;
  } else {
    throw new Error('Could not find record.');
  }
}
