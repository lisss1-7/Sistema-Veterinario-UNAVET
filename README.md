# Sistema UNAVET

Sistema web para la gestión integral de una clínica veterinaria. El proyecto cuenta con frontend en React, backend en Node.js/Express y base de datos MySQL.

## Estado actual del proyecto

El sistema ya cuenta con conexión a MySQL para los módulos principales:

- Login y autenticación con JWT
- Dashboard
- Pacientes
- Detalle del paciente
- Historial clínico
- Vacunación
- Tratamientos y servicios
- Citas clínicas
- Grooming
- Inventario
- Recetas médicas
- Gestión de usuarios
- Perfil de usuario

Pendiente para una siguiente fase:

- Configuración final para despliegue en la nube
- Ajuste de URL del backend para producción
- Seguridad avanzada para producción

Implementado en esta versión:

- Chat de reportes IA conectado a datos reales del sistema
- Endpoint backend `POST /api/ai-reports/chat` protegido con JWT
- Soporte para IA local gratis con Ollama y fallback local automático

## Tecnologías utilizadas

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React
- jsPDF

### Backend

- Node.js
- Express
- MySQL2
- JSON Web Token
- bcryptjs
- dotenv
- CORS

### Base de datos

- MySQL
- MySQL Workbench

## Estructura general del proyecto

```txt
UNAVET-PROTOTIPO
├── backend
│   ├── src
│   │   ├── config
│   │   │   └── db.js
│   │   ├── controllers
│   │   ├── middleware
│   │   │   └── authMiddleware.js
│   │   ├── routes
│   │   ├── scripts
│   │   │   └── seedUsers.js
│   │   └── server.js
│   ├── .env
│   ├── package.json
│   └── package-lock.json
│
├── src
│   ├── app
│   │   ├── assets
│   │   ├── components
│   │   ├── context
│   │   ├── pages
│   │   ├── utils
│   │   ├── App.tsx
│   │   └── routes.ts
│   ├── styles
│   └── main.tsx
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
└── README.md
```

## Instalación local

### 1. Clonar o copiar el proyecto

Ubicar el proyecto en una carpeta local, por ejemplo:

```bash
C:\Users\mayra\Downloads\UNAVET-PROTOTIPO
```

### 2. Instalar dependencias del frontend

Desde la raíz del proyecto:

```bash
npm install
```

### 3. Instalar dependencias del backend

Entrar a la carpeta del backend:

```bash
cd backend
npm install
```

## Configuración de base de datos

### 1. Crear la base de datos

En MySQL Workbench debe existir la base de datos:

