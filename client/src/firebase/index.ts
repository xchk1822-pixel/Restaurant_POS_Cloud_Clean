import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

// Initialize Firebase.
const app = initializeApp(firebaseConfig);

// Keep Firestore itself memory-only. The app's offline durability is handled by
// store-scoped localStorage and the pending sync queue in smartSyncService.
setLogLevel('silent');
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const auth = getAuth(app);

export const storage = getStorage(app);

export default app;
