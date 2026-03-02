import { collection, addDoc } from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { db } from './fireBaseHelper.js';

export async function addPastQuiz(userId, quiz) {
  const docRef = await addDoc(collection(db, 'past_quiz'), {
    user_id: userId,
    answer: quiz.answer,
    options: quiz.options,
    question: quiz.question,
    result: quiz.result,
    user_answer: quiz.user_answer,
  });
}

export async function getPastQuizzes(userId) {
  const q = query(collection(db, 'past_quiz'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.exists()) {
    return querySnapshot;
  } else {
    throw new Error('Could not find record.');
  }
}
