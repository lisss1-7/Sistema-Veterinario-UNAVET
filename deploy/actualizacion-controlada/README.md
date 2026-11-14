# UNAVET: entrega conjunta para una actualización controlada

Estado: preparada y probada localmente. Este documento describe una operación futura. No se ejecutaron despliegues, migraciones, cambios de configuración ni respaldos en AWS durante esta preparación.

## Alcance de las ocho mejoras

| Mejora | Paquete | Verificación principal |
| --- | --- | --- |
| Separación de fondos e ingresos de Caja | `caja-fondos` | comprobantes nuevos, pagos mixtos, 42 cierres sintéticos anteriores y fechas mixtas |
| Cierres Diurno y Nocturno independientes | `caja-fondos` | continuidad de ventas, rangos sin solapamiento, duplicados y finalización del día |
| PDF compacto del turno | `caja-fondos` | uno o dos folios, importes y logo; huellas del PDF histórico |
| Forma de pago prevista de Grooming | `grooming-rutas` | efectivo, tarjeta, transferencia y catálogo desactivado |
| Capacidad de transporte por rutas | `grooming-rutas` | cupo diario, tutores distintos y reactivación |
| Varias mascotas por ruta | `grooming-rutas` | una, tres y cuatro mascotas, precios individuales diferentes, costo único de transporte, cancelación y reprogramación individuales |
| Peso en kg y lb por receta | `recetas-consulta` | conversión, validaciones, snapshot y PDF |
| Procedimientos con precios por receta | `recetas-consulta` | catálogo, varios procedimientos, centavos, precios históricos y medicamentos sin cobros automáticos |

La prueba de permisos ahora exige la ruta real `DELETE /:id` de Caja, JWT, permiso `inventory/eliminar` y su controlador original. También rechaza la presencia de rutas de anulación lógica. No se agregaron `anulada`, `motivo_anulacion`, `anulada_por` ni `anulada_en`. No cambió ningún archivo de ejecución para cerrar esta entrega: solo pruebas y documentación/verificación del paquete.

## Archivos de entrega y orden

`release.json` fija el orden y las huellas SHA-256 de los tres parches, sus manifiestos y los dos SQL. `verify.cjs` comprueba esa integridad y las fuentes de destino, sin conectarse a servicios ni escribir archivos. Los hashes de los parches usan sus bytes exactos; los de fuentes y demás textos normalizan CRLF a LF.

| Orden de preparación | Parche | SQL, aplicado después durante la ventana |
| --- | --- | --- |
| 1 | `deploy/caja-fondos/production.patch` | Ninguno |
| 2 | `deploy/grooming-rutas/production.patch` | `backend/src/scripts/groomingTransportMigration.sql` |
| 3 | `deploy/recetas-consulta/production.patch` | `backend/src/scripts/prescriptionConsultationMigration.sql` |

Los tres parches cambian **20 archivos** en total. Incluyen las migraciones como archivos; `git apply` no ejecuta SQL. La migración de Grooming crea primero `grooming_transporte_ruta` y después `grooming_operacion`; la de Recetas crea `receta_consulta`. Son tres tablas auxiliares en total, sin ALTER de tablas existentes, sin backfill, sin actualización masiva y sin recalcular registros anteriores.

Los parches se regeneraron con `git diff` en Git de Linux sobre una copia limpia de las fuentes reales de producción. Conservan los mismos hashes funcionales finales de los 20 archivos y de ambos SQL, y los finales CRLF de los archivos de producción que los utilizan. No eliminar espacios al final de las líneas de contexto: una línea vacía del archivo original debe representarse con un prefijo de espacio en el parche. `.gitattributes` impide convertir sus bytes y reconoce ese espacio como parte del formato; el verificador rechaza contextos vacíos sin prefijo. El informe `LINUX-VERIFICATION.json` identifica el Git utilizado y las comprobaciones consecutivas. No usar los `.patch` del commit `aad1971` ni reformatearlos al transferirlos; distribuirlos con `git archive` o una copia binaria.

