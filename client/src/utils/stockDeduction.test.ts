import { buildStockDeductionPlan } from './stockDeduction';

describe('stock deduction planning', () => {
  test('deducts fridge stock first and only uses warehouse for the shortage', () => {
    const plan = buildStockDeductionPlan({
      requests: [{ itemId: 'cola', quantity: 8 }],
      inventoryItems: [{ id: 'cola', name: 'Coca Cola', currentStock: 10 }],
      fridgeInventory: [
        { id: 'f1-cola', fridgeId: 'f1', itemId: 'cola', quantity: 5 },
        { id: 'f2-cola', fridgeId: 'f2', itemId: 'cola', quantity: 2 },
      ],
    });

    expect(plan.fridgeDeductions).toEqual([
      { recordId: 'f1-cola', fridgeId: 'f1', itemId: 'cola', quantity: 5 },
      { recordId: 'f2-cola', fridgeId: 'f2', itemId: 'cola', quantity: 2 },
    ]);
    expect(plan.warehouseDeductions).toEqual([{ itemId: 'cola', quantity: 1 }]);
  });

  test('does not deduct warehouse stock when one fridge unit exactly covers one sold unit', () => {
    const plan = buildStockDeductionPlan({
      requests: [{ itemId: 'valle-limon', quantity: 1 }],
      inventoryItems: [{ id: 'valle-limon', name: 'Valle limon500ML', currentStock: 12 }],
      fridgeInventory: [
        { id: 'fridge-2-valle-limon', fridgeId: 'fridge-2', itemId: 'valle-limon', quantity: 1 },
      ],
    });

    expect(plan.fridgeDeductions).toEqual([
      {
        recordId: 'fridge-2-valle-limon',
        fridgeId: 'fridge-2',
        itemId: 'valle-limon',
        quantity: 1,
      },
    ]);
    expect(plan.warehouseDeductions).toEqual([]);
  });

  test('allows warehouse stock to go negative when fridge plus warehouse cannot cover the sale', () => {
    const plan = buildStockDeductionPlan({
      requests: [{ itemId: 'tea', quantity: 8 }],
      inventoryItems: [{ id: 'tea', name: 'TE VASO', currentStock: 2 }],
      fridgeInventory: [{ id: 'f1-tea', fridgeId: 'f1', itemId: 'tea', quantity: 3 }],
    });

    expect(plan.fridgeDeductions).toEqual([
      { recordId: 'f1-tea', fridgeId: 'f1', itemId: 'tea', quantity: 3 },
    ]);
    expect(plan.warehouseDeductions).toEqual([{ itemId: 'tea', quantity: 5 }]);
  });

  test('combines repeated item requests before checking availability', () => {
    const plan = buildStockDeductionPlan({
      requests: [
        { itemId: 'box', quantity: 3 },
        { itemId: 'box', quantity: 4 },
      ],
      inventoryItems: [{ id: 'box', name: 'Box', currentStock: 7 }],
      fridgeInventory: [],
    });

    expect(plan.warehouseDeductions).toEqual([{ itemId: 'box', quantity: 7 }]);
  });

  test('rejects a configured stock item that is missing instead of silently marking the order deducted', () => {
    expect(() => buildStockDeductionPlan({
      requests: [{ itemId: 'missing-item', quantity: 1 }],
      inventoryItems: [],
      fridgeInventory: [],
    })).toThrow('missing-stock-item:missing-item');
  });
});
