# Inventario: acceso exclusivo para la cuenta admin

El paquete base public? inicialmente los cuatro apartados para la cuenta activa cuyo identificador de acceso es exactamente `admin`. La contraseña no se incorpora al código ni se cambia. Se mantienen JWT y los permisos de Inventario para cada acción. El servidor resuelve la cuenta en MySQL; los demás administradores también reciben 403 en estas API. La comprobación de interfaz falla cerrada.

## Entrega limitada

El manifiesto y production.patch se prepararon sobre las fuentes reales de AWS posteriores a las extensiones de Grooming y Recetas. Son ocho archivos de ejecución. No desplegar esta rama completa ni ejecutar git pull: contiene otras funcionalidades locales de inventario que no se publican. En particular se conserva la ficha y el ajuste de stock que ya funcionan en producción, las ventas con eliminación física, los cálculos/versiones de Caja y las extensiones de Grooming y Recetas. No cambian dependencias, Node.js 24.22.2, configuración ni volúmenes.

Comprobar primero las huellas `before` con verify.cjs sobre una copia privada nueva de las fuentes reales; comprobar/aplicar production.patch con Git en Linux y validar `after`. Revisar el diff de esa copia: exactamente los ocho archivos del manifiesto. Compilar el frontend con sus package.json y package-lock.json reales, no con el checkout local general. Construir una imagen derivada de la imagen de producción preservada, copiando únicamente estos cambios de backend y el frontend compilado.

## Base de datos

`compras.sql` crea exclusivamente `compra_inventario` y `compra_inventario_detalle`, con restricciones de integridad, costos por lote y clave única de recepción. Aprovecha proveedor, producto_inventario, lote_producto, movimiento_inventario y auditoria existentes. No hace ALTER, backfill ni cambios a Caja o datos previos. Probarlo y comprobar idempotencia en una restauración aislada antes de aplicarlo. No ejecutar `addInventoryOperations.js` en AWS: ese script local también incorpora columnas de anulación de ventas que no forman parte de esta entrega.

Las compras confirmadas incrementan las existencias de los lotes y generan movimientos, sin registrar ventas ni ingresos en Caja. Los reintentos con la misma clave no duplican stock. Una compra utilizada no se puede anular si ya no quedan sus unidades; una anulación válida conserva el documento y sus movimientos. Los movimientos previos sin documento de compra siguen identificados como históricos.

## Respaldo, publicación y recuperación

Preparar y probar antes de interrumpir el acceso. Comprobar transacciones/consultas activas y drenar solicitudes. Durante una pausa breve bloquear acceso con mantenimiento y detener ordenadamente solo el servicio app. Crear un respaldo completo privado con el script instalado, conservándolo fuera de rotación, verificar SHA/gzip/tar y restauración aislada, y preservar imagen anterior, fuentes, Compose y configuración privada. Capturar dinámicamente todas las tablas y cierres existentes con sus huellas; no usar cantidades históricas fijas.

Aplicar solamente compras.sql, verificar ambos SHOW CREATE TABLE y que las tablas nuevas estén vacías. Publicar los ocho archivos verificados y cambiar únicamente la imagen en Compose. Recrear solo app, sin eliminar volúmenes. Antes de reabrir comprobar Node, configuración, volúmenes, fuentes y activos servidos, salud HTTP/MySQL, acceso exclusivo admin, 401 sin sesión, 403 para otros usuarios, y lectura normal de Inventario/Caja/Grooming/Recetas. Comparar todas las tablas históricas y medios con la captura congelada. Reabrir únicamente con verificaciones satisfactorias.

Si falla una comprobación de integridad, detener el procedimiento y conservar evidencia. Antes de habilitar escrituras, la imagen y fuentes anteriores pueden recuperarse conservando ambas tablas nuevas y sin restaurar la base de datos. Después de habilitar escrituras, bloquearlas de nuevo, respaldar información nueva y evaluar recuperación; no restaurar automáticamente un dump ni eliminar tablas, compras, lotes o movimientos nuevos.

## Pruebas

Pruebas de cuenta real resuelta por ID, privilegios de otros administradores rechazados, errores de verificación cerrados, JWT/permisos/rutas existentes conservados, SQL limitado a dos tablas. Integración sobre MySQL aislado: proveedor, compra, múltiples lotes/precios, reintentos, conflictos, ventas, eliminación física con devolución de stock, anulación de compras utilizadas/bloqueadas, rollback completo ante un detalle inválido, movimientos e historial y cadena HTTP/JWT/permisos. Ningún dato de prueba se introduce en producción.
