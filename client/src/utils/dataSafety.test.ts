import fs from 'fs';
import path from 'path';

describe('production data safety guards', () => {
  test('main layout does not trigger legacy global-to-store migration on login', () => {
    const mainLayoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(mainLayoutPath, 'utf8');

    expect(source).not.toContain('migrateGlobalDataToStore');
  });

  test('production app does not import legacy migration or test pages', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    [
      'DataMigration',
      'DataMigrationPage',
      'DataInitTest',
      'EmergencyFix',
      'FirebaseTest',
      'OfflineTest',
      'UserMigrationPage',
      'DataRecovery',
    ].forEach(legacyName => {
      expect(source).not.toContain(`import ${legacyName}`);
      expect(source).not.toContain(`<${legacyName}`);
    });
  });

  test('production app does not expose obsolete migration or test routes', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    [
      '/migrate',
      '/migrate-users',
      '/emergency-fix',
      '/data-recovery',
      '/firebase-test',
      '/offline-test',
      '/data-init',
    ].forEach(routePath => {
      expect(source).not.toContain(`path="${routePath}"`);
    });
  });

  test('production app uses canonical settings and manager routes only', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    [
      '/settings/stores',
      '/settings/exchange-rate',
      '/manager',
    ].forEach(routePath => {
      expect(source).toContain(`path="${routePath}"`);
    });

    [
      '/stores',
      '/exchange-rate',
      '/reports',
    ].forEach(routePath => {
      expect(source).not.toContain(`path="${routePath}"`);
    });
  });

  test('production app redirects legacy manager links instead of rendering a blank page', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain('path="/manager/orders"');
    expect(source).toContain('to="/manager/order-history"');
    expect(source).toContain('path="/manager/reports"');
    expect(source).toContain('to="/manager/financial-reports"');
    expect(source).toContain('path="/manager/overview"');
    expect(source).toContain('to="/manager"');
  });

  test('supplier management is a first-level module without legacy inventory route compatibility', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const appSource = fs.readFileSync(appPath, 'utf8');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    const permissionsPath = path.join(process.cwd(), 'src/utils/permissions.ts');
    const permissionsSource = fs.readFileSync(permissionsPath, 'utf8');
    const defaultStoreManagerBlock = permissionsSource.slice(
      permissionsSource.indexOf('store_manager: ['),
      permissionsSource.indexOf('cashier: [')
    );
    const permissionsModulePath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const permissionsModuleSource = fs.readFileSync(permissionsModulePath, 'utf8');

    expect(appSource).toContain('path="/suppliers"');
    expect(appSource).toContain('permissionId="suppliers:manage"');
    expect(appSource).not.toContain('path="/inventory/suppliers"');
    expect(appSource).not.toContain('<Navigate to="/suppliers" replace />');
    expect(layoutSource).toContain("path: '/suppliers'");
    expect(layoutSource).toContain("label: '供应商管理'");
    expect(layoutSource).toContain("roles: ['store_manager']");
    expect(layoutSource.indexOf("path: '/suppliers'")).toBeGreaterThan(
      layoutSource.indexOf("path: '/manager'")
    );
    expect(layoutSource).not.toContain("{ path: '/inventory/suppliers', icon: 'SP', label: '供应商管理' }");
    expect(permissionsSource).toContain("'suppliers:manage'");
    expect(permissionsSource).toContain('migrateRolePermissions');
    expect(permissionsSource).toContain('PERMISSION_SCHEMA_VERSION');
    expect(permissionsModuleSource).toContain("id: 'suppliers:manage'");
    expect(permissionsModuleSource).not.toContain("id: 'inventory:suppliers'");
  });

  test('supplier management derives debt from purchase orders through supplier ledger helpers', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const supplierSource = fs.readFileSync(supplierPath, 'utf8');
    const helperPath = path.join(process.cwd(), 'src/pages/Suppliers/supplierLedger.ts');
    const helperSource = fs.readFileSync(helperPath, 'utf8');

    expect(supplierSource).toContain("from './supplierLedger'");
    expect(supplierSource).toContain('buildSupplierAccountSnapshot');
    expect(supplierSource).toContain('getPurchaseRemainingDebt');
    expect(helperSource).toContain('const totalDebt = supplierOrders.reduce');
    expect(helperSource).toContain('getPurchaseRemainingDebt(order)');
    expect(supplierSource).not.toContain('if (supplier.balance > 0)');
  });

  test('supplier management UI does not display stale supplier balance cache as debt', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');

    expect(source).toContain('summary.totalDebt');
    expect(source).toContain('selectedSummary.totalDebt');
    expect(source).not.toContain('supplier.balance > 0');
    expect(source).not.toContain('supplier.balance.toFixed');
    expect(source).not.toContain('selectedSupplier.balance');
    expect(source).not.toContain('s.balance > 0');
    expect(source).not.toContain('sum + s.balance');
    expect(source).not.toContain('editingSupplier.balance');
  });

  test('supplier management reads supplier payments as one store-scoped collection', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');

    expect(source).toContain("smartGetDocuments('supplier_payments', true)");
    expect(source).toContain('const [payments, setPayments] = useState<SupplierPaymentRecord[]>([])');
    expect(source).toContain('setPayments(normalizedPayments)');
    expect(source).toContain("saveStoreCollection('supplier_payments', normalizedPayments)");
    expect(source).toContain('getSupplierPayments(selectedSupplier.id, payments)');
    expect(source).not.toContain('getSupplierPaymentStorageKey');
    expect(source).not.toContain('localStorage.setItem(getSupplierPaymentStorageKey');
    expect(source).not.toContain('const savePaymentRecord =');
  });

  test('supplier repayment links payment expense and purchase order ids', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');
    const paymentBlock = source.slice(
      source.indexOf('const submitPayment = async () => {'),
      source.indexOf('return (')
    );

    expect(paymentBlock).toContain('const paymentId = `supplier-payment-${now}`');
    expect(paymentBlock).toContain('id: paymentId');
    expect(paymentBlock).toContain('supplierPaymentId: paymentId');
    expect(paymentBlock).toContain('purchaseOrderId: paymentOrder.id');
    expect(paymentBlock).toContain("relatedType: 'supplier_repayment'");
    expect(paymentBlock).toContain('getPurchaseRemainingDebt(paymentOrder)');
    expect(paymentBlock).toContain('buildSupplierAccountSnapshot');
  });

  test('supplier management page uses a supplier-centered payable workbench', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');

    expect(source).toContain('data-new-supplier-module="true"');
    expect(source).toContain('data-supplier-ledger-workspace="true"');
    expect(source).toContain('data-supplier-ledger-timeline="true"');
    expect(source).toContain('data-supplier-date-filter="true"');
    expect(source).toContain('data-supplier-period-summary="true"');
    expect(source).toContain('data-supplier-action-panel="true"');
    expect(source).toContain('const [selectedSupplierId, setSelectedSupplierId]');
    expect(source).toContain('const [dateRange, setDateRange]');
    expect(source).toContain('const unpaidOrders = getUnpaidPurchaseOrders');
    expect(source).toContain('const selectedLedger = buildSupplierLedgerEntries');
    expect(source).not.toContain('type SupplierSection');
    expect(source).not.toContain('activeSection');
    expect(source).not.toContain('supplierSections.map');
    expect(source).not.toContain('renderDebtOrders');
    expect(source).not.toContain('renderPaymentRecords');
    expect(source).not.toContain('renderReconciliationPrint');
    expect(source).not.toContain('legacySupplierSections');
    expect(source).not.toContain('娆犳璁㈠崟');
    expect(source).not.toContain('杩樻璁板綍');
    expect(source).not.toContain('瀵硅处鎵撳嵃');
  });

  test('supplier module has removed legacy inventory supplier implementation', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const appSource = fs.readFileSync(appPath, 'utf8');

    expect(fs.existsSync(path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/utils/supplierAccounts.ts'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/utils/supplierAccounts.test.ts'))).toBe(false);
    expect(appSource).toContain("from './pages/Suppliers/SupplierWorkbench'");
    expect(appSource).not.toContain('Inventory/SupplierManagement');
    expect(appSource).not.toContain('supplierAccounts');
  });

  test('customer management is a first-level module below supplier management', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const appSource = fs.readFileSync(appPath, 'utf8');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    const permissionsPath = path.join(process.cwd(), 'src/utils/permissions.ts');
    const permissionsSource = fs.readFileSync(permissionsPath, 'utf8');
    const defaultStoreManagerBlock = permissionsSource.slice(
      permissionsSource.indexOf('store_manager: ['),
      permissionsSource.indexOf('cashier: [')
    );
    const permissionsModulePath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const permissionsModuleSource = fs.readFileSync(permissionsModulePath, 'utf8');

    expect(appSource).toContain('path="/customers"');
    expect(appSource).toContain('permissionId="customers:manage"');
    expect(appSource).toContain("from './pages/Customers/CustomersModule'");
    expect(appSource).not.toContain('path="/manager/customers"');
    expect(appSource).not.toContain("from './pages/Manager/ManagerCustomers'");
    expect(fs.existsSync(path.join(process.cwd(), 'src/pages/Manager/ManagerCustomers.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/pages/Manager/CustomersModule.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/pages/Customers/CustomersModule.tsx'))).toBe(true);

    expect(layoutSource).toContain("path: '/suppliers'");
    expect(layoutSource).toContain("path: '/customers'");
    expect(layoutSource.indexOf("path: '/customers'")).toBeGreaterThan(
      layoutSource.indexOf("path: '/suppliers'")
    );
    expect(layoutSource).not.toContain("path: '/manager/customers'");
    expect(layoutSource).toContain("item.path === '/customers'");

    expect(permissionsSource).toContain("'customers:manage'");
    expect(defaultStoreManagerBlock).not.toContain("'manager:customers'");
    expect(permissionsSource).toContain("permission !== 'manager:customers'");
    expect(permissionsModuleSource).toContain("id: 'customers:manage'");
    expect(permissionsModuleSource).not.toContain("id: 'manager:customers'");
  });

  test('customer management uses customer center analytics without changing cloud write paths', () => {
    const customerPath = path.join(process.cwd(), 'src/pages/Customers/CustomersModule.tsx');
    const source = fs.readFileSync(customerPath, 'utf8');

    expect(source).toContain("from '../../utils/customerAnalytics'");
    expect(source).toContain("from '../../styles/uiTokens'");
    expect(source).toContain("from '../../contexts/AppContext'");
    expect(source).toContain('buildCustomerCenterRows');
    expect(source).toContain('buildCustomerCenterSummary');
    expect(source).toContain('filterCustomerRows');
    expect(source).toContain('getCustomerPointLedger');

    [
      'data-customer-center="true"',
      'data-customer-kpis="true"',
      'data-customer-segments="true"',
      'data-customer-detail-panel="true"',
      'data-customer-point-ledger="true"',
    ].forEach(marker => {
      expect(source).toContain(marker);
    });

    expect(source).toContain("smartGetDocuments('customers', true)");
    expect(source).toContain("smartGetDocuments('customer_deletions', true)");
    expect(source).toContain("smartGetDocuments('points_transactions', true)");
    expect(source).toContain("smartGetDocuments('exchange_rate', true)");
    expect(source).toContain("smartSetDocument('customers'");
    expect(source).toContain("smartUpdateDocument('customer_deletions'");
    expect(source).toContain("smartSetDocument('points_transactions'");
    expect(source).toContain("smartSetDocument('exchange_rate', 'global'");
    expect(source).not.toContain("smartSubscribeToCollection('customers'");
  });

  test('manager dashboard uses expense ranking analytics with category snapshots', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('buildExpenseRankings');
    expect(source).toContain('buildExpenseRankingComparison');
    expect(source).toContain("smartGetDocuments('expense_categories', true)");
    expect(source).toContain("dataService.getStoreKey('expense_categories')");
    expect(source).toContain('localStorage.setItem(expenseCategoryStorageKey');
    expect(source).toContain('data-manager-expense-analytics="true"');
    expect(source).toContain('开支排行与占比');
    expect(source).toContain('expenseRankingScope');
    expect(source).toContain('expenseRankingScope');
    expect(source).not.toContain('expenseByCategory');
    expect(source).not.toContain('expense.categoryName || expense.category');
    expect(source).not.toContain("smartSubscribeToCollection('expenses'");
  });

  test('manager dashboard presents the requested five-card grouped overview layout', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('data-manager-kpi-strip="true"');
    expect(source).toContain('data-kpi-card={card.key}');
    expect(source).toContain("key: 'revenue'");
    expect(source).toContain("key: 'orders'");
    expect(source).toContain("key: 'sales'");
    expect(source).toContain("key: 'expense'");
    expect(source).toContain("key: 'profit'");
    expect(source).toContain('现金');
    expect(source).toContain('刷卡');
    const orderCardBlock = source.slice(
      source.indexOf("{ key: 'orders'"),
      source.indexOf("{ key: 'sales'")
    );
    expect(orderCardBlock).toContain('Mesa ${stats.dineInOrders}');
    expect(orderCardBlock).not.toContain('堂食 ${stats.dineInOrders}');
    expect(source).toContain('Barra');
    expect(source).toContain('Delivery');
    expect(source).toContain('data-sales-analysis="true"');
    expect(source).toContain('data-expense-analysis="true"');
    expect(source).toContain('data-customer-analysis="true"');
    expect(source).not.toContain('业务类型分析');
  });

  test('manager dashboard monthly sales calendar uses full amounts and seven day columns only', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');
    const calendarBlock = source.slice(
      source.indexOf('data-monthly-sales-calendar="true"'),
      source.indexOf('data-sales-ranking-panel="true"')
    );

    expect(calendarBlock).toContain("gridTemplateColumns: 'repeat(7, 1fr)'");
    expect(calendarBlock).toContain("textAlign: 'center'");
    expect(calendarBlock).toContain('{money(day.revenue)}');
    expect(calendarBlock).not.toContain('compactMoney(day.revenue)');
    expect(calendarBlock).not.toContain('weeklyRevenue');
    expect(calendarBlock).not.toContain('weeklyOrders');
    expect(calendarBlock).not.toContain('周合计');
    expect(calendarBlock).not.toContain('鍛ㄥ悎璁');
  });

  test('login page does not emit success-flow debug logs in production', () => {
    const loginPath = path.join(process.cwd(), 'src/pages/Login/Login.tsx');
    const source = fs.readFileSync(loginPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('Login椤甸潰 - redirect');
    expect(source).not.toContain('灏濊瘯鐧诲綍');
    expect(source).not.toContain('鐧诲綍鎴愬姛');
    expect(source).not.toContain('鑷姩杩佺Щ鍒?Firebase Auth:');
    expect(source).toContain('console.warn');
    expect(source).toContain('console.error');
  });

  test('auth context does not emit user identity success-flow debug logs', () => {
    const authContextPath = path.join(process.cwd(), 'src/contexts/AuthContext.tsx');
    const source = fs.readFileSync(authContextPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('Firebase Auth user logged in');
    expect(source).not.toContain('restore cached user success');
    expect(source).not.toContain('宸茶Е鍙?userLoggedIn');
    expect(source).not.toContain('Firebase Auth 鐧诲嚭鎴愬姛');
    expect(source).toContain('console.error');
  });

  test('firebase auth service does not emit identity success-flow debug logs', () => {
    const authServicePath = path.join(process.cwd(), 'src/services/FirebaseAuthService.ts');
    const source = fs.readFileSync(authServicePath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('灏濊瘯 Firebase Auth 鐧诲綍');
    expect(source).not.toContain('Firebase Auth 鐧诲綍鎴愬姛');
    expect(source).not.toContain('Firebase Auth 鐧诲嚭鎴愬姛');
    expect(source).not.toContain('鍒涘缓 Firebase Auth 鐢ㄦ埛:');
    expect(source).not.toContain('Firebase Auth 鐢ㄦ埛鍒涘缓鎴愬姛');
    expect(source).toContain('console.error');
  });

  test('firebase initialization avoids Firestore IndexedDB persistence failures', () => {
    const firebaseIndexPath = path.join(process.cwd(), 'src/firebase/index.ts');
    const source = fs.readFileSync(firebaseIndexPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('enableIndexedDbPersistence');
    expect(source).not.toContain('Firebase宸插垵濮嬪寲');
    expect(source).toContain('initializeFirestore(app');
    expect(source).toContain('memoryLocalCache');
    expect(source).not.toContain('persistentLocalCache');
    expect(source).not.toContain('persistentMultipleTabManager');
    expect(source).toContain("setLogLevel('silent')");
    expect(source).not.toContain('console.warn');
  });

  test('purchase item category selector does not emit render debug logs', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');

    expect(source).not.toContain('褰撳墠搴撳瓨鐗╁搧鏁伴噺');
    expect(source).not.toContain('鎻愬彇鍒扮殑绫诲埆');
    expect(source).not.toContain('console.log');
    expect(source).toContain('console.error');
  });

  test('pos does not use broad dataManager.addData writes for production records', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).not.toContain('dataManager.addData(');
  });

  test('pos order cache saves do not replay the full collection to Firestore', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).not.toContain("dataManager.saveData('orders', uniqueOrders);");
    expect(source).toContain("dataManager.saveData('orders', uniqueOrders, { syncFirestore: false");
    expect(source).toContain('if (uniqueOrdersSignature === localOrdersSignatureRef.current) {');
    expect(source).toContain('return;');
    expect(source.indexOf('if (uniqueOrdersSignature === localOrdersSignatureRef.current) {')).toBeLessThan(
      source.indexOf("saveToStorage('pos_orders', uniqueOrders);")
    );
  });

  test('POS does not keep disabled legacy sync blocks or dead order migration branches', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    [
      "smartUpdateDocument('pos_held_orders', order.id, orderData)",
      "smartUpdateDocument('pos_orders', tableActionData.orderId, updatedOrder)",
      "smartUpdateDocument('pos_tables', tableActionData.tableId, tableWithTimestamp)",
      "if (false && order.status === 'served' && order.paymentStatus === 'paid')",
    ].forEach(staleSource => {
      expect(source).not.toContain(staleSource);
    });
  });

  test('POS does not keep the stale data-linkage debug effect with empty counters', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    [
      'const posOrders: any[] = [];',
      'const menuItems: any[] = [];',
      'const inventoryItems: any[] = [];',
      'localStorage.pos_orders',
      'restaurant_menu_items',
      'inventory_items',
    ].forEach(staleDebugSource => {
      expect(source).not.toContain(staleDebugSource);
    });
  });

  test('split bill modal does not keep noisy render debug logging', () => {
    const splitBillPath = path.join(process.cwd(), 'src/components/SplitBillModal.tsx');
    const source = fs.readFileSync(splitBillPath, 'utf8');

    [
      "console.log('SplitBillModal 娓叉煋锛屽晢鍝佹暟:', items.length);",
      "console.log('浣跨敤宸蹭繚瀛樼殑鎷嗗垎璐﹀崟鏁版嵁');",
    ].forEach(staleLog => {
      expect(source).not.toContain(staleLog);
    });
  });

  test('fullscreen function menu stays above POS modal layers', () => {
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain('zIndex: 1000002');
    expect(source).toContain('zIndex: 1000001');
  });

  test('fullscreen function menu uses hard navigation so POS cannot remain mounted after URL changes', () => {
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(layoutPath, 'utf8');
    const blockStart = source.indexOf('const navigateAndClose =');
    const block = source.slice(
      blockStart,
      source.indexOf('return (', blockStart)
    );

    expect(block).toContain('if (shouldUseFullscreenMenu)');
    expect(block).toContain('window.location.assign(path)');
    expect(block).toContain('navigate(path)');
  });

  test('POS cancel and complete actions publish terminal order state immediately', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );
    const cancelBlock = source.slice(
      source.indexOf('const confirmCancelOrder = async'),
      source.indexOf('const handleSplitBillConfirm')
    );

    expect(source).toContain('const publishOrderImmediately = async (order: Order) => {');
    expect(source).not.toContain('const queueOrderPublish = (order: Order) => {');
    expect(source).toContain("await smartUpdateDocument('pos_orders', order.id, serializeOrderForFirestore(order))");
    expect(source).toContain('const startCompletionBackgroundSync = (order: Order, completedOrder: Order) => {');
    expect(source).toContain('publishOrderImmediately(completedOrder)');
    expect(source).toContain('const completionSyncPending = result?.pending || result?.success === false;');
    expect(source).toContain('if (!completionSyncPending)');
    expect(completeBlock).not.toContain('queueOrderPublish(completedOrder)');
    expect(completeBlock.indexOf('setOrders(prevOrders => prevOrders.map(o =>')).toBeLessThan(
      completeBlock.indexOf('startCompletionBackgroundSync(order, completedOrder);')
    );
    expect(completeBlock).not.toContain('await publishOrderImmediately(completedOrder)');
    expect(cancelBlock).toContain('await publishOrderImmediately(cancelledOrder)');
    expect(cancelBlock.indexOf('await publishOrderImmediately(cancelledOrder)')).toBeLessThan(
      cancelBlock.indexOf('setOrders(prevOrders => prevOrders.map(o =>')
    );
  });

  test('POS order publisher does not mark pending cloud writes as synced', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const publishBlock = source.slice(
      source.indexOf('const publishOrderImmediately = async'),
      source.indexOf('useEffect(() => {', source.indexOf('const publishOrderImmediately = async'))
    );

    expect(publishBlock).toContain('const publishResult = await smartUpdateDocument');
    expect(publishBlock).toContain('if (publishResult?.pending || publishResult?.success === false)');
    expect(publishBlock).toContain('return publishResult;');
    expect(publishBlock.indexOf('if (publishResult?.pending || publishResult?.success === false)')).toBeLessThan(
      publishBlock.indexOf('publishedOrderSignaturesRef.current.set')
    );
  });

  test('smart update returns pending fallback status and schedules retry instead of pretending cloud success', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const updateBlock = source.slice(
      source.indexOf('export const smartUpdateDocument = async'),
      source.indexOf('export const smartDeleteDocument = async')
    );
    const fallbackBlock = source.slice(
      source.indexOf('const fallbackToLocalUpdate ='),
      source.indexOf('const fallbackToDelete =')
    );

    expect(updateBlock).toContain('await withWeakNetworkTimeout(');
    expect(updateBlock).toContain('return { success: true, cloudSynced: true };');
    expect(updateBlock).toContain('success: false');
    expect(updateBlock).toContain('pending: true');
    expect(updateBlock).toContain('return { success: true, pending: true, offline: true };');
    expect(fallbackBlock).toContain('schedulePendingSyncRetry();');
  });

  test('POS pending order updates are coalesced so stale states do not replay slowly', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const coalesceBlock = source.slice(
      source.indexOf('const coalescePendingChanges = (changes: PendingChange[]): PendingChange[] => {'),
      source.indexOf('const getPendingChanges = (): PendingChange[] => {')
    );
    const getPendingBlock = source.slice(
      source.indexOf('const getPendingChanges = (): PendingChange[] => {'),
      source.indexOf('const savePendingChange = (change: PendingChange) => {')
    );
    const savePendingBlock = source.slice(
      source.indexOf('const savePendingChange = (change: PendingChange) => {'),
      source.indexOf('const clearPendingChanges = () => {')
    );

    expect(coalesceBlock).toContain("change.collection === 'pos_orders' && change.operation === 'update'");
    expect(coalesceBlock).toContain('posOrderUpdateIndex.get(change.id)');
    expect(coalesceBlock).toContain('result[existingIndex] = change;');
    expect(getPendingBlock).toContain('const coalesced = coalescePendingChanges(parsed);');
    expect(getPendingBlock).toContain('localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(coalesced));');
    expect(savePendingBlock).toContain('const changes = coalescePendingChanges([...getPendingChanges(), change]);');
  });

  test('POS overview keeps the order filters compact and uses lightweight table background artwork', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const orderPanelBlock = source.slice(
      source.indexOf('{/* Right: Order List */}'),
      source.indexOf("<div style={{ marginTop: '0.85rem'")
    );

    expect(source).toContain("import tableFoodBackground from '../../assets/pos/table-food-background.jpg';");
    expect(source).toContain('const tableCanvasFoodPattern = [');
    expect(source).toContain('backgroundImage: tableCanvasFoodPattern');
    expect(source).not.toContain('data:image/svg+xml');
    expect(orderPanelBlock).toContain("gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'");
    expect(orderPanelBlock).not.toContain("gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'");
    expect(source).toContain("takeout: 'Barra'");
    expect(orderPanelBlock).toContain("{formatPosOrderType('takeout')}");
    expect(orderPanelBlock.indexOf('馃搵 Pedidos')).toBeLessThan(
      orderPanelBlock.indexOf("setOrderTypeFilter('all')")
    );
    expect(orderPanelBlock.indexOf("setOrderTypeFilter('all')")).toBeLessThan(
      orderPanelBlock.indexOf("gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'")
    );
  });

  test('POS full order cancel keeps cancelled status locally and releases the order table', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const cancelBlock = source.slice(
      source.indexOf('const confirmCancelOrder = async'),
      source.indexOf('const handleSplitBillConfirm')
    );
    const orderListBlock = source.slice(
      source.indexOf('const today = getLocalDateString();'),
      source.indexOf('const handleAddTable = () => {')
    );

    expect(cancelBlock).toContain('let tableIdToRelease = selectedTableId;');
    expect(cancelBlock).toContain('tableIdToRelease = cancelledOrder.tableId || selectedTableId;');
    expect(cancelBlock).toContain('o.id === selectedOrderId ? cancelledOrder : o');
    expect(cancelBlock).toContain('if (tableIdToRelease) {');
    expect(cancelBlock).toContain('t.id === tableIdToRelease');
    expect(cancelBlock).toContain("currentOrderId: ''");
    expect(cancelBlock).not.toContain('currentOrderId: undefined');
    expect(cancelBlock).toContain("status: 'available' as const");
    expect(orderListBlock).not.toContain("o.status === 'cancelled'");
    expect(source).toContain('getPosOrderStatusText(status, paymentStatus, clearedAt)');
    expect(fs.readFileSync(path.join(process.cwd(), 'src/utils/posLifecycle.ts'), 'utf8'))
      .toContain("case 'cancelled': return 'Cancelado';");
  });

  test('POS cancelled orders are frozen and cannot be reused for new table orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const source = fs.readFileSync(posPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    const tableStatusBlock = source.slice(
      source.indexOf('// 根据订单状态自动更新桌台状态。'),
      source.indexOf('const handleSendToKitchen = async () => {')
    );
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = async () => {'),
      source.indexOf('const deductStockForOrder')
    );
    const orderClickBlock = source.slice(
      source.indexOf('const handleOrderClick = (order: any) => {'),
      source.indexOf('const handleTableDragStart')
    );

    expect(source).toContain("from '../../utils/posLifecycle'");
    expect(lifecycleSource).toContain('export const isEditableActiveOrder = (order?: Partial<PosLifecycleOrder> | null): boolean => {');
    expect(lifecycleSource).toContain('export const reconcileTableStatusFromOrders =');
    expect(lifecycleSource).toContain('currentOrderId: normalizedCurrentOrderId');
    expect(lifecycleSource).not.toContain("currentOrderId: nextStatus === 'available' ? undefined : nextOrderId");
    expect(sendBlock).toContain('const selectedEditableOrder = selectedOrderId');
    expect(sendBlock).toContain('isEditableActiveOrder(o)');
    expect(sendBlock).toContain('if (!selectedEditableOrder) {');
    expect(sendBlock).toContain('setSelectedOrderId(newOrderWithCancelRecords.id)');
    expect(sendBlock).toContain('const editableOrderId = selectedEditableOrder.id;');
    expect(sendBlock).toContain('o.id === editableOrderId');
    expect(orderClickBlock).toContain("if (order.status === 'cancelled' || (order.status === 'completed' && order.clearedAt))");
  });

  test('POS confirm order copy does not claim stock deduction before completion', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = async () => {'),
      source.indexOf('const deductStockForOrder')
    );
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );

    expect(source).toContain("title={hasUnsentItems ? 'Confirmar pedido y enviar a cocina' : 'Todo confirmado'}");
    expect(source).toContain('✅ Confirmar pedido');
    expect(source).not.toContain('纭涓嬪崟锛堝彂閫佸埌鍘ㄦ埧骞舵墸鍑忓簱瀛橈級');
    expect(sendBlock).not.toContain('deductStockForOrder');
    expect(sendBlock).not.toContain('deductStock(');
    expect(source).not.toContain('deductStockForOrder(order)');
    expect(source).toContain('deductStockForOrder(completedOrder)');
    expect(source).toContain('const deductStockForOrder = async (order: Order): Promise<Order> => {');
    expect(completeBlock).toContain('startCompletionBackgroundSync(order, completedOrder);');
    expect(completeBlock).not.toContain('await deductStockForOrder(order)');
    expect(source).toContain('await deductStock(itemsToDeduct, {');
  });

  test('POS returning from an unconfirmed order clears only unsent temporary items', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const returnBlock = source.slice(
      source.indexOf('const discardUnconfirmedOrderItems = () => {'),
      source.indexOf('const handleSendToKitchen = async () => {')
    );

    expect(source).toContain('const resetOrderEntryState = () => {');
    expect(source).toContain('const returnToOverviewFromOrder = () => {');
    expect(returnBlock).toContain('if (!selectedOrderId || !hasUnsentItems) return;');
    expect(returnBlock).toContain('const sentQuantity = getSentQuantity(item);');
    expect(returnBlock).toContain('if (sentQuantity <= 0) return null;');
    expect(returnBlock).toContain('quantity: sentQuantity');
    expect(returnBlock).toContain('sentToKitchen: true');
    expect(returnBlock).toContain('setOrders(prevOrders => prevOrders.map(order =>');
    expect(returnBlock).toContain('resetOrderEntryState();');
    expect(source).toContain('onClick={returnToOverviewFromOrder}');
  });

  test('POS stock deduction uses fresh store inventory before marking order completed', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const source = fs.readFileSync(appContextPath, 'utf8');
    const snapshotBlock = source.slice(
      source.indexOf('const loadSnapshotData = async () => {'),
      source.indexOf('loadSnapshotData();')
    );
    const deductBlock = source.slice(
      source.indexOf('const deductStock = async'),
      source.indexOf('const addStock =')
    );

    expect(snapshotBlock).toContain("{ name: 'inventory_items', setter: setInventoryItems, label: '库存' }");
    expect(deductBlock).toContain("smartGetDocuments('menu_items', true)");
    expect(deductBlock).toContain("smartGetDocuments('inventory_items', true)");
    expect(deductBlock).toContain("smartGetDocuments('fridge_inventory', true)");
    expect(source).toContain("from '../utils/stockDeduction'");
    expect(deductBlock).toContain('buildStockDeductionPlan({');
    expect(deductBlock.indexOf('buildStockDeductionPlan({')).toBeLessThan(
      deductBlock.indexOf("smartIncrementField('inventory_items'")
    );
    expect(deductBlock).toContain('await Promise.all(stockWriteTasks)');
    expect(deductBlock).not.toContain("smartIncrementField('fridge_inventory', updatedInv.id");
    expect(deductBlock).not.toContain('.catch(error =>');
  });

  test('POS stock deduction claims the order in Firestore before decrementing inventory', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const deductBlock = posSource.slice(
      posSource.indexOf('const deductStockForOrder = async'),
      posSource.indexOf('const completeOrderWithStockDeduction')
    );

    expect(syncSource).toContain('export const smartClaimOrderStockDeduction = async');
    expect(syncSource).toContain('runTransaction(db');
    expect(deductBlock).toContain('await smartClaimOrderStockDeduction');
    expect(deductBlock.indexOf('await smartClaimOrderStockDeduction')).toBeLessThan(
      deductBlock.indexOf('await deductStock(itemsToDeduct, {')
    );
    expect(deductBlock).toContain("await smartUpdateDocument('pos_orders', order.id, {");
    expect(deductBlock).toContain('stockDeductionInProgress: false');
  });

  test('POS stock deduction lock can be resumed by the same operation instead of trapping paid orders', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const claimBlock = source.slice(
      source.indexOf('export const smartClaimOrderStockDeduction = async'),
      source.indexOf('export const smartGetDocuments = async')
    );

    expect(claimBlock).toContain('const currentOperationId = currentData.stockDeductionOperationId;');
    expect(claimBlock).toContain('const isSameOperation = Boolean(currentOperationId && currentOperationId === operationId);');
    expect(claimBlock).toContain('!isSameOperation');
    expect(claimBlock).toContain('now - claimedAt < 120000');
  });

  test('POS stock deduction operation id is stable per order so retries cannot double deduct inventory', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const deductBlock = posSource.slice(
      posSource.indexOf('const deductStockForOrder = async'),
      posSource.indexOf('const completeOrderWithStockDeduction')
    );
    const claimBlock = syncSource.slice(
      syncSource.indexOf('export const smartClaimOrderStockDeduction = async'),
      syncSource.indexOf('export const smartGetDocuments = async')
    );

    expect(syncSource).toContain('export const getStableStockDeductionOperationId = (orderId: string) =>');
    expect(posSource).toContain('getStableStockDeductionOperationId');
    expect(deductBlock).toContain('getStableStockDeductionOperationId(order.id)');
    expect(deductBlock).not.toContain('`stock-${order.id}-${Date.now()}`');
    expect(claimBlock).toContain('getStableStockDeductionOperationId(docId)');
    expect(claimBlock).not.toContain('`stock-${docId}-${now}`');
  });

  test('POS stock deduction writes audited sale records to inventory stock ledger', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const appSource = fs.readFileSync(appContextPath, 'utf8');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const deductBlock = appSource.slice(
      appSource.indexOf('const deductStock = async'),
      appSource.indexOf('// 澧炲姞搴撳瓨')
    );
    const posDeductBlock = posSource.slice(
      posSource.indexOf('const deductStockForOrder = async'),
      posSource.indexOf('const completeOrderWithStockDeduction')
    );

    expect(appSource).toContain('smartAddDocument');
    expect(appSource).toContain('interface StockDeductionSource');
    expect(deductBlock).toContain('source?: StockDeductionSource');
    expect(deductBlock).toContain("source: 'pos_sale'");
    expect(deductBlock).toContain("await smartAddDocument('inventory_stock_records', stockRecord)");
    expect(deductBlock).toContain("id: `${sourceOperationId}-warehouse-${item.id}`");
    expect(deductBlock).toContain("id: `${sourceOperationId}-fridge-${recordId}`");
    expect(deductBlock).toContain("orderNumber: source?.orderNumber");
    expect(deductBlock.indexOf("await smartAddDocument('inventory_stock_records', stockRecord)")).toBeLessThan(
      deductBlock.indexOf('setInventoryItems(effectiveInventoryItems.map')
    );
    expect(posDeductBlock).toContain('await deductStock(itemsToDeduct, {');
    expect(posDeductBlock).toContain('operationId');
    expect(posDeductBlock).toContain('orderId: order.id');
    expect(posDeductBlock).toContain('orderNumber: order.orderNumber');
  });

  test('POS fridge stock deduction keeps negative local quantity visible for audit instead of clamping to zero', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const appSource = fs.readFileSync(appContextPath, 'utf8');
    const deductBlock = appSource.slice(
      appSource.indexOf('const deductStock = async'),
      appSource.indexOf('// 婢х偛濮炴惔鎾崇摠')
    );

    expect(deductBlock).toContain('quantity: Number(inv.quantity || 0) - deductQty');
    expect(deductBlock).not.toContain('quantity: Math.max(0, Number(inv.quantity || 0) - deductQty)');
  });

  test('pending sync keeps failed inventory changes queued', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const pendingBlock = source.slice(
      source.indexOf('export const syncPendingChanges = async () => {'),
      source.indexOf('// ==================== 鍒嗗簵鏁版嵁闅旂')
    );

    expect(source).toContain('const setPendingChanges = (changes: PendingChange[]) => {');
    expect(pendingBlock).toContain('const failedChanges: PendingChange[] = []');
    expect(pendingBlock).toContain('failedChanges.push(change)');
    expect(pendingBlock).toContain('setPendingChanges(failedChanges)');
    expect(pendingBlock).not.toContain('clearPendingChanges();');
  });

  test('smart sync weak-network timeout falls back to local pending sync safely', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const getDocsBlock = source.slice(
      source.indexOf('export const smartGetDocuments = async'),
      source.indexOf('export const smartSubscribeToCollection')
    );
    const claimBlock = source.slice(
      source.indexOf('export const smartClaimOrderStockDeduction = async'),
      source.indexOf('/**\n * 閺呴缚鍏橀懢宄板絿')
    );
    const incrementBlock = source.slice(
      source.indexOf('export const smartIncrementField = async'),
      source.indexOf('export const smartClaimOrderStockDeduction = async')
    );

    expect(source).toContain('const WEAK_NETWORK_TIMEOUT_MS');
    expect(source).toContain('class WeakNetworkTimeoutError extends Error');
    expect(source).toContain('const withWeakNetworkTimeout = async');
    expect(source).toContain('const isExpectedOfflineReadError = (error: any): boolean =>');
    expect(getDocsBlock).toContain('withWeakNetworkTimeout(');
    expect(getDocsBlock).toContain('getDocsFromServer(collectionRef)');
    expect(getDocsBlock).toContain('getFromLocalStorage(collectionName)');
    expect(getDocsBlock).toContain('if (!isExpectedOfflineReadError(error))');
    expect(claimBlock).toContain('withWeakNetworkTimeout(');
    expect(claimBlock).toContain('weakNetworkFallback: true');
    expect(incrementBlock).toContain('applyIdempotentIncrement');
    expect(incrementBlock).toContain('const operationId = extraData.syncOperationId ||');
    expect(incrementBlock).toContain('__increment: { fieldName, amount, operationId }');
    expect(source).not.toContain('$collectionName/$docId');
    expect(source).not.toContain('Weak network timeout, update saved locally');
    expect(source).not.toContain('Smart sync warning:');
  });

  test('smart increment keeps local cache aligned after cloud writes and appends new increment docs', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const incrementBlock = source.slice(
      source.indexOf('export const smartIncrementField = async'),
      source.indexOf('export const smartClaimOrderStockDeduction = async')
    );
    const localIncrementBlock = source.slice(
      source.indexOf('const applyIncrementToLocalStorage = ('),
      source.indexOf('const applyIdempotentIncrement = async')
    );

    expect(source).toContain('const applyIncrementToLocalStorage = (');
    expect(localIncrementBlock).toContain('const existingIndex = existing.findIndex(item => item.id === docId)');
    expect(localIncrementBlock).toContain('[fieldName]: (Number(existing[existingIndex]?.[fieldName]) || 0) + amount');
    expect(localIncrementBlock).toContain('[fieldName]: amount');
    expect(incrementBlock).toContain('applyIncrementToLocalStorage(collectionName, docId, fieldName, amount, incrementExtraData);');
    expect(incrementBlock.indexOf('applyIncrementToLocalStorage(collectionName, docId, fieldName, amount, incrementExtraData);')).toBeLessThan(
      incrementBlock.indexOf('return { success: true, operationId };')
    );
    expect(incrementBlock).not.toContain('const updated = existing.map(item => {');
  });

  test('pending sync detects POS stock deduction conflicts and replays increments idempotently', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const pendingBlock = source.slice(
      source.indexOf('export const syncPendingChanges = async () => {'),
      source.indexOf('export const smartGetStoreDocuments = async')
    );

    expect(source).toContain('const SYNC_CONFLICTS_KEY = \'local_pending_sync_conflicts\'');
    expect(source).toContain('saveSyncConflict({');
    expect(source).toContain('const syncPendingPosOrderUpdate = async');
    expect(source).toContain('const isTerminalPosOrderRecord = (record: any): boolean => {');
    expect(source).toContain("return { success: true, skipped: true, reason: 'remote-terminal-order' };");
    expect(source).toContain('stock-deduction-operation-mismatch');
    expect(source).toContain('const applyIdempotentIncrement = async');
    expect(source).toContain('appliedIncrementOperationIds');
    expect(pendingBlock).toContain('await syncPendingPosOrderUpdate(change, collectionPath)');
    expect(pendingBlock).toContain("} else if (change.collection === 'pos_orders') {");
    expect(pendingBlock).toContain('await applyIdempotentIncrement(');
    expect(pendingBlock).toContain('change.data.__increment.operationId');
  });

  test('pending sync skips stale legacy POS stock increments after the cloud order is already deducted', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const pendingBlock = source.slice(
      source.indexOf('export const syncPendingChanges = async () => {'),
      source.indexOf('export const smartGetStoreDocuments = async')
    );

    expect(source).toContain('const getOrderIdFromStockDeductionIncrementId =');
    expect(source).toContain('const shouldSkipPendingStockIncrement = async');
    expect(source).toContain("const posOrdersPath = getStoreCollectionPath('pos_orders');");
    expect(source).toContain('remoteOrder.stockDeducted');
    expect(source).toContain('appliedOperationIds.some(appliedId =>');
    expect(pendingBlock).toContain('await shouldSkipPendingStockIncrement(change, collectionPath, operationId)');
    expect(pendingBlock).toContain('break;');
  });

  test('POS terminal completion actions paint processing feedback before stock and cloud work', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const tableActionBlock = source.slice(
      source.indexOf("const handleTableAction = async (action: 'clear' | 'add') => {"),
      source.indexOf('const subtotal = currentItems.reduce')
    );
    const nonDineInButtonStart = source.indexOf("{order.orderType !== 'dine_in' && order.status !== 'completed'");
    const nonDineInButtonBlock = source.slice(
      nonDineInButtonStart,
      source.indexOf('</button>', nonDineInButtonStart)
    );

    expect(source).toContain('const waitForNextPaint = () => new Promise<void>');
    expect(source).toContain('const [clearingOrderId, setClearingOrderId] = useState<string | null>(null);');
    expect(source).toContain('const [completingOrderIds, setCompletingOrderIds] = useState<Set<string>>');
    expect(tableActionBlock).toContain('setClearingOrderId(orderToClear.id);');
    expect(tableActionBlock.indexOf('setClearingOrderId(orderToClear.id);')).toBeLessThan(
      tableActionBlock.indexOf('await waitForNextPaint();')
    );
    expect(tableActionBlock.indexOf('await waitForNextPaint();')).toBeLessThan(
      tableActionBlock.indexOf('await completeOrderWithStockDeduction(orderToClear, { releaseTable: true });')
    );
    expect(tableActionBlock).not.toContain('setTables(tables.map(t =>');
    expect(nonDineInButtonBlock).toContain('setCompletingOrderIds(prev =>');
    expect(nonDineInButtonBlock.indexOf('await waitForNextPaint();')).toBeLessThan(
      nonDineInButtonBlock.indexOf('await completeOrderWithStockDeduction(order);')
    );
    expect(nonDineInButtonBlock).toContain('disabled={completingOrderIds.has(order.id) || finalizingOrderIds.has(order.id)}');
    expect(nonDineInButtonBlock).toContain("completingOrderIds.has(order.id) ? 'Procesando...' :");
  });

  test('POS completion marks the order completed before background stock deduction finishes', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );
    const tableActionBlock = source.slice(
      source.indexOf("const handleTableAction = async (action: 'clear' | 'add') => {"),
      source.indexOf('const subtotal = currentItems.reduce')
    );
    const nonDineInButtonStart = source.indexOf("{order.orderType !== 'dine_in' && order.status !== 'completed'");
    const nonDineInButtonBlock = source.slice(
      nonDineInButtonStart,
      source.indexOf('</button>', nonDineInButtonStart)
    );

    expect(source).toContain('const [finalizingOrderIds, setFinalizingOrderIds] = useState<Set<string>>');
    expect(source).toContain('const markOrderFinalizing = (orderId: string) => {');
    expect(source).toContain('const clearOrderFinalizing = (orderId: string) => {');
    expect(completeBlock).toContain('const completedOrder: Order = {');
    expect(completeBlock).toContain("status: 'completed' as const");
    expect(completeBlock).toContain('startCompletionBackgroundSync(order, completedOrder);');
    expect(completeBlock.indexOf("status: 'completed' as const")).toBeLessThan(
      completeBlock.indexOf('startCompletionBackgroundSync(order, completedOrder);')
    );
    expect(completeBlock.indexOf('setOrders(prevOrders => prevOrders.map(o =>')).toBeLessThan(
      completeBlock.indexOf('startCompletionBackgroundSync(order, completedOrder);')
    );
    expect(completeBlock).not.toContain('const stockDeductedOrder = await deductStockForOrder(order);');
    expect(source).toContain("finalizingOrderIds.has(order.id) ? 'Completando...' :");
    expect(source).toContain("finalizingOrderIds.has(order.id) && order.status !== 'completed'");
  });

  test('POS background stock deduction starts only after completed order publish is queued', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const backgroundBlock = source.slice(
      source.indexOf('const startCompletionBackgroundSync = (order: Order, completedOrder: Order) => {'),
      source.indexOf('const completeOrderWithStockDeduction')
    );
    const deductionCatchBlock = source.slice(
      source.indexOf('} catch (error) {', source.indexOf('await deductStock(itemsToDeduct')),
      source.indexOf('throw error;', source.indexOf('await deductStock(itemsToDeduct'))
    );

    expect(backgroundBlock).toContain('publishOrderImmediately(completedOrder)');
    expect(backgroundBlock).toContain('const runStockDeductionAfterCompletion = () => {');
    expect(backgroundBlock).toContain('return deductStockForOrder(completedOrder)');
    expect(backgroundBlock.indexOf('publishOrderImmediately(completedOrder)')).toBeLessThan(
      backgroundBlock.indexOf('return runStockDeductionAfterCompletion();', backgroundBlock.indexOf('publishOrderImmediately(completedOrder)'))
    );
    expect(backgroundBlock).not.toContain('deductStockForOrder(order)');
    expect(deductionCatchBlock).toContain('status: order.status');
    expect(deductionCatchBlock).toContain('completedAt: order.completedAt');
    expect(deductionCatchBlock).toContain('clearedAt: order.clearedAt');
  });

  test('POS completion still attempts stock deduction when completed order publish is queued locally', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const backgroundBlock = source.slice(
      source.indexOf('const startCompletionBackgroundSync = (order: Order, completedOrder: Order) => {'),
      source.indexOf('const completeOrderWithStockDeduction')
    );
    const publishStart = backgroundBlock.indexOf('publishOrderImmediately(completedOrder)');
    const publishCatchStart = backgroundBlock.indexOf('.catch(error => {', publishStart);
    const publishCatchBlock = backgroundBlock.slice(
      publishCatchStart,
      backgroundBlock.indexOf('});', publishCatchStart)
    );

    expect(backgroundBlock).toContain('const runStockDeductionAfterCompletion = () => {');
    expect(publishCatchBlock).toContain('return runStockDeductionAfterCompletion();');
  });

  test('POS does not deduct stock again when an order already has stock ledger rows', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const deductBlock = posSource.slice(
      posSource.indexOf('const deductStockForOrder = async'),
      posSource.indexOf('const syncPointsForCompletedOrder')
    );

    expect(posSource).toContain('smartHasOrderStockRecords');
    expect(syncSource).toContain('export const smartHasOrderStockRecords = async');
    expect(deductBlock).toContain('const hasExistingStockRows = await smartHasOrderStockRecords(order.id, order.orderNumber);');
    expect(deductBlock.indexOf('const hasExistingStockRows = await smartHasOrderStockRecords')).toBeLessThan(
      deductBlock.indexOf('await smartClaimOrderStockDeduction')
    );
    expect(deductBlock).toContain('const markedOrder = markOrderStockDeducted(order);');
    expect(deductBlock).toContain('await publishStockDeductionMarker(markedOrder);');
    expect(deductBlock).toContain('return markedOrder;');
  });

  test('POS retries stale pending stock deduction for completed orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const retryBlock = source.slice(
      source.indexOf('const isCompletedOrderStockDeductionStale = (order: Order) => {'),
      source.indexOf('const syncPointsForCompletedOrder')
    );

    expect(source).toContain('const STOCK_DEDUCTION_STALE_LOCK_MS = 2 * 60 * 1000;');
    expect(source).toContain('const stockDeductionRetryIdsRef = useRef<Set<string>>(new Set());');
    expect(retryBlock).toContain("order.status !== 'completed'");
    expect(retryBlock).toContain('order.stockDeducted');
    expect(retryBlock).toContain('!order.stockDeductionPending');
    expect(retryBlock).toContain('Date.now() - claimedAt > STOCK_DEDUCTION_STALE_LOCK_MS');
    expect(retryBlock).toContain('deductStockForOrder(staleOrder)');
    expect(retryBlock).toContain('publishOrderImmediately(stockSyncedOrder)');
    expect(retryBlock).toContain('stockDeductionPending: false');
    expect(retryBlock).toContain('stockDeductionInProgress: false');
  });

  test('POS writes stock deduction marker immediately after stock is deducted', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const deductBlock = source.slice(
      source.indexOf('const publishStockDeductionMarker = async'),
      source.indexOf('const syncPointsForCompletedOrder')
    );

    expect(deductBlock).toContain("await smartUpdateDocument('pos_orders', order.id");
    expect(deductBlock).toContain('stockDeducted: true');
    expect(deductBlock).toContain('stockDeductionInProgress: false');
    expect(deductBlock).toContain('stockDeductionPending: false');
    expect(deductBlock).toContain('await publishStockDeductionMarker(markedOrder);');
    expect(deductBlock).toContain('await publishStockDeductionMarker(stockDeductedOrder);');
    expect(deductBlock.indexOf('await deductStock(itemsToDeduct')).toBeLessThan(
      deductBlock.indexOf('await publishStockDeductionMarker(stockDeductedOrder);')
    );
  });

  test('POS completion feedback is non-blocking so weak network does not trap the cashier', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const tableActionBlock = source.slice(
      source.indexOf("const handleTableAction = async (action: 'clear' | 'add') => {"),
      source.indexOf('const subtotal = currentItems.reduce')
    );
    const nonDineInButtonStart = source.indexOf("{order.orderType !== 'dine_in' && order.status !== 'completed'");
    const nonDineInButtonBlock = source.slice(
      nonDineInButtonStart,
      source.indexOf('</button>', nonDineInButtonStart)
    );

    expect(source).toContain('type PosToast = {');
    expect(source).toContain('const showPosToast = (message: string');
    expect(source).toContain('const getCompletionErrorMessage = (error: unknown) => {');
    expect(source).toContain("const insufficientStockPrefix = 'insufficient-stock:';");
    expect(source).toContain('return `Inventario insuficiente: ${itemName}. Ajuste inventario y vuelva a intentar.`;');
    expect(source).toContain('{posToast && (');
    expect(tableActionBlock).toContain("showPosToast('Mesa liberada. Lista para nuevo cliente.', 'success');");
    expect(tableActionBlock).toContain("showPosToast(getCompletionErrorMessage(error), 'error');");
    expect(tableActionBlock).not.toContain("alert('No se pudo sincronizar. Revise la red e intente de nuevo.')");
    expect(tableActionBlock).not.toContain("alert('\\u684c\\u53f0\\u5df2\\u6e05\\u7406\\uff0c\\u53ef\\u4ee5\\u63a5\\u5f85\\u65b0\\u987e\\u5ba2')");
    expect(nonDineInButtonBlock).toContain("showPosToast('Pedido completado. Inventario descontado.', 'success');");
    expect(nonDineInButtonBlock).toContain("showPosToast(getCompletionErrorMessage(error), 'error');");
    expect(nonDineInButtonBlock).not.toContain("alert('鉁?Pedido completado. Inventario descontado.')");
    expect(nonDineInButtonBlock).not.toContain("alert('No se pudo sincronizar. Revise la red e intente de nuevo.')");
  });

  test('POS clear-table treats pending cloud publish as local success instead of blocking the cashier', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );
    const tableActionBlock = source.slice(
      source.indexOf("const handleTableAction = async (action: 'clear' | 'add') => {"),
      source.indexOf('const subtotal =')
    );

    expect(source).toContain('const completionSyncPending = result?.pending || result?.success === false;');
    expect(completeBlock).toContain('setOrders(prevOrders => prevOrders.map(o =>');
    expect(completeBlock).not.toContain("throw new Error('complete-order-cloud-sync-pending')");
    expect(completeBlock).toContain('startCompletionBackgroundSync(order, completedOrder);');
    expect(tableActionBlock).toContain("showPosToast('Mesa liberada. Lista para nuevo cliente.', 'success');");
  });

  test('POS clear-table overwrites stale cloud table order binding with an empty value', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );

    expect(completeBlock).toContain("status: 'available' as const");
    expect(completeBlock).toContain("currentOrderId: ''");
    expect(completeBlock).not.toContain('currentOrderId: undefined');
  });

  test('POS table status changes that affect other terminals are published to cloud subscribers', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeOrderWithStockDeduction'),
      source.indexOf('const handleCompletePayment = async')
    );
    const paymentBlock = source.slice(
      source.indexOf('const handleCompletePayment = async'),
      source.indexOf('const confirmCancelOrder = async')
    );
    const cancelBlock = source.slice(
      source.indexOf('const confirmCancelOrder = async'),
      source.indexOf('const handleSplitBillConfirm')
    );

    const releaseTableBlock = completeBlock.slice(
      completeBlock.indexOf('if (options.releaseTable && order.tableId)'),
      completeBlock.indexOf('return completedOrder;')
    );
    const needsCleaningBlock = paymentBlock.slice(
      paymentBlock.indexOf("if (isFullyPaid && paidOrderForSideEffects?.orderType === 'dine_in'"),
      paymentBlock.indexOf('let successMessage')
    );
    const cancelReleaseStart = cancelBlock.indexOf('if (tableIdToRelease)');
    const cancelReleaseBlock = cancelBlock.slice(
      cancelReleaseStart,
      cancelBlock.indexOf('setShowCancelModal(false)', cancelReleaseStart)
    );

    [
      { block: releaseTableBlock, marker: 'markTableUserEdit(order.tableId)' },
      { block: needsCleaningBlock, marker: 'markTableUserEdit(paidOrderForSideEffects.tableId)' },
      { block: cancelReleaseBlock, marker: 'markTableUserEdit(tableIdToRelease)' },
    ].forEach(({ block, marker }) => {
      expect(block).toContain(marker);
      expect(block.indexOf(marker)).toBeLessThan(
        block.indexOf('setTables(prevTables => prevTables.map(t =>')
      );
      expect(block).toContain('lastModified: Date.now()');
    });

    const reconcileEffectBlock = source.slice(
      source.indexOf('const reconciledTables = tables.map'),
      source.indexOf('saveToStorage(\'pos_cancel_records\'')
    );
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    expect(lifecycleSource).toContain('export const reconcileTableStatusFromOrders =');
    expect(reconcileEffectBlock).toContain('tableCloudHydratedRef.current');
    expect(reconcileEffectBlock).toContain('changedTableIds.forEach(tableId => markTableUserEdit(tableId))');
    expect(reconcileEffectBlock).toContain('setTables(reconciledTables);');
    expect(reconcileEffectBlock).toContain('}, [orders, tables]);');
  });

  test('POS table status publishing writes only dirty tables and cannot overwrite the full layout', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const publisherBlock = source.slice(
      source.indexOf("saveToStorage('pos_tables', tables);"),
      source.indexOf('// 同步订单到本地和全局上下文')
    );

    expect(source).toContain('const dirtyTableIdsRef = useRef<Set<string>>(new Set());');
    expect(source).toContain('const publishedTableSignaturesRef = useRef<Map<string, string>>(new Map());');
    expect(publisherBlock).toContain('const dirtyTableIds = dirtyTableIdsRef.current;');
    expect(publisherBlock).toContain('const tablesToPublish = tables.filter(table => {');
    expect(publisherBlock).toContain('return dirtyTableIds.has(table.id);');
    expect(publisherBlock).toContain('tablesToPublish.forEach(table => {');
    expect(publisherBlock).not.toContain('tables.forEach(table => {');
    expect(source).not.toContain('markTableUserEdit();');
  });

  test('POS lifecycle audit script is read-only and checks table/order mismatches', () => {
    const scriptPath = path.join(process.cwd(), 'scripts/auditPosLifecycle.mjs');
    const packagePath = path.join(process.cwd(), 'package.json');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const packageSource = fs.readFileSync(packagePath, 'utf8');

    expect(packageSource).toContain('"audit:pos-lifecycle": "node scripts/auditPosLifecycle.mjs"');
    expect(source).toContain("getRows(`stores/${storeId}/pos_orders`)");
    expect(source).toContain("getRows(`stores/${storeId}/pos_tables`)");
    expect(source).toContain('multiple_active_orders_on_same_table');
    expect(source).toContain('busy_table_points_to_terminal_order');
    expect(source).toContain('completed_order_missing_stock_deduction_flag');
    expect(source).not.toContain('setDoc(');
    expect(source).not.toContain('updateDoc(');
    expect(source).not.toContain('deleteDoc(');
    expect(source).not.toContain('addDoc(');
    expect(source).not.toContain('writeBatch(');
    expect(source).not.toContain('runTransaction(');
  });

  test('inventory lifecycle audit script is read-only and checks store-scoped stock consistency', () => {
    const scriptPath = path.join(process.cwd(), 'scripts/auditInventoryLifecycle.mjs');
    const packagePath = path.join(process.cwd(), 'package.json');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const packageSource = fs.readFileSync(packagePath, 'utf8');

    expect(packageSource).toContain('"audit:inventory-lifecycle": "node scripts/auditInventoryLifecycle.mjs"');
    [
      "getRows(`stores/${storeId}/inventory_items`)",
      "getRows(`stores/${storeId}/fridges`)",
      "getRows(`stores/${storeId}/fridge_inventory`)",
      "getRows(`stores/${storeId}/stock_transfer_records`)",
      "getRows(`stores/${storeId}/warehouse_stocktake_history`)",
      "getRows(`stores/${storeId}/fridge_stocktake_history`)",
      "getRows(`stores/${storeId}/purchase_orders`)",
    ].forEach(readPath => {
      expect(source).toContain(readPath);
    });

    [
      'negative_warehouse_stock',
      'negative_fridge_stock',
      'fridge_record_missing_item',
      'fridge_record_missing_fridge',
      'duplicate_fridge_item_record',
      'cash_purchase_missing_expense_link',
      'duplicate_transfer_operation_id',
    ].forEach(issueCode => {
      expect(source).toContain(issueCode);
    });

    expect(source).not.toContain('setDoc(');
    expect(source).not.toContain('updateDoc(');
    expect(source).not.toContain('deleteDoc(');
    expect(source).not.toContain('addDoc(');
    expect(source).not.toContain('writeBatch(');
    expect(source).not.toContain('runTransaction(');
  });

  test('POS table cloud snapshots cannot overwrite newer local clear-table state', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const tableSubscriptionStart = source.indexOf("smartSubscribeToCollection('pos_tables'");
    const tableSubscriptionBlock = source.slice(
      tableSubscriptionStart,
      source.indexOf('return () => unsubscribe();', tableSubscriptionStart)
    );

    expect(source).toContain('const mergeTablesByVersion = (');
    expect(source).toContain('getTableVersion(localTable) > getTableVersion(incomingTable)');
    expect(tableSubscriptionBlock).toContain('setTables(prevTables => {');
    expect(tableSubscriptionBlock).toContain('const mergedTables = mergeTablesByVersion(');
    expect(tableSubscriptionBlock).toContain('dirtyTableIdsRef.current');
    expect(tableSubscriptionBlock).not.toContain('setTables(normalized.tables);');
  });

  test('POS default table placeholders cannot win over cloud table layout versions', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const source = fs.readFileSync(posPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    const normalizeBlock = source.slice(
      source.indexOf('const normalizeTables = ('),
      source.indexOf('const mergeTablesByVersion = (')
    );
    const mergeBlock = source.slice(
      source.indexOf('const mergeTablesByVersion = ('),
      source.indexOf('const getMergedTableBounds =')
    );

    expect(normalizeBlock).toContain('lastModified: getTableVersion(table)');
    expect(normalizeBlock).not.toContain('lastModified: getTableVersion(table) || Date.now()');
    expect(normalizeBlock).toContain("currentOrderId: table.currentOrderId || ''");
    expect(mergeBlock).toContain('dirtyTableIds: Set<string> = new Set()');
    expect(mergeBlock).toContain('dirtyTableIds.has(localTable.id)');
    expect(mergeBlock).toContain('merged.set(incomingTable.id, incomingTable)');
    expect(lifecycleSource).toContain("const currentOrderId = table.currentOrderId || '';");
    expect(lifecycleSource).toContain('normalizedCurrentOrderId === currentOrderId');
  });

  test('smart update uses Firestore upsert instead of update-only writes', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('await updateDoc(docRef, firestoreUpdateData)');
    expect(source).toContain('() => setDoc(docRef, firestoreUpdateData, { merge: true })');
  });

  test('smart POS order writes cannot regress a newer cloud lifecycle state', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const updateStart = source.indexOf('export const smartUpdateDocument = async (');
    expect(updateStart).toBeGreaterThan(-1);
    const updateBlock = source.slice(
      updateStart,
      source.indexOf('/**', updateStart + 1)
    );

    expect(source).toContain('const isPosOrderLifecycleRegression = (current: any, incoming: any): boolean => {');
    expect(updateBlock).toContain("const collectionKey = getCollectionKey(collectionName);");
    expect(updateBlock).toContain("if (collectionKey === 'pos_orders') {");
    expect(updateBlock).toContain('runTransaction(db, async transaction => {');
    expect(updateBlock).toContain('if (remoteData && isPosOrderLifecycleRegression(remoteData, normalizedData)) {');
    expect(updateBlock).toContain('return { skipped: true, remoteData };');
    expect(updateBlock).toContain('transaction.set(docRef, firestoreUpdateData, { merge: true });');
  });

  test('smart sync refuses global fallback paths for store business collections', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).toContain('const requiresStoreScope = (collectionName: string): boolean');
    expect(source).toContain('blocked store-scoped Firestore access');
    expect(source).toContain('blocked store-scoped local cache access');
    expect(source).not.toContain('return collectionName;\n};\n\nconst getLocalStorageKey');
    expect(source).not.toContain('return storeId ? `store_${storeId}_${collectionKey}` : collectionKey;');
  });

  test('smart sync explicit store paths still use store-scoped local cache keys', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).toContain('const getStoreIdFromExplicitPath = (collectionName: string): string | null');
    expect(source).toContain("parts[0] === 'stores'");
    expect(source).toContain('return `store_${explicitStoreId}_${collectionKey}`;');
  });

  test('smart sync service does not expose legacy bulk migration writers', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('export const manualSyncToFirestore');
    expect(source).not.toContain('export const migrateOldData');
    expect(source).not.toContain('export const smartBatchAddDocuments');
  });

  test('legacy global sync service and hook are removed from production source', () => {
    const legacyServicePath = path.join(process.cwd(), 'src/services/dataSync.ts');
    const legacyHookPath = path.join(process.cwd(), 'src/hooks/useFirestoreData.ts');
    const srcRoot = path.join(process.cwd(), 'src');
    const sourceFiles: string[] = [];

    const collectSource = (directory: string) => {
      fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          collectSource(entryPath);
          return;
        }
        if (entry.name !== 'dataSafety.test.ts' && /\.(ts|tsx)$/.test(entry.name)) {
          sourceFiles.push(fs.readFileSync(entryPath, 'utf8'));
        }
      });
    };

    expect(fs.existsSync(legacyServicePath)).toBe(false);
    expect(fs.existsSync(legacyHookPath)).toBe(false);

    collectSource(srcRoot);
    const combinedSource = sourceFiles.join('\n');
    expect(combinedSource).not.toContain("from '../services/dataSync'");
    expect(combinedSource).not.toContain("from '../../services/dataSync'");
    expect(combinedSource).not.toContain("from '../hooks/useFirestoreData'");
    expect(combinedSource).not.toContain("from '../../hooks/useFirestoreData'");
  });

  test('confirmed unused legacy UI and store isolation leftovers are removed', () => {
    const removedPaths = [
      'src/components/OrderDetails.tsx',
      'src/components/OrderList.tsx',
      'src/components/Payment.tsx',
      'src/pages/Dashboard/Dashboard.tsx',
      'src/pages/Reports/Reports.tsx',
      'src/pages/Manager/ManagerDashboard.tsx',
      'src/pages/Manager/ShiftHandoverEmbedded.tsx',
      'src/utils/storeDataIsolation.ts',
    ];
    const removedImportFragments = [
      'components/OrderDetails',
      'components/OrderList',
      'components/Payment',
      'pages/Dashboard/Dashboard',
      'pages/Reports/Reports',
      'pages/Manager/ManagerDashboard',
      'pages/Manager/ShiftHandoverEmbedded',
      'utils/storeDataIsolation',
    ];
    const srcRoot = path.join(process.cwd(), 'src');
    const sourceFiles: string[] = [];

    const collectSource = (directory: string) => {
      fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          collectSource(entryPath);
          return;
        }
        if (entry.name !== 'dataSafety.test.ts' && /\.(ts|tsx)$/.test(entry.name)) {
          sourceFiles.push(fs.readFileSync(entryPath, 'utf8'));
        }
      });
    };

    removedPaths.forEach(relativePath => {
      expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(false);
    });

    collectSource(srcRoot);
    const combinedSource = sourceFiles.join('\n');
    removedImportFragments.forEach(importFragment => {
      expect(combinedSource).not.toContain(importFragment);
    });
  });

  test('app context does not auto-save shared module data through legacy DataService', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const source = fs.readFileSync(appContextPath, 'utf8');

    expect(source).not.toContain('dataService.saveData(');
  });

  test('app context keeps only active orders realtime and loads low-frequency data from server snapshots', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const source = fs.readFileSync(appContextPath, 'utf8');
    const liveSubscriptionBlock = source.slice(source.indexOf('const unsubscribers = ['));
    const snapshotLoadBlock = source.slice(source.indexOf('const loadSnapshotData = async () => {'), source.indexOf('loadSnapshotData();'));

    expect(liveSubscriptionBlock).toContain('smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefix');
    expect(liveSubscriptionBlock).not.toContain("smartSubscribeToCollection('menu_items'");
    expect(snapshotLoadBlock).toContain('const data = await smartGetDocuments(config.name, true)');
    expect(snapshotLoadBlock).toContain('applyCloudData(data, config.setter, config.label);');
    expect(snapshotLoadBlock).not.toContain('applyCloudData(data, config.setter, config.label, { merge: true });');
  });

  test('app context subscribes only to current-day POS orders instead of full order history', () => {
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const appSource = fs.readFileSync(appContextPath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const liveSubscriptionBlock = appSource.slice(
      appSource.indexOf('const unsubscribers = ['),
      appSource.indexOf('return () => {', appSource.indexOf('const unsubscribers = ['))
    );
    const prefixSubscribeBlock = syncSource.slice(
      syncSource.indexOf('export const smartSubscribeToPosOrdersByDatePrefix ='),
      syncSource.indexOf('const saveToLocalStorage =')
    );

    expect(appSource).toContain("import { getLocalDateString } from '../utils/localTime';");
    expect(appSource).toContain('const getTodayOrderPrefix = (): string => {');
    expect(appSource).toContain('return `${today.slice(5, 7)}${today.slice(8, 10)}`;');
    expect(appSource).toContain('const isOrderFromPrefix = (order: Partial<Order>, orderPrefix: string): boolean => {');
    expect(liveSubscriptionBlock).toContain('smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefix');
    expect(liveSubscriptionBlock).toContain('if (!data || data.length === 0) {');
    expect(liveSubscriptionBlock).toContain('preserving local orders');
    expect(liveSubscriptionBlock).toContain('setOrders(prevOrders => {');
    expect(liveSubscriptionBlock).toContain('...prevOrders.filter(order => !isOrderFromPrefix(order, todayOrderPrefix))');
    expect(liveSubscriptionBlock).toContain('...(data as Order[])');
    expect(appSource).toContain("dataManager.saveData('orders', orders, { syncFirestore: false, persistLocal: false });");
    expect(appSource).not.toContain("dataManager.saveData('orders', orders, { syncFirestore: false });");
    expect(liveSubscriptionBlock).not.toContain("applyCloudData(data, setOrders");
    expect(liveSubscriptionBlock).not.toContain("smartSubscribeToCollection('pos_orders'");
    expect(prefixSubscribeBlock).toContain("where('orderNumber', '>=', datePrefix)");
    expect(prefixSubscribeBlock).toContain("where('orderNumber', '<=', `${datePrefix}\\uf8ff`)");
    expect(prefixSubscribeBlock).toContain("orderBy('orderNumber', 'asc')");
    expect(syncSource).toContain('const replaceLocalPosOrdersForDatePrefix = (datePrefix: string, cloudOrders: any[]) =>');
    expect(syncSource).toContain("const storageKey = storeId ? `store_${storeId}_pos_pending_order_sync` : 'pos_pending_order_sync';");
    expect(syncSource).toContain('if (pendingOrderIds.has(String(order?.id || \'\'))) return true;');
    expect(syncSource).toContain('return !String(order?.orderNumber || \'\').startsWith(datePrefix);');
    expect(prefixSubscribeBlock).toContain('getDocsFromServer(orderQuery)');
    expect(prefixSubscribeBlock).toContain('.then(applyOrderSnapshot)');
    expect(prefixSubscribeBlock).toContain('if (snapshot.metadata.fromCache && navigator.onLine) {');
    expect(prefixSubscribeBlock).toContain('replaceLocalPosOrdersForDatePrefix(datePrefix, activeData);');
    expect(prefixSubscribeBlock).not.toContain('localStorage.setItem(localStorageKey, JSON.stringify(activeData))');
    expect(prefixSubscribeBlock).not.toContain('localStorage.setItem(localStorageKey, JSON.stringify(mergedData))');
  });

  test('POS page subscribes directly to current-day orders for multi-terminal realtime state', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).toContain('smartSubscribeToPosOrdersByDatePrefix');
    expect(source).toContain('const applyIncomingCloudOrders = React.useCallback');
    expect(source).toContain('return smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefixForSubscription');
    expect(source).toContain('applyIncomingCloudOrders(data as Order[])');
    expect(source).toContain('applyIncomingCloudOrders(appOrders as Order[])');
  });

  test('POS current-day cloud empty snapshots do not clear local orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const applyStart = source.indexOf('const applyIncomingCloudOrders = React.useCallback');
    expect(applyStart).toBeGreaterThan(-1);
    const applyBlock = source.slice(
      applyStart,
      source.indexOf('React.useEffect(() => {', applyStart)
    );

    expect(source).toContain('const isOrderFromDatePrefix = (order: Partial<Order>, datePrefix: string): boolean => {');
    expect(applyBlock).toContain('if (!incomingOrders || incomingOrders.length === 0) {');
    expect(applyBlock).toContain('preserving local orders');
    expect(applyBlock).toContain('return;');
    expect(applyBlock).not.toContain('return !isOrderFromDatePrefix(order, todayOrderPrefix);');
  });

  test('POS current-day subscription does not replace local cache when snapshot is empty', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const prefixSubscribeBlock = syncSource.slice(
      syncSource.indexOf('export const smartSubscribeToPosOrdersByDatePrefix ='),
      syncSource.indexOf('const saveToLocalStorage =')
    );

    expect(prefixSubscribeBlock).toContain('if (activeData.length > 0) {');
    expect(prefixSubscribeBlock).toContain('replaceLocalPosOrdersForDatePrefix(datePrefix, activeData);');
    expect(prefixSubscribeBlock).toContain('} else {');
    expect(prefixSubscribeBlock).toContain('console.warn');
    expect(prefixSubscribeBlock).toContain('loadRecentPosOrdersFallback');
  });

  test('POS current-day cloud snapshots remove local orders deleted from cloud while keeping pending offline orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const applyStart = source.indexOf('const applyIncomingCloudOrders = React.useCallback');
    expect(applyStart).toBeGreaterThan(-1);
    const applyBlock = source.slice(
      applyStart,
      source.indexOf('React.useEffect(() => {', applyStart)
    );

    expect(applyBlock).toContain('const incomingById = new Map(incomingOrders.map(order => [order.id, order]));');
    expect(applyBlock).toContain('const cloudReconciledOrders = prevOrders.filter(order => {');
    expect(applyBlock).toContain('if (pendingOrderSyncIdsRef.current.has(order.id)) return true;');
    expect(applyBlock).toContain('if (!isOrderFromDatePrefix(order, todayOrderPrefix)) return true;');
    expect(applyBlock).toContain('return incomingById.has(order.id);');
    expect(applyBlock).toContain('const removedByCloudSnapshot = cloudReconciledOrders.length !== prevOrders.length;');
    expect(applyBlock).toContain('if (!removedByCloudSnapshot && !hasNewerCloudOrders(incomingOrders, prevOrders, pendingOrderSyncIdsRef.current))');
    expect(applyBlock).toContain('const mergedOrders = mergeOrdersByVersion(cloudReconciledOrders, incomingOrders, pendingOrderSyncIdsRef.current);');
    expect(applyBlock).not.toContain('const mergedOrders = mergeOrdersByVersion(prevOrders, incomingOrders, pendingOrderSyncIdsRef.current);');
  });

  test('POS startup cache merge skips current-day non-pending orders so deleted cloud orders cannot reappear', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const ordersDataStart = source.indexOf("const ordersData = dataService.getData('pos_orders');");
    expect(ordersDataStart).toBeGreaterThan(-1);
    const ordersDataBlock = source.slice(
      ordersDataStart,
      source.indexOf('//', source.indexOf("const heldOrdersData = dataService.getData('pos_held_orders');"))
    );

    expect(ordersDataBlock).toContain("const today = getLocalDateString();");
    expect(ordersDataBlock).toContain("const todayOrderPrefix = `${today.slice(5, 7)}${today.slice(8, 10)}`;");
    expect(ordersDataBlock).toContain("const cachedOrdersForMerge = (ordersData as Order[]).filter(order => {");
    expect(ordersDataBlock).toContain("if (pendingOrderSyncIdsRef.current.has(order.id)) return true;");
    expect(ordersDataBlock).toContain("return !isOrderFromDatePrefix(order, todayOrderPrefix);");
    expect(ordersDataBlock).toContain("mergeOrdersByVersion(prevOrders, cachedOrdersForMerge, pendingOrderSyncIdsRef.current)");
    expect(ordersDataBlock).not.toContain("mergeOrdersByVersion(prevOrders, ordersData as Order[], pendingOrderSyncIdsRef.current)");
  });

  test('POS route return does not delete current-day cached orders before cloud snapshot arrives', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const filterStart = source.indexOf('const filterCachedOrdersForStartup = (cachedOrders: Order[]): Order[] => {');
    expect(filterStart).toBeGreaterThan(-1);
    const filterBlock = source.slice(
      filterStart,
      source.indexOf('const generateOrderId = () => {', filterStart)
    );

    expect(filterBlock).toContain('return cachedOrders;');
    expect(filterBlock).not.toContain('return !isOrderFromDatePrefix(order, todayOrderPrefix);');
  });

  test('POS local item edits do not publish active orders before an explicit business action', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const addItemBlock = source.slice(
      source.indexOf('const handleAddItem = (item: any) => {'),
      source.indexOf('const handleRemoveItem = (itemId: string) => {')
    );
    const removeItemBlock = source.slice(
      source.indexOf('const handleRemoveItem = (itemId: string) => {'),
      source.indexOf('const handleUpdateQuantity = (itemId: string, quantity: number) => {')
    );
    const updateQuantityBlock = source.slice(
      source.indexOf('const handleUpdateQuantity = (itemId: string, quantity: number) => {'),
      source.indexOf('const handleHoldOrder = async () => {')
    );
    const cancelItemBlock = source.slice(
      source.indexOf('if (itemToDelete) {'),
      source.indexOf('} else {', source.indexOf('if (itemToDelete) {'))
    );

    expect(source).not.toContain('const syncEditableOrderItems =');
    [addItemBlock, removeItemBlock, updateQuantityBlock, cancelItemBlock].forEach(block => {
      expect(block).not.toContain('publishOrderImmediately(');
      expect(block).not.toContain('pendingOrderSyncIdsRef.current.add');
    });
  });

  test('expense records use explicit single-document cloud writes', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const source = fs.readFileSync(expensePath, 'utf8');
    const addBlock = source.slice(
      source.indexOf('const handleAddExpense = async () => {'),
      source.indexOf('const handleDeleteExpense = async')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteExpense = async'),
      source.indexOf('const handleImageUpload')
    );
    const addCategoryBlock = source.slice(
      source.indexOf('const handleAddCategory = async'),
      source.indexOf('// 鍒犻櫎绫诲埆')
    );
    const deleteCategoryBlock = source.slice(
      source.indexOf('const handleDeleteCategory = async'),
      source.indexOf('// 澶勭悊绁ㄦ嵁涓婁紶')
    );
    const receiptBlock = source.slice(
      source.indexOf('const handleReceiptUpload ='),
      source.indexOf('const getExpenseDateTime')
    );

    expect(source).not.toContain("dataService.saveData('expense_categories'");
    expect(source).not.toContain("dataManager.saveData('expenses', nextExpenses);");
    expect(source).not.toContain("dataManager.saveData('expenses', updatedExpenses);");
    expect(source).toContain("smartSetDocument('expenses', newExpense.id, newExpense)");
    expect(addBlock).toContain("if (!window.confirm('确认保存这条开支记录吗？')) {");
    expect(addBlock.indexOf("if (!window.confirm('确认保存这条开支记录吗？')) {")).toBeLessThan(
      addBlock.indexOf("await smartSetDocument('expenses', newExpense.id, newExpense)")
    );
    expect(addBlock.indexOf("await smartSetDocument('expenses', newExpense.id, newExpense)")).toBeLessThan(
      addBlock.indexOf('setExpenses(nextExpenses)')
    );
    expect(deleteBlock.indexOf("await smartDeleteDocument('expenses', id)")).toBeLessThan(
      deleteBlock.indexOf('setExpenses(nextExpenses)')
    );
    expect(addCategoryBlock.indexOf("await smartSetDocument('expense_categories', newCat.id, newCat)")).toBeLessThan(
      addCategoryBlock.indexOf('setCategoriesCache(nextCategories)')
    );
    expect(deleteCategoryBlock.indexOf("await smartDeleteDocument('expense_categories', id)")).toBeLessThan(
      deleteCategoryBlock.indexOf('setCategoriesCache(nextCategories)')
    );
    expect(receiptBlock.indexOf("await smartSetDocument('expenses', updatedExpense.id, updatedExpense)")).toBeLessThan(
      receiptBlock.indexOf('setExpenses(updatedExpenses)')
    );
  });

  test('expense records collection is allowed by firestore rules', () => {
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    expect(rules).toContain('match /stores/{storeId}/expense_records/{expenseId}');
    expect(rules).toContain('allow write: if canManageStore(storeId);');
  });

  test('firestore rules enforce active users and role-level store writes', () => {
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    expect(rules).toContain("function isActiveUser()");
    expect(rules).toContain("getUserStatus() != 'inactive'");
    expect(rules).toContain("function hasStoreRole(storeId, roles)");
    expect(rules).toContain("function canManageStore(storeId)");
    expect(rules).toContain("function canOperatePos(storeId)");
    expect(rules).toContain("allow write: if canManageStore(storeId);");
    expect(rules).toContain("allow write: if canOperatePos(storeId);");
    expect(rules).not.toContain('allow read, write: if isAuthenticated() && hasStoreAccess(storeId);');
  });

  test('storage rules require authenticated same-store writes and deny broad fallback writes', () => {
    const rulesPath = path.join(process.cwd(), '../storage.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    expect(rules).toContain("function hasStoreAccess(storeId)");
    expect(rules).toContain('allow write: if hasStoreAccess(storeId)');
    expect(rules).toContain("request.resource.contentType.matches('image/.*')");
    expect(rules).toContain('allow read, write: if false;');
    expect(rules).not.toContain('allow read, write: if request.auth != null;');
  });

  test('expense category local cache is scoped to the current store', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const source = fs.readFileSync(expensePath, 'utf8');

    expect(source).toContain("dataService.getStoreKey('expense_categories')");
    expect(source).toContain('localStorage.getItem(expenseCategoryStorageKey)');
    expect(source).toContain('localStorage.setItem(expenseCategoryStorageKey');
    expect(source).not.toContain("localStorage.getItem('expense_categories')");
    expect(source).not.toContain("localStorage.setItem('expense_categories'");
  });

  test('expense categories use parent child hierarchy and keep legacy records readable', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const metricsPath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const categoryPath = path.join(process.cwd(), 'src/utils/expenseCategories.ts');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const reportsSource = fs.readFileSync(reportsPath, 'utf8');
    const metricsSource = fs.readFileSync(metricsPath, 'utf8');
    const categorySource = fs.readFileSync(categoryPath, 'utf8');

    expect(expenseSource).toContain('normalizeExpenseCategories');
    expect(expenseSource).toContain('parentCategoryId');
    expect(expenseSource).toContain('categoryName');
    expect(expenseSource).toContain('getExpenseChildCategories(categories, formData.parentCategoryId)');
    expect(expenseSource).toContain('canDeleteExpenseCategory(id, categories, expenses)');
    expect(categorySource).toContain('DEFAULT_EXPENSE_PARENT_IDS');
    expect(categorySource).toContain("level: 'parent'");
    expect(categorySource).toContain("level: 'child'");
    expect(metricsSource).toContain('getExpenseCategoryPath');
    expect(metricsSource).toContain('parentCategory?: string');
    expect(reportsSource).toContain('group.title');
    expect(expenseSource).not.toContain('categories.map(cat => (\\n            <option key={cat.id} value={cat.id}>{cat.name}</option>');
  });

  test('expense category manager can rename or delete used parent and child categories', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const categoryPath = path.join(process.cwd(), 'src/utils/expenseCategories.ts');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const categorySource = fs.readFileSync(categoryPath, 'utf8');
    const renameBlock = expenseSource.slice(
      expenseSource.indexOf('const handleRenameCategory = async'),
      expenseSource.indexOf('const handleDeleteCategory = async')
    );

    expect(renameBlock).toContain("await smartSetDocument('expense_categories', updatedCategory.id, updatedCategory)");
    expect(renameBlock).toContain('setCategoriesCache(nextCategories)');
    expect(renameBlock).not.toContain('canDeleteExpenseCategory');
    expect(expenseSource).toContain('onClick={() => handleRenameCategory(parent.id)}');
    expect(expenseSource).toContain('onClick={() => handleRenameCategory(cat.id)}');
    expect(categorySource).toContain('categoryIdsToDelete?: string[]');
    expect(categorySource).toContain('categoryIdsToDelete: [categoryId, ...childCategoryIds]');
    expect(categorySource).not.toContain('usedCategoryIds');
    expect(categorySource).not.toContain('hasChildReferences');
  });
  test('expense receipt removal waits for cloud write before local state update', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const source = fs.readFileSync(expensePath, 'utf8');
    const clearReceiptBlock = source.slice(
      source.indexOf('const handleClearReceipt = async'),
      source.indexOf('const getExpenseDateTime')
    );

    expect(clearReceiptBlock).toContain("await smartSetDocument('expenses', updatedExpense.id, updatedExpense)");
    expect(clearReceiptBlock.indexOf("await smartSetDocument('expenses', updatedExpense.id, updatedExpense)")).toBeLessThan(
      clearReceiptBlock.indexOf('setExpenses(updatedExpenses)')
    );
    expect(clearReceiptBlock).toContain("await dataManager.saveData('expenses', updatedExpenses, { syncFirestore: false");
  });

  test('expense records search and rankings reuse shared purchase-detail linkage', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const insightPath = path.join(process.cwd(), 'src/utils/expenseRecordInsights.ts');
    const purchaseLinkPath = path.join(process.cwd(), 'src/utils/expensePurchaseLink.ts');
    const dashboardPath = path.join(process.cwd(), 'src/utils/dashboardAnalytics.ts');
    const financePath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const insightSource = fs.readFileSync(insightPath, 'utf8');
    const purchaseLinkSource = fs.readFileSync(purchaseLinkPath, 'utf8');
    const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');
    const financeSource = fs.readFileSync(financePath, 'utf8');

    expect(expenseSource).toContain("dataManager.getData('purchases')");
    expect(expenseSource).toContain('filterExpenseRecords(expenses, categories, purchaseOrders');
    expect(expenseSource).toContain('buildExpenseRankings(filteredExpenses, categories, purchaseOrders');
    expect(expenseSource).toContain('buildExpenseDetailRankings(filteredExpenses, purchaseOrders');
    expect(insightSource).toContain("from './expensePurchaseLink'");
    expect(purchaseLinkSource).toContain('export const findExpensePurchaseOrder');
    expect(dashboardSource).toContain("from './expensePurchaseLink'");
    expect(financeSource).toContain("from './expensePurchaseLink'");
    expect(dashboardSource).not.toContain('const matchesPurchaseOrder =');
    expect(financeSource).not.toContain('const findMatchingPurchaseOrder =');
  });

  test('expense records keeps date filters at the top and lists records before rankings', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const expenseListBlock = expenseSource.slice(
      expenseSource.indexOf('{/* 开支列表 */}'),
      expenseSource.indexOf('{/* 开支分析 */}')
    );

    expect(expenseSource).toContain("useState<'today' | 'all' | 'date' | 'month'>('today')");
    expect(expenseSource).toContain("dateMode: filterDateMode");
    expect(expenseSource).toContain("month: filterMonth");
    expect(expenseSource).toContain('全部');
    expect(expenseSource).toContain('今天');
    expect(expenseSource).toContain('指定日期');
    expect(expenseSource).toContain('月份');
    expect(expenseSource).not.toContain('📅 今天');
    expect(expenseSource).not.toContain('📋 全部');
    expect(expenseSource).toContain('{/* 页面大容器 */}');
    expect(expenseSource).toContain('{/* 紧凑摘要 */}');
    expect(expenseSource).toContain("overflowY: 'auto'");
    expect(expenseListBlock).toContain("style={{ ...styles.card, display: 'flex', flexDirection: 'column' }}");
    expect(expenseListBlock).toContain("style={{ overflowX: 'auto' }}");
    expect(expenseSource).not.toContain("maxHeight: '46vh'");
    expect(expenseListBlock).not.toContain("minHeight: '360px'");
    expect(expenseListBlock).not.toContain("minHeight: '420px'");
    expect(expenseListBlock).not.toContain("overflow: 'hidden'");
    expect(expenseSource.indexOf('{/* 筛选工具栏 */}')).toBeLessThan(expenseSource.indexOf('{/* 开支列表 */}'));
    expect(expenseSource.indexOf('{/* 开支列表 */}')).toBeLessThan(expenseSource.indexOf('{/* 开支分析 */}'));
  });

  test('waiter orders publish directly to shared POS orders', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');

    expect(source).toContain("smartUpdateDocument('pos_orders', newOrder.id");
    expect(source).toContain("smartUpdateDocument('pos_orders', updatedOrder.id");
    expect(source).toContain('currentOrderId: activeOrder.id');
    expect(source).not.toContain('currentOrderId: newOrder.id');
  });

  test('waiter table cache uses the current store scope', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');

    expect(source).not.toContain("localStorage.getItem('pos_tables')");
    expect(source).toContain("localStorage.getItem(dataService.getStoreKey('pos_tables'))");
  });

  test('waiter table display derives occupied state from shared POS orders', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');

    expect(source).toContain('const displayedTables = tables.map');
    expect(source).toContain('orders.find(order =>');
    expect(source).toContain("order.tableId === table.id");
    expect(source).toContain("order.status !== 'completed'");
    expect(source).toContain("order.status !== 'cancelled'");
    expect(source).toContain('tables={displayedTables}');
    expect(source).not.toContain('updateTable(selectedTableId');
    expect(source).toContain('点击桌台开始点餐，桌台布局由 POS 同步');
    expect(source).not.toContain('右键可合并/拆分桌台');
  });

  test('waiter shared table layout is read-only and cannot create local-only layouts', () => {
    const tableLayoutPath = path.join(process.cwd(), 'src/components/TableLayout.tsx');
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const tableLayoutSource = fs.readFileSync(tableLayoutPath, 'utf8');
    const waiterSource = fs.readFileSync(waiterPath, 'utf8');

    expect(tableLayoutSource).toContain('editable?: boolean');
    expect(tableLayoutSource).toContain('editable = false');
    expect(tableLayoutSource).toContain('if (!editable) return;');
    expect(tableLayoutSource).toContain("cursor: editable ? 'move' : 'pointer'");
    expect(waiterSource).toContain('editable={false}');
    expect(waiterSource).not.toContain('onTablesUpdate={(updatedTables)');
  });

  test('POS table realtime subscription is cloud-authoritative', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(syncPath, 'utf8');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const waiterSource = fs.readFileSync(waiterPath, 'utf8');
    const tablePublishBlock = posSource.slice(
      posSource.indexOf("saveToStorage('pos_tables', tables);"),
      posSource.indexOf('}, [tables]);', posSource.indexOf("saveToStorage('pos_tables', tables);"))
    );

    expect(source).toContain("CLOUD_AUTHORITATIVE_SUBSCRIPTIONS = new Set(['pos_tables'])");
    expect(source).toContain('isCloudAuthoritativeSubscription(collectionName)');
    expect(source).toContain('const activeData = excludeDeletedRecords(data)');
    expect(source).toContain('callback(activeData)');
    const subscriptionMergeBlock = source.slice(source.indexOf('const serialized = JSON.stringify(data);'));
    expect(subscriptionMergeBlock.indexOf('if (isCloudAuthoritativeSubscription(collectionName))')).toBeLessThan(
      subscriptionMergeBlock.indexOf('const localData = getFromLocalStorage(collectionName);')
    );
    expect(posSource).toContain('tableCloudHydratedRef');
    expect(posSource).toContain('tableUserEditPendingRef');
    expect(posSource).toContain('dragAnimationFrameRef');
    expect(posSource).toContain('window.requestAnimationFrame');
    expect(posSource).toContain('const finalPosition = pendingDragPositionRef.current');
    expect(tablePublishBlock).toContain('if (!tableCloudHydratedRef.current) {');
    expect(tablePublishBlock).toContain('tablePublisherReadyRef.current = false;');
    expect(tablePublishBlock).toContain('if (!tablePublisherReadyRef.current)');
    expect(tablePublishBlock).toContain('if (!tableUserEditPendingRef.current)');
    expect(tablePublishBlock).not.toContain('if (!tableCloudHydratedRef.current && !tableUserEditPendingRef.current)');
    expect(tablePublishBlock.indexOf('if (!tableCloudHydratedRef.current) {')).toBeLessThan(
      tablePublishBlock.indexOf('tablesToPublish.forEach(table =>')
    );
    expect(tablePublishBlock.indexOf('if (!tablePublisherReadyRef.current)')).toBeLessThan(
      tablePublishBlock.indexOf('tablesToPublish.forEach(table =>')
    );
    expect(tablePublishBlock.indexOf('if (!tableUserEditPendingRef.current)')).toBeLessThan(
      tablePublishBlock.indexOf('tablesToPublish.forEach(table =>')
    );
    expect(tablePublishBlock).not.toContain("tables.forEach(table =>");
    expect(tablePublishBlock).toContain('dirtyTableIdsRef.current');
    expect(tablePublishBlock).toContain('tablesToPublish.forEach(table =>');
    expect(waiterSource).not.toContain("smartUpdateDocument('pos_tables'");
  });

  test('kitchen status changes write back to shared POS orders', () => {
    const kitchenPath = path.join(process.cwd(), 'src/pages/POS/KitchenDisplay.tsx');
    const source = fs.readFileSync(kitchenPath, 'utf8');

    expect(source).toContain("smartUpdateDocument('pos_orders', updatedOrder.id");
    expect(source).toContain("return dataManager.saveData('orders', nextAllOrders, { syncFirestore: false }).then(() =>");
    expect(source).toContain("status !== 'served'");
    expect(source).toContain("const nextServedStatus = 'served' as const;");
    expect(source).toContain('status: nextServedStatus');
    expect(source).not.toContain("dataManager.saveData('orders', nextAllOrders, { syncFirestore: false });");
    expect(source).not.toContain('console.log');
  });

  test('permissions management keeps only the four editable store roles', () => {
    const permissionsPath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const source = fs.readFileSync(permissionsPath, 'utf8');

    expect(source).toContain("id: 'store_manager'");
    expect(source).toContain("id: 'cashier'");
    expect(source).toContain("id: 'waiter'");
    expect(source).toContain("id: 'chef'");
    expect(source).toContain('normalizeRoles(cloudRoles)');
    expect(source).not.toContain('setRoles([...roles');
    expect(source).not.toContain('smartAddDocument(\'system_roles\'');
  });

  test('permissions management does not emit noisy role-edit debug logs', () => {
    const permissionsPath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const source = fs.readFileSync(permissionsPath, 'utf8');
    const toggleBlock = source.slice(
      source.indexOf('const togglePerm = (permId: string) => {'),
      source.indexOf('const handleSelectRole = (role: Role) => {')
    );
    const selectRoleBlock = source.slice(
      source.indexOf('const handleSelectRole = (role: Role) => {'),
      source.indexOf('const handleSave = async () => {')
    );

    expect(toggleBlock).not.toContain('console.log');
    expect(selectRoleBlock).not.toContain('console.log');
    expect(source).toContain('console.error');
  });

  test('backup page is read-only export and cannot restore or bulk sync data', () => {
    const backupPath = path.join(process.cwd(), 'src/pages/Settings/DataBackup.tsx');
    const backupServicePath = path.join(process.cwd(), 'src/services/backupExportService.ts');
    const source = fs.readFileSync(backupPath, 'utf8');
    const serviceSource = fs.readFileSync(backupServicePath, 'utf8');

    expect(source).toContain('createFirestoreBackup');
    expect(source).toContain('downloadBackupFile');
    expect(source).not.toContain('backup.localCache');
    expect(source).not.toContain('restoreFromFirestore');
    expect(source).not.toContain('syncToFirestoreNow');
    expect(source).not.toContain('setBackupMode');
    expect(serviceSource).not.toContain('localStorage');
    expect(serviceSource).not.toContain('localCache');
    expect(serviceSource).not.toContain('getRestaurantLocalCache');
  });

  test('owner dashboard uses manual refresh wording and has no legacy data sync entry', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('刷新云端数据');
    expect(source).toContain('低频手动刷新');
    expect(source).not.toContain('鏁版嵁鍚屾');
    expect(source).not.toContain('鎵嬪姩鍚屾');
    expect(source).not.toContain('legacyManualSync');
    expect(source).not.toContain('syncToFirestore');
  });

  test('store management uses single-document cloud writes and cleans duplicate stores on edit', () => {
    const storesPath = path.join(process.cwd(), 'src/pages/Manager/Stores.tsx');
    const source = fs.readFileSync(storesPath, 'utf8');

    expect(source).toContain('findDuplicateStoreDocumentIds');
    expect(source).toContain('duplicateStoreIds.map(id => smartDeleteDocument');
    expect(source).not.toContain('normalizedStores.map(store => smartSetDocument');
    expect(source).not.toContain('normalizedUsers.map(user => smartSetDocument');
    expect(source).toContain("smartSetDocument('stores', store.id, store)");
    expect(source).toContain("smartSetDocument('users', user.id, toCloudUser(user))");
  });

  test('system settings save cloud writes before mutating local UI cache', () => {
    const storesPath = path.join(process.cwd(), 'src/pages/Manager/Stores.tsx');
    const exchangePath = path.join(process.cwd(), 'src/pages/Manager/ExchangeRateSettings.tsx');
    const permissionsPath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const storesSource = fs.readFileSync(storesPath, 'utf8');
    const exchangeSource = fs.readFileSync(exchangePath, 'utf8');
    const permissionsSource = fs.readFileSync(permissionsPath, 'utf8');

    const saveStoreBlock = storesSource.slice(
      storesSource.indexOf('const handleSaveStore = async () => {'),
      storesSource.indexOf('const handleAddUser = () => {')
    );
    const editUserBlock = storesSource.slice(
      storesSource.indexOf('if (editingUser) {'),
      storesSource.indexOf('} else {', storesSource.indexOf('if (editingUser) {'))
    );
    const addUserBlock = storesSource.slice(
      storesSource.indexOf('// 添加新用户'),
      storesSource.indexOf('setShowUserModal(false);')
    );
    const saveExchangeBlock = exchangeSource.slice(
      exchangeSource.indexOf('const saveConfig = async () => {'),
      exchangeSource.indexOf('const resetToDefault = () => {')
    );
    const savePermissionBlock = permissionsSource.slice(
      permissionsSource.indexOf('const handleSave = async () => {'),
      permissionsSource.indexOf('const toggleExpand = (nodeId: string) => {')
    );

    expect(saveStoreBlock.indexOf("smartSetDocument('stores', editingStore.id, editingStore)")).toBeLessThan(
      saveStoreBlock.indexOf('setStores(updated)')
    );
    expect(editUserBlock.indexOf("await smartSetDocument('users', updatedUser.id, toCloudUser(updatedUser))")).toBeLessThan(
      editUserBlock.indexOf('setUsers(updated)')
    );
    expect(addUserBlock.indexOf("await smartSetDocument('users', authUser.id, toCloudUser(authUser))")).toBeLessThan(
      addUserBlock.indexOf('setUsers(updated)')
    );
    expect(saveExchangeBlock.indexOf('await smartSetDocument(`stores/${targetStoreId}/${COLLECTION}`, DOC_ID, updatedConfig)')).toBeLessThan(
      saveExchangeBlock.indexOf('saveLocalConfig(updatedConfig, targetStoreId)')
    );
    expect(savePermissionBlock.indexOf("await smartUpdateDocument('system_roles', editingRoleId, roleData)")).toBeLessThan(
      savePermissionBlock.indexOf("localStorage.setItem('system_roles', JSON.stringify(newRoles))")
    );
  });

  test('exchange-rate settings are saved under the selected store path', () => {
    const exchangePath = path.join(process.cwd(), 'src/pages/Manager/ExchangeRateSettings.tsx');
    const exchangeRatePath = path.join(process.cwd(), 'src/utils/exchangeRate.ts');
    const source = fs.readFileSync(exchangePath, 'utf8');
    const utilitySource = fs.readFileSync(exchangeRatePath, 'utf8');

    expect(utilitySource).toContain('getExchangeRateStorageKey = (storeIdOverride?: string)');
    expect(source).toContain('const targetStoreId = user?.storeId || selectedStoreId');
    expect(source).toContain('const dedupeStoreOptions = (stores: StoreOption[]): StoreOption[]');
    expect(source).toContain('const key = code ? `code:${code}` : `id:${store.id}`');
    expect(source).toContain('smartGetDocuments(collectionPath, true)');
    expect(source).toContain('`stores/${targetStoreId}/${COLLECTION}`');
    expect(source).toContain("alert('请先选择分店后再保存汇率配置')");
    expect(source).toContain('saveLocalConfig(updatedConfig, targetStoreId)');
  });

  test('backup export keeps exchange-rate settings store-scoped only', () => {
    const backupServicePath = path.join(process.cwd(), 'src/services/backupExportService.ts');
    const serviceSource = fs.readFileSync(backupServicePath, 'utf8');

    expect(serviceSource).toContain("const GLOBAL_COLLECTIONS = ['stores', 'users', 'system_roles']");
    expect(serviceSource).toContain("'exchange_rate',");
    expect(serviceSource).not.toContain("const GLOBAL_COLLECTIONS = ['stores', 'users', 'system_roles', 'exchange_rate']");
  });

  test('backup export covers every store-scoped Firestore rules collection', () => {
    const backupServicePath = path.join(process.cwd(), 'src/services/backupExportService.ts');
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const serviceSource = fs.readFileSync(backupServicePath, 'utf8');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    const storeCollections = Array.from(
      new Set(
        Array.from(rules.matchAll(/match \/stores\/\{storeId\}\/([^/]+)\//g))
          .map(match => match[1])
      )
    ).sort();

    storeCollections.forEach(collectionName => {
      expect(serviceSource).toContain(`'${collectionName}',`);
    });
  });

  test('supplier payment records are store-scoped and refreshed from cloud', () => {
    const suppliersPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(suppliersPath, 'utf8');

    expect(source).toContain("smartGetDocuments('supplier_payments', true)");
    expect(source).toContain('const [payments, setPayments] = useState<SupplierPaymentRecord[]>([])');
    expect(source).toContain('setPayments(normalizedPayments)');
    expect(source).toContain("saveStoreCollection('supplier_payments', normalizedPayments)");
    expect(source).toContain('getSupplierPayments(selectedSupplier.id, payments)');
    expect(source).not.toContain("dataService.getStoreKey(`payments_${supplierId}`)");
    expect(source).not.toContain('saveSupplierPayments(supplierId, supplierPayments)');
    expect(source).not.toContain("localStorage.getItem(`payments_${supplierId}`)");
    expect(source).not.toContain("saveData(`payments_${supplierId}`");
  });

  test('supplier edits deletes and payments wait for cloud writes before local state updates', () => {
    const suppliersPath = path.join(process.cwd(), 'src/pages/Suppliers/SupplierWorkbench.tsx');
    const source = fs.readFileSync(suppliersPath, 'utf8');
    const saveBlock = source.slice(
      source.indexOf('const saveSupplier = async () => {'),
      source.indexOf('const deleteSupplier = async () => {')
    );
    const deleteBlock = source.slice(
      source.indexOf('const deleteSupplier = async () => {'),
      source.indexOf('const openPayment =')
    );
    const paymentBlock = source.slice(
      source.indexOf('const submitPayment = async () => {'),
      source.indexOf('return (')
    );

    expect(saveBlock.indexOf("await smartUpdateDocument('suppliers', supplierData.id, supplierData)")).toBeLessThan(
      saveBlock.indexOf('setSuppliers(prev => prev.map')
    );
    expect(saveBlock.indexOf("await smartAddDocument('suppliers', supplierData)")).toBeLessThan(
      saveBlock.indexOf('setSuppliers(prev => [...prev')
    );
    expect(deleteBlock.indexOf("await smartDeleteDocument('suppliers', selectedSupplier.id)")).toBeLessThan(
      deleteBlock.indexOf('setSuppliers(prev => prev.filter')
    );
    expect(paymentBlock.indexOf("await smartUpdateDocument('purchase_orders', paymentOrder.id, updatedOrder)")).toBeLessThan(
      paymentBlock.indexOf('setPurchaseOrders(nextOrders')
    );
    expect(paymentBlock.indexOf("await smartAddDocument('supplier_payments', paymentRecord)")).toBeLessThan(
      paymentBlock.indexOf('setPayments(prev => [...prev')
    );
    expect(paymentBlock.indexOf("await smartAddDocument('expenses', paymentExpense)")).toBeLessThan(
      paymentBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(source).not.toContain('savePaymentRecord(selectedOrder.supplierId, paymentRecord)');
    expect(paymentBlock).not.toContain('杩樻宸插湪鏈満璁板綍');
    expect(source).not.toContain('console.log');
  });

  test('purchase order creation waits for linked cloud writes before local state updates', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const createBlock = source.slice(
      source.indexOf('const normalizedOrderItems = newOrder.items.map'),
      source.indexOf('const printPurchaseOrder')
    );

    expect(createBlock).toContain('const normalizedOrderItems = newOrder.items.map');
    expect(createBlock).toContain('unitPrice: roundPurchaseAmount(item.unitPrice)');
    expect(createBlock).toContain('subtotal: calculatePurchaseLineSubtotal(item.quantity, item.unitPrice)');
    expect(createBlock).toContain("await smartAddDocument('purchase_orders', order)");
    expect(createBlock).toContain("await Promise.all(normalizedOrderItems.map((orderItem, itemIndex) => smartIncrementField('inventory_items', orderItem.itemId");
    expect(createBlock).toContain('syncOperationId: `purchase-stock-${order.id}-${orderItem.itemId}-${itemIndex}`');
    expect(createBlock).toContain("source: 'purchase_order'");
    expect(createBlock).toContain("await smartAddDocument('inventory_stock_records', stockRecord)");
    expect(createBlock).toContain("await smartSetDocument('expenses', purchaseExpense.id, purchaseExpense)");
    expect(createBlock).toContain("await smartUpdateDocument('suppliers', newOrder.supplierId, supplierCloudUpdate)");
    expect(createBlock).toContain("id: `purchase-expense-${order.id}`");
    expect(createBlock).toContain("type: 'purchase'");
    expect(createBlock).toContain('purchaseOrderId: order.id');
    expect(createBlock).toContain('orderId: order.id');
    expect(createBlock).toContain("void dataManager.saveData('purchases', nextPurchaseOrders, { syncFirestore: false })");
    expect(createBlock).toContain("void dataManager.saveData('expenses', nextExpenses, { syncFirestore: false })");
    expect(createBlock.indexOf("await smartAddDocument('purchase_orders', order)")).toBeLessThan(
      createBlock.indexOf('setPurchaseOrders(nextPurchaseOrders)')
    );
    expect(createBlock.indexOf("await Promise.all(normalizedOrderItems.map((orderItem, itemIndex) => smartIncrementField('inventory_items', orderItem.itemId")).toBeLessThan(
      createBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(createBlock.indexOf("await smartAddDocument('inventory_stock_records', stockRecord)")).toBeLessThan(
      createBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(createBlock.indexOf("await smartSetDocument('expenses', purchaseExpense.id, purchaseExpense)")).toBeLessThan(
      createBlock.indexOf("void dataManager.saveData('expenses', nextExpenses, { syncFirestore: false })")
    );
    expect(createBlock.indexOf('setShowNewOrderModal(false);')).toBeLessThan(
      createBlock.indexOf("void dataManager.saveData('purchases', nextPurchaseOrders, { syncFirestore: false })")
    );
    expect(createBlock).not.toContain("smartIncrementField('inventory_items', item.id");
    expect(createBlock).toContain("catch(error => console.error('保存采购单本地缓存失败:', error))");
    expect(createBlock).toContain("catch(error => console.error('保存采购开支本地缓存失败:', error))");
  });

  test('purchase expenses notify expense records and financial reports immediately', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const reportsSource = fs.readFileSync(reportsPath, 'utf8');

    expect(expenseSource).toContain("window.addEventListener('expensesUpdated', handleExpensesUpdated)");
    expect(expenseSource).toContain('setExpenses(Array.isArray(updatedExpenses) ? updatedExpenses : dataManager.getData');
    expect(reportsSource).toContain("window.addEventListener('expensesUpdated', handleFinancialSourceUpdated)");
    expect(reportsSource).toContain("window.addEventListener('purchasesUpdated', handleFinancialSourceUpdated)");
    expect(reportsSource).toContain('setDataVersion(version => version + 1)');
  });

  test('manager refresh repairs missing cash purchase expenses without touching credit purchases', () => {
    const helperPath = path.join(process.cwd(), 'src/utils/purchaseExpenseRepair.ts');
    const helperSource = fs.readFileSync(helperPath, 'utf8');
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');
    const reportsSource = fs.readFileSync(reportsPath, 'utf8');

    expect(helperSource).toContain('export const buildMissingPurchaseExpenses');
    expect(helperSource).toContain("purchase?.paymentType === 'cash'");
    expect(helperSource).toContain("purchase?.paymentType !== 'credit'");
    expect(helperSource).toContain('repairedFromPurchaseOrder: true');
    expect(helperSource).toContain("relatedType: 'purchase'");
    expect(helperSource).toContain("type: 'purchase'");

    expect(expenseSource).toContain("smartGetDocuments('purchase_orders', true)");
    expect(expenseSource).toContain('buildMissingPurchaseExpenses(cloudPurchases, cloudExpenses)');
    expect(expenseSource).toContain("smartSetDocument('expenses', expense.id, expense)");
    expect(expenseSource).toContain('const nextExpenses = [...repairedExpenses, ...cloudExpenses]');

    expect(reportsSource).toContain("smartGetDocuments('purchase_orders', true)");
    expect(reportsSource).toContain('buildMissingPurchaseExpenses(cloudPurchases, cloudExpenses)');
    expect(reportsSource).toContain("smartSetDocument('expenses', expense.id, expense)");
    expect(reportsSource).toContain('const nextExpenses = [...repairedExpenses, ...cloudExpenses]');
  });

  test('purchase order submit is locked while cloud writes are pending', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const submitBlock = source.slice(
      source.indexOf('const submitPurchaseOrder = async () => {'),
      source.indexOf('const printPurchaseOrder')
    );
    const submitButtonStart = source.indexOf('onClick={submitPurchaseOrder}');
    const submitButtonBlock = source.slice(
      submitButtonStart,
      source.indexOf('</button>', submitButtonStart)
    );

    expect(source).toContain('const [isSubmittingPurchaseOrder, setIsSubmittingPurchaseOrder] = useState(false)');
    expect(source).toContain('const isSubmittingPurchaseOrderRef = useRef(false)');
    expect(submitBlock).toContain('if (isSubmittingPurchaseOrderRef.current) {');
    expect(submitBlock).toContain('isSubmittingPurchaseOrderRef.current = true;');
    expect(submitBlock).toContain('setIsSubmittingPurchaseOrder(true);');
    expect(submitBlock).toContain('finally {');
    expect(submitBlock).toContain('isSubmittingPurchaseOrderRef.current = false;');
    expect(submitBlock.indexOf('setShowNewOrderModal(false);')).toBeGreaterThan(-1);
    expect(submitBlock.indexOf('setNewOrder({')).toBeGreaterThan(-1);
    expect(submitButtonBlock).toContain('disabled={isSubmittingPurchaseOrder}');
    expect(submitButtonBlock).toContain("backgroundColor: isSubmittingPurchaseOrder ? '#9ca3af' : '#10b981'");
    expect(submitButtonBlock).toContain("cursor: isSubmittingPurchaseOrder ? 'not-allowed' : 'pointer'");
    expect(submitButtonBlock).toContain("isSubmittingPurchaseOrder ? '提交中...' :");
  });

  test('purchase order submit closes the modal before non-critical local cache writes', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const submitBlock = source.slice(
      source.indexOf('const submitPurchaseOrder = async () => {'),
      source.indexOf('const printPurchaseOrder')
    );
    const closeIndex = submitBlock.indexOf('setShowNewOrderModal(false);');
    const cloudWriteIndex = submitBlock.indexOf("await smartAddDocument('purchase_orders', order)");
    const purchaseCacheIndex = submitBlock.indexOf("dataManager.saveData('purchases'");
    const expenseCacheIndex = submitBlock.indexOf("dataManager.saveData('expenses'");

    expect(closeIndex).toBeGreaterThan(-1);
    expect(cloudWriteIndex).toBeGreaterThan(-1);
    expect(purchaseCacheIndex).toBeGreaterThan(-1);
    expect(expenseCacheIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeLessThan(cloudWriteIndex);
    expect(closeIndex).toBeLessThan(purchaseCacheIndex);
    expect(closeIndex).toBeLessThan(expenseCacheIndex);
    expect(submitBlock).toContain("catch(error => console.error('保存采购单本地缓存失败:', error))");
    expect(submitBlock).toContain("catch(error => console.error('保存采购开支本地缓存失败:', error))");
  });

  test('purchase order submit shows cloud success confirmation only after closing the modal', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const submitBlock = source.slice(
      source.indexOf('const submitPurchaseOrder = async () => {'),
      source.indexOf('const printPurchaseOrder')
    );
    const closeIndex = submitBlock.indexOf('setShowNewOrderModal(false);');
    const successTimerIndex = submitBlock.indexOf('window.setTimeout(() => {');
    const successAlertIndex = submitBlock.indexOf("alert(`采购单 ${submittedOrderNumber} 云端写入成功`)");

    expect(closeIndex).toBeGreaterThan(-1);
    expect(successTimerIndex).toBeGreaterThan(-1);
    expect(successAlertIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeLessThan(successTimerIndex);
    expect(successTimerIndex).toBeLessThan(successAlertIndex);
  });

  test('purchase order delete reverses linked cloud records before removing the local row', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const deleteBlock = source.slice(
      source.indexOf('const deletePurchaseOrder = async (order: PurchaseOrder) => {'),
      source.indexOf('const printPurchaseOrder')
    );

    expect(source).toContain('const [deletingPurchaseOrderId, setDeletingPurchaseOrderId] = useState<string | null>(null)');
    expect(source).toContain('if (!window.confirm(`确定删除采购单 ${order.orderNumber}？删除后会同步撤销库存、采购开支和供应商余额。`))');
    expect(deleteBlock).toContain("await smartDeleteDocument('purchase_orders', order.id)");
    expect(deleteBlock).toContain("await smartIncrementField('inventory_items', orderItem.itemId, 'currentStock', -quantity");
    expect(deleteBlock).toContain("syncOperationId: `purchase-delete-stock-${order.id}-${orderItem.itemId}-${itemIndex}`");
    expect(deleteBlock).toContain("await smartDeleteDocument('inventory_stock_records', `stock-record-${order.id}-${orderItem.itemId}-${itemIndex}`)");
    expect(deleteBlock).toContain("await smartDeleteDocument('expenses', `purchase-expense-${order.id}`)");
    expect(deleteBlock).toContain("await smartUpdateDocument('suppliers', order.supplierId, supplierCloudUpdate)");
    expect(deleteBlock).toContain("void dataManager.saveData('purchases', remainingPurchaseOrders, { syncFirestore: false })");
    expect(deleteBlock).toContain("void dataManager.saveData('expenses', nextExpenses, { syncFirestore: false })");
    expect(deleteBlock.indexOf("await smartDeleteDocument('purchase_orders', order.id)")).toBeLessThan(
      deleteBlock.indexOf('setPurchaseOrders(remainingPurchaseOrders)')
    );
    expect(deleteBlock.indexOf("await smartIncrementField('inventory_items', orderItem.itemId, 'currentStock', -quantity")).toBeLessThan(
      deleteBlock.indexOf('setInventoryItems(items => items.map')
    );
  });

  test('purchase order list exposes a locked delete button', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const deleteButtonStart = source.indexOf('onClick={() => deletePurchaseOrder(order)}');
    const deleteButtonBlock = source.slice(
      deleteButtonStart,
      source.indexOf('</button>', deleteButtonStart)
    );

    expect(deleteButtonStart).toBeGreaterThan(-1);
    expect(deleteButtonBlock).toContain('disabled={deletingPurchaseOrderId === order.id}');
    expect(deleteButtonBlock).toContain("backgroundColor: deletingPurchaseOrderId === order.id ? '#9ca3af' : '#dc2626'");
    expect(deleteButtonBlock).toContain("cursor: deletingPurchaseOrderId === order.id ? 'not-allowed' : 'pointer'");
    expect(deleteButtonBlock).toContain("deletingPurchaseOrderId === order.id ? '删除中...' : '删除'");
  });

  test('purchase orders do not keep a separate invoice image upload entry', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const purchaseSource = fs.readFileSync(purchasePath, 'utf8');
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const expenseSource = fs.readFileSync(expensePath, 'utf8');

    expect(purchaseSource).not.toContain('invoiceImage');
    expect(purchaseSource).not.toContain('handleInvoiceUpload');
    expect(purchaseSource).not.toContain('fileInputRef');
    expect(purchaseSource).not.toContain('new FileReader()');
    expect(purchaseSource).not.toContain('type="file"');
    expect(purchaseSource).not.toContain('accept="image/*"');
    expect(purchaseSource).not.toContain('onChange={handleInvoiceUpload}');

    expect(expenseSource).toContain('const handleReceiptUpload =');
    expect(expenseSource).toContain('const handleImageUpload =');
    expect(expenseSource).toContain('receiptImage');
    expect(expenseSource).toContain('type="file"');
    expect(expenseSource).toContain('accept="image/*"');
  });

  test('financial reports use collected order amounts and normalized expense dates', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');

    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderFinancialDateKey(order) === date');
    expect(source).toContain('getOrderPaymentBreakdown(order)');
    expect(source).toContain('getExpenseDateKey(exp)');
    expect(source).toContain('buildDailyExpenseBreakdown(expenses, selectedDate, expenseCategories, purchaseOrders)');
    expect(source).toContain("smartGetDocuments('expense_categories', true)");
    expect(source).not.toContain('sum + (order.totalAmount || 0)');
    expect(source).not.toContain('console.log');
  });

  test('financial report totals use cash card expense and include handover difference in profit loss', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');
    const metricsPath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const metricsSource = fs.readFileSync(metricsPath, 'utf8');

    expect(source).toContain('calculateFinancialReportTotals({');
    expect(source).toContain('getLatestHandoverAmountForDate(handovers, date)');
    expect(metricsSource).toContain('const roundMoney =');
    expect(metricsSource).toContain('const cash = roundMoney(toMoneyNumber(cashPayment))');
    expect(metricsSource).toContain('const card = roundMoney(toMoneyNumber(cardPayment))');
    expect(metricsSource).toContain('const purchase = toMoneyNumber(purchaseAmount)');
    expect(metricsSource).toContain('const expense = toMoneyNumber(expenseAmount)');
    expect(metricsSource).toContain('const totalSales = roundMoney(cash + card)');
    expect(metricsSource).toContain('const baseProfit = roundMoney(totalSales - purchase - expense)');
    expect(metricsSource).toContain('const expectedCashHandover = roundMoney(cash - purchase - expense)');
    expect(metricsSource).toContain('const difference = handoverAmount !== undefined');
    expect(metricsSource).toContain('? roundMoney(toMoneyNumber(handoverAmount) - expectedCashHandover)');
    expect(metricsSource).toContain('const profit = roundMoney(baseProfit + (difference || 0))');
    expect(source).toContain("{'\\u8425\\u4e1a\\u989d - \\u91c7\\u8d2d\\u4ed8\\u6b3e - \\u65e5\\u5e38\\u5f00\\u652f + \\u8bef\\u5dee'}");
    expect(source).toContain("'\\u5b9e\\u4ea4 - \\u5e94\\u4ea4\\u73b0\\u91d1'");
    expect(source).toContain('\\u76c8\\u4e8f\\uff08\\u542b\\u8bef\\u5dee\\uff09');
    expect(source).toContain('\\u4f9b\\u5e94\\u5546\\u8d27\\u6b3e\\uff08\\u5f53\\u524d\\u5269\\u4f59\\u6b20\\u6b3e\\uff09');
    expect(source).not.toContain('const difference = handoverAmount !== undefined ? handoverAmount - profit : undefined');
  });

  test('financial reports show expense breakdown only for daily reports and print daily details', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');
    const metricsPath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const metricsSource = fs.readFileSync(metricsPath, 'utf8');

    expect(source).toContain('buildDailyExpenseBreakdown(expenses, selectedDate, expenseCategories, purchaseOrders)');
    expect(source).toContain("reportType === 'daily'");
    expect(source).toContain('isDaily ? `');
    expect(source).toContain('\\u5f53\\u5929\\u5f00\\u652f\\u548c\\u91c7\\u8d2d\\u5355\\u660e\\u7ec6');
    expect(source).toContain('\\u4ea4\\u73ed\\u8bef\\u5dee');
    expect(source).toContain('\\u5b9e\\u4ea4 - \\u5e94\\u4ea4\\u73b0\\u91d1');
    expect(source).toContain('\\u5355\\u53f7/\\u7c7b\\u522b');
    expect(source).toContain('\\u5546\\u54c1/\\u8bf4\\u660e');
    expect(source).toContain('difference-box');
    expect(source).toContain('difference-value');
    expect(metricsSource).toContain('export const buildDailyExpenseBreakdown');
    expect(metricsSource).toContain('getCategoryNameFromList');
    expect(metricsSource).toContain("from './expensePurchaseLink'");
    expect(metricsSource).toContain('findExpensePurchaseOrder(expense, purchaseOrders)');
    expect(metricsSource).toContain('quantity?: number');
    expect(metricsSource).toContain('unitPrice?: number');
    expect(metricsSource).toContain('supplierName || getExpenseTypeLabel(type)');
    expect(source).not.toContain('\\u5f53\\u5929\\u5f00\\u652f\\u5206\\u7c7b\\u6c47\\u603b');
  });

  test('financial reports use one generic orders column for completed and cancelled activity', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');
    const metricsPath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const metricsSource = fs.readFileSync(metricsPath, 'utf8');

    expect(metricsSource).toContain('export const calculateOrderStatusSummary');
    expect(metricsSource).toContain('completedOrders');
    expect(metricsSource).toContain('dineInOrders');
    expect(metricsSource).toContain('takeoutOrders');
    expect(metricsSource).toContain('deliveryOrders');
    expect(metricsSource).toContain('cancelledOrders');
    expect(metricsSource).toContain('cancelledItems');
    expect(source).toContain('calculateOrderStatusSummary(orders, date)');
    expect(source).toContain('Mesa ${report.dineInOrders}');
    expect(source).toContain('Barra ${report.takeoutOrders}');
    expect(source).toContain('Delivery ${report.deliveryOrders}');
    expect(source).toContain('{formatTodayOrders(summary)}');
    expect(source).toContain("{'\\u8ba2\\u5355'}");
    expect(source).toContain('<th>\\u8ba2\\u5355</th>');
    expect(source).not.toContain('\\u4eca\\u65e5\\u8ba2\\u5355');
    expect(source).toContain('\\u5b8c\\u6210');
    expect(source).toContain('\\u53d6\\u6d88\\u6574\\u5355');
    expect(source).toContain('\\u53d6\\u6d88\\u83dc\\u54c1');
    expect(source).toContain('formatTodayOrders(report)');
    expect(source).not.toContain('\\u53d6\\u6d88\\u539f\\u56e0');
  });

  test('order history detail modal shows cancellation summary and item records when present', () => {
    const historyPath = path.join(process.cwd(), 'src/pages/Manager/OrderHistoryPage.tsx');
    const source = fs.readFileSync(historyPath, 'utf8');
    const helperPath = path.join(process.cwd(), 'src/utils/orderHistory.ts');
    const helperSource = fs.readFileSync(helperPath, 'utf8');

    expect(helperSource).toContain('export const getOrderCancellationRecords');
    expect(helperSource).toContain('export const getOrderCancellationSummary');
    expect(source).toContain('getOrderCancellationRecords');
    expect(source).toContain('getOrderCancellationSummary');
    expect(source).toContain('\\u53d6\\u6d88\\u8bb0\\u5f55');
    expect(source).toContain('\\u53d6\\u6d88\\u83dc\\u54c1\\u8bb0\\u5f55');
  });

  test('order history totals use collected revenue and keep cancelled orders out of income', () => {
    const historyPath = path.join(process.cwd(), 'src/pages/Manager/OrderHistoryPage.tsx');
    const source = fs.readFileSync(historyPath, 'utf8');

    expect(source).toContain("from '../../utils/financeMetrics'");
    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('calculateOrderStatusSummary(allOrders, today)');
    expect(source).toContain('筛选已收金额');
    expect(source).toContain('完成 {todayOrderSummary.completedOrders} / 取消 {todayOrderSummary.cancelledOrders}');
    expect(source).not.toContain('sum + (Number(order.totalAmount) || 0)');
    expect(source).not.toContain('todayOrderCount');
  });

  test('financial report stat cards follow the requested business order', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');
    const statsBlock = source.slice(source.indexOf('<div style={styles.statsGrid}>'), source.indexOf('<div style={styles.card}>'));
    const labels = [
      "'\\u8425\\u4e1a\\u989d'",
      "'\\u73b0\\u91d1\\u6536\\u5165'",
      "'\\u5237\\u5361\\u6536\\u5165'",
      "'\\u8ba2\\u5355'",
      "'\\u76c8\\u4e8f'",
      "'\\u5b9e\\u4ea4\\u73b0\\u91d1'",
      "'\\u4ea4\\u73ed\\u8bef\\u5dee'",
      "'\\u65e5\\u5e38\\u5f00\\u652f'",
      "'\\u91c7\\u8d2d\\u4ed8\\u6b3e'",
      "'\\u4f9b\\u5e94\\u5546\\u8d27\\u6b3e'",
    ];

    labels.reduce((previousIndex, label) => {
      const currentIndex = statsBlock.indexOf(label);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      return currentIndex;
    }, -1);
  });

  test('POS saves settled cash amounts instead of tendered cash including change', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).toContain('const cashTenderedAmount');
    expect(source).toContain('const changeAmount = Math.max(paidAmount - remainingAmount, 0)');
    expect(source).toContain('const settledCashAmount = Math.max(cashTenderedAmount - changeAmount, 0)');
    expect(source).toContain('const nextCashAmount = (existingOrder.cashAmount || 0) + settledCashAmount');
    expect(source).not.toContain('cashAmount,');
  });

  test('POS payment uses a synchronous ref lock so rapid clicks cannot pay twice', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const paymentBlock = source.slice(
      source.indexOf('const handleCompletePayment = async () => {'),
      source.indexOf('const confirmCancelOrder = async')
    );

    expect(source).toContain('const paymentProcessingRef = useRef(false);');
    expect(paymentBlock).toContain('if (paymentProcessingRef.current || isProcessingPayment)');
    expect(paymentBlock).toContain('paymentProcessingRef.current = true;');
    expect(paymentBlock).toContain('paymentProcessingRef.current = false;');
    expect(paymentBlock.indexOf('paymentProcessingRef.current = true;')).toBeLessThan(
      paymentBlock.indexOf('setIsProcessingPayment(true);')
    );
  });

  test('POS discount authorization accepts the shared manager password list', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const discountBlock = source.slice(
      source.indexOf('id="discount-checkbox"') - 900,
      source.indexOf('id="points-checkbox"')
    );

    expect(source).toContain("const managerAuthorizationPasswords = ['admin123', '123456']");
    expect(discountBlock).toContain('managerAuthorizationPasswords.includes(password.trim())');
    expect(discountBlock).not.toContain("password === 'admin123'");
  });

  test('POS order list sorting does not mutate the orders state array during render', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const orderListBlock = source.slice(
      source.indexOf('const today = getLocalDateString();'),
      source.indexOf('const handleAddTable = () => {')
    );

    expect(orderListBlock).toContain('const filteredOrders = [...allOrders].sort');
    expect(orderListBlock).not.toContain('const filteredOrders = allOrders.sort');
  });

  test('POS cancelled order list time uses cancellation time instead of mutable sync time', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const helperStart = source.indexOf('const getOrderListTimeValue = (order: Partial<Order>): any => {');
    expect(helperStart).toBeGreaterThan(-1);
    const helperBlock = source.slice(
      helperStart,
      source.indexOf('};', helperStart) + 2
    );
    const filterBlock = source.slice(
      source.indexOf("const allOrders = (orderTypeFilter === 'all'"),
      source.indexOf('const handleAddTable = () => {')
    );
    const todayFilterBlock = source.slice(
      source.indexOf('const isTodayPosOrder = (order: Partial<Order>): boolean => {'),
      source.indexOf("const allOrders = (orderTypeFilter === 'all'")
    );
    const orderListStart = source.indexOf('{filteredOrders.length === 0 ?');
    const orderListBlock = source.slice(
      orderListStart,
      source.indexOf('{order.items && order.items.length > 0 &&', orderListStart)
    );

    expect(helperBlock).toContain("order.status === 'cancelled'");
    expect(helperBlock).toContain('order.cancelledAt || order.createdAt || order.preparingAt || order.updatedAt');
    const cancelledBranch = helperBlock.slice(
      helperBlock.indexOf("if (order.status === 'cancelled')"),
      helperBlock.indexOf('return order.createdAt || order.preparingAt || order.completedAt')
    );
    expect(cancelledBranch).not.toContain('order.lastModified');
    expect(todayFilterBlock).toContain('getOrderListTimeValue(order)');
    expect(filterBlock).toContain('isTodayPosOrder(o)');
    expect(orderListBlock).toContain('formatOrderTime(order.createdAt || order.preparingAt || order.updatedAt || order.lastModified)');
    expect(orderListBlock).not.toContain('formatOrderTime(getOrderListTimeValue(order))');
  });

  test('POS cancelled whole orders do not show partial payment as amount still due', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const orderListStart = source.indexOf('{filteredOrders.length === 0 ?');
    const orderCardBlock = source.slice(
      orderListStart,
      source.indexOf('{order.items && order.items.length > 0 &&', orderListStart)
    );

    expect(orderCardBlock).toContain("{order.status === 'cancelled' ? 'Cancelado' : 'Final'}");
    expect(orderCardBlock).toContain("formatOrderTime(order.status === 'cancelled' ? order.cancelledAt : order.completedAt)");
    expect(orderCardBlock).toContain("Cancelado: cobrado C${Number(order.paidAmount || 0).toFixed(2)}");
    expect(orderCardBlock).toContain("anulado C${(Number(order.totalAmount || 0) - Number(order.paidAmount || 0)).toFixed(2)}");
    expect(orderCardBlock).toContain("order.status !== 'cancelled' && order.paymentStatus === 'partial'");
    expect(orderCardBlock).not.toContain("{order.paymentStatus === 'partial' && order.paidAmount > 0 && (");
  });

  test('POS right order summary total excludes whole cancelled orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const helperBlock = source.slice(
      source.indexOf('const getPosOrderSummaryAmount ='),
      source.indexOf('const tableCanvasFoodPattern')
    );
    const totalLabel = "<span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total:</span>";
    const totalStart = source.indexOf(totalLabel);
    const totalBlock = source.slice(
      totalStart,
      source.indexOf('</div>', source.indexOf('filteredOrders.reduce', totalStart))
    );

    expect(helperBlock).toContain("if (order.status === 'cancelled') return 0;");
    expect(totalBlock).toContain('getPosOrderSummaryAmount(o)');
    expect(totalBlock).not.toContain('sum + (o.totalAmount || 0)');
  });

  test('POS order serialization skips invalid Date objects instead of throwing toISOString errors', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const helperStart = source.indexOf('const serializeDateForFirestore = (value: any): any => {');
    expect(helperStart).toBeGreaterThan(-1);
    const helperBlock = source.slice(
      helperStart,
      source.indexOf('};', helperStart) + 2
    );
    const serializeBlock = source.slice(
      source.indexOf('const serializeOrderForFirestore = (order: Order): Record<string, any> => {'),
      source.indexOf('const normalizeTables')
    );

    expect(helperBlock).toContain('Number.isFinite(time)');
    expect(helperBlock).toContain('return undefined');
    expect(serializeBlock).toContain('serializeDateForFirestore(order.createdAt)');
    expect(serializeBlock).toContain('serializeDateForFirestore(orderAny.updatedAt)');
    expect(serializeBlock).toContain('serializeDateForFirestore(order.cancelledAt)');
    expect(serializeBlock).not.toContain('order.createdAt instanceof Date ? order.createdAt.toISOString()');
    expect(serializeBlock).not.toContain('order.cancelledAt instanceof Date ? order.cancelledAt.toISOString()');
  });

  test('POS global order updates merge by version instead of replacing the whole list', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const globalOrderStart = source.indexOf('const applyIncomingCloudOrders = React.useCallback');
    expect(globalOrderStart).toBeGreaterThan(-1);
    const globalOrderBlock = source.slice(
      globalOrderStart,
      source.indexOf('React.useEffect(() => {', globalOrderStart)
    );

    expect(globalOrderBlock).toContain('setOrders(prevOrders => {');
    expect(globalOrderBlock).toContain('const cloudReconciledOrders = prevOrders.filter(order => {');
    expect(globalOrderBlock).toContain('mergeOrdersByVersion(cloudReconciledOrders, incomingOrders, pendingOrderSyncIdsRef.current)');
    expect(globalOrderBlock).not.toContain('setOrders(incomingOrders)');
  });

  test('POS global order updates do not clear pending local completion until cloud echoes the same order state', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const globalOrderStart = source.indexOf('const applyIncomingCloudOrders = React.useCallback');
    expect(globalOrderStart).toBeGreaterThan(-1);
    const globalOrderBlock = source.slice(
      globalOrderStart,
      source.indexOf('React.useEffect(() => {', globalOrderStart)
    );

    expect(globalOrderBlock).toContain('const incomingById = new Map(incomingOrders.map(order => [order.id, order]));');
    expect(globalOrderBlock).toContain('const cloudMatchesMergedOrder =');
    expect(globalOrderBlock).toContain('if (cloudMatchesMergedOrder) {');
    expect(globalOrderBlock).toContain('pendingOrderSyncIdsRef.current.delete(order.id);');
    expect(globalOrderBlock).not.toContain("mergedOrders.forEach(order => {\n        publishedOrderSignaturesRef.current.set(order.id, getOrderSignature(order));\n        pendingOrderSyncIdsRef.current.delete(order.id);");
  });

  test('POS incremental publisher keeps pending writes until smart update confirms cloud sync', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const publisherStart = source.indexOf('ordersToPublish.forEach(async order => {');
    const publisherBlock = source.slice(
      publisherStart,
      source.indexOf('if (false && uniqueOrdersSignature', publisherStart)
    );

    expect(publisherBlock).toContain('const publishResult = await smartUpdateDocument');
    expect(publisherBlock).toContain('if (publishResult?.pending || publishResult?.success === false) {');
    expect(publisherBlock).toContain('pendingIds.add(order.id);');
    expect(publisherBlock).toContain('return;');
    expect(publisherBlock).not.toContain("smartUpdateDocument('pos_orders', order.id, orderData)\n          .then(() => {");
  });

  test('POS order actions publish immediately instead of waiting for the batch effect', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = async () => {'),
      source.indexOf('const deductStockForOrder')
    );
    const paymentBlock = source.slice(
      source.indexOf('const handleCompletePayment = async () => {'),
      source.indexOf('const handlePrintReceipt = () => {')
    );

    expect(sendBlock).toContain('publishOrderImmediately(newOrderWithCancelRecords)');
    expect(sendBlock).toContain('publishOrderImmediately(updatedOrderForPublish)');
    expect(paymentBlock).toContain('publishOrderImmediately(updatedOrder)');
    expect(paymentBlock).toContain('publishOrderImmediately(paidOrderForSideEffects)');
  });

  test('POS cancelled item records are persisted with the order before finance reads them', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = async () => {'),
      source.indexOf('const deductStockForOrder')
    );
    const paymentBlock = source.slice(
      source.indexOf('const handleCompletePayment = async () => {'),
      source.indexOf('const handlePrintReceipt = () => {')
    );

    expect(source).toContain('cancelRecords?: CancelRecord[];');
    expect(source).toContain('const getCurrentOrderCancelRecords =');
    expect(source).toContain('const mergeOrderCancelRecords =');
    expect(sendBlock).toContain('mergeOrderCancelRecords(newOrder');
    expect(sendBlock).toContain('mergeOrderCancelRecords(updatedOrderForPublish');
    expect(paymentBlock).toContain('mergeOrderCancelRecords(updatedOrder');
    expect(paymentBlock).toContain('mergeOrderCancelRecords(paidOrderForSideEffects');
  });

  test('POS incremental publisher does not republish stale non-pending local cached orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const filterStart = source.indexOf('const ordersToPublish = uniqueOrders.filter(order => {');
    expect(filterStart).toBeGreaterThan(-1);
    const filterBlock = source.slice(
      filterStart,
      source.indexOf('if (ordersToPublish.length > 0)', filterStart)
    );

    expect(filterBlock).toContain('return pendingIds.has(order.id);');
    expect(filterBlock).not.toContain("publishedSignatures.get(order.id) !== orderSignature");
  });

  test('kitchen display cannot regress terminal POS orders back to served or preparing', () => {
    const kitchenPath = path.join(process.cwd(), 'src/pages/POS/KitchenDisplay.tsx');
    const source = fs.readFileSync(kitchenPath, 'utf8');

    expect(source).toContain('const isTerminalPosOrder = (order: any): boolean =>');
    expect(source).toContain("order.status === 'completed' || order.status === 'cancelled'");
    expect(source).toContain('if (isTerminalPosOrder(originalOrder)) {');
    expect(source).toContain("console.warn('厨房忽略终态订单更新，避免回退 POS 状态:'");
    expect(source).not.toContain("status: 'served',\n      servedAt: new Date(),");
  });

  test('waiter add-on recalculates payment status when a paid order total increases', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = () => {'),
      source.indexOf('// 返回桌台视图')
    );

    expect(sendBlock).toContain('const nextTotalAmount = updatedItems.reduce');
    expect(sendBlock).toContain('const settledAmount = Number(currentOrder.settledAmount || currentOrder.paidAmount || 0);');
    expect(sendBlock).toContain("paymentStatus: getPaymentStatusForTotal(settledAmount, nextTotalAmount)");
    expect(source).toContain('const getPaymentStatusForTotal =');
  });

  test('POS order numbers keep MMDD sequence format but allocate sequence through a cloud counter', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');

    expect(posSource).toContain('smartGenerateDailyOrderNumber');
    expect(posSource).toContain('await generateOrderNumber()');
    expect(posSource).not.toContain('const maxSeq = orders.reduce');
    expect(syncSource).toContain('export const smartGenerateDailyOrderNumber');
    expect(syncSource).toContain("const counterCollectionPath = getStoreCollectionPath('order_counters')");
    expect(syncSource).toContain('runTransaction(db, async transaction =>');
    expect(syncSource).toContain('String(nextSequence).padStart(3,');
  });

  test('POS order number fallback continues after the largest local same-day order number', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const syncSource = fs.readFileSync(syncPath, 'utf8');

    expect(syncSource).toContain('const getMaxLocalOrderSequence = (datePrefix: string): number =>');
    expect(syncSource).toContain("const localStorageKey = getLocalStorageKey('pos_orders');");
    expect(syncSource).toContain("String(order?.orderNumber || '')");
    expect(syncSource).toContain('const localMaxSequence = getMaxLocalOrderSequence(datePrefix);');
    expect(syncSource).toContain('const nextSequence = Math.max(currentSequence, localMaxSequence) + 1;');
  });

  test('POS table status is reconciled by one cloud-publish-aware effect only', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).toContain('const reconciledTables = tables.map(table => {');
    expect(source).toContain('reconcileTableStatusFromOrders(table, orders, now)');
    expect(source).not.toContain('const paidOrder = orders.find(o =>\n        o.tableId === table.id &&\n        o.paymentStatus ===');
  });

  test('POS cloud terminal order state overrides newer local non-terminal cache', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const appContextSource = fs.readFileSync(appContextPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

    expect(posSource).toContain("from '../../utils/posLifecycle'");
    expect(lifecycleSource).toContain('export const isCloudTerminalAdvance = (');
    expect(lifecycleSource).toContain('if (isCloudTerminalAdvance(localOrder, cloudOrder)) return true;');
    expect(lifecycleSource).toContain('if (!localOrder || isCloudTerminalAuthoritative(localOrder, incomingOrder, pendingOrderIds) || isCloudTerminalAdvance(localOrder, incomingOrder) || (!isOrderStateRegression(localOrder, incomingOrder)');
    expect(appContextSource).toContain('const isCloudTerminalAdvance = useCallback((localItem: any, cloudItem: any): boolean => {');
    expect(appContextSource).toContain('if (isCloudTerminalAdvance(localItem, cloudItem)) {');
  });

  test('POS cloud completed or cancelled order state overrides stale local pending cache', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const source = fs.readFileSync(posPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

    expect(source).toContain("from '../../utils/posLifecycle'");
    expect(lifecycleSource).toContain('export const isCloudTerminalAuthoritative = (');
    expect(lifecycleSource).toContain('if (pendingOrderIds?.has(String(incomingOrder.id)) && isTerminalOrderStatus(localOrder?.status)) return false;');
    expect(lifecycleSource).not.toContain('if (pendingOrderIds?.has(String(incomingOrder.id))) return false;');
    expect(lifecycleSource).toContain('if (isCloudTerminalAuthoritative(localOrder, cloudOrder, pendingOrderIds)) return true;');
    expect(lifecycleSource).toContain('isCloudTerminalAuthoritative(localOrder, incomingOrder, pendingOrderIds)');
    expect(source).toContain('hasNewerCloudOrders(incomingOrders, prevOrders, pendingOrderSyncIdsRef.current)');
    expect(source).toContain('mergeOrdersByVersion(cloudReconciledOrders, incomingOrders, pendingOrderSyncIdsRef.current)');
  });

  test('smart sync normalizes POS orders with completion timestamps before local cloud merge', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const normalizerBlock = source.slice(
      source.indexOf('const normalizePosOrderLifecycle ='),
      source.indexOf('const normalizeRecordForCollection =')
    );
    const metadataBlock = source.slice(
      source.indexOf('const withSyncMetadata ='),
      source.indexOf('const shouldReplaceLocalRecord =')
    );
    const subscribeBlock = source.slice(
      source.indexOf('export const smartSubscribeToCollection ='),
      source.indexOf('const saveToLocalStorage =')
    );

    expect(normalizerBlock).toContain("status: 'completed'");
    expect(normalizerBlock).toContain("if (record.status === 'cancelled') return record;");
    expect(normalizerBlock).toContain('record.completedAt || record.clearedAt');
    expect(normalizerBlock).toContain("paymentStatus: paymentLooksComplete ? 'paid' : record.paymentStatus");
    expect(normalizerBlock).toContain('paidAmount: normalizedPaidAmount');
    expect(normalizerBlock).toContain('settledAmount: normalizedPaidAmount');
    expect(metadataBlock).toContain('return normalizeRecordForCollection(collectionName, normalized);');
    expect(subscribeBlock).toContain('normalizeRecordForCollection(collectionName, convertTimestampsToLocalTime');
  });

  test('POS right order list hides empty zero-amount local placeholder orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const source = fs.readFileSync(posPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    const filterStart = source.indexOf('const allOrders = (orderTypeFilter ===');
    expect(filterStart).toBeGreaterThan(-1);
    const filterBlock = source.slice(
      filterStart,
      source.indexOf('const filteredOrders =', filterStart)
    );

    expect(source).toContain("from '../../utils/posLifecycle'");
    expect(lifecycleSource).toContain('export const isDisplayablePosOrder = (order: Partial<PosLifecycleOrder>): boolean => {');
    expect(lifecycleSource).toContain('const hasOrderNumber = Boolean(String(order.orderNumber || \'\').trim());');
    expect(lifecycleSource).toContain('const hasItems = Array.isArray(order.items) && order.items.length > 0;');
    expect(lifecycleSource).toContain('return hasOrderNumber && (hasItems || hasMoney || hasCancellationRecord);');
    expect(source).toContain('const todayOrderPrefix = `${today.slice(5, 7)}${today.slice(8, 10)}`;');
    expect(source).toContain('const isTodayPosOrder = (order: Partial<Order>): boolean => {');
    expect(source).toContain('if (/^\\d{7}$/.test(orderNumber)) {');
    expect(source).toContain('return orderNumber.startsWith(todayOrderPrefix);');
    expect(source).toContain("if (orderNumber.startsWith('ORD-')) {");
    expect(filterBlock).toContain('if (!isDisplayablePosOrder(o)) return false;');
    expect(filterBlock).toContain('return isTodayPosOrder(o);');
    expect(filterBlock).not.toContain('return getLocalDateString(orderDate) === today;');
  });

  test('POS cancelled zero-amount orders stay visible with a cancelled label', () => {
    const lifecycleSource = fs.readFileSync(path.join(process.cwd(), 'src/utils/posLifecycle.ts'), 'utf8');
    const posSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/POS/POS.tsx'), 'utf8');

    expect(lifecycleSource).toContain("const hasCancellationRecord = order.status === 'cancelled'");
    expect(posSource).toContain('Pedido anulado');
    expect(posSource).toContain("order.status === 'cancelled' && Number(order.paidAmount || 0) <= 0 && Number(order.totalAmount || 0) <= 0");
  });

  test('POS local business caches use scoped storage keys only', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).toContain("localStorage.getItem(getScopedStorageKey('pos_deducted_orders'))");
    expect(source).toContain("localStorage.setItem(getScopedStorageKey('pos_deducted_orders')");
    expect(source).not.toContain("localStorage.getItem('pos_deducted_orders')");
    expect(source).not.toContain("localStorage.setItem('pos_deducted_orders'");
    expect(source).not.toContain("localStorage.getItem('pos_orders')");
    expect(source).not.toContain("localStorage.getItem('restaurant_menu_items')");
    expect(source).not.toContain("localStorage.getItem('inventory_items')");
  });

  test('POS and waiter table subscriptions clear stale local tables when cloud is empty', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const waiterSource = fs.readFileSync(waiterPath, 'utf8');

    expect(posSource).toContain("saveToStorage('pos_tables', []);");
    expect(posSource).toContain('setTables([]);');
    expect(waiterSource).toContain("localStorage.setItem(dataService.getStoreKey('pos_tables'), JSON.stringify([]));");
    expect(waiterSource).toContain('setTables([]);');
    expect(posSource).not.toContain('if (!cloudTables || cloudTables.length === 0) {\n        return;\n      }');
    expect(waiterSource).not.toContain('if (!cloudTables || cloudTables.length === 0) return;');
  });

  test('POS table edit updates the existing table instead of creating a duplicate', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const handlerStart = source.indexOf('const handleAddTable = () => {');
    const handlerEnd = source.indexOf('const handleDeleteTable', handlerStart);
    const handlerBlock = source.slice(handlerStart, handlerEnd);

    expect(handlerBlock).toContain('if (editingTable) {');
    expect(handlerBlock).toContain('t.id === editingTable.id');
    expect(handlerBlock).toContain('number: newTableName.trim()');
    expect(handlerBlock).toContain('setEditingTable(null);');
  });

  test('POS table split restores original table positions after merge', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const mergeBlock = source.slice(
      source.indexOf('const handleMergeTables = () => {'),
      source.indexOf('const handleSplitTable = (tableId: string) => {')
    );
    const splitBlock = source.slice(
      source.indexOf('const handleSplitTable = (tableId: string) => {'),
      source.indexOf('const getStatusColor', source.indexOf('const handleSplitTable = (tableId: string) => {'))
    );

    expect(source).toContain('mergedFromTables?: Array<{');
    expect(source).toContain('mergedFromTables: table.mergedFromTables || null');
    expect(mergeBlock).toContain('const mergedFromTables = selectedTables');
    expect(mergeBlock).toContain('x: t.x');
    expect(mergeBlock).toContain('y: t.y');
    expect(mergeBlock).toContain('mergedFromTables');
    expect(splitBlock).toContain('const restoredTables = table.mergedFromTables');
    expect(splitBlock).toContain('x: original.x');
    expect(splitBlock).toContain('y: original.y');
    expect(splitBlock).toContain('deletedTableIdsRef.current.delete(restoredTable.id)');
  });

  test('POS merged tables keep directional table dimensions for pseudo 3D layout', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const mergeBlock = source.slice(
      source.indexOf('const handleMergeTables = () => {'),
      source.indexOf('const handleSplitTable = (tableId: string) => {')
    );
    const renderBlock = source.slice(
      source.indexOf('{tables.map(table => ('),
      source.indexOf('{isEditMode && table.number.includes', source.indexOf('{tables.map(table => ('))
    );

    expect(source).toContain("orientation?: 'horizontal' | 'vertical';");
    expect(source).toContain("shape?: 'round' | 'square' | 'rectangle';");
    expect(mergeBlock).toContain('const mergedBounds = getMergedTableBounds(mergedFromTables);');
    expect(mergeBlock).toContain('orientation: mergedBounds.orientation');
    expect(mergeBlock).toContain('x: mergedBounds.x');
    expect(mergeBlock).toContain('y: mergedBounds.y');
    expect(mergeBlock).toContain('width: mergedBounds.width');
    expect(mergeBlock).toContain('height: mergedBounds.height');
    expect(renderBlock).toContain('height: `${table.height}px`');
    expect(renderBlock).not.toContain("height: '92px'");
    expect(renderBlock).toContain('height: table.shape === \'rectangle\' ? \'calc(100% + 20px)\' : \'calc(100% + 16px)\'');
  });

  test('POS table visual uses modern image tabletops so merged table shapes remain readable', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const renderBlock = source.slice(
      source.indexOf('{tables.map(table => ('),
      source.indexOf('{isEditMode && table.number.includes', source.indexOf('{tables.map(table => ('))
    );

    expect(source).toContain('const inferTableShape =');
    expect(source).toContain("number.includes('+') ? 'rectangle' : 'square'");
    expect(source).toContain('const getTableSprite = (table: Table)');
    expect(source).toContain('const getTableImageFilter = (table: Table)');
    expect(source).toContain("return table.orientation === 'vertical' ? tableVerticalModern : tableHorizontalModern;");
    expect(renderBlock).toContain('src={getTableSprite(table)}');
    expect(renderBlock).toContain('filter: getTableImageFilter(table)');
  });

  test('POS table status changes the table image color instead of drawing an outer frame', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const renderBlock = source.slice(
      source.indexOf('{tables.map(table => ('),
      source.indexOf('{isEditMode && table.number.includes', source.indexOf('{tables.map(table => ('))
    );

    expect(source).toContain('const getTableImageFilter = (table: Table)');
    expect(source).toContain('return baseShadow;');
    expect(source).toContain("case 'occupied':");
    expect(source).toContain("case 'needs_cleaning':");
    expect(renderBlock).toContain('filter: getTableImageFilter(table)');
    expect(renderBlock).not.toContain('borderColor: getTableStatusAccent(table)');
    expect(renderBlock).not.toContain('{shouldShowTableStatusFrame(table) && (');
  });

  test('POS table and order card colors use the same order lifecycle priority', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const lifecyclePath = path.join(process.cwd(), 'src/utils/posLifecycle.ts');
    const source = fs.readFileSync(posPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    const colorBlock = source.slice(
      source.indexOf('const getStatusColor ='),
      source.indexOf('const getStatusText =')
    );
    const tableFilterBlock = source.slice(
      source.indexOf('const getTableImageFilter ='),
      source.indexOf('// Cancel Modal Component')
    );

    expect(colorBlock).toContain('getPosOrderCardColor(status, paymentStatus, clearedAt)');
    expect(lifecycleSource).toContain("paymentStatus === 'paid'");
    expect(lifecycleSource).toContain("return '#fed7aa'");
    expect(lifecycleSource).toContain("case 'confirmed':");
    expect(lifecycleSource).toContain("return '#fecaca'");
    expect(lifecycleSource).toContain("case 'completed':");
    expect(lifecycleSource).toContain("return '#ffffff'");
    expect(tableFilterBlock.indexOf("case 'occupied':")).toBeLessThan(
      tableFilterBlock.indexOf("if (selectedTableId === table.id)")
    );
    expect(tableFilterBlock.indexOf("case 'needs_cleaning':")).toBeLessThan(
      tableFilterBlock.indexOf("if (selectedTableId === table.id)")
    );
    expect(tableFilterBlock).toContain('hue-rotate(318deg)');
    expect(tableFilterBlock).toContain('hue-rotate(342deg)');
  });

  test('POS table visual uses modern table image assets instead of CSS block furniture', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const renderBlock = source.slice(
      source.indexOf('{tables.map(table => ('),
      source.indexOf('{isEditMode && table.number.includes', source.indexOf('{tables.map(table => ('))
    );

    expect(source).toContain("import tableSingleModern from '../../assets/pos/table-single-modern.png';");
    expect(source).toContain("import tableHorizontalModern from '../../assets/pos/table-horizontal-modern.png';");
    expect(source).toContain("import tableVerticalModern from '../../assets/pos/table-vertical-modern.png';");
    expect(source).toContain('const getTableSprite = (table: Table)');
    expect(source).toContain('const getTableImageFilter = (table: Table)');
    expect(renderBlock).toContain('src={getTableSprite(table)}');
    expect(renderBlock).toContain('objectFit: \'contain\'');
    expect(renderBlock).toContain('filter: getTableImageFilter(table)');
    expect(renderBlock).not.toContain('Mesa izquierda');
    expect(renderBlock).not.toContain('Mesa derecha');
    expect(renderBlock).not.toContain('radial-gradient(circle at 34% 22%');
  });

  test('POS table background stays continuous without heavy blur overlay', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');

    expect(source).toContain('linear-gradient(rgba(248,250,252,0.34), rgba(248,250,252,0.42))');
    expect(source).toContain("backgroundSize: '100% 100%, cover, 28px 28px, 28px 28px'");
    expect(source).toContain("backgroundRepeat: 'no-repeat, no-repeat, repeat, repeat'");
    expect(source).not.toContain('linear-gradient(rgba(248,250,252,0.76), rgba(248,250,252,0.84))');
    expect(source).not.toContain("backgroundSize: '100% 100%, min(100%, 1586px) auto, 28px 28px, 28px 28px'");
  });

  test('POS menu category selector is fixed visible and grows with wrapped content', () => {
    const menuSelectionPath = path.join(process.cwd(), 'src/components/MenuSelection.tsx');
    const source = fs.readFileSync(menuSelectionPath, 'utf8');

    expect(source).toContain("flexWrap: 'wrap'");
    expect(source).toContain("alignContent: 'flex-start'");
    expect(source).not.toContain('categoriesExpanded');
    expect(source).not.toContain('setCategoriesExpanded');
    expect(source).not.toContain('aria-expanded');
    expect(source).not.toContain('灞曞紑鍒嗙被');
    expect(source).not.toContain('鏀惰捣鍒嗙被');
    expect(source).not.toContain('maxHeight:');
    expect(source).not.toContain("overflowY: 'hidden'");
    expect(source).not.toContain("overflowX: 'auto'");
  });

  test('POS menu search input auto-focuses when ordering and returns focus after quick actions', () => {
    const menuSelectionPath = path.join(process.cwd(), 'src/components/MenuSelection.tsx');
    const source = fs.readFileSync(menuSelectionPath, 'utf8');

    expect(source).toContain('searchInputRef');
    expect(source).toContain('focusSearchInput');
    expect(source).toContain('searchInputRef.current?.focus()');
    expect(source).toContain('ref={searchInputRef}');
    expect(source).toContain('autoFocus');
    expect(source).toContain('focusSearchInput();');
  });

  test('POS empty order state keeps a visible return action to overview', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const emptyOrderStart = source.indexOf('Sin pedido');
    expect(emptyOrderStart).toBeGreaterThan(-1);
    expect(source).toContain('{/* empty-order-state-end */}');
    const emptyOrderBlock = source.slice(
      source.lastIndexOf('<div style={{', emptyOrderStart),
      source.indexOf('{/* empty-order-state-end */}', emptyOrderStart)
    );

    expect(emptyOrderBlock).toContain('Sin pedido');
    expect(emptyOrderBlock).toContain('← Volver');
    expect(emptyOrderBlock).toContain('onClick={returnToOverviewFromOrder}');
    expect(source).toContain('const resetOrderEntryState = () => {');
    expect(source).toContain("setViewMode('overview')");
    expect(source).toContain('setSelectedOrderId(null)');
    expect(source).toContain('setSelectedTableId(null)');
    expect(source).toContain("setOrderType('dine_in')");
  });

  test('menu management provides a local search box without changing cloud writes', () => {
    const menuPath = path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx');
    const source = fs.readFileSync(menuPath, 'utf8');

    expect(source).toContain('const [menuSearchTerm, setMenuSearchTerm] = useState');
    expect(source).toContain('const [selectedMenuCategory, setSelectedMenuCategory] = useState');
    expect(source).toContain('const menuCategoryOptions = Array.from');
    expect(source).toContain('const filteredMenuItems = menuItems.filter');
    expect(source).toContain('placeholder="搜索菜品名称、分类或价格"');
    expect(source).toContain('value={selectedMenuCategory}');
    expect(source).toContain('<option value="all">全部类别</option>');
    expect(source).toContain('filteredMenuItems.map(menu =>');
    expect(source).toContain('const directStockItemIds = new Set');
    expect(source).toContain('const recipeIngredientItemIds = new Set');
    expect(source).toContain('const currentRecipeIngredientIds = new Set');
    expect(source).toContain('const directDeductionInventoryItems = inventoryItems.filter');
    expect(source).toContain('const recipeIngredientInventoryItems = inventoryItems.filter');
    expect(source).toContain("item.id === editingMenu?.stockItemId");
    expect(source).toContain('currentRecipeIngredientIds.has(item.id)');
    expect(source).toContain('directDeductionInventoryItems.map(item =>');
    expect(source).toContain('recipeIngredientInventoryItems.map(item =>');
    expect(source).toContain('menuItems.map(m =>');
    expect(source).toContain("await smartUpdateDocument('menu_items', menu.id, updatedMenu)");
    expect(source).toContain("await smartDeleteDocument('menu_items', menu.id)");
  });

  test('menu recipe quantity input preserves leading zero decimals while editing', () => {
    const menuPath = path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx');
    const source = fs.readFileSync(menuPath, 'utf8');

    expect(source).toContain('const [ingredientQuantityDrafts, setIngredientQuantityDrafts] = useState<Record<number, string>>({})');
    expect(source).toContain('const isValidIngredientQuantityInput');
    expect(source).toContain("inputMode=\"decimal\"");
    expect(source).toContain('ingredientQuantityDrafts[idx] ??');
    expect(source).toContain('setIngredientQuantityDrafts(prev => ({ ...prev, [idx]: inputValue }))');
    expect(source).toContain('delete nextDrafts[idx]');
    expect(source).not.toContain('value={ing.quantity || \'\'}');
  });

  test('inventory UI polish keeps cloud writes and image upload behavior intact', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const menuPath = path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx');
    const inventorySource = fs.readFileSync(inventoryPath, 'utf8');
    const menuSource = fs.readFileSync(menuPath, 'utf8');

    expect(inventorySource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(menuSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(inventorySource).toContain("await smartUpdateDocument('inventory_items'");
    expect(inventorySource).toContain("await smartDeleteDocument('inventory_items'");
    expect(inventorySource).toContain("await smartSetDocument('inventory_categories'");
    expect(menuSource).toContain("await smartUpdateDocument('menu_items'");
    expect(menuSource).toContain("await smartDeleteDocument('menu_items'");
    expect(menuSource).toContain('processAndUploadMenuImage');
    expect(menuSource).toContain('MenuImage');
  });

  test('employee UI polish keeps employee loan and salary data behavior intact', () => {
    const employeesPath = path.join(process.cwd(), 'src/pages/Employees/Employees.tsx');
    const listPath = path.join(process.cwd(), 'src/pages/Employees/EmployeeList.tsx');
    const loansPath = path.join(process.cwd(), 'src/pages/Employees/LoanManagement.tsx');
    const salaryPath = path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx');
    const employeesSource = fs.readFileSync(employeesPath, 'utf8');
    const listSource = fs.readFileSync(listPath, 'utf8');
    const loansSource = fs.readFileSync(loansPath, 'utf8');
    const salarySource = fs.readFileSync(salaryPath, 'utf8');

    expect(employeesSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(listSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(loansSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(salarySource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(employeesSource).toContain("smartGetDocuments('employee_deletions'");
    expect(listSource).toContain("await smartUpdateDocument('employees'");
    expect(listSource).toContain("await smartUpdateDocument('employee_deletions'");
    expect(loansSource).toContain("await smartAddDocument('loan_records'");
    expect(loansSource).toContain("await smartAddDocument('expenses'");
    expect(salarySource).toContain('const calculateSalary =');
    expect(salarySource).toContain("await smartAddDocument('salary_records'");
    expect(salarySource).toContain("smartUpdateDocument('loan_records'");
  });

  test('customer refresh persists deletion tombstones and delete writes are single-document', () => {
    const customersPath = path.join(process.cwd(), 'src/pages/Customers/CustomersModule.tsx');
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const source = fs.readFileSync(customersPath, 'utf8');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const addBlock = source.slice(
      source.indexOf('const handleAddCustomer = async () => {'),
      source.indexOf('// 缂栬緫瀹㈡埛')
    );
    const editBlock = source.slice(
      source.indexOf('const handleSaveEdit = async () => {'),
      source.indexOf('// 鍒犻櫎瀹㈡埛')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteCustomer = async'),
      source.indexOf('// 绉垎绠＄悊')
    );
    const addPointsBlock = source.slice(
      source.indexOf('const handleAddPoints = async () => {'),
      source.indexOf('const handleSavePointsSettings = async')
    );
    const settingsBlock = source.slice(
      source.indexOf('const handleSavePointsSettings = async'),
      source.indexOf('// 绉垎鍏戞崲')
    );
    const redeemBlock = source.slice(
      source.indexOf('const handleConfirmRedeem = async () => {'),
      source.indexOf('// 閲嶇疆绉垎')
    );
    const resetBlock = source.slice(
      source.indexOf('const handleResetPoints = async'),
      source.indexOf('// 鏍峰紡')
    );

    expect(source).toContain("smartGetDocuments('customers', true)");
    expect(source).toContain("smartGetDocuments('customer_deletions', true)");
    expect(rules).toContain('match /stores/{storeId}/customer_deletions/{deletionId}');
    expect(source).toContain('filterActiveCustomers(cloudCustomers, cloudCustomerDeletions)');
    expect(source).toContain("saveLocalCollection('customer_deletions', cloudCustomerDeletions)");
    expect(source).toContain("smartUpdateDocument('customers', customerId");
    expect(source).toContain("smartUpdateDocument('customer_deletions', customerId");
    expect(source).toContain("dataManager.saveData('customers', nextCustomers");
    expect(source).toContain('syncFirestore: false');
    expect(source).not.toContain("smartDeleteDocument('customers', customerId)");
    expect(addBlock.indexOf("await smartSetDocument('customers', newCustomer.id, newCustomer)")).toBeLessThan(
      addBlock.indexOf('setCustomers(nextCustomers)')
    );
    expect(editBlock.indexOf("await smartSetDocument('customers', updatedCustomer.id, updatedCustomer)")).toBeLessThan(
      editBlock.indexOf('setCustomers(nextCustomers)')
    );
    expect(deleteBlock.indexOf("await smartUpdateDocument('customer_deletions', customerId")).toBeLessThan(
      deleteBlock.indexOf('setCustomers(nextCustomers)')
    );
    expect(addPointsBlock.indexOf("await smartSetDocument('points_transactions', transaction.id, transaction)")).toBeLessThan(
      addPointsBlock.indexOf('setTransactions(updatedTransactions)')
    );
    expect(settingsBlock.indexOf("await smartSetDocument('exchange_rate', 'global', nextConfig)")).toBeLessThan(
      settingsBlock.indexOf('saveLocalPointsConfig(nextConfig)')
    );
    expect(redeemBlock.indexOf("await smartSetDocument('points_transactions', transaction.id, transaction)")).toBeLessThan(
      redeemBlock.indexOf('setTransactions(updatedTransactions)')
    );
    expect(resetBlock.indexOf("await smartSetDocument('customers', updatedCustomer.id, updatedCustomer)")).toBeLessThan(
      resetBlock.indexOf('setCustomers(nextCustomers)')
    );
  });

  test('points and exchange-rate settings use store-scoped local cache keys', () => {
    const exchangeRatePath = path.join(process.cwd(), 'src/utils/exchangeRate.ts');
    const customersPath = path.join(process.cwd(), 'src/pages/Customers/CustomersModule.tsx');
    const settingsPath = path.join(process.cwd(), 'src/pages/Manager/ExchangeRateSettings.tsx');
    const exchangeRateSource = fs.readFileSync(exchangeRatePath, 'utf8');
    const customersSource = fs.readFileSync(customersPath, 'utf8');
    const settingsSource = fs.readFileSync(settingsPath, 'utf8');

    expect(exchangeRateSource).toContain('getExchangeRateStorageKey');
    expect(exchangeRateSource).toContain('store_${storeId}_${EXCHANGE_RATE_KEY}');
    expect(customersSource).toContain('localStorage.setItem(getExchangeRateStorageKey()');
    expect(settingsSource).toContain('localStorage.getItem(getExchangeRateStorageKey(storeId))');
    expect(settingsSource).toContain('localStorage.setItem(getExchangeRateStorageKey(storeId)');
    expect(customersSource).not.toContain("localStorage.setItem('global_exchange_rate'");
    expect(settingsSource).not.toContain("localStorage.getItem('global_exchange_rate'");
    expect(settingsSource).not.toContain("localStorage.setItem('global_exchange_rate'");
  });

  test('manager dashboard uses collected revenue and financial order dates', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('getOrderCancellationDateKey(order)');
    expect(source).toContain('getCancelledItemCountForDate(order, dateKey)');
    expect(source).toContain('cancelledOrders');
    expect(source).toContain('cancelledItems');
    expect(source).toContain('getOrderFinancialDateKey(order)');
    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderPaymentBreakdown(order).card');
    expect(source).toContain('getOrderPaymentBreakdown(order).cash');
    expect(source).not.toContain('sum + (order.totalAmount || 0)');
    expect(source).not.toContain('customerMap[phone].totalSpent += order.totalAmount || 0');
    expect(source).not.toContain('hourStats[hour].revenue += order.totalAmount || 0');
    expect(source).not.toContain('console.log');
  });

  test('manager dashboard uses dedicated analytics utility for rankings calendar and period movement', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain("from '../../utils/dashboardAnalytics'");
    expect(source).toContain('buildSalesRankings');
    expect(source).toContain('buildMonthlySalesCalendar');
    expect(source).toContain('buildRankingComparison');
    expect(source).toContain('buildPeriodComparison');
    expect(source).not.toContain("smartSubscribeToCollection('pos_orders'");
  });

  test('manager dashboard date selector drives every analytics module from one range', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain("useState<'today' | 'month' | 'custom'>('today')");
    expect(source).toContain('normalizeDashboardRange(timeRange, startDate, endDate, new Date(), calendarMonth)');
    expect(source).toContain("const activeCalendarMonth = timeRange === 'month' ? calendarMonth : range.startDate.slice(0, 7)");
    expect(source).toContain('buildMonthlySalesCalendar(dashboardOrders, activeCalendarMonth)');
    expect(source).not.toContain("['week'");
    expect(source).not.toContain("['month', '近30天']");
  });

  test('manager dashboard UI polish uses shared tokens without changing analytics refresh paths', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(source).toContain('buildKpis(financialOrders');
    expect(source).toContain('buildSalesRankings(financialOrders');
    expect(source).toContain('buildMonthlySalesCalendar(dashboardOrders, activeCalendarMonth)');
    expect(source).toContain("smartGetDocuments('pos_orders'");
    expect(source).not.toContain("smartSubscribeToCollection('pos_orders'");
  });

  test('manager cloud refresh snapshots stay in page state and do not mutate shared data cache', () => {
    const dataManagerPath = path.join(process.cwd(), 'src/services/dataManager.ts');
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const expensesPath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const ordersPath = path.join(process.cwd(), 'src/pages/Manager/OrderHistoryPage.tsx');
    const handoverPath = path.join(process.cwd(), 'src/pages/Manager/ShiftHandover.tsx');

    const dataManagerSource = fs.readFileSync(dataManagerPath, 'utf8');
    const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');
    const reportsSource = fs.readFileSync(reportsPath, 'utf8');
    const expensesSource = fs.readFileSync(expensesPath, 'utf8');
    const ordersSource = fs.readFileSync(ordersPath, 'utf8');
    const handoverSource = fs.readFileSync(handoverPath, 'utf8');
    const dashboardRefreshBlock = dashboardSource.slice(
      dashboardSource.indexOf('const refreshManagerData = React.useCallback'),
      dashboardSource.indexOf('useEffect(() =>', dashboardSource.indexOf('const refreshManagerData = React.useCallback'))
    );
    const reportsRefreshBlock = reportsSource.slice(
      reportsSource.indexOf('const refreshFinancialData = React.useCallback'),
      reportsSource.indexOf('useEffect(() =>', reportsSource.indexOf('const refreshFinancialData = React.useCallback'))
    );
    const expensesRefreshBlock = expensesSource.slice(
      expensesSource.indexOf('const refreshExpenseData = React.useCallback'),
      expensesSource.indexOf('useEffect(() =>', expensesSource.indexOf('const refreshExpenseData = React.useCallback'))
    );
    const ordersRefreshBlock = ordersSource.slice(
      ordersSource.indexOf('const refreshOrderHistoryData = React.useCallback'),
      ordersSource.indexOf('useEffect(() =>', ordersSource.indexOf('const refreshOrderHistoryData = React.useCallback'))
    );
    const handoverRefreshBlock = handoverSource.slice(
      handoverSource.indexOf('const refreshHandovers = React.useCallback'),
      handoverSource.indexOf('useEffect(() =>', handoverSource.indexOf('const refreshHandovers = React.useCallback'))
    );

    expect(dataManagerSource).toContain('persistLocal?: boolean');
    expect(dataManagerSource).toContain('persistLocal = true');
    expect(dataManagerSource).toContain('if (persistLocal)');

    [dashboardRefreshBlock, reportsRefreshBlock, expensesRefreshBlock, ordersRefreshBlock, handoverRefreshBlock].forEach(source => {
      expect(source).not.toContain('dataManager.saveData(');
      expect(source).not.toContain('persistLocal: false');
    });
    expect(dashboardRefreshBlock).not.toContain('dataManager.clearCache();');
    expect(reportsRefreshBlock).not.toContain('dataManager.clearCache();');
    expect(expensesRefreshBlock).not.toContain("dataManager.clearCache('expenses')");
    expect(ordersRefreshBlock).not.toContain("dataManager.clearCache('orders')");
  });

  test('financial report UI polish uses shared tokens without changing formulas or print details', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');

    expect(source).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(source).toContain('calculateFinancialReportTotals({');
    expect(source).toContain('buildDailyExpenseBreakdown(');
    expect(source).toContain('calculateOrderStatusSummary(orders, date)');
    expect(source).toContain("smartGetDocuments('pos_orders'");
    expect(source).toContain('const handlePrint = () => {');
    expect(source).toContain('dailyExpenseBreakdown.groups.map');
    expect(source).toContain('group.details.map');
  });

  test('settings UI polish uses shared tokens without changing settings data paths', () => {
    const permissionsPath = path.join(process.cwd(), 'src/pages/Settings/PermissionsModule.tsx');
    const backupPath = path.join(process.cwd(), 'src/pages/Settings/DataBackup.tsx');
    const storesPath = path.join(process.cwd(), 'src/pages/Manager/Stores.tsx');
    const exchangePath = path.join(process.cwd(), 'src/pages/Manager/ExchangeRateSettings.tsx');
    const permissionsSource = fs.readFileSync(permissionsPath, 'utf8');
    const backupSource = fs.readFileSync(backupPath, 'utf8');
    const storesSource = fs.readFileSync(storesPath, 'utf8');
    const exchangeSource = fs.readFileSync(exchangePath, 'utf8');

    expect(permissionsSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(backupSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(storesSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(exchangeSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");

    expect(permissionsSource).toContain("await smartUpdateDocument('system_roles', editingRoleId, roleData)");
    expect(backupSource).toContain('createFirestoreBackup(user)');
    expect(backupSource).toContain('downloadBackupFile(nextBackup)');
    expect(storesSource).toContain("smartSetDocument('stores'");
    expect(storesSource).toContain("smartDeleteDocument('stores'");
    expect(exchangeSource).toContain("await smartSetDocument(`stores/${targetStoreId}/${COLLECTION}`, DOC_ID, updatedConfig)");
  });

  test('owner dashboard uses collected revenue and financial order dates', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');

    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderFinancialDateKey(order)');
    expect(source).toContain('getOrderPaymentBreakdown(order)');
    expect(source).toContain('getOrderFinancialTime(order)');
    expect(source).not.toContain('Number(order.totalAmount || order.total || 0)');
    expect(source).not.toContain('const timestamp = getRecordTime(order);');
  });

  test('owner dashboard mobile UI polish uses shared tokens without changing aggregation reads', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(source).toContain("const CACHE_KEY = 'owner_dashboard_cache_v1'");
    expect(source).toContain("smartGetDocuments('stores', true)");
    expect(source).toContain("smartGetDocuments(`stores/${store.id}/${collectionName}`, true)");
    expect(source).toContain('dedupeOwnerRecordsById(loadedStores)');
    expect(source).toContain('localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache))');
    expect(source).toContain('@media (max-width: 520px)');
    expect(layoutSource).toContain("window.matchMedia('(max-width: 720px)')");
    expect(layoutSource).toContain('const shouldUseFullscreenMenu = shouldHideSidebar || isNarrowViewport');
  });

  test('owner dashboard main content can scroll inside the app shell', () => {
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');

    expect(layoutSource).toContain("const shouldAllowPageScroll = location.pathname === '/dashboard'");
    expect(layoutSource).toContain("overflowY: shouldAllowPageScroll ? 'auto' : 'hidden'");
    expect(layoutSource).toContain("WebkitOverflowScrolling: shouldAllowPageScroll ? 'touch' : undefined");
  });

  test('owner dashboard scopes fixed modules by selected store and exposes expense evidence', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');
    const dedupeIndex = source.indexOf('const activeStores = dedupeOwnerRecordsById(loadedStores)');
    const loopIndex = source.indexOf('for (const store of activeStores)');

    expect(source).toContain('dedupeOwnerRecordsByStoreAndId(buckets.pos_orders)');
    expect(source).toContain('dedupeOwnerRecordsByStoreAndId(buckets.expenses)');
    expect(source).toContain('dedupeOwnerRecordsByStoreAndId(buckets.purchase_orders)');
    expect(dedupeIndex).toBeGreaterThan(-1);
    expect(loopIndex).toBeGreaterThan(dedupeIndex);
    expect(source).not.toContain('for (const store of loadedStores)');
    expect(source).toContain('value={selectedStoreId}');
    expect(source).toContain('<option value="all">全部分店</option>');
    expect(source).toContain("selectedStoreId === 'all'");
    expect(source).toContain('buildOwnerExpenseEvidenceRows(filteredExpenses, filteredPurchases)');
    expect(source).toContain('setSelectedEvidence(row)');
    expect(source).toContain('selectedEvidence.image');
    expect(source).toContain('开支/采购发票');
  });

  test('owner dashboard cache quota failure does not block freshly loaded cloud data', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');
    const refreshBlock = source.slice(
      source.indexOf('const refreshOwnerData = useCallback(async () => {'),
      source.indexOf('useEffect(() => {', source.indexOf('const refreshOwnerData = useCallback(async () => {'))
    );

    expect(refreshBlock).toContain('const applyOwnerDashboardCache = (nextCache: OwnerCache) => {');
    expect(refreshBlock).toContain('applyOwnerDashboardCache(nextCache);');
    expect(refreshBlock).toContain('try {');
    expect(refreshBlock).toContain('localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache))');
    expect(refreshBlock).toContain("console.warn('Owner dashboard cache write failed; keeping freshly loaded data visible:', error)");
    expect(refreshBlock.indexOf('applyOwnerDashboardCache(nextCache);')).toBeLessThan(
      refreshBlock.indexOf('localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache))')
    );
  });

  test('owner dashboard employee count uses deletion tombstones like employee management', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');

    expect(source).toContain("import { filterActiveEmployees } from '../../utils/employeeRecords';");
    expect(source).toContain("'employee_deletions'");
    expect(source).toContain('employeeDeletions: dedupeOwnerRecordsByStoreAndId(buckets.employee_deletions)');
    expect(source).toContain('return filterActiveEmployees(selectedEmployees, scopedEmployeeDeletions)');
    expect(source).not.toContain('number(employees.length)');
  });

  test('owner dashboard reuses manager sales ranking analytics with store-scoped menu data', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');

    expect(source).toContain('buildSalesRankings');
    expect(source).toContain('buildRankingComparison');
    expect(source).toContain('normalizeDashboardRange');
    expect(source).toContain('filterOrdersByRange');
    expect(source).toContain("'menu_items'");
    expect(source).toContain('menuItems: dedupeOwnerRecordsByStoreAndId(buckets.menu_items)');
    expect(source).toContain('const scopedMenuItems = useMemo');
    expect(source).toContain('className="panel ranking-panel"');
    expect(source).toContain('rankingScope');
    expect(source).toContain('rankingSortBy');
    expect(source).toContain('beverageCategoryFilter');
  });

  test('owner dashboard keeps sales rankings reachable on narrow mobile screens', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');
    const rankingClassIndex = source.indexOf('className="panel ranking-panel"');
    const rankingTitleIndex = source.indexOf('ranking-head', rankingClassIndex);

    expect(source).toContain('className="panel ranking-panel"');
    expect(rankingClassIndex).toBeGreaterThan(-1);
    expect(rankingTitleIndex).toBeGreaterThan(rankingClassIndex);
    expect(rankingTitleIndex - rankingClassIndex).toBeLessThan(400);
    expect(source).toContain('.content-grid > section {');
    expect(source).toContain('.ranking-panel {');
    expect(source).toContain('order: -1');
    expect(source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(source).not.toContain('@media (max-width: 520px) {\n          .owner-page {\n            padding: 10px;\n          }\n          .owner-actions {\n            display: grid;\n            grid-template-columns: 1fr;\n            width: 100%;\n          }\n          .owner-refresh,\n          .owner-sync-time,\n          .owner-select {\n            width: 100%;\n            text-align: center;\n          }\n          .metric-grid {\n            grid-template-columns: 1fr;\n          }');
  });

  test('owner dashboard shows order type split and expense rankings instead of reminders', () => {
    const ownerDashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const ownerDataPath = path.join(process.cwd(), 'src/utils/ownerDashboardData.ts');
    const source = fs.readFileSync(ownerDashboardPath, 'utf8');
    const ownerDataSource = fs.readFileSync(ownerDataPath, 'utf8');

    expect(ownerDataSource).toContain('summarizeOwnerOrderTypes');
    expect(source).toContain('summarizeOwnerOrderTypes(scopedOrders)');
    expect(source).toContain('className="order-type-split"');
    expect(source).toContain('Mesa');
    expect(source).toContain('Barra');
    expect(source).toContain('Delivery');
    expect(source).toContain('buildExpenseRankings');
    expect(source).toContain("'expense_categories'");
    expect(source).toContain('expenseCategories: dedupeOwnerRecordsByStoreAndId(buckets.expense_categories)');
    expect(source).toContain('className="panel owner-expense-ranking-panel"');
    expect(source).not.toContain('const alerts = useMemo');
    expect(source).not.toContain('className="alert-row"');
  });

  test('DataService does not expose legacy bulk overwrite sync entry points', () => {
    const servicePath = path.join(process.cwd(), 'src/services/DataService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('setBackupMode(');
    expect(source).not.toContain('restoreFromFirestore(');
    expect(source).not.toContain('syncToFirestoreNow(');
    expect(source).not.toContain('migrateGlobalDataToStore(');
    expect(source).not.toContain('private async syncToFirestore(');
    expect(source).not.toContain('processSyncQueue(');
  });

  test('DataService login store sync is cloud-authoritative and clears stale local cache', () => {
    const servicePath = path.join(process.cwd(), 'src/services/DataService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).toContain('localStorage.setItem(localKey, JSON.stringify(cloudData));');
    expect(source).not.toContain('Cloud empty; cleared local cache');
    expect(source).not.toContain('finalData = localData');
    expect(source).not.toContain('localTime > cloudTime');
    expect(source).not.toContain('if (cloudData && cloudData.length > 0)');
  });

  test('dataManager refuses bare business cache access without store scope', () => {
    const servicePath = path.join(process.cwd(), 'src/services/dataManager.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).toContain('const getStorageKey = (key: keyof DataStore): string | null =>');
    expect(source).toContain('if (!storeId) {');
    expect(source).toContain('return null;');
    expect(source).toContain('if (!primaryKey || !storeId) {');
    expect(source).toContain('throw new Error(`Missing storeId; refusing to save store-scoped data: ${String(key)}`);');
    expect(source).not.toContain('const globalKeys: Array<keyof DataStore> = []');
    expect(source).not.toContain('if (!storeId || globalKeys.includes(key))');
  });

  test('dataManager awaited saves wait for Firestore sync before notifying modules', () => {
    const servicePath = path.join(process.cwd(), 'src/services/dataManager.ts');
    const source = fs.readFileSync(servicePath, 'utf8');
    const syncBlock = source.slice(
      source.indexOf('if (syncFirestore && collectionName) {'),
      source.indexOf('// 4. ', source.indexOf('if (syncFirestore && collectionName) {'))
    );

    expect(syncBlock).toContain('const syncTasks = data.filter(item => item.id).map(async (item) =>');
    expect(syncBlock).toContain('await smartUpdateDocument(collectionName, item.id, item)');
    expect(syncBlock).toContain('throw error;');
    expect(syncBlock).toContain('await Promise.all(syncTasks);');
    expect(syncBlock).not.toContain('data.forEach(async');
  });

  test('inventory category cloud loads do not merge stale local categories', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain("smartGetDocuments('inventory_categories', true)");
    expect(source).toContain('setInventoryCategories(normalizedCloudCategories)');
    expect(source).not.toContain('setInventoryCategories(prev => mergeInventoryCategories(prev, normalizedCloudCategories))');
  });

  test('inventory category edits explicitly write single category documents to cloud', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('saveInventoryCategoryChange');
    expect(source).toContain("smartSetDocument('inventory_categories', docId");
    expect(source).toContain('await saveInventoryCategoryChange([...inventoryCategories, newCategory], newCategory)');
    expect(source).toContain('await saveInventoryCategoryChange(newCats, updatedCategory)');
    expect(source).toContain('await deleteInventoryCategoryFromCloud(nextCategories, cat)');
    expect(source).toContain("await smartDeleteDocument('inventory_categories', category.id || category.key)");
    expect(source).not.toContain('shouldSyncToCloud');
    expect(source).not.toContain('normalizedCategories.forEach(category =>');
  });

  test('inventory category cache writes stay store-scoped', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('localStorage.setItem(categoryStorageKey');
    expect(source).not.toContain("localStorage.setItem('inventory_categories'");
  });

  test('inventory refresh and stock records do not use global business cache keys', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain("dataService.getStoreKey('inventory_stock_records')");
    expect(source).not.toContain("localStorage.setItem('inventory_items'");
    expect(source).not.toContain("localStorage.setItem('inventory'");
    expect(source).not.toContain("localStorage.getItem('inventory_stock_records')");
  });

  test('inventory stock records tab supports local search filtering', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const [stockRecordSearchTerm, setStockRecordSearchTerm] = useState');
    expect(source).toContain('const filteredStockRecords = React.useMemo');
    expect(source).toContain('formatStockRecordReason(record)');
    expect(source).toContain('formatStockRecordOperator(record.operator)');
    expect(source).toContain('record.orderNumber');
    expect(source).toContain('(record as any).fridgeName');
    expect(source).toContain('value={stockRecordSearchTerm}');
    expect(source).toContain('onChange={(event) => setStockRecordSearchTerm(event.target.value)}');
    expect(source).toContain('filteredStockRecords.map(record =>');
  });

  test('inventory item list exposes negative stock visibility without mutating stock data', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain("const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'negative' | 'low'>('all')");
    expect(source).toContain('const isNegativeStockItem = (item: InventoryItem) => item.currentStock < 0 || getFridgeStock(item.id) < 0 || getTotalStock(item) < 0');
    expect(source).toContain('const negativeStockItems = inventoryItems.filter(isNegativeStockItem)');
    expect(source).toContain("stockStatusFilter === 'negative'");
    expect(source).toContain("setStockStatusFilter('negative')");
    expect(source).toContain('负库存');
    expect(source).toContain('需要盘点修正');
    expect(source).not.toContain('currentStock: Math.max');
    expect(source).not.toContain('quantity: Math.max');
  });

  test('inventory item stock edits write audited adjustment records', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const createInventoryItemEditStockRecord = (oldItem: InventoryItem, updatedItem: InventoryItem, now: number): StockRecord | null =>');
    expect(source).toContain('const stockDifference = Number(updatedItem.currentStock || 0) - Number(oldItem.currentStock || 0)');
    expect(source).toContain("reason: 'inventory item edit'");
    expect(source).toContain("source: 'inventory_item_edit'");
    expect(source).toContain('sourceId: updatedItem.id');
    expect(source).toContain('signedQuantity: stockDifference');
    expect(source).toContain('beforeStock: Number(oldItem.currentStock || 0)');
    expect(source).toContain('afterStock: Number(updatedItem.currentStock || 0)');
    expect(source).toContain("await smartAddDocument('inventory_stock_records', stockAdjustmentRecord)");
    expect(source).toContain('setStockRecords(records => [stockAdjustmentRecord, ...records]');
  });

  test('inventory stock records do not show legacy hardcoded demo rows', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const isLegacyDemoStockRecord');
    expect(source).toContain('filter((record: StockRecord) => !isLegacyDemoStockRecord(record))');
    expect(source).toContain('filteredStockRecords.length === 0');
    expect(source).not.toContain("itemId: 'item1'");
    expect(source).not.toContain("itemId: 'item3'");
    expect(source).not.toContain("itemName: '澶х背'");
    expect(source).not.toContain("itemName: '鍙箰'");
  });

  test('inventory stock record dates normalize Firestore timestamps before sorting and rendering', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const normalizeStockRecordDate = (...values: any[]): Date =>');
    expect(source).toContain('for (const value of values)');
    expect(source).toContain('value.seconds ?? value._seconds');
    expect(source).toContain('/^\\d{4}-\\d{2}-\\d{2}$/.test(value)');
    expect(source).toContain('const normalizedDate = normalizeStockRecordDate(record.createdAtMs, record.lastModified, record.createdAt, record.date)');
    expect(source).toContain('date: normalizedDate');
    expect(source).toContain('const formatStockRecordTime = (record: StockRecord): string =>');
    expect(source).toContain('normalizeStockRecordDate(record.createdAtMs, record.lastModified, record.createdAt, record.date)');
    expect(source).toContain('{formatStockRecordTime(record)}');
    expect(source).not.toContain('normalizeStockRecordDate(record.date).toLocaleString');
    expect(source).not.toContain('new Date(record.date)');
  });

  test('inventory stock records display business labels instead of internal reason and operator codes', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const formatStockRecordReason = (record: StockRecord): string =>');
    expect(source).toContain("case 'warehouse to fridge':");
    expect(source).toContain("return '仓库调拨到冰箱';");
    expect(source).toContain("case 'fridge to warehouse':");
    expect(source).toContain("return '冰箱退回仓库';");
    expect(source).toContain('const formatStockRecordOperator = (operator?: string): string =>');
    expect(source).toContain("if (!operator || operator === 'system') return '系统操作';");
    expect(source).toContain('{formatStockRecordReason(record)}');
    expect(source).toContain('{formatStockRecordOperator(record.operator)}');
    expect(source).not.toContain('{record.reason}</td>');
    expect(source).not.toContain('{record.operator}</td>');
  });

  test('inventory stock records display stocktake adjustment quantities with the real signed direction', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('const getStockRecordSignedQuantity = (record: StockRecord): number =>');
    expect(source).toContain('Number(record.signedQuantity)');
    expect(source).toContain("record.type === 'adjust'");
    expect(source).toContain('Number(record.afterStock) - Number(record.beforeStock)');
    expect(source).toContain('const formatStockRecordQuantity = (record: StockRecord): string =>');
    expect(source).toContain('{formatStockRecordQuantity(record)}');
    expect(source).not.toContain("{record.type === 'in' ? '+' : '-'}{record.quantity}");
  });

  test('purchase orders default to today, sort newest first, and never render invalid dates', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');

    expect(source).toContain('const getPurchaseOrderTime');
    expect(source).toContain('const getPurchaseOrderDateKey');
    expect(source).toContain('const formatPurchaseDate');
    expect(source).toContain('startDate: getLocalDateString()');
    expect(source).toContain('endDate: getLocalDateString()');
    expect(source).toContain('.sort((a, b) => getPurchaseOrderTime(b) - getPurchaseOrderTime(a))');
    expect(source).not.toContain('new Date(order.orderDate).toLocaleDateString');
    expect(source).not.toContain('new Date(selectedOrder.orderDate).toLocaleDateString');
    expect(source).not.toContain('new Date(selectedOrder.receivedDate).toLocaleDateString');
  });

  test('stocktake refresh caches require store scope for business data', () => {
    const stocktakePath = path.join(process.cwd(), 'src/utils/stocktakeRefresh.ts');
    const source = fs.readFileSync(stocktakePath, 'utf8');

    expect(source).toContain('if (!storeId) {');
    expect(source).toContain("console.warn('Missing storeId");
    expect(source).not.toContain("localStorage.setItem('inventory_items'");
    expect(source).not.toContain("localStorage.setItem('inventory'");
    expect(source).not.toContain(": 'fridges'");
    expect(source).not.toContain(": 'fridge_inventory'");
  });

  test('inventory stocktake category readers use store-scoped local cache keys', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    [warehouseSource, fridgeSource].forEach(source => {
      expect(source).toContain("dataService.getStoreKey('inventory_categories')");
      expect(source).not.toContain("localStorage.getItem('inventory_categories')");
    });
  });

  test('menu management keeps menu categories separate from inventory categories', () => {
    const menuPath = path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx');
    const menuSource = fs.readFileSync(menuPath, 'utf8');

    expect(menuSource).toContain("dataService.getStoreKey('menu_categories')");
    expect(menuSource).not.toContain("localStorage.getItem('inventory_categories')");
    expect(menuSource).not.toContain("localStorage.setItem('inventory_categories'");
  });

  test('inventory item deletion waits for linked cloud deletes before local state updates', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');
    const deleteBlock = source.slice(
      source.indexOf('const itemId = editingItem.id;'),
      source.indexOf("alert('閸掔娀娅庨幋鎰")
    );

    expect(deleteBlock).toContain('const linkedMenuItems =');
    expect(deleteBlock).toContain('const linkedFridgeInventory = fridgeInventory');
    expect(deleteBlock).toContain("await Promise.all(linkedMenuItems.map(menuItem => smartDeleteDocument('menu_items', menuItem.id)))");
    expect(deleteBlock).toContain("await Promise.all(linkedFridgeInventory.map(inv => smartDeleteDocument('fridge_inventory', inv.id || `${inv.fridgeId}-${inv.itemId}`)))");
    expect(deleteBlock).toContain("await smartDeleteDocument('inventory_items', itemId)");
    expect(deleteBlock.indexOf("await smartDeleteDocument('inventory_items', itemId)")).toBeLessThan(
      deleteBlock.indexOf('setInventoryItems(items => items.filter')
    );
    expect(deleteBlock).not.toContain('.forEach(');
    expect(deleteBlock).not.toContain("smartDeleteDocument('inventory_items', itemId).catch");
  });

  test('inventory item add and edit wait for cloud writes before local state updates', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');
    const editStart = source.indexOf('const updatedInventoryItem = {');
    const addStart = source.indexOf('const newItem: InventoryItem = {');
    const editBlock = source.slice(editStart, addStart);
    const addBlock = source.slice(addStart, source.indexOf('setShowAddModal(false);', addStart));

    expect(editBlock).toContain("await smartUpdateDocument('inventory_items', newId");
    expect(editBlock.indexOf("await smartUpdateDocument('inventory_items', newId")).toBeLessThan(
      editBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(editBlock).toContain("await smartUpdateDocument('menu_items', menuItem.id");
    expect(editBlock.indexOf("await smartUpdateDocument('menu_items', menuItem.id")).toBeLessThan(
      editBlock.indexOf('setMenuItems(items =>')
    );
    expect(editBlock).not.toContain("smartUpdateDocument('menu_items', menuItem.id, {");
    expect(editBlock).not.toContain('.catch(error =>');

    expect(addBlock).toContain("await smartAddDocument('inventory_items', newItem)");
    expect(addBlock.indexOf("await smartAddDocument('inventory_items', newItem)")).toBeLessThan(
      addBlock.indexOf('setInventoryItems([...inventoryItems, newItem])')
    );
    expect(addBlock).toContain("await smartAddDocument('menu_items', newMenuItem)");
    expect(addBlock.indexOf("await smartAddDocument('menu_items', newMenuItem)")).toBeLessThan(
      addBlock.indexOf('setMenuItems([...menuItems, newMenuItem])')
    );
    expect(addBlock).not.toContain("smartAddDocument('menu_items', newMenuItem).catch");
  });

  test('sellable fridge inventory items are guaranteed to have linked menu items', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');
    const editStart = source.indexOf('const updatedInventoryItem = {');
    const addStart = source.indexOf('const newItem: InventoryItem = {');
    const editBlock = source.slice(editStart, addStart);
    const addBlock = source.slice(addStart, source.indexOf('setShowAddModal(false);', addStart));

    expect(source).toContain('const SELLABLE_DIRECT_MENU_CATEGORY_KEYS');
    expect(source).toContain('const isDirectMenuInventoryCategory');
    expect(source).toContain('const getMenuCategoryForInventoryCategory');
    expect(editBlock).toContain('isDirectMenuInventoryCategory(updatedInventoryItem.category)');
    expect(editBlock).toContain('updatedMenuItem = {');
    expect(editBlock).toContain("await smartAddDocument('menu_items', updatedMenuItem)");
    expect(addBlock).toContain('isDirectMenuInventoryCategory(newItem.category)');
    expect(addBlock).toContain('getMenuCategoryForInventoryCategory(newItem.category)');
  });

  test('menu image uploads keep the original file without client compression', () => {
    const servicePath = path.join(process.cwd(), 'src/services/menuImageService.ts');
    const managementPath = path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx');
    const source = fs.readFileSync(servicePath, 'utf8');
    const managementSource = fs.readFileSync(managementPath, 'utf8');

    expect(source).not.toContain('compressMenuImage');
    expect(source).not.toContain('../utils/imageCompression');
    expect(source).not.toContain('thumbPath');
    expect(source).not.toContain('mediumPath');
    expect(source).not.toContain('imageThumbStoragePath');
    expect(source).not.toContain('imageThumbUrl');
    expect(source).toContain('uploadOriginalMenuImage');
    expect(source).toContain('uploadBytes(ref(storage, imagePath), file');
    expect(source).toContain('thumbSize: file.size');
    expect(source).toContain('mediumSize: file.size');
    expect(managementSource).toContain('imageThumbUrl: selectedImageFile ? undefined : editingMenu.imageThumbUrl');
    expect(managementSource).toContain('imageThumbStoragePath: selectedImageFile ? undefined : editingMenu.imageThumbStoragePath');
    expect(managementSource).toContain('processAndUploadMenuImage(menuIdForSave, selectedImageFile)');
    expect(managementSource).toContain('图片上传中...');
    expect(managementSource).not.toContain('compressMenuImage');
    expect(managementSource).not.toContain('图片处理中...');
  });

  test('stocktake active refresh is cloud-authoritative and history cache is store-scoped', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    expect(warehouseSource).toContain('setInventoryItems(normalizedCloudItems)');
    expect(warehouseSource).toContain("dataService.getStoreKey('warehouse_stocktake_history')");
    expect(warehouseSource).not.toContain("localStorage.getItem('warehouse_stocktake_history')");
    expect(warehouseSource).not.toContain("localStorage.setItem('warehouse_stocktake_history'");

    expect(fridgeSource).toContain('setFridges(normalizedFridges)');
    expect(fridgeSource).toContain('setFridgeInventory(normalizedFridgeInventory)');
    expect(fridgeSource).toContain("dataService.getStoreKey('fridge_stocktake_history')");
    expect(fridgeSource).not.toContain("localStorage.getItem('fridge_stocktake_history')");
    expect(fridgeSource).not.toContain("localStorage.setItem('fridge_stocktake_history'");
  });

  test('stocktake completion awaits cloud writes before local success state', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');
    const warehouseCompleteBlock = warehouseSource.slice(
      warehouseSource.indexOf('const completeStocktake = async'),
      warehouseSource.indexOf('const exportToCSV')
    );
    const fridgeCompleteBlock = fridgeSource.slice(
      fridgeSource.indexOf('const completeStocktake = async'),
      fridgeSource.indexOf('const moveItem')
    );

    expect(warehouseCompleteBlock).not.toContain('Promise.allSettled');
    expect(fridgeCompleteBlock).not.toContain('Promise.allSettled');
    expect(warehouseCompleteBlock).toContain("await Promise.all(updatedItems.map(item => smartUpdateDocument('inventory_items', item.id, item)))");
    expect(fridgeCompleteBlock).toContain("updatedFridgeRecords.map(inv => smartUpdateDocument('fridge_inventory', inv.id || `${inv.fridgeId}-${inv.itemId}`, inv))");
    expect(warehouseCompleteBlock).toContain("await smartAddDocument('warehouse_stocktake_history', stocktakeRecord)");
    expect(fridgeCompleteBlock).toContain("recordsToSave.map(record => smartAddDocument('fridge_stocktake_history', record))");
    expect(warehouseCompleteBlock.indexOf("await smartAddDocument('warehouse_stocktake_history', stocktakeRecord)")).toBeLessThan(
      warehouseCompleteBlock.indexOf('cacheStocktakeHistory([stocktakeRecord, ...history])')
    );
    expect(fridgeCompleteBlock.indexOf("recordsToSave.map(record => smartAddDocument('fridge_stocktake_history', record))")).toBeLessThan(
      fridgeCompleteBlock.indexOf('cacheStocktakeHistory([...recordsToSave, ...history])')
    );
  });

  test('stocktake completion buttons block duplicate submits while cloud writes are pending', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    [warehouseSource, fridgeSource].forEach(source => {
      const completeBlock = source.slice(
        source.indexOf('const completeStocktake = async'),
        source.indexOf('const exportToCSV') > -1 ? source.indexOf('const exportToCSV') : source.indexOf('const moveItem')
      );
      const buttonStart = source.indexOf('onClick={completeStocktake}');
      const buttonBlock = source.slice(buttonStart, source.indexOf('</button>', buttonStart));

      expect(source).toContain('const [isStocktakeSubmitting, setIsStocktakeSubmitting] = useState(false)');
      expect(source).toContain('const isStocktakeSubmittingRef = useRef(false)');
      expect(completeBlock).toContain('if (isStocktakeSubmittingRef.current) {');
      expect(completeBlock).toContain('isStocktakeSubmittingRef.current = true;');
      expect(completeBlock).toContain('setIsStocktakeSubmitting(true);');
      expect(completeBlock).toContain('finally {');
      expect(completeBlock).toContain('isStocktakeSubmittingRef.current = false;');
      expect(completeBlock).toContain('setIsStocktakeSubmitting(false);');
      expect(buttonBlock).toContain('disabled={isStocktakeSubmitting}');
      expect(buttonBlock).toContain("cursor: isStocktakeSubmitting ? 'not-allowed' : 'pointer'");
      expect(buttonBlock).toContain("isStocktakeSubmitting ? '处理中...' :");
    });
  });

  test('fridge stocktake completion submits only the selected fridge', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeStocktake = async'),
      source.indexOf('const moveItem')
    );

    expect(source).toContain('const getFridgeQuantityKey = (fridgeId: string, itemId: string) =>');
    expect(completeBlock).toContain('const stocktakeFridgeItems = fridgeInventory');
    expect(completeBlock).toContain('.filter(inv => inv.fridgeId === selectedFridge)');
    expect(completeBlock).toContain('buildFridgeStocktakeHistoryRecords({');
    expect(completeBlock).toContain('cacheStocktakeHistory([...recordsToSave, ...history])');
    expect(completeBlock).not.toContain('const allFridgeItems = fridgeInventory.map');
    expect(completeBlock).not.toContain('actualQuantities[item.itemId]');
    expect(completeBlock).not.toContain('actualQuantities[inv.itemId]');
    expect(completeBlock).toContain('actualQuantities[getFridgeQuantityKey(selectedFridge, item.itemId)]');
    expect(completeBlock).toContain('inv.fridgeId === selectedFridge && actualQuantities[getFridgeQuantityKey(inv.fridgeId, inv.itemId)] !== undefined');
    expect(source).not.toContain('setActualQuantities(initial)');
  });

  test('fridge stocktake keeps a compact header so the item list has room', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const renderBlock = source.slice(
      source.indexOf('// 渲染'),
      source.indexOf('{showAddFridgeModal &&')
    );

    expect(renderBlock).toContain("padding: '0.75rem'");
    expect(renderBlock).toContain("gap: '0.5rem'");
    expect(renderBlock).toContain("fontSize: '1.1rem'");
    expect(renderBlock).toContain("padding: '0.38rem 0.68rem'");
    expect(renderBlock).toContain("gridTemplateColumns: 'minmax(180px, 1fr) auto auto'");
    expect(renderBlock).toContain('flex: 1, minHeight: 0');
    expect(renderBlock).not.toContain("padding: '1.5rem'");
    expect(renderBlock).not.toContain("gap: '1rem'");
  });

  test('stocktake history modal refreshes cloud history and keeps local date keys', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    expect(warehouseSource).toContain("smartGetDocuments('warehouse_stocktake_history', true)");
    expect(fridgeSource).toContain("smartGetDocuments('fridge_stocktake_history', true)");
    expect(warehouseSource).toContain('normalizeStocktakeHistoryForRefresh(cloudHistory)');
    expect(fridgeSource).toContain('normalizeStocktakeHistoryForRefresh(cloudHistory)');
    expect(warehouseSource).toContain('const openHistoryModal = async');
    expect(fridgeSource).toContain('const openHistoryModal = async');
    expect(warehouseSource).toContain('getStocktakeRecordDateKey(record)');
    expect(fridgeSource).toContain('getStocktakeRecordDateKey(record)');
    expect(warehouseSource).not.toContain('getLocalDateString(new Date(record.date))');
    expect(fridgeSource).not.toContain('getLocalDateString(new Date(record.date))');

    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    expect(rules).toContain('match /stores/{storeId}/warehouse_stocktake_history/{historyId}');
    expect(rules).toContain('match /stores/{storeId}/fridge_stocktake_history/{historyId}');
  });

  test('stocktake corrections write audited adjustment records and backup coverage', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const backupPath = path.join(process.cwd(), 'src/services/backupExportService.ts');
    const auditPath = path.join(process.cwd(), 'scripts/auditInventoryLifecycle.mjs');
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const inventorySource = fs.readFileSync(inventoryPath, 'utf8');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');
    const backupSource = fs.readFileSync(backupPath, 'utf8');
    const auditSource = fs.readFileSync(auditPath, 'utf8');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    expect(inventorySource).toContain("smartGetDocuments('inventory_stock_records', true)");
    expect(inventorySource).toContain('setStockRecords(sortedRecords)');
    expect(warehouseSource).toContain("smartAddDocument('inventory_stock_records', record)");
    expect(warehouseSource).toContain("source: 'warehouse_stocktake'");
    expect(fridgeSource).toContain("smartAddDocument('inventory_stock_records', record)");
    expect(fridgeSource).toContain("source: 'fridge_stocktake'");
    expect(backupSource).toContain("'inventory_stock_records'");
    expect(auditSource).toContain("getRows(`stores/${storeId}/inventory_stock_records`)");
    expect(rules).toContain('match /stores/{storeId}/inventory_stock_records/{recordId}');
  });

  test('stocktake history print uses modal content instead of hiding the React root', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    expect(warehouseSource).toContain("printStocktakeHistory('warehouse-stocktake-print')");
    expect(fridgeSource).toContain("printStocktakeHistory('fridge-stocktake-print')");
    expect(warehouseSource).not.toContain('body > *:not(.print-container)');
    expect(fridgeSource).not.toContain('body > *:not(.print-container)');
    expect(warehouseSource).not.toContain('onClick={() => window.print()}');
    expect(fridgeSource).not.toContain('onClick={() => window.print()}');
  });

  test('fridge creation waits for deterministic cloud write before local state update', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const addFridgeBlock = source.slice(source.indexOf('const handleAddFridge = async'), source.indexOf('// 缂傛牞绶崘鎵唸'));

    expect(source).toContain('smartSetDocument');
    expect(addFridgeBlock).toContain("await smartSetDocument('fridges', newFridge.id, newFridge)");
    expect(addFridgeBlock.indexOf("await smartSetDocument('fridges', newFridge.id, newFridge)")).toBeLessThan(
      addFridgeBlock.indexOf('setFridges([...fridges, newFridge])')
    );
    expect(addFridgeBlock).not.toContain("smartAddDocument('fridges', newFridge)");
  });

  test('fridge edit and delete wait for deterministic cloud writes before local state updates', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const editBlock = source.slice(
      source.indexOf('const handleEditFridge = async'),
      source.indexOf('const handleDeleteFridge = async')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteFridge = async'),
      source.indexOf('const handleSimpleTransfer')
    );

    expect(editBlock).toContain("await smartSetDocument('fridges', editingFridge.id, updatedFridge)");
    expect(editBlock.indexOf("await smartSetDocument('fridges', editingFridge.id, updatedFridge)")).toBeLessThan(
      editBlock.indexOf('setFridges(fridges.map')
    );
    expect(editBlock).not.toContain("smartUpdateDocument('fridges', editingFridge.id");

    expect(deleteBlock).toContain("await smartDeleteDocument('fridges', fridge.id)");
    expect(deleteBlock).toContain("return smartDeleteDocument('fridge_inventory', recordId)");
    expect(deleteBlock.indexOf("await smartDeleteDocument('fridges', fridge.id)")).toBeLessThan(
      deleteBlock.indexOf('setFridges(fridges.filter')
    );
    expect(deleteBlock.indexOf("return smartDeleteDocument('fridge_inventory', recordId)")).toBeLessThan(
      deleteBlock.indexOf('setFridgeInventory(fridgeInventory.filter')
    );
    expect(deleteBlock).not.toContain('recordsToDelete.forEach');
  });

  test('fridge transfer and add-item flows wait for cloud stock writes before local state updates', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const transferBlock = source.slice(
      source.indexOf('const handleSimpleTransfer = async'),
      source.indexOf('const handleAddNewItem = async')
    );
    const addItemBlock = source.slice(
      source.indexOf('const handleAddNewItem = async'),
      source.indexOf('const completeStocktake = async')
    );

    expect(source).toContain('const handleSimpleTransfer = async');
    expect(source).toContain('const handleAddNewItem = async');
    expect(transferBlock).toContain('await smartTransferFridgeStock({');
    expect(transferBlock).not.toContain("await smartIncrementField('inventory_items', item.id");
    expect(transferBlock).not.toContain("await smartIncrementField('fridge_inventory', fridgeInventoryId");
    expect(transferBlock.indexOf('await smartTransferFridgeStock({')).toBeLessThan(
      transferBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(transferBlock.indexOf('await smartTransferFridgeStock({')).toBeLessThan(
      transferBlock.indexOf('setFridgeInventory(inv =>')
    );
    expect(transferBlock).not.toContain('.catch(error =>');

    expect(addItemBlock).toContain("await smartIncrementField('inventory_items', item.id");
    expect(addItemBlock).toContain("await smartIncrementField('fridge_inventory', fridgeInventoryId");
    expect(addItemBlock.indexOf("await smartIncrementField('inventory_items', item.id")).toBeLessThan(
      addItemBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(addItemBlock.indexOf("await smartIncrementField('fridge_inventory', fridgeInventoryId")).toBeLessThan(
      addItemBlock.indexOf('setFridgeInventory(inv =>')
    );
    expect(addItemBlock).not.toContain('.catch(error =>');
  });

  test('fridge transfer writes one audited transaction instead of split increments', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const transferBlock = fridgeSource.slice(
      fridgeSource.indexOf('const handleSimpleTransfer = async'),
      fridgeSource.indexOf('const handleAddNewItem = async')
    );

    expect(fridgeSource).toContain('smartTransferFridgeStock');
    expect(transferBlock).toContain('isTransferSubmittingRef.current');
    expect(transferBlock).toContain('setIsTransferSubmitting(true)');
    expect(transferBlock).toContain('await smartTransferFridgeStock({');
    expect(transferBlock).not.toContain("await smartIncrementField('inventory_items', item.id");
    expect(transferBlock).not.toContain("await smartIncrementField('fridge_inventory', fridgeInventoryId");
    expect(syncSource).toContain('export const smartTransferFridgeStock');
    expect(syncSource).toContain("doc(db, `${basePath}/stock_transfer_records`, operationId)");
    expect(syncSource).toContain("if (direction === 'warehouse_to_fridge' && warehouseStock < quantity)");
    expect(syncSource).toContain("if (direction === 'fridge_to_warehouse' && fridgeStock < quantity)");
    expect(syncSource).toContain('transaction.set(transferRef');
    expect(syncSource).toContain("doc(db, `${basePath}/inventory_stock_records`, `${operationId}-warehouse`)");
    expect(syncSource).toContain("doc(db, `${basePath}/inventory_stock_records`, `${operationId}-fridge`)");
    expect(syncSource).toContain("source: 'fridge_transfer'");
    expect(syncSource).toContain("direction === 'warehouse_to_fridge' ? '仓库调拨到冰箱' : '冰箱退回仓库'");
    expect(syncSource).toContain('operator: getCurrentOperatorName()');
    expect(syncSource).not.toContain("'warehouse to fridge'");
    expect(syncSource).not.toContain("'fridge to warehouse'");
    expect(syncSource).toContain("transaction.set(warehouseStockRecordRef");
    expect(syncSource).toContain("transaction.set(fridgeStockRecordRef");
  });

  test('fridge transfer attempts cloud transaction instead of trusting cached offline flag', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const transferServiceBlock = syncSource.slice(
      syncSource.indexOf('export const smartTransferFridgeStock'),
      syncSource.indexOf('export const smartClaimOrderStockDeduction')
    );

    expect(transferServiceBlock).toContain('export const smartTransferFridgeStock');
    expect(transferServiceBlock).toContain('withWeakNetworkTimeout(() => runTransaction');
    expect(transferServiceBlock).toContain('FRIDGE_TRANSFER_TIMEOUT_MS');
    expect(transferServiceBlock).not.toContain("error: 'offline-transfer-disabled'");
    expect(transferServiceBlock).not.toContain('if (!isOnline || !FIRESTORE_ENABLED)');
  });

  test('fridge transfer queues a pending transfer order for true weak-network offline work', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const transferServiceBlock = syncSource.slice(
      syncSource.indexOf('export const smartTransferFridgeStock'),
      syncSource.indexOf('export const smartClaimOrderStockDeduction')
    );
    const pendingSyncBlock = syncSource.slice(
      syncSource.indexOf('export const syncPendingChanges = async () => {'),
      syncSource.indexOf('// ==================== 鍒嗗簵鏁版嵁闅旂')
    );

    expect(transferServiceBlock).toContain('allowPendingFallback = true');
    expect(transferServiceBlock).toContain('fallbackToPendingFridgeTransfer');
    expect(transferServiceBlock).toContain('pendingCloudSync: true');
    expect(transferServiceBlock).toContain('__fridgeTransfer');
    expect(transferServiceBlock).toContain('return {');
    expect(transferServiceBlock).toContain('pending: true');
    expect(pendingSyncBlock).toContain('change.data?.__fridgeTransfer');
    expect(pendingSyncBlock).toContain('allowPendingFallback: false');
    expect(pendingSyncBlock).toContain('throw new Error(`pending-fridge-transfer-failed');
  });

  test('fridge transfer records are visible with time search and stocktake history uses a large modal', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');

    expect(source).toContain('showTransferHistoryModal');
    expect(source).toContain("smartGetDocuments('stock_transfer_records', true)");
    expect(source).toContain('formatTransferRecordTime(record)');
    expect(source).toContain('openTransferHistoryModal');
    expect(source).toContain('beforeWarehouseStock');
    expect(source).toContain('afterWarehouseStock');
    expect(source).toContain('beforeFridgeStock');
    expect(source).toContain('afterFridgeStock');
    expect(source).toContain("width: '96vw'");
    expect(source).toContain("maxWidth: '1320px'");
    expect(source).toContain("height: '90vh'");
  });

  test('stocktake history tables expand with content instead of using small nested scrollers', () => {
    const warehousePath = path.join(process.cwd(), 'src/pages/Inventory/WarehouseStocktake.tsx');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const warehouseSource = fs.readFileSync(warehousePath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    [warehouseSource, fridgeSource].forEach(source => {
      const historyModalBlock = source.slice(
        source.indexOf('{showHistoryModal && (() => {'),
        source.indexOf('// 打印样式')
      );

      expect(historyModalBlock).toContain("width: '96vw'");
      expect(historyModalBlock).toContain("maxWidth: '1320px'");
      expect(historyModalBlock).toContain("height: '90vh'");
      expect(historyModalBlock).toContain("overflowY: 'auto', minHeight: 0");
      expect(historyModalBlock).toContain("overflowX: 'auto'");
      expect(historyModalBlock).not.toContain("maxHeight: '300px'");
      expect(historyModalBlock).not.toContain("maxHeight: 'calc(80vh - 120px)'");
    });
  });

  test('fridge transfer audit records are allowed by firestore rules and permission errors are explicit', () => {
    const rulesPath = path.join(process.cwd(), '..', 'firestore.rules');
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const rulesSource = fs.readFileSync(rulesPath, 'utf8');
    const syncSource = fs.readFileSync(syncPath, 'utf8');
    const fridgeSource = fs.readFileSync(fridgePath, 'utf8');

    expect(rulesSource).toContain('match /stores/{storeId}/stock_transfer_records/{recordId}');
    expect(rulesSource).toContain('allow write: if canManageInventory(storeId);');
    expect(syncSource).toContain("error: 'permission-denied'");
    expect(fridgeSource).toContain("transferError === 'permission-denied'");
  });

  test('fridge item category filter and ordering are cloud-safe', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const moveBlock = source.slice(
      source.indexOf("const moveItem = async"),
      source.indexOf('const exportToCSV')
    );

    expect(source).toContain("import { canItemEnterFridge, resolveFridgeItemOrder } from '../../utils/fridgeInventory'");
    expect(source).toContain('canItemEnterFridge(item, inventoryCategories)');
    expect(source).not.toContain("item.category === 'beverage' || item.category === 'alcohol'");
    expect(source).toContain('resolveFridgeItemOrder(fridgeItems');
    expect(moveBlock).toContain("await Promise.all(");
    expect(moveBlock).toContain("smartUpdateDocument('fridge_inventory', record.id, record)");
    expect(moveBlock.indexOf("await Promise.all(")).toBeLessThan(
      moveBlock.indexOf('setItemOrder(newOrder)')
    );
  });

  test('fridge stocktake enters with a valid fridge and one cloud refresh without realtime subscription', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');

    expect(source).toContain('const hasAutoRefreshed = useRef(false)');
    expect(source).toContain('const refreshFridgeData = async (showFailureAlert = true)');
    expect(source).toContain('if (showFailureAlert)');
    expect(source).toContain('refreshFridgeData(false)');
    expect(source).toContain('if (fridges.length > 0 && !fridges.some((fridge: any) => fridge.id === selectedFridge))');
    expect(source).toContain('setSelectedFridge(fridges[0].id)');
    expect(source).not.toContain("smartSubscribeToCollection('fridge_inventory'");
  });

  test('inventory category order is saved as cloud sortOrder', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain('sortOrder?: number');
    expect(source).toContain('const saveInventoryCategoryOrder = React.useCallback');
    expect(source).toContain('sortOrder: index');
    expect(source).toContain('await Promise.all(orderedCategories.map(category => saveInventoryCategoryToCloud(category)))');
    expect(source).toContain('await saveInventoryCategoryOrder(nextCategories)');
    expect(source).toContain("return botCategories.includes(normalizedKey) || botCategories.includes(normalizedName) ? 'BOT' : 'lb'");
    expect(source).toContain("const botCategories = ['alcohol', 'beverage', 'cerveza', 'bebida', 'jugo', 'jugos']");
  });

  test('fridge remove-item flow waits for warehouse return and fridge delete before local state updates', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const removeStart = source.indexOf('const fridgeInventoryId = `${selectedFridge}-${item.itemId}`;');
    const removeBlock = source.slice(removeStart, source.indexOf('title=', removeStart));

    expect(removeBlock).toContain("await smartIncrementField('inventory_items', item.itemId");
    expect(removeBlock).toContain("await smartDeleteDocument('fridge_inventory', fridgeInventoryId)");
    expect(removeBlock.indexOf("await smartIncrementField('inventory_items', item.itemId")).toBeLessThan(
      removeBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(removeBlock.indexOf("await smartDeleteDocument('fridge_inventory', fridgeInventoryId)")).toBeLessThan(
      removeBlock.indexOf('setFridgeInventory(inv => inv.filter')
    );
    expect(removeBlock).not.toContain('.catch(error =>');
  });

  test('employee refresh persists deletion tombstones and delete writes are single-document', () => {
    const employeesPath = path.join(process.cwd(), 'src/pages/Employees/Employees.tsx');
    const employeeListPath = path.join(process.cwd(), 'src/pages/Employees/EmployeeList.tsx');
    const employeesSource = fs.readFileSync(employeesPath, 'utf8');
    const employeeListSource = fs.readFileSync(employeeListPath, 'utf8');
    const saveBlock = employeeListSource.slice(
      employeeListSource.indexOf('const handleSaveEmployee = async () => {'),
      employeeListSource.indexOf('const handleDeleteEmployee = async')
    );

    expect(employeesSource).toContain("smartGetDocuments('employees', true)");
    expect(employeesSource).toContain("smartGetDocuments('employee_deletions', true)");
    expect(employeesSource).toContain("saveLocalCollection('employee_deletions', employeeDeletionsData)");
    expect(saveBlock.indexOf("await smartUpdateDocument('employees', employee.id, employee)")).toBeLessThan(
      saveBlock.indexOf('setEmployees(updatedEmployees)')
    );
    expect(saveBlock.indexOf("await smartAddDocument('employees', employee)")).toBeLessThan(
      saveBlock.indexOf('setEmployees(updatedEmployees)')
    );
    expect(employeeListSource).toContain("smartUpdateDocument('employees', id, deletedEmployee)");
    expect(employeeListSource).toContain("smartUpdateDocument('employee_deletions', id");
    expect(employeeListSource).toContain("dataManager.saveData('employees', activeEmployees");
    expect(employeeListSource).toContain('syncFirestore: false');
    expect(employeeListSource).not.toContain('employee marked deleted in Firestore');
  });

  test('attendance changes use awaited deterministic single-document writes', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');

    expect(source).toContain("import { smartSetDocument }");
    expect(source).toContain('const handleCheckIn = async');
    expect(source).toContain('const handleQuickMark = async');
    expect(source).toContain("await smartSetDocument('attendance_records', recordToSave.id, recordToSave)");
    expect(source).not.toContain("smartAddDocument('attendance_records'");
    expect(source).not.toContain("smartUpdateDocument('attendance_records'");
  });

  test('attendance check-in uses the selected attendance date and can fill records without check-in', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');
    const checkInBlock = source.slice(
      source.indexOf('const handleCheckIn = async'),
      source.indexOf('const calculateWorkHours')
    );

    expect(checkInBlock).toContain('const attendanceDate = selectedDate || getLocalDateString(now)');
    expect(checkInBlock).toContain('r.employeeId === employeeId && r.date === attendanceDate');
    expect(checkInBlock).toContain("if (type === 'in' && existingRecord.checkIn)");
    expect(checkInBlock).toContain('checkIn: type === \'in\' ? timeStr : existingRecord.checkIn');
    expect(checkInBlock).toContain('id: `${employeeId}-${attendanceDate}`');
    expect(checkInBlock).not.toContain('const today = getLocalDateString(now)');
    expect(checkInBlock).not.toContain("alert('宸茬粡鎵撹繃涓婄彮鍗′簡");
  });

  test('attendance employee printout is A4 single-page friendly for 15 days', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');
    const printBlock = source.slice(
      source.indexOf('const printEmployeeAttendance ='),
      source.indexOf('const styles =')
    );

    expect(printBlock).toContain('const printableRecords = employeeRecords;');
    expect(printBlock).toContain('r.date >= printStartDate && r.date <= printEndDate');
    expect(printBlock).toContain('@page { size: A4 portrait; margin: 9mm; }');
    expect(printBlock).toContain('class="print-sheet"');
    expect(printBlock).toContain('grid-template-columns: repeat(6, 1fr)');
    expect(printBlock).toContain('Una hoja A4 imprime maximo 15 dias');
    expect(printBlock).toContain('Ultimos ${printableRecords.length} dias / Total ${employeeRecords.length}');
    expect(printBlock).toContain('Registro de Asistencia');
    expect(printBlock).toContain('Detalle de Asistencia');
    expect(printBlock).toContain("toLocaleDateString('es-NI')");
    expect(printBlock).toContain('page-break-after: always');
    expect(printBlock).not.toContain('${employeeRecords.map(record =>');
    expect(printBlock).not.toContain('position: sticky');
    expect(printBlock).not.toContain('员工考勤记录');
    expect(printBlock).not.toContain('详细考勤记录');
  });

  test('attendance management navigation and action buttons use Spanish labels', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');

    expect(layoutSource).toContain("{ path: '/employees/attendance', icon: 'AT', label: 'Asistencia' }");
    expect(layoutSource).not.toContain("label: '考勤管理'");
    expect(source).toContain('Marcar asistencia');
    expect(source).toContain('Registro de asistencia');
    expect(source).toContain('Marcar entrada');
    expect(source).toContain('Entrada marcada');
    expect(source).toContain('Marcar salida');
    expect(source).toContain('Salida marcada');
    expect(source).toContain('Imprimir asistencia');
    expect(source).toContain('Guardar asistencia fallo, revise la red e intente otra vez');
    expect(source).toContain('Guardar correccion de asistencia fallo:');
    ['鉁?', '馃槾', '鉂?', '馃枿', '鈴?', '馃搵', '淇濆瓨鑰冨嫟'].forEach(mojibake => {
      expect(source).not.toContain(mojibake);
    });
    expect(source).not.toContain('上班打卡');
    expect(source).not.toContain('下班打卡');
    expect(source).not.toContain('已上班');
    expect(source).not.toContain('已下班');
    expect(source).not.toContain('打印考勤记录');
  });

  test('attendance quick rest and absent marks are click-locked and use deterministic daily ids', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');
    const quickMarkBlock = source.slice(
      source.indexOf("const handleQuickMark = async (employeeId: string, status: 'rest' | 'absent') =>"),
      source.indexOf('const printEmployeeAttendance =')
    );

    expect(source).toContain('const attendanceActionLocksRef = useRef<Set<string>>(new Set());');
    expect(source).toContain('const lockAttendanceAction = (key: string) =>');
    expect(source).toContain('const unlockAttendanceAction = (key: string) =>');
    expect(quickMarkBlock).toContain('const actionKey = `${employeeId}-${today}-${status}`;');
    expect(quickMarkBlock).toContain('if (!lockAttendanceAction(actionKey))');
    expect(quickMarkBlock).toContain('id: `${employeeId}-${today}`');
    expect(quickMarkBlock).toContain('unlockAttendanceAction(actionKey);');
    expect(quickMarkBlock).not.toContain('id: Date.now().toString()');
    expect(source).toContain('const quickMarkLocked = Boolean(todayRecord) || restPending || absentPending;');
    expect(source).toContain('disabled={quickMarkLocked}');
  });

  test('employee loan and salary settlement wait for cloud writes before local state updates', () => {
    const loanPath = path.join(process.cwd(), 'src/pages/Employees/LoanManagement.tsx');
    const salaryPath = path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx');
    const loanSource = fs.readFileSync(loanPath, 'utf8');
    const salarySource = fs.readFileSync(salaryPath, 'utf8');
    const addLoanBlock = loanSource.slice(
      loanSource.indexOf('const handleAddLoan = async () => {'),
      loanSource.indexOf('const styles = {')
    );
    const salaryBlock = salarySource.slice(
      salarySource.indexOf('const handleSingleSettlement = async'),
      salarySource.indexOf('const handleBatchSettlement')
    );

    expect(addLoanBlock.indexOf("await smartAddDocument('loan_records', newLoan)")).toBeLessThan(
      addLoanBlock.indexOf('setLoanRecords(updated)')
    );
    expect(addLoanBlock.indexOf("await smartAddDocument('expenses', newExpense)")).toBeLessThan(
      addLoanBlock.indexOf('setLoanExpenseRecords(records =>')
    );
    expect(addLoanBlock.indexOf('await recordCashFlow({')).toBeLessThan(
      addLoanBlock.indexOf('setLoanRecords(updated)')
    );
    expect(loanSource).not.toContain('console.log');
    expect(salaryBlock.indexOf("await smartAddDocument('salary_records', salaryRecord)")).toBeLessThan(
      salaryBlock.indexOf('setSalaryRecords(records =>')
    );
    expect(salaryBlock.indexOf("await smartAddDocument('expenses', salaryExpense)")).toBeLessThan(
      salaryBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(salaryBlock.indexOf("smartUpdateDocument('loan_records', loan.id, loan)")).toBeLessThan(
      salaryBlock.indexOf('setLoanRecords(updatedLoans)')
    );
    expect(salarySource).not.toContain('console.log');
    expect(salaryBlock).not.toContain("console.error('鍚屾鍊熸鎵ｅ噺璁板綍澶辫触:'");
    expect(salaryBlock).not.toContain("console.error('鉂?鍚屾宸ヨ祫缁撶畻璁板綍澶辫触:'");
  });

  test('employee module refreshes only employee loan expenses before filtering active loans', () => {
    const employeesPath = path.join(process.cwd(), 'src/pages/Employees/Employees.tsx');
    const employeesSource = fs.readFileSync(employeesPath, 'utf8');
    const loadBlock = employeesSource.slice(
      employeesSource.indexOf('const loadEmployeeModuleData = useCallback(async () => {'),
      employeesSource.indexOf('useEffect(() => {', employeesSource.indexOf('const loadEmployeeModuleData = useCallback'))
    );

    expect(loadBlock).toContain('loanExpenseData');
    expect(loadBlock).toContain("smartGetDocumentsWhereEqual('expenses', 'relatedType', 'loan', true, 'employee_loan_expenses')");
    expect(loadBlock).toContain("smartGetDocumentsWhereEqual('expenses', 'categoryId', 'employee_loan', true, 'employee_loan_expenses')");
    expect(loadBlock).not.toContain("smartGetDocuments('expenses', true)");
    expect(loadBlock).not.toContain("dataManager.saveData('expenses'");
  });

  test('employee module refresh does not duplicate large expenses cache or fail on auxiliary cache writes', () => {
    const employeesSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Employees/Employees.tsx'), 'utf8');
    const saveHelperBlock = employeesSource.slice(
      employeesSource.indexOf('const saveLocalCollection = (collectionName: string, records: any[]) => {'),
      employeesSource.indexOf('const EmployeesModule: React.FC')
    );
    const loadBlock = employeesSource.slice(
      employeesSource.indexOf('const loadEmployeeModuleData = useCallback(async () => {'),
      employeesSource.indexOf('useEffect(() => {', employeesSource.indexOf('const loadEmployeeModuleData = useCallback'))
    );

    expect(loadBlock).not.toContain("await dataManager.saveData('expenses',");
    expect(loadBlock).not.toContain("saveLocalCollection('expenses', expensesData)");
    expect(loadBlock).toContain("removeLocalCollection('expenses')");
    expect(saveHelperBlock).toContain('try {');
    expect(saveHelperBlock).toContain('localStorage.setItem');
    expect(saveHelperBlock).toContain('catch {');
  });

  test('employee loan and salary screens use scoped loan expenses instead of the full expense cache', () => {
    const loanSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Employees/LoanManagement.tsx'), 'utf8');
    const salarySource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx'), 'utf8');

    expect(loanSource).toContain('loanExpenseRecords');
    expect(salarySource).toContain('loanExpenseRecords');
    expect(loanSource).not.toContain("dataManager.getData('expenses')");
    expect(salarySource).not.toContain("getVisibleLoanRecords(loanRecords, dataManager.getData('expenses'))");
  });

  test('salary batch settlement awaits each employee and uses deterministic salary and expense ids', () => {
    const salaryPath = path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx');
    const source = fs.readFileSync(salaryPath, 'utf8');
    const batchBlock = source.slice(
      source.indexOf('const handleBatchSettlement = async () => {'),
      source.indexOf('// 打印薪资单')
    );

    expect(source).toContain('const getSalaryRecordId = (employeeId: string, startDate: string, endDate: string) =>');
    expect(source).toContain('const getSalaryExpenseId = (salaryRecordId: string) =>');
    expect(source).toContain('id: getSalaryRecordId(employee.id, startDate, endDate)');
    expect(source).toContain('id: getSalaryExpenseId(salaryRecord.id)');
    expect(batchBlock).toContain('for (const emp of activeEmployees)');
    expect(batchBlock).toContain('await handleSingleSettlement(emp.id, period, { showSlip: false })');
    expect(batchBlock).not.toContain('activeEmployees.forEach');
    expect(source).not.toContain('id: Date.now().toString()');
    expect(source).not.toContain('id: `salary_${Date.now()}`');
  });

  test('salary settlement marks attendance records as settled and exposes attendance state setter', () => {
    const employeesPath = path.join(process.cwd(), 'src/pages/Employees/Employees.tsx');
    const employeesSource = fs.readFileSync(employeesPath, 'utf8');
    const salaryPath = path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx');
    const salarySource = fs.readFileSync(salaryPath, 'utf8');

    expect(employeesSource).toContain('setAttendanceRecords={setAttendanceRecords}');
    expect(salarySource).toContain('setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>');
    expect(salarySource).toContain('settledSalaryId?: string');
    expect(salarySource).toContain('const markAttendanceRecordsSettled = async (employeeId: string, startDate: string, endDate: string, salaryRecordId: string)');
    expect(salarySource).toContain('settledSalaryId: salaryRecordId');
    expect(salarySource).toContain("await Promise.all(recordsToSettle.map(record => smartSetDocument('attendance_records', record.id, record)))");
    expect(salarySource).toContain('setAttendanceRecords(nextAttendanceRecords)');
  });

  test('salary history displays real date ranges instead of half-month period labels', () => {
    const salaryPath = path.join(process.cwd(), 'src/pages/Employees/SalarySettlement.tsx');
    const source = fs.readFileSync(salaryPath, 'utf8');
    const historyStart = source.indexOf('filteredSalaryRecords.length === 0');
    const historyBlock = source.slice(
      historyStart,
      source.indexOf('</tbody>', historyStart)
    );

    expect(historyBlock).toContain('{record.startDate} - {record.endDate}');
    expect(source).toContain('const [salaryHistoryStartDate, setSalaryHistoryStartDate] = useState(getLocalDateString(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)))');
    expect(source).toContain('const [salaryHistoryEndDate, setSalaryHistoryEndDate] = useState(getLocalDateString())');
    expect(source).toContain('const filteredSalaryRecords = salaryRecords.filter(record => record.endDate >= salaryHistoryStartDate && record.startDate <= salaryHistoryEndDate)');
    expect(historyBlock).toContain('filteredSalaryRecords.slice().reverse().map');
    expect(historyBlock).not.toContain('record.periodType ===');
    expect(historyBlock).not.toContain('上半月');
    expect(historyBlock).not.toContain('下半月');
  });

  test('attendance print uses selected date range instead of always slicing the last records', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');

    expect(source).toContain('const getCurrentMonthAttendanceDefaultRange = useCallback((records: AttendanceRecord[] = attendanceRecords) =>');
    expect(source).toContain('const hasSettledFirstHalf = today >= secondHalfStart && records.some(record =>');
    expect(source).toContain('record.settledSalaryId');
    expect(source).toContain('startDate: hasSettledFirstHalf ? secondHalfStart : monthStart');
    expect(source).toContain('const attendanceRangeTouchedRef = useRef(false)');
    expect(source).toContain('const handlePrintStartDateChange = (value: string) =>');
    expect(source).toContain('const handlePrintEndDateChange = (value: string) =>');
    expect(source).not.toContain('Date.now() - 14 * 24 * 60 * 60 * 1000');
    expect(source).toContain('const [printEndDate, setPrintEndDate] = useState(getLocalDateString())');
    expect(source).toContain('r.date >= printStartDate && r.date <= printEndDate');
    expect(source).toContain('const printableRecords = employeeRecords');
    expect(source).not.toContain('employeeRecords.slice(-15)');
  });

  test('attendance management can repair missed or incorrect punch times with deterministic records', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');

    expect(source).toContain('const [repairForm, setRepairForm] = useState');
    expect(source).toContain('const openRepairAttendance = (employeeId: string) =>');
    expect(source).toContain('const saveAttendanceRepair = async () =>');
    expect(source).toContain('id: `${repairForm.employeeId}-${repairForm.date}`');
    expect(source).toContain('workHours: calculateWorkHours(repairForm.checkIn, repairForm.checkOut)');
    expect(source).toContain("await smartSetDocument('attendance_records', recordToSave.id, recordToSave)");
    expect(source).toContain('setAttendanceRecords(updatedRecords)');
    expect(source).toContain('Corregir hora');
  });

  test('attendance repair is limited to manager-level roles', () => {
    const attendancePath = path.join(process.cwd(), 'src/pages/Employees/AttendanceManagement.tsx');
    const source = fs.readFileSync(attendancePath, 'utf8');
    const openRepairBlock = source.slice(
      source.indexOf('const openRepairAttendance = (employeeId: string) =>'),
      source.indexOf('const saveAttendanceRepair = async () =>')
    );
    const saveRepairBlock = source.slice(
      source.indexOf('const saveAttendanceRepair = async () =>'),
      source.indexOf('// 快速标记考勤状态')
    );

    expect(source).toContain("import { useAuth } from '../../contexts/AuthContext'");
    expect(source).toContain("const canRepairAttendance = user?.role === 'store_manager' || user?.role === 'super_admin'");
    expect(openRepairBlock).toContain('if (!canRepairAttendance)');
    expect(saveRepairBlock).toContain('if (!canRepairAttendance)');
    expect(source).toContain('{canRepairAttendance && (');
  });

  test('shift handover drafts and history use store-scoped local storage', () => {
    const handoverPath = path.join(process.cwd(), 'src/pages/Manager/ShiftHandover.tsx');
    const source = fs.readFileSync(handoverPath, 'utf8');

    expect(source).toContain("dataService.getStoreKey('current_inputs')");
    expect(source).toContain('localStorage.getItem(currentInputsStorageKey)');
    expect(source).toContain('localStorage.setItem(currentInputsStorageKey');
    expect(source).toContain('const [history, setHistory] = useState<HistoryRecord[]>([])');
    expect(source).toContain("smartGetDocuments('handovers', true)");
    expect(source).not.toContain("localStorage.getItem('current_inputs')");
    expect(source).not.toContain("localStorage.setItem('current_inputs'");
    expect(source).not.toContain("localStorage.getItem('rest_v6_final')");
    expect(source).not.toContain("localStorage.removeItem('rest_v6_final')");
  });

  test('shift handover submit waits for cloud write before local history update', () => {
    const handoverPath = path.join(process.cwd(), 'src/pages/Manager/ShiftHandover.tsx');
    const source = fs.readFileSync(handoverPath, 'utf8');
    const submitBlock = source.slice(
      source.indexOf('const handleSubmitHandover = async () => {'),
      source.indexOf('const resetInputs = () => {')
    );

    expect(submitBlock.indexOf("await smartAddDocument('handovers', record)")).toBeLessThan(
      submitBlock.indexOf('setHistory(newHistory)')
    );
    expect(submitBlock.indexOf("await smartAddDocument('handovers', record)")).toBeLessThan(
      submitBlock.indexOf("await dataManager.saveData('handovers', newHistory")
    );
  });

  test('POS payment and receipt service and tax labels are Spanish', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const printStart = source.indexOf('const handlePrintReceipt = async () => {');
    const printBlock = source.slice(
      printStart,
      source.indexOf('const generateOrderNumber = async () => {', printStart)
    );
    const paymentStart = source.indexOf('{/* Right: Payment Interface');
    const paymentBlock = source.slice(
      paymentStart,
      source.indexOf('{showCancelModal && renderCancelModal()}', paymentStart)
    );
    const orderSummaryStart = source.indexOf('{/* Cost Details */}');
    const orderSummaryBlock = source.slice(
      orderSummaryStart,
      source.indexOf('{discountEnabled && discountAmount > 0', orderSummaryStart)
    );
    const orderHeaderStart = source.indexOf('{/* Receipt Header */}');
    const orderHeaderBlock = source.slice(
      orderHeaderStart,
      source.indexOf('{/* Split Bill Notice */}', orderHeaderStart)
    );

    expect(paymentBlock).toContain('Servicio');
    expect(paymentBlock).toContain('IVA');
    expect(orderHeaderBlock).toContain('<span>Hora:</span>');
    expect(orderSummaryBlock).toContain('Servicio (10%)');
    expect(orderSummaryBlock).toContain('IVA (15%)');
    expect(printBlock).toContain('buildThermalReceiptHtml');
    expect(printBlock).toContain("role: 'cashier'");
    expect(printBlock).toContain('widthMm: 80');
    expect(printBlock).toContain('total: finalTotal');
    [paymentBlock, orderHeaderBlock, orderSummaryBlock, printBlock].forEach(block => {
      expect(block).not.toContain('service fee chinese label');
      expect(block).not.toContain('绋庤垂');
      expect(block).not.toContain('鏃堕棿');
      expect(block).not.toContain('閺堝秴濮熺拹');
      expect(block).not.toContain('service charge chinese label');
      expect(block).not.toContain('tax chinese label');
    });
  });

  test('POS receipt and kitchen printing use local printer roles without changing order logic', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const printerPath = path.join(process.cwd(), 'src/utils/receiptPrinter.ts');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const printerSource = fs.readFileSync(printerPath, 'utf8');
    const sendBlock = posSource.slice(
      posSource.indexOf('const handleSendToKitchen = async () => {'),
      posSource.indexOf('const paidAmount = (')
    );
    const printBlock = posSource.slice(
      posSource.indexOf('const handlePrintReceipt = async () => {'),
      posSource.indexOf('const generateOrderNumber = async () => {')
    );

    expect(printerSource).toContain("export const ESC_POS_FULL_CUT_HEX = '1D5600'");
    expect(printerSource).toContain('String.fromCharCode(0x1d, 0x56, 0x00)');
    expect(printerSource).toContain('@page { size: ${widthMm}mm auto; margin: 0; }');
    expect(printerSource).toContain('Desc. de Consumo');
    expect(printerSource).toContain('Propina Voluntaria C$');
    expect(printBlock).toContain('getCurrentStoreReceiptProfile()');
    expect(printBlock).toContain("role: 'cashier'");
    expect(printBlock).toContain('openBrowserPrintWindow(receiptHtml)');
    expect(sendBlock).toContain('buildKitchenTicketPayload');
    expect(printerSource).toContain("role: 'kitchen'");
    expect(sendBlock).toContain('printViaLocalBridge(kitchenPayload');
    expect(sendBlock).not.toContain('await printViaLocalBridge(kitchenPayload');
  });

  test('UI redesign uses shared style tokens without changing business services', () => {
    const tokensPath = path.join(process.cwd(), 'src/styles/uiTokens.ts');
    const adminUiPath = path.join(process.cwd(), 'src/styles/adminUi.ts');

    expect(fs.existsSync(tokensPath)).toBe(true);
    expect(fs.existsSync(adminUiPath)).toBe(true);

    const tokens = fs.readFileSync(tokensPath, 'utf8');
    const adminUi = fs.readFileSync(adminUiPath, 'utf8');

    expect(tokens).toContain('colors');
    expect(tokens).toContain('radii');
    expect(tokens).toContain('shadows');
    expect(adminUi).toContain('adminPageStyle');
    expect(adminUi).toContain('adminCardStyle');
  });

  test('app shell UI polish keeps permission routing intact', () => {
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const loginPath = path.join(process.cwd(), 'src/pages/Login/Login.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    const loginSource = fs.readFileSync(loginPath, 'utf8');

    expect(layoutSource).toContain('canAccessPermission');
    expect(layoutSource).toContain('shouldHideSidebar');
    expect(layoutSource).toContain('logout');
    expect(layoutSource).toContain("location.pathname === '/pos'");
    expect(layoutSource).toContain("location.pathname === '/kitchen'");
    expect(layoutSource).toContain("location.pathname === '/waiter'");
    expect(loginSource).toContain('redirectUrl');
    expect(loginSource).toContain('firebaseLogin(username, password)');
    expect(loginSource).toContain('login(loggedInUser)');
  });

  test('auth state restore revalidates role and store from Firebase before trusting local cache', () => {
    const authPath = path.join(process.cwd(), 'src/contexts/AuthContext.tsx');
    const authServicePath = path.join(process.cwd(), 'src/services/FirebaseAuthService.ts');
    const authSource = fs.readFileSync(authPath, 'utf8');
    const serviceSource = fs.readFileSync(authServicePath, 'utf8');

    expect(serviceSource).toContain('export const getFirebaseUserProfile = async');
    expect(serviceSource).toContain("status === 'inactive'");
    expect(authSource).toContain('getFirebaseUserProfile(firebaseUser)');
    expect(authSource.indexOf('getFirebaseUserProfile(firebaseUser)')).toBeLessThan(
      authSource.indexOf("localStorage.getItem('current_user')")
    );
    expect(authSource).toContain('persistAuthenticatedSession(verifiedUser)');
  });

  test('branch account switching resets active memory state without deleting store-scoped caches', () => {
    const authPath = path.join(process.cwd(), 'src/contexts/AuthContext.tsx');
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const isolationPath = path.join(process.cwd(), 'src/utils/storeSessionIsolation.ts');
    const authSource = fs.readFileSync(authPath, 'utf8');
    const appSource = fs.readFileSync(appContextPath, 'utf8');
    const isolationSource = fs.readFileSync(isolationPath, 'utf8');

    expect(authSource).toContain('persistAuthenticatedSession(userData)');
    expect(authSource).toContain('clearAuthenticatedSession()');
    expect(authSource).toContain('persistAuthenticatedSession(updatedUser)');
    expect(appSource).toContain('STORE_SESSION_CHANGED_EVENT');
    expect(appSource).toContain('window.addEventListener(STORE_SESSION_CHANGED_EVENT, checkUserAndReload)');
    expect(appSource).toContain('setOrders(Array.isArray(ordersData) ? ordersData : [])');
    expect(appSource).toContain('setOrders([])');
    expect(isolationSource).not.toContain("localStorage.clear()");
    expect(isolationSource).not.toContain("removeItem(`store_");
    expect(isolationSource).not.toContain("removeItem('store_");
  });

  test('store scoped background sync does not request global users and stores for branch users', () => {
    const dataServicePath = path.join(process.cwd(), 'src/services/DataService.ts');
    const source = fs.readFileSync(dataServicePath, 'utf8');
    const syncStoreStart = source.indexOf('async syncStoreData(storeId: string)');
    const syncStoreBlock = source.slice(syncStoreStart, source.indexOf('private async syncGlobalData', syncStoreStart));

    expect(syncStoreBlock).toContain("currentUser?.role === 'super_admin'");
    expect(syncStoreBlock).toContain('await this.syncGlobalData()');
    expect(syncStoreBlock.indexOf("currentUser?.role === 'super_admin'")).toBeLessThan(
      syncStoreBlock.indexOf('await this.syncGlobalData()')
    );
  });

  test('brand logo uses a panda graphic instead of the old React atom mark', () => {
    const logoPath = path.join(process.cwd(), 'src/logo.svg');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const loginPath = path.join(process.cwd(), 'src/pages/Login/Login.tsx');
    const logoSource = fs.readFileSync(logoPath, 'utf8');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    const loginSource = fs.readFileSync(loginPath, 'utf8');

    expect(logoSource).toContain('restaurant-pos-panda-logo');
    expect(logoSource).toContain('panda-face');
    expect(logoSource).not.toContain('#61DAFB');
    expect(layoutSource).toContain("import logo from '../../logo.svg';");
    expect(layoutSource).toContain('alt="Restaurant POS Panda"');
    expect(loginSource).toContain("import logo from '../../logo.svg';");
    expect(loginSource).toContain('alt="Restaurant POS Panda"');
  });

  test('front-of-house UI polish keeps POS waiter and kitchen data paths intact', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const menuPath = path.join(process.cwd(), 'src/components/MenuSelection.tsx');
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const kitchenPath = path.join(process.cwd(), 'src/pages/POS/KitchenDisplay.tsx');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const menuSource = fs.readFileSync(menuPath, 'utf8');
    const waiterSource = fs.readFileSync(waiterPath, 'utf8');
    const kitchenSource = fs.readFileSync(kitchenPath, 'utf8');

    expect(posSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(menuSource).toContain("import { colors, font, radii, shadows } from '../styles/uiTokens';");
    expect(waiterSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");
    expect(kitchenSource).toContain("import { colors, font, radii, shadows } from '../../styles/uiTokens';");

    expect(posSource).toContain("smartSubscribeToCollection('pos_tables'");
    expect(posSource).toContain("smartUpdateDocument('pos_orders', order.id");
    expect(posSource).toContain('completeOrderWithStockDeduction');
    expect(menuSource).toContain('MenuImage');
    expect(waiterSource).toContain("smartUpdateDocument('pos_orders', newOrder.id");
    expect(waiterSource).toContain('editable={false}');
    expect(kitchenSource).toContain("smartUpdateDocument('pos_orders', updatedOrder.id");
    expect(kitchenSource).toContain("return dataManager.saveData('orders', nextAllOrders, { syncFirestore: false }).then(() =>");
  });
});
