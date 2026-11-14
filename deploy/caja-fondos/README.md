# Parche de caja: fondos, turnos Diurno/Nocturno y PDF compacto

Preparado y probado localmente. No se desplegó ni se modificó MySQL de producción.

## Entrega limitada a producción

`production.patch` es la entrega consolidada: conserva el parche de fondos y añade los turnos identificados y su PDF compacto. Contiene únicamente ocho archivos de caja, comparados contra las fuentes de producción inspeccionadas: controlador de cierre, `salesShift.js`, `salesAccounting.js`, `SalesClosing.tsx`, `SaleDetailsModal.tsx`, `inventoryOperations.ts`, `salesClosingPdf.ts` y el nuevo `salesShiftPdf.ts`. En la utilidad compartida solo cambia el cálculo de caja; las funciones de compras y movimientos permanecen iguales. La versión anterior sigue disponible en el commit `77a139a`.

No desplegar el repositorio local completo ni hacer un `git pull` general para esta entrega: contiene otros desarrollos que no forman parte del parche. La ruta de eliminación permanece idéntica a producción. Ocho funciones del controlador, incluidas creación, eliminación con reintegro de lotes y finalización, conservan su código original. El manifiesto incluye sus huellas.

El parche no incluye DDL, migraciones, dependencias nuevas ni actualizaciones masivas. Funciona sin `anulada`, `motivo_anulacion`, `anulada_por` y `anulada_en`.

## Activación futura, aún no realizada

Se necesita un punto de corte permanente por ID global, independiente de la fecha elegida en el formulario y de los reinicios del servidor:

1. En una ventana de despliegue autorizada, detener temporalmente la entrada de registros y esperar que terminen las transacciones en curso.
2. Leer `COALESCE(MAX(venta_id), 0)` de `cierre_venta`. Este SELECT no cambia datos. No usar un valor calculado durante el desarrollo ni un límite por fecha o por turno.
3. Configurar ese valor exacto en `CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID` para todas las instancias del backend antes de reabrir el servicio. Compose ya carga `deploy/.env.cloud`; no requiere editar su estructura. Ningún archivo de entorno se modificó para preparar este parche.
4. Verificar los archivos base con `node deploy/caja-fondos/verify.cjs RUTA_COPIA before`, comprobar y aplicar el parche en una copia de las fuentes de producción, compilar y verificar con `node deploy/caja-fondos/verify.cjs RUTA_COPIA after` antes de publicar esa compilación. Si una huella no coincide, revisar la diferencia antes de aplicar.
5. Mantener el mismo límite permanentemente. No volver a calcularlo en cada despliegue.

Estos pasos documentan una operación futura; no se ejecutaron en AWS. Sin configuración y sin cierres versión 2 guardados, el parche mantiene íntegramente el comportamiento anterior. Por tanto, publicar el código sin fijar el límite todavía no activa la corrección.

Cada cierre nuevo tras activarse guarda en su JSON existente:

```json
{
  "accountingVersion": 2,
  "accountingStartAfterSaleId": "ID_FIJADO_AL_ACTIVAR",
  "shiftDocumentVersion": 1,
  "shiftPeriod": "diurno",
  "saleCount": 1,
  "total": 40,
  "cashFundTotal": 60,
  "receivedTotal": 100,
  "productQuantity": 0,
  "payments": [{ "code": "efectivo", "name": "Efectivo", "amount": 40 }],
  "paymentBreakdown": [{ "code": "efectivo", "name": "Efectivo", "salesAmount": 40, "cashFundAmount": 60, "receivedAmount": 100 }]
}
```

`total` representa ingresos según la versión aplicable; `cashFundTotal` suma exclusivamente fondos nuevos; `receivedTotal` conserva la suma de importes registrados de todas las formas de pago. No es un saldo físico de efectivo ni descuenta retiros.

El backend recupera también el límite de esos JSON tras un reinicio. Una configuración contradictoria produce un error sin actualizar datos. Antes del primer cierre versión 2, la variable permanente es indispensable para conservar el punto de activación.

## Conservación histórica y fechas mixtas

- Un JSON sin `accountingVersion: 2` es original. Se devuelve y muestra sin añadirle campos, cambiarlo ni reconstruir su resumen.
- Los comprobantes dentro de un turno original conservan siempre su tratamiento anterior. Los que aún no pertenecían a un turno también conservan ese tratamiento si su ID es menor o igual al límite.
- Solo un comprobante posterior al límite recibe campos de separación. Su importe, conceptos y pagos guardados permanecen intactos. El servicio cuyo nombre guardado es `Caja` identifica el fondo; un producto llamado Caja sigue siendo una venta.
- Un cierre nuevo puede incluir comprobantes anteriores pendientes: conserva su contribución original y separa únicamente los fondos de comprobantes nuevos. Guarda ambos resultados en un nuevo JSON; no toca turnos anteriores.
- En una fecha mixta, el resumen diario combina comprobantes con sus respectivas reglas. Los turnos cerrados se muestran con su propio resumen guardado. Ejemplo: un turno original de Q100 y uno nuevo con venta Q40/fondo Q60 muestran total diario Q140 según sus reglas, fondo nuevo Q60 y recibido Q200. El turno original sigue mostrando Q100.
- Los PDF históricos conservan los cálculos, texto y distribución originales. Solo los registros y cierres nuevos agregan el desglose. La fecha de generación del PDF puede cambiar al exportarlo de nuevo, como ya ocurría antes.
- No existe ningún proceso de reescritura histórica. El procedimiento DELETE de producción, sus permisos y el bloqueo de días finalizados se conservan.

