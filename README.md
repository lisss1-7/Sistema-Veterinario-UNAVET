# UNAVET

**Sistema de gestión para clínicas veterinarias**

UNAVET reúne la información de pacientes y tutores, la atención clínica, las citas, el grooming, las recetas, el inventario y el cierre de ventas. Incluye control de acceso por roles y permisos, documentos PDF y reportes elaborados con los datos del sistema.

La interfaz se adapta a computadoras, tabletas y teléfonos e incorpora temas claro y oscuro.

[Aplicación en producción](https://unavet.duckdns.org) · [Código fuente](https://github.com/lisss1-7/Sistema-Veterinario-UNAVET)

## Contenido

- [Funcionalidades](#funcionalidades)
- [Tecnologías](#tecnologías)
- [Cómo funciona el sistema](#cómo-funciona-el-sistema)
- [Requisitos](#requisitos)
- [Instalación local](#instalación-local)
- [Configuración del backend](#configuración-del-backend)
- [Configuración del frontend](#configuración-del-frontend)
- [Iniciar, detener y comprobar los servicios](#iniciar-detener-y-comprobar-los-servicios)
- [Carpetas del proyecto](#carpetas-del-proyecto)
- [Comandos disponibles](#comandos-disponibles)
- [API y autenticación](#api-y-autenticación)
- [Base de datos y migraciones](#base-de-datos-y-migraciones)
- [Producción en Amazon Lightsail](#producción-en-amazon-lightsail)
- [Respaldos](#respaldos)
- [Solución de problemas](#solución-de-problemas)
- [Flujo de cambios en GitHub](#flujo-de-cambios-en-github)

## Funcionalidades

El acceso a cada opción depende de los permisos de la cuenta y del estado del registro.

| Módulo | Alcance |
| --- | --- |
| Dashboard | Resumen de actividad, próximas atenciones y accesos a los módulos. |
| Pacientes y tutores | Registro de mascotas, fotografías, responsables, datos de contacto y expediente individual. |
| Historial clínico | Consultas, evaluación, diagnóstico, tratamiento, observaciones y recetas vinculadas al paciente. |
| Vacunación | Registro de aplicaciones y esquemas, consulta y exportación de documentos. |
| Tratamientos y servicios | Tratamientos médicos, pruebas de laboratorio y archivos de apoyo mediante imagen o PDF. |
| Citas clínicas | Agenda, búsqueda, filtros, reprogramación y cambios de estado. |
| Grooming | Agenda de servicios, atención en clínica y coordinación de transporte. |
| Inventario | Productos, existencias, movimientos, compras, proveedores y auditoría de conteo físico. |
| Cierre de ventas | Registro de ventas, formas de pago, cierres consecutivos de turno y finalización del día. |
| Recetas | Medicamentos manuales o vinculados al inventario, motivo de consulta, diagnóstico opcional y modo de entrega. |
| Reportes IA | Consultas sobre métricas de la clínica, resúmenes, gráficas y exportación de resultados. |
| Usuarios y mantenimiento | Cuentas, estados de acceso, roles, permisos y catálogos que alimentan los formularios. |

Los PDF de recetas y registros clínicos incluyen textos justificados y observaciones con guiones. La vista previa y la descarga utilizan el mismo generador del documento correspondiente.

## Tecnologías

Las versiones exactas de las dependencias se conservan en los archivos `package-lock.json`. La siguiente tabla resume las líneas utilizadas por el proyecto.

| Capa | Tecnología | Función |
| --- | --- | --- |
| Interfaz | React 18.3 y TypeScript | Pantallas, componentes y gestión de la interacción. |
| Construcción del frontend | Vite 6.4 | Servidor de desarrollo, proxy de API y compilación. |
| Estilos e interfaz | Tailwind CSS 4.1, Radix UI y Lucide | Estilos, componentes interactivos e iconos. |
| Navegación | React Router 7 | Rutas y carga de pantallas por módulo. |
| Backend | Node.js 24 y Express 5 | API, validaciones, reglas de negocio y entrega del frontend compilado. |
| Base de datos | MySQL y mysql2 | Persistencia y acceso mediante un pool de conexiones. |
| Autenticación | JSON Web Tokens y bcryptjs | Sesiones mediante tokens y verificación de contraseñas con hash. |
| Documentos | jsPDF, pdf-lib y PDF.js | Generación, integración y vista previa de archivos PDF. |
| Correo | Nodemailer y SMTP | Enlaces de recuperación de contraseña. |
| Operación | Docker Compose, Caddy y Amazon Lightsail | Ejecución de la aplicación, proxy HTTPS y alojamiento. |
| Validación | Node.js Test Runner | Pruebas del frontend, backend y reglas de negocio. |

## Cómo funciona el sistema

### Desarrollo local

```text
Navegador: http://localhost:5173
                 |
                 v
Frontend React / Vite
                 |
                 | /api -> proxy de Vite
                 v
Backend Express: http://localhost:3001
                 |
                 v
MySQL: puerto 3306
```

El frontend está en la raíz del repositorio. El backend tiene su propio `package.json` dentro de `backend/`. Por eso se instalan las dependencias de ambas partes por separado.

### Producción

```text
Navegador -> HTTPS / Caddy en Lightsail
                         |
                         v
                 127.0.0.1:8080
                         |
                         v
           Contenedor app / Express:3001
                 |                  |
                 v                  v
        Frontend compilado     API / MySQL del host
```

En producción, Express entrega tanto la API como el contenido de `dist/`. No se mantiene un servidor Vite separado. MySQL y Caddy se ejecutan directamente en la instancia existente de Lightsail; Compose administra el servicio `app` y sus volúmenes.

## Requisitos

| Entorno | Requisito |
| --- | --- |
| Desarrollo | Git, Node.js 24 con npm y acceso a MySQL 8.0 o una instalación compatible con el esquema suministrado. |
| Base de datos | Esquema completo, catálogos y una cuenta de aplicación autorizada. Una base vacía no es suficiente. |
| Cliente | Navegador actualizado con JavaScript y almacenamiento local habilitados. |
| Cámara | Permiso del navegador y acceso por HTTPS o `localhost`. |
| Producción | Docker Engine, Docker Compose v2, MySQL, Caddy y configuración privada del entorno. |
| Respaldos del servidor | Python 3 en Linux, systemd, cliente MySQL y `mysqldump`. |

Para desarrollar y compilar, se sugiere disponer de al menos 4 GB de RAM en el equipo de trabajo. En el servidor, la memoria necesaria depende de los datos y la concurrencia; compilar con alrededor de 1 GB de RAM puede ser lento y requerir intercambio. Estas referencias son orientativas, no límites comprobados mediante pruebas de carga.

Puertos de referencia:

| Puerto | Uso | Exposición habitual |
| --- | --- | --- |
| 5173 | Frontend de desarrollo. | Equipo de desarrollo. |
| 3001 | Backend de desarrollo y servicio dentro del contenedor. | Local o red interna. |
| 3306 | MySQL. | Solo aplicaciones y administradores autorizados. |
| 8080 | Puerto publicado por Compose. | `127.0.0.1` en el servidor. |
| 80 y 443 | HTTP y HTTPS administrados por Caddy. | Acceso web en producción. |
| 22 | SSH. | Administración autorizada del servidor. |

## Instalación local

### 1. Descargar el código

```bash
git clone https://github.com/lisss1-7/Sistema-Veterinario-UNAVET.git
cd Sistema-Veterinario-UNAVET
```

Los comandos siguientes parten de esta carpeta, salvo que se indique otra ubicación.

### 2. Instalar las dependencias

```bash
npm ci
npm ci --prefix backend
```

`npm ci` utiliza las versiones del archivo de bloqueo y es apropiado para reproducir la instalación. Para modificar intencionalmente las dependencias se utiliza `npm install`, conservando actualizado su `package-lock.json`.

### 3. Preparar la base de datos

Solicita al responsable una copia autorizada del esquema y sus catálogos; utiliza datos de prueba para desarrollar. El repositorio no incluye un volcado inicial completo de la base de datos. Los scripts `migrate:*` son actualizaciones específicas y no sustituyen esa importación inicial.

Conéctate desde el cliente MySQL con una cuenta autorizada:

```bash
mysql --host=127.0.0.1 --port=3306 --user=USUARIO_AUTORIZADO --password
```

Dentro de MySQL, selecciona la base de desarrollo e importa el archivo suministrado:

```sql
USE NOMBRE_BASE_DESARROLLO;
SOURCE C:/ruta/autorizada/esquema-y-datos-prueba.sql;
```

Sustituye los nombres y la ruta. En Linux se utiliza una ruta como `/ruta/autorizada/esquema-y-datos-prueba.sql`. Revisa si el archivo ya incluye `CREATE DATABASE` o `USE`: en ese caso, su contenido determina la base de destino. La cuenta que importa el esquema puede necesitar más permisos que la cuenta utilizada por la aplicación.

### 4. Configurar el entorno

Crea `backend/.env` según la sección siguiente. Los valores privados se entregan fuera de GitHub.

### 5. Iniciar UNAVET

```bash
npm run dev
```

Abre **http://localhost:5173**. Este comando inicia el frontend y el backend; mantén abierta la consola mientras trabajas.

Comprueba también **http://localhost:3001/api/health**. La respuesta correcta es:

```json
{"status":"ok"}
```

El endpoint comprueba la conexión a MySQL. No verifica que todas las tablas, catálogos y permisos estén completos: confirma también el inicio de sesión y la consulta de un módulo.

## Configuración del backend

### Archivo `backend/.env`

Esta es una plantilla local. Cambia los campos `REEMPLAZAR_*` antes de iniciar; no son credenciales utilizables.

```dotenv
NODE_ENV=development
PORT=3001
SERVE_FRONTEND=false
TZ=America/Guatemala

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=REEMPLAZAR_USUARIO_APLICACION
DB_PASSWORD=REEMPLAZAR_PASSWORD_MYSQL
DB_NAME=REEMPLAZAR_BASE_DESARROLLO
DB_CONNECTION_LIMIT=10
DB_SSL=false

JWT_SECRET=REEMPLAZAR_SECRETO_JWT
PASSWORD_RESET_SECRET=REEMPLAZAR_SECRETO_RECUPERACION
MEDIA_SIGNING_SECRET=REEMPLAZAR_SECRETO_ARCHIVOS

FRONTEND_URL=http://localhost:5173
```

Genera cada secreto por separado con:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Variable | Explicación |
| --- | --- |
| `NODE_ENV` | `development` para trabajo local; `production` para operación publicada. |
| `PORT` | Puerto de Express. El proxy de Vite espera `3001`. |
| `SERVE_FRONTEND` | Con `false`, Express funciona como API; con `true`, también entrega `dist/`, que debe existir. |
| `DB_HOST`, `DB_PORT` | Dirección y puerto de MySQL. |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Cuenta y esquema de la aplicación. |
| `DB_CONNECTION_LIMIT` | Tamaño máximo del pool; el valor predeterminado es `10`. |
| `DB_SSL` | Activa TLS para MySQL con `true`; usa `false` únicamente cuando corresponda a la conexión configurada. |
| `DB_SSL_CA_PATH` | Ruta opcional del certificado CA cuando la conexión MySQL requiere una CA privada. Exige `DB_SSL=true`. |
| `JWT_SECRET` | Firma los tokens de autenticación. |
| `PASSWORD_RESET_SECRET` | Firma los tokens de recuperación. |
| `MEDIA_SIGNING_SECRET` | Firma el acceso temporal a archivos. |
| `MEDIA_STORAGE_PATH` | Ruta opcional para los archivos multimedia; en producción debe ser persistente. |
| `FRONTEND_URL` | Dirección pública de la interfaz, utilizada también en los enlaces de recuperación. |
| `CORS_ORIGINS` | Lista opcional de orígenes adicionales separados por comas. |
| `TZ` | Zona horaria del proceso. No cambia por sí sola la zona horaria de MySQL. |

En producción se validan variables adicionales: contraseña de MySQL, secretos de recuperación y archivos, ruta multimedia y configuración SMTP. `JWT_SECRET` debe tener al menos 32 caracteres; los otros dos secretos también deben alcanzar esa longitud y ser diferentes de `JWT_SECRET`. Utiliza tres valores independientes.

### Recuperación de contraseña y correo

Para enviar correos, agrega los datos del proveedor a `backend/.env`:

```dotenv
SMTP_HOST=REEMPLAZAR_SERVIDOR_SMTP
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=REEMPLAZAR_USUARIO_SMTP
SMTP_PASS=REEMPLAZAR_PASSWORD_SMTP
SMTP_FROM="UNAVET <REEMPLAZAR_REMITENTE>"
```

El puerto `587` normalmente utiliza STARTTLS con `SMTP_SECURE=false`; el puerto `465` utiliza `SMTP_SECURE=true`. La configuración concreta depende del proveedor.

Para comprobar la conexión SMTP desde la raíz:

```bash
npm run verify:email --prefix backend
```

El inicio de sesión local puede funcionar sin SMTP; la recuperación de contraseña necesita un servicio de correo configurado. `test:email` es una prueba diferente que envía un mensaje y requiere revisar previamente su configuración y destinatario.

### Reportes IA

El backend contempla integración con OpenAI, OpenRouter y Groq. Sus opciones se implementan en [aiReportsController.js](backend/src/controllers/aiReportsController.js). Configura únicamente las variables del proveedor utilizado, como `AI_PROVIDER` y su clave correspondiente (`OPENAI_API_KEY`, `OPENROUTER_API_KEY` o `GROQ_API_KEY`).

Las claves pertenecen al backend. Nunca se colocan en una variable `VITE_*`, porque esas variables se incorporan al código que recibe el navegador.

## Configuración del frontend

### URL de la API

La configuración se encuentra en [src/app/config/api.ts](src/app/config/api.ts). Si no se define ninguna variable, utiliza `/api`.

Para hacer explícita la configuración local, puedes crear `.env.local` en la raíz:

```dotenv
VITE_API_URL=/api
VITE_DELIVERY_MODE=full
```

Durante el desarrollo, [vite.config.ts](vite.config.ts) redirige `/api` hacia `http://localhost:3001`. Esta configuración permite trabajar con una sola dirección en el navegador.

Si el backend cambia de puerto, actualiza también el destino del proxy de Vite. Si necesitas una API en otro dominio, configura su URL completa en `VITE_API_URL` y autoriza el origen del frontend en el backend cuando corresponda.

### Alcance de los módulos

`VITE_DELIVERY_MODE=full` habilita el alcance completo del frontend. El modo `first-delivery` limita el contenido a dashboard, pacientes y usuarios, conforme a [deliveryScope.ts](src/app/config/deliveryScope.ts).

Este modo controla qué pantallas se habilitan; los permisos de cada cuenta se siguen verificando en el sistema y en las rutas protegidas de la API.

Las variables de Vite se leen al iniciar el servidor de desarrollo o al compilar. Después de modificarlas, reinicia Vite; para producción, vuelve a compilar.

## Iniciar, detener y comprobar los servicios

### Ambos servicios desde una consola

Desde la raíz:

```bash
npm run dev
```

Detén ambos procesos con `Ctrl+C` en esa misma consola.

### Frontend y backend por separado

Esta opción permite detener uno sin detener el otro.

**Consola 1: backend**

```bash
cd backend
npm run dev
```

**Consola 2: frontend, desde la raíz del proyecto**

```bash
npm run dev:frontend
```

| Comprobación | Resultado esperado |
| --- | --- |
| Abrir `http://localhost:5173` | Se muestra la interfaz. |
| Abrir `http://localhost:3001/` en desarrollo con `SERVE_FRONTEND=false` | Mensaje de backend funcionando. |
| Abrir `http://localhost:3001/api/health` | HTTP 200 y `{"status":"ok"}` si MySQL responde. |
| Detener solo el backend con `Ctrl+C` | Vite continúa abierto; las solicitudes de datos fallan mientras la API está detenida. |
| Ejecutar de nuevo `npm run dev` dentro de `backend/` | La API vuelve a iniciarse. Recarga el módulo si es necesario. |

La pantalla puede conservar información ya cargada mientras la API está detenida. Que el HTML siga visible no significa que el backend continúe disponible.

## Carpetas del proyecto

```text
Sistema-Veterinario-UNAVET/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.ts
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── inventory/
│   │   ├── config/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── utils/
│   └── styles/
├── public/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   └── utils/
│   ├── tests/
│   ├── storage/media/       # Generada durante el uso
│   ├── backups/             # Generada por los respaldos locales
│   └── package.json
├── deploy/
│   ├── backups/
│   └── cloud.env.example
├── Dockerfile
├── compose.yaml
├── vite.config.ts
├── package.json
└── README.md
```

### Frontend

| Ruta | Responsabilidad |
| --- | --- |
| `src/main.tsx` | Punto de entrada que monta React. |
| `src/app/App.tsx` | Composición principal de la aplicación. |
| `src/app/routes.ts` | Rutas, pantallas cargadas por módulo y envoltorios de acceso. |
| `src/app/pages/` | Pantallas principales: pacientes, expediente, citas, grooming, inventario, recetas, usuarios y reportes. |
| `src/app/components/` | Componentes compartidos: layout, menú lateral, formularios, selectores, cámara y visor PDF. |
| `src/app/components/inventory/` | Interfaces para movimientos, compras y proveedores del inventario. |
| `src/app/config/` | URL de la API y configuración del alcance de módulos. |
| `src/app/context/` | Estado compartido, incluida la autenticación. |
| `src/app/hooks/` | Lógica reutilizable, como la consulta de permisos por módulo. |
| `src/app/utils/` | Acceso a API, tipos, validaciones, datos compartidos y herramientas para documentos. También contiene pruebas `*.test.js`. |
| `src/app/assets/` | Imágenes y otros recursos importados desde los componentes. |
| `src/styles/` | Estilos globales, temas y reglas de presentación. |
| `public/` | Recursos estáticos que Vite copia sin tratarlos como módulos de código. |

### Backend y operación

| Ruta | Responsabilidad |
| --- | --- |
| `backend/src/server.js` | Crea Express, valida el entorno, registra middleware y monta las rutas de la API. |
| `backend/src/config/` | Conexión MySQL y validación de las variables del entorno. |
| `backend/src/routes/` | Define endpoints, métodos HTTP y requisitos de autenticación y permisos. |
| `backend/src/controllers/` | Implementa las operaciones de cada módulo y sus consultas de datos. |
| `backend/src/middleware/` | Autenticación, permisos, validación de solicitudes, límites de intentos y entrega del frontend. |
| `backend/src/utils/` | Funciones compartidas: correo, archivos, personas, veterinarios, reportes y cierres de turno. |
| `backend/src/scripts/` | Herramientas administrativas, migraciones, verificaciones y respaldo manual. |
| `backend/tests/` | Pruebas del backend, permisos y reglas de negocio. |
| `backend/storage/media/` | Archivos multimedia persistentes. No se versionan. |
| `backend/backups/` | Salida del respaldo manual del backend. No se versiona. |
| `deploy/backups/` | Script Linux y unidades systemd para respaldos automáticos del servidor. |
| `deploy/cloud.env.example` | Plantilla de configuración de producción sin credenciales reales. |
| `Dockerfile` | Construcción por etapas del frontend y del contenedor de ejecución. |
| `compose.yaml` | Servicio de la aplicación, puertos, entorno y volúmenes persistentes. |

### Carpetas locales y generadas

`node_modules/` y `backend/node_modules/` contienen dependencias instaladas. `dist/` es el resultado de la compilación. `.git/` contiene el historial del repositorio. `tmp/` y las carpetas auxiliares de generación de documentos se usan para trabajo temporal y no forman parte del código necesario para ejecutar UNAVET.

## Comandos disponibles

### Desde la raíz

| Comando | Uso |
| --- | --- |
| `npm ci` | Instalar las dependencias del frontend desde el archivo de bloqueo. |
| `npm run dev` | Iniciar frontend y backend con procesos concurrentes. |
| `npm run dev:frontend` | Iniciar únicamente Vite. |
| `npm run dev:backend` | Iniciar únicamente el backend desde la raíz. |
| `npm run dev:full` | Iniciar ambos servicios usando el modo Vite `full`. |
| `npm run dev:first-delivery` | Iniciar ambos servicios usando el modo Vite `first-delivery`. |
| `npm run build` | Compilar el frontend en `dist/`. |
| `npm run build:full` | Compilar usando el modo Vite `full`. |
| `npm run build:first-delivery` | Compilar usando el modo Vite `first-delivery`. |
| `npm run preview` | Revisar localmente `dist/`; la API sigue necesitando un backend disponible. |
| `npm test` | Ejecutar las pruebas de utilidades del frontend y, si pasan, las del backend. |
| `npm run audit:security` | Consultar las auditorías de dependencias del frontend y backend. |

Los comandos con `--mode` permiten cargar archivos `.env.full` o `.env.first-delivery`. Si necesitas esos modos, crea los archivos localmente con el valor de `VITE_DELIVERY_MODE` correspondiente: sus nombres no asignan por sí solos la variable.

### Desde `backend/`

| Comando | Uso |
| --- | --- |
| `npm ci` | Instalar las dependencias del backend. |
| `npm run dev` | Iniciar Express con reinicio mediante nodemon. |
| `npm start` | Iniciar Express sin vigilancia de archivos. |
| `npm test` | Ejecutar las pruebas del backend. |
| `npm run test:reports` | Probar los reportes. |
| `npm run test:users` | Probar la gestión de usuarios. |
| `npm run test:attribution` | Probar la atribución de registros. |
| `npm run verify:email` | Comprobar la configuración SMTP. |
| `npm run backup:database` | Crear el respaldo manual JSON y copiar los archivos multimedia disponibles. |

Los comandos de migración se describen en [Base de datos y migraciones](#base-de-datos-y-migraciones). El inventario local tiene una prueba de integración `test:inventory-local`: escribe datos de prueba y se debe ejecutar únicamente contra una base local destinada a esa prueba.

## API y autenticación

La API utiliza el prefijo `/api`. La mayoría de operaciones de negocio requiere un token JWT y permisos del módulo correspondiente.

| Grupo de rutas | Responsabilidad |
| --- | --- |
| `/api/auth` | Inicio de sesión y recuperación de contraseña. |
| `/api/pacientes`, `/api/tutores` | Mascotas y responsables. |
| `/api/historial-clinico` | Consultas e información del historial. |
| `/api/vacunaciones`, `/api/tratamientos` | Vacunas, tratamientos y servicios. |
| `/api/citas`, `/api/grooming` | Agenda clínica y servicios de grooming. |
| `/api/inventario` | Productos y operaciones de inventario. |
| `/api/cierre-ventas` | Ventas y cierres de turno y día. |
| `/api/recetas` | Prescripciones y medicamentos. |
| `/api/usuarios`, `/api/perfil` | Administración de cuentas y perfil. |
| `/api/catalogos` | Datos que alimentan los formularios y la configuración de módulos. |
| `/api/dashboard`, `/api/ai-reports` | Resúmenes y reportes. |
| `/api/media` | Archivos y recursos multimedia bajo las reglas de acceso del sistema. |

El inicio de sesión se solicita mediante `POST /api/auth/login` con los campos `correo` y `password`. Las solicitudes autenticadas envían el token en la cabecera:

```http
Authorization: Bearer TOKEN_DE_LA_SESION
```

No hay una contraseña de acceso pública en este README. Solicita una cuenta autorizada al administrador. El script `seed:users` actualiza contraseñas de cuentas que ya existen mediante variables `SEED_*`; no crea el esquema ni una cuenta nueva.

El inicio de sesión permite 10 solicitudes dentro de una ventana de 15 minutos por combinación de IP y correo. Al superar el límite, responde HTTP 429 y señala la espera restante mediante `Retry-After`. Los endpoints de recuperación tienen límites propios.

### Comprobaciones públicas

```bash
curl http://localhost:3001/api/health
```

En Windows PowerShell se puede utilizar `curl.exe` para invocar el cliente cURL en lugar del alias de PowerShell.

`GET /api/test-db` está disponible únicamente fuera de producción y sirve como comprobación adicional del esquema seleccionado. Los métodos y validaciones concretos de cada módulo están en [backend/src/routes](backend/src/routes).

## Base de datos y migraciones

La aplicación utiliza un pool de conexiones configurado en [db.js](backend/src/config/db.js) y [dbOptions.js](backend/src/config/dbOptions.js). Los formularios consultan catálogos y relaciones de MySQL; sus opciones no se reemplazan por listas fijas del frontend.

Para una instalación nueva, importa primero el esquema autorizado. Para actualizar una instalación existente, revisa qué cambio necesita su esquema y ejecuta solo la migración correspondiente, después de disponer de un respaldo.

Ejemplos desde `backend/`:

| Comando | Cambio específico |
| --- | --- |
| `npm run migrate:prescription-reason` | Incorporar el motivo de consulta en recetas. |
| `npm run migrate:sales-day-closing` | Incorporar el cierre diario de ventas. |
| `npm run migrate:sales-shifts` | Incorporar el almacenamiento de cierres de turno. |
| `npm run migrate:inventory-audit` | Incorporar la auditoría de inventario. |
| `npm run migrate:inventory-operations` | Incorporar las estructuras de operaciones de inventario. |
| `npm run migrate:admin-veterinarians` | Sincronizar la vinculación clínica de administradores que corresponda. |
| `npm run verify:normalization` | Ejecutar las verificaciones implementadas de normalización. |

La lista completa está en [backend/package.json](backend/package.json). Los scripts tienen alcances diferentes y algunos modifican datos o estructuras; no deben ejecutarse todos como una secuencia automática de instalación. Lee el script antes de utilizarlo y verifica la base configurada en `backend/.env`.

Para las fechas de acceso, MySQL determina el instante y la API lo devuelve en formato ISO. La zona `TZ` del proceso y la zona de MySQL son configuraciones independientes: cambiar una no convierte los registros históricos de la otra.

## Producción en Amazon Lightsail

Esta sección corresponde a la instancia existente de UNAVET. La configuración del proyecto no requiere crear EC2, RDS ni una segunda instancia.

### Archivos de configuración

- `Dockerfile`: compila React y prepara el runtime de Node.js.
- `compose.yaml`: define el servicio `app`, los puertos y los volúmenes.
- `deploy/.env.cloud`: contiene la configuración privada utilizada por Compose.
- `deploy/cloud.env.example`: sirve como referencia de las variables requeridas; se completa según el entorno real.

En la instalación existente, el proyecto se ubica en `/home/ubuntu/unavet/app`. Las credenciales SSH y los archivos de entorno se entregan por un canal privado.

MySQL está instalado en el host. El contenedor utiliza `host.docker.internal` para acceder a él; esa resolución debe estar configurada en el entorno Docker de la instancia. Comprueba dicha resolución y las autorizaciones MySQL antes de reproducir la configuración en otro entorno. El Compose del repositorio no crea un servicio MySQL.

Si un entorno Docker en Linux no resuelve ese nombre, se puede definir un archivo `compose.override.yaml` junto a `compose.yaml`:

```yaml
services:
  app:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Este ajuste resuelve el nombre hacia el host; MySQL debe aceptar la conexión desde la red del contenedor y autorizar a su usuario. No es necesario publicar MySQL en Internet para que la aplicación se conecte.

La plantilla de nube establece `DB_SSL=true`; debe ajustarse a la configuración TLS real de MySQL. No se debe copiar sin completar los campos ni asumir que los valores predeterminados coinciden con el servidor.

### Consultar estado y registros

Dentro del servidor:

```bash
cd /home/ubuntu/unavet/app
sudo systemctl is-active mysql caddy docker
sudo docker compose ps
sudo docker compose logs --tail=100 app
curl --fail http://127.0.0.1:8080/api/health
curl --fail https://unavet.duckdns.org/api/health
```

### Actualizar la aplicación

Primero verifica el estado del repositorio y conserva la configuración privada y los respaldos. Incorpora el código aprobado a la carpeta del servidor sin sobrescribir sus cambios locales inadvertidamente. Después:

```bash
sudo docker compose config --quiet
sudo docker compose build app
sudo docker compose up -d --no-deps app
sudo docker compose ps
```

Vuelve a comprobar `/api/health` cuando termine el arranque y revisa el módulo modificado. La configuración permite comprobar la salud del contenedor; el servicio puede necesitar unos segundos tras su recreación.

Los archivos multimedia y los respaldos del contenedor se conservan en los volúmenes `unavet-media` y `unavet-backups`. Una actualización normal no requiere eliminarlos ni modificar la base de datos.

### Detener y arrancar la aplicación

```bash
sudo docker compose stop app
sudo docker compose start app
```

En este despliegue, ambos comandos afectan al frontend publicado y al backend, ya que los sirve el mismo contenedor. MySQL y Caddy tienen servicios separados en el host. Para detener solo el backend y mantener Vite abierto, utiliza el entorno local con dos consolas.

Subir un commit a GitHub no publica automáticamente la aplicación en Lightsail: la actualización del código y la activación del contenedor son pasos distintos.

## Respaldos

### Respaldo manual del backend

Desde la raíz:

```bash
npm run backup:database --prefix backend
```

El script genera un archivo JSON con definiciones de tablas y filas en `backend/backups/`, y copia los archivos multimedia si están disponibles. Este formato no es un archivo SQL para importar con `SOURCE`. Requiere un procedimiento de restauración acorde al formato JSON; tampoco garantiza por sí solo una instantánea transaccional de todas las tablas durante escrituras concurrentes.

### Respaldo automático en Lightsail

Los archivos de [deploy/backups](deploy/backups) implementan el respaldo del servidor:

| Archivo | Función |
| --- | --- |
| `unavet-backup.py` | Crear y verificar el archivo de respaldo y rotar las copias. |
| `unavet-backup.service` | Ejecutar el script con permisos y prioridades definidos. |
| `unavet-backup.timer` | Programar lunes y jueves a las 02:00, zona `America/Guatemala`. |

El script conserva **7 copias completadas**, no siete días. Con dos ejecuciones semanales, la retención abarca aproximadamente tres semanas y media si no hay ejecuciones adicionales. Guarda los archivos en `/var/backups/unavet`.

El archivo incluye SQL obtenido con `mysqldump --single-transaction`, código y configuración del proyecto, archivos multimedia y configuración del host seleccionada. Verifica la integridad de lectura y genera una suma SHA-256. La copia de multimedia ocurre sobre el sistema de archivos en uso; no es una instantánea atómica coordinada con MySQL.

El script está diseñado para el servidor Linux existente: utiliza autenticación MySQL de `root` mediante socket, comprueba tablas InnoDB y espera las rutas de proyecto y configuración definidas en el archivo. Almacena los respaldos en la propia instancia; no implementa una copia externa en S3 u otro destino.

Para revisar la programación y sus últimas ejecuciones:

```bash
sudo systemctl status unavet-backup.timer
sudo systemctl list-timers --all unavet-backup.timer
sudo journalctl -u unavet-backup.service --since "7 days ago"
sudo cat /var/backups/unavet/last-success.json
```

En un entorno donde aún no estén instaladas las unidades, un administrador puede instalarlas después de comprobar las rutas, requisitos y permisos:

```bash
sudo install -d -m 700 /var/backups/unavet
sudo install -m 700 deploy/backups/unavet-backup.py /usr/local/sbin/unavet-backup.py
sudo install -m 644 deploy/backups/unavet-backup.service /etc/systemd/system/unavet-backup.service
sudo install -m 644 deploy/backups/unavet-backup.timer /etc/systemd/system/unavet-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now unavet-backup.timer
```

Los respaldos pueden contener datos clínicos y credenciales de configuración. Deben permanecer privados. Una verificación de integridad confirma que el archivo es legible; la capacidad de recuperación se comprueba mediante una restauración controlada en un entorno separado.

## Solución de problemas

| Síntoma | Qué revisar |
| --- | --- |
| La interfaz abre, pero no aparecen datos. | Backend activo, respuesta de `/api/health`, URL de API y solicitudes en la pestaña Red del navegador. |
| `ECONNREFUSED` al consultar `/api`. | Puerto 3001, proceso de Express y destino del proxy de Vite. |
| HTTP 503 en `/api/health`. | MySQL disponible y variables `DB_*` correctas. |
| `Access denied` en MySQL. | Usuario, contraseña y permisos desde el host del que se conecta el backend. |
| Error indicando una tabla o columna inexistente. | Esquema importado y migración específica pendiente; no ejecutar todas las migraciones indiscriminadamente. |
| Puerto ocupado al iniciar. | Otro proceso utiliza 5173 o 3001. Comprueba el puerto que Vite anuncia y, si cambia, ajusta `FRONTEND_URL`. |
| Faltan módulos aunque la cuenta tenga permisos. | `VITE_DELIVERY_MODE`, configuración de módulos y permisos de la cuenta. |
| El correo de recuperación no llega. | SMTP, remitente, carpeta de correo no deseado y resultado de `verify:email`. |
| Aparece «Demasiados intentos». | HTTP 429; espera el tiempo de `Retry-After`. La ventana de inicio de sesión es de 15 minutos. |
| La cámara no abre. | HTTPS o localhost, permiso del navegador y disponibilidad de la cámara. |
| El backend exige compilar el frontend. | `SERVE_FRONTEND=true` necesita `dist/`; en desarrollo con Vite utiliza `false`. |
| El contenedor no alcanza MySQL del host. | Resolución de `host.docker.internal`, escucha de MySQL y autorizaciones de red y usuario. |
| Una variable nueva no surte efecto. | Reinicia el proceso correspondiente; las variables `VITE_*` de producción requieren otra compilación. |
| Se sigue mostrando un PDF descargado anteriormente. | Genera una vista previa o descarga nueva. Los archivos ya guardados en el dispositivo no se actualizan. |

Para un diagnóstico útil, registra el módulo, la acción realizada, la respuesta HTTP y el mensaje visible. Evita incluir contraseñas, tokens o información clínica privada en incidencias públicas.

## Flujo de cambios en GitHub

Los cambios del proyecto se validan y se publican en el repositorio al terminar cada tarea. Antes de incorporar cambios remotos, revisa el estado local:

```bash
git status
git fetch origin
```

Cuando la rama esté preparada, valida el cambio con las pruebas pertinentes y la compilación si modifica el frontend:

```bash
npm test
npm run build
```

Selecciona únicamente los archivos de la tarea, revisa lo preparado y crea el commit:

```bash
git add RUTA_DEL_ARCHIVO_MODIFICADO
git diff --cached
git commit -m "Describir el cambio realizado"
git push origin main
```

La rama de trabajo actual es `main`. Si se utiliza otra rama, sustituye su nombre en el comando. Si GitHub tiene cambios nuevos, intégralos conservando el trabajo de ambas partes antes de volver a subir; no reemplaces el historial remoto para resolver la diferencia.

Los archivos `.env`, claves SSH, tokens, respaldos, datos clínicos, `node_modules/`, `dist/` y documentos temporales no deben incorporarse a los commits. El archivo [AGENTS.md](AGENTS.md) contiene las convenciones de trabajo del proyecto.