**No hacer `git pull` ni desplegar el checkout completo de esta rama.** Su historia contiene desarrollos ajenos al alcance. La entrega es una copia de las fuentes que realmente estén en producción, más estos tres parches. No incluye el administrador oculto, otras migraciones de inventario ni modificaciones adicionales del repositorio.

## 1. Preparar y ensayar fuera de producción

1. Fijar el commit aprobado de esta rama y conservar su ID completo. Copiar únicamente el directorio de entrega y los tres paquetes; comprobar `release.json` contra ese commit. No incluir secretos, expedientes o respaldos en Git.
2. Obtener una copia privada de las fuentes efectivamente instaladas y conservar el original sin editar. Los manifiestos corresponden a las fuentes previamente inspeccionadas en AWS. **Volver a comprobarlas antes de publicar:** una actualización externa posterior puede invalidar esta compatibilidad.
3. En una copia nueva de esas fuentes, ejecutar desde la entrega:

```powershell
node deploy/actualizacion-controlada/verify.cjs RUTA_COPIA before
git -C RUTA_COPIA apply --check RUTA_ENTREGA/deploy/caja-fondos/production.patch
git -C RUTA_COPIA apply RUTA_ENTREGA/deploy/caja-fondos/production.patch
git -C RUTA_COPIA apply --check RUTA_ENTREGA/deploy/grooming-rutas/production.patch
git -C RUTA_COPIA apply RUTA_ENTREGA/deploy/grooming-rutas/production.patch
git -C RUTA_COPIA apply --check RUTA_ENTREGA/deploy/recetas-consulta/production.patch
git -C RUTA_COPIA apply RUTA_ENTREGA/deploy/recetas-consulta/production.patch
node deploy/actualizacion-controlada/verify.cjs RUTA_COPIA after
```

Usar rutas absolutas para los archivos `.patch`. Si hay una huella diferente, rechazo o conflicto, detener la preparación y revisar la diferencia: no forzar el parche ni sustituir archivos enteros. La comprobación conjunta incluye las rutas y utilidades compartidas que deben permanecer iguales.

4. Comparar la copia final con el original. Solo deben aparecer los 20 archivos del paquete; no editar dependencias, Dockerfile, Compose, permisos ni otros módulos. Compilar esta copia y preparar una imagen con etiqueta única, sin reemplazar la imagen anterior. Reutilizar los lockfiles y el Dockerfile efectivos de producción. Registrar ID y digest de ambas imágenes y verificar la imagen nueva en un entorno aislado.
5. Ensayar los dos SQL contra una copia aislada del esquema, con datos sintéticos. Las pruebas locales automatizadas ya comprueban el DDL completo y su idempotencia. No conectar los tests ni esta copia a MySQL de producción.
6. Confirmar motores InnoDB, compatibilidad JSON y tipos de FK: tutor/cita/receta BIGINT UNSIGNED; tipo_grooming INT; forma_pago INT UNSIGNED. Comprobar las tablas, índices, horarios y catálogos existentes de Caja y Grooming. Si ya existen las tres tablas nuevas, revisar `SHOW CREATE TABLE`: `IF NOT EXISTS` no corrige un esquema incompatible.

## 2. Ventana y respaldo verificable antes de cambiar datos

La ejecución futura debe contar con ventana acordada, responsable de publicación y responsable de validación financiera/clínica. Evitar un cambio de turno mientras se realiza la actualización.

