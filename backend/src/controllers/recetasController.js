const pool = require('../config/db');
const {
  consumeLots,
  restoreLots,
} = require('../utils/inventoryLots');

const mapRecetaToFrontend = (row, medications = []) => {
  return {
    id: String(row.receta_id),
    patientId: String(row.paciente_id),
    tutorName: row.nombre_tutor || '',
    tutorPhone: row.telefono_tutor || '',
    date: row.fecha_emision,
    veterinarianId: row.veterinario_id
      ? String(row.veterinario_id)
      : '',
    veterinarian: row.veterinario || '',
    diagnosis: row.diagnostico || '',
    observations: row.observaciones || '',
    status: row.estado,
    medications,
  };
};

const mapMedicamentoToFrontend = (row) => ({
  id: String(row.receta_medicamento_id),

  productId: row.producto_id
    ? String(row.producto_id)
    : undefined,

  productName: row.nombre_medicamento,

  fromInventory: Boolean(row.producto_id),

  availableStock:
    row.stock_actual !== null &&
    row.stock_actual !== undefined
      ? Number(row.stock_actual)
      : undefined,

  quantity: Number(row.cantidad || 0),
  instructions: row.indicaciones || '',
  deliveryMode: row.modo_entrega,
});

const obtenerMedicamentosPorReceta = async (
  connection,
  recetaId
) => {
  const [rows] = await connection.query(
    `
    SELECT
      rm.receta_medicamento_id,
      rm.producto_id,
      rm.nombre_medicamento,
      rm.indicaciones,
      rm.cantidad,
      modo.nombre AS modo_entrega,
      modo.descuenta_inventario,
      (
        SELECT COALESCE(SUM(lote.stock), 0)
        FROM lotes_producto lote
        WHERE lote.producto_id = rm.producto_id
      ) AS stock_actual
    FROM receta_medicamentos rm
    LEFT JOIN productos_inventario p
      ON rm.producto_id = p.producto_id
    INNER JOIN modos_entrega_receta modo
      ON modo.modo_entrega_id = rm.modo_entrega_id
    WHERE rm.receta_id = ?
    ORDER BY rm.receta_medicamento_id ASC
    `,
    [recetaId]
  );

  return rows.map(mapMedicamentoToFrontend);
};

