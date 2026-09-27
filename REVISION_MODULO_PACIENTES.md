# Revisión funcional y técnica del módulo de Pacientes

**Sistema:** UNAVET  
**Fecha de revisión:** 21 de septiembre de 2026  
**Alcance:** Pacientes, tutores, expediente clínico, historial clínico, vacunación y tratamientos/servicios.

## Resumen ejecutivo

El módulo permite registrar pacientes y tutores, consultar el expediente de cada mascota y agregar información clínica, esquemas de vacunación y tratamientos o servicios. También genera documentos PDF individuales y consolidados.

El flujo de pacientes y el historial clínico están mayormente implementados. El principal problema está en el seguimiento: las vacunaciones y los tratamientos solo pueden crearse o eliminarse; no pueden actualizarse para registrar nuevas dosis, resultados o cambios de estado. La base de datos ya muestra consecuencias de esta limitación: existen esquemas separados para una misma combinación de paciente y vacuna, y hay tratamientos con estado final sin un resultado registrado.

## 1. Objetivo y flujo del módulo

### 1.1 Pacientes y tutores

**Objetivo:** centralizar los datos de identificación de las mascotas y de sus tutores, y servir como punto de entrada al expediente clínico.

**Ingreso de información:**

1. El usuario entra en **Pacientes**.
2. Selecciona **Agregar paciente**.
3. Registra nombre, especie, raza, edad, sexo, estado reproductivo, color, alimentación, fotografía y observaciones.
4. Puede registrar un tutor nuevo o elegir un tutor existente.
5. El formulario consume catálogos de especies, razas, sexos y estados reproductivos desde la base de datos.
6. El backend valida los campos y guarda paciente y tutor dentro de una transacción.

**Seguimiento:**

- El listado permite buscar por mascota, tutor o raza.
- Permite filtrar por especie, ordenar y paginar.
- El paciente puede editarse y reasignarse a otro tutor.
- Existe una vista de tutores con sus mascotas activas.
- El botón **Ver** abre el expediente con sus submódulos.

**Finalización:** el paciente no tiene un estado explícito de “finalizado”. Su ciclo termina operativamente cuando se elimina desde la interfaz, acción que en realidad lo marca como inactivo mediante baja lógica. Los registros clínicos asociados permanecen en la base de datos mientras el paciente solo se desactive.

### 1.2 Expediente y datos generales

**Objetivo:** reunir en una sola pantalla los datos generales y toda la actividad clínica del paciente.

El expediente presenta cuatro pestañas:

1. Datos generales.
2. Historial clínico.
3. Vacunación.
4. Tratamientos y servicios.

Desde el encabezado también se puede abrir el módulo de recetas con el paciente preseleccionado.

### 1.3 Historial clínico

**Objetivo:** documentar consultas, evaluación física, diagnóstico, tratamiento y observaciones.

**Ingreso de información:**

- Manualmente desde **Nuevo registro** en el expediente.
- Automáticamente desde una cita clínica vinculada a un paciente. La cita crea un registro con origen “Cita clínica” y estado “Pendiente”.

El formulario incluye tipo de consulta, veterinario, motivo, cirugías previas, masas visibles, ocho parámetros del examen físico, diagnóstico, tratamiento y observaciones.

**Seguimiento:**

- Los registros pueden verse, editarse, eliminarse y descargarse en PDF.
- Cuando un registro proviene de una cita, el botón de edición se presenta como **Completar consulta**.
- Al guardar cualquier registro desde la interfaz se envía el estado clínico “Completado”.

**Finalización:** un registro termina cuando su estado cambia a **Completado**. En los datos actuales existen 7 registros: 6 pendientes provenientes de citas y 1 manual completado.

### 1.4 Vacunación

**Objetivo:** registrar esquemas de vacunación, dosis aplicadas, intervalos y próxima dosis.

**Ingreso de información:** se selecciona vacuna, fecha de aplicación, veterinario, lote opcional, total de dosis, dosis aplicadas, intervalo, unidad y notas.