1. Activar mantenimiento para los usuarios y bloquear todas las entradas de escritura, incluidas otras instancias, integraciones y tareas que escriban. Esperar las transacciones en curso y comprobar que no queden solicitudes activas. Detener el servicio `app` ordenadamente; el backend ya cierra HTTP y el pool ante SIGTERM. No detener ni borrar el volumen MySQL o los volúmenes de medios.
2. Crear un respaldo completo nuevo y privado **con la actividad detenida**. El procedimiento disponible es `deploy/backups/unavet-backup.py`, instalado normalmente como `/usr/local/sbin/unavet-backup.py`; su unidad es `unavet-backup.service`. Verificar instalación y rutas antes de usarlo. Si está instalado, `sudo systemctl start unavet-backup.service` ejecuta ese respaldo; comprobar el resultado y no asumir éxito solo por la fecha del archivo. Este comando no se ejecutó en esta preparación.
3. El respaldo usa `mysqldump --single-transaction` con rutinas, eventos, triggers y blobs, e incluye fuentes/configuración privada, medios, Compose y configuración del servidor. Verifica lectura del archivo, número de tablas y SHA-256. La captura de medios en línea no es atómica: por eso aquí se exige detener escrituras antes. El JSON de `npm run backup:database` no sustituye este respaldo consistente y su ensayo de restauración.
4. Conservar el archivo y su `.sha256` en un directorio privado de esta actualización, fuera de la rotación de siete copias del trabajo automático. Comprobar `last-success.json`, `sha256sum -c`, integridad gzip/tar y lectura del manifiesto. Copiar a una ubicación separada y cifrada bajo control del hospital: el script existente no hace copia externa.
5. Guardar además la imagen anterior exportada con `docker image save`, su ID/digest, la configuración de ejecución efectiva y el archivo de entorno privado. El respaldo de fuentes excluye `dist` y `node_modules`; por sí solo no contiene la imagen lista para arrancar. Guardar la imagen nueva aprobada y el cambio de configuración propuesto. Mantener permisos privados y no imprimir credenciales en la terminal o en logs compartidos.
6. Restaurar el respaldo en **otra** base y ubicación de medios, aisladas y sin conexiones de escritura a producción. Comprobar tablas, relaciones, acceso y archivos. No ensayar la restauración sobre la base activa. Un snapshot manual de Lightsail puede ser una copia adicional; no sustituye el dump verificado ni garantiza por sí solo consistencia de MySQL.
7. Capturar privadamente la lista completa de **todos los cierres existentes al iniciar la actualización**, sus IDs, filas completas y JSON `resumen`, y todos los comprobantes/detalles/pagos anteriores; incluir una muestra de grooming/recetas anteriores. Producción tenía 43 cierres en la última inspección: no fijar 42 ni 43 como cantidad esperada. Obtenerla de la captura consistente de esta ventana y comparar después el mismo conjunto por ID y contenido, no solo su cantidad. Guardar la exportación ordenada, SHA-256, totales visibles y muestras de PDF. La fecha de generación puede variar al regenerar un PDF, como antes. Si aparecen escrituras o cambia el conjunto mientras debería estar congelado, detenerse e investigar; no eliminar ni excluir registros para ajustar una cantidad.

Si falla el respaldo, su verificación, el ensayo o cualquier precondición, no ejecutar migraciones ni publicar. Mantener el sistema anterior o salir de mantenimiento con él, según corresponda.

## 3. Punto de corte de Caja, migraciones y publicación única

Con las escrituras todavía bloqueadas y la aplicación detenida:

