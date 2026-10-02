import React, { useEffect, useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { getExchangeRateConfig, getExchangeRateStorageKey, getPointsExchangeRate, ExchangeRateConfig } from '../../utils/exchangeRate';
import { loadScopedPointsTransactions, saveScopedPointsTransactions } from '../../utils/customerPoints';
import { filterActiveCustomers } from '../../utils/customerRecords';
import { smartGetDocuments, smartGetDocumentsWhereEqual, smartSetDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { useAppContext } from '../../contexts/AppContext';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey, UiLanguage } from '../../i18n/translations';
import {
  buildCustomerCenterRows,
  buildCustomerCenterSummary,
  CustomerCenterRow,
  CustomerSegment,
  CustomerSortKey,
  filterCustomerRows,
  getCustomerPointLedger,
} from '../../utils/customerAnalytics';
import {
  CustomerPromotionReward,
  getPromotionRedemptionError,
  PromotionRedemptionOrderLike,
  reconcilePromotionReward,
} from '../../utils/customerPromotion';
import { redeemCustomerPromotionReward } from '../../services/customerPromotionService';

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

const getScopedStorageKey = (collectionName: string): string | null => {
  try {
    return dataService.getStoreKey(collectionName);
  } catch {
    return null;
  }
};

const saveLocalCollection = (collectionName: string, records: any[]) => {
  const storageKey = getScopedStorageKey(collectionName);
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(records));
};

const loadLocalCollection = <T,>(collectionName: string): T[] => {
  const storageKey = getScopedStorageKey(collectionName);
  if (!storageKey) return [];
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
};

