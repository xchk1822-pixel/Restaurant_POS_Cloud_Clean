import {
  ACTIVE_PROMOTION_SETTINGS_ID,
  arrangePromotionPrizes,
  buildPromotionRewardId,
  CustomerPromotionReward,
  getCustomerPromotionBalance,
  getDefaultPromotionSettings,
  getEligiblePromotionPrizes,
  getPromotionPrizePlan,
  getPromotionRewardAmount,
  getPromotionRedemptionDiscount,
  getPromotionRedemptionError,
  getRewardStatusForOrder,
  isPromotionOrderCandidate,
  isPromotionOrderEligible,
  normalizePromotionSettings,
  reconcilePromotionReward,
  selectPlannedPromotionPrize,
  selectLatestPromotionSettings,
  selectWeightedPromotionPrize,
  validatePromotionSettings,
} from './customerPromotion';

const order = {
  id: 'order-1',
  orderNumber: '0820001',
  customerId: 'customer-1',
  customerName: 'Maria',
  totalAmount: 150,
  status: 'served',
  createdAt: '2026-08-20 12:00:00',
};

const reward = (overrides: Partial<CustomerPromotionReward> = {}): CustomerPromotionReward => ({
  id: 'promo_order-1',
  customerId: 'customer-1',
  customerName: 'Maria',
  orderId: 'order-1',
  orderNumber: '0820001',
  orderAmount: 150,
  prizeId: 'fixed_20',
  prizeType: 'fixed',
  rewardAmount: 20,
  rewardLabel: 'C$20.00',
  status: 'pending',
  dateKey: '2026-08-20',
  code: 'RP-001',
  drawnAt: '2026-08-20T12:00:00.000Z',
  drawnBy: 'zeng',
  terminalId: 'terminal-1',
  ...overrides,
});