```sql
CREATE DATABASE IF NOT EXISTS unavet_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

### 2. Configurar el archivo `.env` del backend

Crear o revisar el archivo:

```txt
backend/.env
```

Ejemplo:

```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=unavet_db
JWT_SECRET=cambia-este-valor-por-un-secreto-seguro
```

Si tu usuario de MySQL tiene contraseña, colocarla en `DB_PASSWORD`.

### Recuperación de contraseña por correo

El backend envía los enlaces mediante una sola cuenta transaccional de UNAVET.
Los usuarios únicamente escriben su correo registrado; nunca configuran ni
conocen las credenciales del remitente.

En producción, estas variables se guardan una sola vez como secretos del
servicio donde esté alojado el backend:

```env
PASSWORD_RESET_SECRET=un-secreto-largo-y-diferente-al-jwt
FRONTEND_URL=https://app.tu-dominio.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=login-smtp-asignado-por-el-proveedor
SMTP_PASS=clave-smtp-asignada-por-el-proveedor
SMTP_FROM=UNAVET <no-reply@tu-dominio.com>
```

El ejemplo usa Brevo como relay de correo transaccional, aunque el código admite
cualquier proveedor SMTP. Se recomienda verificar un dominio propio para usar
un remitente institucional y mejorar la entrega de los mensajes.

Después de guardar los datos se puede comprobar la conexión desde `backend`:

```bash
npm run verify:email
```

## Levantar el sistema en local

### Backend

Desde la carpeta `backend`:

```bash
npm run dev
```

El backend debe mostrar un mensaje similar a:

```txt
Servidor UNAVET corriendo en puerto 3001
```

### Frontend

Desde la raíz del proyecto:

```bash
npm run dev
```

El frontend normalmente se abre en:

```txt
http://localhost:5173
```

## Reportes IA (nube sin descargar nada)

El módulo de reportes IA funciona con datos reales de la base de datos y ahora permite proveedores en la nube sin instalar modelos locales.

### 1. Configurar variables en `backend/.env`

#### Opción A: ChatGPT API oficial (OpenAI)

```env
AI_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
OPENAI_MODEL=gpt-4o-mini
```

Nota: la API oficial de OpenAI es de pago por uso.

#### Opción B: OpenRouter (modelos free disponibles)

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=tu_api_key
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

#### Opción C: Groq (sin descarga local, con plan gratuito)

```env
AI_PROVIDER=groq
GROQ_API_KEY=tu_api_key
GROQ_MODEL=llama-3.1-8b-instant
```

#### Opción D: Auto (recomendado)

```env
AI_PROVIDER=auto
```

En modo `auto`, el backend intenta en este orden: OpenAI, OpenRouter, Groq y luego Ollama.

### 2. Reiniciar backend

```bash
cd backend
npm run dev
```

Si el proveedor IA falla, el sistema genera automáticamente un reporte local de respaldo para no bloquear el chat.

## Usuarios iniciales

El proyecto no contiene correos ni contraseñas iniciales quemadas. Si se necesita
restablecer la contraseña de un usuario que ya existe en la base de datos, se
configuran temporalmente las variables correspondientes en `backend/.env`:

```env
SEED_ADMIN_EMAIL=correo-del-administrador
SEED_ADMIN_PASSWORD=contraseña-temporal-segura
```

Luego se ejecuta `npm run seed:users` dentro de `backend` y se retiran esas
variables del archivo.

## Normalización y datos configurables

Las opciones operativas del sistema se obtienen de MySQL: servicios, formas de
pago, horarios, capacidad de transporte, roles, permisos, estados, tipos de
grooming, vacunas, tratamientos, modos de entrega y los demás catálogos. Los
arreglos que permanecen en React corresponden únicamente a presentación, como
iconos, pestañas y colores.

Para aplicar la migración idempotente:

```bash
cd backend
npm run migrate:normalize
npm run migrate:person-names
```

Antes de modificar la estructura se genera automáticamente un respaldo JSON en
`backend/backups`. Para comprobar que no quedaron registros operativos sin sus
llaves de catálogo:

```bash
npm run verify:normalization
```

La migración deja 48 tablas con relaciones funcionales; el objetivo de las
tablas nuevas es eliminar datos operativos quemados y dependencias de texto, no
inflar artificialmente el modelo.

Los nombres de las entidades que representan personas (`tutores` y `usuarios`)
se almacenan en `primer_nombre`, `segundo_nombre`, `primer_apellido` y
`segundo_apellido`. El primer nombre y el primer apellido son obligatorios para
los registros nuevos; los segundos son opcionales. El nombre completo que
muestra la interfaz se calcula al consultar y no se guarda como un dato
duplicado. Las citas conservan el nombre consignado al programarlas como una
instantánea histórica.

## Rutas principales del backend

```txt
/api/auth
/api/dashboard
/api/pacientes
/api/historial-clinico
/api/vacunaciones
/api/tratamientos
/api/citas
/api/grooming
/api/inventario
/api/recetas
/api/usuarios
/api/perfil
```

## Módulos del sistema

### Dashboard

Muestra datos generales del sistema, como pacientes registrados, citas del día, grooming del día, productos en inventario, bajo stock y recetas generadas.

### Pacientes

Permite registrar mascotas, los nombres y apellidos separados del tutor,
especie, raza, sexo, edad, alimentación, color, estado reproductivo, fotografía
y observaciones.

### Detalle del paciente

Permite visualizar el expediente del paciente y administrar historial clínico, vacunación, tratamientos y servicios.

### Historial clínico

Permite registrar consultas, motivo, diagnóstico, tratamiento, examen físico y observaciones.

### Vacunación

Permite registrar vacunas aplicadas, próximas dosis, médico veterinario, dosis e intervalos.

### Tratamientos y servicios

Permite registrar tratamientos médicos y servicios de laboratorio, incluyendo fotografía adjunta cuando corresponda.

### Citas clínicas

Permite crear, editar, eliminar y cambiar estado de citas clínicas. Cuando una cita se vincula a un paciente, también se sincroniza con el historial clínico.

### Grooming

Permite administrar citas de grooming en clínica o con transporte, costos, horarios y estados.

### Inventario

Permite gestionar productos, categorías, proveedores, stock actual, stock mínimo, vencimiento, precio y movimientos de inventario.

### Recetas médicas

Permite generar recetas médicas, descargar PDF y descontar inventario automáticamente cuando un medicamento es entregado en clínica.

### Usuarios

Permite crear, editar, activar/inactivar y eliminar usuarios del sistema.

### Perfil

Permite que el usuario logueado visualice y edite su información personal y cambie su contraseña.

## Consideraciones para la nube

Actualmente el frontend usa rutas locales hacia el backend:

```ts
const API_URL = 'http://localhost:3001/api';
```

Antes de subir el sistema a la nube, se recomienda cambiar esto por una variable de entorno:

```ts
const API_URL = import.meta.env.VITE_API_URL;
```

Y crear un archivo `.env` para el frontend:

```env
VITE_API_URL=https://tu-backend-en-la-nube.com/api
```

También se debe configurar una base de datos MySQL en la nube y actualizar el `.env` del backend con los datos reales del servidor.

## Carpetas que no deben subirse en una entrega de código fuente

No se recomienda incluir:

```txt
node_modules
backend/node_modules
dist
```

Estas carpetas se pueden regenerar con los comandos correspondientes.

## Notas de seguridad para producción

Antes de usar el sistema en producción se recomienda:

- Usar un `JWT_SECRET` fuerte y privado.
- No subir archivos `.env` a repositorios públicos.
- Configurar CORS solo para el dominio oficial del frontend.
- Usar HTTPS.
- Usar una base de datos en la nube con contraseña segura.
- Crear respaldos automáticos de la base de datos.
- Revisar permisos por rol antes de liberar el sistema.
