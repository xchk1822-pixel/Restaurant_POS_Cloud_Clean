// Firebase配置
export const firebaseConfig = {
  apiKey: "AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw",
  authDomain: "restaurant-pos-1b420.firebaseapp.com",
  projectId: "restaurant-pos-1b420",
  storageBucket: "restaurant-pos-1b420.firebasestorage.app",
  messagingSenderId: "1033394792448",
  appId: "1:1033394792448:web:415d1b1438bd72133a90e5",
  measurementId: "G-P4SF3XSJLN"
};

// Firestore集合名称
export const COLLECTIONS = {
  STORES: 'stores',
  USERS: 'users',
  EMPLOYEES: 'employees',
  ORDERS: 'orders',
  PRODUCTS: 'products',
  INVENTORY: 'inventory',
  ATTENDANCE: 'attendance',
  SALARIES: 'salaries',
  LOANS: 'loans',
  CASH_FLOW: 'cash_flow',
  CUSTOMERS: 'customers',
  EXPENSES: 'expenses',
  PURCHASES: 'purchases',
  HANDOVERS: 'handovers',
} as const;
