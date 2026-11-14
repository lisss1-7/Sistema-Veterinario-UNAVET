// El nombre del concepto se guarda desde el catálogo al registrar el detalle.
// Usar esa copia conserva la clasificación de Caja aunque se edite el catálogo.
const cashFundCondition = (alias) =>
  `(${alias}.tipo = 'Servicio' AND TRIM(${alias}.descripcion) = 'Caja')`;

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

// Mantener los pagos originales y separar su parte de fondo en centavos.
// El reparto acumulado evita perder centavos en comprobantes con pagos mixtos.
const splitCashFundPayments = (payments, total, cashFundTotal) => {
  const amounts = payments.map((payment) => Math.round(Number(payment.amount) * 100));
  const paid = amounts.reduce((sum, amount) => sum + amount, 0);
  const ratio = total > 0 ? Math.min(1, Math.max(0, cashFundTotal / total)) : 0;
  const fund = Math.round(paid * ratio);
  let processed = 0;
  let allocated = 0;
  return payments.map((payment, index) => {
    processed += amounts[index];
    const through = paid > 0 ? Math.round(fund * processed / paid) : 0;
    const cashFundAmount = (through - allocated) / 100;
    allocated = through;
    return { ...payment, cashFundAmount };
  });
};

const parseCutoff = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (!/^(0|[1-9]\d*)$/.test(String(value)) || BigInt(value) > 18446744073709551615n) {
    throw new Error('El límite de activación de fondos debe ser un ID MySQL válido');
  }
  return String(value);
};

// No inferir la activación de la hora de arranque: cambiaría tras reiniciar.
// Los nuevos snapshots conservan el límite incluso si se omite la variable.
const getAccountingCutoff = async (connection) => {
  const configured = parseCutoff(process.env.CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID);
  const [rows] = await connection.query(`
    SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(resumen, '$.accountingStartAfterSaleId')) AS accounting_cutoff
    FROM cierre_venta_turno
    WHERE JSON_EXTRACT(resumen, '$.accountingVersion') = 2`);
  const saved = rows.map(row => parseCutoff(row.accounting_cutoff));
  if (saved.some(value => value === null) || new Set(saved).size > 1 ||
      (configured !== null && saved.length && configured !== saved[0])) {
    throw new Error('El límite de fondos no coincide con los cierres guardados; revise la configuración');
  }
  return saved[0] ?? configured;
};

const saleAccountingVersion = (id, shifts, cutoff) => {
  const saleId = BigInt(id);
  const shift = shifts.find(row => saleId > BigInt(row.afterSaleId) && saleId <= BigInt(row.throughSaleId));
  // Un snapshot sin versión siempre conserva el cálculo original.
  if (shift) {
    if (shift.summary.accountingVersion !== 2) return 1;
    cutoff = parseCutoff(shift.summary.accountingStartAfterSaleId);
    if (cutoff === null) throw new Error('El cierre nuevo no contiene su límite de activación');
  }
  return cutoff !== null && saleId > BigInt(cutoff) ? 2 : 1;
};

module.exports = { cashFundCondition, roundMoney, splitCashFundPayments, parseCutoff, getAccountingCutoff, saleAccountingVersion };
