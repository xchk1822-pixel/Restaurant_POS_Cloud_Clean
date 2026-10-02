import { translate, type TranslationKey } from './translations';

describe('interface translations', () => {
  test('provides Chinese and Nicaraguan Spanish for every login key', () => {
    const keys: TranslationKey[] = [
      'login.title',
      'login.username',
      'login.password',
      'login.submit',
      'login.errorNetwork',
    ];

    keys.forEach(key => {
      expect(translate('zh-CN', key)).not.toBe(key);
      expect(translate('es-NI', key)).not.toBe(key);
    });
    expect(translate('zh-CN', 'login.title')).toBe('登录系统');
    expect(translate('es-NI', 'login.title')).toBe('Iniciar sesión');
  });

  test('uses Nicaraguan restaurant terms in the shared navigation', () => {
    expect(translate('es-NI', 'nav.inventory.warehouse')).toBe('Conteo de bodega');
    expect(translate('es-NI', 'nav.employees.salary')).toBe('Cálculo de planilla');
    expect(translate('es-NI', 'nav.manager.shift')).toBe('Cierre de caja');
    expect(translate('es-NI', 'role.waiter')).toBe('Mesero');
  });

  test('keeps the POS display bilingual without translating business data', () => {
    expect(translate('zh-CN', 'pos.orderType.dineIn')).toBe('堂食');
    expect(translate('zh-CN', 'pos.orderType.takeout')).toBe('打包');
    expect(translate('es-NI', 'pos.orderType.dineIn')).toBe('Mesa');
    expect(translate('es-NI', 'pos.orderType.takeout')).toBe('Barra');
    expect(translate('es-NI', 'pos.orderType.delivery')).toBe('Delivery');
    expect(translate('es-NI', 'pos.tables.held')).toBe('Retenidos');
    expect(translate('es-NI', 'pos.payment.cash')).toBe('Efectivo');
  });

  test('uses Nicaraguan Spanish in the waiter ordering flow', () => {
    expect(translate('zh-CN', 'waiter.tables.title')).toBe('服务生桌台');
    expect(translate('es-NI', 'waiter.tables.title')).toBe('Mesas del mesero');
    expect(translate('es-NI', 'waiter.order.sendToKitchen')).toBe('Enviar a cocina');
    expect(translate('es-NI', 'waiter.order.checkoutHint')).toBe('El cobro se realiza en Caja POS');
    expect(translate('es-NI', 'tableLayout.available')).toBe('Disponible');
    expect(translate('es-NI', 'tableLayout.people')).toBe('personas');
  });

  test('uses concise Spanish terms on the kitchen display', () => {
    expect(translate('zh-CN', 'kitchen.status.preparing')).toBe('制作中');
    expect(translate('es-NI', 'kitchen.status.preparing')).toBe('En preparación');
    expect(translate('es-NI', 'kitchen.action.start')).toBe('Iniciar preparación');
    expect(translate('es-NI', 'kitchen.action.served')).toBe('Pedido entregado');
  });

  test('uses Nicaraguan Spanish in inventory item management', () => {
    expect(translate('zh-CN', 'inventory.location.warehouse')).toBe('仓库');
    expect(translate('es-NI', 'inventory.location.warehouse')).toBe('Bodega');
    expect(translate('es-NI', 'inventory.tab.records')).toBe('Movimientos');
    expect(translate('es-NI', 'inventory.record.reason.sale')).toBe('Salida por venta');
    expect(translate('es-NI', 'inventory.operator.manager')).toBe('Gerente');
    expect(translate('es-NI', 'inventory.category.title')).toBe('Categorías de inventario');
  });

  test('uses Nicaraguan Spanish in menu management', () => {
    expect(translate('zh-CN', 'menu.title')).toBe('菜品管理');
    expect(translate('es-NI', 'menu.title')).toBe('Gestión del menú');
    expect(translate('es-NI', 'menu.add')).toBe('Agregar platillo');
    expect(translate('es-NI', 'menu.deduction.label')).toBe('Método de salida de inventario');
    expect(translate('es-NI', 'menu.deduction.recipe')).toBe('Por receta');
    expect(translate('es-NI', 'menu.deduction.direct')).toBe('Salida directa');
  });

  test('uses Nicaraguan Spanish in purchase management', () => {
    expect(translate('zh-CN', 'purchase.title')).toBe('采购订单管理');
    expect(translate('es-NI', 'purchase.title')).toBe('Gestión de compras');
    expect(translate('es-NI', 'purchase.payment.cash')).toBe('Contado');
    expect(translate('es-NI', 'purchase.payment.credit')).toBe('Crédito');
    expect(translate('es-NI', 'purchase.invoiceNumber')).toBe('N.º de factura (N.º de compra)');
    expect(translate('es-NI', 'purchase.print.title')).toBe('Entrada por compra');
  });

  test('uses Nicaraguan Spanish in warehouse stocktake', () => {
    expect(translate('zh-CN', 'warehouse.title')).toBe('仓库盘点');
    expect(translate('es-NI', 'warehouse.title')).toBe('Conteo de bodega');
    expect(translate('es-NI', 'warehouse.table.systemStock')).toBe('Existencia del sistema');
    expect(translate('es-NI', 'warehouse.table.actualStock')).toBe('Conteo físico');
    expect(translate('es-NI', 'warehouse.complete')).toBe('Finalizar conteo');
    expect(translate('es-NI', 'warehouse.historyTitle')).toBe('Historial de conteos de bodega');
  });

  test('uses Nicaraguan Spanish throughout fridge stocktake and transfers', () => {
    expect(translate('zh-CN', 'fridge.title')).toBe('冰箱盘点');
    expect(translate('es-NI', 'fridge.title')).toBe('Conteo de refrigerador');
    expect(translate('es-NI', 'fridge.table.warehouseStock')).toBe('En bodega');
    expect(translate('es-NI', 'fridge.table.actualStock')).toBe('Conteo físico');
    expect(translate('es-NI', 'fridge.transfer.addTitle')).toBe('Mover de bodega al refrigerador');
    expect(translate('es-NI', 'fridge.transferHistory.title')).toBe('Movimientos entre bodega y refrigerador');
    expect(translate('es-NI', 'fridge.manage.title')).toBe('Administrar refrigeradores');
  });

  test('uses Nicaraguan Spanish in employee records without changing stored role values', () => {
    expect(translate('zh-CN', 'employee.listTitle')).toBe('员工列表');
    expect(translate('es-NI', 'employee.listTitle')).toBe('Expedientes del personal');
    expect(translate('es-NI', 'employee.position.cashier')).toBe('Cajero');
    expect(translate('es-NI', 'employee.position.waiter')).toBe('Mesero');
    expect(translate('es-NI', 'employee.department.front')).toBe('Salón');
    expect(translate('es-NI', 'employee.dailySalary')).toBe('Salario diario');
    expect(translate('es-NI', 'employees.title')).toBe('Gestión de personal');
  });

  test('supports Chinese and Nicaraguan Spanish on attendance screens', () => {
    expect(translate('zh-CN', 'attendance.markIn')).toBe('上班打卡');
    expect(translate('es-NI', 'attendance.markIn')).toBe('Marcar entrada');
    expect(translate('es-NI', 'attendance.status.rest')).toBe('Descanso');
    expect(translate('es-NI', 'attendance.repairTime')).toBe('Corregir hora');
  });

  test('uses Nicaraguan payroll terms in employee loan management', () => {
    expect(translate('zh-CN', 'loan.title')).toBe('借款管理');
    expect(translate('es-NI', 'loan.title')).toBe('Préstamos al personal');
    expect(translate('es-NI', 'loan.payrollDeduction')).toBe('Descuento en planilla');
    expect(translate('es-NI', 'loan.stat.outstanding')).toBe('Saldo pendiente');
  });

  test('supports Chinese and Nicaraguan Spanish in payroll settlement', () => {
    expect(translate('zh-CN', 'salary.title')).toBe('工资结算');
    expect(translate('es-NI', 'salary.title')).toBe('Cierre de planilla');
    expect(translate('es-NI', 'salary.mode.batch')).toBe('Cierre masivo');
    expect(translate('es-NI', 'salary.pendingLoan')).toBe('Préstamo pendiente');
    expect(translate('es-NI', 'salary.dialog.netPay')).toBe('Neto a pagar');
  });

  test('uses Nicaraguan Spanish in expense records without translating business categories', () => {
    expect(translate('zh-CN', 'expense.title')).toBe('开支记录');
    expect(translate('es-NI', 'expense.title')).toBe('Registro de gastos');
    expect(translate('es-NI', 'expense.dateMode.today')).toBe('Hoy');
    expect(translate('es-NI', 'expense.parentCategory')).toBe('Categoría principal');
    expect(translate('es-NI', 'expense.receipt')).toBe('Comprobante');
    expect(translate('es-NI', 'expense.ranking.category')).toBe('Ranking por categoría');
  });

  test('uses Nicaraguan cash-closing terms in shift handover', () => {
    expect(translate('zh-CN', 'handover.submit')).toBe('保存提交');
    expect(translate('es-NI', 'handover.submit')).toBe('Guardar y enviar');
    expect(translate('es-NI', 'handover.usd')).toBe('Dólares');
    expect(translate('es-NI', 'handover.nio')).toBe('Córdobas');
    expect(translate('es-NI', 'handover.history')).toBe('Historial de cierres');
  });

  test('uses Nicaraguan Spanish in order history and cancellation details', () => {
    expect(translate('zh-CN', 'orderHistory.title')).toBe('历史订单');
    expect(translate('es-NI', 'orderHistory.title')).toBe('Historial de pedidos');
    expect(translate('es-NI', 'orderHistory.orderNumber')).toBe('N.º de pedido');
    expect(translate('es-NI', 'orderHistory.cancellationRecords')).toBe('Registro de cancelación');
    expect(translate('es-NI', 'orderHistory.filteredCollected')).toBe('Monto cobrado filtrado');
  });

  test('uses Nicaraguan accounting terms in financial reports and print labels', () => {
    expect(translate('zh-CN', 'finance.title')).toBe('财务报表');
    expect(translate('es-NI', 'finance.title')).toBe('Reportes financieros');
    expect(translate('es-NI', 'finance.cashIncome')).toBe('Ingresos en efectivo');
    expect(translate('es-NI', 'finance.shiftDifference')).toBe('Diferencia de caja');
    expect(translate('es-NI', 'finance.purchasePayment')).toBe('Compras pagadas');
    expect(translate('es-NI', 'finance.print.dailyReconciliation')).toBe('Conciliación del cierre diario');
  });

  test('uses Nicaraguan Spanish throughout the manager data overview', () => {
    expect(translate('zh-CN', 'dashboard.title')).toBe('数据概览');
    expect(translate('es-NI', 'dashboard.title')).toBe('Resumen de datos');
    expect(translate('es-NI', 'dashboard.calendar.title')).toBe('Calendario mensual de ventas');
    expect(translate('es-NI', 'dashboard.ranking.title')).toBe('Ranking de ventas');
    expect(translate('es-NI', 'dashboard.expenseRanking.title')).toBe('Ranking y participación de gastos');
    expect(translate('es-NI', 'dashboard.customer.peakHours')).toBe('Horas pico Top 5');
  });

  test('uses Nicaraguan Spanish throughout supplier account management', () => {
    expect(translate('zh-CN', 'supplier.title')).toBe('供应商账款中心');
    expect(translate('es-NI', 'supplier.title')).toBe('Centro de cuentas por pagar');
    expect(translate('es-NI', 'supplier.unpaid.title')).toBe('Compras pendientes');
    expect(translate('es-NI', 'supplier.paymentMethod.cash')).toBe('Efectivo');
    expect(translate('es-NI', 'supplier.statement.title')).toBe('Estado de cuenta del proveedor');
    expect(translate('es-NI', 'supplier.trace.open')).toBe('Ver trazabilidad de compra');
  });

  test('uses Nicaraguan Spanish throughout customer management', () => {
    expect(translate('zh-CN', 'customer.title')).toBe('客户中心');
    expect(translate('es-NI', 'customer.title')).toBe('Centro de clientes');
    expect(translate('es-NI', 'customer.segment.active')).toBe('Cliente activo');
    expect(translate('es-NI', 'customer.pointsRules')).toBe('Reglas de puntos');
    expect(translate('es-NI', 'customer.redeemTitle')).toBe('Canje de puntos');
    expect(translate('es-NI', 'customer.confirm.delete')).toContain('no se puede deshacer');
  });
});
