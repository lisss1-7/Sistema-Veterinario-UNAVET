const nodemailer = require('nodemailer');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

let transporter;

const getTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } =
    process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'El correo no está configurado. Revisa SMTP_HOST, SMTP_USER y SMTP_PASS.'
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: SMTP_SECURE === 'true',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return transporter;
};

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  const sender =
    process.env.SMTP_FROM || `UNAVET <${process.env.SMTP_USER}>`;

  await getTransporter().sendMail({
    from: sender,
    to,
    subject: 'Restablece tu contraseña de UNAVET',
    text: [
      'Recibimos una solicitud para restablecer tu contraseña de UNAVET.',
      '',
      `Abre este enlace durante los próximos 30 minutos: ${resetUrl}`,
      '',
      'Si no solicitaste el cambio, puedes ignorar este correo.',
    ].join('\n'),
    html: `
      <div style="background:#f5efe4;padding:32px 16px;font-family:Arial,sans-serif;color:#3d2e1f">
        <div style="max-width:560px;margin:auto;background:#fffaf3;border:1px solid #e8d9c5;border-radius:18px;padding:32px">
          <div style="font-size:28px;margin-bottom:16px">🐾</div>
          <h1 style="font-size:22px;margin:0 0 12px">Restablece tu contraseña</h1>
          <p style="line-height:1.6;color:#6b5b4d">
            Recibimos una solicitud para cambiar la contraseña de tu cuenta en UNAVET.
          </p>
          <p style="margin:28px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#7b5b42;color:#fffaf3;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold">
              Crear nueva contraseña
            </a>
          </p>
          <p style="font-size:14px;line-height:1.6;color:#6b5b4d">
            Este enlace vence en 30 minutos y deja de funcionar después de cambiar la contraseña.
            Si no solicitaste este cambio, ignora el mensaje.
          </p>
        </div>
      </div>
    `,
  });
};

const sendConfigurationTestEmail = async () => {
  const sender =
    process.env.SMTP_FROM || `UNAVET <${process.env.SMTP_USER}>`;
  const match = sender.match(/<([^>]+)>/);
  const recipient = match ? match[1] : sender;

  await getTransporter().sendMail({
    from: sender,
    to: recipient,
    subject: 'Correo de UNAVET configurado correctamente',
    text:
      'Esta es una prueba de configuración. UNAVET ya puede enviar correos de recuperación de contraseña.',
    html: `
      <div style="background:#f5efe4;padding:32px 16px;font-family:Arial,sans-serif;color:#3d2e1f">
        <div style="max-width:560px;margin:auto;background:#fffaf3;border:1px solid #e8d9c5;border-radius:18px;padding:32px">
          <div style="font-size:28px;margin-bottom:16px">🐾</div>
          <h1 style="font-size:22px;margin:0 0 12px">¡Correo configurado!</h1>
          <p style="line-height:1.6;color:#6b5b4d">
            UNAVET ya puede enviar correos de recuperación de contraseña.
          </p>
        </div>
      </div>
    `,
  });
};

module.exports = {
  verifyEmailConfiguration: () => getTransporter().verify(),
  sendPasswordResetEmail,
  sendConfigurationTestEmail,
};
