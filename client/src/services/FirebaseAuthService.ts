import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { firebaseConfig } from '../firebase/config';
import type { AssignedStore, UserRole } from '../contexts/AuthContext';
import { cacheConfiguredRolePermissions } from '../utils/permissions';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  storeId?: string;
  storeName?: string;
  storeIds?: string[];
  assignedStores?: AssignedStore[];
  email?: string;
  status?: 'active' | 'inactive';
}

export const buildFirestoreAppUser = (
  userId: string,
  username: string,
  email: string,
  userData: Omit<AppUser, 'id'>
): AppUser => ({
  id: userId,
  username,
  name: userData.name,
  role: userData.role,
  ...(userData.storeId ? { storeId: userData.storeId } : {}),
  ...(userData.storeName ? { storeName: userData.storeName } : {}),
  ...(Array.isArray(userData.storeIds) ? { storeIds: userData.storeIds } : {}),
  ...(Array.isArray(userData.assignedStores) ? { assignedStores: userData.assignedStores } : {}),
  email,
  status: userData.status || 'active'
});

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

  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const roleDoc = await getDocFromServer(doc(db, 'system_roles', userData.role));
      if (roleDoc.exists()) {
        cacheConfiguredRolePermissions(userData.role, roleDoc.data());
      }
    } catch {
      // Keep the last cached role permissions when the cloud is temporarily unavailable.
    }
  }

  let assignedStores = Array.isArray(userData.assignedStores)
    ? userData.assignedStores.filter(store => store?.id)
    : [];
  const assignedStoreIds = Array.from(new Set(
    [userData.storeId, ...(Array.isArray(userData.storeIds) ? userData.storeIds : [])].filter(Boolean)
  )) as string[];

  const knownStoreIds = new Set(assignedStores.map(store => store.id));
  const missingAssignedStoreIds = assignedStoreIds.filter(storeId => !knownStoreIds.has(storeId));
  if (userData.role === 'multi_store_manager' && missingAssignedStoreIds.length > 0) {
    try {
      const missingStores = await Promise.all(
        missingAssignedStoreIds.map(storeId => getDoc(doc(db, 'stores', storeId)))
      );
      assignedStores = [
        ...assignedStores,
        ...missingStores
          .filter(storeDoc => storeDoc.exists())
          .map(storeDoc => ({ id: storeDoc.id, name: String(storeDoc.data()?.name || storeDoc.id) })),
      ];
    } catch {
      // Existing assigned-store cache remains usable offline.
    }
  }

  return {
    id: firebaseUser.uid,
    username: userData.username,
    name: userData.name,
    role: userData.role,
    storeId: userData.storeId,
    storeName: userData.storeName,
    storeIds: Array.isArray(userData.storeIds) ? userData.storeIds : undefined,
    assignedStores: assignedStores.length > 0 ? assignedStores : undefined,
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
    let firebaseUser: FirebaseUser;
    let createdAuthUser = false;

    try {
      const userCredential = await createUserWithEmailAndPassword(userCreationAuth, email, password);
      firebaseUser = userCredential.user;
      createdAuthUser = true;
    } catch (createError: any) {
      if (createError?.code !== 'auth/email-already-in-use') throw createError;

      const existingCredential = await signInWithEmailAndPassword(userCreationAuth, email, password);
      const existingProfile = await getDoc(doc(db, 'users', existingCredential.user.uid));
      if (existingProfile.exists()) throw createError;
      firebaseUser = existingCredential.user;
    }

    await updateProfile(firebaseUser, {
      displayName: userData.name
    });

    const appUser = buildFirestoreAppUser(firebaseUser.uid, username, email, userData);

    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), appUser);
    } catch (profileError) {
      if (createdAuthUser) {
        try {
          await deleteUser(firebaseUser);
        } catch (cleanupError) {
          console.error('Rollback Firebase Auth user failed:', cleanupError);
        }
      }
      throw profileError;
    }

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