const listarRecetas = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query(
      `
      SELECT
        r.receta_id,
        r.paciente_id,
        r.tutor_id,
        r.veterinario_id,
        DATE_FORMAT(
          r.fecha_emision,
          '%Y-%m-%d'
        ) AS fecha_emision,
        r.diagnostico,
        r.observaciones,
        estado.nombre AS estado,
        CONCAT_WS(
          ' ',
          veterinario.primer_nombre,
          veterinario.segundo_nombre,
          veterinario.primer_apellido,
          veterinario.segundo_apellido
        ) AS veterinario,
        CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
          t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
        t.telefono AS telefono_tutor
      FROM recetas r
      LEFT JOIN tutores t
        ON r.tutor_id = t.tutor_id
      LEFT JOIN veterinarios veterinario
        ON veterinario.veterinario_id = r.veterinario_id
      INNER JOIN estados_receta estado
        ON estado.estado_receta_id = r.estado_receta_id
      ORDER BY r.receta_id DESC
      `
    );

    const recetas = [];

    for (const row of rows) {
      const medications =
        await obtenerMedicamentosPorReceta(
          connection,
          row.receta_id
        );

      recetas.push(
        mapRecetaToFrontend(row, medications)
      );
    }

    res.json(recetas);
  } catch (error) {
    console.error('Error al listar recetas:', error);

    res.status(500).json({
      message: 'Error al listar recetas',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const obtenerRecetaPorId = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [rows] = await connection.query(
      `
      SELECT
        r.receta_id,
        r.paciente_id,
        r.tutor_id,
        r.veterinario_id,
        DATE_FORMAT(
          r.fecha_emision,
          '%Y-%m-%d'
        ) AS fecha_emision,
        r.diagnostico,
        r.observaciones,
        estado.nombre AS estado,
        CONCAT_WS(
          ' ',
          veterinario.primer_nombre,
          veterinario.segundo_nombre,
          veterinario.primer_apellido,
          veterinario.segundo_apellido
        ) AS veterinario,
        CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre,
          t.primer_apellido, t.segundo_apellido) AS nombre_tutor,
        t.telefono AS telefono_tutor
      FROM recetas r
      LEFT JOIN tutores t
        ON r.tutor_id = t.tutor_id
      LEFT JOIN veterinarios veterinario
        ON veterinario.veterinario_id = r.veterinario_id
      INNER JOIN estados_receta estado
        ON estado.estado_receta_id = r.estado_receta_id
      WHERE r.receta_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Receta no encontrada',
      });
    }

    const medications =
      await obtenerMedicamentosPorReceta(
        connection,
        id
      );

    res.json(
      mapRecetaToFrontend(rows[0], medications)
    );
  } catch (error) {
    console.error(
      'Error al obtener receta:',
      error
    );

    res.status(500).json({
      message: 'Error al obtener receta',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const validarMedicamentos = (medications) => {
  if (
    !Array.isArray(medications) ||
    medications.length === 0
  ) {
    return 'Debe incluir al menos un medicamento';
  }

  for (const med of medications) {
    if (
      !med.productName ||
      !String(med.productName).trim()
    ) {
      return 'Todos los medicamentos deben tener nombre';
    }

    const quantity = Number(med.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return `La cantidad de ${med.productName} debe ser mayor que cero`;
    }

    if (!med.deliveryMode) {
      return `Debe seleccionar el modo de entrega de ${med.productName}`;
    }

  }

  return null;
};

const descontarMedicamentosDelInventario =
  async ({
    connection,
    medications,
    recetaId,
    usuarioId,
  }) => {
    for (const med of medications) {
      const quantity = Number(med.quantity);
      const productId = med.productId || null;
      const deliveryMode = med.deliveryMode;
      const [deliveryModes] = await connection.query(
        `SELECT modo_entrega_id, descuenta_inventario
         FROM modos_entrega_receta
         WHERE nombre = ? AND activo = 1
         LIMIT 1`,
        [deliveryMode]
      );
      if (deliveryModes.length === 0) {
        throw new Error(`Modo de entrega no válido para ${med.productName}`);
      }
      if (deliveryModes[0].descuenta_inventario && !productId) {
        const error = new Error(
          `El medicamento ${med.productName} debe seleccionarse desde inventario para este modo de entrega`
        );
        error.statusCode = 400;
        throw error;
      }

      const [medicationResult] = await connection.query(
        `INSERT INTO receta_medicamentos (
          receta_id,
          producto_id,
          nombre_medicamento,
          dosis,
          frecuencia,
          duracion,
          indicaciones,
          cantidad,
          modo_entrega_id
        )
        VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        [
          recetaId,
          productId,
          String(med.productName).trim(),
          med.instructions || null,
          quantity,
          deliveryModes[0].modo_entrega_id,
        ]
      );

      if (deliveryModes[0].descuenta_inventario && productId) {
        const consumption = await consumeLots({
          connection,
          productId,
          quantity,
          userId: usuarioId,
          reason:
            'Salida por medicamento entregado en receta médica',
          referenceType: 'Receta',
          referenceId: recetaId,
        });
        for (const allocation of consumption.allocations) {
          await connection.query(
            `INSERT INTO receta_medicamento_lotes (
               receta_medicamento_id,
               producto_lote_id,
               cantidad
             )
             VALUES (?, ?, ?)`,
            [
              medicationResult.insertId,
              allocation.lotId,
              allocation.quantity,
            ]
          );
        }
      }
    }
  };

const crearReceta = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const {
      patientId,
      diagnosis,
      observations,
      veterinarianId,
      medications,
    } = req.body;

    if (!patientId || !diagnosis || !veterinarianId) {
      return res.status(400).json({
        message:
          'Paciente, veterinario y diagnóstico son obligatorios',
      });
    }

    const validationError =
      validarMedicamentos(medications);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [patientRows] =
      await connection.query(
        `
        SELECT
          paciente_id,
          tutor_id
        FROM pacientes
        WHERE paciente_id = ?
          AND activo = 1
        LIMIT 1
        `,
        [patientId]
      );

    if (patientRows.length === 0) {
      const error = new Error(
        'Paciente no encontrado'
      );

      error.statusCode = 404;
      throw error;
    }

    const tutorId = patientRows[0].tutor_id;

    const [recetaResult] =
      await connection.query(
        `
        INSERT INTO recetas (
          paciente_id,
          tutor_id,
          veterinario_id,
          fecha_emision,
          diagnostico,
          observaciones,
          estado_receta_id,
          creado_por
        )
        VALUES (
          ?,
          ?,
          ?,
          CURDATE(),
          ?,
          ?,
          (SELECT estado_receta_id
           FROM estados_receta
           WHERE es_inicial = 1 AND activo = 1
           LIMIT 1),
          ?
        )
        `,
        [
          patientId,
          tutorId,
          veterinarianId || null,
          diagnosis,
          observations || null,
          req.user?.id || null,
        ]
      );

    const recetaId = recetaResult.insertId;

    await descontarMedicamentosDelInventario({
      connection,
      medications,
      recetaId,
      usuarioId: req.user?.id || null,
    });

    await connection.commit();

    res.status(201).json({
      message: 'Receta creada correctamente',
      id: String(recetaId),
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error(
      'Error al crear receta:',
      error
    );

    res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          'Error al crear receta',
      });
  } finally {
    connection.release();
  }
};

