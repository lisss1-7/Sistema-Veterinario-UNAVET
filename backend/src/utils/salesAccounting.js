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

module.exports = { cashFundCondition, roundMoney, splitCashFundPayments };
