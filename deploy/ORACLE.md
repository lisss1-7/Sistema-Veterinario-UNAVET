# Subir UNAVET a Oracle Cloud

Esta guia usa el Dockerfile y compose.yaml existentes: React y Node.js juntos,
MySQL HeatWave Always Free separado y archivos en el volumen persistente de la
aplicacion. No se suben los respaldos historicos ni backend/.env. El servidor
funciona de forma independiente de tu computadora.

Estado: preparacion local. Aun se necesita crear la cuenta, obtener capacidad
gratuita, configurar MySQL y correo, importar datos y probar el despliegue real.

## 1. Crear la cuenta y el servidor

Comienza en https://signup.cloud.oracle.com/. La region principal no se puede
cambiar despues del registro; los recursos gratuitos deben crearse alli.
Comprueba las opciones de region y la disponibilidad de MySQL antes de elegir.

En Compute > Instances > Create instance, usa:

- Nombre: unavet.
- Imagen: Ubuntu 24.04 compatible con Arm y elegible para Always Free.
- Shape: VM.Standard.A1.Flex, 2 OCPU y 12 GB de RAM como maximo total para la
  cuenta gratuita, segun la documentacion consultada el 4 de octubre de 2026.
- Disco de arranque: 50 GB; cuenta dentro de los 200 GB gratuitos de discos.
- Una red virtual (VCN), subred publica, Internet Gateway y una IPv4 publica.
- Guarda la clave SSH privada en tu computadora y la IP del servidor.

En las reglas de la red permite TCP 22 desde tu IP publica y TCP 80 y 443 para
acceso web. El firewall de Ubuntu tambien debe permitir esos puertos; conserva
el acceso SSH al modificarlo. MySQL y el puerto 8080 de la app no necesitan
exponerse a Internet. Si no hay capacidad A1, prueba otro dominio de
disponibilidad dentro de la misma region o espera; una shape alternativa puede
consumir los creditos temporales y dejar de ser gratuita al terminar la prueba.

