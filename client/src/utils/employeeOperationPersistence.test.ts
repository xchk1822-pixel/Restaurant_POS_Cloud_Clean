import fs from 'fs';
import path from 'path';

describe('employee operation persistence', () => {
  test('firestore rules honor configured item permissions for attendance, expenses, and handovers', () => {
    const rules = fs.readFileSync(path.join(process.cwd(), '../firestore.rules'), 'utf8');

    expect(rules).toContain('function hasStorePermission(storeId, permissionId)');
    expect(rules).toContain("allow write: if canManageStore(storeId) || hasStorePermission(storeId, 'employees:attendance');");
    expect(rules).toContain("allow write: if canManageStore(storeId) || hasStorePermission(storeId, 'manager:expenses');");
    expect(rules).toContain("allow write: if canManageStore(storeId) || hasStorePermission(storeId, 'manager:handover');");
  });

  test('authenticated startup retries store pending writes', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/contexts/AuthContext.tsx'), 'utf8');

    expect(source).toContain("import { syncPendingChanges } from '../services/smartSyncService';");
    expect(source).toContain('await syncPendingChanges();');
  });

  test('full collection refresh preserves pending local rows until cloud confirmation', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/services/smartSyncService.ts'), 'utf8');
    const readBlock = source.slice(
      source.indexOf('export const smartGetDocuments = async'),
      source.indexOf('export const smartGetDocumentsWhereEqual')
    );

    expect(readBlock).toContain('mergeCloudRangeWithPendingLocal(collectionName, docs, () => true)');
  });
});
