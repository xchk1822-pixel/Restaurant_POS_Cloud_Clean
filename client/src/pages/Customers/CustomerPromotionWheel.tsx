import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, Order } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { dataService } from '../../services/DataService';
import {
  smartGetDocuments,
  smartGetDocumentsByDateRange,
  smartGetDocumentsWhereEqual,
  smartUpdateDocument,
} from '../../services/smartSyncService';
import {
  buildPromotionRewardId,
  arrangePromotionPrizes,
  CustomerPromotionPrize,
  CustomerPromotionReward,
  CustomerPromotionSettings,
  getCustomerPromotionBalance,
  getDefaultPromotionSettings,
  getEligiblePromotionPrizes,
  getPromotionRewardAmount,
  getPromotionRewardLabel,
  getRewardStatusForOrder,
  isPromotionOrderCandidate,
  reconcilePromotionReward,
  selectPlannedPromotionPrize,
} from '../../utils/customerPromotion';
import { formatNicaraguaDateTime, getLocalDateTimeString, getTodayString, toTimestampMillis } from '../../utils/localTime';
import {
  bindPromotionOrderCustomer,
  claimCustomerPromotionReward,
  getPromotionTerminalId,
  loadCustomerPromotionSettings,
} from '../../services/customerPromotionService';
import {
  buildCustomerIdFromPhone,
  filterActiveCustomers,
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from '../../utils/customerRecords';
import tableFoodBackground from '../../assets/pos/table-food-background.jpg';
import './CustomerPromotionWheel.css';

interface CustomerRecord {
  id: string;
  name: string;
  phone?: string;
  phoneKey?: string;
  [key: string]: unknown;
}

const MAX_CHARGE_MS = 3200;

const formatMoney = (value: number) => `C$${Number(value || 0).toLocaleString('es-NI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const getRandomValue = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 4294967296;
};

const getLocalRewards = (): CustomerPromotionReward[] => {
  try {
    const key = dataService.getStoreKey('customer_rewards');
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getLocalCustomers = (): CustomerRecord[] => {
  const records = dataService.getData('customers');
  return Array.isArray(records) ? filterActiveCustomers(records) as CustomerRecord[] : [];
};

const mergeRewards = (...groups: CustomerPromotionReward[][]): CustomerPromotionReward[] => {
  const byId = new Map<string, CustomerPromotionReward>();
  groups.flat().forEach(reward => {
    const existing = byId.get(reward.id);
    if (!existing || Number((reward as any).version || 0) >= Number((existing as any).version || 0)) {
      byId.set(reward.id, reward);
    }
  });
  return Array.from(byId.values()).sort((a, b) => toTimestampMillis(b.drawnAt) - toTimestampMillis(a.drawnAt));
};

const CustomerPromotionWheel: React.FC = () => {
  const navigate = useNavigate();
  const { orders, setOrders } = useAppContext();
  const { user } = useAuth();
  const { t } = useI18n();
  const today = getTodayString();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const chargeStartRef = useRef<number | null>(null);
  const chargeFrameRef = useRef<number | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>(getLocalCustomers);
  const [rewards, setRewards] = useState<CustomerPromotionReward[]>(getLocalRewards);
  const [settings, setSettings] = useState<CustomerPromotionSettings>(() => getDefaultPromotionSettings(today));
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resultReward, setResultReward] = useState<CustomerPromotionReward | null>(null);
  const [statusText, setStatusText] = useState(t('promotion.status.ready'));
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [isCharging, setIsCharging] = useState(false);
  const [chargeLevel, setChargeLevel] = useState(0);
  const [spinDurationMs, setSpinDurationMs] = useState(8200);
  const [bindingOrder, setBindingOrder] = useState<Order | null>(null);
  const [bindingPhone, setBindingPhone] = useState('');
  const [bindingName, setBindingName] = useState('');
  const [isBindingCustomer, setIsBindingCustomer] = useState(false);
  const [bindingError, setBindingError] = useState('');

  const storeId = dataService.getCurrentStoreId() || '';

  const loadPromotionData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudCustomers, todayRewards, activeSettings] = await Promise.all([
        smartGetDocuments('customers', true),
        smartGetDocumentsByDateRange('customer_rewards', 'dateKey', today, today, true),
        loadCustomerPromotionSettings(today, true),
      ]);
      const activeCustomers = filterActiveCustomers(cloudCustomers) as CustomerRecord[];
      setCustomers(activeCustomers.length > 0 ? activeCustomers : getLocalCustomers());
      setRewards(current => mergeRewards(current, getLocalRewards(), todayRewards as CustomerPromotionReward[]));
      setSettings(activeSettings);
      setLastSyncedAt(getLocalDateTimeString());
    } catch (error) {
      console.error('Customer promotion refresh failed:', error);
      setCustomers(current => current.length > 0 ? current : []);
      setRewards(current => mergeRewards(current, getLocalRewards()));
      setStatusText(t('promotion.status.localData'));
    } finally {
      setIsRefreshing(false);
    }
  }, [t, today]);

  useEffect(() => {
    loadPromotionData();
    return () => {
      if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
      if (chargeFrameRef.current) window.cancelAnimationFrame(chargeFrameRef.current);
    };
  }, [loadPromotionData]);

  const customerById = useMemo(() => new Map(customers.map(customer => [customer.id, customer])), [customers]);
  const todayCustomerOrders = useMemo(() => orders
    .filter(order => isPromotionOrderCandidate(order, today, settings.minimumOrderAmount))
    .sort((a, b) => toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt)), [orders, today, settings.minimumOrderAmount]);

  const selectedOrder = useMemo(
    () => todayCustomerOrders.find(order => order.id === selectedOrderId) || null,
    [todayCustomerOrders, selectedOrderId]
  );
  const selectedCustomer = selectedOrder ? customerById.get(String(selectedOrder.customerId || '')) : undefined;
  const selectedReward = selectedOrder ? rewards.find(reward => reward.orderId === selectedOrder.id) : undefined;
  useEffect(() => {
    if (!isSpinning && !isCharging) {
      setStatusText(selectedReward ? t('promotion.status.used') : t('promotion.status.ready'));
    }
  }, [t, selectedReward, isSpinning, isCharging]);
  const eligiblePrizes = useMemo(
    () => selectedOrder ? getEligiblePromotionPrizes(settings, Number(selectedOrder.totalAmount || 0), rewards) : [],
    [selectedOrder, settings, rewards]
  );
  const wheelPrizes = useMemo(() => arrangePromotionPrizes(
    settings.prizes.filter(prize => prize.active),
    `${selectedOrderId || today}:${settings.updatedAt || today}`
  ), [settings.prizes, settings.updatedAt, selectedOrderId, today]);
  const selectedCustomerBalance = selectedCustomer
    ? getCustomerPromotionBalance(rewards, selectedCustomer.id)
    : 0;
  const usedPrizeCounts = useMemo(() => rewards.reduce<Record<string, number>>((counts, reward) => {
    if (reward.dateKey === today && reward.status !== 'void') {
      counts[reward.prizeId] = Number(counts[reward.prizeId] || 0) + 1;
    }
    return counts;
  }, {}), [rewards, today]);
  const normalizedBindingPhone = useMemo(() => normalizeCustomerPhone(bindingPhone), [bindingPhone]);
  const matchedBindingCustomer = useMemo(() => {
    if (!normalizedBindingPhone) return undefined;
    return customers.find(customer => (
      normalizeCustomerPhone(customer.phoneKey || customer.phone) === normalizedBindingPhone
    ));
  }, [customers, normalizedBindingPhone]);

  const loadCustomerRewardAccount = useCallback(async (customerId: string) => {
    try {
      const customerRewards = await smartGetDocumentsWhereEqual('customer_rewards', 'customerId', customerId, true);
      setRewards(current => mergeRewards(current, customerRewards as CustomerPromotionReward[]));
    } catch (error) {
      console.warn('Customer promotion account refresh failed:', error);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer?.id) loadCustomerRewardAccount(selectedCustomer.id);
  }, [selectedCustomer?.id, loadCustomerRewardAccount]);

  useEffect(() => {
    const orderById = new Map(orders.map(order => [order.id, order]));
    const changed = rewards
      .map(reward => reconcilePromotionReward(reward, orderById.get(reward.orderId)))
      .filter((reward, index) => reward.status !== rewards[index].status);
    if (changed.length === 0) return;
    setRewards(current => mergeRewards(current, changed));
    changed.forEach(reward => {
      void smartUpdateDocument('customer_rewards', reward.id, {
        status: reward.status,
        availableAt: reward.availableAt || null,
        voidedAt: reward.voidedAt || null,
      });
    });
  }, [orders, rewards]);

  const getPrizeLabel = useCallback((prize: CustomerPromotionPrize) => {
    if (prize.type === 'full_order') return t('promotion.prize.fullOrder');
    if (prize.type === 'fixed') return formatMoney(prize.amount);
    return String(prize.label || t(`promotion.prize.${prize.type}` as any));
  }, [t]);

  const getRewardDisplay = useCallback((reward: CustomerPromotionReward) => {
    if (reward.prizeType === 'fixed') return formatMoney(reward.rewardAmount);
    if (reward.prizeType === 'full_order') return t('promotion.prize.fullOrder');
    return reward.rewardLabel || t(`promotion.prize.${reward.prizeType}` as any);
  }, [t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 18;
    const prizes = wheelPrizes;
    context.clearRect(0, 0, size, size);
    if (prizes.length === 0) return;
    const sweep = (Math.PI * 2) / prizes.length;

    prizes.forEach((prize, index) => {
      const start = -Math.PI / 2 + index * sweep;
      const end = start + sweep;
      const middle = start + sweep / 2;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, start, end);
      context.closePath();
      context.fillStyle = prize.color;
      context.fill();
      context.strokeStyle = '#fff6dc';
      context.lineWidth = 5;
      context.stroke();

      context.save();
      context.translate(center + Math.cos(middle) * radius * 0.63, center + Math.sin(middle) * radius * 0.63);
      context.rotate(middle + Math.PI / 2);
      context.fillStyle = '#ffffff';
      context.font = `${prize.type === 'fixed' ? '800 30px' : '800 23px'} Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const label = getPrizeLabel(prize).replace('.00', '');
      if (prize.type === 'full_order') {
        context.fillText(t('promotion.prize.fullShort1'), 0, -17);
        context.fillText(t('promotion.prize.fullShort2'), 0, 18);
      } else if (prize.type === 'fixed') {
        context.fillText(label, 0, 0);
      } else {
        const words = label.split(/\s+/);
        const midpoint = Math.ceil(words.length / 2);
        const lines = words.length > 1 ? [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')] : [label.slice(0, 13), label.slice(13, 26)];
        context.fillText(lines[0], 0, lines[1] ? -14 : 0);
        if (lines[1]) context.fillText(lines[1], 0, 16);
      }
      context.restore();
    });

    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.strokeStyle = '#f5bd39';
    context.lineWidth = 15;
    context.stroke();
  }, [wheelPrizes, getPrizeLabel, t]);

  const selectOrder = (order: Order) => {
    if (isSpinning) return;
    setSelectedOrderId(order.id);
    setResultReward(null);
    const existing = rewards.find(reward => reward.orderId === order.id);
    setStatusText(existing ? t('promotion.status.used') : t('promotion.status.ready'));
    if (!order.customerId) {
      setBindingOrder(order);
      setBindingPhone('');
      setBindingName('');
      setBindingError('');
    }
  };

  const closeCustomerBinding = () => {
    if (isBindingCustomer) return;
    setBindingOrder(null);
    setBindingError('');
  };

  const saveCustomerBinding = async () => {
    if (!bindingOrder || isBindingCustomer) return;
    if (!isValidCustomerPhone(bindingPhone)) {
      setBindingError(t('promotion.binding.invalidPhone'));
      return;
    }
    if (!matchedBindingCustomer && !bindingName.trim()) {
      setBindingError(t('promotion.binding.nameRequired'));
      return;
    }

    const now = new Date().toISOString();
    const customer: CustomerRecord = matchedBindingCustomer || {
      id: buildCustomerIdFromPhone(bindingPhone),
      name: bindingName.trim(),
      phone: bindingPhone.trim(),
      phoneKey: normalizedBindingPhone,
      points: 0,
      totalSpent: 0,
      visitCount: 0,
      createdAt: now,
      notes: '',
      level: 'bronze',
    };

    setIsBindingCustomer(true);
    setBindingError('');
    try {
      const result = await bindPromotionOrderCustomer(
        bindingOrder,
        { ...customer, phone: customer.phone || bindingPhone.trim(), phoneKey: normalizedBindingPhone },
        user?.name || user?.username || 'system'
      );
      setCustomers(current => [
        ...current.filter(item => item.id !== result.customer.id),
        result.customer as CustomerRecord,
      ]);
      setOrders(current => current.map(item => (
        item.id === bindingOrder.id ? { ...item, ...result.order } as Order : item
      )));
      setSelectedOrderId(bindingOrder.id);
      setBindingOrder(null);
      setStatusText(result.pendingSync ? t('promotion.binding.pendingSync') : t('promotion.binding.saved'));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setBindingError(code === 'promotion-order-already-bound'
        ? t('promotion.binding.alreadyBound')
        : code === 'promotion-invalid-order'
          ? t('promotion.status.orderChanged')
          : t('promotion.binding.saveFailed'));
    } finally {
      setIsBindingCustomer(false);
    }
  };

  const startSpin = async (durationMs: number, turns: number) => {
    if (!selectedOrder || !selectedCustomer || isSpinning || selectedReward) return;
    const prize = selectPlannedPromotionPrize(
      settings,
      Number(selectedOrder.totalAmount || 0),
      usedPrizeCounts,
      getRandomValue()
    );
    if (!prize) {
      setStatusText(t('promotion.status.noPrize'));
      return;
    }

    setIsSpinning(true);
    setStatusText(t('promotion.status.validating'));
    const drawnAt = new Date().toISOString();
    const rewardAmount = getPromotionRewardAmount(prize, Number(selectedOrder.totalAmount || 0));
    const suffix = String(Math.floor(getRandomValue() * 10000)).padStart(4, '0');
    const proposedReward: CustomerPromotionReward = {
      id: buildPromotionRewardId(selectedOrder.id),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      orderId: selectedOrder.id,
      orderNumber: String(selectedOrder.orderNumber || selectedOrder.id),
      orderAmount: Number(selectedOrder.totalAmount || 0),
      prizeId: prize.id,
      prizeType: prize.type,
      rewardAmount,
      rewardLabel: getPromotionRewardLabel(prize),
      ...(prize.menuItemId ? { menuItemId: prize.menuItemId } : {}),
      status: getRewardStatusForOrder(selectedOrder.status),
      dateKey: today,
      code: `RP-${today.replace(/-/g, '').slice(2)}-${suffix}`,
      drawnAt,
      drawnBy: user?.name || user?.username || 'system',
      terminalId: getPromotionTerminalId(storeId),
    };

    try {
      const claim = await claimCustomerPromotionReward(proposedReward, selectedOrder);
      if (claim.duplicate) {
        setRewards(current => mergeRewards(current, [claim.reward]));
        setResultReward(claim.reward);
        setStatusText(t('promotion.status.used'));
        setIsSpinning(false);
        return;
      }

      setRewards(current => mergeRewards(current, [claim.reward]));
      const matchingIndexes = wheelPrizes.reduce<number[]>((indexes, item, itemIndex) => (
        item.id === claim.reward.prizeId ? [...indexes, itemIndex] : indexes
      ), []);
      const index = matchingIndexes.length > 0
        ? matchingIndexes[Number.parseInt(suffix, 10) % matchingIndexes.length]
        : wheelPrizes.findIndex(item => item.id === prize.id);
      const sweep = 360 / wheelPrizes.length;
      const target = 360 - (index * sweep + sweep / 2);
      setSpinDurationMs(durationMs);
      setRotation(current => {
        const normalized = ((current % 360) + 360) % 360;
        const landingDelta = (target - normalized + 360) % 360;
        return current + turns * 360 + landingDelta;
      });
      setStatusText(t('promotion.status.spinning'));
      resultTimerRef.current = window.setTimeout(() => {
        setResultReward(claim.reward);
        setStatusText(claim.pendingSync ? t('promotion.status.pendingSync') : t('promotion.status.used'));
        setIsSpinning(false);
      }, durationMs + 120);
    } catch (error) {
      console.error('Customer promotion claim failed:', error);
      const code = error instanceof Error ? error.message : '';
      setStatusText(code === 'promotion-daily-limit'
        ? t('promotion.status.limitReached')
        : code === 'promotion-invalid-order' || code === 'promotion-customer-mismatch'
          ? t('promotion.status.orderChanged')
          : t('promotion.status.saveFailed'));
      setIsSpinning(false);
    }
  };

  const stopChargeAnimation = () => {
    if (chargeFrameRef.current) window.cancelAnimationFrame(chargeFrameRef.current);
    chargeFrameRef.current = null;
  };

  const beginCharge = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!selectedOrder || !selectedCustomer || selectedReward || isSpinning || eligiblePrizes.length === 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    chargeStartRef.current = performance.now();
    setIsCharging(true);
    setChargeLevel(0.02);
    setStatusText(t('promotion.status.charging'));
    const updateCharge = () => {
      if (chargeStartRef.current === null) return;
      setChargeLevel(Math.min(1, (performance.now() - chargeStartRef.current) / MAX_CHARGE_MS));
      chargeFrameRef.current = window.requestAnimationFrame(updateCharge);
    };
    chargeFrameRef.current = window.requestAnimationFrame(updateCharge);
  };

  const finishCharge = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (chargeStartRef.current === null) return;
    event?.preventDefault();
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const level = Math.max(0.08, Math.min(1, (performance.now() - chargeStartRef.current) / MAX_CHARGE_MS));
    chargeStartRef.current = null;
    stopChargeAnimation();
    setIsCharging(false);
    setChargeLevel(level);
    const durationMs = Math.round(5200 + level * 5800);
    const turns = 5 + Math.round(level * 8);
    void startSpin(durationMs, turns);
  };

  const cancelCharge = () => {
    chargeStartRef.current = null;
    stopChargeAnimation();
    setIsCharging(false);
    setChargeLevel(0);
    if (!isSpinning) setStatusText(t('promotion.status.ready'));
  };

  const recentRewards = rewards.filter(reward => reward.dateKey === today).slice(0, 30);

  return (
    <div className="promotion-page">
      <div className="promotion-toolbar">
        <div>
          <div className="promotion-breadcrumb">
            <button type="button" onClick={() => navigate('/customers')}>{t('nav.customers.records')}</button>
            <span>/</span>
            <strong>{t('nav.customers.promotion')}</strong>
          </div>
          <h1>{t('promotion.title')}</h1>
          <p>{t('promotion.subtitle')}</p>
        </div>
        <div className="promotion-toolbar-actions">
          <span>{lastSyncedAt ? `${t('promotion.synced')} ${lastSyncedAt.slice(11, 16)}` : t('promotion.notSynced')}</span>
          <button type="button" className="promotion-button secondary" onClick={loadPromotionData} disabled={isRefreshing}>
            {isRefreshing ? t('promotion.refreshing') : t('promotion.refresh')}
          </button>
        </div>
      </div>

      <div className="promotion-main-grid">
        <section className="promotion-order-panel">
          <div className="promotion-section-heading">
            <div>
              <span>{t('promotion.orders.eyebrow')}</span>
              <h2>{t('promotion.orders.title')}</h2>
            </div>
            <b>{todayCustomerOrders.length}</b>
          </div>
          <div className="promotion-order-list">
            {todayCustomerOrders.length === 0 ? (
              <div className="promotion-empty">{t('promotion.orders.empty')}</div>
            ) : todayCustomerOrders.map(order => {
              const reward = rewards.find(item => item.orderId === order.id);
              const customer = customerById.get(String(order.customerId || ''));
              const needsBinding = !order.customerId;
              const active = selectedOrderId === order.id;
              return (
                <button
                  type="button"
                  key={order.id}
                  className={`promotion-order-card${active ? ' active' : ''}`}
                  onClick={() => selectOrder(order)}
                  disabled={isSpinning}
                >
                  <span className="promotion-order-top">
                    <strong>#{order.orderNumber || order.id}</strong>
                    <em className={reward ? `reward-${reward.status}` : needsBinding ? 'needs-binding' : ''}>
                      {reward
                        ? t(`promotion.reward.${reward.status}` as any)
                        : needsBinding
                          ? t('promotion.binding.required')
                          : t('promotion.orders.available')}
                    </em>
                  </span>
                  <span className={`promotion-order-customer${needsBinding ? ' needs-binding' : ''}`}>
                    {customer?.name || t('promotion.binding.noCustomer')}
                  </span>
                  <span className="promotion-order-meta">
                    <small>{order.orderType === 'dine_in' ? `${t('promotion.orders.table')} ${order.tableNumber}` : order.orderType === 'takeout' ? 'Barra' : 'Delivery'}</small>
                    <b>{formatMoney(order.totalAmount)}</b>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="promotion-security-note">
            <strong>{t('promotion.security.title')}</strong>
            <span>{t('promotion.security.body')}</span>
          </div>
        </section>

        <section className="promotion-stage" style={{ backgroundImage: `linear-gradient(rgba(255,251,244,.76), rgba(255,251,244,.9)), url(${tableFoodBackground})` }}>
          <div className="promotion-stage-badge">{t('promotion.nextVisit')}</div>
          <div className={`promotion-wheel-shell${isCharging ? ' charging' : ''}${isSpinning ? ' spinning' : ''}`} style={{ '--charge-level': chargeLevel } as React.CSSProperties}>
            <div className="promotion-pointer" aria-hidden="true"><span /></div>
            <canvas
              ref={canvasRef}
              width="700"
              height="700"
              className="promotion-wheel-canvas"
              style={{ transform: `rotate(${rotation}deg)`, transitionDuration: isSpinning ? `${spinDurationMs}ms` : '0s' }}
            />
            <button
              type="button"
              className="promotion-wheel-hub"
              onPointerDown={beginCharge}
              onPointerUp={finishCharge}
              onPointerCancel={cancelCharge}
              disabled={!selectedOrder || !selectedCustomer || Boolean(selectedReward) || isSpinning || eligiblePrizes.length === 0}
              aria-label={t('promotion.holdPanda')}
            >
              <img src="/logo512.png" alt="Panda" />
              <span>{isCharging ? `${Math.round(chargeLevel * 100)}%` : t('promotion.hold')}</span>
            </button>
          </div>
          <div className="promotion-stage-status" role="status">{statusText}</div>
        </section>

        <section className="promotion-action-panel">
          {selectedOrder && selectedCustomer ? (
            <>
              <div className="promotion-customer-card">
                <div>
                  <span>{t('promotion.customer')}</span>
                  <strong>{selectedCustomer.name}</strong>
                  <small>{selectedCustomer.phone || t('promotion.noPhone')}</small>
                </div>
                <div className="promotion-balance">
                  <span>{t('promotion.availableBalance')}</span>
                  <strong>{formatMoney(selectedCustomerBalance)}</strong>
                </div>
              </div>
              <div className="promotion-order-amount">
                <span>{t('promotion.realOrderAmount')}</span>
                <strong>{formatMoney(selectedOrder.totalAmount)}</strong>
                <small>{t('promotion.amountLocked')}</small>
              </div>
              <div className="promotion-prize-preview">
                <span>{t('promotion.availablePrizes')}</span>
                <div>
                  {eligiblePrizes.map(prize => <b key={prize.id}>{getPrizeLabel(prize)}</b>)}
                </div>
              </div>
              {selectedReward ? (
                <div className="promotion-existing-reward">
                  <span>{t('promotion.rewardRecorded')}</span>
                  <strong>{getRewardDisplay(selectedReward)}</strong>
                  <small>{selectedReward.code} · {t(`promotion.reward.${selectedReward.status}` as any)}</small>
                </div>
              ) : (
                <div className={`promotion-charge-panel${isCharging ? ' active' : ''}`}>
                  <div>
                    <strong>{isSpinning ? t('promotion.spinning') : t('promotion.holdPanda')}</strong>
                    <span>{t('promotion.chargeHelp')}</span>
                  </div>
                  <div className="promotion-power-track" aria-hidden="true"><i style={{ width: `${Math.round(chargeLevel * 100)}%` }} /></div>
                  <small>{t('promotion.spinOnce')}</small>
                </div>
              )}
              <p className="promotion-next-use-note">{t('promotion.nextUseOnly')}</p>
            </>
          ) : selectedOrder ? (
            <div className="promotion-select-prompt promotion-bind-prompt">
              <img src="/logo512.png" alt="Panda" />
              <h2>{t('promotion.binding.required')}</h2>
              <p>{t('promotion.binding.help')}</p>
              <button
                type="button"
                className="promotion-button primary"
                onClick={() => {
                  setBindingOrder(selectedOrder);
                  setBindingPhone('');
                  setBindingName('');
                  setBindingError('');
                }}
              >
                {t('promotion.binding.open')}
              </button>
            </div>
          ) : (
            <div className="promotion-select-prompt">
              <img src="/logo512.png" alt="Panda" />
              <h2>{t('promotion.selectOrder')}</h2>
              <p>{t('promotion.selectOrderHelp')}</p>
            </div>
          )}
        </section>
      </div>

      <section className="promotion-ledger">
        <div className="promotion-section-heading">
          <div>
            <span>{t('promotion.ledger.eyebrow')}</span>
            <h2>{t('promotion.ledger.title')}</h2>
          </div>
          <b>{recentRewards.length}</b>
        </div>
        <div className="promotion-ledger-table-wrap">
          <table>
            <thead><tr>
              <th>{t('promotion.ledger.time')}</th><th>{t('promotion.ledger.customer')}</th><th>{t('promotion.ledger.order')}</th>
              <th>{t('promotion.ledger.amount')}</th><th>{t('promotion.ledger.reward')}</th><th>{t('promotion.ledger.status')}</th><th>{t('promotion.ledger.operator')}</th>
            </tr></thead>
            <tbody>
              {recentRewards.length === 0 ? (
                <tr><td colSpan={7} className="promotion-ledger-empty">{t('promotion.ledger.empty')}</td></tr>
              ) : recentRewards.map(reward => (
                <tr key={reward.id}>
                  <td>{formatNicaraguaDateTime(reward.drawnAt)}</td>
                  <td><strong>{reward.customerName}</strong><small>{reward.code}</small></td>
                  <td>#{reward.orderNumber}</td><td>{formatMoney(reward.orderAmount)}</td><td>{getRewardDisplay(reward)}</td>
                  <td><span className={`promotion-status reward-${reward.status}`}>{t(`promotion.reward.${reward.status}` as any)}</span></td>
                  <td>{reward.drawnBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bindingOrder && (
        <div className="promotion-modal-backdrop" role="presentation" onMouseDown={closeCustomerBinding}>
          <div className="promotion-customer-bind-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-binding-title" onMouseDown={event => event.stopPropagation()}>
            <div className="promotion-bind-header">
              <div>
                <span>{t('promotion.binding.eyebrow')}</span>
                <h2 id="promotion-binding-title">{t('promotion.binding.title')}</h2>
              </div>
              <button type="button" onClick={closeCustomerBinding} disabled={isBindingCustomer} aria-label={t('promotion.binding.close')}>×</button>
            </div>

            <div className="promotion-bind-order">
              <div><span>{t('promotion.ledger.order')}</span><strong>#{bindingOrder.orderNumber || bindingOrder.id}</strong></div>
              <div><span>{t('promotion.realOrderAmount')}</span><strong>{formatMoney(bindingOrder.totalAmount)}</strong></div>
            </div>

            <label className="promotion-bind-field">
              <span>{t('promotion.binding.phone')} *</span>
              <input
                type="tel"
                value={bindingPhone}
                onChange={event => {
                  setBindingPhone(event.target.value);
                  setBindingError('');
                }}
                placeholder={t('promotion.binding.phonePlaceholder')}
                autoFocus
              />
              <small>{t('promotion.binding.phoneHelp')}</small>
            </label>

            {matchedBindingCustomer ? (
              <div className="promotion-existing-customer">
                <span>{t('promotion.binding.existing')}</span>
                <strong>{matchedBindingCustomer.name}</strong>
                <small>{matchedBindingCustomer.phone}</small>
              </div>
            ) : (
              <label className="promotion-bind-field">
                <span>{t('promotion.binding.name')} *</span>
                <input
                  type="text"
                  value={bindingName}
                  onChange={event => {
                    setBindingName(event.target.value);
                    setBindingError('');
                  }}
                  placeholder={t('promotion.binding.namePlaceholder')}
                />
              </label>
            )}

            {bindingError && <div className="promotion-bind-error" role="alert">{bindingError}</div>}
            <div className="promotion-bind-actions">
              <button type="button" className="promotion-button secondary" onClick={closeCustomerBinding} disabled={isBindingCustomer}>{t('promotion.binding.cancel')}</button>
              <button type="button" className="promotion-button primary" onClick={saveCustomerBinding} disabled={isBindingCustomer}>
                {isBindingCustomer
                  ? t('promotion.binding.saving')
                  : matchedBindingCustomer
                    ? t('promotion.binding.useExisting')
                    : t('promotion.binding.createAndBind')}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultReward && (
        <div className="promotion-modal-backdrop">
          <div className="promotion-result-modal">
            <div className="promotion-result-star">★</div>
            <span>{t('promotion.result.congratulations')}</span>
            <h2>{t('promotion.result.won')}</h2>
            <strong>{getRewardDisplay(resultReward)}</strong>
            <p>{resultReward.status === 'available' ? t('promotion.result.available') : t('promotion.result.pending')}</p>
            <div><span>{t('promotion.result.code')}</span><b>{resultReward.code}</b></div>
            <button type="button" className="promotion-button primary" onClick={() => setResultReward(null)}>{t('promotion.result.done')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPromotionWheel;
