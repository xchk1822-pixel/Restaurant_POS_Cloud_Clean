import {
  DEFAULT_EXPENSE_PARENT_IDS,
  canDeleteExpenseCategory,
  getExpenseCategoryPath,
  getExpenseChildCategories,
  getExpenseParentCategories,
  normalizeExpenseCategories,
} from './expenseCategories';

describe('expenseCategories', () => {
  test('provides default parent and child accounting categories when cloud is empty', () => {
    const categories = normalizeExpenseCategories([]);
    const parents = getExpenseParentCategories(categories);

    expect(parents.map(parent => parent.id)).toEqual([
      DEFAULT_EXPENSE_PARENT_IDS.purchase,
      DEFAULT_EXPENSE_PARENT_IDS.labor,
      DEFAULT_EXPENSE_PARENT_IDS.utilities,
      DEFAULT_EXPENSE_PARENT_IDS.operations,
      DEFAULT_EXPENSE_PARENT_IDS.maintenance,
      DEFAULT_EXPENSE_PARENT_IDS.delivery,
      DEFAULT_EXPENSE_PARENT_IDS.supplier,
      DEFAULT_EXPENSE_PARENT_IDS.other,
    ]);
    expect(getExpenseChildCategories(categories, DEFAULT_EXPENSE_PARENT_IDS.utilities).map(child => child.name)).toEqual(
      expect.arrayContaining(['房租', '水费', '电费', '网络费'])
    );
  });

  test('normalizes legacy flat categories into child categories under matching parents', () => {
    const categories = normalizeExpenseCategories([
      { id: 'cat-1', name: '水电费', code: 'UTILITIES' },
      { id: 'employee_salary', name: '员工工资', code: 'EMPLOYEE_SALARY' },
      { id: 'supplier_payment', name: '供应商货款', code: 'SUPPLIER_PAYMENT' },
      { id: 'cat-custom', name: '临时杂费', code: 'TEMP' },
    ]);

    expect(getExpenseCategoryPath('cat-1', categories)).toEqual({
      parentId: DEFAULT_EXPENSE_PARENT_IDS.utilities,
      parentName: '房租水电',
      categoryId: 'cat-1',
      categoryName: '水电费',
      fullName: '房租水电 / 水电费',
    });
    expect(getExpenseCategoryPath('employee_salary', categories).parentName).toBe('人工支出');
    expect(getExpenseCategoryPath('supplier_payment', categories).parentName).toBe('供应商货款');
    expect(getExpenseCategoryPath('cat-custom', categories).parentName).toBe('其他支出');
  });

  test('filters children by selected parent and sorts by sortOrder then name', () => {
    const categories = normalizeExpenseCategories([
      { id: 'parent-food', name: '食品类', level: 'parent', sortOrder: 20 },
      { id: 'child-b', name: 'B类', level: 'child', parentId: 'parent-food', sortOrder: 2 },
      { id: 'child-a', name: 'A类', level: 'child', parentId: 'parent-food', sortOrder: 1 },
      { id: 'child-other', name: '别的', level: 'child', parentId: DEFAULT_EXPENSE_PARENT_IDS.other, sortOrder: 1 },
    ]);

    expect(getExpenseChildCategories(categories, 'parent-food').map(child => child.id)).toEqual(['child-a', 'child-b']);
  });

  test('resolves expense category path from snapshot fields when the category has been deleted', () => {
    const categories = normalizeExpenseCategories([]);
    const path = getExpenseCategoryPath('missing-child', categories, {
      parentCategoryId: 'deleted-parent',
      parentCategoryName: '旧父类',
      categoryName: '旧子类',
    });

    expect(path).toEqual({
      parentId: 'deleted-parent',
      parentName: '旧父类',
      categoryId: 'missing-child',
      categoryName: '旧子类',
      fullName: '旧父类 / 旧子类',
    });
  });

  test('allows deleting referenced parent or child categories because records keep category snapshots', () => {
    const categories = normalizeExpenseCategories([
      { id: 'parent-custom', name: 'Custom parent', level: 'parent' },
      { id: 'child-custom', name: 'Custom child', level: 'child', parentId: 'parent-custom' },
    ]);
    const expenses = [
      { id: 'exp-1', parentCategoryId: 'parent-custom', categoryId: 'child-custom' },
    ];

    expect(canDeleteExpenseCategory('parent-custom', categories, expenses)).toEqual({
      allowed: true,
      categoryIdsToDelete: ['parent-custom', 'child-custom'],
    });
    expect(canDeleteExpenseCategory('child-custom', categories, expenses)).toEqual({
      allowed: true,
      categoryIdsToDelete: ['child-custom'],
    });
  });
  test('allows deleting an unused parent together with its unused children', () => {
    const categories = normalizeExpenseCategories([
      { id: 'parent-unused', name: 'Unused parent', level: 'parent' },
      { id: 'child-unused-a', name: 'Unused child A', level: 'child', parentId: 'parent-unused' },
      { id: 'child-unused-b', name: 'Unused child B', level: 'child', parentId: 'parent-unused' },
    ]);

    expect(canDeleteExpenseCategory('parent-unused', categories, [])).toEqual({
      allowed: true,
      categoryIdsToDelete: ['parent-unused', 'child-unused-a', 'child-unused-b'],
    });
  });

  test('allows deleting used parent and child categories because expense snapshots keep names', () => {
    const categories = normalizeExpenseCategories([
      { id: 'parent-used', name: 'Used parent', level: 'parent' },
      { id: 'child-used', name: 'Used child', level: 'child', parentId: 'parent-used' },
    ]);

    expect(canDeleteExpenseCategory('parent-used', categories, [
      { id: 'expense-1', categoryId: 'child-used' },
    ])).toEqual({
      allowed: true,
      categoryIdsToDelete: ['parent-used', 'child-used'],
    });
    expect(canDeleteExpenseCategory('child-used', categories, [
      { id: 'expense-1', categoryId: 'child-used' },
    ])).toEqual({
      allowed: true,
      categoryIdsToDelete: ['child-used'],
    });
  });
});
