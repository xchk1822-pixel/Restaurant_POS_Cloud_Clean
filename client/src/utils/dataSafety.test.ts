import fs from 'fs';
import path from 'path';

describe('production data safety guards', () => {
  test('main layout does not trigger legacy global-to-store migration on login', () => {
    const mainLayoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const source = fs.readFileSync(mainLayoutPath, 'utf8');

    expect(source).not.toContain('migrateGlobalDataToStore');
  });
});
