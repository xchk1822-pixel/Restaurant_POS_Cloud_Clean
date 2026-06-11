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
});
