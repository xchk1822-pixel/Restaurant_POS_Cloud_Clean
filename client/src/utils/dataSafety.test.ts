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

  test('expense records use explicit single-document cloud writes', () => {
    const expensePath = path.join(process.cwd(), 'src/pages/Manager/ExpenseRecords.tsx');
    const source = fs.readFileSync(expensePath, 'utf8');

    expect(source).not.toContain("dataService.saveData('expense_categories'");
    expect(source).not.toContain("dataManager.saveData('expenses', nextExpenses);");
    expect(source).not.toContain("dataManager.saveData('expenses', updatedExpenses);");
    expect(source).toContain("smartSetDocument('expenses', newExpense.id, newExpense)");
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
    const source = fs.readFileSync(syncPath, 'utf8');

    expect(source).toContain("CLOUD_AUTHORITATIVE_SUBSCRIPTIONS = new Set(['pos_tables'])");
    expect(source).toContain('isCloudAuthoritativeSubscription(collectionName)');
    expect(source).toContain('const activeData = excludeDeletedRecords(data)');
    expect(source).toContain('callback(activeData)');
    const subscriptionMergeBlock = source.slice(source.indexOf('const serialized = JSON.stringify(data);'));
    expect(subscriptionMergeBlock.indexOf('if (isCloudAuthoritativeSubscription(collectionName))')).toBeLessThan(
      subscriptionMergeBlock.indexOf('const localData = getFromLocalStorage(collectionName);')
    );
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

  test('financial reports use collected order amounts and normalized expense dates', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');

    expect(source).toContain('getOrderCollectedAmount(order)');
    expect(source).toContain('getOrderFinancialDateKey(order) === date');
    expect(source).toContain('getOrderPaymentBreakdown(order)');
    expect(source).toContain('getExpenseDateKey(exp)');
    expect(source).toContain('getExpenseDateKey(expense) === selectedDate');
    expect(source).not.toContain('sum + (order.totalAmount || 0)');
  });

  test('customer refresh persists deletion tombstones and delete writes are single-document', () => {
    const customersPath = path.join(process.cwd(), 'src/pages/Manager/CustomersModule.tsx');
    const source = fs.readFileSync(customersPath, 'utf8');

    expect(source).toContain("smartGetDocuments('customers', true)");
    expect(source).toContain("smartGetDocuments('customer_deletions', true)");
    expect(source).toContain('filterActiveCustomers(cloudCustomers, cloudCustomerDeletions)');
    expect(source).toContain("saveLocalCollection('customer_deletions', cloudCustomerDeletions)");
    expect(source).toContain("smartUpdateDocument('customers', customerId");
    expect(source).toContain("smartUpdateDocument('customer_deletions', customerId");
    expect(source).toContain("dataManager.saveData('customers', nextCustomers");
    expect(source).toContain('syncFirestore: false');
    expect(source).not.toContain("smartDeleteDocument('customers', customerId)");
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

  test('employee refresh persists deletion tombstones and delete writes are single-document', () => {
    const employeesPath = path.join(process.cwd(), 'src/pages/Employees/Employees.tsx');
    const employeeListPath = path.join(process.cwd(), 'src/pages/Employees/EmployeeList.tsx');
    const employeesSource = fs.readFileSync(employeesPath, 'utf8');
    const employeeListSource = fs.readFileSync(employeeListPath, 'utf8');

    expect(employeesSource).toContain("smartGetDocuments('employees', true)");
    expect(employeesSource).toContain("smartGetDocuments('employee_deletions', true)");
    expect(employeesSource).toContain("saveLocalCollection('employee_deletions', employeeDeletionsData)");
    expect(employeeListSource).toContain("smartUpdateDocument('employees', id, deletedEmployee)");
    expect(employeeListSource).toContain("smartUpdateDocument('employee_deletions', id");
    expect(employeeListSource).toContain("dataManager.saveData('employees', activeEmployees");
    expect(employeeListSource).toContain('syncFirestore: false');
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
