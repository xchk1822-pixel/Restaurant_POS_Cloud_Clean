import fs from 'fs';
import path from 'path';

describe('inventory entry layout', () => {
  test('keeps purchase entry independent from item-management navigation', () => {
    const inventoryPath = path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx');
    const source = fs.readFileSync(inventoryPath, 'utf8');

    expect(source).toContain("const isStandalonePurchase = defaultTab === 'purchase';");
    expect(source).toContain('{!isStandalonePurchase && (');
    expect(source).toContain('setActiveTab(defaultTab);');
    expect(source).not.toContain("t('inventory.tab.purchase')");
    expect(source).toContain("activeTab === 'purchase' && canManagePurchases");
  });
});
