# Historial de cambios para todos los usuarios de Inventario

Correcci?n posterior al paquete de inventario exclusivo para admin. El Historial conserva la autenticaci?n JWT y el permiso habitual `inventory/ver`, sin la restricci?n de cuenta. Su bot?n y contenido se muestran fuera de la condici?n de operaciones privadas. Proveedores, Compras y Movimientos mantienen sus restricciones exclusivas para admin.

Solo cambia `backend/src/routes/inventarioRoutes.js` y `src/app/pages/Inventory.tsx`. No contiene SQL, migraciones, cambios de contrase?as ni modificaciones a registros. El parche se aplica sobre la versi?n de producci?n del commit funcional 54547e0. Conservar el paquete base anterior y aplicar este parche despu?s de ?l para una instalaci?n nueva.

Antes de aplicar, comparar las dos huellas `before` del manifiesto sobre una copia nueva de las fuentes reales. Ejecutar `git apply --check production.patch`, aplicar y verificar las dos huellas `after`. Compilar usando el package.json/lockfile reales de producci?n. Construir una imagen derivada de la anterior con solamente la ruta modificada y el frontend compilado. Conservar Node.js 24.22.2, configuraci?n y vol?menes.

Conservar respaldo completo e imagen anterior. Publicar al terminar las operaciones en curso, drenar solicitudes y sustituir ?nicamente app. Verificar API de Historial con todas las cuentas activas que tienen permiso de Inventario (200), sin autenticaci?n (401), y que los otros tres apartados sigan devolviendo 403 a las dem?s cuentas. Comparar los registros y esquemas existentes antes y despu?s durante la pausa. Reabrir con salud correcta. No restaurar la base de datos para recuperar esta correcci?n: no tiene cambios de datos/esquema; evaluar la imagen y los dos archivos anteriores si fuera necesario.

Validaci?n local: 30 pruebas espec?ficas aprobadas, compilaci?n sobre copia de fuentes reales aprobada. El acta adjunta documenta la aceptaci?n en producci?n.
