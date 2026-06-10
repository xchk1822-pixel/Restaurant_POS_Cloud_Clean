import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

// 初始化Firebase应用
const app = initializeApp(firebaseConfig);

// 初始化Firestore
export const db = getFirestore(app);

// 初始化Auth
export const auth = getAuth(app);

export const storage = getStorage(app);

// 启用离线持久化（离线同步）
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('多个标签页打开，离线功能可能受限');
    } else if (err.code === 'unimplemented') {
      console.warn('浏览器不支持离线功能');
    }
  });

console.log('✅ Firebase已初始化');

export default app;
