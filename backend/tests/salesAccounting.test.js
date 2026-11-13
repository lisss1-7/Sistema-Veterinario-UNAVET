const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCashFundPayments } = require('../src/utils/salesAccounting');

test('separa fondo de pagos mixtos sin modificar los importes registrados', () => {
  const payments = [{ code: 'efectivo', amount: 60 }, { code: 'tarjeta', amount: 30 }];
  assert.deepEqual(splitCashFundPayments(payments, 90, 30), [
    { code: 'efectivo', amount: 60, cashFundAmount: 20 },
    { code: 'tarjeta', amount: 30, cashFundAmount: 10 },
  ]);
  assert.deepEqual(payments, [{ code: 'efectivo', amount: 60 }, { code: 'tarjeta', amount: 30 }]);
});

test('conserva cada centavo al repartir fondos entre varios pagos', () => {
  const payments = splitCashFundPayments([{ amount: 0.01 }, { amount: 0.01 }, { amount: 0.01 }], 0.03, 0.01);
  assert.equal(payments.reduce((sum, payment) => sum + Math.round(payment.cashFundAmount * 100), 0), 1);
  assert.equal(payments.reduce((sum, payment) => sum + Math.round((payment.amount - payment.cashFundAmount) * 100), 0), 2);
});

test('solo fondo, venta normal y comprobante de importe cero conservan su clasificación', () => {
  assert.deepEqual(splitCashFundPayments([{ amount: 100 }], 100, 100), [{ amount: 100, cashFundAmount: 100 }]);
  assert.deepEqual(splitCashFundPayments([{ amount: 100 }], 100, 0), [{ amount: 100, cashFundAmount: 0 }]);
  assert.deepEqual(splitCashFundPayments([{ amount: 0 }], 0, 0), [{ amount: 0, cashFundAmount: 0 }]);
});
