# Recetas: búsqueda escrita de servicios

En **Servicios y procedimientos realizados**, el campo **Buscar servicio o procedimiento** filtra la lista por nombre, categoría o descripción. Ignora tildes y mayúsculas y admite varias palabras. Seleccionar un resultado y pulsar **Agregar** conserva el flujo existente, sus precios, cantidades y validaciones. Cambiar la búsqueda limpia la selección pendiente; agregar un procedimiento o abrir otra receta limpia la búsqueda. Los procedimientos ya agregados no se alteran.

El cambio funcional se limita a `src/app/pages/Prescriptions.tsx`. Reutiliza `/api/catalogos/servicios`, su autenticación y el catálogo MySQL. No requiere migraciones, dependencias ni variables de entorno y no genera ventas ni cobros. **Publicado en AWS el 14 de noviembre de 2026**, según `../actualizacion-controlada/ACTA-EXTENSIONES-2026-11-14.md`.

Esta entrega se publica junto con **Grooming: mascotas nuevas en transporte**, en `../grooming-mascotas-nuevas`. Ambos parches parten de las fuentes de `09c6fdf` ya instaladas; en conjunto cambian tres archivos. Los parches anteriores y sus SQL permanecen inmutables. El verificador conjunto es:

```sh
node /ruta/entrega/deploy/grooming-mascotas-nuevas/verify.cjs /ruta/copia before
git -C /ruta/copia apply --check /ruta/entrega/deploy/grooming-mascotas-nuevas/production.patch
git -C /ruta/copia apply /ruta/entrega/deploy/grooming-mascotas-nuevas/production.patch
git -C /ruta/copia apply --check /ruta/entrega/deploy/recetas-busqueda/production.patch
git -C /ruta/copia apply /ruta/entrega/deploy/recetas-busqueda/production.patch
node /ruta/entrega/deploy/grooming-mascotas-nuevas/verify.cjs /ruta/copia after
```

Comprobar en Linux sobre una copia de las fuentes reales, contrastar las 29 huellas y que solo cambien tres archivos; compilar y mantener Node.js 24.22.2 y las dependencias originales. No usar un `git pull` general ni volver a aplicar las migraciones ya instaladas. Aplicar mantenimiento, respaldo actualizado verificado, integridad de todos los registros presentes y controles de acceso siguiendo `../actualizacion-controlada/README.md`.

Las pruebas de búsqueda cubren nombre parcial, categoría, descripción, tildes, mayúsculas, varias palabras, búsqueda vacía y sin resultados, y conservación del catálogo y sus precios. Las pruebas de formularios y PDF de recetas siguen verificando peso, procedimientos, medicamentos e históricos. El acta de publicación registrará la validación y el estado efectivo en AWS.