const formatMoney = (value: number) => `C$ ${Number(value || 0).toLocaleString('es-NI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatNumber = (value: number) => Number(value || 0).toLocaleString('es-NI');

const formatDate = (dateKey: string | undefined, language: UiLanguage, t: (key: TranslationKey) => string) => {
  if (!dateKey) return t('customer.noRecord');
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'es-NI');
};

const segmentLabelKeys: Record<CustomerSegment, TranslationKey> = {
  new: 'customer.segment.new',
  active: 'customer.segment.active',
  sleeping: 'customer.segment.sleeping',
  vip: 'customer.segment.vip',
  points: 'customer.segment.points',
};

const segmentColors: Record<CustomerSegment, { text: string; bg: string }> = {
  new: { text: colors.textSecondary, bg: colors.surfaceMuted },
  active: { text: colors.success, bg: colors.successSoft },
  sleeping: { text: colors.amber, bg: colors.amberSoft },
  vip: { text: colors.blue, bg: colors.blueSoft },
  points: { text: colors.teal, bg: colors.tealSoft },
};

const levelConfig = {
  bronze: { labelKey: 'customer.level.bronze' as TranslationKey, color: '#a16207', bg: '#fef3c7' },
  silver: { labelKey: 'customer.level.silver' as TranslationKey, color: '#475569', bg: '#e2e8f0' },
  gold: { labelKey: 'customer.level.gold' as TranslationKey, color: '#b45309', bg: '#fef3c7' },
  platinum: { labelKey: 'customer.level.platinum' as TranslationKey, color: colors.blue, bg: colors.blueSoft },
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
  const { t, language } = useI18n();
  const translationRef = React.useRef(t);
  translationRef.current = t;
  const { orders, setOrders, menuItems } = useAppContext();
  const [customers, setCustomers] = useState<Customer[]>(() => dataManager.getData('customers'));
  const [transactions, setTransactions] = useState<PointsTransaction[]>(() => loadScopedPointsTransactions());
  const [promotionRewards, setPromotionRewards] = useState<CustomerPromotionReward[]>(() => loadLocalCollection('customer_rewards'));
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | CustomerSegment>('all');
  const [sortBy, setSortBy] = useState<CustomerSortKey>('recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showRewardRedeemModal, setShowRewardRedeemModal] = useState(false);
  const [selectedReward, setSelectedReward] = useState<CustomerPromotionReward | null>(null);
  const [selectedRedemptionOrderId, setSelectedRedemptionOrderId] = useState('');
  const [isRedeemingReward, setIsRedeemingReward] = useState(false);
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
      const [cloudCustomers, cloudCustomerDeletions, cloudTransactions, cloudPointsConfigs, availableRewards, pendingRewards] = await Promise.all([
        smartGetDocuments('customers', true),
        smartGetDocuments('customer_deletions', true),
        smartGetDocuments('points_transactions', true),
        smartGetDocuments('exchange_rate', true),
        smartGetDocumentsWhereEqual('customer_rewards', 'status', 'available', true),
        smartGetDocumentsWhereEqual('customer_rewards', 'status', 'pending', true),
      ]);

      const activeCustomers = filterActiveCustomers(cloudCustomers, cloudCustomerDeletions);
      await dataManager.saveData('customers', activeCustomers, { syncFirestore: false, notify: false });
      dataManager.clearCache('customers');
      setCustomers(activeCustomers);
      setTransactions(cloudTransactions as PointsTransaction[]);
      saveScopedPointsTransactions(cloudTransactions as PointsTransaction[]);
      saveLocalCollection('customer_deletions', cloudCustomerDeletions);
      setPromotionRewards(previous => {
        const merged = new Map<string, CustomerPromotionReward>();
        previous.filter(reward => reward.status !== 'available' && reward.status !== 'pending')
          .forEach(reward => merged.set(reward.id, reward));
        [...availableRewards, ...pendingRewards].forEach(reward => merged.set(reward.id, reward as CustomerPromotionReward));
        const nextRewards = Array.from(merged.values());
        saveLocalCollection('customer_rewards', nextRewards);
        return nextRewards;
      });

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
      alert(translationRef.current('customer.alert.refreshFailed'));
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

  useEffect(() => {
    const customerId = selectedCustomerRow?.id;
    if (!customerId) return;
    let cancelled = false;

    smartGetDocumentsWhereEqual('customer_rewards', 'customerId', customerId, true)
      .then(rows => {
        if (cancelled) return;
        const customerRewards = rows as CustomerPromotionReward[];
        setPromotionRewards(previous => {
          const merged = new Map<string, CustomerPromotionReward>();
          previous.filter(reward => reward.customerId !== customerId)
            .forEach(reward => merged.set(reward.id, reward));
          customerRewards.forEach(reward => merged.set(reward.id, reward));
          const nextRewards = Array.from(merged.values());
          saveLocalCollection('customer_rewards', nextRewards);
          return nextRewards;
        });
      })
      .catch(error => console.error('load customer rewards failed:', error));

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerRow?.id]);

  useEffect(() => {
    const customerId = selectedCustomerRow?.id;
    if (!customerId) return;
    setPromotionRewards(previous => {
      let changed = false;
      const nextRewards = previous.map(reward => {
        if (reward.customerId !== customerId) return reward;
        const sourceOrder = orders.find(order => order.id === reward.orderId);
        const nextReward = reconcilePromotionReward(reward, sourceOrder as any);
        if (nextReward.status === reward.status) return reward;
        changed = true;
        smartUpdateDocument('customer_rewards', reward.id, nextReward, { localFirst: true }).catch(() => undefined);
        return nextReward;
      });
      if (!changed) return previous;
      saveLocalCollection('customer_rewards', nextRewards);
      return nextRewards;
    });
  }, [orders, selectedCustomerRow?.id]);

  const selectedPromotionRewards = React.useMemo(() => promotionRewards
    .filter(reward => reward.customerId === selectedCustomerRow?.id)
    .sort((left, right) => Date.parse(right.drawnAt || '') - Date.parse(left.drawnAt || '')),
  [promotionRewards, selectedCustomerRow?.id]);

  const availablePromotionRewards = React.useMemo(
    () => selectedPromotionRewards.filter(reward => reward.status === 'available'),
    [selectedPromotionRewards]
  );

  const eligibleRedemptionOrders = React.useMemo(() => {
    if (!selectedReward) return [];
    return orders.filter(order => !getPromotionRedemptionError(
      selectedReward,
      order as unknown as PromotionRedemptionOrderLike
    ));
  }, [orders, selectedReward]);

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

  const openRewardRedemption = (reward: CustomerPromotionReward) => {
    const candidates = orders.filter(order => !getPromotionRedemptionError(
      reward,
      order as unknown as PromotionRedemptionOrderLike
    ));
    setSelectedReward(reward);
    setSelectedRedemptionOrderId(candidates[0]?.id || '');
    setShowRewardRedeemModal(true);
  };

  const closeRewardRedemption = () => {
    if (isRedeemingReward) return;
    setShowRewardRedeemModal(false);
    setSelectedReward(null);
    setSelectedRedemptionOrderId('');
  };

  const handleRedeemPromotionReward = async () => {
    if (!selectedReward || !selectedRedemptionOrderId) return;
    const targetOrder = orders.find(order => order.id === selectedRedemptionOrderId);
    if (!targetOrder) {
      alert(t('customer.reward.alert.orderMissing'));
      return;
    }

    setIsRedeemingReward(true);
    try {
      let operator = '';
      try {
        const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}');
        operator = currentUser.name || currentUser.username || currentUser.displayName || '';
      } catch {
        operator = '';
      }
      const menuItem = selectedReward.menuItemId
        ? menuItems.find(item => item.id === selectedReward.menuItemId)
        : undefined;
      const rewardMenuFields = menuItem
        ? {
            category: menuItem.category,
            ...(menuItem.type ? { type: menuItem.type } : {}),
            ...(menuItem.stockItemId ? { stockItemId: menuItem.stockItemId } : {}),
            ...(menuItem.ingredients ? { ingredients: menuItem.ingredients } : {}),
          }
        : {};
      const rewardItem = selectedReward.prizeType === 'dish' || selectedReward.prizeType === 'gift'
        ? {
            ...rewardMenuFields,
            id: `promotion-${selectedReward.id}`,
            menuItemId: selectedReward.menuItemId || selectedReward.prizeId,
            name: selectedReward.rewardLabel,
            quantity: 1,
            price: 0,
            subtotal: 0,
            sentQuantity: 0,
            promotionRewardId: selectedReward.id,
          }
        : undefined;

      const result = await redeemCustomerPromotionReward(
        selectedReward,
        targetOrder as unknown as PromotionRedemptionOrderLike,
        operator,
        rewardItem
      );
      setPromotionRewards(previous => {
        const nextRewards = previous.map(reward => reward.id === result.reward.id ? result.reward : reward);
        saveLocalCollection('customer_rewards', nextRewards);
        return nextRewards;
      });
      setOrders(previous => previous.map(order => (
        order.id === result.order.id ? result.order as any : order
      )));
      setShowRewardRedeemModal(false);
      setSelectedReward(null);
      setSelectedRedemptionOrderId('');
      alert(result.pendingSync
        ? t('customer.reward.alert.savedOffline')
        : t('customer.reward.alert.redeemed'));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const messageKey: TranslationKey = code === 'redemption-order-too-small'
        ? 'customer.reward.alert.orderTooSmall'
        : code === 'redemption-order-paid'
          ? 'customer.reward.alert.orderPaid'
          : code === 'reward-not-available'
            ? 'customer.reward.alert.notAvailable'
            : 'customer.reward.alert.failed';
      alert(t(messageKey));
    } finally {
      setIsRedeemingReward(false);
    }
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleAddCustomer = async () => {
    if (!formData.name.trim()) {
      alert(t('customer.alert.nameRequired'));
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
      alert(t('customer.alert.saveFailed'));
      return;
    }
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setShowAddModal(false);
    resetForm();
    alert(t('customer.alert.added'));
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
      alert(t('customer.alert.saveFailed'));
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setShowEditModal(false);
    resetForm();
    alert(t('customer.alert.updated'));
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm(t('customer.confirm.delete'))) return;

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
      alert(t('customer.alert.deleteFailed'));
      return;
    }
    setCustomers(nextCustomers);
    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer(null);
    }
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    alert(t('customer.alert.deleted'));
  };

  const handleManagePoints = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPointsAmount(0);
    setShowPointsModal(true);
  };

  const handleAddPoints = async () => {
    if (!selectedCustomer || pointsAmount <= 0) {
      alert(t('customer.alert.invalidPoints'));
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
      alert(t('customer.alert.pointsSaveFailed'));
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setTransactions(updatedTransactions);
    saveScopedPointsTransactions(updatedTransactions);
    setShowPointsModal(false);
    setPointsAmount(0);
    alert(`${t('customer.alert.pointsAdded')} ${pointsAmount}`);
  };

  const handleSavePointsSettings = async () => {
    const earnRate = Number(tempPointsConfig.pointsEarnPerCurrency);
    const redeemRate = Number(tempPointsConfig.pointsToCurrency);

    if (!Number.isFinite(earnRate) || earnRate < 0) {
      alert(t('customer.alert.invalidEarnRate'));
      return;
    }

    if (!Number.isFinite(redeemRate) || redeemRate <= 0) {
      alert(t('customer.alert.invalidRedeemRate'));
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
      alert(t('customer.alert.settingsSaved'));
    } catch (error) {
      console.error('保存积分设置失败:', error);
      alert(t('customer.alert.settingsSaveFailed'));
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
      alert(t('customer.alert.invalidRedeemPoints'));
      return;
    }

    if (redeemAmount > selectedCustomer.points) {
      alert(t('customer.alert.insufficientPoints'));
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
      alert(t('customer.alert.redeemSaveFailed'));
      return;
    }
    setCustomers(nextCustomers);
    setSelectedCustomer(updatedCustomer);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    setTransactions(updatedTransactions);
    saveScopedPointsTransactions(updatedTransactions);
    setShowRedeemModal(false);
    setRedeemAmount(0);
    alert(`${t('customer.alert.redeemed')} C$ ${cashValue.toFixed(2)}`);
  };

  const handleResetPoints = async (customerId: string) => {
    if (!window.confirm(t('customer.confirm.resetPoints'))) return;

    const nextCustomers = customers.map(customer =>
      customer.id === customerId ? { ...customer, points: 0 } : customer
    );
    const updatedCustomer = nextCustomers.find(customer => customer.id === customerId);
    if (!updatedCustomer) return;

    try {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
    } catch (error) {
      console.error('重置积分失败:', error);
      alert(t('customer.alert.resetFailed'));
      return;
    }
    setCustomers(nextCustomers);
    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer(updatedCustomer);
    }
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    alert(t('customer.alert.resetDone'));
  };

  const renderCustomerForm = (mode: 'add' | 'edit') => (
    <>
      <div style={styles.formGroup}>
        <label style={styles.label}>{t('customer.name')} *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
          placeholder={t('customer.namePlaceholder')}
          style={styles.input}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>{t('customer.phone')}</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
          placeholder={t('customer.phonePlaceholder')}
          style={styles.input}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>{t('customer.notes')}</label>
        <textarea
          value={formData.notes}
          onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
          placeholder={t('customer.notesPlaceholder')}
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
          {t('customer.cancel')}
        </button>
        <button
          onClick={mode === 'add' ? handleAddCustomer : handleSaveEdit}
          style={buttonStyle('primary')}
        >
          {t('customer.save')}
        </button>
      </div>
    </>
  );

  const detailCustomer = selectedCustomerRow;

  return (
    <div style={styles.container} data-customer-center="true">
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.title}>{t('customer.title')}</h1>
          <p style={styles.subtitle}>{t('customer.subtitle')}</p>
        </div>
        <div style={styles.actions}>
          <div style={styles.syncText}>
            {lastSyncedAt ? `${t('customer.synced')} ${lastSyncedAt.toLocaleTimeString(language === 'zh-CN' ? 'zh-CN' : 'es-NI')}` : t('customer.notSynced')}
          </div>
          <button onClick={refreshCustomerData} disabled={isRefreshing} style={buttonStyle('secondary')}>
            {isRefreshing ? t('customer.refreshing') : t('customer.refresh')}
          </button>
          <button onClick={openAddModal} style={buttonStyle('primary')}>
            {t('customer.add')}
          </button>
        </div>
      </div>

      <div style={styles.kpiGrid} data-customer-kpis="true">
        {[
          { label: t('customer.kpi.total'), value: formatNumber(summary.totalCustomers), accent: colors.teal },
          { label: t('customer.kpi.active'), value: formatNumber(summary.activeCustomers), accent: colors.success },
          { label: t('customer.kpi.sleeping'), value: formatNumber(summary.sleepingCustomers), accent: colors.amber },
          { label: t('customer.kpi.highValue'), value: formatNumber(summary.highValueCustomers), accent: colors.blue },
          { label: t('customer.kpi.totalSpend'), value: formatMoney(summary.totalSpend), accent: colors.teal },
          { label: t('customer.kpi.averageSpend'), value: formatMoney(summary.averageSpend), accent: colors.textPrimary },
          { label: t('customer.kpi.pointsLiability'), value: formatMoney(summary.pointsLiability), accent: colors.danger },
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
            <h2 style={styles.panelTitle}>{t('customer.list.title')}</h2>
            <span style={styles.muted}>{t('customer.list.showing')} {filteredCustomers.length} / {customerRows.length}</span>
          </div>

          <div style={styles.toolbar}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('customer.searchPlaceholder')}
              style={styles.input}
            />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CustomerSortKey)} style={styles.select}>
              <option value="recent">{t('customer.sort.recent')}</option>
              <option value="spend">{t('customer.sort.spend')}</option>
              <option value="points">{t('customer.sort.points')}</option>
              <option value="visits">{t('customer.sort.visits')}</option>
              <option value="name">{t('customer.name')}</option>
            </select>
          </div>

          <div style={styles.segmentBar} data-customer-segments="true">
            {[
              { id: 'all', label: t('customer.filter.all') },
              { id: 'vip', label: t('customer.filter.vip') },
              { id: 'active', label: t('customer.filter.active') },
              { id: 'sleeping', label: t('customer.filter.sleeping') },
              { id: 'points', label: t('customer.filter.points') },
              { id: 'new', label: t('customer.filter.new') },
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
            <div style={styles.empty}>{t('customer.noMatches')}</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>{t('customer.table.customer')}</th>
                    <th style={styles.th}>{t('customer.table.status')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('customer.table.points')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('customer.table.rewards')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('customer.table.totalSpend')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('customer.table.visits')}</th>
                    <th style={styles.th}>{t('customer.table.lastVisit')}</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>{t('customer.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(customer => {
                    const levelInfo = levelConfig[getCustomerLevel(customer.points)];
                    const isSelected = selectedCustomerRow?.id === customer.id;
                    const availableRewards = promotionRewards.filter(reward => (
                      reward.customerId === customer.id && reward.status === 'available'
                    ));
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
                          <div style={styles.muted}>{customer.phone || t('customer.phoneMissing')}</div>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={badgeStyle(customer.segment)}>{t(segmentLabelKeys[customer.segment])}</span>
                            <span style={{
                              ...badgeStyle('new'),
                              color: levelInfo.color,
                              background: levelInfo.bg,
                            }}>
                              {t(levelInfo.labelKey)}
                            </span>
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 650 }}>
                          {formatNumber(customer.points)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 650, color: availableRewards.length ? colors.amber : colors.textSecondary }}>
                          {availableRewards.length || '-'}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 650, color: colors.teal }}>
                          {formatMoney(customer.lifetimeSpend)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{formatNumber(customer.visitCount)}</td>
                        <td style={styles.td}>
                          <div>{formatDate(customer.lastVisitDate, language, t)}</div>
                          <div style={styles.muted}>
                            {customer.daysSinceVisit === null ? t('customer.noVisits') : `${customer.daysSinceVisit} ${t('customer.daysAgo')}`}
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'center' }} onClick={(event) => event.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleEditCustomer(record);
                            }} style={buttonStyle('secondary')}>{t('customer.edit')}</button>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleManagePoints(record);
                            }} style={buttonStyle('warning')}>{t('customer.points')}</button>
                            <button onClick={() => {
                              const record = getCustomerRecord(customer.id);
                              if (record) handleRedeemPoints(record);
                            }} style={buttonStyle('primary')}>{t('customer.redeem')}</button>
                            <button onClick={() => handleResetPoints(customer.id)} style={buttonStyle('ghost')}>{t('customer.reset')}</button>
                            <button onClick={() => handleDeleteCustomer(customer.id)} style={buttonStyle('danger')}>{t('customer.delete')}</button>
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
            <h2 style={styles.panelTitle}>{t('customer.detail.title')}</h2>
            {detailCustomer && <span style={badgeStyle(detailCustomer.segment)}>{t(segmentLabelKeys[detailCustomer.segment])}</span>}
          </div>
          {detailCustomer ? (
            <div style={styles.detailBody}>
              <div>
                <h3 style={styles.detailName}>{detailCustomer.name}</h3>
                <div style={styles.muted}>{detailCustomer.phone || t('customer.phoneMissing')}</div>
                {detailCustomer.notes && <div style={{ ...styles.muted, marginTop: '0.45rem' }}>{detailCustomer.notes}</div>}
              </div>

              <div style={styles.metricGrid}>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>{t('customer.kpi.totalSpend')}</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.lifetimeSpend)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>{t('customer.detail.averageTicket')}</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.averageTicket)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>{t('customer.sort.points')}</div>
                  <div style={styles.kpiValue}>{formatNumber(detailCustomer.points)}</div>
                </div>
                <div style={styles.miniCard}>
                  <div style={styles.kpiLabel}>{t('customer.detail.redeemable')}</div>
                  <div style={styles.kpiValue}>{formatMoney(detailCustomer.redeemValue)}</div>
                </div>
              </div>

              <div style={styles.settingsCard} data-customer-rewards="true">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <div>
                    <div style={styles.panelTitle}>{t('customer.reward.title')}</div>
                    <div style={styles.muted}>{t('customer.reward.subtitle')}</div>
                  </div>
                  <span style={{
                    ...badgeStyle('sleeping'),
                    color: availablePromotionRewards.length ? colors.amber : colors.textSecondary,
                    background: availablePromotionRewards.length ? colors.amberSoft : colors.surfaceMuted,
                  }}>
                    {t('customer.reward.availableCount')} {availablePromotionRewards.length}
                  </span>
                </div>
                {selectedPromotionRewards.length === 0 ? (
                  <div style={styles.muted}>{t('customer.reward.empty')}</div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.55rem', maxHeight: '18rem', overflowY: 'auto' }}>
                    {selectedPromotionRewards.map(reward => {
                      const statusColor = reward.status === 'available'
                        ? colors.success
                        : reward.status === 'pending'
                          ? colors.amber
                          : reward.status === 'redeemed'
                            ? colors.blue
                            : colors.textSecondary;
                      return (
                        <div key={reward.id} style={{ ...styles.miniCard, background: colors.surface }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 650, color: colors.textPrimary }}>{reward.rewardLabel}</div>
                              <div style={{ ...styles.muted, marginTop: '0.2rem' }}>
                                {t('customer.reward.sourceOrder')} #{reward.orderNumber || reward.orderId} · {formatDate(reward.dateKey, language, t)}
                              </div>
                              {reward.redeemedOrderNumber && (
                                <div style={{ ...styles.muted, marginTop: '0.2rem' }}>
                                  {t('customer.reward.usedOn')} #{reward.redeemedOrderNumber}
                                </div>
                              )}
                            </div>
                            <span style={{ ...badgeStyle('new'), color: statusColor, background: colors.surfaceMuted, flexShrink: 0 }}>
                              {t(`customer.reward.status.${reward.status}` as TranslationKey)}
                            </span>
                          </div>
                          {reward.status === 'available' && (
                            <button
                              onClick={() => openRewardRedemption(reward)}
                              style={{ ...buttonStyle('primary'), width: '100%', marginTop: '0.55rem' }}
                            >
                              {t('customer.reward.useNextOrder')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={styles.settingsCard}>
                <div style={{ ...styles.kpiLabel, marginBottom: '0.65rem' }}>{t('customer.pointsRules')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={styles.label}>{t('customer.earnRate')}</label>
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
                    <label style={styles.label}>{t('customer.redeemRate')}</label>
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
                  {isSavingPointsSettings
                    ? t('customer.saving')
                    : `${t('customer.saveRules')} C$1=${pointsEarnRate} ${t('customer.unit.points')}, ${pointsExchangeRate} ${t('customer.unit.points')} = C$1`}
                </button>
              </div>

              <div data-customer-point-ledger="true">
                <div style={{ ...styles.panelTitle, marginBottom: '0.3rem' }}>{t('customer.ledger.title')}</div>
                {selectedLedger.length === 0 ? (
                  <div style={styles.muted}>{t('customer.ledger.empty')}</div>
                ) : (
                  selectedLedger.map(transaction => (
                    <div key={transaction.id} style={styles.ledgerItem}>
                      <div>
                        <div style={{ fontWeight: 650 }}>{transaction.description || transaction.type}</div>
                        <div style={styles.muted}>{new Date(transaction.createdAt).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'es-NI')}</div>
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
            <div style={styles.empty}>{t('customer.detail.selectPrompt')}</div>
          )}
        </aside>
      </div>

      {showRewardRedeemModal && selectedReward && (
        <div style={styles.modal}>
          <div style={styles.modalContent} data-reward-redemption-modal="true">
            <h3 style={styles.modalTitle}>{t('customer.reward.redeemTitle')}</h3>
            <div style={styles.settingsCard}>
              <div style={styles.kpiLabel}>{t('customer.reward.currentReward')}</div>
              <div style={styles.detailName}>{selectedReward.rewardLabel}</div>
              <div style={{ ...styles.muted, marginTop: '0.35rem' }}>
                {t('customer.reward.code')} {selectedReward.code} · {t('customer.reward.sourceOrder')} #{selectedReward.orderNumber || selectedReward.orderId}
              </div>
            </div>
            <div style={{ ...styles.formGroup, marginTop: '0.9rem' }}>
              <label style={styles.label}>{t('customer.reward.selectOrder')}</label>
              {eligibleRedemptionOrders.length === 0 ? (
                <div style={{ ...styles.miniCard, color: colors.amber }}>
                  {t('customer.reward.noEligibleOrder')}
                </div>
              ) : (
                <select
                  value={selectedRedemptionOrderId}
                  onChange={event => setSelectedRedemptionOrderId(event.target.value)}
                  style={styles.select}
                >
                  {eligibleRedemptionOrders.map(order => (
                    <option key={order.id} value={order.id}>
                      #{order.orderNumber || order.id} · {order.orderType === 'dine_in' ? 'Mesa' : order.orderType === 'takeout' ? 'Barra' : 'Delivery'} · {formatMoney(order.totalAmount)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ ...styles.miniCard, marginTop: '0.7rem' }}>
              <div style={{ fontWeight: 650 }}>{t('customer.reward.ruleTitle')}</div>
              <div style={{ ...styles.muted, marginTop: '0.3rem' }}>{t('customer.reward.ruleText')}</div>
            </div>
            <div style={styles.modalActions}>
              <button onClick={closeRewardRedemption} disabled={isRedeemingReward} style={buttonStyle('secondary')}>
                {t('customer.cancel')}
              </button>
              <button
                onClick={handleRedeemPromotionReward}
                disabled={isRedeemingReward || !selectedRedemptionOrderId}
                style={{
                  ...buttonStyle('primary'),
                  opacity: isRedeemingReward || !selectedRedemptionOrderId ? 0.55 : 1,
                  cursor: isRedeemingReward || !selectedRedemptionOrderId ? 'not-allowed' : 'pointer',
                }}
              >
                {isRedeemingReward ? t('customer.reward.redeeming') : t('customer.reward.confirmUse')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>{t('customer.addTitle')}</h3>
            {renderCustomerForm('add')}
          </div>
        </div>
      )}

      {showEditModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>{t('customer.editTitle')}</h3>
            {renderCustomerForm('edit')}
          </div>
        </div>
      )}

      {showPointsModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>{t('customer.pointsTitle')}</h3>
            <div style={styles.settingsCard}>
              <div style={styles.kpiLabel}>{t('customer.table.customer')}</div>
              <div style={styles.detailName}>{selectedCustomer.name}</div>
              <div style={{ ...styles.muted, marginTop: '0.35rem' }}>{t('customer.currentPoints')}: {formatNumber(selectedCustomer.points)}</div>
            </div>
            <div style={{ ...styles.formGroup, marginTop: '0.9rem' }}>
              <label style={styles.label}>{t('customer.addPoints')}</label>
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
                {t('customer.cancel')}
              </button>
              <button onClick={handleAddPoints} style={buttonStyle('warning')}>{t('customer.confirmAdd')}</button>
            </div>
          </div>
        </div>
      )}

      {showRedeemModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>{t('customer.redeemTitle')}</h3>
            <div style={styles.settingsCard}>
              <div style={styles.kpiLabel}>{t('customer.table.customer')}</div>
              <div style={styles.detailName}>{selectedCustomer.name}</div>
              <div style={{ ...styles.muted, marginTop: '0.35rem' }}>
                {t('customer.availablePoints')}: {formatNumber(selectedCustomer.points)}, {t('customer.rate')}: {pointsExchangeRate} {t('customer.unit.points')} = C$ 1.00
              </div>
            </div>
            <div style={{ ...styles.formGroup, marginTop: '0.9rem' }}>
              <label style={styles.label}>{t('customer.redeemPoints')}</label>
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
                <div style={styles.kpiLabel}>{t('customer.redeemableAmount')}</div>
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
                {t('customer.cancel')}
              </button>
              <button onClick={handleConfirmRedeem} style={buttonStyle('primary')}>{t('customer.confirmRedeem')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersModule;
