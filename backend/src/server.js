const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./config/db');
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
const { validateRequest } = require('./middleware/requestValidationMiddleware');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(validateRequest);

app.get('/', (req, res) => {
  res.json({
    message: 'Backend UNAVET funcionando correctamente',
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS database_name');

    res.json({
      message: 'Conexión a MySQL correcta',
      database: rows[0].database_name,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al conectar con MySQL',
      error: error.message,
    });
  }
});

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


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor UNAVET corriendo en puerto ${PORT}`);
});
