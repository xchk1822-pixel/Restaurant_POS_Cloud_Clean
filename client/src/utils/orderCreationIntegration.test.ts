import fs from 'fs';
import path from 'path';

const readSource = (relativePath: string) => (
  fs.readFileSync(path.join(process.cwd(), 'src', relativePath), 'utf8')
);

describe('order creation idempotency integration', () => {
  test('all POS create branches use the stable order intent', () => {
    const source = readSource(path.join('pages', 'POS', 'POS.tsx'));

    expect(source).not.toContain('generateOrderId()');
    expect(source.match(/creationIntentId:\s*intent\.id/g)).toHaveLength(5);
    expect(source).toContain('beginNewOrderIntent();');
    expect(source).toContain('getOrCreateOrderNumber(generateOrderNumber)');
  });

  test('waiter creation uses the same stable identity and daily number allocator', () => {
    const source = readSource(path.join('pages', 'WaiterInterface', 'WaiterInterface.tsx'));

    expect(source).toContain('creationIntentId: intent.id');
    expect(source).toContain('smartGenerateDailyOrderNumber()');
    expect(source).not.toContain('orderNumber: `ORD-');
  });
});