**Seguimiento actual:** el sistema calcula la próxima dosis y clasifica automáticamente el esquema como:

- **Próxima dosis**: aún faltan dosis y la siguiente fecha no está vencida.
- **Vencida**: la fecha calculada de la próxima dosis ya pasó.
- **Completado**: la cantidad de aplicaciones registradas alcanza el total de dosis.

**Problema:** no existe una acción para agregar la siguiente dosis a un esquema existente ni una ruta de actualización. Para continuar el proceso se debe crear otro esquema, lo que fragmenta el historial.

**Finalización:** técnicamente termina cuando el número de aplicaciones alcanza `dosis_totales`, aunque parte de esas aplicaciones puede registrarse como dosis histórica sin fecha conocida.

### 1.5 Tratamientos y servicios

**Objetivo:** registrar tratamientos médicos y servicios de laboratorio relacionados con el paciente.

**Ingreso de información:**

- Tratamiento médico: nombre, categoría escrita manualmente, veterinario, estado, diagnóstico o motivo, observaciones y fotografía.
- Servicio de laboratorio: prueba de catálogo, veterinario, estado del resultado, motivo, observaciones y fotografía.

**Seguimiento actual:** los registros se pueden consultar, descargar en PDF o eliminar.

**Problema:** no existe edición ni actualización. No se puede cambiar el estado después de crear el registro ni agregar el resultado de laboratorio desde la interfaz.

**Finalización:** depende del estado seleccionado al crear el registro, por ejemplo **Completado** o **Resultado recibido**. No hay una transición controlada entre estados ni validación que exija un resultado para los estados finales.

## 2. Reportes existentes

El expediente contiene **6 tipos de reportes PDF**. Cada uno ofrece vista previa y descarga:

| N.º | Reporte | Contenido |
|---:|---|---|
| 1 | Registro clínico individual | Datos del paciente, consulta, veterinario, motivo, diagnóstico y tratamiento. |
| 2 | Historial clínico completo | Consolidado de registros con fecha, tipo, diagnóstico y tratamiento. |
| 3 | Vacuna individual | Vacuna, aplicación, veterinario, dosis, próxima dosis, intervalo, estado y notas. |
| 4 | Esquema de vacunación | Tabla consolidada de vacunas, dosis, próximas fechas y estados. |
| 5 | Tratamiento o servicio individual | Tipo, categoría, estado, veterinario, fecha, motivo, observaciones y fotografía. |
| 6 | Tratamientos y servicios completos | Consolidado detallado de todos los tratamientos y servicios del paciente. |

**Hallazgo sobre reportes:** el PDF clínico individual no incluye todo el examen físico, cirugías previas, masas visibles u observaciones. El reporte individual de tratamiento tampoco muestra el campo `resultado`. El reporte consolidado sí está preparado para mostrarlo, pero la interfaz no permite capturarlo.

## 3. Mantenimientos del módulo

### Mantenimientos visibles en el grupo Pacientes

- Razas, asociadas a una especie.
- Tipos de consulta.
- Pruebas de laboratorio.

Estos mantenimientos son coherentes con partes del flujo y provienen de MySQL.

### Mantenimientos relacionados ubicados en otro grupo

- Tipos de tratamiento.
- Estados de tratamiento.

Se muestran bajo **Tratamientos y Recetas** y requieren permisos del módulo de recetas, aunque los tratamientos también forman parte del expediente de Pacientes. Esto puede impedir que un responsable de Pacientes administre los catálogos que utiliza su propio submódulo.

### Catálogos consumidos pero no mantenibles desde la interfaz

- Especies.
- Sexos.
- Estados reproductivos.
- Vacunas.
- Estados del examen físico.
- Unidades de intervalo.
- Estados de vacunación.
- Veterinarios.

Varios están marcados como solo lectura y ni siquiera aparecen en la pantalla de mantenimiento. Esto protege valores estructurales, pero la gestión es incompleta si la clínica necesita agregar una vacuna o especie sin ejecutar scripts o consultas externas.