1. Consultar si ya existen cierres con `accountingVersion: 2` y recuperar `accountingStartAfterSaleId` de sus JSON. Revisar también la configuración efectiva privada de todas las instancias. Si ya hay un límite, conservarlo exactamente; si existen límites contradictorios, detenerse y resolver la discrepancia sin reescribir cierres.
2. **Solo para la primera activación**, leer `SELECT COALESCE(MAX(venta_id), 0) FROM cierre_venta;`. Registrar ese ID global como cadena decimal en el acta privada y el respaldo de configuración. No usar fecha, número de turno, un valor de desarrollo ni el máximo después de reabrir las ventas.
3. Configurar `CASH_FUND_ACCOUNTING_START_AFTER_SALE_ID=ID_CAPTURADO` en el archivo privado efectivo `deploy/.env.cloud`, igual para todas las instancias. Solo cambia esa variable. Mantenerla permanentemente, sin recalcularla en reinicios, reintentos o futuras actualizaciones. Aunque los JSON nuevos permiten recuperarla, antes del primer cierre versión 2 esa variable es indispensable.
4. Con un cliente MySQL autorizado para DDL, seleccionado explícitamente el nombre de base aprobado, ejecutar **solo** `groomingTransportMigration.sql` y después `prescriptionConsultationMigration.sql`. Confirmar que sus hashes coinciden con `release.json`. No ejecutar scripts `migrate:*` generales. No desactivar FK ni cambiar SQL modes para forzar la migración. El servicio permanece parado: ninguna petición puede leer un esquema creado parcialmente.
5. Revisar `SHOW CREATE TABLE`, claves e índices de las tres tablas nuevas. Comparar los IDs y las huellas históricas con la captura previa. No debe existir DML sobre registros anteriores. Los CREATE producen commits implícitos y pueden esperar bloqueos de metadatos; un ROLLBACK de MySQL no los deshace.
6. Publicar **una sola versión** con los tres parches, frontend y backend juntos. Apuntar Compose a la etiqueta única de imagen aprobada mediante la configuración controlada de esta ventana, preservando puertos, volúmenes, secretos y demás valores. No dejar instancias antiguas atendiendo tráfico junto con las nuevas. No ejecutar `docker compose down -v`, limpieza de volúmenes ni borrado de imágenes de recuperación.
7. Mantener acceso restringido al equipo verificador hasta concluir los controles siguientes. El código sin el límite no activa la separación de fondos; el código sin las tablas rechaza guardar los campos nuevos. Ambas precondiciones deben estar listas antes de abrir al hospital.

Los comprobantes con ID menor o igual al corte y los cierres sin versión nueva conservan sus reglas. Los cierres nuevos guardan `accountingVersion: 2`, límite permanente, `shiftDocumentVersion: 1` y desglose. Las fechas con turnos anteriores y nuevos se resuelven por la versión de cada registro, sin modificar los resúmenes guardados. No hace falta finalizar ni recalcular ningún cierre anterior para activar el cambio.

## 4. Verificaciones antes y después de reabrir

En la copia aislada, completar todos los escenarios de escritura y eliminación antes de la ventana. En producción no insertar ventas, citas o recetas ficticias ni generar cierres de prueba que quedarían permanentes: usar controles de lectura y acompañar las primeras operaciones reales autorizadas.

- Salud: `/api/health`, estado saludable del contenedor, conexión MySQL, inicio de sesión, roles, acceso desde navegador, medios y ausencia de errores nuevos. El endpoint de salud no sustituye las pruebas funcionales.
- Integridad: ejecutar `verify.cjs ... after` sobre las fuentes efectivas de la imagen preparada. Comparar todos los cierres capturados al iniciar la ventana por ID, filas/JSON y totales visibles con el respaldo. Exigir igualdad del conjunto completo, sin una cantidad histórica fija. Comparar importes, detalles y pagos de comprobantes anteriores; consultas/PDF de cierres, grooming y recetas anteriores. No sobrescribir capturas para ocultar diferencias.
- Caja: revisar que el límite efectivo coincida con el acta. En las primeras operaciones reales, fondo separado de ingreso, suma recibido = ventas + fondos nuevos según la versión; desglose correcto por medio de pago. Los comprobantes antiguos pendientes conservan su contribución original. Diurno permite seguir vendiendo; Nocturno no repite sus IDs; un intento duplicado se rechaza; finalizar día mantiene su comportamiento. PDF del turno con responsable, cantidades, importes y máximo dos páginas.
- Grooming: ruta única para hasta cuatro mascotas del mismo tutor/domicilio, citas y expedientes individuales, precios distintos conservados, transporte una vez, medios del catálogo, capacidad por rutas. Una cancelación o reprogramación individual no altera a las compañeras. Verificar que seleccionar pago no genera venta. No cambiar precios de rutas compartidas desde una sola cita.
- Recetas: kg y lb con equivalencia, peso de la consulta conservado en recetas anteriores, varios procedimientos con sus precios y totales, medicamentos e indicaciones presentes, descarga y vista previa. Cambiar un precio del catálogo no cambia el snapshot emitido. No hay ventas ni cobros por documentar procedimientos.
- Permisos/eliminación: JWT y permisos permanecen. La eliminación de ventas sigue siendo DELETE con sus controles e inventario anteriores; no se requiere motivo de anulación ni existen columnas nuevas. Probar la eliminación solo en el ensayo aislado o con una operación real expresamente solicitada.
- Seguimiento: revisar logs privados y las primeras operaciones reales, conciliación financiera y clínica, y generar un respaldo nuevo después de la aceptación. Registrar hora, imagen, corte, resultados y responsable. Conservar el respaldo anterior y el posterior fuera de rotación durante el período de recuperación acordado.

