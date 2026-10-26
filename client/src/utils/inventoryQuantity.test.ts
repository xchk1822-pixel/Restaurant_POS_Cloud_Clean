import { formatInventoryQuantity } from './inventoryQuantity';

describe('formatInventoryQuantity', () => {
  it('keeps integers without appending a decimal zero', () => {
    expect(formatInventoryQuantity(13)).toBe('13');
    expect(formatInventoryQuantity('0')).toBe('0');
  });

  it('rounds quantity results to at most one decimal place', () => {
    expect(formatInventoryQuantity(2.748737489483477484)).toBe('2.7');
    expect(formatInventoryQuantity(13.46)).toBe('13.5');
    expect(formatInventoryQuantity(-2.04)).toBe('-2');
    expect(formatInventoryQuantity(0.05)).toBe('0.1');
  });
});