describe('customer promotion rules', () => {
  test('uses one persistent active configuration while keeping the current date for counters', () => {
    const settings = normalizePromotionSettings({
      id: '2026-08-19',
      dateKey: '2026-08-19',
      prizes: [
        { id: 'gift', type: 'gift', amount: 0, label: 'Taza panda', probability: 100, active: true, color: '#123' },
      ],
    }, '2026-08-20');
    expect(settings.id).toBe(ACTIVE_PROMOTION_SETTINGS_ID);
    expect(settings.dateKey).toBe('2026-08-20');
    expect(settings.prizes.map(prize => prize.label)).toEqual(['Taza panda']);
  });

  test('migrates the most recently updated legacy configuration', () => {
    const latest = selectLatestPromotionSettings([
      { id: '2026-08-20', dateKey: '2026-08-20', updatedAt: '2026-08-20T10:00:00.000Z' },
      { id: '2026-08-19', dateKey: '2026-08-19', updatedAt: '2026-08-20T12:00:00.000Z' },
    ]);
    expect(latest?.id).toBe('2026-08-19');
  });

  test('accepts only a real current-day customer order that has not drawn', () => {
    expect(isPromotionOrderCandidate({ ...order, customerId: '' }, '2026-08-20')).toBe(true);
    expect(isPromotionOrderEligible(order, '2026-08-20')).toBe(true);
    expect(isPromotionOrderEligible({ ...order, customerId: '' }, '2026-08-20')).toBe(false);
    expect(isPromotionOrderEligible({ ...order, status: 'draft' }, '2026-08-20')).toBe(false);
    expect(isPromotionOrderEligible(order, '2026-08-19')).toBe(false);
    expect(isPromotionOrderEligible(order, '2026-08-20', [reward()])).toBe(false);
    expect(isPromotionOrderEligible(order, '2026-08-20', [], 200)).toBe(false);
  });

  test('uses one deterministic reward document per order', () => {
    expect(buildPromotionRewardId('order/1')).toBe('promo_order_1');
  });

  test('never offers a fixed prize above the real order amount', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    const prizes = getEligiblePromotionPrizes(settings, 150, []);
    expect(prizes.some(prize => prize.amount === 200)).toBe(false);
    expect(prizes.some(prize => prize.type === 'full_order')).toBe(true);
    expect(getPromotionRewardAmount(prizes.find(prize => prize.type === 'full_order')!, 150)).toBe(150);
  });

  test('respects the automatically planned daily slots and weighted selection', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    const plan = getPromotionPrizePlan(settings);
    const used = Array.from({ length: plan.fixed_10 }, (_, index) => reward({ id: `used-${index}`, orderId: `order-${index}`, prizeId: 'fixed_10' }));
    const prizes = getEligiblePromotionPrizes(settings, 150, used);
    expect(prizes.some(prize => prize.id === 'fixed_10')).toBe(false);
    expect(selectWeightedPromotionPrize(prizes, 0)?.id).toBe(prizes[0].id);
  });

  test('keeps rewards pending until completion and voids cancelled orders', () => {
    expect(getRewardStatusForOrder('served')).toBe('pending');
    expect(getRewardStatusForOrder('completed')).toBe('available');
    expect(getRewardStatusForOrder('cancelled')).toBe('void');
    expect(reconcilePromotionReward(reward(), { ...order, status: 'completed' }).status).toBe('available');
    expect(reconcilePromotionReward(reward(), { ...order, status: 'cancelled' }).status).toBe('void');
  });

  test('counts only available rewards in the customer balance', () => {
    expect(getCustomerPromotionBalance([
      reward({ status: 'available', rewardAmount: 20 }),
      reward({ id: 'pending', orderId: 'order-2', status: 'pending', rewardAmount: 100 }),
      reward({ id: 'available', orderId: 'order-3', status: 'available', rewardAmount: 50 }),
    ], 'customer-1')).toBe(70);
  });

  test('allows an available reward only on a later unpaid order for the same customer', () => {
    const nextOrder = {
      ...order,
      id: 'order-2',
      orderNumber: '0820002',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      settledAmount: 0,
    };
    const availableReward = reward({ status: 'available' });
    expect(getPromotionRedemptionError(availableReward, nextOrder)).toBeNull();
    expect(getPromotionRedemptionError(availableReward, { ...nextOrder, customerId: 'other' })).toBe('redemption-customer-mismatch');
    expect(getPromotionRedemptionError(availableReward, { ...nextOrder, paymentStatus: 'paid' })).toBe('redemption-order-paid');
    expect(getPromotionRedemptionError(availableReward, { ...nextOrder, id: 'order-1' })).toBe('redemption-source-order');
  });

  test('preserves the full cash prize and gives dish or gift rewards no cash discount', () => {
    const nextOrder = { ...order, id: 'order-2', status: 'confirmed', paymentStatus: 'unpaid' };
    const cashReward = reward({ status: 'available', rewardAmount: 20 });
    expect(getPromotionRedemptionDiscount(cashReward, nextOrder)).toBe(20);
    expect(getPromotionRedemptionError(cashReward, { ...nextOrder, totalAmount: 10 })).toBe('redemption-order-too-small');
    expect(getPromotionRedemptionDiscount(
      reward({ status: 'available', prizeType: 'gift', rewardAmount: 0 }),
      nextOrder
    )).toBe(0);
  });

  test('requires active probabilities to total 100 percent', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    expect(validatePromotionSettings(settings)).toBeNull();
    settings.prizes[0].probability = 34;
    expect(validatePromotionSettings(settings)).toBe('probability-total');
  });

  test('uses the configured prize amount and global order threshold', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    settings.minimumOrderAmount = 120;
    settings.prizes = settings.prizes.map(prize => prize.id === 'fixed_20' ? { ...prize, amount: 35 } : prize);
    expect(getEligiblePromotionPrizes(settings, 100, [])).toHaveLength(0);
    const configured = getEligiblePromotionPrizes(settings, 150, []).find(prize => prize.id === 'fixed_20');
    expect(configured?.amount).toBe(35);
    expect(getPromotionRewardAmount(configured!, 150)).toBe(35);
  });

  test('ignores the retired per-prize minimum from existing cloud settings', () => {
    const legacySettings = getDefaultPromotionSettings('2026-08-20');
    const legacyPrize = legacySettings.prizes[0] as typeof legacySettings.prizes[0] & { minSpend: number; dailyLimit: number };
    legacyPrize.minSpend = 999;
    legacyPrize.dailyLimit = 1;
    const settings = normalizePromotionSettings(legacySettings, '2026-08-20');
    expect(settings.prizes[0]).not.toHaveProperty('minSpend');
    expect(settings.prizes[0]).not.toHaveProperty('dailyLimit');
    expect(getEligiblePromotionPrizes(settings, 50, []).some(prize => prize.id === 'fixed_10')).toBe(true);
  });

  test('supports configured dish and gift prizes without adding cash balance', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    settings.prizes = [
      { id: 'dish-1', type: 'dish', amount: 0, label: 'Arroz chino', menuItemId: 'menu-1', probability: 50, active: true, color: '#be2530' },
      { id: 'gift-1', type: 'gift', amount: 0, label: 'Taza panda', probability: 50, active: true, color: '#0f8179' },
    ];
    settings.expectedDailyDraws = 10;
    expect(validatePromotionSettings(settings)).toBeNull();
    expect(getPromotionRewardAmount(settings.prizes[0], 200)).toBe(0);
    expect(getEligiblePromotionPrizes(settings, 80, [])).toEqual(settings.prizes);
    expect(getCustomerPromotionBalance([
      reward({ status: 'available', prizeType: 'gift', rewardAmount: 0, rewardLabel: 'Taza panda' }),
    ], 'customer-1')).toBe(0);
  });

  test('rejects non-cash prizes without a configured name', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    settings.prizes = [
      { id: 'gift-1', type: 'gift', amount: 0, label: '', probability: 100, active: true, color: '#0f8179' },
    ];
    expect(validatePromotionSettings(settings)).toBe('invalid-value');
  });

  test('keeps a stable shuffled layout and interleaves cash with other prizes', () => {
    const prizes = [
      { id: '10', type: 'fixed' as const, amount: 10, probability: 25, active: true, color: '#1' },
      { id: '20', type: 'fixed' as const, amount: 20, probability: 25, active: true, color: '#2' },
      { id: 'dish', type: 'dish' as const, amount: 0, label: 'Arroz', menuItemId: 'm1', probability: 25, active: true, color: '#3' },
      { id: 'gift', type: 'gift' as const, amount: 0, label: 'Taza', probability: 25, active: true, color: '#4' },
      { id: 'full', type: 'full_order' as const, amount: 0, probability: 5, active: true, color: '#5' },
    ];
    const first = arrangePromotionPrizes(prizes, 'order-88');
    expect(arrangePromotionPrizes(prizes, 'order-88').map(prize => prize.id)).toEqual(first.map(prize => prize.id));
    expect(first).toHaveLength(prizes.length * 2);
    expect(prizes.every(prize => first.filter(item => item.id === prize.id).length === 2)).toBe(true);
    expect(first.every((prize, index) => index === 0 || prize.id !== first[index - 1].id)).toBe(true);
  });

  test('converts any configured daily volume into exact guaranteed prize slots', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    const plan60 = getPromotionPrizePlan(settings);
    expect(Object.values(plan60).reduce((sum, count) => sum + count, 0)).toBe(60);
    expect(settings.prizes.every(prize => plan60[prize.id] >= 1)).toBe(true);

    for (const volume of [70, 80]) {
      settings.expectedDailyDraws = volume;
      const plan = getPromotionPrizePlan(settings);
      expect(Object.values(plan).reduce((sum, count) => sum + count, 0)).toBe(volume);
    }
  });

  test('draws without replacement from the remaining daily prize slots', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    settings.expectedDailyDraws = 2;
    settings.prizes = [
      { id: 'dish', type: 'dish', amount: 0, label: 'Arroz', menuItemId: 'm1', probability: 50, active: true, color: '#1' },
      { id: 'gift', type: 'gift', amount: 0, label: 'Taza', probability: 50, active: true, color: '#2' },
    ];
    const first = selectPlannedPromotionPrize(settings, 200, {}, 0)!;
    const second = selectPlannedPromotionPrize(settings, 200, { [first.id]: 1 }, 0)!;
    expect(second.id).not.toBe(first.id);
    expect(selectPlannedPromotionPrize(settings, 200, { dish: 1, gift: 1 }, 0)).toBeNull();
  });

  test('exhausts a 60-slot pool with every prize count matching its plan', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    const plan = getPromotionPrizePlan(settings);
    const used: Record<string, number> = {};
    for (let draw = 0; draw < settings.expectedDailyDraws; draw += 1) {
      const prize = selectPlannedPromotionPrize(settings, 1000, used, ((draw * 37) % 100) / 100);
      expect(prize).not.toBeNull();
      used[prize!.id] = Number(used[prize!.id] || 0) + 1;
    }
    expect(used).toEqual(plan);
    expect(selectPlannedPromotionPrize(settings, 1000, used, 0.5)).toBeNull();
  });

  test('automatically expands the prize plan when the daily volume increases', () => {
    const settings = getDefaultPromotionSettings('2026-08-20');
    settings.expectedDailyDraws = 200;
    expect(validatePromotionSettings(settings)).toBeNull();
    expect(Object.values(getPromotionPrizePlan(settings)).reduce((sum, count) => sum + count, 0)).toBe(200);
  });
});
