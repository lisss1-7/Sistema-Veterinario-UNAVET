const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const pool = require('./config/db');
const { validateEnvironment } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const pacientesRoutes = require('./routes/pacientesRoutes');
const historialRoutes = require('./routes/historialRoutes');
const vacunacionesRoutes = require('./routes/vacunacionesRoutes');
const tratamientosRoutes = require('./routes/tratamientosRoutes');
const citasRoutes = require('./routes/citasRoutes');
const groomingRoutes = require('./routes/groomingRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const recetasRoutes = require('./routes/recetasRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const catalogosRoutes = require('./routes/catalogosRoutes');
const tutoresRoutes = require('./routes/tutoresRoutes');
const aiReportsRoutes = require('./routes/aiReportsRoutes');
const cierreVentasRoutes = require('./routes/cierreVentasRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const { validateRequest } = require('./middleware/requestValidationMiddleware');
const {
  hideInternalErrors,
  securityHeaders,
} = require('./middleware/securityMiddleware');

validateEnvironment();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(
  [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map((origin) => String(origin || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(hideInternalErrors);
app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = String(origin || '').replace(/\/+$/, '');
      if (!origin || !isProduction || allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }
      const error = new Error('Origen no permitido');
      error.statusCode = 403;
      return callback(error);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    maxAge: 86400,
  })
);
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
  limit: '10mb',
  extended: true,
  parameterLimit: 1000,
}));
app.use(validateRequest);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Backend UNAVET funcionando correctamente' });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.set('Cache-Control', 'no-store');
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error(`[${req.requestId}] Error en comprobación de salud:`, error);
    return res.status(503).json({ status: 'unavailable' });
  }
});

if (!isProduction) {
  app.get('/api/test-db', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT DATABASE() AS database_name');
      return res.json({
        message: 'Conexión a MySQL correcta',
        database: rows[0].database_name,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Error al conectar con MySQL',
        error: error.message,
      });
    }
  });
}

app.use('/api/media', mediaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/historial-clinico', historialRoutes);
app.use('/api/vacunaciones', vacunacionesRoutes);
app.use('/api/tratamientos', tratamientosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/grooming', groomingRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/recetas', recetasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/tutores', tutoresRoutes);
app.use('/api/ai-reports', aiReportsRoutes);
app.use('/api/cierre-ventas', cierreVentasRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'La imagen es demasiado grande. Intenta con una foto más pequeña o sin foto.',
    });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      message: 'Error en el formato de los datos. Intenta nuevamente.',
    });
  }

  const statusCode = Number(error?.statusCode) || 500;
  if (statusCode >= 500) {
    console.error(`[${req.requestId}] Error no controlado:`, error);
  }
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Error interno del servidor' : error.message,
  });
});

const PORT = Number(process.env.PORT) || 3001;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Servidor UNAVET corriendo en puerto ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} recibido. Cerrando servidor...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
