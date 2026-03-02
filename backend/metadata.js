import { collection, addDoc } from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from './fireBaseHelper.js';

export async function addUserMetadata(userId, metadata) {
  const docRef = await addDoc(collection(db, 'user_metadata'), {
    user_id: userId,
    custom_quiz_gen_prompt: metadata.custom_quiz_gen_prompt,
    custom_upload_prompt: metadata.custom_upload_prompt,
  });
}

export async function getUserMetadata(userId) {
  const q = query(
    collection(db, 'user_metadata'),
    where('userId', '==', userId),
  );
  const querySnapshot = await getDocs(q);

  if (querySnapshot.exists()) {
    return querySnapshot;
  } else {
    throw new Error('Could not find record.');
  }
}
