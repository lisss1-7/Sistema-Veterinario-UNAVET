const test = require('node:test');
const assert = require('node:assert/strict');

const expectedPermissions = {
  pacientes: [
    ['get', '/', 'patients', 'ver'],
    ['get', '/:id', 'patients', 'ver'],
    ['post', '/', 'patients', 'crear'],
    ['put', '/:id', 'patients', 'editar'],
    ['patch', '/:id/fallecido', 'patients', 'editar'],
    ['delete', '/:id', 'patients', 'eliminar'],
  ],
  citas: [
    ['get', '/', 'appointments', 'ver'],
    ['get', '/:id', 'appointments', 'ver'],
    ['post', '/', 'appointments', 'crear'],
    ['put', '/:id', 'appointments', 'editar'],
    ['patch', '/:id/estado', 'appointments', 'editar'],
    ['delete', '/:id', 'appointments', 'eliminar'],
  ],
  grooming: [
    ['get', '/', 'grooming', 'ver'],
    ['get', '/:id', 'grooming', 'ver'],
    ['post', '/', 'grooming', 'crear'],
    ['put', '/:id', 'grooming', 'editar'],
    ['patch', '/:id/estado', 'grooming', 'editar'],
    ['delete', '/:id', 'grooming', 'eliminar'],
  ],
  inventario: [
    ['get', '/', 'inventory', 'ver'],
    ['post', '/auditorias/finalizar', 'inventory', 'editar'],
    ['get', '/:id', 'inventory', 'ver'],
    ['post', '/', 'inventory', 'crear'],
    ['put', '/:id', 'inventory', 'editar'],
    ['patch', '/:id/stock', 'inventory', 'editar'],
    ['delete', '/:id', 'inventory', 'eliminar'],
  ],
  recetas: [
    ['get', '/', 'prescriptions', 'ver'],
    ['get', '/inventario-disponible', 'prescriptions', 'ver'],
    ['get', '/:id', 'prescriptions', 'ver'],
    ['post', '/', 'prescriptions', 'crear'],
    ['put', '/:id', 'prescriptions', 'editar'],
    ['patch', '/:id/anular', 'prescriptions', 'eliminar'],
  ],
  dashboard: [['get', '/resumen', 'dashboard', 'ver']],
  aiReports: [['post', '/chat', 'aiReports', 'crear']],
  cierreVentas: [
    ['get', '/', 'inventory', 'ver'],
    ['get', '/estado', 'inventory', 'ver'],
    ['post', '/finalizar', 'inventory', 'editar'],
    ['post', '/', 'inventory', 'crear'],
    ['delete', '/:id', 'inventory', 'eliminar'],
  ],
};

for (const [routeName, expectations] of Object.entries(expectedPermissions)) {
  test(`protege todas las operaciones de ${routeName} con rol_permisos`, () => {
    const router = require(`../src/routes/${routeName}Routes`);

    for (const [method, path, moduleCode, action] of expectations) {
      const routeLayer = router.stack.find(
        (layer) => layer.route?.path === path && layer.route.methods[method]
      );
      assert.ok(routeLayer, `No se encontro ${method.toUpperCase()} ${path}`);

      assert.ok(routeLayer.route.stack.some((layer) => layer.handle.name === 'verificarToken'), 'requiere JWT');

      const permissionLayer = routeLayer.route.stack.find(
        (layer) => layer.handle.permission
      );
      assert.deepEqual(permissionLayer?.handle.permission, {
        moduleCode,
        action,
      });
    }
  });
}
