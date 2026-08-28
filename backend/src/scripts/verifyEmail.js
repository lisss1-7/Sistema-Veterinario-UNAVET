const { verifyEmailConfiguration } = require('../utils/mailer');

const run = async () => {
  await verifyEmailConfiguration();
  console.log('Configuración de correo verificada correctamente.');
};

run().catch((error) => {
  console.error('La configuración de correo no es válida:', error.message);
  process.exitCode = 1;
});