const actualizarReceta = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const { id } = req.params;

    const {
      patientId,
      diagnosis,
      observations,
      veterinarianId,
      medications,
    } = req.body;

    if (!patientId || !diagnosis || !veterinarianId) {
      return res.status(400).json({
        message:
          'Paciente, veterinario y diagnóstico son obligatorios',
      });
    }

    const validationError =
      validarMedicamentos(medications);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [recetaRows] =
      await connection.query(
        `
        SELECT
          receta.receta_id,
          estado.es_anulado
        FROM recetas receta
        INNER JOIN estados_receta estado
          ON estado.estado_receta_id = receta.estado_receta_id
        WHERE receta.receta_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [id]
      );

    if (recetaRows.length === 0) {
      const error = new Error(
        'Receta no encontrada'
      );

      error.statusCode = 404;
      throw error;
    }

    if (recetaRows[0].es_anulado) {
      const error = new Error(
        'No se puede editar una receta anulada'
      );

      error.statusCode = 400;
      throw error;
    }

    const [patientRows] =
      await connection.query(
        `
        SELECT
          paciente_id,
          tutor_id
        FROM pacientes
        WHERE paciente_id = ?
          AND activo = 1
        LIMIT 1
        `,
        [patientId]
      );

    if (patientRows.length === 0) {
      const error = new Error(
        'Paciente no encontrado'
      );

      error.statusCode = 404;
      throw error;
    }

    const [oldAllocations] = await connection.query(
      `SELECT
         medicamento.producto_id,
         asignacion.producto_lote_id,
         asignacion.cantidad
       FROM receta_medicamentos medicamento
       INNER JOIN receta_medicamento_lotes asignacion
         ON asignacion.receta_medicamento_id =
           medicamento.receta_medicamento_id
       WHERE medicamento.receta_id = ?
       ORDER BY medicamento.producto_id, asignacion.producto_lote_id`,
      [id]
    );
    await restoreLots({
      connection,
      allocations: oldAllocations,
      userId: req.user?.id,
      reason:
        'Reversión de inventario por edición de receta médica',
      referenceType: 'Receta',
      referenceId: id,
    });

    await connection.query(
      `
      UPDATE recetas
      SET
        paciente_id = ?,
        tutor_id = ?,
        veterinario_id = ?,
        diagnostico = ?,
        observaciones = ?
      WHERE receta_id = ?
      `,
      [
        patientId,
        patientRows[0].tutor_id,
        veterinarianId || null,
        diagnosis,
        observations || null,
        id,
      ]
    );

    await connection.query(
      `
      DELETE FROM receta_medicamentos
      WHERE receta_id = ?
      `,
      [id]
    );

    /*
     * Después de devolver el inventario anterior,
     * insertamos la nueva versión de los medicamentos
     * y aplicamos sus nuevas salidas.
     */
    await descontarMedicamentosDelInventario({
      connection,
      medications,
      recetaId: id,
      usuarioId: req.user?.id || null,
    });

    await connection.commit();

    res.json({
      message:
        'Receta actualizada correctamente',
      id: String(id),
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error(
      'Error al actualizar receta:',
      error
    );

    res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          'Error al actualizar receta',
      });
  } finally {
    connection.release();
  }
};

const anularReceta = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    await connection.beginTransaction();

    const [recipes] = await connection.query(
      `SELECT receta.receta_id
       FROM recetas receta
       INNER JOIN estados_receta estado
         ON estado.estado_receta_id = receta.estado_receta_id
       WHERE receta.receta_id = ? AND estado.es_anulado = 0
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (recipes.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message:
          'Receta no encontrada o ya se encuentra anulada',
      });
    }

    const [allocations] = await connection.query(
      `SELECT
         medicamento.producto_id,
         asignacion.producto_lote_id,
         asignacion.cantidad
       FROM receta_medicamentos medicamento
       INNER JOIN receta_medicamento_lotes asignacion
         ON asignacion.receta_medicamento_id =
           medicamento.receta_medicamento_id
       WHERE medicamento.receta_id = ?
       ORDER BY medicamento.producto_id, asignacion.producto_lote_id`,
      [id]
    );
    await restoreLots({
      connection,
      allocations,
      userId: req.user?.id,
      reason: 'Reversión de inventario por anulación de receta',
      referenceType: 'Receta',
      referenceId: id,
    });

    await connection.query(
      `UPDATE recetas receta
       INNER JOIN estados_receta anulado
         ON anulado.es_anulado = 1 AND anulado.activo = 1
       SET receta.estado_receta_id = anulado.estado_receta_id
       WHERE receta.receta_id = ?`,
      [id]
    );
    await connection.commit();
    res.json({
      message:
        'Receta anulada e inventario reintegrado correctamente',
    });
  } catch (error) {
    await connection.rollback();
    console.error(
      'Error al anular receta:',
      error
    );

    res.status(500).json({
      message: 'Error al anular receta',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  listarRecetas,
  obtenerRecetaPorId,
  crearReceta,
  actualizarReceta,
  anularReceta,
};
