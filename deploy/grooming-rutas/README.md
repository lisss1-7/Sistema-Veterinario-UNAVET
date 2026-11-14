# Grooming: formas de pago y rutas compartidas

Implementación local en una rama basada en `19d139d`, que conserva los cambios anteriores de Caja. No se modificó AWS ni ningún dato de producción. Las consultas a producción fueron únicamente de lectura para comparar fuentes, tipos de columnas y motores de tablas.

## Funcionamiento

- El formulario carga las formas de pago activas desde `/api/catalogos/formas-pago`. Guarda el identificador del catálogo, muestra el nombre en consulta/edición y permite conservar en una cita un medio posteriormente desactivado. Es una forma de pago **prevista**: no inserta ventas, cobros ni movimientos de Caja.
- Al elegir un paciente registrado, `/api/grooming/pacientes/:id/companeros` consulta las mascotas activas del mismo tutor mediante su ID real. No se agrupan tutores por coincidencias de teléfono o nombre. La ruta exige JWT y permiso `grooming/ver`.
- Se pueden añadir hasta tres mascotas a la principal. Cada una tiene su costo y tamaño, su cita, paciente e historial propios. La reserva completa y sus historiales se confirman en una transacción; si falla una mascota, se revierte toda la reserva.
- Una ruta se identifica por tutor, domicilio normalizado, fecha, hora y tipo de grooming con transporte. Se normalizan mayúsculas y espacios del domicilio; no se fusionan apartamentos ni domicilios diferentes. Un índice único evita rutas duplicadas. Mascotas de tutores distintos siempre pertenecen a rutas distintas aunque coincidan domicilio y hora.
- El cupo diario cuenta rutas activas según el horario y tipo configurados. Cada ruta admite hasta cuatro mascotas no canceladas. Las reservas, ediciones, cancelaciones, reactivaciones y eliminaciones toman los mismos bloqueos de horarios en orden estable para evitar sobreasignaciones concurrentes. No se cambian horarios ni capacidades.
- Cancelar una mascota no cancela a las demás. Solo se libera la ruta si ya no tiene mascotas activas. Reactivar una cita vuelve a comprobar cupos y el límite de cuatro mascotas.
- Reprogramar una mascota cambia únicamente su cita e historial automático. Se vincula a la ruta compatible del destino o crea otra si hay capacidad; sus compañeras permanecen en la ruta original. Las validaciones existentes de fecha y horario se conservan.
- El costo se guarda una sola vez en la ruta. Los nuevos registros asociados guardan cero en `cita_grooming.costo_transporte`; al consultar la API, el importe se atribuye a la primera cita no cancelada de esa ruta. Las demás muestran transporte compartido. La suma de `transportCost` de la API no duplica el importe; `routeTransportCost` informa del costo completo de la ruta al editar o consultar.
- El costo de una ruta con otras citas vinculadas no se cambia desde una cita individual. Si se solicita otro importe se devuelve `SHARED_ROUTE_COST`; el formulario bloquea ese campo mientras se conserva el destino compartido. Cambiar el destino puede necesitar una nueva ruta y su costo correspondiente.
- Los indicadores y los reportes que consumen la API de grooming reciben el transporte una sola vez. No hay otros controladores de reportes que sumen directamente `cita_grooming.costo_transporte`. Cualquier consulta SQL externa futura debe considerar la tabla de rutas para registros nuevos.

## Conservación de datos anteriores

La migración no contiene backfill, INSERT, UPDATE, DELETE ni ALTER sobre tablas existentes. No reclasifica ni agrupa citas históricas. Una cita sin metadatos nuevos conserva su respuesta y costo originales; sigue contando individualmente para capacidad. Esto también evita cambiar reservas existentes que pudieran compartir domicilio.

Solo las altas nuevas y las ediciones expresas de citas por el usuario incorporan información operativa nueva. No se ejecuta ningún proceso masivo. Los historiales nuevos se crean con la misma utilidad existente, que conserva los datos clínicos escritos por veterinarios. No se modificaron los archivos de Caja, su generador de PDF ni su política histórica.

## Migración preparada para revisión

Archivo: `backend/src/scripts/groomingTransportMigration.sql`. No se ejecuta al iniciar el backend y no se añadió un comando que la ejecute automáticamente.

La estructura actual no tiene una relación persistente entre ruta y citas ni un lugar para la forma de pago prevista. Se añaden exclusivamente:

1. `grooming_transporte_ruta`: tutor, tipo, fecha, hora, domicilio, clave de domicilio y costo único. Incluye índice único de identidad de ruta y referencias a los catálogos existentes.
2. `grooming_operacion`: relación uno a uno con la cita, más su forma de pago y ruta opcionales. La FK elimina solo esta relación al eliminar expresamente la cita; no elimina la ruta ni las otras mascotas.

No añade columnas a `cita_grooming`, `paciente`, `historial_clinico`, `forma_pago` ni a Caja. Las referencias se comprobaron contra los tipos instalados en producción: IDs BIGINT UNSIGNED para tutor/cita, INT para tipo de grooming e INT UNSIGNED para forma de pago. Las cuatro tablas son InnoDB. El manifiesto registra esas precondiciones.

La migración completa se probó dos veces en tablas locales desechables con nombres aislados, incluidas sus claves foráneas, unicidad y ON DELETE CASCADE. La prueba elimina únicamente las tablas que ella creó y verifica su limpieza. La integración funcional usa tablas TEMPORARY y revierte sus datos. No se aplicó la migración a las tablas reales de la clínica.

Para una actualización futura hay que revisar y aplicar este SQL antes de habilitar el código nuevo. Crear tablas con FK puede esperar bloqueos de metadatos y requiere permisos DDL; las operaciones DDL no se revierten con un ROLLBACK normal. No se reconstruyen tablas históricas. Si ya existen tablas con estos nombres, se debe verificar su estructura: `IF NOT EXISTS` no corrige estructuras diferentes.

Sin las tablas auxiliares, la lectura de citas anteriores mantiene el comportamiento actual. Una solicitud que intenta guardar pago o mascotas adicionales devuelve 503 `GROOMING_MIGRATION_REQUIRED` en lugar de perder información. No debe publicarse el formulario nuevo antes de preparar la estructura.

Después de registrar rutas, una versión antigua de la aplicación no interpreta su costo único ni su agrupación. Una reversión debe conservar las tablas y utilizar código compatible; no se propone borrar relaciones ni datos para volver atrás.

## Entrega compatible con las fuentes de AWS

`production.patch` modifica solo siete archivos de Grooming: controlador, rutas Express, utilidad backend, SQL de migración, pantalla, tipos opcionales y utilidad frontend. Las fuentes originales de esos módulos coinciden con las inspeccionadas en AWS. Las utilidades compartidas de horario, historial, catálogos y selector de pacientes están incluidas como archivos de control sin cambios.

No desplegar todo el repositorio local, que contiene otros desarrollos. Preparar una copia de las fuentes de producción, verificar sus hashes con `node deploy/grooming-rutas/verify.cjs RUTA before`, comprobar/aplicar el parche a esa copia, compilar y verificar `after`. Aplicar un archivo `.patch` no ejecuta el SQL incluido. Coordinar la revisión de la migración y la publicación de todas las instancias del backend. El paquete de Caja anterior es independiente y se conserva.

## Pruebas

```powershell
node --test backend/tests/groomingController.test.js backend/tests/groomingHistory.test.js backend/tests/groomingTransport.test.js backend/tests/groomingPackage.test.js src/app/utils/groomingTransport.test.js
npm run build
```

Integraciones locales opcionales con los catálogos de desarrollo existentes:

```powershell
$env:UNAVET_TEST_LOCAL_MYSQL='true'
# Opcional: ruta al archivo local existente en una copia de trabajo diferente.
$env:UNAVET_TEST_ENV_FILE='RUTA_LOCAL/backend/.env'
node --test backend/tests/groomingTransportLocal.test.js backend/tests/groomingMigrationLocal.test.js
Remove-Item Env:UNAVET_TEST_LOCAL_MYSQL
Remove-Item Env:UNAVET_TEST_ENV_FILE
```

Se verifican una, tres y cuatro mascotas; tutores distintos; efectivo, tarjeta y transferencia; reserva duplicada; ruta llena; cupo diario por rutas; cancelación y reasignación del importe único; reactivación rechazada al llenar cuatro lugares; reprogramación individual y su rollback por horario/capacidad; pagos desactivados; reversión de toda una reserva si falla un historial; conservación exacta de una cita e historial anteriores; y ausencia de ventas/cobros automáticos. También se ejecutan las pruebas de Caja y sus PDF históricos para comprobar la coexistencia de ambos parches.