Referencia: [recursos gratuitos de Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## 2. Crear MySQL

En MySQL HeatWave > DB Systems > Create DB system, activa Always Free y usa la
shape MySQL.Free. Selecciona la misma VCN, preferentemente una subred privada.
Permite TCP 3306 hacia MySQL solamente desde la IP privada del servidor de la
aplicacion. Comprueba tambien la regla de salida de la VM.

Anota el endpoint privado, puerto y usuario administrador; guarda su password
fuera del chat. La base gratuita tiene 50 GiB y usa la ultima version disponible:
la compatibilidad con tu MySQL 8.0.45 debe comprobarse durante la importacion.
Las 61 tablas locales usan InnoDB, pero eso no garantiza toda la compatibilidad.

Configura una conexion TLS que verifique el certificado y su hostname. La app
ya admite DB_SSL y DB_SSL_CA_PATH. Si la CA no pertenece al almacen de confianza
de Node.js, se necesita su certificado PEM y montarlo dentro del contenedor.
Confirma esta conexion antes de publicar la aplicacion.

Referencias: [crear MySQL gratuito](https://docs.oracle.com/en-us/iaas/mysql-database/doc/creating-always-free-db-system.html),
[certificado de MySQL](https://docs.oracle.com/en-us/iaas/mysql-database/doc/updating-security-certificate.html).

## 3. Tener una direccion web sin comprar dominio

En [DuckDNS](https://www.duckdns.org/), registra un subdominio disponible y
asocialo a la IPv4 publica del servidor. Ejemplo ilustrativo:
unavet-ejemplo.duckdns.org. Usa el nombre que realmente hayas registrado.
Si la IP cambia, actualiza el registro. El token de DuckDNS es privado.

## 4. Conectar y transferir el proyecto

Desde PowerShell, cambia las rutas e IP de ejemplo por las reales:

```powershell
ssh -i "C:\ruta\oracle.key" ubuntu@IP_PUBLICA
```

En el servidor, prepara la carpeta y cierra esa sesion:

```bash
mkdir -p ~/unavet
exit
```

En PowerShell, desde la raiz del proyecto, empaqueta solamente el codigo:

```powershell
tar -czf "$env:TEMP\unavet-codigo.tar.gz" Dockerfile compose.yaml .dockerignore package.json package-lock.json index.html vite.config.ts src public backend/package.json backend/package-lock.json backend/src deploy
scp -i "C:\ruta\oracle.key" "$env:TEMP\unavet-codigo.tar.gz" ubuntu@IP_PUBLICA:~/unavet/
```

Este comando supone que deploy contiene solo las plantillas y esta guia. No
incluyas alli un archivo .env.cloud con secretos ni exportaciones de datos al
empaquetar el codigo. Luego conecta otra vez y extrae:

```bash
cd ~/unavet
tar -xzf unavet-codigo.tar.gz
```

Instala [Docker Engine y Compose para Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
con el repositorio oficial. La VM Ampere usa arquitectura Arm64. Comprueba:

```bash
sudo docker compose version
```

## 5. Migrar la base y los archivos originales

Deten las nuevas capturas en el sistema local durante la exportacion final para
que la base y los archivos correspondan al mismo momento. Conserva una copia
previa a la migracion.

En MySQL Workbench local, usa Server > Data Export para exportar estructura y
datos de todo el esquema a un archivo SQL. Conserva triggers, rutinas o eventos
si existen. Para importarlo, configura una conexion a MySQL privado mediante
Standard TCP/IP over SSH: servidor SSH = IP publica de la VM, usuario SSH =
ubuntu, clave = oracle.key, servidor MySQL = endpoint privado de HeatWave.
Configura tambien TLS y la CA del endpoint de MySQL.

Usa Server > Data Import contra un esquema nuevo de destino. Comprueba que la
importacion termina sin errores y que estan las tablas y registros originales.
No ejecutes todas las migraciones del proyecto: la base actual ya tiene su
estructura y esas operaciones no sustituyen una importacion.

Transfiere aparte la carpeta de archivos actual definida por MEDIA_STORAGE_PATH;
si no esta personalizada, es backend/storage/media. Conserva sus subcarpetas
patients y treatments y todos sus nombres: la base guarda referencias a ellos.
Puedes enviar su contenido a ~/unavet/staging-media mediante SCP. No es la
carpeta backend/backups.

## 6. Completar la configuracion y arrancar

En el servidor:

```bash
cd ~/unavet
cp deploy/cloud.env.example deploy/.env.cloud
chmod 600 deploy/.env.cloud
nano deploy/.env.cloud
```

Sustituye todos los campos CAMBIAR. DB_NAME debe coincidir con el esquema
importado. FRONTEND_URL debe ser tu direccion HTTPS real. Configura el correo
SMTP, requerido para arrancar en produccion y recuperar passwords. Puedes
conservar el proveedor de correo actual si permite envios desde el servidor.

Genera cada uno de los tres secretos por separado con `openssl rand -hex 32`
y guardalos en el archivo privado. No pegues su salida en el chat.

Si necesitas una CA privada, crea deploy/certs/mysql-ca.pem y un archivo
deploy/compose.tls.yaml con este contenido:

```yaml
services:
  app:
    volumes:
      - ./deploy/certs:/app/backend/certs:ro
```

La ruta del volumen se interpreta desde compose.yaml, en la raiz del proyecto.
Activa DB_SSL_CA_PATH=/app/backend/certs/mysql-ca.pem en .env.cloud. Para todos
los comandos Compose siguientes agrega, antes del subcomando,
`-f compose.yaml -f deploy/compose.tls.yaml` si usas este montaje.

Construye el contenedor, crealo sin arrancar y copia los archivos originales
desde staging-media al volumen persistente:

```bash
sudo docker compose build app
sudo docker compose create app
sudo docker compose cp ./staging-media/. app:/app/backend/storage/media/
sudo docker compose run --rm --no-deps --user root app chown -R node:node /app/backend/storage/media
sudo docker compose up -d
sudo docker compose ps
curl --fail http://127.0.0.1:8080/api/health
```

La salud debe devolver {"status":"ok"}. No es necesario ejecutar npm run dev:
Docker compila React y arranca el backend en produccion. El archivo compose
existente guarda las fotos en un volumen; recrear la app conserva ese volumen.

## 7. Activar HTTPS y verificar

Instala [Caddy para Ubuntu](https://caddyserver.com/docs/install) como servicio.
Configura /etc/caddy/Caddyfile con tu subdominio real:

```caddyfile
unavet-ejemplo.duckdns.org {
    reverse_proxy 127.0.0.1:8080
}
```

Aplica la configuracion:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

El DNS debe apuntar a la VM y los puertos 80/443 deben ser accesibles para emitir
el certificado. [Caddy gestiona HTTPS automaticamente](https://caddyserver.com/docs/automatic-https).

Abre tu direccion HTTPS desde otra computadora o un telefono con datos moviles.
Comprueba login con un usuario existente, pacientes, fotos y PDF antiguos,
guardado de una foto nueva y recuperacion de password. Verifica que los archivos
nuevos permanecen despues de `sudo docker compose restart app`.

Antes de usarlo diariamente, configura respaldos externos de MySQL y archivos y
verifica una restauracion. Los automaticos de MySQL gratuito solo retienen un
dia. No elimines la copia local hasta confirmar la migracion. No uses
`docker compose down -v` para actualizar: eliminaria los volumenes.

## Actualizaciones

Vuelve a transferir el codigo revisado conservando deploy/.env.cloud y los
volumenes. Desde ~/unavet usa `sudo docker compose up -d --build` y revisa la
salud y el funcionamiento. Conserva una version anterior del codigo y un
respaldo de los datos antes de actualizaciones que cambien la base.
