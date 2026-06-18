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

  test('login page does not emit success-flow debug logs in production', () => {
    const loginPath = path.join(process.cwd(), 'src/pages/Login/Login.tsx');
    const source = fs.readFileSync(loginPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('Login页面 - redirect');
    expect(source).not.toContain('尝试登录');
    expect(source).not.toContain('登录成功');
    expect(source).not.toContain('自动迁移到 Firebase Auth:');
    expect(source).toContain('console.warn');
    expect(source).toContain('console.error');
  });

  test('auth context does not emit user identity success-flow debug logs', () => {
    const authContextPath = path.join(process.cwd(), 'src/contexts/AuthContext.tsx');
    const source = fs.readFileSync(authContextPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('Firebase Auth 用户已登录');
    expect(source).not.toContain('从缓存恢复用户');
    expect(source).not.toContain('已触发 userLoggedIn');
    expect(source).not.toContain('Firebase Auth 登出成功');
    expect(source).toContain('console.error');
  });

  test('firebase auth service does not emit identity success-flow debug logs', () => {
    const authServicePath = path.join(process.cwd(), 'src/services/FirebaseAuthService.ts');
    const source = fs.readFileSync(authServicePath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('尝试 Firebase Auth 登录');
    expect(source).not.toContain('Firebase Auth 登录成功');
    expect(source).not.toContain('Firebase Auth 登出成功');
    expect(source).not.toContain('创建 Firebase Auth 用户:');
    expect(source).not.toContain('Firebase Auth 用户创建成功');
    expect(source).toContain('console.error');
  });

  test('firebase initialization does not emit success debug logs', () => {
    const firebaseIndexPath = path.join(process.cwd(), 'src/firebase/index.ts');
    const source = fs.readFileSync(firebaseIndexPath, 'utf8');

    expect(source).not.toContain('console.log');
    expect(source).not.toContain('Firebase已初始化');
    expect(source).toContain('console.warn');
  });

  test('purchase item category selector does not emit render debug logs', () => {
    const purchasePath = path.join(process.cwd(), 'src/pages/Inventory/PurchaseManagement.tsx');
    const source = fs.readFileSync(purchasePath, 'utf8');

    expect(source).not.toContain('当前库存物品数量');
    expect(source).not.toContain('提取到的类别');
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
      "console.log('SplitBillModal 渲染，商品数:', items.length);",
      "console.log('使用已保存的拆分账单数据');",
    ].forEach(staleLog => {
      expect(source).not.toContain(staleLog);
    });
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
    expect(source).toContain('const queueOrderPublish = (order: Order) => {');
    expect(source).toContain("await smartUpdateDocument('pos_orders', order.id, serializeOrderForFirestore(order))");
    expect(completeBlock).toContain('queueOrderPublish(completedOrder)');
    expect(completeBlock).not.toContain('await publishOrderImmediately(completedOrder)');
    expect(cancelBlock).toContain('await publishOrderImmediately(cancelledOrder)');
    expect(cancelBlock.indexOf('await publishOrderImmediately(cancelledOrder)')).toBeLessThan(
      cancelBlock.indexOf('setOrders(prevOrders => prevOrders.map(o =>')
    );
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
    expect(orderPanelBlock.indexOf('📋 Pedidos')).toBeLessThan(
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
    expect(cancelBlock).toContain('currentOrderId: undefined');
    expect(cancelBlock).toContain("status: 'available' as const");
    expect(orderListBlock).not.toContain("o.status === 'cancelled'");
    expect(source).toContain("case 'cancelled': return 'Cancelado';");
  });

  test('POS cancelled orders are frozen and cannot be reused for new table orders', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const tableStatusBlock = source.slice(
      source.indexOf('// 根据订单状态自动更新桌台状态。'),
      source.indexOf('// 馃攧 鏁版嵁浜掗€氭祴璇曪細')
    );
    const sendBlock = source.slice(
      source.indexOf('const handleSendToKitchen = async () => {'),
      source.indexOf('const deductStockForOrder')
    );
    const orderClickBlock = source.slice(
      source.indexOf('const handleOrderClick = (order: any) => {'),
      source.indexOf('const handleTableDragStart')
    );

    expect(source).toContain('const isEditableActiveOrder = (order?: Partial<Order> | null): boolean => {');
    expect(tableStatusBlock).toContain('currentOrderId: newStatus === \'available\' ? undefined : table.currentOrderId');
    expect(sendBlock).toContain('const selectedEditableOrder = selectedOrderId');
    expect(sendBlock).toContain('isEditableActiveOrder(o)');
    expect(sendBlock).toContain('if (!selectedEditableOrder) {');
    expect(sendBlock).toContain('setSelectedOrderId(newOrder.id)');
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
    expect(source).not.toContain('确认下单（发送到厨房并扣减库存）');
    expect(sendBlock).not.toContain('deductStockForOrder');
    expect(sendBlock).not.toContain('deductStock(');
    expect(completeBlock).toContain('deductStockForOrder');
    expect(source).toContain('const deductStockForOrder = async (order: Order): Promise<Order> => {');
    expect(completeBlock).toContain('const completedOrder = await deductStockForOrder');
    expect(source).toContain('await deductStock(itemsToDeduct)');
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
    expect(deductBlock).toContain('await Promise.all(stockWriteTasks)');
    expect(deductBlock).not.toContain("smartIncrementField('fridge_inventory', updatedInv.id");
    expect(deductBlock).not.toContain('.catch(error =>');
  });

  test('pending sync keeps failed inventory changes queued', () => {
    const syncPath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(syncPath, 'utf8');
    const pendingBlock = source.slice(
      source.indexOf('export const syncPendingChanges = async () => {'),
      source.indexOf('// ==================== 分店数据隔离')
    );

    expect(source).toContain('const setPendingChanges = (changes: PendingChange[]) => {');
    expect(pendingBlock).toContain('const failedChanges: PendingChange[] = []');
    expect(pendingBlock).toContain('failedChanges.push(change)');
    expect(pendingBlock).toContain('setPendingChanges(failedChanges)');
    expect(pendingBlock).not.toContain('clearPendingChanges();');
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
    expect(nonDineInButtonBlock).toContain('disabled={completingOrderIds.has(order.id)}');
    expect(nonDineInButtonBlock).toContain("completingOrderIds.has(order.id) ? 'Procesando...' :");
  });

  test('smart update uses Firestore upsert instead of update-only writes', () => {
    const servicePath = path.join(process.cwd(), 'src/services/smartSyncService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).not.toContain('await updateDoc(docRef, firestoreUpdateData)');
    expect(source).toContain('await setDoc(docRef, firestoreUpdateData, { merge: true })');
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
      addCategoryBlock.indexOf('setCategoriesCache(nextCategories)')
    );
    expect(deleteCategoryBlock.indexOf("await smartDeleteDocument('expense_categories', id)")).toBeLessThan(
      deleteCategoryBlock.indexOf('setCategoriesCache(nextCategories)')
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
    expect(source).toContain("return dataManager.saveData('orders', nextAllOrders, { syncFirestore: false }).then(() =>");
    expect(source).toContain("status !== 'served'");
    expect(source).toContain("status: 'served'");
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
    expect(source).not.toContain('console.log');
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

  test('financial reports use one generic orders column for completed and cancelled activity', () => {
    const reportsPath = path.join(process.cwd(), 'src/pages/Manager/FinancialReports.tsx');
    const source = fs.readFileSync(reportsPath, 'utf8');
    const metricsPath = path.join(process.cwd(), 'src/utils/financeMetrics.ts');
    const metricsSource = fs.readFileSync(metricsPath, 'utf8');

    expect(metricsSource).toContain('export const calculateOrderStatusSummary');
    expect(metricsSource).toContain('completedOrders');
    expect(metricsSource).toContain('cancelledOrders');
    expect(metricsSource).toContain('cancelledItems');
    expect(source).toContain('calculateOrderStatusSummary(orders, date)');
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

  test('POS global order updates merge by version instead of replacing the whole list', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const source = fs.readFileSync(posPath, 'utf8');
    const globalOrderStart = source.indexOf('if (!appOrders || appOrders.length === 0) return;');
    expect(globalOrderStart).toBeGreaterThan(-1);
    const globalOrderBlock = source.slice(
      source.lastIndexOf('React.useEffect(() => {', globalOrderStart),
      source.indexOf('useEffect(() => {', source.indexOf('if (orders.length > 0) return;'))
    );

    expect(globalOrderBlock).toContain('setOrders(prevOrders => {');
    expect(globalOrderBlock).toContain('mergeOrdersByVersion(prevOrders, incomingOrders)');
    expect(globalOrderBlock).not.toContain('setOrders(incomingOrders)');
  });

  test('POS cloud terminal order state overrides newer local non-terminal cache', () => {
    const posPath = path.join(process.cwd(), 'src/pages/POS/POS.tsx');
    const appContextPath = path.join(process.cwd(), 'src/contexts/AppContext.tsx');
    const posSource = fs.readFileSync(posPath, 'utf8');
    const appContextSource = fs.readFileSync(appContextPath, 'utf8');

    expect(posSource).toContain('const isCloudTerminalAdvance = (localOrder: Partial<Order>, incomingOrder: Partial<Order>): boolean => {');
    expect(posSource).toContain('if (isCloudTerminalAdvance(localOrder, cloudOrder)) return true;');
    expect(posSource).toContain('if (!localOrder || isCloudTerminalAdvance(localOrder, incomingOrder) || (!isOrderStateRegression(localOrder, incomingOrder)');
    expect(appContextSource).toContain('const isCloudTerminalAdvance = useCallback((localItem: any, cloudItem: any): boolean => {');
    expect(appContextSource).toContain('if (isCloudTerminalAdvance(localItem, cloudItem)) {');
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
    expect(source).toContain("if (table.status === 'available') {");
    expect(source).toContain("case 'occupied':");
    expect(source).toContain("case 'needs_cleaning':");
    expect(renderBlock).toContain('filter: getTableImageFilter(table)');
    expect(renderBlock).not.toContain('borderColor: getTableStatusAccent(table)');
    expect(renderBlock).not.toContain('{shouldShowTableStatusFrame(table) && (');
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
    expect(source).not.toContain('展开分类');
    expect(source).not.toContain('收起分类');
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

  test('points and exchange-rate settings use store-scoped local cache keys', () => {
    const exchangeRatePath = path.join(process.cwd(), 'src/utils/exchangeRate.ts');
    const customersPath = path.join(process.cwd(), 'src/pages/Manager/CustomersModule.tsx');
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

  test('DataService login store sync is cloud-authoritative and clears stale local cache', () => {
    const servicePath = path.join(process.cwd(), 'src/services/DataService.ts');
    const source = fs.readFileSync(servicePath, 'utf8');

    expect(source).toContain('localStorage.setItem(localKey, JSON.stringify(cloudData));');
    expect(source).toContain('Cloud empty; cleared local cache');
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
    expect(managementSource).toContain('保存时原图上传');
    expect(managementSource).toContain('图片上传中...');
    expect(managementSource).not.toContain('保存时压缩上传');
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

  test('fridge stocktake completion records all fridges instead of only selected fridge', () => {
    const fridgePath = path.join(process.cwd(), 'src/pages/Inventory/FridgeStocktake.tsx');
    const source = fs.readFileSync(fridgePath, 'utf8');
    const completeBlock = source.slice(
      source.indexOf('const completeStocktake = async'),
      source.indexOf('const moveItem')
    );

    expect(completeBlock).toContain('const allFridgeItems = fridgeInventory.map');
    expect(completeBlock).toContain('buildFridgeStocktakeHistoryRecords({');
    expect(completeBlock).toContain('cacheStocktakeHistory([...recordsToSave, ...history])');
    expect(completeBlock).not.toContain('const uncountedItems = fridgeItems.filter');
    expect(completeBlock).not.toContain('fridgeId: selectedFridge');
    expect(completeBlock).not.toContain('inv.fridgeId === selectedFridge && actualQuantities[inv.itemId] !== undefined');
    expect(source).not.toContain('setActualQuantities(initial)');
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
    expect(loanSource).not.toContain('console.log');
    expect(salaryBlock.indexOf("await smartAddDocument('salary_records', salaryRecord)")).toBeLessThan(
      salaryBlock.indexOf('setSalaryRecords(updatedSalaries)')
    );
    expect(salaryBlock.indexOf("await smartAddDocument('expenses', salaryExpense)")).toBeLessThan(
      salaryBlock.indexOf("dataManager.saveData('expenses', nextExpenses")
    );
    expect(salaryBlock.indexOf("smartUpdateDocument('loan_records', loan.id, loan)")).toBeLessThan(
      salaryBlock.indexOf('setLoanRecords(updatedLoans)')
    );
    expect(salarySource).not.toContain('console.log');
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
    const printStart = source.indexOf('const handlePrintReceipt = () => {');
    const printBlock = source.slice(
      printStart,
      source.indexOf('const generateOrderNumber = () => {', printStart)
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
    expect(printBlock).toContain('Servicio (10%)');
    expect(printBlock).toContain('IVA (15%)');
    expect(printBlock).toContain('finalTotal.toFixed(2)');
    [paymentBlock, orderHeaderBlock, orderSummaryBlock, printBlock].forEach(block => {
      expect(block).not.toContain('服务费');
      expect(block).not.toContain('税费');
      expect(block).not.toContain('时间');
      expect(block).not.toContain('鏈嶅姟璐');
      expect(block).not.toContain('绋庤垂');
      expect(block).not.toContain('鏃堕棿');
    });
  });
});