### Incoherencia adicional

La categoría de un tratamiento médico se escribe como texto libre. El backend crea o reactiva automáticamente una categoría con ese texto, pero no existe un mantenimiento visible de categorías de tratamiento. Esto favorece duplicados ortográficos y nombres poco normalizados.

## 4. Errores y hallazgos

### H-01 — No se puede continuar un esquema de vacunación existente

**Severidad:** alta.  
**Evidencia:** solo existen `POST` y `DELETE` para vacunación; no hay actualización ni acción para agregar una dosis. La base actual contiene dos combinaciones paciente-vacuna con más de un esquema independiente.  
**Impacto:** historial fragmentado, duplicación de esquemas y cálculo de seguimiento poco confiable.

### H-02 — Tratamientos y laboratorios no admiten seguimiento

**Severidad:** alta.  
**Evidencia:** solo existen `POST` y `DELETE`; no existe `PUT` o `PATCH`.  
**Impacto:** no se puede cambiar de “Activo” a “Completado”, de “Resultado pendiente” a “Resultado recibido”, ni registrar evolución.

### H-03 — Estados finales sin resultado

**Severidad:** alta.  
**Evidencia de base de datos:** hay un registro con estado **Completado** y otro con **Resultado recibido**, ambos sin contenido en `resultado`.  
**Causa:** el formulario no incluye un campo para capturar el resultado y el backend no lo exige para estados finales.

### H-04 — Dosis aplicadas sin trazabilidad completa

**Severidad:** media-alta.  
**Evidencia:** si el usuario indica varias dosis aplicadas al crear un esquema, el backend genera las dosis anteriores con fecha desconocida, sin lote y sin veterinario, pero todas cuentan para declarar el esquema completado.  
**Impacto:** un esquema puede figurar como completo sin evidencia individual de cada aplicación.

### H-05 — Eliminación irreversible de información clínica

**Severidad:** alta por trazabilidad.  
**Evidencia:** historial, vacunación y tratamientos usan eliminación física mediante `DELETE`.  
**Impacto:** un usuario con permiso puede borrar antecedentes médicos y auditoría. Pacientes usa baja lógica, pero sus subregistros no siguen la misma política.

### H-06 — Estado de carga confundido con “Paciente no encontrado”

**Severidad:** media.  
**Evidencia:** la pantalla inicia con `patient = null` y muestra inmediatamente **Paciente no encontrado** mientras la solicitud todavía está cargando. No existe un estado `isLoading` independiente.  
**Impacto:** mensaje incorrecto o parpadeo al abrir el expediente; un fallo de red también se presenta igual que un identificador inexistente.

### H-07 — Los errores de carga se ocultan como listas vacías

**Severidad:** media.  
**Evidencia:** al fallar historial, vacunación, tratamientos o catálogos, la interfaz registra el error en consola y sustituye la información por arreglos vacíos.  
**Impacto:** el usuario puede creer que el paciente no tiene registros, cuando en realidad falló el servidor o la autorización.

### H-08 — Mantenimientos incompletos y permisos cruzados

**Severidad:** media.  
**Evidencia:** el grupo Pacientes solo ofrece tres mantenimientos. Tipos y estados de tratamiento requieren permisos de Recetas; vacunas y otros catálogos son solo lectura.  
**Impacto:** la persona encargada del módulo puede depender de otro rol o de cambios directos en base de datos.

### H-09 — Reportes clínicos incompletos

**Severidad:** media.  
**Evidencia:** los PDF individuales omiten parte de la información disponible en pantalla; el resultado de laboratorio no aparece en el PDF individual.  
**Impacto:** el documento descargado no representa todo el expediente disponible.

### H-10 — Adjuntos sin validación preventiva de tamaño

