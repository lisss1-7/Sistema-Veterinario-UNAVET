# Publicación de Grooming y búsqueda de Recetas

**Completada en AWS Lightsail el 14 de noviembre de 2026.** Acceso restablecido a las **15:28:52 UTC (09:28:52 de Guatemala)**. Comprobación externa posterior: frontend y salud HTTP 200; API de Recetas HTTP 401 sin autenticación. Contenedor saludable, MySQL y Caddy activos, sin reinicios ni errores nuevos detectados en las comprobaciones posteriores.

## Entrega publicada

Código funcional: `9dbb588bcd89bc96f5c233cef84a25a9c72aa11f`, rama `feat/grooming-mascotas-nuevas`, incluyendo Grooming de `6ae4a32` y búsqueda de Recetas de `6d1bbe8` con la protección adicional de Enter.

| Archivo de ejecución | Cambio |
| --- | --- |
| `backend/src/controllers/groomingController.js` | Mascotas nuevas en reservas compartidas, con validación y guardado atómico |
| `src/app/pages/Grooming.tsx` | Agregar y quitar mascotas nuevas en una misma ruta, con datos y precios individuales |
| `src/app/pages/Prescriptions.tsx` | Búsqueda escrita por nombre, categoría o descripción; Enter no guarda la receta |

Se aplicaron exclusivamente los parches `deploy/grooming-mascotas-nuevas/production.patch` y `deploy/recetas-busqueda/production.patch` sobre una copia de las fuentes efectivas de producción. Git **2.43.0 en Linux** comprobó los parches y su aplicación consecutiva. El verificador contrastó las 29 fuentes y controles; la comparación completa de fuentes confirmó exactamente tres archivos modificados. No se hizo un `git pull` general.

Imagen final: `unavet:extensiones-20261114t130145z`.

ID: `sha256:02ab20461a7a7204696199c9446881c74c6d97fcd5a6bc9270b949d20c684afc`.

El runtime conserva **Node.js 24.22.2**, su binario y las dependencias originales, verificados por hashes. La configuración efectiva del contenedor, incluidos secretos, límite de Caja, puertos, hosts y volúmenes, permaneció igual. Solo cambió la imagen indicada en Compose.

La compilación inicial en Lightsail exigió demasiada memoria y produjo una respuesta de salud agotada durante el ensayo de disponibilidad; la imagen de preparación terminó de compilar y se verificó antes de mantenimiento. Para la revisión final del teclado se compiló el frontend fuera del servidor, con Node 24.6.0 y `npm ci` usando el lockfile real de producción. Se verificaron 79 archivos de entrada de la copia de producción y se incorporó únicamente la protección de Enter adicional. Los archivos compilados se transfirieron con sus hashes. La imagen final mantiene Node 24.22.2 en producción; sus fuentes de backend coinciden con las que aprobaron las integraciones aisladas y sus dependencias coinciden con la imagen anterior.

## Datos y respaldo

Antes de mantenimiento se comprobaron consultas y transacciones activas y estabilidad del contador de escrituras. Se bloqueó el acceso público, se drenaron las solicitudes y se detuvo ordenadamente la aplicación, conservando los volúmenes.

Se creó un respaldo completo nuevo y se verificó mediante SHA-256 y lectura íntegra. Se restauró en MySQL **8.0.46** aislado, sin red ni volúmenes de producción. Todas las filas coincidieron; las definiciones de columnas, índices, claves, restricciones y opciones también coincidieron. Se contempló la representación textual redundante de `CHARACTER SET` sin omitir ninguna comparación de metadatos o de datos.

La captura de esta ventana incluyó **65 tablas y 43 cierres**. Antes de reabrir, las huellas de filas y esquema de todo ese conjunto permanecían idénticas, incluidos comprobantes, pagos, citas, recetas y las tres tablas auxiliares existentes. Los medios también conservaron sus hashes. **123 respuestas históricas de consulta** fueron iguales antes y después. Las cantidades se obtuvieron de esta ventana, no de una constante de validación histórica.

**No se ejecutó SQL de migración en producción**, no se modificaron tablas o columnas y no se recalcularon cierres. Se conservó exactamente el límite permanente de Caja que ya estaba configurado; el código de cálculo no cambió. Las tablas auxiliares ya instaladas se comprobaron mediante sus definiciones y huellas.

Se verificó otro respaldo tras la actualización, antes de habilitar escrituras. Los respaldos anterior y posterior y las imágenes de recuperación tienen copia externa cifrada, con SHA-256 comprobado y recuperación de clave DPAPI y descifrado verificados. Los archivos, claves, configuración privada, SQL y evidencias clínicas no se publican en Git.

## Validación

- Suite general local: **255 aprobadas, 0 fallidas, 0 omitidas**: 82 frontend y 173 backend, con integraciones MySQL habilitadas exclusivamente contra el entorno local.
- Restauración aislada y backend preparado en Linux/Node 24.22.2: **5 integraciones aprobadas**, sin fallos ni omisiones. Se verificó nuevamente que las tablas históricas de la copia y de producción no cambiaran.
- Grooming: una, tres y cuatro mascotas, tutor nuevo, reservas mixtas, precios individuales, formas de pago, transporte una vez, capacidad, cancelación, reprogramación, validación y rollback completo si falla una cita.
- Recetas: búsqueda parcial por nombre, categoría o descripción, tildes y mayúsculas, varias palabras, sin resultados, limpieza, precios originales y prevención del guardado con Enter. Se conservaron las pruebas de peso, procedimientos, medicamentos y PDF.
- Imagen final: backend y dependencias por hashes, configuración y volúmenes iguales; **98 archivos estáticos servidos** comparados por contenido; ambas interfaces nuevas presentes en los assets publicados.
- Producción: consultas autenticadas e históricos, salud, lectura MySQL, medios, protección JWT y validación de acceso. Las escrituras de prueba se realizaron exclusivamente en los entornos aislados; no se crearon ventas, citas, recetas o cierres ficticios en producción.

Tras estas comprobaciones y el respaldo posterior se restauró el Caddyfile original y se retiró el mantenimiento. Se conservaron los respaldos y las imágenes anteriores; no se ejecutó una restauración ni reversión automática. Ante operaciones nuevas posteriores, aplicar el procedimiento de recuperación de `README.md`, preservando esos datos y sin sobrescribir la base activa con un respaldo anterior.
