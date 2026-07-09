export type ExpenseCategoryLevel = 'parent' | 'child';

export interface ExpenseCategory {
  id: string;
  name: string;
  code?: string;
  level: ExpenseCategoryLevel;
  parentId?: string | null;
  sortOrder?: number;
  isSystem?: boolean;
}

export interface ExpenseCategoryPath {
  parentId: string;
  parentName: string;
  categoryId: string;
  categoryName: string;
  fullName: string;
}

export const DEFAULT_EXPENSE_PARENT_IDS = {
  purchase: 'expense-parent-purchase',
  labor: 'expense-parent-labor',
  utilities: 'expense-parent-utilities',
  operations: 'expense-parent-operations',
  maintenance: 'expense-parent-maintenance',
  delivery: 'expense-parent-delivery',
  supplier: 'expense-parent-supplier',
  other: 'expense-parent-other',
} as const;

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: DEFAULT_EXPENSE_PARENT_IDS.purchase, name: '采购支出', code: 'PURCHASE', level: 'parent', sortOrder: 10, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.labor, name: '人工支出', code: 'LABOR', level: 'parent', sortOrder: 20, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.utilities, name: '房租水电', code: 'UTILITIES_GROUP', level: 'parent', sortOrder: 30, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.operations, name: '运营杂费', code: 'OPERATIONS', level: 'parent', sortOrder: 40, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.maintenance, name: '设备维修', code: 'MAINTENANCE_GROUP', level: 'parent', sortOrder: 50, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.delivery, name: '外卖配送', code: 'DELIVERY', level: 'parent', sortOrder: 60, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.supplier, name: '供应商货款', code: 'SUPPLIER_PAYMENT_GROUP', level: 'parent', sortOrder: 70, isSystem: true },
  { id: DEFAULT_EXPENSE_PARENT_IDS.other, name: '其他支出', code: 'OTHER_GROUP', level: 'parent', sortOrder: 80, isSystem: true },
  { id: 'purchase_food', name: '食材采购', code: 'PURCHASE_FOOD', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.purchase, sortOrder: 10, isSystem: true },
  { id: 'employee_salary', name: '员工工资', code: 'EMPLOYEE_SALARY', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.labor, sortOrder: 10, isSystem: true },
  { id: 'employee_loan', name: '员工借款', code: 'EMPLOYEE_LOAN', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.labor, sortOrder: 20, isSystem: true },
  { id: 'rent', name: '房租', code: 'RENT', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.utilities, sortOrder: 10, isSystem: true },
  { id: 'water_fee', name: '水费', code: 'WATER', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.utilities, sortOrder: 20, isSystem: true },
  { id: 'electricity_fee', name: '电费', code: 'ELECTRICITY', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.utilities, sortOrder: 30, isSystem: true },
  { id: 'internet_fee', name: '网络费', code: 'INTERNET', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.utilities, sortOrder: 40, isSystem: true },
  { id: 'transport', name: '交通费', code: 'TRANSPORT', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.operations, sortOrder: 10, isSystem: true },
  { id: 'meals', name: '餐费', code: 'MEALS', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.operations, sortOrder: 20, isSystem: true },
  { id: 'office_supplies', name: '办公用品', code: 'OFFICE_SUPPLIES', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.operations, sortOrder: 30, isSystem: true },
  { id: 'cleaning_supplies', name: '清洁用品', code: 'CLEANING_SUPPLIES', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.operations, sortOrder: 40, isSystem: true },
  { id: 'kitchen_maintenance', name: '厨房设备', code: 'KITCHEN_MAINTENANCE', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.maintenance, sortOrder: 10, isSystem: true },
  { id: 'pos_maintenance', name: 'POS设备', code: 'POS_MAINTENANCE', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.maintenance, sortOrder: 20, isSystem: true },
  { id: 'furniture_maintenance', name: '桌椅维修', code: 'FURNITURE_MAINTENANCE', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.maintenance, sortOrder: 30, isSystem: true },
  { id: 'delivery_fee', name: '派送费支出', code: 'DELIVERY_FEE', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.delivery, sortOrder: 10, isSystem: true },
  { id: 'supplier_payment', name: '供应商还款', code: 'SUPPLIER_PAYMENT', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.supplier, sortOrder: 10, isSystem: true },
  { id: 'other_expense', name: '其他', code: 'OTHER', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.other, sortOrder: 10, isSystem: true },
];

const sortCategories = (categories: ExpenseCategory[]): ExpenseCategory[] => (
  [...categories].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    return orderDiff || a.name.localeCompare(b.name);
  })
);

const normalizeText = (value: any): string => String(value || '').trim().toLowerCase();

