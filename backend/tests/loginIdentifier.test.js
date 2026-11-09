const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequest } = require('../src/middleware/requestValidationMiddleware');

const validate = (path, body, method = 'POST') => {
  const result = { accepted: false, statusCode: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json() { return this; },
  };
  validateRequest({ path, body, method }, res, () => { result.accepted = true; });
  return result;
};

test('login acepta usuarios y conserva el acceso por correo', () => {
  for (const correo of ['admin', ' usuario.demo ', 'usuario@clinica.example']) {
    assert.equal(validate('/api/auth/login', { correo }).accepted, true);
  }
});

test('la excepción de usuario solo aplica al identificador del login', () => {
  for (const path of ['/api/usuarios', '/api/auth/forgot-password', '/api/auth/reset-password']) {
    assert.equal(validate(path, { correo: 'admin' }).statusCode, 400);
    assert.equal(validate(path, { correo: 'usuario@clinica.example' }).accepted, true);
  }
  assert.equal(validate('/api/auth/login', { email: 'admin' }).statusCode, 400);
  assert.equal(validate('/api/auth/login', { correo: 'admin' }, 'PUT').statusCode, 400);
});

test('login rechaza identificadores malformados y conserva validación del cuerpo', () => {
  for (const correo of ['admin@', 'dos usuarios', 'a'.repeat(151), 'admin\u0000']) {
    assert.equal(validate('/api/auth/login', { correo }).statusCode, 400);
  }
  assert.equal(validate('/api/auth/login', {
    correo: 'admin', password: 'example\u0000',
  }).statusCode, 400);
});
