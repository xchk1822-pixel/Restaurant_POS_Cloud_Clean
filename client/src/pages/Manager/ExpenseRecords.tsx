import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

interface ExpenseItem {
  id: string;
  date: string;
  categoryId: string;
  description: string;
  amount: number;
  receipt?: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
}

interface ExpenseRecordsProps {
  embedded?: boolean; // 是否嵌入模式
}

const ExpenseRecordsModule: React.FC<ExpenseRecordsProps> = ({ embedded = false }) => {
  const expenseCategoryStorageKey = dataService.getStoreKey('expense_categories');

  // ✅ 使用统一数据管理服务
  const [expenses, setExpenses] = useState<any[]>(() => {
    return dataManager.getData('expenses');
  });

  const [categories, setCategories] = useState<any[]>(() => {
    const saved = localStorage.getItem(expenseCategoryStorageKey);
    if (saved) {
      return JSON.parse(saved);
    }
    return [
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
    ];
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>(getLocalDateString()); // ✅ 默认显示当天开支

  // 表单数据
  const [formData, setFormData] = useState({
    categoryId: categories[0]?.id || '',
    description: '',
    amount: '',
    date: getLocalDateString(), // 🔥 使用本地时间
  });

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // ✅ 监听数据变化（确保与其他模块同步）
  const refreshExpenseData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudExpenses, cloudCategories] = await Promise.all([
        smartGetDocuments('expenses', true),
        smartGetDocuments('expense_categories', true),
      ]);

      await dataManager.saveData('expenses', cloudExpenses, { syncFirestore: false, notify: false });
      dataManager.clearCache('expenses');
      setExpenses(cloudExpenses);

      if (cloudCategories.length > 0) {
        setCategories(cloudCategories);
        localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(cloudCategories));
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5f00\u652f\u8bb0\u5f55\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5f00\u652f\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, [expenseCategoryStorageKey]);

  useEffect(() => {
    refreshExpenseData();
  }, [refreshExpenseData]);

  // ✅ 添加开支 - 使用 dataManager 统一保存
  const handleAddExpense = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('请输入有效金额');
      return;
    }

    const newExpense = {
      id: `exp-${Date.now()}`,
      date: formData.date,
      categoryId: formData.categoryId,
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
      categoryId: categories[0]?.id || '',
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
    if (!newCategoryName.trim()) return;
    const newCat: ExpenseCategory = {
      id: `cat-${Date.now()}`,
      name: newCategoryName.trim(),
      code: newCategoryName.trim().toUpperCase().replace(/\s+/g, '_')
    };
    const nextCategories = [...categories, newCat];
    try {
      await smartSetDocument('expense_categories', newCat.id, newCat);
    } catch (error) {
      console.error('保存开支类别失败:', error);
      alert('保存开支类别失败，请检查网络后重试');
      return;
    }
    setCategories(nextCategories);
    localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(nextCategories));
    setNewCategoryName('');
  };

  // 删除类别
  const handleDeleteCategory = async (id: string) => {
    if (categories.length <= 1) {
      alert('至少保留一个开支类别');
      return;
    }
    if (window.confirm('删除类别后，相关记录的类别将失效，确定删除吗？')) {
      const nextCategories = categories.filter(cat => cat.id !== id);
      try {
        await smartDeleteDocument('expense_categories', id);
      } catch (error) {
        console.error('删除开支类别失败:', error);
        alert('删除开支类别失败，请检查网络后重试');
        return;
      }
      setCategories(nextCategories);
      localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(nextCategories));
    }
  };

  // 处理票据上传
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

  const filteredExpenses = expenses
    .filter(exp => {
      if (filterCategory !== 'all' && exp.categoryId !== filterCategory) return false;
      if (filterDate && exp.date !== filterDate) return false;
      return true;
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

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: '#f3f4f6',
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
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
    },
    statItem: {
      textAlign: 'center' as const,
      padding: '0.75rem',
      borderRadius: '0.5rem',
    },
    toolbar: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
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
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1rem',
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
      {/* 头部 - 仅在非嵌入模式显示 */}
      {!embedded && (
        <div style={styles.header}>
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

      {/* 统计卡片 */}
      <div style={styles.statsCard}>
        <div style={{ ...styles.statItem, background: '#dbeafe' }}>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>今日开支</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>
            C$ {todayTotal.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>{todayExpenses.length} 笔</div>
        </div>
        <div style={{ ...styles.statItem, background: '#fef3c7' }}>
          <div style={{ fontSize: '0.75rem', color: '#92400e' }}>筛选后总计</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#92400e' }}>
            C$ {totalAmount.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#92400e' }}>{filteredExpenses.length} 笔</div>
        </div>
        <div style={{ ...styles.statItem, background: '#fce7f3' }}>
          <div style={{ fontSize: '0.75rem', color: '#9d174d' }}>总记录数</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#9d174d' }}>
            {expenses.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9d174d' }}>条记录</div>
        </div>
      </div>

      {/* 类别管理 */}
      {showCategoryManager && (
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>⚙️ 管理开支类别</h3>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="新类别名称"
              onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={handleAddCategory} style={styles.btn('#10b981', 'white')}>
              添加
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {categories.map(cat => (
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
                  onClick={() => handleDeleteCategory(cat.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
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
              <label style={styles.label}>类别</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                style={{ ...styles.select, width: '100%' }}
              >
                {categories.map(cat => (
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
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={styles.select}
        >
          <option value="all">全部类别</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          style={styles.input}
        />
        <button
          onClick={() => { setFilterCategory('all'); setFilterDate(getLocalDateString()); }}
          style={styles.btn('#6b7280', 'white')}
        >
          📅 今天
        </button>
        <button
          onClick={() => { setFilterCategory('all'); setFilterDate(''); }}
          style={styles.btn('#3b82f6', 'white')}
        >
          📋 全部
        </button>
      </div>

      {/* 开支列表 */}
      <div style={{ ...styles.card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {filteredExpenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <div>暂无开支记录</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
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
                  const category = categories.find(c => c.id === exp.categoryId);
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
                          {category?.name || '未知'}
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
                              onClick={() => {
                                setExpenses(expenses.map(e =>
                                  e.id === exp.id ? { ...e, receipt: undefined } : e
                                ));
                              }}
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
    </div>
  );
};

export default ExpenseRecordsModule;
