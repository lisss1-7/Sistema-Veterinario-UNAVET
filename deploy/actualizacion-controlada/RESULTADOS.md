# Validación conjunta de UNAVET

## Corrección del paquete para Linux

Los tres `.patch` se regeneraron mediante `git diff --binary --full-index --no-ext-diff --no-renames`, con Git **2.43.0 en Linux**, sobre una copia nueva y limpia de las fuentes reales de producción. Cada `git apply --check` y su aplicación consecutiva pasaron sin forzar opciones. Los **20 archivos resultantes** y los nueve archivos de control coinciden con los hashes esperados; también se comprobó que los demás archivos de la copia no cambiaron.

No cambió la lógica, ningún archivo de aplicación ni ambos SQL. Los manifiestos de fuentes mantienen sus hashes anteriores y posteriores; se actualizaron las huellas de los parches en `release.json`. `LINUX-VERIFICATION.json` registra la evidencia de Linux y las nuevas huellas. Nueve pruebas específicas del paquete pasaron, incluida una regresión que rechaza una línea de contexto vacía sin prefijo.

Esta corrección solo leyó las fuentes activas y trabajó en un directorio privado separado de preparación. No detuvo servicios, ejecutó migraciones, consultó/modificó datos ni publicó una actualización. Para la próxima ventana se capturarán todos los cierres que existan en ese momento (la última inspección registraba 43); ni 42 ni 43 son un límite de validación. Los casos de 42 cierres citados más abajo son únicamente fixtures sintéticos de las pruebas funcionales anteriores.

## Validación funcional anterior, sin repetir cambios

Resultado final: **247 pruebas aprobadas, 0 fallos, 0 omitidas**. Se ejecutó `npm test` con las integraciones MySQL locales habilitadas y el archivo local existente de desarrollo. No se copió ni modificó ningún archivo de entorno.

| Comprobación | Resultado |
| --- | --- |
| Suite frontend | 75/75 |
| Suite backend, incluidas cinco integraciones MySQL locales | 172/172 |
| Compilación del frontend local | Correcta |
| Compilación de una copia de las fuentes frontend de producción con los tres parches | Correcta |
| Huellas de los archivos frontend incluidos/controlados en esa copia | 13/13 coinciden |
| Verificación conjunta de la entrega | Ocho mejoras, tres parches, 20 archivos modificados |
| Aplicación secuencial a la base reconstruida y verificada | Correcta; hashes originales y finales coinciden |
| Prueba desactualizada de permisos de Caja | Corregida; DELETE, controlador original, JWT y permisos comprobados |

Las compilaciones mantienen el aviso previo de Vite sobre algunos bundles mayores de 500 kB; no presentan errores. Los errores simulados de recetas que aparecen en la salida de tests son casos de validación/rollback deliberados y terminaron aprobados.

## Cobertura financiera e histórica

- Separación entre fondos y ventas, pagos mixtos y reparto exacto en centavos; límite global permanente de activación y recuperación tras reinicios.
- Conservación exacta de 42 cierres **sintéticos** y de los comprobantes anteriores, sin DML de migración ni recálculos históricos. La integración funciona con las cuatro columnas de anulación lógica ausentes; también admite que el esquema local ya carezca de ellas.
- Fechas mixtas, comprobantes anteriores pendientes, turnos Diurno/Nocturno, ventas posteriores al primer cierre, duplicados rechazados, finalización diaria y eliminación mediante DELETE sin alterar los snapshots guardados.
- PDF histórico de 42 turnos y 20 páginas y comprobante individual comparados mediante SHA-256 de instrucciones de dibujo, con reloj fijo. PDF compacto normal de una página y caso extenso de dos, sin omitir importes ni formas de pago.

## Cobertura de Grooming

- Una mascota, tres y cuatro por ruta; domicilios normalizados, tutores diferentes, cupo de rutas y límite de cuatro mascotas activas.
- Precios individuales de Q100/Q20/Q30 y Q100/Q20/Q30/Q40 en fixtures sintéticos: sumas individuales conservadas y transporte Q30 una sola vez. No son precios incorporados a la aplicación.
- Edición de un costo individual a Q47.50 conservando íntegramente las filas de las otras mascotas, la misma ruta y su costo único de transporte. Cambio del costo compartido rechazado.
- Efectivo, tarjeta y transferencia del catálogo; pagos desactivados conservados solo en su cita original. No hay ventas ni pagos automáticos.
- Cancelación, reasignación del importe único, reactivación con cupo lleno, reprogramación individual, horarios/capacidad y rollback de toda una reserva si falla un historial.
- Cita e historial anteriores intactos. DDL completo de las dos tablas auxiliares, FK, unicidad, ejecución repetida y limpieza en tablas locales de prefijo aleatorio.

## Cobertura de Recetas

- Ingreso de peso en kg y lb, factor exacto, precisión almacenada y rechazo de valores incorrectos; solo se guarda kg.
- Servicios del catálogo con precios tomados por el servidor, cantidades, varios procedimientos y totales en centavos. El servidor ignora precios manipulados enviados por el cliente.
- Peso y precios conservados ante consultas posteriores, recetas nuevas del mismo paciente y cambios/bajas del catálogo. Recetas anteriores sin metadatos conservan el objeto y el formato originales.
- Medicamentos, entrega e inventario existentes, vista previa/descarga PDF, logo y paginación de procedimientos extensos. Huella del PDF original conservada. No se crean cobros ni ventas al registrar procedimientos.
- Rollback de creación y edición fallidas; anulación conserva el snapshot. DDL de la tabla auxiliar probado con FK, JSON, precisión, ejecución repetida y limpieza.

## Compatibilidad y límites de esta validación

Los manifiestos se basan en las fuentes y tipos de esquema inspeccionados previamente en producción mediante lectura. Las pruebas conjuntas verifican las huellas, el alcance de los parches, sus rutas/permisos y las migraciones usando MySQL local. Se reconstruyó la base a partir de los parches y se contrastaron sus huellas originales antes de aplicar los tres en orden, preservando un archivo ajeno como control.

Las pruebas funcionales anteriores no se conectaron a AWS. No se modificaron ni verificaron mediante escrituras los cierres reales, los datos clínicos de producción o la configuración de Lightsail. Su comparación efectiva antes/después abarcará todos los registros existentes al iniciar la ventana, sin fijar el número de cierres. El respaldo con restauración ensayada, la construcción/verificación de la imagen final y la aplicación de SQL pertenecen a la ventana futura descrita en `README.md`.

En esta entrega no cambió ningún controlador, ruta, componente o cálculo de ejecución: se corrigieron las pruebas y se preparó la guía y el verificador conjunto. Los parches de Caja, Grooming y Recetas y sus SQL permanecen intactos. No se ejecutaron despliegues ni migraciones sobre tablas reales de la clínica.
