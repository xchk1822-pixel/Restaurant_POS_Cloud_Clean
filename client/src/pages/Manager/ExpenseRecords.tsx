import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { buildExpenseRankings } from '../../utils/dashboardAnalytics';
import { buildExpenseDetailRankings, filterExpenseRecords } from '../../utils/expenseRecordInsights';
import { buildMissingPurchaseExpenses } from '../../utils/purchaseExpenseRepair';
import {
  canDeleteExpenseCategory,
  getExpenseCategoryPath,
  getExpenseChildCategories,
  getExpenseParentCategories,
  normalizeExpenseCategories,
  type ExpenseCategory,
} from '../../utils/expenseCategories';

interface ExpenseRecordsProps {
  embedded?: boolean; // 是否嵌入模式
}

type ExpenseDateMode = 'today' | 'all' | 'date' | 'month';

const ExpenseRecordsModule: React.FC<ExpenseRecordsProps> = ({ embedded = false }) => {
  const expenseCategoryStorageKey = dataService.getStoreKey('expense_categories');

  // ✅ 使用统一数据管理服务
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  const [categories, setCategories] = useState<ExpenseCategory[]>(() => {
    const saved = localStorage.getItem(expenseCategoryStorageKey);
    if (saved) {
      return normalizeExpenseCategories(JSON.parse(saved));
    }
    return normalizeExpenseCategories([
      { id: 'cat-1', name: '水电费', code: 'UTILITIES' },
      { id: 'cat-2', name: '房租', code: 'RENT' },
      { id: 'cat-3', name: '维修费', code: 'MAINTENANCE' },
      { id: 'cat-4', name: '交通费', code: 'TRANSPORT' },
      { id: 'cat-5', name: '餐费', code: 'MEALS' },
      { id: 'cat-6', name: '办公用品', code: 'OFFICE_SUPPLIES' },
      { id: 'delivery_fee', name: '派送费支出', code: 'DELIVERY_FEE' }, // 外卖外派订单的派送费
      { id: 'employee_loan', name: '员工借款', code: 'EMPLOYEE_LOAN' }, // ✅ 员工借款
      { id: 'employee_salary', name: '员工薪资', code: 'EMPLOYEE_SALARY' }, // ✅ 员工薪资
      { id: 'supplier_payment', name: '供应商货款', code: 'SUPPLIER_PAYMENT' }, // ✅ 供应商货款
      { id: 'cat-7', name: '其他', code: 'OTHER' }
    ]);
  });
  const initialParentId = getExpenseParentCategories(categories)[0]?.id || '';
  const initialChildId = getExpenseChildCategories(categories, initialParentId)[0]?.id || '';

  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<string>(initialParentId);
  const [filterParentCategory, setFilterParentCategory] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>(getLocalDateString()); // ✅ 默认显示当天开支
  const [filterDateMode, setFilterDateMode] = useState<'today' | 'all' | 'date' | 'month'>('today');
  const [filterMonth, setFilterMonth] = useState<string>(getLocalDateString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

  // 表单数据
  const [formData, setFormData] = useState({
    parentCategoryId: initialParentId,
    categoryId: initialChildId,
    description: '',
    amount: '',
    date: getLocalDateString(), // 🔥 使用本地时间
  });

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [newParentCategoryName, setNewParentCategoryName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const parentCategories = React.useMemo(() => getExpenseParentCategories(categories), [categories]);
  const selectedParentChildren = React.useMemo(
    () => getExpenseChildCategories(categories, selectedParentCategoryId || parentCategories[0]?.id || ''),
    [categories, parentCategories, selectedParentCategoryId]
  );
  const formChildCategories = React.useMemo(
    () => getExpenseChildCategories(categories, formData.parentCategoryId),
    [categories, formData.parentCategoryId]
  );

  const setCategoriesCache = React.useCallback((nextCategories: ExpenseCategory[]) => {
    setCategories(nextCategories);
    localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(nextCategories));
  }, [expenseCategoryStorageKey]);

  const makeCategoryCode = (name: string): string => name.trim().toUpperCase().replace(/\s+/g, '_');

  const getExpenseCategoryDisplay = React.useCallback((expense: any) => {
    return getExpenseCategoryPath(String(expense.categoryId || ''), categories, expense);
  }, [categories]);

  // ✅ 监听数据变化（确保与其他模块同步）
  const refreshExpenseData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudExpenses, cloudCategories, cloudPurchases] = await Promise.all([
        smartGetDocuments('expenses', true),
        smartGetDocuments('expense_categories', true),
        smartGetDocuments('purchase_orders', true),
      ]);

      const repairedExpenses = buildMissingPurchaseExpenses(cloudPurchases, cloudExpenses);
      if (repairedExpenses.length > 0) {
        await Promise.all(repairedExpenses.map(expense =>
          smartSetDocument('expenses', expense.id, expense)
        ));
      }
      const nextExpenses = [...repairedExpenses, ...cloudExpenses];

      setExpenses(nextExpenses);
      setPurchaseOrders(cloudPurchases);

      const normalizedCloudCategories = normalizeExpenseCategories(cloudCategories);
      setCategoriesCache(normalizedCloudCategories);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5f00\u652f\u8bb0\u5f55\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5f00\u652f\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, [setCategoriesCache]);

  useEffect(() => {
    refreshExpenseData();
  }, [refreshExpenseData]);

  useEffect(() => {
    const handleExpensesUpdated = (event: Event) => {
      const updatedExpenses = (event as CustomEvent<any[]>).detail;
      setExpenses(Array.isArray(updatedExpenses) ? updatedExpenses : dataManager.getData('expenses'));
    };

    window.addEventListener('expensesUpdated', handleExpensesUpdated);
    const handlePurchasesUpdated = (event: Event) => {
      const updatedPurchases = (event as CustomEvent<any[]>).detail;
      setPurchaseOrders(Array.isArray(updatedPurchases) ? updatedPurchases : dataManager.getData('purchases'));
    };

    window.addEventListener('purchasesUpdated', handlePurchasesUpdated);
    return () => {
      window.removeEventListener('expensesUpdated', handleExpensesUpdated);
      window.removeEventListener('purchasesUpdated', handlePurchasesUpdated);
    };
  }, []);

  useEffect(() => {
    const firstParent = parentCategories[0]?.id || '';
    if (!selectedParentCategoryId && firstParent) setSelectedParentCategoryId(firstParent);
    if (!formData.parentCategoryId && firstParent) {
      const firstChild = getExpenseChildCategories(categories, firstParent)[0]?.id || '';
      setFormData(current => ({ ...current, parentCategoryId: firstParent, categoryId: firstChild }));
    }
  }, [categories, formData.parentCategoryId, parentCategories, selectedParentCategoryId]);

  // ✅ 添加开支 - 使用 dataManager 统一保存
  const handleAddExpense = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('请输入有效金额');
      return;
    }

    if (!window.confirm('确认保存这条开支记录吗？')) {
      return;
    }

    const categoryPath = getExpenseCategoryPath(formData.categoryId, categories, {
      parentCategoryId: formData.parentCategoryId,
    });

    const newExpense = {
      id: `exp-${Date.now()}`,
      date: formData.date,
      parentCategoryId: categoryPath.parentId,
      parentCategoryName: categoryPath.parentName,
      categoryId: formData.categoryId,
      categoryName: categoryPath.categoryName,
      description: formData.description,
      amount: parseFloat(formData.amount),
      receipt: receiptImage || undefined,
      createdAt: getLocalDateString(), // 🔥 使用本地时间
    };

    // Write the new document first, then refresh the local cache.
    const nextExpenses = [...expenses, newExpense];
    try {
      await smartSetDocument('expenses', newExpense.id, newExpense);
    } catch (error) {
      console.error('保存开支记录失败:', error);
      alert('保存开支记录失败，请检查网络后重试');
      return;
    }
    setExpenses(nextExpenses);
    await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });

    setFormData({
      parentCategoryId: parentCategories[0]?.id || '',
      categoryId: getExpenseChildCategories(categories, parentCategories[0]?.id || '')[0]?.id || '',
      description: '',
      amount: '',
      date: getLocalDateString(), // 🔥 使用本地时间
    });
    setReceiptImage(null);
    setShowAddForm(false);
  };

  // ✅ 删除开支 - 使用 dataManager 统一保存
  const handleDeleteExpense = async (id: string) => {
    if (window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u6761\u8bb0\u5f55\u5417\uff1f')) {
      const nextExpenses = expenses.filter(exp => exp.id !== id);
      try {
        await smartDeleteDocument('expenses', id);
      } catch (error) {
        console.error('删除开支记录失败:', error);
        alert('删除开支记录失败，请检查网络后重试');
        return;
      }
      setExpenses(nextExpenses);
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false, notify: false });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }

    // 验证文件大小（限制5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }

    // 转换为Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 清除图片
  const clearImage = () => {
    setReceiptImage(null);
  };

  // 添加类别
  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !selectedParentCategoryId) return;
    const newCat: ExpenseCategory = {
      id: `cat-${Date.now()}`,
      name: newCategoryName.trim(),
      code: makeCategoryCode(newCategoryName),
      level: 'child',
      parentId: selectedParentCategoryId,
      sortOrder: selectedParentChildren.length + 100,
    };
    const nextCategories = [...categories, newCat];
    try {
      await smartSetDocument('expense_categories', newCat.id, newCat);
    } catch (error) {
      console.error('保存开支类别失败:', error);
      alert('保存开支类别失败，请检查网络后重试');
      return;
    }
    setCategoriesCache(nextCategories);
    setNewCategoryName('');
  };

  const handleAddParentCategory = async () => {
    if (!newParentCategoryName.trim()) return;
    const newParent: ExpenseCategory = {
      id: `parent-${Date.now()}`,
      name: newParentCategoryName.trim(),
      code: makeCategoryCode(newParentCategoryName),
      level: 'parent',
      parentId: null,
      sortOrder: parentCategories.length + 100,
    };
    const nextCategories = [...categories, newParent];
    try {
      await smartSetDocument('expense_categories', newParent.id, newParent);
    } catch (error) {
      console.error('保存开支父类失败:', error);
      alert('保存开支父类失败，请检查网络后重试');
      return;
    }
    setCategoriesCache(nextCategories);
    setSelectedParentCategoryId(newParent.id);
    setNewParentCategoryName('');
  };

  // 删除类别
  const handleRenameCategory = async (id: string) => {
    const category = categories.find(cat => cat.id === id);
    if (!category) return;
    const nextName = window.prompt('New category name', category.name)?.trim();
    if (!nextName || nextName === category.name) return;

    const updatedCategory: ExpenseCategory = { ...category, name: nextName };
    const nextCategories = categories.map(cat => cat.id === id ? updatedCategory : cat);
    try {
      await smartSetDocument('expense_categories', updatedCategory.id, updatedCategory);
    } catch (error) {
      console.error('Rename expense category failed:', error);
      alert('Rename expense category failed. Please check the network and try again.');
      return;
    }
    setCategoriesCache(nextCategories);
  };

  // 删除类别
  const handleDeleteCategory = async (id: string) => {
    const deleteCheck = canDeleteExpenseCategory(id, categories, expenses);
    if (!deleteCheck.allowed) {
      alert(deleteCheck.reason || 'Category cannot be deleted');
      return;
    }
    const categoryIdsToDelete = deleteCheck.categoryIdsToDelete || [id];
    if (window.confirm('Delete this category? This cannot be undone.')) {
      const nextCategories = categories.filter(cat => !categoryIdsToDelete.includes(cat.id));
      try {
        await Promise.all(categoryIdsToDelete.map(categoryId => smartDeleteDocument('expense_categories', categoryId)));
      } catch (error) {
        console.error('Delete expense category failed:', error);
        alert('Delete expense category failed. Please check the network and try again.');
        return;
      }
      setCategoriesCache(nextCategories);
      if (categoryIdsToDelete.includes(selectedParentCategoryId)) {
        setSelectedParentCategoryId(getExpenseParentCategories(nextCategories)[0]?.id || '');
      }
      setFormData(current => {
        if (!categoryIdsToDelete.includes(current.parentCategoryId) && !categoryIdsToDelete.includes(current.categoryId)) {
          return current;
        }
        const nextParentId = getExpenseParentCategories(nextCategories)[0]?.id || '';
        const nextChildId = getExpenseChildCategories(nextCategories, nextParentId)[0]?.id || '';
        return { ...current, parentCategoryId: nextParentId, categoryId: nextChildId };
      });
    }
  };
  const handleReceiptUpload = (expenseId: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const updatedExpenses = expenses.map(exp =>
        exp.id === expenseId ? { ...exp, receipt: reader.result as string } : exp
      );
      const updatedExpense = updatedExpenses.find(exp => exp.id === expenseId);
      if (!updatedExpense) return;
      try {
        await smartSetDocument('expenses', updatedExpense.id, updatedExpense);
      } catch (error) {
        console.error('保存票据失败:', error);
        alert('保存票据失败，请检查网络后重试');
        return;
      }
      setExpenses(updatedExpenses);
      await dataManager.saveData('expenses', updatedExpenses, { syncFirestore: false });
    };
    reader.readAsDataURL(file);
  };

  const handleClearReceipt = async (expenseId: string) => {
    const updatedExpenses = expenses.map(exp =>
      exp.id === expenseId ? { ...exp, receipt: undefined } : exp
    );
    const updatedExpense = updatedExpenses.find(exp => exp.id === expenseId);
    if (!updatedExpense) return;
    try {
      await smartSetDocument('expenses', updatedExpense.id, updatedExpense);
    } catch (error) {
      console.error('\u5220\u9664\u7968\u636e\u5931\u8d25:', error);
      alert('\u5220\u9664\u7968\u636e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      return;
    }
    setExpenses(updatedExpenses);
    await dataManager.saveData('expenses', updatedExpenses, { syncFirestore: false, notify: false });
  };

  const getExpenseDateTime = (expense: any): number => {
    const dateTime = Date.parse(expense.date || '');
    return Number.isFinite(dateTime) ? dateTime : 0;
  };

  const getExpenseCreatedTime = (expense: any): number => {
    const createdTime = Date.parse(expense.createdAt || expense.updatedAt || '');
    const idTime = Number(String(expense.id || '').match(/\d{10,}/)?.[0] || 0);
    return Math.max(
      Number.isFinite(createdTime) ? createdTime : 0,
      Number.isFinite(idTime) ? idTime : 0
    );
  };

  const filteredExpenses = filterExpenseRecords(expenses, categories, purchaseOrders, {
    parentCategoryId: filterParentCategory,
    categoryId: filterCategory,
    dateMode: filterDateMode,
    date: filterDate,
    month: filterMonth,
    query: searchQuery,
  })
    .sort((a, b) => {
      const dateDiff = getExpenseDateTime(b) - getExpenseDateTime(a);
      if (dateDiff !== 0) return dateDiff;
      return getExpenseCreatedTime(b) - getExpenseCreatedTime(a);
    });

  // 计算统计
  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const todayExpenses = expenses.filter(exp => exp.date === getLocalDateString()); // 🔥 使用本地时间
  const todayTotal = todayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const categoryRankings = buildExpenseRankings(filteredExpenses, categories, purchaseOrders, {
    scope: 'all',
    sortBy: 'amount',
    topN: 6,
  });
  const detailRankings = buildExpenseDetailRankings(filteredExpenses, purchaseOrders, searchQuery, 6);
  const groupedCategoryRankings = React.useMemo(() => {
    return categoryRankings.reduce((groups: Array<{ title: string; items: typeof categoryRankings }>, item) => {
      const title = item.parentCategory || '其他开支';
      const group = groups.find(current => current.title === title);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({ title, items: [item] });
      }
      return groups;
    }, []);
  }, [categoryRankings]);
  const groupedDetailRankings = React.useMemo(() => {
    if (detailRankings.length === 0) return [];
    return [{ title: '商品 / 明细', items: detailRankings }];
  }, [detailRankings]);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      overflowY: 'auto' as const,
      padding: '1.25rem',
      background: '#f3f4f6',
    },
    pageShell: {
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '0.75rem',
      boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '0.75rem',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      color: '#1f2937',
      margin: 0,
    },
    statsCard: {
      background: '#f8fafc',
      borderRadius: '0.5rem',
      padding: '0.6rem 0.75rem',
      border: '1px solid #e5e7eb',
      display: 'flex',
      gap: '1rem',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
    },
    statItem: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '0.35rem',
      padding: '0.2rem 0',
    },
    toolbar: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '0.75rem',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
    },
    btn: (bg: string, color: string) => ({
      padding: '0.5rem 1rem',
      background: bg,
      color: color,
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
    }),
    select: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    input: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    card: {
      background: '#ffffff',
      borderRadius: '0.75rem',
      padding: '1rem',
      border: '1px solid #e5e7eb',
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      fontSize: '0.875rem',
      color: '#374151',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
    },
    th: {
      background: '#f9fafb',
      padding: '0.75rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
      fontSize: '0.875rem',
    },
    categoryTag: {
      display: 'inline-block',
      padding: '0.25rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '600',
    },
  };

  return (
    <div style={embedded ? {} : styles.container}>
      {/* 页面大容器 */}
      <div style={styles.pageShell}>
        {/* 头部 - 仅在非嵌入模式显示 */}
        {!embedded && (
          <div style={{ ...styles.header, marginBottom: 0 }}>
            <h1 style={styles.title}>📝 开支记录</h1>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {lastSyncedAt && (
                <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
                </span>
              )}
              <button
                onClick={refreshExpenseData}
                disabled={isRefreshing}
                style={{
                  ...styles.btn(isRefreshing ? '#9ca3af' : '#6366f1', 'white'),
                  cursor: isRefreshing ? 'not-allowed' : 'pointer',
                }}
              >
                {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
              </button>
              <button
                onClick={() => setShowCategoryManager(!showCategoryManager)}
                style={styles.btn('#8b5cf6', 'white')}
              >
                ⚙️ 类别管理
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                style={styles.btn(showAddForm ? '#6b7280' : '#10b981', 'white')}
              >
                {showAddForm ? '❌ 取消' : '➕ 添加开支'}
              </button>
            </div>
          </div>
        )}

        {/* 紧凑摘要 */}
        <div style={styles.statsCard}>
          <div style={styles.statItem}>
            <span style={{ fontSize: '0.75rem', color: '#1e40af' }}>今日开支</span>
            <strong style={{ fontSize: '1rem', color: '#1e40af' }}>C$ {todayTotal.toFixed(2)}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{todayExpenses.length} 笔</span>
          </div>
          <div style={styles.statItem}>
            <span style={{ fontSize: '0.75rem', color: '#92400e' }}>筛选后总计</span>
            <strong style={{ fontSize: '1rem', color: '#92400e' }}>C$ {totalAmount.toFixed(2)}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{filteredExpenses.length} 笔</span>
          </div>
          <div style={styles.statItem}>
            <span style={{ fontSize: '0.75rem', color: '#9d174d' }}>总记录数</span>
            <strong style={{ fontSize: '1rem', color: '#9d174d' }}>{expenses.length}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>条</span>
          </div>
          <div style={styles.statItem}>
            <span style={{ fontSize: '0.75rem', color: '#047857' }}>当前命中</span>
            <strong style={{ fontSize: '1rem', color: '#047857' }}>{filteredExpenses.length}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {searchQuery.trim() ? `搜索：${searchQuery.trim()}` : '按当前筛选'}
            </span>
          </div>
        </div>

      {/* 类别管理 */}
      {showCategoryManager && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>⚙️ 管理开支类别</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(280px, 1.2fr)', gap: '1rem' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>父类</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={newParentCategoryName}
                  onChange={(e) => setNewParentCategoryName(e.target.value)}
                  placeholder="新父类名称"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddParentCategory()}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button onClick={handleAddParentCategory} style={styles.btn('#0f766e', 'white')}>
                  添加
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {parentCategories.map(parent => (
                  <div
                    key={parent.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      background: selectedParentCategoryId === parent.id ? '#dbeafe' : '#f9fafb',
                      border: selectedParentCategoryId === parent.id ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                    }}
                  >
                    <button
                      onClick={() => setSelectedParentCategoryId(parent.id)}
                      style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#1f2937' }}
                    >
                      {parent.name}
                    </button>
                    <button
                      onClick={() => handleRenameCategory(parent.id)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      {'\u6539\u540d'}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(parent.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
                子类：{parentCategories.find(parent => parent.id === selectedParentCategoryId)?.name || '请选择父类'}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="新子类名称"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button onClick={handleAddCategory} style={styles.btn('#10b981', 'white')}>
                  添加
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {selectedParentChildren.map(cat => (
                  <div
                    key={cat.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: '#f3f4f6',
                      borderRadius: '0.375rem',
                    }}
                  >
                    <span>{cat.name}</span>
                    <button
                      onClick={() => handleRenameCategory(cat.id)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      {'\u6539\u540d'}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedParentChildren.length === 0 && (
                  <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>该父类下暂无子类</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加开支表单 */}
      {showAddForm && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>➕ 添加开支记录</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>日期</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                style={{ ...styles.input, width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>父类</label>
              <select
                value={formData.parentCategoryId}
                onChange={(e) => {
                  const nextParentId = e.target.value;
                  const nextChildId = getExpenseChildCategories(categories, nextParentId)[0]?.id || '';
                  setFormData({ ...formData, parentCategoryId: nextParentId, categoryId: nextChildId });
                }}
                style={{ ...styles.select, width: '100%' }}
              >
                {parentCategories.map(parent => (
                  <option key={parent.id} value={parent.id}>{parent.name}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>子类</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                style={{ ...styles.select, width: '100%' }}
              >
                {formChildCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>金额 (C$)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                style={{ ...styles.input, width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>备注说明</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="可选"
                style={{ ...styles.input, width: '100%' }}
              />
            </div>
          </div>

          {/* 票据图片上传 */}
          <div style={styles.formGroup}>
            <label style={styles.label}>📷 票据图片（可选）</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ ...styles.input, width: '100%' }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  支持 JPG、PNG 格式，最大 5MB
                </div>
              </div>
              {receiptImage && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={receiptImage}
                    alt="票据预览"
                    style={{
                      maxWidth: '150px',
                      maxHeight: '150px',
                      borderRadius: '0.5rem',
                      border: '2px solid #e5e7eb',
                    }}
                  />
                  <button
                    onClick={clearImage}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      lineHeight: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAddExpense} style={styles.btn('#10b981', 'white')}>
              💾 保存
            </button>
            <button onClick={() => setShowAddForm(false)} style={styles.btn('#6b7280', 'white')}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 筛选工具栏 */}
      <div style={styles.toolbar}>
        <select
          value={filterDateMode}
          onChange={(e) => {
            const nextMode = e.target.value as ExpenseDateMode;
            setFilterDateMode(nextMode);
            if (nextMode === 'today') {
              setFilterDate(getLocalDateString());
            }
            if (nextMode === 'month' && !filterMonth) {
              setFilterMonth(getLocalDateString().slice(0, 7));
            }
          }}
          style={styles.select}
        >
          <option value="today">今天</option>
          <option value="all">全部</option>
          <option value="date">指定日期</option>
          <option value="month">月份</option>
        </select>
        {(filterDateMode === 'today' || filterDateMode === 'date') && (
          <input
            type="date"
            value={filterDate}
            onChange={(e) => {
              setFilterDate(e.target.value);
              setFilterDateMode('date');
            }}
            style={styles.input}
          />
        )}
        {filterDateMode === 'month' && (
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => {
              setFilterMonth(e.target.value);
              setFilterDateMode('month');
            }}
            style={styles.input}
          />
        )}
        <select
          value={filterParentCategory}
          onChange={(e) => {
            setFilterParentCategory(e.target.value);
            setFilterCategory('all');
          }}
          style={styles.select}
        >
          <option value="all">全部父类</option>
          {parentCategories.map(parent => (
            <option key={parent.id} value={parent.id}>{parent.name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={styles.select}
        >
          <option value="all">全部子类</option>
          {(filterParentCategory === 'all'
            ? categories.filter(category => category.level === 'child')
            : getExpenseChildCategories(categories, filterParentCategory)
          ).map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索开支、供应商、单号、商品，如 鸡肉"
          style={{ ...styles.input, minWidth: '260px', flex: '1 1 280px' }}
        />
        {searchQuery.trim() && (
          <button
            onClick={() => setSearchQuery('')}
            style={styles.btn('#e5e7eb', '#374151')}
          >
            清除搜索
          </button>
        )}
      </div>

      {/* 开支列表 */}
      <div style={{ ...styles.card, display: 'flex', flexDirection: 'column' }}>
        {filteredExpenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <div>暂无开支记录</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...styles.table, background: 'white' }}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: '100px' }}>日期</th>
                  <th style={{ ...styles.th, width: '100px' }}>类别</th>
                  <th style={styles.th}>备注</th>
                  <th style={{ ...styles.th, width: '120px', textAlign: 'right' }}>金额</th>
                  <th style={{ ...styles.th, width: '100px', textAlign: 'center' }}>票据</th>
                  <th style={{ ...styles.th, width: '80px', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(exp => {
                  const categoryPath = getExpenseCategoryDisplay(exp);
                  return (
                    <tr key={exp.id}>
                      <td style={{ ...styles.td, width: '100px' }}>{exp.date}</td>
                      <td style={{ ...styles.td, width: '100px' }}>
                        <span
                          style={{
                            ...styles.categoryTag,
                            background: '#dbeafe',
                            color: '#1e40af',
                          }}
                        >
                          {categoryPath.fullName}
                        </span>
                      </td>
                      <td style={styles.td}>{exp.description || '-'}</td>
                      <td style={{ ...styles.td, width: '120px', fontWeight: 'bold', color: '#dc2626', textAlign: 'right' }}>
                        C$ {exp.amount.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, width: '100px', textAlign: 'center' }}>
                        {exp.receipt ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img
                              src={exp.receipt}
                              alt="票据"
                              style={{ height: '40px', borderRadius: '0.25rem', cursor: 'pointer' }}
                              onClick={() => window.open(exp.receipt, '_blank')}
                            />
                            <button
                              onClick={() => handleClearReceipt(exp.id)}
                              style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#3b82f6',
                              color: 'white',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            📎 上传
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleReceiptUpload(exp.id, file);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </td>
                      <td style={{ ...styles.td, width: '80px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          style={styles.btn('#ef4444', 'white')}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 开支分析 */}
      <div style={{ ...styles.card, padding: '1rem', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>开支排名</div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>基于上方筛选结果，先按大类归类，再看小类和商品明细。</div>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
            {filteredExpenses.length} 笔 / C$ {totalAmount.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#111827' }}>类别开支排名</strong>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Top {categoryRankings.length}</span>
            </div>
            {groupedCategoryRankings.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '0.5rem 0' }}>暂无排名数据</div>
            ) : groupedCategoryRankings.map(group => (
              <div key={group.title} style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>{group.title}</div>
                {group.items.map((item, index) => (
                  <div key={item.key} style={{ marginBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.83rem' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#94a3b8', marginRight: '0.4rem' }}>#{index + 1}</span>{item.label}
                      </span>
                      <strong style={{ color: '#b45309', whiteSpace: 'nowrap' }}>C$ {item.amount.toFixed(2)}</strong>
                    </div>
                    <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '999px', marginTop: '0.25rem', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, item.amountShare)}%`, height: '100%', background: '#f59e0b' }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#111827' }}>商品 / 明细排名</strong>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Top {detailRankings.length}</span>
            </div>
            {groupedDetailRankings.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '0.5rem 0' }}>暂无明细数据</div>
            ) : groupedDetailRankings.map(group => (
              <div key={group.title}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>{group.title}</div>
                {group.items.map((item, index) => (
                  <div key={item.key} style={{ marginBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.83rem' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#94a3b8', marginRight: '0.4rem' }}>#{index + 1}</span>{item.label}
                        <span style={{ color: '#64748b', marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                          {item.quantity > 0 ? `数量 ${item.quantity}` : `${item.count} 笔`}
                        </span>
                      </span>
                      <strong style={{ color: '#0f766e', whiteSpace: 'nowrap' }}>C$ {item.amount.toFixed(2)}</strong>
                    </div>
                    <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '999px', marginTop: '0.25rem', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, item.amountShare)}%`, height: '100%', background: '#0f766e' }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ExpenseRecordsModule;
