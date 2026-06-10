// 用户角色枚举
export enum UserRole {
  OWNER = 'owner',
  REGIONAL_MANAGER = 'regional_manager',
  STORE_MANAGER = 'store_manager',
  CASHIER = 'cashier',
  WAITER = 'waiter',
  CHEF = 'chef',
  INVENTORY_CLERK = 'inventory_clerk'
}
// 权限类型
export type Permission = 
  | 'view_all_stores'
  | 'manage_store'
  | 'create_order'
  | 'view_orders'
  | 'manage_inventory'
  | 'view_reports'
  | 'manage_employees'
  | 'manage_customers'
  | 'kitchen_view';
// 用户接口
export interface User {
  id: string;
  email: string;
  role: UserRole;
  storeId: string;
  permissions: Permission[];
  profile: {
    name: string;
    phone: string;
    avatar?: string;
  };
  createdAt: Date;
  isActive: boolean;
}
// 店铺接口
export interface Store {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  phone: string;
  managerId?: string;
  tables: Table[];
  isOpen: boolean;
  createdAt: Date;
}
// 桌台接口
export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
}
export enum TableStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  CLEANING = 'cleaning'
}
// 订单接口
export interface Order {
  id: string;
  storeId: string;
  tableId?: string;
  orderNumber: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  orderType: OrderType;
  notes?: string;
  createdBy: string;
  assignedChef?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  status: OrderItemStatus;
  notes?: string;
  modifiers?: OrderModifier[];
}
export interface OrderModifier {
  id: string;
  name: string;
  price: number;
}
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  SERVED = 'served',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}
export enum OrderItemStatus {
  PENDING = 'pending',
  PREPARING = 'preparing',
  READY = 'ready',
  SERVED = 'served',
  CANCELLED = 'cancelled'
}
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}
export enum OrderType {
  DINE_IN = 'dine_in',
  TAKEOUT = 'takeout',
  DELIVERY = 'delivery'
}
// 菜单项接口
export interface MenuItem {
  id: string;
  storeId: string;
  category: string;
  name: {
    zh: string;
    es: string;
  };
  description?: {
    zh: string;
    es: string;
  };
  price: number;
  cost: number;
  image?: string;
  isAvailable: boolean;
  preparationTime: number; // 分钟
  allergens?: string[];
  createdAt: Date;
  updatedAt: Date;
}
// 库存接口
export interface Inventory {
  id: string;
  storeId: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  maxCapacity: number;
  supplierId?: string;
  costPerUnit: number;
  lastRestocked?: Date;
  expiryDate?: Date;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}
// 供应商接口
export interface Supplier {
  id: string;
  name: string;
  contact: {
    phone: string;
    email: string;
    address: string;
    contactPerson: string;
  };
  products: SupplierProduct[];
  rating: number;
  paymentTerms: string;
  isActive: boolean;
  createdAt: Date;
}
export interface SupplierProduct {
  ingredientId: string;
  name: string;
  unit: string;
  price: number;
  minOrderQuantity: number;
  leadTime: number; // 天
}
// 客户接口
export interface Customer {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  email?: string;
  membershipLevel: MembershipLevel;
  points: number;
  totalSpent: number;
  visitCount: number;
  lastVisit?: Date;
  preferences?: {
    allergies?: string[];
    favoriteItems?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}
export enum MembershipLevel {
  REGULAR = 'regular',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum'
}
// 员工排班
export interface Shift {
  id: string;
  storeId: string;
  employeeId: string;
  date: Date;
  startTime: string;
  endTime: string;
  role: UserRole;
  status: ShiftStatus;
  actualStartTime?: Date;
  actualEndTime?: Date;
  notes?: string;
}
export enum ShiftStatus {
  SCHEDULED = 'scheduled',
  CHECKED_IN = 'checked_in',
  CHECKED_OUT = 'checked_out',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show'
}
// 报表数据
export interface SalesReport {
  storeId: string;
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  topSellingItems: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  paymentMethodBreakdown: {
    cash: number;
    card: number;
    mobile: number;
  };
  hourlyBreakdown: Array<{
    hour: number;
    orders: number;
    revenue: number;
  }>;
}
export enum ReportPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom'
}
