const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MySQL local: rutas compartidas, pagos, cancelación, reprogramación e históricos', {
  skip: process.env.UNAVET_TEST_LOCAL_MYSQL !== 'true', timeout: 30000,
}, async () => {
  const settings = { ...require('dotenv').parse(fs.readFileSync(process.env.UNAVET_TEST_ENV_FILE || path.join(__dirname, '../.env'))), ...process.env };
  assert(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST), 'Solo se admite MySQL local');
  Object.assign(process.env, settings);
  const pool = require('../src/config/db');
  const connection = await pool.getConnection();
  const originalQuery = pool.query, originalGet = pool.getConnection;
  try {
    const [[species]] = await connection.query('SELECT especie_id, nombre FROM especie LIMIT 1');
    const [[sex]] = await connection.query('SELECT sexo_id FROM sexo LIMIT 1');
    const [[user]] = await connection.query('SELECT usuario_id FROM usuario LIMIT 1');
    const [[module]] = await connection.query("SELECT modulo_id FROM modulo_sistema WHERE codigo = 'grooming'");
    const [[type]] = await connection.query('SELECT tipo_grooming_id, nombre FROM tipo_grooming WHERE requiere_transporte = 1 LIMIT 1');
    const [[clinic]] = await connection.query('SELECT tipo_grooming_id, nombre FROM tipo_grooming WHERE requiere_transporte = 0 LIMIT 1');
    const [[size]] = await connection.query('SELECT nombre FROM tamano_animal LIMIT 1');
    const [[initial]] = await connection.query('SELECT nombre FROM estado_grooming WHERE es_inicial = 1 LIMIT 1');
    const [[cancelled]] = await connection.query('SELECT nombre FROM estado_grooming WHERE es_cancelado = 1 LIMIT 1');
    const [methods] = await connection.query('SELECT forma_pago_id, codigo, nombre FROM forma_pago WHERE activo = 1');
    const cash = methods.find(method => method.codigo === 'efectivo');
    const card = methods.find(method => method.codigo.includes('tarjeta'));
    const transfer = methods.find(method => method.codigo.includes('transferencia'));
    assert(species && sex && user && module && type && clinic && size && initial && cancelled && cash && card && transfer, 'Se requieren los catálogos locales existentes');
    const [[salesBefore]] = await connection.query('SELECT COUNT(*) AS count FROM cierre_venta');
    const [[paymentsBefore]] = await connection.query('SELECT COUNT(*) AS count FROM venta_pago');
    // No se crean ni modifican tablas persistentes. Los catálogos se leen únicamente.
    for (const table of ['cita_grooming', 'historial_clinico', 'paciente', 'tutor', 'horario_atencion', 'forma_pago', 'raza']) {
      await connection.query(`CREATE TEMPORARY TABLE grooming_test_${table} LIKE ${table}`);
      if (table === 'forma_pago') await connection.query('INSERT INTO grooming_test_forma_pago SELECT * FROM forma_pago');
      await connection.query(`ALTER TABLE grooming_test_${table} RENAME TO ${table}`);
    }
    const migration = fs.readFileSync(path.join(__dirname, '../src/scripts/groomingTransportMigration.sql'), 'utf8');
    // MySQL no admite FK en TEMPORARY; las definiciones originales se revisan por separado.
    for (const statement of migration.replace(/^--.*$/gm, '').split(';').filter(sql => sql.trim())) {
      const temporary = statement.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE')
        .replace(/^\s*CONSTRAINT .*$/gm, '').replace(/,\s*\)/g, '\n)');
      await connection.query(temporary);
    }
    await connection.beginTransaction();
    let enhanced = false;
    let failHistoryAt = 0, historyWrites = 0;
    let failAppointmentAt = 0, appointmentWrites = 0;
    const adapter = {
      query: (sql, values) => {
        if (sql.includes('grooming_operations_tables')) return Promise.resolve([[{ grooming_operations_tables: enhanced ? 2 : 0 }]]);
        if (failHistoryAt && sql.includes('INSERT INTO historial_clinico') && ++historyWrites === failHistoryAt) throw new Error('Fallo simulado del historial individual');
        if (failAppointmentAt && sql.includes('INSERT INTO cita_grooming') && ++appointmentWrites === failAppointmentAt) throw new Error('Fallo simulado de cita nueva');
        return connection.query(sql, values);
      },
      beginTransaction: () => connection.query('SAVEPOINT grooming_request'),
      commit: () => connection.query('RELEASE SAVEPOINT grooming_request'),
      rollback: () => connection.query('ROLLBACK TO SAVEPOINT grooming_request'), release() {},
    };
    pool.query = adapter.query; pool.getConnection = async () => adapter;
    const controller = require('../src/controllers/groomingController');
    for (let id = 1; id <= 3; id++) await connection.query('INSERT INTO tutor (tutor_id, telefono, primer_nombre, primer_apellido) VALUES (?, ?, ?, ?)', [id, `5555555${id}`, 'Tutor', ['Prueba', 'Segunda', 'Tercera'][id - 1]]);
    for (let id = 1; id <= 7; id++) await connection.query(`INSERT INTO paciente
      (paciente_id, tutor_id, especie_id, nombre, fecha_registro, sexo_id, edad, activo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, id === 5 ? 2 : id === 6 ? 3 : 1, species.especie_id, `Mascota ${id}`, '2099-01-01', sex.sexo_id, '3 años']);
    for (let day = 0; day < 7; day++) for (const service of [type, clinic]) await connection.query(`INSERT INTO horario_atencion
      (modulo_id, tipo_grooming_id, dia_semana, hora_inicio, hora_fin, intervalo_minutos, capacidad_diaria, activo)
      VALUES (?, ?, ?, '09:00', '17:00', 30, 2, 1)`, [module.modulo_id, service.tipo_grooming_id, day]);
    const call = async (handler, request = {}, expected = 200) => {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ params: {}, query: {}, user: { id: user.usuario_id }, ...request }, res);
      assert.equal(res.statusCode, expected, JSON.stringify(res.body)); return res.body;
    };
    const body = (id = 1, changes = {}) => ({ patientId: String(id), type: type.nombre, petName: `Mascota ${id}`, animalSize: size.nombre, age: '3 años',
      tutorFirstName: 'Tutor', tutorFirstSurname: 'Prueba', tutorPhone: '55555551', date: '2099-10-06', time: '09:00',
      groomingCost: 100, transportCost: 30, address: 'Domicilio de prueba, Zona 1', accessCode: 'Código de ejemplo', paymentMethod: cash.codigo, ...changes });
    const create = (id, changes = {}, status = 201) => call(controller.crearGrooming, { body: body(id, changes) }, status);
    const extra = id => ({ patientId: String(id), animalSize: size.nombre, groomingCost: id * 10 });
    const get = id => call(controller.obtenerGroomingPorId, { params: { id } });
    const snapshot = async () => {
      const [appointments] = await connection.query('SELECT * FROM cita_grooming WHERE grooming_id = 1');
      const [history] = await connection.query('SELECT * FROM historial_clinico WHERE grooming_id = 1');
      return JSON.stringify({ appointments, history });
    };
    const legacy = await create(7, { date: '2099-10-04', type: clinic.nombre, paymentMethod: undefined, transportCost: 0 });
    const originalRows = await snapshot(), originalApi = await get(legacy.id);
    const unavailable = await create(1, {}, 503);
    assert.equal(unavailable.code, 'GROOMING_MIGRATION_REQUIRED');
    enhanced = true;
    const single = await create(1, { date: '2099-10-05' });
    assert.equal((await get(single.id)).paymentMethod, cash.codigo);
    assert.equal((await get(single.id)).transportCost, 30);
    const group = await create(1, { additionalPets: [extra(2), extra(3)], paymentMethod: card.codigo });
    assert.equal(group.ids.length, 3);
    const three = await Promise.all(group.ids.map(get));
    assert.deepEqual(three.map(item => item.groomingCost), [100, 20, 30]);
    assert.equal(three.reduce((sum, item) => sum + item.groomingCost + item.transportCost, 0), 180);
    assert.equal(new Set(three.map(item => item.routeId)).size, 1);
    assert.equal(three.reduce((sum, item) => sum + item.transportCost, 0), 30);
    assert(three.every(item => item.paymentMethod === card.codigo && item.routeMembers.length === 3));
    const [[individualHistories]] = await connection.query('SELECT COUNT(DISTINCT paciente_id) AS count FROM historial_clinico WHERE grooming_id IN (?)', [group.ids]);
    assert.equal(individualHistories.count, 3);
    const fourth = await create(4, { paymentMethod: transfer.codigo, address: '  DOMICILIO DE PRUEBA,   ZONA 1  ' });
    assert.equal(fourth.routeId, group.routeId);
    assert.equal((await get(fourth.id)).paymentMethod, transfer.codigo);
    await create(7, {}, 409); // Cinco mascotas activas no caben en la misma ruta.
    await create(1, {}, 409); // Mascota duplicada en la misma ruta.
    await create(1, { additionalPets: [extra(5)] }, 400); // Tutor distinto.
    await create(1, { additionalPets: [extra(2), extra(3), extra(4), extra(7)] }, 400);
    await create(1, { paymentMethod: 'forma-inexistente' }, 400);
    const otherTutor = await create(5); // Mismo domicilio y hora, distinto tutor: otra ruta.
    assert.notEqual(otherTutor.routeId, group.routeId);
    const full = await create(6, {}, 409);
    assert.equal(full.code, 'TRANSPORT_LIMIT'); // Dos rutas, no cinco mascotas.
    const four = await create(1, { date: '2099-10-07', additionalPets: [extra(2), extra(3), extra(4)] });
    assert.equal(four.ids.length, 4);
    const fourAppointments = await Promise.all(four.ids.map(get));
    assert.deepEqual(fourAppointments.map(item => item.groomingCost), [100, 20, 30, 40]);
    assert.equal(fourAppointments.reduce((sum, item) => sum + item.groomingCost + item.transportCost, 0), 220);
    assert(fourAppointments.every(item => item.routeId === four.routeId));
    assert.equal(fourAppointments.reduce((sum, item) => sum + item.transportCost, 0), 30);

    const differentlyPriced = await get(group.ids[2]);
    const otherIds = group.ids.filter(id => id !== differentlyPriced.id);
    const [otherPricesBefore] = await connection.query('SELECT * FROM cita_grooming WHERE grooming_id IN (?) ORDER BY grooming_id', [otherIds]);
    await call(controller.actualizarGrooming, { params: { id: differentlyPriced.id }, body: {
      ...differentlyPriced, groomingCost: 47.5, transportCost: differentlyPriced.routeTransportCost,
    } });
    const [otherPricesAfter] = await connection.query('SELECT * FROM cita_grooming WHERE grooming_id IN (?) ORDER BY grooming_id', [otherIds]);
    assert.deepEqual(otherPricesAfter, otherPricesBefore, 'Editar el precio individual no cambia a sus compañeras');
    const shared = await get(group.ids[2]);
    assert.equal(shared.groomingCost, 47.5); assert.equal(shared.routeId, group.routeId);
    assert.equal(shared.routeTransportCost, 30);
    const updatedGroup = await Promise.all([...group.ids, fourth.id].map(get));
    assert.deepEqual(updatedGroup.map(item => item.groomingCost), [100, 20, 47.5, 100]);
    assert.equal(updatedGroup.reduce((sum, item) => sum + item.transportCost, 0), 30);
    const sharedFee = await call(controller.actualizarGrooming, { params: { id: shared.id }, body: { ...shared, transportCost: 31 } }, 409);
    assert.equal(sharedFee.code, 'SHARED_ROUTE_COST');
    assert.deepEqual(await get(shared.id), shared);
    await call(controller.cambiarEstadoGrooming, { params: { id: group.id }, body: { status: cancelled.nombre } });
    const afterCancel = await Promise.all([...group.ids, fourth.id].map(get));
    assert.equal(afterCancel[0].transportCost, 0);
    assert.equal(afterCancel.reduce((sum, item) => sum + item.transportCost, 0), 30);
    assert(afterCancel.slice(1).every(item => item.status === initial.nombre));
    const replacement = await create(7); // La cancelación libera un lugar, no otra ruta.
    assert.equal(replacement.routeId, group.routeId);
    const reactivate = await call(controller.cambiarEstadoGrooming, { params: { id: group.id }, body: { status: initial.nombre } }, 409);
    assert.equal(reactivate.code, 'ROUTE_PET_LIMIT');
    const beforeMove = await get(group.ids[1]);
    const peers = group.ids.filter(id => id !== beforeMove.id);
    const peerRows = async () => JSON.stringify((await connection.query('SELECT * FROM cita_grooming WHERE grooming_id IN (?) ORDER BY grooming_id', [peers]))[0]);
    const unchangedPeers = await peerRows();
    await call(controller.actualizarGrooming, { params: { id: beforeMove.id }, body: { ...beforeMove, date: '2099-10-08', time: '10:00', transportCost: beforeMove.routeTransportCost } });
    const moved = await get(beforeMove.id);
    assert.notEqual(moved.routeId, beforeMove.routeId);
    assert.equal(moved.routeMembers.length, 1);
    assert.equal(await peerRows(), unchangedPeers);
    await call(controller.actualizarGrooming, { params: { id: moved.id }, body: { ...moved, time: '08:15', transportCost: moved.routeTransportCost } }, 400);
    await call(controller.actualizarGrooming, { params: { id: moved.id }, body: { ...moved, date: '2099-10-06', time: '11:00', transportCost: moved.routeTransportCost } }, 409);
    assert.deepEqual(await get(moved.id), moved);
    await connection.query('UPDATE forma_pago SET activo = 0 WHERE forma_pago_id = ?', [card.forma_pago_id]);
    const keepInactive = await get(group.ids[2]);
    await call(controller.actualizarGrooming, { params: { id: keepInactive.id }, body: { ...keepInactive, transportCost: keepInactive.routeTransportCost } });
    assert.equal((await get(keepInactive.id)).paymentMethod, card.codigo);
    await create(1, { date: '2099-10-09', paymentMethod: card.codigo }, 400);
    const batchCounts = async () => (await connection.query(`SELECT
      (SELECT COUNT(*) FROM cita_grooming) AS citas,
      (SELECT COUNT(*) FROM historial_clinico) AS historiales,
      (SELECT COUNT(*) FROM grooming_operacion) AS operaciones,
      (SELECT COUNT(*) FROM grooming_transporte_ruta) AS rutas`))[0];
    const beforeFailure = await batchCounts();
    failHistoryAt = 3;
    await create(1, { date: '2099-10-10', additionalPets: [extra(2), extra(3), extra(4)] }, 500);
    failHistoryAt = 0;
    assert.deepEqual(await batchCounts(), beforeFailure, 'Un fallo individual revierte toda la reserva y su ruta');

    const newPet = (name, cost = 25) => ({ petName: name, species: species.nombre, breed: 'Mestiza', age: '2 años', animalSize: size.nombre, groomingCost: cost });
    const newPrimary = { patientId: '', petName: 'Luna Nueva', species: species.nombre, breed: 'Mestiza' };
    const [[patientsBefore]] = await connection.query('SELECT COUNT(*) AS count FROM paciente');
    const fresh = await create(1, { ...newPrimary, date: '2099-11-10', additionalPets: [newPet('Nube Nueva', 45), newPet('Simba Nuevo', 60)] });
    assert.equal(fresh.ids.length, 3);
    const freshRows = await Promise.all(fresh.ids.map(get));
    assert(freshRows.every(row => row.patientId === '' && row.routeId === fresh.routeId && row.routeMembers.length === 3));
    assert.deepEqual(freshRows.map(row => row.groomingCost), [100, 45, 60]);
    assert.deepEqual(freshRows.map(row => row.petName), ['Luna Nueva', 'Nube Nueva', 'Simba Nuevo']);
    assert.equal(freshRows.reduce((sum, row) => sum + row.transportCost, 0), 30);
    const [[freshHistories]] = await connection.query('SELECT COUNT(*) AS count FROM historial_clinico WHERE grooming_id IN (?)', [fresh.ids]);
    assert.equal(freshHistories.count, 0, 'Solo Grooming no crea expedientes ni historiales clínicos');
    const lastNew = await create(1, { ...newPrimary, petName: 'Estrella Nueva', date: '2099-11-10' });
    assert.equal(lastNew.routeId, fresh.routeId);
    assert.equal((await get(lastNew.id)).routeMembers.length, 4);
    await create(1, { ...newPrimary, petName: 'Quinta Nueva', date: '2099-11-10' }, 409);
    const freshFour = await create(1, { ...newPrimary, date: '2099-11-11', additionalPets: [newPet('Nueva Dos'), newPet('Nueva Tres'), newPet('Nueva Cuatro')] });
    assert.equal(freshFour.ids.length, 4);
    assert.equal(new Set((await Promise.all(freshFour.ids.map(get))).map(row => row.routeId)).size, 1);
    const mixed = await create(1, { date: '2099-11-12', additionalPets: [extra(2), newPet('Nueva Mixta')] });
    const mixedRows = await Promise.all(mixed.ids.map(get));
    assert.deepEqual(mixedRows.map(row => row.patientId), ['1', '2', '']);
    const freshWithRegistered = await create(1, { ...newPrimary, date: '2099-11-13', additionalPets: [extra(2)] });
    assert.deepEqual((await Promise.all(freshWithRegistered.ids.map(get))).map(row => row.patientId), ['', '2']);
    for (const invalid of [{ petName: '' }, { age: '' }, { age: '2años' }, { species: 'Especie inexistente' }, { breed: '' }, { animalSize: '' }, { groomingCost: -1 }]) {
      const beforeInvalid = await batchCounts();
      await create(1, { ...newPrimary, date: '2099-11-14', additionalPets: [{ ...newPet('Nueva Inválida'), ...invalid }] }, 400);
      assert.deepEqual(await batchCounts(), beforeInvalid, 'Datos inválidos no dejan citas ni rutas parciales');
    }
    await create(1, { ...newPrimary, date: '2099-11-14', additionalPets: [extra(5)] }, 400);
    await create(1, { ...newPrimary, date: '2099-11-14', additionalPets: [newPet('Dos'), newPet('Tres'), newPet('Cuatro'), newPet('Cinco')] }, 400);
    await call(controller.cambiarEstadoGrooming, { params: { id: fresh.ids[0] }, body: { status: cancelled.nombre } });
    const activeNew = await Promise.all([...fresh.ids, lastNew.id].map(get));
    assert.equal(activeNew[0].transportCost, 0);
    assert.equal(activeNew.reduce((sum, row) => sum + row.transportCost, 0), 30);
    const peerNew = await get(fresh.ids[2]);
    const moveNew = await get(fresh.ids[1]);
    await call(controller.actualizarGrooming, { params: { id: moveNew.id }, body: { ...moveNew, date: '2099-11-15', time: '10:00', transportCost: moveNew.routeTransportCost } });
    assert.notEqual((await get(moveNew.id)).routeId, fresh.routeId);
    const peerNewAfter = await get(peerNew.id);
    assert.equal(peerNewAfter.date, peerNew.date); assert.equal(peerNewAfter.time, peerNew.time);
    assert.equal(peerNewAfter.groomingCost, peerNew.groomingCost); assert.equal(peerNewAfter.routeId, peerNew.routeId);
    const beforeNewFailure = await batchCounts();
    failAppointmentAt = 3; appointmentWrites = 0;
    await create(1, { ...newPrimary, date: '2099-11-16', additionalPets: [newPet('Nueva Dos'), newPet('Nueva Tres')] }, 500);
    failAppointmentAt = 0;
    assert.deepEqual(await batchCounts(), beforeNewFailure, 'Si falla la tercera mascota, se revierte toda la reserva');
    const firstTimeTutor = await create(1, { ...newPrimary, date: '2099-11-17', tutorFirstName: 'Maria', tutorFirstSurname: 'Nueva', tutorPhone: '66666661',
      paymentMethod: transfer.codigo, additionalPets: [newPet('Nueva Dos'), newPet('Nueva Tres'), newPet('Nueva Cuatro')] });
    const firstTimeRows = await Promise.all(firstTimeTutor.ids.map(get));
    assert.equal(firstTimeRows.length, 4);
    assert.equal(new Set(firstTimeRows.map(row => row.tutorId)).size, 1);
    assert(firstTimeRows.every(row => !row.patientId && row.routeId === firstTimeTutor.routeId && row.paymentMethod === transfer.codigo));
    const [[newTutors]] = await connection.query("SELECT COUNT(*) AS count FROM tutor WHERE telefono = '66666661'");
    assert.equal(newTutors.count, 1, 'Un tutor nuevo y cuatro mascotas generan un solo tutor y una sola ruta');
    const [[patientsAfter]] = await connection.query('SELECT COUNT(*) AS count FROM paciente');
    assert.deepEqual(patientsAfter, patientsBefore);
    assert.equal(await snapshot(), originalRows);
    assert.deepEqual(await get(legacy.id), originalApi);
    const [[salesAfter]] = await connection.query('SELECT COUNT(*) AS count FROM cierre_venta');
    const [[paymentsAfter]] = await connection.query('SELECT COUNT(*) AS count FROM venta_pago');
    assert.deepEqual(salesAfter, salesBefore); assert.deepEqual(paymentsAfter, paymentsBefore);
    const companions = await call(controller.listarCompanerosGrooming, { params: { id: '1' } });
    assert.deepEqual(companions.map(item => item.id).sort(), ['1', '2', '3', '4', '7']);
  } finally {
    pool.query = originalQuery; pool.getConnection = originalGet;
    await connection.rollback(); connection.release(); await pool.end();
  }
});
