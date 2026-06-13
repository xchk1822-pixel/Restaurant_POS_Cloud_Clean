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
  });

  test('smart update uses Firestore upsert instead of update-only writes', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('await updateDoc(docRef, firestoreUpdateData)');
    expect(source).toContain('await setDoc(docRef, firestoreUpdateData, { merge: true })');
  });

  test('smart sync service does not expose legacy bulk migration writers', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('export const manualSyncToFirestore');
    expect(source).not.toContain('export const migrateOldData');
    expect(source).not.toContain('export const smartBatchAddDocuments');
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

    expect(liveSubscriptionBlock).toContain("smartSubscribeToCollection('pos_orders'");
    expect(liveSubscriptionBlock).not.toContain("smartSubscribeToCollection('menu_items'");
    expect(snapshotLoadBlock).toContain('const data = await smartGetDocuments(config.name, true)');
    expect(snapshotLoadBlock).toContain('applyCloudData(data, config.setter, config.label);');
    expect(snapshotLoadBlock).not.toContain('applyCloudData(data, config.setter, config.label, { merge: true });');
  });

  test('expense records use explicit single-document cloud writes', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const source = fs.readFileSync(expensePath, 'utf8');
    const addBlock = source.slice(
      source.indexOf('const handleAddExpense = async () => {'),
      source.indexOf('// ✅ 删除开支')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteExpense = async'),
      source.indexOf('const handleImageUpload')
    );
    const addCategoryBlock = source.slice(
      source.indexOf('const handleAddCategory = async'),
      source.indexOf('// 删除类别')
    );
    const deleteCategoryBlock = source.slice(
      source.indexOf('const handleDeleteCategory = async'),
      source.indexOf('// 处理票据上传')
    );
    const receiptBlock = source.slice(
      source.indexOf('const handleReceiptUpload ='),
      source.indexOf('const getExpenseDateTime')
    );

    expect(source).not.toContain("dataService.saveData('expense_categories'");
    expect(source).not.toContain("dataManager.saveData('expenses', nextExpenses);");
    expect(source).not.toContain("dataManager.saveData('expenses', updatedExpenses);");
    expect(source).toContain("smartSetDocument('expenses', newExpense.id, newExpense)");
    expect(addBlock.indexOf("await smartSetDocument('expenses', newExpense.id, newExpense)")).toBeLessThan(
      addBlock.indexOf('setExpenses(nextExpenses)')
    );
    expect(deleteBlock.indexOf("await smartDeleteDocument('expenses', id)")).toBeLessThan(
      deleteBlock.indexOf('setExpenses(nextExpenses)')
    );
    expect(addCategoryBlock.indexOf("await smartSetDocument('expense_categories', newCat.id, newCat)")).toBeLessThan(
      addCategoryBlock.indexOf('setCategories(nextCategories)')
    );
    expect(deleteCategoryBlock.indexOf("await smartDeleteDocument('expense_categories', id)")).toBeLessThan(
      deleteCategoryBlock.indexOf('setCategories(nextCategories)')
    );
    expect(receiptBlock.indexOf("await smartSetDocument('expenses', updatedExpense.id, updatedExpense)")).toBeLessThan(
      receiptBlock.indexOf('setExpenses(updatedExpenses)')
    );
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

  test('waiter orders publish directly to shared POS orders', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');

    expect(source).toContain("smartUpdateDocument('pos_orders', newOrder.id");
    expect(source).toContain("smartUpdateDocument('pos_orders', updatedOrder.id");
    expect(source).toContain('currentOrderId: newOrder.id');
  });

  test('waiter table cache uses the current store scope', () => {
    const waiterPath = path.join(process.cwd(), 'src/pages/WaiterInterface/WaiterInterface.tsx');
    const source = fs.readFileSync(waiterPath, 'utf8');

    expect(source).not.toContain("localStorage.getItem('pos_tables')");
    expect(source).toContain("localStorage.getItem(dataService.getStoreKey('pos_tables'))");
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
    expect(tablePublishBlock).toContain('if (!tablePublisherReadyRef.current)');
    expect(tablePublishBlock).toContain('if (!tableUserEditPendingRef.current)');
    expect(tablePublishBlock).not.toContain('if (!tableCloudHydratedRef.current && !tableUserEditPendingRef.current)');
    expect(tablePublishBlock.indexOf('if (!tablePublisherReadyRef.current)')).toBeLessThan(
      tablePublishBlock.indexOf("tables.forEach(table =>")
    );
    expect(tablePublishBlock.indexOf('if (!tableUserEditPendingRef.current)')).toBeLessThan(
      tablePublishBlock.indexOf("tables.forEach(table =>")
    );
    expect(waiterSource).not.toContain("smartUpdateDocument('pos_tables'");
  });

  test('kitchen status changes write back to shared POS orders', () => {
    const kitchenPath = path.join(process.cwd(), 'src/pages/POS/KitchenDisplay.tsx');
    const source = fs.readFileSync(kitchenPath, 'utf8');

    expect(source).toContain("smartUpdateDocument('pos_orders', updatedOrder.id");
    expect(source).toContain("status !== 'served'");
    expect(source).toContain("status: 'served'");
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

  test('backup page is read-only export and cannot restore or bulk sync data', () => {
    const backupPath = path.join(process.cwd(), 'src/pages/Settings/DataBackup.tsx');
    const source = fs.readFileSync(backupPath, 'utf8');

    expect(source).toContain('createFirestoreBackup');
    expect(source).toContain('downloadBackupFile');
    expect(source).not.toContain('restoreFromFirestore');
    expect(source).not.toContain('syncToFirestoreNow');
    expect(source).not.toContain('setBackupMode');
  });

  test('owner dashboard uses manual refresh wording and has no legacy data sync entry', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Dashboard/OwnerDashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('刷新云端数据');
    expect(source).toContain('低频手动刷新');
    expect(source).not.toContain('数据同步');
    expect(source).not.toContain('手动同步');
    expect(source).not.toContain('同步中');
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

  test('supplier payment records are store-scoped and refreshed from cloud', () => {
    const suppliersPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const source = fs.readFileSync(suppliersPath, 'utf8');

    expect(source).toContain("smartGetDocuments('supplier_payments', true)");
    expect(source).toContain("dataService.getStoreKey(`payments_${supplierId}`)");
    expect(source).toContain('saveSupplierPayments(supplierId, supplierPayments)');
    expect(source).not.toContain("localStorage.getItem(`payments_${supplierId}`)");
    expect(source).not.toContain("saveData(`payments_${supplierId}`");
  });

  test('supplier edits deletes and payments wait for cloud writes before local state updates', () => {
    const suppliersPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const source = fs.readFileSync(suppliersPath, 'utf8');
    const saveBlock = source.slice(
      source.indexOf('const handleSaveSupplier = async () => {'),
      source.indexOf('// 删除供应商')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteSupplier = async'),
      source.indexOf('// 处理还款')
    );
    const paymentBlock = source.slice(
      source.indexOf('const handlePayment = async () => {'),
      source.indexOf('// 打印对账单')
    );

    expect(saveBlock.indexOf("await smartUpdateDocument('suppliers', editingSupplier.id, updatedSupplier)")).toBeLessThan(
      saveBlock.indexOf('setSuppliers(suppliers.map')
    );
    expect(saveBlock.indexOf("await smartAddDocument('suppliers', newSupplier)")).toBeLessThan(
      saveBlock.indexOf('setSuppliers([...suppliers, newSupplier])')
    );
    expect(deleteBlock.indexOf("await smartDeleteDocument('suppliers', supplierId)")).toBeLessThan(
      deleteBlock.indexOf('setSuppliers(suppliers.filter')
    );
    expect(paymentBlock.indexOf("await smartUpdateDocument('purchase_orders', selectedOrder.id, updatedSelectedOrder)")).toBeLessThan(
      paymentBlock.indexOf('setPurchaseOrders(updatedOrdersForSync)')
    );
    expect(paymentBlock.indexOf("await smartAddDocument('supplier_payments', paymentRecord)")).toBeLessThan(
      paymentBlock.indexOf('savePaymentRecord(selectedOrder.supplierId, paymentRecord)')
    );
    expect(paymentBlock.indexOf("await smartAddDocument('expenses', paymentExpense)")).toBeLessThan(
      paymentBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(paymentBlock).not.toContain('还款已在本机记录');
  });

  test('purchase order creation waits for linked cloud writes before local state updates', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');
    const createBlock = source.slice(
      source.indexOf('const order: PurchaseOrder = {'),
      source.indexOf("alert(`閲囪喘鍗?")
    );

    expect(createBlock).toContain("await smartAddDocument('purchase_orders', order)");
    expect(createBlock).toContain("await Promise.all(newOrder.items.map(orderItem => smartIncrementField('inventory_items', orderItem.itemId");
    expect(createBlock).toContain("await smartAddDocument('expenses', purchaseExpense)");
    expect(createBlock).toContain("await smartUpdateDocument('suppliers', newOrder.supplierId, supplierCloudUpdate)");
    expect(createBlock.indexOf("await smartAddDocument('purchase_orders', order)")).toBeLessThan(
      createBlock.indexOf('setPurchaseOrders(nextPurchaseOrders)')
    );
    expect(createBlock.indexOf("await Promise.all(newOrder.items.map(orderItem => smartIncrementField('inventory_items', orderItem.itemId")).toBeLessThan(
      createBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(createBlock).not.toContain("smartIncrementField('inventory_items', item.id");
    expect(createBlock).not.toContain('.catch(error =>');
  });

  test('financial reports use collected order amounts and normalized expense dates', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');

    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderFinancialDateKey(order) === date');
    expect(source).toContain('getOrderPaymentBreakdown(order)');
    expect(source).toContain('getExpenseDateKey(exp)');
    expect(source).toContain('buildDailyExpenseBreakdown(dataManager.getData');
    expect(source).toContain("smartGetDocuments('expense_categories', true)");
    expect(source).not.toContain('sum + (order.totalAmount || 0)');
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

    expect(source).toContain("buildDailyExpenseBreakdown(dataManager.getData('expenses'), selectedDate, expenseCategories, dataManager.getData('purchases'))");
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
    expect(metricsSource).toContain('findMatchingPurchaseOrder');
    expect(metricsSource).toContain('quantity?: number');
    expect(metricsSource).toContain('unitPrice?: number');
    expect(metricsSource).toContain('supplierName || getExpenseTypeLabel(type)');
    expect(source).not.toContain('\\u5f53\\u5929\\u5f00\\u652f\\u5206\\u7c7b\\u6c47\\u603b');
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

  test('POS menu category selector expands and collapses instead of horizontal scrolling', () => {
    const menuSelectionPath = path.join(process.cwd(), 'src/components/MenuSelection.tsx');
    const source = fs.readFileSync(menuSelectionPath, 'utf8');

    expect(source).toContain('categoriesExpanded');
    expect(source).toContain('setCategoriesExpanded');
    expect(source).toContain("aria-expanded={categoriesExpanded}");
    expect(source).toContain("flexWrap: 'wrap'");
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

  test('customer refresh persists deletion tombstones and delete writes are single-document', () => {
    const customersPath = path.join(process.cwd(), 'src/pages/Manager/CustomersModule.tsx');
    const rulesPath = path.join(process.cwd(), '../firestore.rules');
    const source = fs.readFileSync(customersPath, 'utf8');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const addBlock = source.slice(
      source.indexOf('const handleAddCustomer = async () => {'),
      source.indexOf('// 编辑客户')
    );
    const editBlock = source.slice(
      source.indexOf('const handleSaveEdit = async () => {'),
      source.indexOf('// 删除客户')
    );
    const deleteBlock = source.slice(
      source.indexOf('const handleDeleteCustomer = async'),
      source.indexOf('// 积分管理')
    );
    const addPointsBlock = source.slice(
      source.indexOf('const handleAddPoints = async () => {'),
      source.indexOf('const handleSavePointsSettings = async')
    );
    const settingsBlock = source.slice(
      source.indexOf('const handleSavePointsSettings = async'),
      source.indexOf('// 积分兑换')
    );
    const redeemBlock = source.slice(
      source.indexOf('const handleConfirmRedeem = async () => {'),
      source.indexOf('// 重置积分')
    );
    const resetBlock = source.slice(
      source.indexOf('const handleResetPoints = async'),
      source.indexOf('// 样式')
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

  test('manager dashboard uses collected revenue and financial order dates', () => {
    const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
    const source = fs.readFileSync(dashboardPath, 'utf8');

    expect(source).toContain('getOrderFinancialDateKey(order)');
    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderPaymentBreakdown(order).card');
    expect(source).toContain('getOrderPaymentBreakdown(order).cash');
    expect(source).not.toContain('sum + (order.totalAmount || 0)');
    expect(source).not.toContain('customerMap[phone].totalSpent += order.totalAmount || 0');
    expect(source).not.toContain('hourStats[hour].revenue += order.totalAmount || 0');
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

  test('inventory item deletion waits for linked cloud deletes before local state updates', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');
    const deleteBlock = source.slice(
      source.indexOf('const itemId = editingItem.id;'),
      source.indexOf("alert('鍒犻櫎鎴愬姛")
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
      editBlock.indexOf('setMenuItems(items => items.map')
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
    expect(fridgeCompleteBlock).toContain("await smartAddDocument('fridge_stocktake_history', stocktakeRecord)");
    expect(warehouseCompleteBlock.indexOf("await smartAddDocument('warehouse_stocktake_history', stocktakeRecord)")).toBeLessThan(
      warehouseCompleteBlock.indexOf('cacheStocktakeHistory([stocktakeRecord, ...history])')
    );
    expect(fridgeCompleteBlock.indexOf("await smartAddDocument('fridge_stocktake_history', stocktakeRecord)")).toBeLessThan(
      fridgeCompleteBlock.indexOf('cacheStocktakeHistory([stocktakeRecord, ...history])')
    );
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

  test('fridge creation waits for deterministic cloud write before local state update', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const addFridgeBlock = source.slice(source.indexOf('const handleAddFridge = async'), source.indexOf('// 缂栬緫鍐扮'));

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
    expect(transferBlock).toContain("await smartIncrementField('inventory_items', item.id");
    expect(transferBlock).toContain("await smartIncrementField('fridge_inventory', fridgeInventoryId");
    expect(transferBlock.indexOf("await smartIncrementField('inventory_items', item.id")).toBeLessThan(
      transferBlock.indexOf('setInventoryItems(items => items.map')
    );
    expect(transferBlock.indexOf("await smartIncrementField('fridge_inventory', fridgeInventoryId")).toBeLessThan(
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
      addLoanBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(addLoanBlock.indexOf('await recordCashFlow({')).toBeLessThan(
      addLoanBlock.indexOf('setLoanRecords(updated)')
    );
    expect(salaryBlock.indexOf("await smartAddDocument('salary_records', salaryRecord)")).toBeLessThan(
      salaryBlock.indexOf('setSalaryRecords(updatedSalaries)')
    );
    expect(salaryBlock.indexOf("await smartAddDocument('expenses', salaryExpense)")).toBeLessThan(
      salaryBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(salaryBlock.indexOf("smartUpdateDocument('loan_records', loan.id, loan)")).toBeLessThan(
      salaryBlock.indexOf('setLoanRecords(updatedLoans)')
    );
    expect(salaryBlock).not.toContain("console.error('同步借款扣减记录失败:'");
    expect(salaryBlock).not.toContain("console.error('❌ 同步工资结算记录失败:'");
  });

  test('shift handover drafts and history use store-scoped local storage', () => {
    const handoverPath = path.join(process.cwd(), 'src/pages/Manager/ShiftHandover.tsx');
    const source = fs.readFileSync(handoverPath, 'utf8');

    expect(source).toContain("dataService.getStoreKey('current_inputs')");
    expect(source).toContain('localStorage.getItem(currentInputsStorageKey)');
    expect(source).toContain('localStorage.setItem(currentInputsStorageKey');
    expect(source).toContain("dataManager.getData('handovers')");
    expect(source).not.toContain("localStorage.getItem('current_inputs')");
    expect(source).not.toContain("localStorage.setItem('current_inputs'");
    expect(source).not.toContain("localStorage.getItem('rest_v6_final')");
    expect(source).not.toContain("localStorage.removeItem('rest_v6_final')");
  });
});
