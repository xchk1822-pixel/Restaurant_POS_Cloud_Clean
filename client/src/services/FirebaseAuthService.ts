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
}

const getUserCreationApp = (): FirebaseApp => {
  return getApps().find(app => app.name === 'user-creation') || initializeApp(firebaseConfig, 'user-creation');
};

/**
 * 🔥 使用 Firebase Authentication 登录
 */
export const firebaseLogin = async (username: string, password: string): Promise<AppUser> => {
  try {
    // 用户名作为邮箱登录（添加 @restaurant.local 后缀）
    const email = `${username}@restaurant.local`;
    
    console.log('🔐 尝试 Firebase Auth 登录:', username);
    
    // 使用 Firebase Auth 登录
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    console.log('✅ Firebase Auth 登录成功:', firebaseUser.uid);
    
    // 从 Firestore 获取用户详细信息
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    
    if (!userDoc.exists()) {
      throw new Error('用户数据不存在');
    }
    
    const userData = userDoc.data() as AppUser;
    
    return {
      id: firebaseUser.uid,
      username: userData.username,
      name: userData.name,
      role: userData.role,
      storeId: userData.storeId,
      storeName: userData.storeName,
      email: userData.email
    };
  } catch (error: any) {
    console.error('❌ Firebase Auth 登录失败:', error.code, error.message);
    
    // 友好的错误提示
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      throw new Error('用户名或密码错误');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('尝试次数过多，请稍后再试');
    } else {
      throw new Error(`登录失败: ${error.message}`);
    }
  }
};

/**
 * 🔥 使用 Firebase Authentication 登出
 */
export const firebaseLogout = async (): Promise<void> => {
  try {
    await signOut(auth);
    console.log('✅ Firebase Auth 登出成功');
  } catch (error) {
    console.error('❌ Firebase Auth 登出失败:', error);
    throw error;
  }
};

/**
 * 🔥 创建新用户（仅超级管理员可用）
 */
export const createFirebaseUser = async (
  username: string,
  password: string,
  userData: Omit<AppUser, 'id'>
): Promise<AppUser> => {
  try {
    // 用户名作为邮箱
    const email = `${username}@restaurant.local`;
    
    console.log('🔐 创建 Firebase Auth 用户:', username);
    
    // 创建 Firebase Auth 用户
    const userCreationAuth = getAuth(getUserCreationApp());
    const userCredential = await createUserWithEmailAndPassword(userCreationAuth, email, password);
    const firebaseUser = userCredential.user;
    
    // 更新显示名称
    await updateProfile(firebaseUser, {
      displayName: userData.name
    });
    
    // 保存用户详细信息到 Firestore
    const appUser: AppUser = {
      id: firebaseUser.uid,
      username,
      name: userData.name,
      role: userData.role,
      storeId: userData.storeId,
      storeName: userData.storeName,
      email
    };
    
    await setDoc(doc(db, 'users', firebaseUser.uid), appUser);
    
    console.log('✅ Firebase Auth 用户创建成功:', firebaseUser.uid);
    
    return appUser;
  } catch (error: any) {
    console.error('❌ 创建 Firebase Auth 用户失败:', error.code, error.message);
    
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('用户名已存在');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('密码强度不足（至少6位）');
    } else {
      throw new Error(`创建用户失败: ${error.message}`);
    }
  }
};

/**
 * 🔥 检查当前 Firebase Auth 状态
 */
export const getCurrentFirebaseUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

/**
 * 🔥 监听认证状态变化
 */
export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return auth.onAuthStateChanged(callback);
};
