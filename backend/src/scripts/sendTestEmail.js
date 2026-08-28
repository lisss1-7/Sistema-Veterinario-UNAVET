const { sendConfigurationTestEmail } = require('../utils/mailer');

const run = async () => {
  await sendConfigurationTestEmail();
  console.log('Correo de prueba enviado correctamente.');
};

run().catch((error) => {
  console.error('No se pudo enviar el correo de prueba:', error.message);
  process.exitCode = 1;
});
