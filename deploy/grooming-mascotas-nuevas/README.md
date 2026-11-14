# Grooming: mascotas nuevas en una misma ruta

Implementado y probado localmente en `6ae4a32`. La entrega actual coordina su publicación con la búsqueda de servicios de Recetas descrita en `../recetas-busqueda/README.md`; el acta de esa ventana registra el estado efectivo en AWS.

## Uso

En **Nueva cita de grooming**, seleccionar el tipo con transporte y completar los datos de la mascota principal, que puede estar registrada o ser nueva. Debajo de Dirección aparece **Agregar mascota nueva al transporte**, dentro de **Otras mascotas del mismo tutor en esta ruta**.

Cada mascota nueva solicita nombre, especie, raza, edad, tamaño y precio de grooming. Especies, razas y tamaños provienen de los catálogos existentes; la opción Otra conserva la captura de una raza nueva. Se pueden quitar tarjetas adicionales antes de guardar. El total máximo es de cuatro mascotas, contando la principal y todas las adicionales, registradas o nuevas.

Una sola solicitud guarda una cita por mascota y una sola ruta. Tutor, dirección, fecha, hora, forma de pago prevista y costo de transporte son compartidos. Los precios de grooming permanecen individuales y el transporte se atribuye una sola vez. Las mascotas nuevas usan el flujo existente de Grooming sin `paciente_id`: no crean pacientes ni expedientes clínicos. Si una mascota está registrada, conserva su relación clínica y su historial individual. Elegir forma de pago no genera ventas ni cobros automáticos.

Las citas mantienen sus acciones individuales de consulta, edición, cancelación y reprogramación. Si falla la creación de cualquier integrante, se revierte toda la reserva, incluidos ruta, citas y cualquier tutor nuevo creado en esa transacción.

## Alcance y compatibilidad

Dos archivos de ejecución:

- `backend/src/controllers/groomingController.js`: admite mascotas nuevas en `additionalPets`, valida datos y catálogos y reutiliza la transacción y el mecanismo de rutas existentes.
- `src/app/pages/Grooming.tsx`: botón, formularios por mascota y validaciones, manteniendo la selección de mascotas registradas.

No requiere migraciones, columnas, tablas, variables de entorno ni dependencias nuevas. Reutiliza las tablas auxiliares de Grooming que ya están instaladas. Caja, Recetas, permisos, rutas API e históricos conservan su código y estructura.

Los tres parches del paquete `09c6fdf` son inmutables. Las pruebas del paquete ahora verifican también la cadena de este delta, sin modificar aquellos artefactos ni sus hashes. Los cambios de pruebas cubren el flujo nuevo y su compatibilidad con el anterior.

## Paquete incremental para una actualización posterior

`production.patch` fue generado por Git contra los dos archivos de la versión instalada, conservando sus contextos CRLF. `manifest.json` fija las huellas anteriores y nuevas, y la huella binaria del parche. `.gitattributes` conserva esos bytes. Se comprobó `git apply --check`, aplicación y huellas finales sobre una copia limpia local; no se ejecutó este parche en AWS.

Antes de una publicación futura, usar una copia privada y limpia de las fuentes reales de producción y ejecutar **en Linux**:

```sh
node /ruta/entrega/deploy/grooming-mascotas-nuevas/verify.cjs /ruta/copia before
git -C /ruta/copia apply --check /ruta/entrega/deploy/grooming-mascotas-nuevas/production.patch
git -C /ruta/copia apply /ruta/entrega/deploy/grooming-mascotas-nuevas/production.patch
node /ruta/entrega/deploy/grooming-mascotas-nuevas/verify.cjs /ruta/copia after
```

El verificador es de solo lectura y contrasta 29 archivos de ejecución y control. La entrega conjunta actual sustituye las dos huellas aprobadas de esta extensión y la huella de `Prescriptions.tsx` del paquete `recetas-busqueda`; seguir la secuencia completa de su README. Una incompatibilidad debe investigarse antes de publicar. No aplicar nuevamente los tres parches antiguos ni ejecutar SQL.

La construcción debe partir de las fuentes reales con este delta, conservar Node.js **24.22.2**, las dependencias y la configuración vigentes, y generar frontend y backend juntos. No desplegar el checkout completo ni hacer un `git pull` general: la rama contiene fuentes locales ajenas al alcance, como en la entrega anterior. Respaldo, ventana, controles de integridad y recuperación siguen el procedimiento de `../actualizacion-controlada/README.md`, considerando todas las operaciones nuevas que puedan existir desde la actualización anterior. No restaurar un respaldo antiguo sobre la base activa.

## Validación local

- `npm test`, con `UNAVET_TEST_LOCAL_MYSQL=true` y configuración exclusivamente local: **251 pruebas aprobadas, 0 fallidas, 0 omitidas** (78 frontend y 173 backend).
- `npm run build`: correcto; solo el aviso habitual de tamaño de algunos chunks.
- `node --check backend/src/controllers/groomingController.js`: correcto.
- `node deploy/grooming-mascotas-nuevas/verify.cjs`: 29 fuentes y controles correctos.
- Secuencia completa de los tres parches originales y este delta: aplicación y hashes verificados mediante las pruebas del paquete.

Las integraciones MySQL usan tablas temporales para las citas, tutores, pacientes, razas, rutas y operaciones de este ensayo. Cubren tres y cuatro mascotas nuevas, un tutor completamente nuevo, reservas mixtas, precios diferentes, medios de pago, transporte único, límite de cuatro, datos inválidos, cancelación, reprogramación, fallo en la tercera cita y conservación de citas anteriores. También se ejecutaron las integraciones de Caja, Recetas y las migraciones aisladas ya existentes como regresión local.