const inferParentId = (category: any): string => {
  const id = normalizeText(category?.id);
  const code = normalizeText(category?.code);
  const name = normalizeText(category?.name);
  const combined = `${id} ${code} ${name}`;

  if (combined.includes('purchase') || combined.includes('采购')) return DEFAULT_EXPENSE_PARENT_IDS.purchase;
  if (combined.includes('salary') || combined.includes('loan') || combined.includes('员工') || combined.includes('工资') || combined.includes('借款')) return DEFAULT_EXPENSE_PARENT_IDS.labor;
  if (combined.includes('rent') || combined.includes('water') || combined.includes('electric') || combined.includes('utilities') || combined.includes('房租') || combined.includes('水') || combined.includes('电') || combined.includes('网络')) return DEFAULT_EXPENSE_PARENT_IDS.utilities;
  if (combined.includes('maintenance') || combined.includes('repair') || combined.includes('维修') || combined.includes('设备')) return DEFAULT_EXPENSE_PARENT_IDS.maintenance;
  if (combined.includes('delivery') || combined.includes('派送') || combined.includes('外卖')) return DEFAULT_EXPENSE_PARENT_IDS.delivery;
  if (combined.includes('supplier') || combined.includes('供应商')) return DEFAULT_EXPENSE_PARENT_IDS.supplier;
  if (combined.includes('transport') || combined.includes('meals') || combined.includes('office') || combined.includes('交通') || combined.includes('餐费') || combined.includes('办公')) return DEFAULT_EXPENSE_PARENT_IDS.operations;
  return DEFAULT_EXPENSE_PARENT_IDS.other;
};

export const normalizeExpenseCategories = (categories: any[]): ExpenseCategory[] => {
  const source = Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_EXPENSE_CATEGORIES;
  const normalizedMap = new Map<string, ExpenseCategory>();

  DEFAULT_EXPENSE_CATEGORIES
    .filter(category => category.level === 'parent')
    .forEach(parent => normalizedMap.set(parent.id, parent));

  source.forEach((category: any, index: number) => {
    const id = String(category?.id || category?.key || `expense-category-${index}`);
    const level: ExpenseCategoryLevel = category?.level === 'parent' ? 'parent' : 'child';
    const parentId = level === 'parent' ? null : String(category?.parentId || inferParentId(category));

    normalizedMap.set(id, {
      id,
      name: String(category?.name || '未命名类别'),
      code: category?.code,
      level,
      parentId,
      sortOrder: Number.isFinite(Number(category?.sortOrder)) ? Number(category.sortOrder) : index + 100,
      isSystem: Boolean(category?.isSystem),
    });
  });

  if (!Array.isArray(categories) || categories.length === 0) {
    DEFAULT_EXPENSE_CATEGORIES.forEach(category => normalizedMap.set(category.id, category));
  }

  return sortCategories(Array.from(normalizedMap.values()));
};

export const getExpenseParentCategories = (categories: ExpenseCategory[]): ExpenseCategory[] => (
  sortCategories(categories.filter(category => category.level === 'parent'))
);

export const getExpenseChildCategories = (categories: ExpenseCategory[], parentId: string): ExpenseCategory[] => (
  sortCategories(categories.filter(category => category.level === 'child' && category.parentId === parentId))
);

export const getExpenseCategoryPath = (
  categoryId: string,
  categories: ExpenseCategory[],
  expenseSnapshot: any = {}
): ExpenseCategoryPath => {
  const child = categories.find(category => category.id === categoryId);
  const parent = child?.parentId ? categories.find(category => category.id === child.parentId) : undefined;
  const parentId = parent?.id || expenseSnapshot?.parentCategoryId || DEFAULT_EXPENSE_PARENT_IDS.other;
  const parentName = parent?.name || expenseSnapshot?.parentCategoryName || '其他支出';
  const categoryName = child?.name || expenseSnapshot?.categoryName || expenseSnapshot?.category || '未知类别';

  return {
    parentId,
    parentName,
    categoryId,
    categoryName,
    fullName: `${parentName} / ${categoryName}`,
  };
};

export const canDeleteExpenseCategory = (
  categoryId: string,
  categories: ExpenseCategory[],
  _expenses: any[]
): { allowed: boolean; reason?: string; categoryIdsToDelete?: string[] } => {
  const category = categories.find(item => item.id === categoryId);
  if (!category) return { allowed: false, reason: 'Category does not exist' };

  if (category.level === 'parent') {
    const childCategoryIds = categories
      .filter(item => item.level === 'child' && item.parentId === categoryId)
      .map(item => item.id);
    return { allowed: true, categoryIdsToDelete: [categoryId, ...childCategoryIds] };
  }

  return { allowed: true, categoryIdsToDelete: [categoryId] };
};