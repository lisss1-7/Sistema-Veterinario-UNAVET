const test = require('node:test');
const assert = require('node:assert/strict');
const { isVeterinarianRole, syncVeterinarianForUser } = require('../src/utils/veterinarian');

const dbPath = require.resolve('../src/config/db');
const db = {};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const { syncAdministratorVeterinarians } = require('../src/scripts/syncAdministratorVeterinarians');
const { obtenerVeterinarios } = require('../src/controllers/catalogosController');

const createClinic = () => {
  const users = [
    { usuario_id: 1, primer_nombre: 'Ana', primer_apellido: 'López', rol: 'Administrador', active: true },
    { usuario_id: 2, primer_nombre: 'Luis', primer_apellido: 'Pérez', rol: 'Administrador', active: true },
    { usuario_id: 3, primer_nombre: 'Eva', primer_apellido: 'Ruiz', rol: 'Médico Veterinario', active: true },
    { usuario_id: 4, primer_nombre: 'Marta', primer_apellido: 'Soto', rol: 'Recepción', active: true },
    { usuario_id: 5, primer_nombre: 'Juan', primer_apellido: 'Díaz', rol: 'Administrador', active: false },
    { usuario_id: 6, primer_nombre: 'Pedro', primer_apellido: 'Gil', rol: 'Administrador', active: true, eliminado_en: '2026-01-01' },
  ];
  const veterinarians = new Map([[1, { veterinario_id: 10, usuario_id: 1, activo: 0 }]]);
  const query = async (sql, values = []) => {
    if (sql.includes('FROM usuario usuario')) {
      if (sql.includes('LIMIT 1')) {
        return [users.filter((user) => user.usuario_id === values[0] && !user.eliminado_en)];
      }
      assert.match(sql, /usuario\.eliminado_en IS NULL/);
      assert.match(sql, /estado\.permite_acceso = 1/);
      assert.match(sql, /rol\.activo = 1/);
      assert.match(sql, /LOWER\(TRIM\(rol\.nombre\)\) = \?/);
      assert.deepEqual(values, ['administrador']);
      return [users.filter((user) => user.rol === 'Administrador' && user.active && !user.eliminado_en)];
    }
    if (sql.includes('INSERT INTO veterinario')) {
      assert.match(sql, /ON DUPLICATE KEY UPDATE/);
      const [userId, firstName, middleName, firstSurname, secondSurname] = values;
      const existing = veterinarians.get(userId);
      veterinarians.set(userId, {
        veterinario_id: existing?.veterinario_id || 10 + userId,
        usuario_id: userId,
        nombre: [firstName, middleName, firstSurname, secondSurname].filter(Boolean).join(' '),
        activo: 1,
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE veterinario')) {
      const veterinarian = veterinarians.get(values[0]);
      if (veterinarian) veterinarian.activo = 0;
      return [{ affectedRows: veterinarian ? 1 : 0 }];
    }
    if (sql.includes('FROM veterinario')) {
      return [values.length ? [veterinarians.get(values[0])].filter(Boolean) : [...veterinarians.values()].filter((vet) => vet.activo)];
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  return { users, veterinarians, query };
};

test('permite seleccionar Administrador y Médico Veterinario, conservando los demás roles', () => {
  for (const role of ['Administrador', ' ADMINISTRADOR ', 'Médico Veterinario', 'Veterinario']) {
    assert.equal(isVeterinarianRole(role), true, role);
  }
  for (const role of ['Recepción', 'Auxiliar', 'Groomer', '', null]) {
    assert.equal(isVeterinarianRole(role), false, String(role));
  }
});

test('muestra dos administradores existentes y un médico en el catálogo sin duplicarlos', async () => {
  const clinic = createClinic();
  await syncVeterinarianForUser(clinic, 3);
  assert.equal(await syncAdministratorVeterinarians(clinic), 2);
  assert.equal(await syncAdministratorVeterinarians(clinic), 2);
  db.query = clinic.query;
  const res = { json: (body) => { res.body = body; }, status: () => res };
  await obtenerVeterinarios({}, res);
  assert.deepEqual(res.body.map((vet) => vet.usuario_id).sort(), [1, 2, 3]);
  assert.equal(clinic.veterinarians.get(1).veterinario_id, 10);
  assert.equal(res.body.find((vet) => vet.usuario_id === 2).nombre, 'Luis Pérez');
});

test('un médico que pasa a Administrador conserva su identificador clínico y sigue activo', async () => {
  const clinic = createClinic();
  const veterinarianId = await syncVeterinarianForUser(clinic, 3);
  clinic.users.find((user) => user.usuario_id === 3).rol = 'Administrador';
  assert.equal(await syncVeterinarianForUser(clinic, 3), veterinarianId);
  assert.equal(clinic.veterinarians.get(3).activo, 1);
});

test('mantiene la baja del catálogo para roles no médicos y omite usuarios eliminados', async () => {
  const clinic = createClinic();
  assert.equal(await syncVeterinarianForUser(clinic, 1, 'Recepción'), null);
  assert.equal(clinic.veterinarians.get(1).activo, 0);
  assert.equal(await syncVeterinarianForUser(clinic, 6), null);
  assert.equal(clinic.veterinarians.has(6), false);
});
