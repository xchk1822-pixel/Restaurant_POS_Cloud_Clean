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
});
