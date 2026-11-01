import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyCPZhYiD_ZQBihBtCm_X5zbXXRE_R-fHcQ',
  authDomain: 'taikan-note.firebaseapp.com',
  projectId: 'taikan-note',
  storageBucket: 'taikan-note.firebasestorage.app',
  messagingSenderId: '202535201439',
  appId: '1:202535201439:web:e181e1ca4dc4582be0d0aa',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
