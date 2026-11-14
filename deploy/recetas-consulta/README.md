# Recetas: peso y procedimientos de la consulta

Rama independiente basada en `3393f18`, que conserva Caja y Grooming. No se modifican sus módulos, sus paquetes ni sus migraciones. No se desplegó código ni se modificó la base de datos de producción.

## Comportamiento

- La pantalla permite ingresar un peso opcional en kg o lb y muestra ambas unidades. Se usa la equivalencia exacta 1 lb = 0.45359237 kg. Solo se persisten kg, con seis decimales, en la receta; no se guardan dos pesos redundantes ni se actualiza el paciente. Se rechazan pesos no finitos, cero, negativos, unidades diferentes y valores de 10000 kg o superiores.
- Las fuentes y el esquema de pacientes/recetas revisados no contenían un campo de peso utilizado por el sistema. El nuevo dato pertenece a la consulta y queda relacionado con el paciente a través de `receta.paciente_id`.
- El catálogo existente `/api/catalogos/servicios` proporciona los servicios activos de categorías activas. La receta admite varios procedimientos y una cantidad entera de 1 a 1000 para cada uno. No se fijan precios de ejemplo en el código.
- El servidor consulta el precio vigente de cada servicio nuevo; no confía en precios ni totales enviados por el navegador. Guarda ID de servicio, nombre, descripción, precio unitario y cantidad como snapshot. Los subtotales y total se derivan en centavos; no se persisten totales duplicados. No hay impuestos o descuentos nuevos.
- Al editar una receta nueva se conservan los precios y descripciones que ya tenía, incluso si el catálogo cambia o se desactiva el servicio. Se pueden agregar otros servicios activos. El peso no depende del estado actual del paciente; corregirlo requiere editar expresamente esa receta. Cambiar de paciente exige indicar o borrar explícitamente el peso.
- Se mantienen los medicamentos obligatorios, sus indicaciones, modos de entrega y las operaciones existentes de inventario. Los procedimientos son documentación de la consulta: no generan ventas, pagos, salidas de inventario ni cobros. Guardar metadatos y medicamentos es una sola transacción.
- Consulta, edición, descarga y vista previa PDF muestran los nuevos datos. El PDF mantiene logo, colores, medicamentos, motivo, diagnóstico y observaciones. Los procedimientos se paginan repitiendo su encabezado, sin recortar descripciones o totales.

## Conservación histórica

No se rellena, actualiza ni recalcula ninguna receta existente. Solo las altas posteriores a la actualización incorporan una fila auxiliar. La presencia de esa fila identifica el formato nuevo (`consultationVersion: 1` en la API); su ausencia mantiene el objeto y el PDF originales, sin buscar un peso actual del paciente ni servicios actuales.

Las acciones preexistentes de editar medicamentos y anular recetas siguen disponibles con los mismos permisos. El formulario no permite incorporar los campos nuevos a recetas anteriores y el backend rechaza ese intento. No se cambia automáticamente la información clínica de recetas anteriores.

Se compararon las instrucciones de dibujo del PDF histórico contra las fuentes verificadas en producción, con datos sintéticos y reloj fijo. Se guardó su SHA-256 en la prueba. Las pruebas locales comparan también una receta anterior y su fila original antes/después, sin cambios.

## Migración para revisión

Archivo: `backend/src/scripts/prescriptionConsultationMigration.sql`.

Crea exclusivamente `receta_consulta` con:

- `receta_id BIGINT UNSIGNED`: clave primaria y FK a la receta existente.
- `peso_kg DECIMAL(10,6) NULL`: peso de la consulta, opcional.
- `procedimientos JSON NOT NULL`: lista de snapshots de servicios.

No añade columnas a tablas existentes, no modifica pacientes o historiales y no contiene backfill ni DML. La FK preserva la relación con la receta; el procedimiento actual de anulación no elimina esa fila. No se crean referencias con borrado en cascada al catálogo de servicios, para conservar sus descripciones históricas.

Los tipos y el motor InnoDB de `receta`, `servicio` y `categoria_servicio` se verificaron con una transacción de solo lectura en AWS. Las fuentes de Recetas, sus rutas, el catálogo, inventario, texto clínico y encabezado PDF coinciden con la base inspeccionada. La tabla nueva todavía no existe en producción.

La migración completa se probó dos veces en tablas locales con prefijo aleatorio, incluida la FK, precisión decimal, JSON, restricción de borrado y limpieza. La integración funcional usa tablas TEMPORARY aisladas. No se aplicó a tablas reales de la clínica.

Antes de publicar el formulario nuevo hay que revisar y aplicar la migración. DDL requiere permisos, puede esperar bloqueos de metadatos y produce commits implícitos. `IF NOT EXISTS` no verifica una tabla preexistente de estructura diferente: hay que comprobarla si el nombre ya existe. No hay un ejecutor automático al arrancar el servidor.

Sin migración, las lecturas y solicitudes antiguas mantienen su funcionamiento. Las solicitudes con datos nuevos reciben 503 en lugar de perder el peso o los procedimientos. Una reversión a código antiguo no mostraría estos datos: conservar la tabla y utilizar código compatible; no eliminar los snapshots para retroceder.

## Paquete para futura actualización

`production.patch` modifica cinco archivos de Recetas y no ejecuta el SQL. `manifest.json` contiene hashes SHA-256 normalizados a LF y las fuentes compartidas de control. `verify.cjs` es de solo lectura y no abre conexiones a la base de datos.

Sobre una copia local de las fuentes de producción con los parches anteriores de Caja y Grooming preparados:

```powershell
node deploy/recetas-consulta/verify.cjs RUTA before
git -C RUTA apply --check RUTA_ABSOLUTA/production.patch
git -C RUTA apply RUTA_ABSOLUTA/production.patch
node deploy/recetas-consulta/verify.cjs RUTA after
```

No desplegar todo el repositorio local: contiene otros desarrollos fuera de estos parches. Coordinar la migración revisada y la publicación de las instancias; este trabajo no ejecuta ninguna de esas acciones.

## Validación

```powershell
node --test backend/tests/prescriptionHistory.test.js backend/tests/prescriptionConsultation.test.js backend/tests/prescriptionPackage.test.js src/app/utils/prescriptionConsultation.test.js
npm test
npm run build
```

Para las integraciones MySQL, activar `UNAVET_TEST_LOCAL_MYSQL=true` y, si hace falta, indicar un archivo local existente con `UNAVET_TEST_ENV_FILE`. Ejecutar `node --test backend/tests/prescriptionConsultationLocal.test.js`. La prueba rechaza conexiones que no sean a localhost. No hay datos clínicos, secretos ni archivos PDF temporales en el commit.

La suite general detecta una discrepancia anterior en `backend/tests/routePermissions.test.js`: espera `POST /:id/anular` en Caja, mientras el parche compatible con producción conserva la eliminación mediante DELETE. Ambos archivos están sin cambios respecto de `3393f18`. Esta entrega no introduce la anulación ni sus columnas ausentes en producción para satisfacer esa expectativa desactualizada.
