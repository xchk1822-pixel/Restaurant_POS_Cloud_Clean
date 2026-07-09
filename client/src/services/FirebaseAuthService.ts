import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { firebaseConfig } from '../firebase/config';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: 'super_admin' | 'store_manager' | 'cashier' | 'waiter' | 'chef';
  storeId?: string;
  storeName?: string;
  email?: string;
  status?: 'active' | 'inactive';
}

const getUserCreationApp = (): FirebaseApp => {
  return getApps().find(app => app.name === 'user-creation') || initializeApp(firebaseConfig, 'user-creation');
};

export const getFirebaseUserProfile = async (firebaseUser: FirebaseUser): Promise<AppUser> => {
  const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

  if (!userDoc.exists()) {
    throw new Error('用户数据不存在');
  }

  const userData = userDoc.data() as AppUser;

  if (userData.status === 'inactive') {
    throw new Error('账号已停用');
  }

  return {
    id: firebaseUser.uid,
    username: userData.username,
    name: userData.name,
    role: userData.role,
    storeId: userData.storeId,
    storeName: userData.storeName,
    email: userData.email,
    status: userData.status || 'active'
  };
};

export const firebaseLogin = async (username: string, password: string): Promise<AppUser> => {
  try {
    const email = `${username}@restaurant.local`;
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    return await getFirebaseUserProfile(userCredential.user);
  } catch (error: any) {
    console.error('Firebase Auth login failed:', error.code, error.message);

    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      throw new Error('用户名或密码错误');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('尝试次数过多，请稍后再试');
    } else {
      throw new Error(`登录失败: ${error.message}`);
    }
  }
};

export const firebaseLogout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Firebase Auth logout failed:', error);
    throw error;
  }
};

export const createFirebaseUser = async (
  username: string,
  password: string,
  userData: Omit<AppUser, 'id'>
): Promise<AppUser> => {
  try {
    const email = `${username}@restaurant.local`;
    const userCreationAuth = getAuth(getUserCreationApp());
    const userCredential = await createUserWithEmailAndPassword(userCreationAuth, email, password);
    const firebaseUser = userCredential.user;

    await updateProfile(firebaseUser, {
      displayName: userData.name
    });

    const appUser: AppUser = {
      id: firebaseUser.uid,
      username,
      name: userData.name,
      role: userData.role,
      storeId: userData.storeId,
      storeName: userData.storeName,
      email,
      status: userData.status || 'active'
    };

    await setDoc(doc(db, 'users', firebaseUser.uid), appUser);

    return appUser;
  } catch (error: any) {
    console.error('Create Firebase Auth user failed:', error.code, error.message);

    if (error.code === 'auth/email-already-in-use') {
      throw new Error('用户名已存在');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('密码强度不足（至少6位）');
    } else {
      throw new Error(`创建用户失败: ${error.message}`);
    }
  }
};

export const getCurrentFirebaseUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return auth.onAuthStateChanged(callback);
};