## 5. Recuperación según el momento del fallo

| Situación | Acción segura |
| --- | --- |
| Falla un parche, hash, compilación o ensayo, sin tocar producción | Descartar únicamente la copia de preparación. Producción sigue con la versión anterior. Revisar antes de reintentar. |
| DDL parcial o imagen nueva fallida, **sin operaciones nuevas** | Mantener mantenimiento. Capturar estado y error; verificar que no hubo nuevas citas/recetas/ventas/cierres y comparar históricos. Se puede volver a la imagen anterior guardada y su configuración probada. Dejar las tablas auxiliares creadas intactas; no hace falta borrarlas. Conservar el corte reservado para el reintento y no resetear volúmenes. Revisar tablas antes de repetir CREATE. |
| Ya se aceptaron operaciones con rutas, snapshots o fondos nuevos | Volver a mantenimiento, detener escrituras y hacer otro respaldo del estado actual. **No arrancar ciegamente la versión antigua:** no entiende los nuevos costos de ruta, snapshots ni reglas de fondos. Conservar tablas, datos y corte; reparar hacia adelante o usar una imagen de recuperación comprobada que interprete exactamente estos formatos. Si no existe, mantener mantenimiento mientras se prepara la corrección. |
| Es imprescindible recuperar desde respaldo tras operaciones nuevas | Restaurar primero en un entorno separado, nunca encima de la base activa. Conciliar todas las operaciones posteriores al respaldo y recuperar mediante registros/binlogs si existen y estaban habilitados; no suponer que hay recuperación a un punto en el tiempo. Resolver diferencias con el hospital antes de cualquier sustitución de datos. Restaurar el respaldo anterior directamente perdería operaciones y no es una recuperación automática aceptable. |

Antes de cualquier restauración futura sobre producción se requiere una decisión explícita del responsable con el inventario de operaciones afectadas, preservando el estado fallido y sin destruir la única copia de datos nuevos. Ningún paso de este documento autoriza procesos masivos sobre históricos, recálculos, DROP de tablas, borrado de volúmenes o reinicio del límite de Caja.

## Pruebas reproducibles locales

Desde el checkout de validación, no desde AWS:

```powershell
npm test
$env:UNAVET_TEST_LOCAL_MYSQL='true'
# Opcional: ruta a un .env local existente; no copiarlo al paquete.
$env:UNAVET_TEST_ENV_FILE='RUTA_LOCAL/backend/.env'
try {
  node --test backend/tests/cashFundLocal.test.js backend/tests/groomingTransportLocal.test.js backend/tests/groomingMigrationLocal.test.js backend/tests/prescriptionConsultationLocal.test.js
} finally {
  Remove-Item Env:UNAVET_TEST_LOCAL_MYSQL
  Remove-Item Env:UNAVET_TEST_ENV_FILE
}
npm run build
```

Las integraciones rechazan DB_HOST no local. Las escrituras funcionales usan tablas TEMPORARY; las pruebas DDL crean y retiran solo tablas con prefijos aleatorios propios. La prueba conjunta de paquetes reconstruye la base verificada y aplica secuencialmente los tres parches en una carpeta temporal, comparando todos los hashes. Ninguna prueba accede a AWS ni modifica datos de la clínica. Consultar `RESULTADOS.md` para los resultados de esta entrega.