## Turnos nuevos y documento compacto

El primer cierre de una fecha se identifica como **Diurno** y el segundo como **Nocturno**, sin horarios rígidos añadidos. El período se delimita mediante los ID de comprobantes, como ya funcionaba el módulo: después del cierre Diurno, los comprobantes nuevos pertenecen al Nocturno. La referencia opcional del usuario se conserva junto con la identificación del turno. Un turno anterior sin metadatos nuevos mantiene su nombre original; no se renombra retrospectivamente.

Se conserva el bloqueo transaccional del día y el índice único `(fecha, numero)`. Un intento repetido con el número ya cerrado devuelve 409 y no crea otro resumen. Cerrar Diurno no finaliza el día. Cerrar Nocturno tampoco cambia por sí solo el estado del día: **Finalizar día** mantiene su comportamiento existente, sin añadir un cierre vacío si no hay pendientes. Si el usuario registra movimientos adicionales antes de finalizar, el mecanismo existente guarda esos pendientes en otro cierre independiente, sin modificar los dos turnos ya guardados.

Los cierres creados tras esta actualización y con la activación de fondos vigente guardan `shiftDocumentVersion: 1`, el período y el desglose completo por medio de pago en el JSON existente. Los cierres del parche anterior, aunque tengan `accountingVersion: 2`, no se convierten al formato nuevo. No se requiere una segunda configuración de activación.

El botón **PDF del turno** solo aparece para los cierres con ese nuevo marcador. Reconsulta únicamente el turno guardado mediante GET y genera un resumen con logo, fecha, hora, responsable, ID del cierre, rango de comprobantes, cantidad de ventas, ingresos, fondos y total recibido. El desglose incluye columnas de ventas, fondos y recibido para cada forma de pago, incluso cuando esa forma solo recibió fondos. No consulta detalles ni reconstruye importes desde ventas actuales.

Los PDF normales de Diurno y Nocturno ocupan una página. El documento continúa en una segunda página si hay muchas formas de pago o nombres extensos, repitiendo la identificación del cierre. Un caso excepcional que exceda dos páginas produce un error explícito; nunca recorta medios de pago, agrupa importes ni genera un documento mayor de dos páginas. El PDF completo del día y los comprobantes individuales anteriores mantienen su generador y sus cálculos originales.

## Validación local

```powershell
node --test backend/tests/salesAccounting.test.js backend/tests/salesShift.test.js backend/tests/cierreVentasClosing.test.js backend/tests/cashFundPatch.test.js src/app/utils/inventoryOperations.test.js src/app/utils/salesClosingPdf.test.js src/app/utils/salesShiftPdf.test.js
npm run build
```

Integración opcional, exclusivamente contra MySQL local con catálogos existentes:

```powershell
$env:UNAVET_TEST_LOCAL_MYSQL='true'
# Opcional para una copia aislada: ruta al archivo local existente, sin copiarlo.
$env:UNAVET_TEST_ENV_FILE='RUTA_LOCAL/backend/.env'
node --test backend/tests/cashFundLocal.test.js
Remove-Item Env:UNAVET_TEST_LOCAL_MYSQL
Remove-Item Env:UNAVET_TEST_ENV_FILE
```

La prueba comprueba que DB_HOST sea loopback antes de conectar. Solo escribe en tablas TEMPORARY de su sesión y revierte sus datos. Simula la tabla de comprobantes sin las cuatro columnas, compara íntegramente 42 cierres sintéticos y todos sus comprobantes antes/después, prueba turnos mixtos, comprobantes antiguos pendientes, pagos mixtos, cierre diario, reinicios y DELETE sin motivo obligatorio. No carga datos clínicos de producción.

La prueba de PDF compara SHA-256 de todos los comandos de dibujo de un reporte histórico de 42 turnos (20 páginas) y de un comprobante individual contra la salida del código original de producción con datos sintéticos. También verifica importes, paginación y límites de página en reportes nuevos y mixtos, con revisión visual de los PNG generados. Estas huellas verifican contenido y distribución, no metadatos variables del archivo PDF.

Además, la integración prueba Diurno, registro de ventas Nocturnas, cierre Nocturno, intentos duplicados de ambos turnos, continuidad del día, sus rangos sin solapamiento y conservación del resumen después de DELETE y de finalizar el día. Las pruebas del PDF compacto comprueban ambos turnos, logo real, todos los importes, datos extensos en dos páginas y que miles de ventas no aumenten la paginación. Las pruebas y compilaciones se ejecutan localmente; no se modifica AWS.
