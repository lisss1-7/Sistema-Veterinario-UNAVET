const validarHorarioConfigurado = async ({
  connection,
  moduleCode,
  date,
  time,
  groomingTypeName,
}) => {
  const params = [moduleCode, date, time, time, time];
  let typeFilter = 'AND h.tipo_grooming_id IS NULL';

  if (groomingTypeName) {
    typeFilter = `
      AND h.tipo_grooming_id = (
        SELECT tipo_grooming_id
        FROM tipos_grooming
        WHERE nombre = ?
        LIMIT 1
      )
    `;
    params.push(groomingTypeName);
  }

  const [rows] = await connection.query(
    `
    SELECT 1
    FROM horarios_atencion h
    INNER JOIN modulos_sistema m ON m.modulo_id = h.modulo_id
    WHERE m.codigo = ?
      AND h.dia_semana = DAYOFWEEK(?) - 1
      AND h.activo = 1
      AND TIME(?) BETWEEN h.hora_inicio AND h.hora_fin
      AND MOD(
        TIME_TO_SEC(TIMEDIFF(TIME(?), h.hora_inicio)) / 60,
        h.intervalo_minutos
      ) = 0
      AND TIME(?) IS NOT NULL
      ${typeFilter}
    LIMIT 1
    `,
    params
  );

  return rows.length > 0;
};

module.exports = { validarHorarioConfigurado };
