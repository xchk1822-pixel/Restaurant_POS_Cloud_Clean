/**
 * 数据迁移工具
 * 将 localStorage 中的数据迁移到 Firestore
 */

import { migrateFromLocalStorage } from '../services/firestoreService';

/**
 * 执行数据迁移
 */
export const performDataMigration = async () => {
  console.log('🚀 开始数据迁移...');
  
  try {
    await migrateFromLocalStorage();
    console.log('✅ 数据迁移完成！');
    return true;
  } catch (error) {
    console.error('❌ 数据迁移失败:', error);
    return false;
  }
};

// 在浏览器控制台执行迁移
// import { performDataMigration } from './utils/dataMigration';
// performDataMigration();
