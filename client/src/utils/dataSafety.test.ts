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
});
