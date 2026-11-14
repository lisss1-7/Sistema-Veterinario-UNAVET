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


const { parseCutoff, getAccountingCutoff, saleAccountingVersion } = require('../src/utils/salesAccounting');

test('el limite es permanente y admite BIGINT sin perder precision', () => {
  assert.equal(parseCutoff(undefined), null);
  assert.equal(parseCutoff('18446744073709551615'), '18446744073709551615');
  for (const invalid of ['-1', '01', '1 OR 1=1', '1.5', '18446744073709551616']) assert.throws(() => parseCutoff(invalid));
  assert.equal(saleAccountingVersion('9007199254740993', [], '9007199254740992'), 2);
  assert.equal(saleAccountingVersion('9007199254740992', [], '9007199254740992'), 1);
});

test('el snapshot antiguo tiene prioridad incluso frente a un limite configurado incorrectamente', () => {
  const shifts = [{ afterSaleId: '0', throughSaleId: '100', summary: { total: 500 } },
    { afterSaleId: '100', throughSaleId: '200', summary: { accountingVersion: 2, accountingStartAfterSaleId: '150' } }];
  assert.equal(saleAccountingVersion('100', shifts, '0'), 1);
  assert.equal(saleAccountingVersion('150', shifts, '0'), 1);
  assert.equal(saleAccountingVersion('151', shifts, null), 2);
  assert.equal(saleAccountingVersion('201', shifts, '150'), 2);
});

test('el limite guardado sobrevive reinicios y rechaza configuraciones contradictorias', async t => {
  const previous = process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
  t.after(() => { if (previous === undefined) delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID; else process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = previous; });
  delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
  assert.equal(await getAccountingCutoff({ query: async () => [[]] }), null);
  const saved = { query: async () => [[{ accounting_cutoff: '150' }]] };
  assert.equal(await getAccountingCutoff(saved), '150');
  process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '150';
  assert.equal(await getAccountingCutoff(saved), '150');
  process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID = '151';
  await assert.rejects(getAccountingCutoff(saved), /no coincide/);
  delete process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID;
  await assert.rejects(getAccountingCutoff({ query: async () => [[{ accounting_cutoff: '150' }, { accounting_cutoff: '151' }]] }), /no coincide/);
  await assert.rejects(getAccountingCutoff({ query: async () => [[{ accounting_cutoff: null }]] }), /no coincide/);
});
