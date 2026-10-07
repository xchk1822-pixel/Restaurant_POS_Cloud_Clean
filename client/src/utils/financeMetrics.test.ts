import {
  buildDailyExpenseBreakdown,
  calculateOrderStatusSummary,
  calculateFinancialReportTotals,
  calculateHandoverDifferenceForDates,
  getExpenseCashAmount,
  getExpenseDateKey,
  getExpenseProfitAmount,
  getLatestHandoverAmountForDate,
  getOrderCollectedAmount,
  getOrderFinancialDateKey,
  getOrderPaymentBreakdown,
  getReservationCashFlowForDate,
  getReservationPrepaymentAmountForDate,
  isPurchaseRelatedExpense,
  sumExpensesByKind,
} from './financeMetrics';

describe('finance metrics helpers', () => {
  test('detects paid purchase and supplier repayment expenses', () => {
    expect(isPurchaseRelatedExpense({ relatedType: 'purchase' })).toBe(true);
    expect(isPurchaseRelatedExpense({ relatedType: 'supplier_repayment' })).toBe(true);
    expect(isPurchaseRelatedExpense({ categoryId: 'supplier_payment' })).toBe(true);
    expect(isPurchaseRelatedExpense({ id: 'purchase_123' })).toBe(true);
    expect(isPurchaseRelatedExpense({ categoryId: 'rent' })).toBe(false);
  });

  test('sums paid purchase expense separately from operating expense', () => {
    const expenses = [
      { id: 'purchase_1', date: '2026-06-11', amount: 100 },
      { id: 'rent_1', date: '2026-06-11', amount: 30, categoryId: 'rent' },
      { id: 'purchase_2', date: '2026-06-12', amount: 999 },
    ];

    expect(sumExpensesByKind(expenses, '2026-06-11', '2026-06-12', 'purchase')).toBe(100);
    expect(sumExpensesByKind(expenses, '2026-06-11', '2026-06-12', 'operating')).toBe(30);
  });

  test('separates employee loan cash flow from profit expense', () => {
    const loanExpense = {
      id: 'loan_1',
      categoryId: 'employee_loan',
      relatedType: 'loan',
      amount: 1000,
    };
    const salaryExpense = {
      id: 'salary_1',
      relatedType: 'salary',
      amount: 4000,
      cashAmount: 4000,
      profitAmount: 5000,
    };

    expect(getExpenseProfitAmount(loanExpense)).toBe(0);
    expect(getExpenseCashAmount(loanExpense)).toBe(1000);
    expect(getExpenseProfitAmount(salaryExpense)).toBe(5000);
    expect(getExpenseCashAmount(salaryExpense)).toBe(4000);
  });

  test('normalizes expense date keys', () => {
    expect(getExpenseDateKey({ date: '2026-06-11' })).toBe('2026-06-11');
  });

  test('counts only collected order amounts for financial reports', () => {
    expect(getOrderCollectedAmount({ status: 'confirmed', paymentStatus: 'unpaid', totalAmount: 100 })).toBe(0);
    expect(getOrderCollectedAmount({ status: 'served', paymentStatus: 'partial', totalAmount: 100, paidAmount: 40 })).toBe(40);
    expect(getOrderCollectedAmount({ status: 'served', paymentStatus: 'paid', totalAmount: 100, paidAmount: 100 })).toBe(100);
    expect(getOrderCollectedAmount({ status: 'completed', totalAmount: 80 })).toBe(80);
    expect(getOrderCollectedAmount({
      status: 'completed',
      paymentStatus: 'paid',
      totalAmount: 0,
      paidAmount: 190,
      settledAmount: 190,
      cashAmount: 190,
      items: [],
      cancelRecords: [{ orderType: 'item', quantity: 1 }],
    })).toBe(0);
    expect(getOrderCollectedAmount({
      status: 'completed',
      paymentStatus: 'paid',
      totalAmount: 160,
      paidAmount: 350,
      settledAmount: 350,
      cashAmount: 350,
      cancelRecords: [{ orderType: 'item', quantity: 1, refundAmount: 190 }],
    })).toBe(160);
    expect(getOrderCollectedAmount({ status: 'cancelled', paymentStatus: 'paid', totalAmount: 100 })).toBe(0);
    expect(getOrderCollectedAmount({ isDeleted: true, status: 'completed', paymentStatus: 'paid', totalAmount: 100 })).toBe(0);
  });

  test('splits collected order amounts by payment method', () => {
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 100, paymentMethod: 'cash' })).toEqual({ cash: 100, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 100, paymentMethod: 'card' })).toEqual({ cash: 0, card: 100 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 120, paymentMethod: 'mixed', cashAmount: 50, cardAmount: 70 })).toEqual({ cash: 50, card: 70 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'partial', totalAmount: 120, paidAmount: 30, paymentMethod: 'cash' })).toEqual({ cash: 30, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'unpaid', totalAmount: 120, paymentMethod: 'cash' })).toEqual({ cash: 0, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 0, paidAmount: 190, cashAmount: 190 })).toEqual({ cash: 0, card: 0 });
    expect(getOrderPaymentBreakdown({ paymentStatus: 'paid', totalAmount: 160, paidAmount: 350, cashAmount: 350 })).toEqual({ cash: 160, card: 0 });
  });

  test('removes cash change from payment breakdown when saved cash includes tendered amount', () => {
    expect(getOrderPaymentBreakdown({
      paymentStatus: 'paid',
      totalAmount: 100,
      cashAmount: 120,
      cardAmount: 0,
    })).toEqual({ cash: 100, card: 0 });

    expect(getOrderPaymentBreakdown({
      paymentStatus: 'paid',
      totalAmount: 100,
      cashAmount: 50,
      cardAmount: 70,
    })).toEqual({ cash: 30, card: 70 });
  });

  test('uses payment date as financial order date', () => {
    const order = {
      status: 'served',
      paymentStatus: 'paid',
      totalAmount: 100,
      createdAt: '2026-06-10T23:30:00.000-06:00',
      lastPaidAt: '2026-06-11T00:10:00.000-06:00',
    };

    expect(getOrderFinancialDateKey(order)).toBe('2026-06-11');
    expect(getOrderFinancialDateKey({ ...order, paymentStatus: 'unpaid' })).toBe('');
    expect(getOrderFinancialDateKey({ ...order, isDeleted: true })).toBe('');
  });

  test('summarizes daily completed orders cancelled orders and cancelled dishes separately', () => {
    const orders = [
      {
        id: 'paid-table-order',
        status: 'completed',
        paymentStatus: 'paid',
        orderType: 'dine_in',
        totalAmount: 100,
        lastPaidAt: '2026-06-12T10:00:00.000-06:00',
      },
      {
        id: 'cancelled-whole-order',
        status: 'cancelled',
        totalAmount: 80,
        cancelledAt: '2026-06-12T11:00:00.000-06:00',
        items: [{ name: 'Dish A', quantity: 2 }],
      },
      {
        id: 'cancelled-items-order-record',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        createdAt: '2026-06-12T12:00:00.000-06:00',
        cancelRecords: [
          { orderType: 'item', quantity: 2, cancelledAt: '2026-06-12T12:05:00.000-06:00' },
          { orderType: 'order', quantity: 9, cancelledAt: '2026-06-12T12:10:00.000-06:00' },
        ],
      },
      {
        id: 'paid-order-with-item-record',
        status: 'served',
        paymentStatus: 'paid',
        orderType: 'takeout',
        totalAmount: 50,
        lastPaidAt: '2026-06-12T13:00:00.000-06:00',
        items: [
          {
            name: 'Dish B',
            cancelRecords: [{ quantity: 1, cancelledAt: '2026-06-12T13:05:00.000-06:00' }],
          },
        ],
      },
      {
        id: 'other-day-cancelled',
        status: 'cancelled',
        cancelledAt: '2026-06-11T11:00:00.000-06:00',
        cancelRecords: [{ orderType: 'item', quantity: 99, cancelledAt: '2026-06-11T11:05:00.000-06:00' }],
      },
    ];

    expect(calculateOrderStatusSummary(orders, '2026-06-12')).toEqual({
      completedOrders: 2,
      dineInOrders: 1,
      takeoutOrders: 1,
      deliveryOrders: 0,
      reservationOrders: 0,
      cancelledOrders: 1,
      cancelledItems: 3,
    });
  });

  test('summarizes collected order counts by Mesa Barra and Delivery type', () => {
    const orders = [
      { id: 'mesa', orderType: 'dine_in', status: 'completed', paymentStatus: 'paid', totalAmount: 100, lastPaidAt: '2026-06-12T10:00:00.000-06:00' },
      { id: 'barra', orderType: 'takeout', status: 'completed', paymentStatus: 'paid', totalAmount: 80, lastPaidAt: '2026-06-12T11:00:00.000-06:00' },
      { id: 'delivery', orderType: 'delivery', status: 'completed', paymentStatus: 'paid', totalAmount: 60, lastPaidAt: '2026-06-12T12:00:00.000-06:00' },
      { id: 'unpaid-delivery', orderType: 'delivery', status: 'confirmed', paymentStatus: 'unpaid', totalAmount: 50, createdAt: '2026-06-12T12:30:00.000-06:00' },
    ];

    expect(calculateOrderStatusSummary(orders, '2026-06-12')).toMatchObject({
      completedOrders: 3,
      dineInOrders: 1,
      takeoutOrders: 1,
      deliveryOrders: 1,
    });
  });

  test('recognizes reservation revenue on actual completion date and prepayment on payment date', () => {
    const reservation = {
      id: 'reservation-1',
      orderType: 'reservation',
      status: 'completed',
      paymentStatus: 'paid',
      totalAmount: 500,
      settledAmount: 500,
      cashAmount: 300,
      cardAmount: 200,
      deliveryDate: '2026-10-05',
      completedAt: '2026-10-06T14:30:00.000-06:00',
      lastPaidAt: '2026-10-02T10:00:00.000-06:00',
      reservationPayments: [{
        id: 'payment-1',
        paidAt: '2026-10-02T10:00:00.000-06:00',
        amount: 500,
        cashAmount: 300,
        cardAmount: 200,
      }],
    };

    expect(getOrderFinancialDateKey(reservation)).toBe('2026-10-06');
    expect(getReservationPrepaymentAmountForDate(reservation, '2026-10-02')).toBe(500);
    expect(getReservationPrepaymentAmountForDate(reservation, '2026-10-06')).toBe(0);
    expect(getReservationCashFlowForDate(reservation, '2026-10-02')).toEqual({ total: 500, cash: 300, card: 200 });
    expect(calculateOrderStatusSummary([reservation], '2026-10-06')).toMatchObject({
      completedOrders: 1,
      reservationOrders: 1,
    });
  });

  test('includes reservation cash prepayment in handover without recognizing early sales', () => {
    const reservation = {
      id: 'reservation-2',
      orderType: 'reservation',
      status: 'confirmed',
      paymentStatus: 'paid',
      totalAmount: 300,
      settledAmount: 300,
      cashAmount: 300,
      cardAmount: 0,
      reservationPayments: [{
        id: 'payment-2',
        paidAt: '2026-10-02T10:00:00.000-06:00',
        amount: 300,
        cashAmount: 300,
        cardAmount: 0,
      }],
    };

    expect(getOrderFinancialDateKey(reservation)).toBe('');
    expect(calculateHandoverDifferenceForDates({
      dates: ['2026-10-02'],
      orders: [reservation],
      expenses: [],
      handovers: [{ date: '2026-10-02', rawG: 300, createdAt: '2026-10-02T23:00:00.000-06:00' }],
    })).toBe(0);
  });

  test('cancelled reservation refunds remove prepayment and reservation cash flow', () => {
    const cancelledReservation = {
      id: 'reservation-refunded',
      orderType: 'reservation',
      status: 'cancelled',
      paymentStatus: 'paid',
      totalAmount: 400,
      settledAmount: 400,
      cancelledAt: '2026-10-07T13:00:00.000-06:00',
      reservationPayments: [{
        id: 'payment-refunded',
        paidAt: '2026-10-06T10:00:00.000-06:00',
        amount: 400,
        cashAmount: 250,
        cardAmount: 150,
      }],
    };

    expect(getReservationCashFlowForDate(cancelledReservation, '2026-10-06')).toEqual({ total: 0, cash: 0, card: 0 });
    expect(getReservationPrepaymentAmountForDate(cancelledReservation, '2026-10-06')).toBe(0);
    expect(getOrderFinancialDateKey(cancelledReservation)).toBe('');
  });

  test('calculates financial report totals with cash-based handover difference included in profit loss', () => {
    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 95,
    })).toEqual({
      totalSales: 130,
      profit: 125,
      difference: 25,
      expectedCashHandover: 70,
      fundingGap: 0,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 100,
      cardPayment: 30,
      purchaseAmount: 20,
      expenseAmount: 10,
      handoverAmount: 105,
    })).toEqual({
      totalSales: 130,
      profit: 135,
      difference: 35,
      expectedCashHandover: 70,
      fundingGap: 0,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 200,
      cardPayment: 0,
      purchaseAmount: 50,
      expenseAmount: 0,
      handoverAmount: 140,
    })).toEqual({
      totalSales: 200,
      profit: 140,
      difference: -10,
      expectedCashHandover: 150,
      fundingGap: 0,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 500,
      cardPayment: 500,
      purchaseAmount: 100,
      expenseAmount: 100,
      handoverAmount: 310,
    })).toEqual({
      totalSales: 1000,
      profit: 810,
      difference: 10,
      expectedCashHandover: 300,
      fundingGap: 0,
    });

    expect(calculateFinancialReportTotals({
      cashPayment: 28370,
      cardPayment: 0,
      purchaseAmount: 10308.125,
      expenseAmount: 10232,
      handoverAmount: 7850,
    })).toEqual({
      totalSales: 28370,
      profit: 7850,
      difference: 20.12,
      expectedCashHandover: 7829.88,
      fundingGap: 0,
    });
  });

  test('allows zero handover and records excess cash expenses as a funding gap', () => {
    expect(calculateFinancialReportTotals({
      cashPayment: 500,
      cardPayment: 500,
      purchaseAmount: 700,
      expenseAmount: 500,
      handoverAmount: 0,
    })).toEqual({
      totalSales: 1000,
      profit: -200,
      difference: 0,
      expectedCashHandover: 0,
      fundingGap: 700,
    });
  });

  test('uses operating expense for profit and actual cash expense for handover', () => {
    expect(calculateFinancialReportTotals({
      cashPayment: 1000,
      cardPayment: 0,
      purchaseAmount: 0,
      expenseAmount: 200,
      cashExpenseAmount: 300,
      handoverAmount: 700,
    })).toEqual({
      totalSales: 1000,
      profit: 800,
      difference: 0,
      expectedCashHandover: 700,
      fundingGap: 0,
    });
  });

  test('uses latest handover amount for the report date', () => {
    expect(getLatestHandoverAmountForDate([
      { id: 'newer', t: '2026-06-12 21:00:00', rawG: 105 },
      { id: 'older', t: '2026-06-12 09:00:00', rawG: 95 },
      { id: 'other-day', t: '2026-06-11 23:00:00', rawG: 999 },
    ], '2026-06-12')).toBe(105);

    expect(getLatestHandoverAmountForDate([
      { id: 'zero', t: '2026-06-12 22:00:00', rawG: 0 },
    ], '2026-06-12')).toBe(0);
  });

  test('sums only submitted daily handover differences for a selected range', () => {
    const orders = [
      { status: 'completed', paymentStatus: 'paid', paymentMethod: 'cash', totalAmount: 500, paidAt: '2026-07-01T12:00:00-06:00' },
      { status: 'completed', paymentStatus: 'paid', paymentMethod: 'card', totalAmount: 500, paidAt: '2026-07-01T12:05:00-06:00' },
      { status: 'completed', paymentStatus: 'paid', paymentMethod: 'cash', totalAmount: 200, paidAt: '2026-07-02T12:00:00-06:00' },
    ];
    const expenses = [
      { date: '2026-07-01', amount: 100, type: 'purchase' },
      { date: '2026-07-01', amount: 100, type: 'daily' },
    ];
    const handovers = [{ t: '2026-07-01 22:00:00', rawG: 310 }];

    expect(calculateHandoverDifferenceForDates({
      dates: ['2026-07-01', '2026-07-02'],
      orders,
      expenses,
      handovers,
    })).toBe(10);
  });

  test('employee loan changes expected cash without changing handover profit difference', () => {
    expect(calculateHandoverDifferenceForDates({
      dates: ['2026-07-01'],
      orders: [
        { status: 'completed', paymentStatus: 'paid', paymentMethod: 'cash', totalAmount: 1000, paidAt: '2026-07-01T12:00:00-06:00' },
      ],
      expenses: [
        { id: 'loan_1', date: '2026-07-01', amount: 300, categoryId: 'employee_loan', relatedType: 'loan' },
      ],
      handovers: [{ t: '2026-07-01 22:00:00', rawG: 700 }],
    })).toBe(0);
  });

  test('financial expense detail excludes employee loans and uses salary profit amount', () => {
    const breakdown = buildDailyExpenseBreakdown([
      { id: 'loan_1', date: '2026-07-01', amount: 300, categoryId: 'employee_loan', relatedType: 'loan' },
      { id: 'salary_1', date: '2026-07-01', amount: 700, profitAmount: 1000, categoryId: 'employee_salary', relatedType: 'salary' },
    ], '2026-07-01');

    expect(breakdown.details).toHaveLength(1);
    expect(breakdown.details[0]).toMatchObject({ id: 'salary_1', amount: 1000 });
    expect(breakdown.summaries[0].amount).toBe(1000);
  });

  test('builds daily expense groups with readable category names and purchase order labels', () => {
    const breakdown = buildDailyExpenseBreakdown([
      {
        id: 'purchase_1',
        date: '2026-06-12',
        amount: 100,
        relatedType: 'purchase',
        categoryId: 'supplier_payment',
        description: 'Supplier A',
        supplierName: 'A供应商饮料',
        orderNumber: 'INV-001',
        createdAt: '2026-06-12T10:00:00.000-06:00',
      },
      {
        id: 'rent_1',
        date: '2026-06-12',
        amount: 30,
        categoryId: 'cat-rent',
        description: '店租',
        createdAt: '2026-06-12T11:00:00.000-06:00',
      },
      {
        id: 'rent_2',
        date: '2026-06-12',
        amount: 20,
        categoryId: 'cat-rent',
        description: '追加',
        createdAt: '2026-06-12T12:00:00.000-06:00',
      },
      {
        id: 'other_day',
        date: '2026-06-11',
        amount: 999,
        categoryName: '不应出现',
      },
    ], '2026-06-12', [
      { id: 'cat-rent', name: '租金' },
      { id: 'supplier_payment', name: '供应商货款' },
    ], [
      {
        id: 'po-1',
        orderNumber: 'INV-001',
        supplierName: 'A供应商饮料',
        items: [
          { itemName: 'Coca Cola', quantity: 2, unitPrice: 35, subtotal: 70 },
          { itemName: 'Toña', quantity: 1, unitPrice: 30, subtotal: 30 },
        ],
      },
    ]);

    expect(breakdown.summaries).toEqual([
      expect.objectContaining({ type: 'purchase', typeLabel: '采购付款', category: 'A供应商饮料 - 单号 INV-001', count: 1, amount: 100 }),
      expect.objectContaining({ type: 'operating', typeLabel: '日常开支', parentCategory: '房租水电', category: '租金', count: 2, amount: 50 }),
    ]);
    expect(breakdown.groups.map(group => ({
      title: group.title,
      amount: group.amount,
      descriptions: group.details.map(detail => detail.description),
    }))).toEqual([
      { title: 'A供应商饮料 - 单号 INV-001', amount: 100, descriptions: ['Coca Cola', 'Toña'] },
      { title: '房租水电 / 租金', amount: 50, descriptions: ['追加', '店租'] },
    ]);
    expect(breakdown.details.map(detail => detail.description)).toEqual(['追加', '店租', 'Coca Cola', 'Toña']);
    expect(breakdown.details.map(detail => detail.category)).not.toContain('cat-rent');
    expect(breakdown.groups[0].details.map(detail => ({
      orderNumber: detail.orderNumber,
      quantity: detail.quantity,
      unitPrice: detail.unitPrice,
      amount: detail.amount,
    }))).toEqual([
      { orderNumber: 'INV-001', quantity: 2, unitPrice: 35, amount: 70 },
      { orderNumber: 'INV-001', quantity: 1, unitPrice: 30, amount: 30 },
    ]);
  });

  test('builds daily expense groups with parent and child category labels', () => {
    const breakdown = buildDailyExpenseBreakdown([
      {
        id: 'exp-utilities-1',
        date: '2026-06-12',
        amount: 80,
        parentCategoryId: 'parent-utilities',
        categoryId: 'child-electric',
        description: '六月电费',
        createdAt: '2026-06-12T12:00:00.000-06:00',
      },
      {
        id: 'exp-utilities-2',
        date: '2026-06-12',
        amount: 20,
        parentCategoryId: 'parent-utilities',
        categoryId: 'child-water',
        description: '六月水费',
        createdAt: '2026-06-12T13:00:00.000-06:00',
      },
    ], '2026-06-12', [
      { id: 'parent-utilities', name: '房租水电', level: 'parent' },
      { id: 'child-electric', name: '电费', level: 'child', parentId: 'parent-utilities' },
      { id: 'child-water', name: '水费', level: 'child', parentId: 'parent-utilities' },
    ]);

    expect(breakdown.groups.map(group => ({
      parentCategory: group.parentCategory,
      category: group.category,
      title: group.title,
      amount: group.amount,
    }))).toEqual([
      { parentCategory: '房租水电', category: '电费', title: '房租水电 / 电费', amount: 80 },
      { parentCategory: '房租水电', category: '水费', title: '房租水电 / 水费', amount: 20 },
    ]);
    expect(breakdown.details.map(detail => ({
      parentCategory: detail.parentCategory,
      category: detail.category,
      description: detail.description,
    }))).toEqual([
      { parentCategory: '房租水电', category: '水费', description: '六月水费' },
      { parentCategory: '房租水电', category: '电费', description: '六月电费' },
    ]);
  });
});
