export enum UserRole {
  OWNER = 'owner',
  REGIONAL_MANAGER = 'regional_manager',
  STORE_MANAGER = 'store_manager',
  CASHIER = 'cashier',
  WAITER = 'waiter',
  CHEF = 'chef',
  INVENTORY_CLERK = 'inventory_clerk'
}

export enum MembershipLevel {
  REGULAR = 'regular',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum'
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  storeId: string;
  permissions: string[];
  profile: {
    name: string;
    phone: string;
  };
  createdAt: Date;
  isActive: boolean;
}

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
  createdAt: Date;
  updatedAt: Date;
}
