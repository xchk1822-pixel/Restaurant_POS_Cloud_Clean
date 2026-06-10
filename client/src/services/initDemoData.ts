/**
 * 数据初始化脚本
 * 用于在Firebase中创建真实的模拟数据
 */

import { db } from '../firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { COLLECTIONS } from '../firebase/config';

// ==================== 模拟数据 ====================

// 1. 分店数据
const storesData = [
  {
    name: '马那瓜总店',
    code: 'MN001',
    address: '马那瓜市中心广场旁',
    phone: '+505 2270-1234',
    status: 'active',
    openDate: '2024-01-15',
    currency: 'C$',
    taxRate: 15,
    businessHours: '08:00-22:00',
    createdAt: new Date().toISOString(),
  },
  {
    name: '莱昂分店',
    code: 'LN002',
    address: '莱昂大学附近',
    phone: '+505 2311-5678',
    status: 'active',
    openDate: '2024-06-01',
    currency: 'C$',
    taxRate: 15,
    businessHours: '09:00-21:00',
    createdAt: new Date().toISOString(),
  },
];

// 2. 用户账号数据
const usersData = [
  // 超级管理员
  {
    username: 'admin',
    password: 'admin123',
    name: '系统管理员',
    role: 'super_admin',
    storeId: null,
    storeName: null,
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  // 马那瓜总店 - 店长
  {
    username: 'manager_mn001',
    password: '123456',
    name: 'Carlos Martínez',
    role: 'store_manager',
    storeId: 'store_001',
    storeName: '马那瓜总店',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  // 马那瓜总店 - 收银员
  {
    username: 'cashier_mn001_01',
    password: '123456',
    name: 'María López',
    role: 'cashier',
    storeId: 'store_001',
    storeName: '马那瓜总店',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  // 马那瓜总店 - 服务生
  {
    username: 'waiter_mn001_01',
    password: '123456',
    name: 'Juan Pérez',
    role: 'waiter',
    storeId: 'store_001',
    storeName: '马那瓜总店',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  // 马那瓜总店 - 厨师
  {
    username: 'chef_mn001_01',
    password: '123456',
    name: 'Roberto García',
    role: 'chef',
    storeId: 'store_001',
    storeName: '马那瓜总店',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  // 莱昂分店 - 店长
  {
    username: 'manager_ln002',
    password: '123456',
    name: 'Ana Rodríguez',
    role: 'store_manager',
    storeId: 'store_002',
    storeName: '莱昂分店',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

// 3. 菜单菜品数据（马那瓜总店）
const menuItemsData = [
  // 主菜
  { name: '烤鸡套餐', nameEs: 'Pollo Asado', price: 180, category: '主菜', type: 'dish', available: true, storeId: 'store_001' },
  { name: '牛排', nameEs: 'Bistec', price: 250, category: '主菜', type: 'dish', available: true, storeId: 'store_001' },
  { name: '烤鱼', nameEs: 'Pescado Frito', price: 200, category: '主菜', type: 'dish', available: true, storeId: 'store_001' },
  { name: '猪肉排', nameEs: 'Chuleta de Cerdo', price: 220, category: '主菜', type: 'dish', available: true, storeId: 'store_001' },
  
  // 小吃
  { name: '玉米片', nameEs: 'Nachos', price: 80, category: '小吃', type: 'dish', available: true, storeId: 'store_001' },
  { name: '春卷', nameEs: 'Rollitos de Primavera', price: 60, category: '小吃', type: 'dish', available: true, storeId: 'store_001' },
  
  // 汤类
  { name: '牛肉汤', nameEs: 'Sopa de Res', price: 90, category: '汤类', type: 'dish', available: true, storeId: 'store_001' },
  { name: '鸡汤', nameEs: 'Sopa de Pollo', price: 85, category: '汤类', type: 'dish', available: true, storeId: 'store_001' },
  
  // 主食
  { name: '米饭', nameEs: 'Arroz', price: 30, category: '主食', type: 'dish', available: true, storeId: 'store_001' },
  { name: '炸香蕉', nameEs: 'Tajadas', price: 40, category: '主食', type: 'dish', available: true, storeId: 'store_001' },
  
  // 甜点
  { name: '焦糖布丁', nameEs: 'Flan', price: 50, category: '甜点', type: 'dish', available: true, storeId: 'store_001' },
  { name: '冰淇淋', nameEs: 'Helado', price: 45, category: '甜点', type: 'dish', available: true, storeId: 'store_001' },
  
  // 饮料
  { name: '可乐', nameEs: 'Coca Cola', price: 25, category: '饮料', type: 'beverage', available: true, storeId: 'store_001' },
  { name: '雪碧', nameEs: 'Sprite', price: 25, category: '饮料', type: 'beverage', available: true, storeId: 'store_001' },
  { name: '橙汁', nameEs: 'Jugo de Naranja', price: 35, category: '饮料', type: 'beverage', available: true, storeId: 'store_001' },
  { name: '咖啡', nameEs: 'Café', price: 30, category: '饮料', type: 'beverage', available: true, storeId: 'store_001' },
  
  // 酒水
  { name: '啤酒', nameEs: 'Cerveza', price: 40, category: '酒水', type: 'alcohol', available: true, storeId: 'store_001' },
  { name: '红酒', nameEs: 'Vino Tinto', price: 120, category: '酒水', type: 'alcohol', available: true, storeId: 'store_001' },
  { name: '威士忌', nameEs: 'Whisky', price: 150, category: '酒水', type: 'alcohol', available: true, storeId: 'store_001' },
];

// 4. 库存商品数据
const inventoryData = [
  { name: '鸡肉', category: 'meat', unit: '磅', quantity: 50, minStock: 10, costPrice: 80, salePrice: 0, storeId: 'store_001' },
  { name: '牛肉', category: 'meat', unit: '磅', quantity: 30, minStock: 8, costPrice: 120, salePrice: 0, storeId: 'store_001' },
  { name: '猪肉', category: 'meat', unit: '磅', quantity: 25, minStock: 5, costPrice: 100, salePrice: 0, storeId: 'store_001' },
  { name: '鱼', category: 'seafood', unit: '磅', quantity: 20, minStock: 5, costPrice: 90, salePrice: 0, storeId: 'store_001' },
  { name: '大米', category: 'grain', unit: '磅', quantity: 100, minStock: 20, costPrice: 25, salePrice: 0, storeId: 'store_001' },
  { name: '可乐', category: 'beverage', unit: '瓶', quantity: 200, minStock: 50, costPrice: 15, salePrice: 25, storeId: 'store_001' },
  { name: '啤酒', category: 'alcohol', unit: '瓶', quantity: 150, minStock: 30, costPrice: 25, salePrice: 40, storeId: 'store_001' },
];

// 5. 客户数据
const customersData = [
  { name: 'Pedro Sánchez', phone: '+505 8888-1234', points: 500, totalSpent: 5000, visitCount: 15, createdAt: new Date('2024-01-20').toISOString() },
  { name: 'Laura Fernández', phone: '+505 8888-5678', points: 1200, totalSpent: 12000, visitCount: 30, createdAt: new Date('2024-02-10').toISOString() },
  { name: 'Miguel Torres', phone: '+505 8888-9012', points: 300, totalSpent: 3000, visitCount: 8, createdAt: new Date('2024-03-05').toISOString() },
  { name: 'Carmen Ruiz', phone: '+505 8888-3456', points: 800, totalSpent: 8000, visitCount: 20, createdAt: new Date('2024-01-30').toISOString() },
  { name: 'José Morales', phone: '+505 8888-7890', points: 150, totalSpent: 1500, visitCount: 5, createdAt: new Date('2024-04-01').toISOString() },
];

// 6. 桌台数据
const tablesData = [
  { number: '1', name: 'A1', capacity: 2, status: 'available', x: 100, y: 100 },
  { number: '2', name: 'A2', capacity: 4, status: 'occupied', x: 250, y: 100 },
  { number: '3', name: 'B1', capacity: 6, status: 'available', x: 400, y: 100 },
  { number: '4', name: 'B2', capacity: 4, status: 'available', x: 100, y: 250 },
  { number: '5', name: 'C1', capacity: 8, status: 'reserved', x: 250, y: 250 },
  { number: '6', name: 'C2', capacity: 2, status: 'available', x: 400, y: 250 },
];

// ==================== 初始化函数 ====================

export const initializeDemoData = async () => {
  console.log('🚀 开始初始化演示数据...');
  
  try {
    const batch = writeBatch(db);
    
    // 1. 创建分店
    console.log('📍 创建分店数据...');
    const storeIds: string[] = [];
    for (const store of storesData) {
      const storeRef = doc(collection(db, COLLECTIONS.STORES));
      batch.set(storeRef, store);
      storeIds.push(storeRef.id);
    }
    
    // 2. 创建用户账号
    console.log('👥 创建用户账号...');
    const updatedUsersData = usersData.map((user, index) => ({
      ...user,
      storeId: user.storeId ? storeIds[user.storeId === 'store_001' ? 0 : 1] : null,
    }));
    
    for (const user of updatedUsersData) {
      const userRef = doc(collection(db, COLLECTIONS.USERS));
      batch.set(userRef, user);
    }
    
    // 3. 创建菜单菜品
    console.log('🍽️ 创建菜单菜品...');
    const updatedMenuData = menuItemsData.map(item => ({
      ...item,
      storeId: storeIds[0], // 都属于马那瓜总店
      createdAt: new Date().toISOString(),
    }));
    
    for (const item of updatedMenuData) {
      const itemRef = doc(collection(db, COLLECTIONS.PRODUCTS));
      batch.set(itemRef, item);
    }
    
    // 4. 创建库存商品
    console.log('📦 创建库存商品...');
    const updatedInventoryData = inventoryData.map(item => ({
      ...item,
      storeId: storeIds[0],
      createdAt: new Date().toISOString(),
    }));
    
    for (const item of updatedInventoryData) {
      const itemRef = doc(collection(db, COLLECTIONS.INVENTORY));
      batch.set(itemRef, item);
    }
    
    // 5. 创建客户
    console.log('🤝 创建客户数据...');
    for (const customer of customersData) {
      const customerRef = doc(collection(db, COLLECTIONS.CUSTOMERS));
      batch.set(customerRef, customer);
    }
    
    // 6. 创建桌台
    console.log('🪑 创建桌台数据...');
    for (const table of tablesData) {
      const tableRef = doc(collection(db, 'tables'));
      batch.set(tableRef, { ...table, storeId: storeIds[0] });
    }
    
    // 提交批量写入
    await batch.commit();
    
    console.log('✅ 演示数据初始化成功！');
    console.log(`   - 分店: ${storesData.length} 个`);
    console.log(`   - 用户: ${usersData.length} 个`);
    console.log(`   - 菜品: ${menuItemsData.length} 个`);
    console.log(`   - 库存: ${inventoryData.length} 个`);
    console.log(`   - 客户: ${customersData.length} 个`);
    console.log(`   - 桌台: ${tablesData.length} 个`);
    
    return { success: true, storeIds };
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  }
};

// 如果直接运行此文件
if (typeof window !== 'undefined') {
  // 在浏览器环境中，可以通过控制台调用
  (window as any).initializeDemoData = initializeDemoData;
  console.log('💡 在浏览器控制台运行: initializeDemoData()');
}
