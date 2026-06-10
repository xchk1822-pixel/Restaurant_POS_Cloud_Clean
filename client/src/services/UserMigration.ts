/**
 * 🔥 用户数据迁移工具
 * 将 localStorage 中的用户迁移到 Firebase Authentication
 */

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface LegacyUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'super_admin' | 'store_manager' | 'cashier' | 'waiter' | 'chef';
  storeId?: string;
  storeName?: string;
  createdAt?: string;
  status?: 'active' | 'inactive';
}

/**
 * 迁移单个用户到 Firebase Auth
 */
const migrateUser = async (user: LegacyUser): Promise<{ success: boolean; error?: string }> => {
  try {
    // 用户名作为邮箱
    const email = `${user.username}@restaurant.local`;
    
    console.log(`🔄 迁移用户: ${user.username} (${user.name})`);
    
    // 创建 Firebase Auth 用户
    const userCredential = await createUserWithEmailAndPassword(auth, email, user.password);
    const firebaseUser = userCredential.user;
    
    // 保存用户信息到 Firestore（不包含密码）
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      id: firebaseUser.uid,
      username: user.username,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      storeName: user.storeName,
      email: email,
      status: user.status || 'active',
      migratedAt: new Date().toISOString(),
      legacyId: user.id
    });
    
    console.log(`✅ 用户迁移成功: ${user.username} -> ${firebaseUser.uid}`);
    
    return { success: true };
  } catch (error: any) {
    console.error(`❌ 用户迁移失败: ${user.username}`, error.code, error.message);
    
    if (error.code === 'auth/email-already-in-use') {
      console.log(`⚠️ 用户已存在，跳过: ${user.username}`);
      return { success: true }; // 已存在也算成功
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * 迁移所有用户
 */
export const migrateAllUsers = async (): Promise<{
  total: number;
  success: number;
  failed: number;
  errors: Array<{ username: string; error: string }>;
}> => {
  console.log('🚀 开始迁移用户到 Firebase Auth...');
  
  // 从 localStorage 读取用户
  const usersStr = localStorage.getItem('users');
  if (!usersStr) {
    console.warn('⚠️ localStorage 中没有用户数据');
    return { total: 0, success: 0, failed: 0, errors: [] };
  }
  
  const users: LegacyUser[] = JSON.parse(usersStr);
  console.log(`📋 找到 ${users.length} 个用户需要迁移`);
  
  const result = {
    total: users.length,
    success: 0,
    failed: 0,
    errors: [] as Array<{ username: string; error: string }>
  };
  
  // 逐个迁移用户
  for (const user of users) {
    // 跳过 inactive 用户
    if (user.status === 'inactive') {
      console.log(`⏭️ 跳过非活跃用户: ${user.username}`);
      continue;
    }
    
    const migrateResult = await migrateUser(user);
    
    if (migrateResult.success) {
      result.success++;
    } else {
      result.failed++;
      result.errors.push({
        username: user.username,
        error: migrateResult.error || '未知错误'
      });
    }
    
    // 避免速率限制，每个用户间隔 100ms
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('✅ 用户迁移完成:', result);
  
  return result;
};

/**
 * 在浏览器控制台执行迁移
 * 使用方法：
 * 1. 打开浏览器控制台
 * 2. 粘贴以下代码并执行：
 * 
 * import { migrateAllUsers } from './services/UserMigration';
 * migrateAllUsers().then(result => console.log('迁移结果:', result));
 */