**Severidad:** media-baja.  
**Evidencia:** la fotografía del paciente se comprime antes de enviarse, pero la fotografía de tratamientos se convierte directamente a Base64. El backend acepta hasta 15 MB y después devuelve error.  
**Impacto:** solicitudes pesadas, consumo de memoria y errores tardíos en dispositivos móviles.

### H-11 — Falta de verificación TypeScript formal

**Severidad:** baja.  
**Evidencia:** el proyecto compila con Vite, pero no contiene `tsconfig.json` ni un script de comprobación de tipos. Existen usos amplios de `any`.  
**Impacto:** algunos errores de propiedades o contratos pueden pasar la compilación de producción.

## 5. Mejoras propuestas

### Prioridad 1

1. Agregar una operación para aplicar la siguiente dosis a un esquema existente, conservando fecha, lote y veterinario por dosis.
2. Agregar edición de tratamientos y servicios con historial de cambios de estado.
3. Incorporar captura obligatoria de resultado y fecha cuando el laboratorio pase a **Resultado recibido** o **Completado**.
4. Sustituir la eliminación física de registros clínicos por baja lógica y auditoría de usuario/fecha/motivo.

### Prioridad 2

5. Separar los estados de carga, vacío, error y no encontrado en el expediente.
6. Unificar los mantenimientos clínicos bajo permisos coherentes con Pacientes o definir permisos específicos para expediente.
7. Crear un catálogo formal de categorías de tratamiento y sustituir el texto libre por un selector.
8. Completar los PDF con examen físico, observaciones, resultados y datos de seguimiento.

### Prioridad 3

9. Comprimir y limitar adjuntos antes de convertirlos a Base64.
10. Incorporar `tsconfig.json`, comprobación `tsc --noEmit` y pruebas automatizadas para historial, vacunación y tratamientos.
11. Añadir filtros dentro del expediente por fecha, estado y tipo cuando aumente el volumen de registros.

## Evidencias de validación realizadas

- Frontend disponible en HTTP 200.
- Backend disponible en HTTP 200.
- Conexión con MySQL correcta.
- Construcción de producción completada correctamente.
- Advertencia de paquete principal superior a 500 kB; no impide la compilación.
- Prueba de atribución: 1 aprobada.
- Pruebas de pacientes/tutores: 5 aprobadas.
- Validación de sintaxis de los cinco controladores revisados: correcta.
- Datos revisados en modo solo lectura: 20 pacientes totales, 11 activos, 7 historiales, 6 esquemas de vacunación y 4 tratamientos/servicios.

## Capturas necesarias para el documento

La sesión de revisión no tenía un navegador conectado, por lo que estas capturas quedan pendientes. Se recomienda numerarlas así:

1. Listado general de Pacientes.
2. Formulario de registro de paciente y tutor.
3. Vista de tutores y mascotas asociadas.
4. Expediente: Datos generales.
5. Expediente: Historial clínico.
6. Formulario de nuevo registro clínico.
7. Expediente: Vacunación.
8. Formulario de registro de vacuna.
9. Evidencia visual de que una vacuna no tiene botón para agregar dosis o editar.
10. Expediente: Tratamientos y servicios.
11. Formulario de tratamiento o laboratorio sin campo de resultado.
12. Evidencia visual de que tratamientos solo permite ver, generar PDF o eliminar.
13. Pantalla de Mantenimiento del grupo Pacientes.
14. Pantalla de Mantenimiento del grupo Tratamientos y Recetas.
15. Vista previa de cada uno de los seis tipos de PDF.
16. Cualquier mensaje de error reproducible durante la prueba interactiva.

## Referencias técnicas principales

- `src/app/pages/Patients.tsx`
- `src/app/pages/PatientDetail.tsx`
- `src/app/pages/PatientCatalogs.tsx`
- `backend/src/controllers/pacientesController.js`
- `backend/src/controllers/historialController.js`
- `backend/src/controllers/vacunacionesController.js`
- `backend/src/controllers/tratamientosController.js`
- `backend/src/controllers/catalogosProcesoPacientesController.js`
- `backend/src/controllers/citasController.js`

