const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const run = async () => {
  const [[user]] = await pool.query(`
    SELECT u.usuario_id, u.correo, r.nombre AS rol
    FROM usuarios u
    INNER JOIN roles r ON r.rol_id = u.rol_id
    ORDER BY u.usuario_id
    LIMIT 1
  `);
  const token = jwt.sign(
    { id: user.usuario_id, correo: user.correo, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const endpoints = [
    { path: '/api/pacientes', person: 'tutor' },
    { path: '/api/citas', person: 'tutor' },
    { path: '/api/grooming', person: 'tutor' },
    { path: '/api/usuarios', person: 'user' },
    { path: '/api/perfil/me', person: 'user' },
    { path: '/api/recetas' },
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(
      `http://127.0.0.1:${process.env.PORT || 3001}${endpoint.path}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        `${endpoint.path}: HTTP ${response.status} ${JSON.stringify(body)}`
      );
    }

    const sample = Array.isArray(body) ? body[0] : body;
    if (sample && endpoint.person === 'tutor') {
      for (const field of ['tutorFirstName', 'tutorFirstSurname', 'tutorName']) {
        if (!(field in sample)) {
          throw new Error(`${endpoint.path}: falta el campo ${field}`);
        }
      }
    }
    if (sample && endpoint.person === 'user') {
      for (const field of ['firstName', 'firstSurname', 'name']) {
        if (!(field in sample)) {
          throw new Error(`${endpoint.path}: falta el campo ${field}`);
        }
      }
    }
    console.log(`${endpoint.path}: HTTP ${response.status}`);
  }
};

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
