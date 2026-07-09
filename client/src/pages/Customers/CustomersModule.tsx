import React, { useEffect, useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { getExchangeRateConfig, getExchangeRateStorageKey, getPointsExchangeRate, ExchangeRateConfig } from '../../utils/exchangeRate';
import { loadScopedPointsTransactions, saveScopedPointsTransactions } from '../../utils/customerPoints';
import { filterActiveCustomers } from '../../utils/customerRecords';
import { smartGetDocuments, smartSetDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { useAppContext } from '../../contexts/AppContext';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import {
  buildCustomerCenterRows,
  buildCustomerCenterSummary,
  CustomerCenterRow,
  CustomerSegment,
  CustomerSortKey,
  filterCustomerRows,
  getCustomerPointLedger,
} from '../../utils/customerAnalytics';

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
  totalSpent: number;
  visitCount: number;
  createdAt: string;
  lastVisitAt?: string;
  notes?: string;
  level?: string;
  socialAccounts?: {
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    telegram?: string;
  };
}

interface PointsTransaction {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  description: string;
  createdAt: string;
}

const saveLocalPointsConfig = (config: ExchangeRateConfig) => {
  localStorage.setItem(getExchangeRateStorageKey(), JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('exchangeRateUpdated', { detail: config }));
};

const getScopedStorageKey = (collectionName: string): string => {
  try {
    const currentUser = localStorage.getItem('current_user');
    const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
    return storeId ? `store_${storeId}_${collectionName}` : collectionName;
  } catch {
    return collectionName;
  }
};

const saveLocalCollection = (collectionName: string, records: any[]) => {
  localStorage.setItem(getScopedStorageKey(collectionName), JSON.stringify(records));
};

const formatMoney = (value: number) => `C$ ${Number(value || 0).toLocaleString('es-NI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatNumber = (value: number) => Number(value || 0).toLocaleString('es-NI');

const formatDate = (dateKey?: string) => {
  if (!dateKey) return '无记录';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('zh-CN');
};

const segmentLabels: Record<CustomerSegment, string> = {
  new: '新客户',
  active: '活跃客户',
  sleeping: '沉睡客户',
  vip: '高价值',
  points: '积分客户',
};

const segmentColors: Record<CustomerSegment, { text: string; bg: string }> = {
  new: { text: colors.textSecondary, bg: colors.surfaceMuted },
  active: { text: colors.success, bg: colors.successSoft },
  sleeping: { text: colors.amber, bg: colors.amberSoft },
  vip: { text: colors.blue, bg: colors.blueSoft },
  points: { text: colors.teal, bg: colors.tealSoft },
};

const levelConfig = {
  bronze: { label: '青铜', color: '#a16207', bg: '#fef3c7' },
  silver: { label: '白银', color: '#475569', bg: '#e2e8f0' },
  gold: { label: '黄金', color: '#b45309', bg: '#fef3c7' },
  platinum: { label: '铂金', color: colors.blue, bg: colors.blueSoft },
};

const getCustomerLevel = (points: number): keyof typeof levelConfig => {
  if (points >= 10000) return 'platinum';
  if (points >= 5000) return 'gold';
  if (points >= 2000) return 'silver';
  return 'bronze';
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100%',
    padding: '1.25rem',
    background: `linear-gradient(135deg, ${colors.page} 0%, #eef6f4 100%)`,
    fontFamily: font.family,
    color: colors.textPrimary,
    overflowY: 'auto',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '1.55rem',
    fontWeight: 650,
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  subtitle: {
    margin: '0.35rem 0 0 0',
    color: colors.textSecondary,
    fontSize: font.body,
  },
  actions: {
    display: 'flex',
    gap: '0.6rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  syncText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    minWidth: '8rem',
    textAlign: 'right',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  kpiCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    boxShadow: shadows.soft,
    padding: '0.9rem',
    minHeight: '5.6rem',
  },
  kpiLabel: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginBottom: '0.45rem',
  },
  kpiValue: {
    color: colors.textPrimary,
    fontSize: '1.25rem',
    fontWeight: 650,
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.65fr) minmax(320px, 0.9fr)',
    gap: '1rem',
    alignItems: 'start',
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    boxShadow: shadows.soft,
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '0.95rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  panelTitle: {
    margin: 0,
    fontSize: font.section,
    fontWeight: 650,
  },
  toolbar: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 1fr) 160px',
    gap: '0.75rem',
    padding: '0.85rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surfaceMuted,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radii.md,
    padding: '0.65rem 0.75rem',
    fontSize: font.body,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radii.md,
    padding: '0.65rem 0.75rem',
    fontSize: font.body,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none',
  },
  segmentBar: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0 1rem 0.85rem 1rem',
    flexWrap: 'wrap',
    background: colors.surfaceMuted,
  },
  tableWrap: {
    maxHeight: 'calc(100vh - 360px)',
    minHeight: '22rem',
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '0.72rem 0.85rem',
    textAlign: 'left',
    fontSize: font.caption,
    color: colors.textSecondary,
    background: colors.surfaceMuted,
    borderBottom: `1px solid ${colors.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: '0.78rem 0.85rem',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: font.body,
    verticalAlign: 'middle',
  },
  customerName: {
    fontWeight: 650,
    color: colors.textPrimary,
    marginBottom: '0.25rem',
  },
  muted: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  detailPanel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    boxShadow: shadows.soft,
    overflow: 'hidden',
    position: 'sticky',
    top: '1rem',
  },
  detailBody: {
    padding: '1rem',
    display: 'grid',
    gap: '0.9rem',
  },
  detailName: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 650,
    color: colors.textPrimary,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.65rem',
  },
  miniCard: {
    background: colors.surfaceMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '0.75rem',
  },
  ledgerItem: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '0.5rem',
    padding: '0.65rem 0',
    borderBottom: `1px solid ${colors.border}`,
  },
  settingsCard: {
    background: colors.surfaceMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: '0.9rem',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.38)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modalContent: {
    width: 'min(560px, 100%)',
    maxHeight: '90vh',
    overflow: 'auto',
    background: colors.surface,
    borderRadius: radii.lg,
    boxShadow: shadows.lift,
    padding: '1.2rem',
  },
  modalTitle: {
    margin: '0 0 1rem 0',
    fontSize: '1.15rem',
    fontWeight: 650,
  },
  formGroup: {
    marginBottom: '0.9rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.35rem',
    fontSize: font.caption,
    color: colors.textSecondary,
    fontWeight: 600,
  },
  textarea: {
    width: '100%',
    minHeight: '5.2rem',
    resize: 'vertical',
    boxSizing: 'border-box',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radii.md,
    padding: '0.65rem 0.75rem',
    fontSize: font.body,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.6rem',
    marginTop: '1rem',
    flexWrap: 'wrap',
  },
  empty: {
    padding: '3rem 1rem',
    textAlign: 'center',
    color: colors.textSecondary,
  },
};

const buttonStyle = (variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' = 'primary'): React.CSSProperties => {
  const variants = {
    primary: { background: colors.teal, color: '#fff', border: colors.teal },
    secondary: { background: colors.surface, color: colors.textPrimary, border: colors.borderStrong },
    ghost: { background: colors.surfaceMuted, color: colors.textSecondary, border: colors.border },
    danger: { background: colors.danger, color: '#fff', border: colors.danger },
    warning: { background: colors.amber, color: '#fff', border: colors.amber },
  };
  const selected = variants[variant];
  return {
    border: `1px solid ${selected.border}`,
    background: selected.background,
    color: selected.color,
    borderRadius: radii.md,
    padding: '0.58rem 0.8rem',
    cursor: 'pointer',
    fontWeight: 650,
    fontSize: font.caption,
    minHeight: '2.35rem',
  };
};

const chipStyle = (active = false): React.CSSProperties => ({
  border: `1px solid ${active ? colors.teal : colors.border}`,
  background: active ? colors.tealSoft : colors.surface,
  color: active ? colors.teal : colors.textSecondary,
  borderRadius: radii.pill,
  padding: '0.45rem 0.75rem',
  cursor: 'pointer',
  fontWeight: 650,
  fontSize: font.caption,
});

const badgeStyle = (segment: CustomerSegment): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: radii.pill,
  padding: '0.25rem 0.55rem',
  fontSize: font.caption,
  fontWeight: 650,
  color: segmentColors[segment].text,
  background: segmentColors[segment].bg,
});

const CustomersModule: React.FC = () => {
  const { orders } = useAppContext();
  const [customers, setCustomers] = useState<Customer[]>(() => dataManager.getData('customers'));
  const [transactions, setTransactions] = useState<PointsTransaction[]>(() => loadScopedPointsTransactions());
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | CustomerSegment>('all');
  const [sortBy, setSortBy] = useState<CustomerSortKey>('recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    notes: '',
    whatsapp: '',
    facebook: '',
    instagram: '',
    telegram: '',
  });
  const [pointsAmount, setPointsAmount] = useState<number>(0);
  const [redeemAmount, setRedeemAmount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pointsConfig, setPointsConfig] = useState<ExchangeRateConfig>(() => getExchangeRateConfig());
  const [tempPointsConfig, setTempPointsConfig] = useState<ExchangeRateConfig>(() => getExchangeRateConfig());
  const [isSavingPointsSettings, setIsSavingPointsSettings] = useState(false);

  const pointsExchangeRate = pointsConfig.pointsToCurrency || getPointsExchangeRate();
  const pointsEarnRate = pointsConfig.pointsEarnPerCurrency || 1;

  const resetForm = () => {
    setFormData({ name: '', phone: '', notes: '', whatsapp: '', facebook: '', instagram: '', telegram: '' });
  };

  const refreshCustomerData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudCustomers, cloudCustomerDeletions, cloudTransactions, cloudPointsConfigs] = await Promise.all([
        smartGetDocuments('customers', true),
        smartGetDocuments('customer_deletions', true),
        smartGetDocuments('points_transactions', true),
        smartGetDocuments('exchange_rate', true),
      ]);

      const activeCustomers = filterActiveCustomers(cloudCustomers, cloudCustomerDeletions);
      await dataManager.saveData('customers', activeCustomers, { syncFirestore: false, notify: false });
      dataManager.clearCache('customers');
      setCustomers(activeCustomers);
      setTransactions(cloudTransactions as PointsTransaction[]);
      saveScopedPointsTransactions(cloudTransactions as PointsTransaction[]);
      saveLocalCollection('customer_deletions', cloudCustomerDeletions);

      const cloudPointsConfig = (cloudPointsConfigs as ExchangeRateConfig[]).find((item: any) => item.id === 'global') || cloudPointsConfigs[0] as ExchangeRateConfig | undefined;
      if (cloudPointsConfig) {
        const nextConfig: ExchangeRateConfig = {
          ...getExchangeRateConfig(),
          ...cloudPointsConfig,
          pointsEarnPerCurrency: Number(cloudPointsConfig.pointsEarnPerCurrency || 1),
          pointsToCurrency: Number(cloudPointsConfig.pointsToCurrency || 100),
        };
        saveLocalPointsConfig(nextConfig);
        setPointsConfig(nextConfig);
        setTempPointsConfig(nextConfig);
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新客户数据失败:', error);
      alert('刷新客户数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomerData();
  }, [refreshCustomerData]);

  const customerRows = React.useMemo(
    () => buildCustomerCenterRows(customers, orders, transactions, new Date(), pointsExchangeRate),
    [customers, orders, transactions, pointsExchangeRate]
  );

  const summary = React.useMemo(
    () => buildCustomerCenterSummary(customerRows, pointsExchangeRate),
    [customerRows, pointsExchangeRate]
  );

  const filteredCustomers = React.useMemo(
    () => filterCustomerRows(customerRows, { query: searchTerm, segment: segmentFilter, sortBy }),
    [customerRows, searchTerm, segmentFilter, sortBy]
  );

  const selectedCustomerRow = React.useMemo(() => {
    if (selectedCustomer) {
      return customerRows.find(row => row.id === selectedCustomer.id) || (selectedCustomer as CustomerCenterRow);
    }
    return filteredCustomers[0] || null;
  }, [customerRows, filteredCustomers, selectedCustomer]);

  const selectedLedger = React.useMemo(
    () => selectedCustomerRow ? getCustomerPointLedger(selectedCustomerRow.id, transactions).slice(0, 6) : [],
    [selectedCustomerRow, transactions]
  );

  const getCustomerRecord = React.useCallback((customerId: string): Customer | null => {
    return customers.find(customer => customer.id === customerId) || null;
  }, [customers]);

  const selectCustomerRow = (row: CustomerCenterRow) => {
    const customerRecord = getCustomerRecord(row.id);
    if (customerRecord) {
      setSelectedCustomer(customerRecord);
    }
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleAddCustomer = async () => {
    if (!formData.name.trim()) {
      alert('请输入客户姓名');
      return;
    }

    const newCustomer: Customer = {
      id: `CUST-${Date.now()}`,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      points: 0,
      totalSpent: 0,
      visitCount: 0,
      createdAt: new Date().toISOString(),
      notes: formData.notes.trim(),
      level: 'bronze',
      socialAccounts: {
        whatsapp: formData.whatsapp.trim() || undefined,
        facebook: formData.facebook.trim() || undefined,
        instagram: formData.instagram.trim() || undefined,
        telegram: formData.telegram.trim() || undefined,
      },
    };

    const nextCustomers = [...customers, newCustomer];
    try {
      await smartSetDocument('customers', newCustomer.id, newCustomer);
    } catch (error) {
      console.error('保存客户失败:', error);
      alert('保存客户失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setShowAddModal(false);
    resetForm();
    alert('客户添加成功');
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes || '',
      whatsapp: customer.socialAccounts?.whatsapp || '',
      facebook: customer.socialAccounts?.facebook || '',
      instagram: customer.socialAccounts?.instagram || '',
      telegram: customer.socialAccounts?.telegram || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCustomer) return;

    const updatedCustomer: Customer = {
      ...selectedCustomer,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      notes: formData.notes.trim(),
      socialAccounts: {
        whatsapp: formData.whatsapp.trim() || undefined,
        facebook: formData.facebook.trim() || undefined,
        instagram: formData.instagram.trim() || undefined,
        telegram: formData.telegram.trim() || undefined,
      },
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );
    try {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
    } catch (error) {
      console.error('保存客户失败:', error);
      alert('保存客户失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setShowEditModal(false);
    resetForm();
    alert('客户信息已更新');
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm('确定要删除这个客户吗？此操作不可恢复。')) return;

    const deletedCustomer = customers.find(customer => customer.id === customerId);
    const deletedAt = new Date().toISOString();
    const nextCustomers = customers.filter(customer => customer.id !== customerId);
    try {
      if (deletedCustomer) {
        await smartUpdateDocument('customers', customerId, {
          ...deletedCustomer,
          isDeleted: true,
          status: 'inactive',
          deletedAt,
        });
      }
      await smartUpdateDocument('customer_deletions', customerId, {
        id: customerId,
        customerId,
        deletedAt,
      });
    } catch (error) {
      console.error('删除客户失败:', error);
      alert('删除客户失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer(null);
    }
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    alert('客户已删除');
  };

  const handleManagePoints = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPointsAmount(0);
    setShowPointsModal(true);
  };

  const handleAddPoints = async () => {
    if (!selectedCustomer || pointsAmount <= 0) {
      alert('请输入有效的积分数量');
      return;
    }

    const updatedCustomer: Customer = {
      ...selectedCustomer,
      points: selectedCustomer.points + pointsAmount,
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );

    const transaction: PointsTransaction = {
      id: `TXN-${Date.now()}`,
      customerId: selectedCustomer.id,
      type: 'adjust',
      points: pointsAmount,
      description: `手动调整积分 +${pointsAmount}`,
      createdAt: new Date().toISOString(),
    };

    const updatedTransactions = [...transactions, transaction];
    try {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
      await smartSetDocument('points_transactions', transaction.id, transaction);
    } catch (error) {
      console.error('保存积分失败:', error);
      alert('保存积分失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setTransactions(updatedTransactions);
    saveScopedPointsTransactions(updatedTransactions);
    setShowPointsModal(false);
    setPointsAmount(0);
    alert(`已添加 ${pointsAmount} 积分`);
  };

  const handleSavePointsSettings = async () => {
    const earnRate = Number(tempPointsConfig.pointsEarnPerCurrency);
    const redeemRate = Number(tempPointsConfig.pointsToCurrency);

    if (!Number.isFinite(earnRate) || earnRate < 0) {
      alert('请输入有效的消费积分比例');
      return;
    }

    if (!Number.isFinite(redeemRate) || redeemRate <= 0) {
      alert('请输入有效的积分抵扣比例');
      return;
    }

    setIsSavingPointsSettings(true);
    try {
      const nextConfig: ExchangeRateConfig = {
        ...getExchangeRateConfig(),
        ...tempPointsConfig,
        pointsEarnPerCurrency: earnRate,
        pointsToCurrency: redeemRate,
        lastUpdated: new Date().toISOString(),
      };

      await smartSetDocument('exchange_rate', 'global', nextConfig);
      saveLocalPointsConfig(nextConfig);
      setPointsConfig(nextConfig);
      setTempPointsConfig(nextConfig);
      alert('积分设置已保存');
    } catch (error) {
      console.error('保存积分设置失败:', error);
      alert('保存积分设置失败，请检查网络后重试');
    } finally {
      setIsSavingPointsSettings(false);
    }
  };

  const handleRedeemPoints = (customer: Customer) => {
    setSelectedCustomer(customer);
    setRedeemAmount(0);
    setShowRedeemModal(true);
  };

  const handleConfirmRedeem = async () => {
    if (!selectedCustomer || redeemAmount <= 0) {
      alert('请输入有效的兑换积分');
      return;
    }

    if (redeemAmount > selectedCustomer.points) {
      alert('积分不足');
      return;
    }

    const cashValue = redeemAmount / pointsExchangeRate;
    const updatedCustomer: Customer = {
      ...selectedCustomer,
      points: selectedCustomer.points - redeemAmount,
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );

    const transaction: PointsTransaction = {
      id: `TXN-${Date.now()}`,
      customerId: selectedCustomer.id,
      type: 'redeem',
      points: -redeemAmount,
      description: `兑换现金 C$ ${cashValue.toFixed(2)} (${redeemAmount} 积分)`,
      createdAt: new Date().toISOString(),
    };

    const updatedTransactions = [...transactions, transaction];
    try {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
      await smartSetDocument('points_transactions', transaction.id, transaction);
    } catch (error) {
      console.error('保存积分兑换失败:', error);
      alert('保存积分兑换失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setTransactions(updatedTransactions);
    saveScopedPointsTransactions(updatedTransactions);
    setShowRedeemModal(false);
    setRedeemAmount(0);
    alert(`成功兑换 C$ ${cashValue.toFixed(2)}`);
  };

  const handleResetPoints = async (customerId: string) => {
    if (!window.confirm('确定要重置这个客户的积分吗？')) return;

    const nextCustomers = customers.map(customer =>
      customer.id === customerId ? { ...customer, points: 0 } : customer
    );
    const updatedCustomer = nextCustomers.find(customer => customer.id === customerId);
    if (!updatedCustomer) return;

    try {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
    } catch (error) {
      console.error('重置积分失败:', error);
      alert('重置积分失败，请检查网络后重试');
      return;
    }
    setCustomers(nextCustomers);
    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer(updatedCustomer);
    }
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    alert('积分已重置为 0');
  };

  const renderCustomerForm = (mode: 'add' | 'edit') => (
    <>
      <div style={styles.formGroup}>
        <label style={styles.label}>姓名 *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
          placeholder="请输入客户姓名"
          style={styles.input}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>电话</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
          placeholder="请输入电话号码"
          style={styles.input}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>备注</label>
        <textarea
          value={formData.notes}
          onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
          placeholder="客户偏好、禁忌、特殊需求等"
          rows={3}
          style={styles.textarea}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
        {(['whatsapp', 'facebook', 'instagram', 'telegram'] as const).map(field => (
          <div key={field}>
            <label style={styles.label}>{field[0].toUpperCase() + field.slice(1)}</label>
            <input
              type="text"
              value={formData[field]}
              onChange={(event) => setFormData({ ...formData, [field]: event.target.value })}
              style={styles.input}
            />
          </div>
        ))}
      </div>
      <div style={styles.modalActions}>
        <button
          onClick={() => {
            mode === 'add' ? setShowAddModal(false) : setShowEditModal(false);
            resetForm();
          }}
          style={buttonStyle('secondary')}
        >
          取消
        </button>
        <button
          onClick={mode === 'add' ? handleAddCustomer : handleSaveEdit}
          style={buttonStyle('primary')}
        >
          保存
        </button>
      </div>
    </>
  );

  const detailCustomer = selectedCustomerRow;

  return (
    <div style={styles.container} data-customer-center="true">
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.title}>客户中心</h1>
          <p style={styles.subtitle}>客户档案、消费价值、积分风险和最近互动集中管理。</p>
        </div>
        <div style={styles.actions}>
          <div style={styles.syncText}>
            {lastSyncedAt ? `同步 ${lastSyncedAt.toLocaleTimeString('zh-CN')}` : '未同步'}
          </div>
          <button onClick={refreshCustomerData} disabled={isRefreshing} style={buttonStyle('secondary')}>
            {isRefreshing ? '刷新中...' : '刷新'}
          </button>
          <button onClick={openAddModal} style={buttonStyle('primary')}>
            新增客户
          </button>
        </div>
      </div>

      <div style={styles.kpiGrid} data-customer-kpis="true">
        {[
          { label: '客户总数', value: formatNumber(summary.totalCustomers), accent: colors.teal },
          { label: '活跃客户', value: formatNumber(summary.activeCustomers), accent: colors.success },
          { label: '沉睡客户', value: formatNumber(summary.sleepingCustomers), accent: colors.amber },
          { label: '高价值客户', value: formatNumber(summary.highValueCustomers), accent: colors.blue },
          { label: '累计消费', value: formatMoney(summary.totalSpend), accent: colors.teal },
          { label: '平均消费', value: formatMoney(summary.averageSpend), accent: colors.textPrimary },
          { label: '积分负债', value: formatMoney(summary.pointsLiability), accent: colors.danger },
        ].map(card => (
          <div key={card.label} style={{ ...styles.kpiCard, borderTop: `3px solid ${card.accent}` }}>
            <div style={styles.kpiLabel}>{card.label}</div>
            <div style={{ ...styles.kpiValue, color: card.accent }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={styles.workspace}>
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>客户列表</h2>
            <span style={styles.muted}>显示 {filteredCustomers.length} / {customerRows.length}</span>
          </div>

          <div style={styles.toolbar}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索姓名或电话"
              style={styles.input}
            />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CustomerSortKey)} style={styles.select}>
              <option value="recent">最近消费</option>
              <option value="spend">消费金额</option>
              <option value="points">积分余额</option>
              <option value="visits">消费次数</option>
              <option value="name">姓名</option>
            </select>
          </div>

          <div style={styles.segmentBar} data-customer-segments="true">
            {[
              { id: 'all', label: '全部' },
              { id: 'vip', label: '高价值' },
              { id: 'active', label: '活跃' },
              { id: 'sleeping', label: '沉睡' },
              { id: 'points', label: '有积分' },
              { id: 'new', label: '新客户' },
            ].map(segment => (
              <button
                key={segment.id}
                onClick={() => setSegmentFilter(segment.id as 'all' | CustomerSegment)}
                style={chipStyle(segmentFilter === segment.id)}
              >
                {segment.label}
              </button>
            ))}
          </div>

          {filteredCustomers.length === 0 ? (
            <div style={styles.empty}>没有匹配的客户</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>客户</th>
                    <th style={styles.th}>状态</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>积分</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>累计消费</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>次数</th>
                    <th style={styles.th}>最近消费</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(customer => {
                    const levelInfo = levelConfig[getCustomerLevel(customer.points)];
                    const isSelected = selectedCustomerRow?.id === customer.id;
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => selectCustomerRow(customer)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? colors.tealSoft : colors.surface,
                        }}
                      >
                        <td style={styles.td}>
                          <div style={styles.customerName}>{customer.name}</div>
                          <div style={styles.muted}>{customer.phone || '未登记电话'}</div>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={badgeStyle(customer.segment)}>{segmentLabels[customer.segment]}</span>
                            <span style={{
                              ...badgeStyle('new'),
                              color: levelInfo.color,
                              background: levelInfo.bg,
                            }}>
                              {levelInfo.label}
                            </span>
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 650 }}>
                          {formatNumber(customer.points)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 650, color: colors.teal }}>
                          {formatMoney(customer.lifetimeSpend)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{formatNumber(customer.visitCount)}</td>
                        <td style={styles.td}>
                          <div>{formatDate(customer.lastVisitDate)}</div>
                          <div style={styles.muted}>
                            {customer.daysSinceVisit === null ? '无消费记录' : `${customer.daysSinceVisit} 天前`}
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'center' }} onClick={(event) => event.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleEditCustomer(record);
                            }} style={buttonStyle('secondary')}>编辑</button>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleManagePoints(record);
                            }} style={buttonStyle('warning')}>积分</button>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleRedeemPoints(record);
                            }} style={buttonStyle('primary')}>兑换</button>
                            <button onClick={() => handleResetPoints(customer.id)} style={buttonStyle('ghost')}>清零</button>
                            <button onClick={() => handleDeleteCustomer(customer.id)} style={buttonStyle('danger')}>删除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside style={styles.detailPanel} data-customer-detail-panel="true">
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>客户 360</h2>
            {detailCustomer && <span style={badgeStyle(detailCustomer.segment)}>{segmentLabels[detailCustomer.segment]}</span>}
          </div>
          {detailCustomer ? (
            <div style={styles.detailBody}>
              <div>
                <h3 style={styles.detailName}>{detailCustomer.name}</h3>
                <div style={styles.muted}>{detailCustomer.phone || '未登记电话'}</div>
                {detailCustomer.notes && <div style={{ ...styles.muted, marginTop: '0.45rem' }}>{detailCustomer.notes}</div>}
              </div>

              <div style={styles.metricGrid}>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>累计消费</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.lifetimeSpend)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>平均客单</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.averageTicket)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>积分余额</div>
                  <div style={styles.kpiValue}>{formatNumber(detailCustomer.points)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>可抵扣</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.redeemValue)}</div>
                </div>
              </div>

              <div style={styles.settingsCard}>
                <div style={{ ...styles.kpiLabel, marginBottom: '0.65rem' }}>积分规则</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={styles.label}>每 C$1 获得积分</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tempPointsConfig.pointsEarnPerCurrency}
                      onChange={(event) => setTempPointsConfig({
                        ...tempPointsConfig,
                        pointsEarnPerCurrency: Number(event.target.value),
                      })}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>多少积分抵 C$1</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={tempPointsConfig.pointsToCurrency}
                      onChange={(event) => setTempPointsConfig({
                        ...tempPointsConfig,
                        pointsToCurrency: Number(event.target.value),
                      })}
                      style={styles.input}
                    />
                  </div>
                </div>
                <button
                  onClick={handleSavePointsSettings}
                  disabled={isSavingPointsSettings}
                  style={{ ...buttonStyle('secondary'), marginTop: '0.75rem', width: '100%' }}
                >
                  {isSavingPointsSettings ? '保存中...' : `保存规则：C$1=${pointsEarnRate} 分，${pointsExchangeRate} 分抵 C$1`}
                </button>
              </div>

              <div data-customer-point-ledger="true">
                <div style={{ ...styles.panelTitle, marginBottom: '0.3rem' }}>最近积分流水</div>
                {selectedLedger.length === 0 ? (
                  <div style={styles.muted}>暂无积分流水</div>
                ) : (
                  selectedLedger.map(transaction => (
                    <div key={transaction.id} style={styles.ledgerItem}>
                      <div>
                        <div style={{ fontWeight: 650 }}>{transaction.description || transaction.type}</div>
                        <div style={styles.muted}>{new Date(transaction.createdAt).toLocaleString('zh-CN')}</div>
                      </div>
                      <div style={{
                        fontWeight: 650,
                        color: transaction.points >= 0 ? colors.success : colors.danger,
                      }}>
                        {transaction.points >= 0 ? '+' : ''}{formatNumber(transaction.points)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={styles.empty}>选择一个客户查看完整档案</div>
          )}
        </aside>
      </div>

      {showAddModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>新增客户</h3>
            {renderCustomerForm('add')}
          </div>
        </div>
      )}

      {showEditModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>编辑客户</h3>
            {renderCustomerForm('edit')}
          </div>
        </div>
      )}

      {showPointsModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>积分管理</h3>
            <div style={styles.settingsCard}>
              <div style={styles.kpiLabel}>客户</div>
              <div style={styles.detailName}>{selectedCustomer.name}</div>
              <div style={{ ...styles.muted, marginTop: '0.35rem' }}>当前积分：{formatNumber(selectedCustomer.points)}</div>
            </div>
            <div style={{ ...styles.formGroup, marginTop: '0.9rem' }}>
              <label style={styles.label}>增加积分</label>
              <input
                type="number"
                value={pointsAmount}
                onChange={(event) => setPointsAmount(parseInt(event.target.value, 10) || 0)}
                min="0"
                style={styles.input}
              />
            </div>
            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowPointsModal(false);
                  setPointsAmount(0);
                }}
                style={buttonStyle('secondary')}
              >
                取消
              </button>
              <button onClick={handleAddPoints} style={buttonStyle('warning')}>确认添加</button>
            </div>
          </div>
        </div>
      )}

      {showRedeemModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>积分兑换</h3>
            <div style={styles.settingsCard}>
              <div style={styles.kpiLabel}>客户</div>
              <div style={styles.detailName}>{selectedCustomer.name}</div>
              <div style={{ ...styles.muted, marginTop: '0.35rem' }}>
                可用积分：{formatNumber(selectedCustomer.points)}，比例：{pointsExchangeRate} 分 = C$ 1.00
              </div>
            </div>
            <div style={{ ...styles.formGroup, marginTop: '0.9rem' }}>
              <label style={styles.label}>兑换积分</label>
              <input
                type="number"
                value={redeemAmount}
                onChange={(event) => setRedeemAmount(parseInt(event.target.value, 10) || 0)}
                min="0"
                max={selectedCustomer.points}
                style={styles.input}
              />
            </div>
            {redeemAmount > 0 && (
              <div style={{ ...styles.miniCard, textAlign: 'center', marginBottom: '0.9rem' }}>
                <div style={styles.kpiLabel}>可兑换金额</div>
                <div style={{ ...styles.kpiValue, color: colors.teal }}>{formatMoney(redeemAmount / pointsExchangeRate)}</div>
              </div>
            )}
            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowRedeemModal(false);
                  setRedeemAmount(0);
                }}
                style={buttonStyle('secondary')}
              >
                取消
              </button>
              <button onClick={handleConfirmRedeem} style={buttonStyle('primary')}>确认兑换</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersModule;
