# Runbook de Operación — Dialer Inteligente

Este documento contiene procedimientos estándar para operar, monitorear y responder a incidentes comunes de la plataforma.

## Cierre Ejecutivo: Estado Actual de la Plataforma

Tras un intenso ciclo de desarrollo, la plataforma ha alcanzado un nivel de madurez "enterprise", lista para operación 24/7. Las capacidades clave incluyen:

*   **Motor de Marcación Inteligente**: Equipado con Auto-Protección dinámica, failover de troncales basado en salud y cumplimiento normativo integrado (ventanas de marcación y Safe Harbor).
*   **Arquitectura SaaS Multi-tenant**: Aislamiento de datos completo por inquilino, con un sistema de autenticación robusto (JWT de acceso + refresh vía cookie HttpOnly) y control de acceso basado en roles (RBAC).
*   **Observabilidad 360°**: Dashboards en tiempo real para monitorear el abandono, la salud de DIDs/troncales y un sistema de WebSocket resiliente con heartbeats y reconexión automática.
*   **Operaciones Listas para Producción**: Métricas personalizadas para Prometheus, alertas predefinidas para KPIs críticos, estrategia de backups y manifiestos de despliegue para Docker Compose y Kubernetes.
*   **Experiencia de Usuario (UX) Profesional**: Flujo de onboarding de usuarios completo (invitar, aceptar, resetear contraseña), dashboard con alertas globales y un widget de estado de sesión claro.

## Go-Live Checklist (Puesta en Producción)

### Seguridad
- [ ] Rotar `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` con valores largos y únicos por entorno.
- [ ] Revisar `CORS_ORIGIN` para permitir solo los dominios de frontend válidos.
- [ ] Revisar roles del usuario inicial en la base de datos y eliminar cuentas de prueba.
- [ ] Habilitar y forzar HTTPS/WSS en Nginx/LB y probar la conexión a `/ws`.
- [ ] Definir y revisar políticas de retención de datos para CDRs, logs y grabaciones (ej. en S3).

### Base de Datos
- [ ] Ejecutar todas las migraciones SQL en el orden correcto.
- [ ] Confirmar que los índices clave existen, especialmente en `cdr` (`tenant_id`, `received_at`).
- [ ] Verificar configuración de `AUTOVACUUM` y memoria (`work_mem`, `shared_buffers`) en PostgreSQL.

### FreeSWITCH
- [ ] Verificar que el ESL está accesible desde el backend (`fs_cli -x status`).
- [ ] Confirmar que las colas (`callcenter_config queue list`) y agentes (`callcenter_config agent list`) están creados.
- [ ] Realizar una llamada de prueba para verificar el dialplan completo (AMD → `transfer callcenter(...)`).

### Observabilidad
- [ ] Verificar que Prometheus está recolectando métricas desde el endpoint `/api/metrics`.
- [ ] Cargar las reglas de alerta (`ops/prometheus/alerts_dialer.yml`) en Prometheus.
- [ ] Forzar escenarios de prueba (abandono alto, caída de troncal) y confirmar que la `GlobalAlertBar` y el `DashboardAutoProtect` reaccionan.

### Backups y Recuperación de Desastres (DR)
- [ ] Confirmar que el job de backup diario está activo.
- [ ] Realizar al menos una prueba de restauración completa del backup en un entorno de staging.
- [ ] Verificar las políticas de ciclo de vida en el bucket S3 para grabaciones (ej. mover a Glacier/Deep Archive).

## Smoke Tests (Verificación Rápida)

Estos tests validan que los componentes críticos (Auth, API, WS) están funcionando. Ejecutar tras cada despliegue.

Asume que las siguientes variables de entorno están definidas:
- `API`: URL base de la API (ej. `https://api.tudominio.com`)
- `EMAIL`: Email del usuario de prueba.
- `PASS`: Contraseña del usuario de prueba.

### 1. Script Automatizado (Recomendado)
El script `ops/smoke/smoke.mjs` realiza todas las validaciones de forma automática.

```bash
# Navega al directorio del backend para instalar dependencias si es necesario
cd backend
npm install node-fetch ws # (si no están ya en devDependencies)

# Ejecuta el test
API=$API EMAIL=$EMAIL PASS="$PASS" node ../ops/smoke/smoke.mjs
```
Un resultado `SMOKE OK` indica que las pruebas pasaron.

### 2. Pasos Manuales

#### 2.1 Autenticación y Endpoints
```bash
# Obtener token
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | jq -r .access_token)

# Verificar que el token no está vacío
if [ -z "$TOKEN" ]; then echo "Login fallido"; exit 1; fi
echo "Login OK, token obtenido."

# Probar endpoint protegido (debe devolver 200)
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/reports/abandonment?window=15m" | jq .
echo "Llamada a endpoint protegido OK."
```

#### 2.2 Conexión WebSocket
Usa `websocat` para probar el handshake.
```bash
# Instala websocat si no lo tienes (ej. apt-get install websocat)
websocat -H="Sec-WebSocket-Protocol: json" \
  "$API/ws?token=$TOKEN"

# Deberías ver un mensaje de bienvenida del servidor: {"type":"ws.hello", ...}
```

#### 2.3 Conexión ESL y Origen de Llamada (desde el host del backend)
```bash
# Conéctate al contenedor de FreeSWITCH
docker exec -it freeswitch fs_cli

# Dentro de fs_cli, prueba un origen simple
> originate loopback/1000 &echo
```

#### 2.4 Métricas Prometheus
```bash
# Accede al endpoint (puede requerir IP autorizada según tu Nginx)
curl -s $API/api/metrics | head
```

## Alertas Comunes & Acciones

### 1. Alerta: Abandono > 3%
- **Gatillo**: `GlobalAlertBar` en rojo; alerta de Grafana/Prometheus sobre `abandonment_weighted_pct > 3`.
- **Acción Inmediata**:
  1.  **Verificar Ocupación**: ¿Están los agentes en llamada o en pausa? ¿Hay agentes disponibles en la cola de la campaña afectada?
  2.  **Reducir Pacing**: Si la auto-protección no ha sido suficiente, pausar manualmente campañas de bajo rendimiento o reducir su `pacing` desde la UI.
  3.  **Confirmar Tiempos**: Revisar que el tiempo de transferencia al agente sea mínimo. ¿Hay latencia en la PBX?
- **Análisis Posterior**:
  - Revisar el `DashboardAutoProtect` para ver el `multiplier` aplicado. ¿Estuvo `throttled`?
  - Analizar `AbandonmentTrend` para identificar a qué hora comenzó el pico. ¿Coincide con un cambio de turno o un problema de red?

### 2. Alerta: ASR (Answer-Seizure Ratio) Bajo
- **Gatillo**: `ProvidersHealth` muestra ASR < 20%; alerta de Grafana/Prometheus sobre `asr_by_trunk < 0.2`.
- **Acción Inmediata**:
  1.  **Identificar Causa**: Ir a `TopSipByDid` y `ProvidersHealth` para ver la distribución de códigos SIP. ¿Hay un aumento de `486` (Busy), `404` (Not Found), `503` (Service Unavailable)?
  2.  **Forzar Failover**: Si un proveedor específico está fallando, deshabilitar temporalmente la troncal desde la UI de "Proveedores" para forzar el tráfico por las rutas de respaldo.
  3.  **Revisar PDD**: Un PDD (Post-Dial Delay) alto puede causar que los usuarios cuelguen antes de contestar. Revisar `ProvidersHealth`.
- **Análisis Posterior**:
  - Contactar al proveedor SIP si el problema persiste.
  - Revisar la calidad de la lista de leads. ¿Son números válidos?

### 3. Alerta: DIDs Cerca del Tope Diario
- **Gatillo**: `DIDHealth` muestra utilización cercana al 90-100%.
- **Acción Inmediata**:
  1.  **Verificar Rotación**: Asegurarse de que el sistema esté rotando los DIDs correctamente.
  2.  **Añadir DIDs**: Si todos los DIDs de un estado están saturados, considerar añadir más números a ese pool.
  3.  **Verificar Reputación**: Un DID con muchas llamadas puede ser marcado como spam. Rotar proactivamente.

### 4. Alerta: WebSocket Desconectado
- **Gatillo**: El `GlobalAlertBar` y otros componentes en tiempo real no reciben actualizaciones.
- **Acción Inmediata**:
  1.  **Revisar Logs**: Inspeccionar los logs de Nginx para la ruta `/ws` y los logs del backend en busca de errores de conexión o autenticación de WS.
  2.  **Confirmar Conectividad**: El hook `useDialerWS` reintentará la conexión automáticamente. Si falla persistentemente, es un problema de servidor o red.
  3.  **Estado del Backend**: ¿Está el servicio del backend activo y respondiendo en `/health`?

### 5. Alerta: Base de Datos Lenta
- **Gatillo**: Tiempos de respuesta de la API lentos; métricas de Prometheus mostrando alta latencia en `pg_query_duration`.
- **Acción Inmediata**:
  1.  **Revisar Índices**: Asegurarse de que las consultas en `cdr` y `attempts` estén utilizando índices, especialmente sobre `tenant_id` y `received_at` / `created_at`.
  2.  **Identificar Consultas Pesadas**: Usar `pg_stat_statements` para encontrar las consultas más lentas.
- **Acción Preventiva**:
  - Implementar una política de archivado o purga para tablas grandes como `cdr` y `audit_log` (p. ej., mover datos de más de 180 días a S3/Glacier).

## Mantenimiento Programado

- **Migraciones de Base de Datos**: Deben ser versionadas (usando una herramienta como `node-pg-migrate`) y aplicadas como parte del pipeline de CI/CD antes de desplegar el código que depende de ellas.
- **Prueba de Backups**: Realizar una prueba de restauración de la base de datos en un entorno de staging al menos una vez al mes para validar la integridad de los backups.
- **Rotación de Secretos**: Rotar `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` trimestralmente. Esto requiere una estrategia de "doble secreto" para no invalidar las sesiones activas durante el despliegue.
- **Revisión de Límites**: Auditar periódicamente los límites de `express-rate-limit` y las políticas de CORS para asegurarse de que son adecuados para el tráfico actual.

## Onboarding de Nuevo Tenant

1.  **Generar Hash de Contraseña**:
    ```bash
    node -e "console.log(require('bcrypt').hashSync('ContraseñaSeguraParaNuevoCliente',10))"
    ```
2.  **Preparar Script SQL**: Crear un archivo `bootstrap_acme.sql` basado en `ops/scripts/bootstrap_tenant.sql`, reemplazando el nombre del tenant, el slug, el email del admin y el hash de la contraseña.
3.  **Ejecutar Script**:
    ```bash
    psql -f ops/scripts/bootstrap_acme.sql
    ```
4.  **Proveer Credenciales**: Entregar de forma segura el email y la contraseña al nuevo administrador del tenant.

## Roadmap “Phase Next” (Opcionales Recomendados)

Esta sección describe las siguientes mejoras estratégicas para evolucionar la plataforma, construyendo sobre la base sólida ya existente.

### 1. Alta Disponibilidad y Resiliencia Geográfica
-   **Réplicas de Base de Datos**: Implementar réplicas de lectura (read replicas) para PostgreSQL para distribuir la carga de reportes y analítica. Configurar un failover gestionado para la base de datos principal.
-   **Almacenamiento Multi-AZ**: Configurar el bucket S3 para grabaciones en modo Multi-AZ y endurecer las políticas de ciclo de vida, considerando opciones como WORM (Write-Once, Read-Many) si la vertical de negocio lo requiere.

### 2. Seguridad y Cumplimiento Avanzado
-   **SSO y Provisioning**: Integrar Single Sign-On (SAML/OIDC) por tenant con proveedores como Okta o Azure AD. Implementar SCIM para el aprovisionamiento y desaprovisionamiento automático de usuarios.
-   **Cifrado Avanzado**: Utilizar KMS (Key Management Service) para el cifrado de grabaciones en reposo, con políticas de rotación de claves programadas.
-   **Gobernanza de Datos Regional**: Crear un mapa de datos y aplicar políticas específicas por país, como ventanas de marcado y listas DNC regionales, configurables por tenant.

### 3. Controles de Coste y Escalado Inteligente
-   **Quotas por Tenant**: Implementar límites (canales concurrentes, CPS, minutos/mes) por inquilino con "circuit breakers" para prevenir abusos o picos inesperados de coste.
-   **Autoscaling por Métricas de Negocio**: Configurar el HPA de Kubernetes para escalar no solo por CPU/memoria, sino por métricas personalizadas como "leads pendientes en cola" o "agentes disponibles".
-   **Data Lake para BI**: Archivar CDRs y datos de eventos en un formato eficiente como Parquet en un data lake (ej. S3 + Athena/BigQuery) para análisis de Business Intelligence a bajo coste.

### 4. Producto, Gobernanza y Operación
-   **Facturación y Uso**: Implementar un sistema de tracking de uso (minutos, llamadas, almacenamiento) por tenant. Exponer estos datos a través de webhooks para integrar con sistemas de facturación como Stripe.
-   **Auditoría Centralizada**: Crear un "sink" para enviar los `audit_log` a un sistema SIEM (Security Information and Event Management) y definir políticas de retención diferenciadas.
-   **Chaos Drills**: Realizar simulacros semestrales ("game days") para probar la resiliencia del sistema: forzar la caída de un proveedor SIP, simular un pico de abandono para verificar la Auto-Protección, o cortar la conexión WebSocket para probar la reconexión.

## Blueprint para Alta Capacidad (2.000+ Canales)

Esta sección detalla la arquitectura, el dimensionamiento y el tuning necesarios para escalar la plataforma a 2.000 canales simultáneos de manera estable y resiliente.

### 1. Arquitectura de Alta Capacidad (2.000 ch)
- **Capas Clave**:
    - **SBC de Borde (Kamailio/OpenSIPS)**: Protege contra DoS, gestiona NAT, oculta la topología, limita la tasa por proveedor/inquilino y balancea la carga SIP.
    - **Anclaje de Media (RTPengine)**: Fija el flujo RTP para un NAT limpio, soporta SRTP y puede duplicar el audio para análisis externo (AMD avanzado).
    - **Nodos de Media (FreeSWITCH)**: Cluster de 3 a 6 nodos que ejecutan la lógica de IVR/AMD y transfieren las llamadas. Son escalables horizontalmente.
    - **Orquestador (Backend Node.js)**: Distribuye la carga (campañas, canales) entre los nodos de FreeSWITCH según su salud, carga y el CPS del carrier.
    - **Base de Datos (Postgres HA)**: Con particiones por día para tablas de alto volumen (CDR, attempts) e índices optimizados.
    - **Almacenamiento de Grabaciones (S3/NFS)**: Externalizado para evitar cuellos de botella de I/O en los nodos de media.

### 2. Dimensionamiento Rápido
- **Ancho de Banda**: 2.000 canales en G.711 requieren ~400 Mbps sostenidos. El uso de Opus puede reducirlo en un 70%.
- **CPU por Nodo FS**: 16-24 vCPU a 3+ GHz son suficientes si no hay transcodificación pesada.
- **Red**: Enlaces de 10GbE son recomendados, con VLANs separadas para señalización (SIP) y media (RTP), marcando el tráfico con QoS (DSCP).

### 3. Tuning de SO y Red (Nodos de Media)
- **Kernel (`sysctl.conf`)**: Aumentar los buffers de sockets UDP (`rmem_max`, `wmem_max`), el backlog de red y el rango de puertos locales.
- **Límites de Usuario (`ulimit`)**: Incrementar el número máximo de archivos abiertos (`LimitNOFILE`) a más de 1 millón para el servicio de FreeSWITCH.
- **NIC**: Desactivar `LRO/GRO` para minimizar la latencia en el procesamiento de paquetes RTP.

### 4. Tuning de FreeSWITCH
- **Perfiles SIP**: Limitar los codecs a los estrictamente necesarios (`passthrough`), habilitar `early-media` y `disable-transcoding`.
- **RTP (`vars.xml`)**: Definir un rango de puertos amplio (ej. 30000-40000) y activar un jitter buffer moderado solo si es necesario.

### 5. Orquestación y Pruebas de Carga
- **Orquestador Avanzado**: Debe gestionar CPS por troncal, recibir "backpressure" de los nodos sobrecargados y usar un scheduler adaptativo basado en la profundidad de la cola de agentes.
- **Pruebas de Carga (SIPp + RTPengine)**:
    - **Rampa de Carga**: Incrementar gradualmente hasta 500 CPS y mantener durante 30 minutos.
    - **KPIs de Éxito**: Pérdida de paquetes RTP &lt; 0.2%, Jitter &lt; 20 ms, PDD &lt; 2.5s, CPU &lt; 70%.
    - **Pruebas de Failover**: Simular la caída de un nodo FS y verificar que el sistema sigue operando sin pérdida de llamadas nuevas.

### 6. Playbook de Pruebas de Carga (SIPp)

Esta sección describe cómo usar SIPp para generar una carga realista y validar el rendimiento de la plataforma.

#### Escenario SIPp: UAS con Early Media y RTP Echo
Este escenario simula un agente de usuario del lado del proveedor (UAS) que responde con `183 Session Progress` (early media), seguido de un `200 OK`, y utiliza la opción `-rtp_echo` de SIPp para devolver cualquier paquete RTP que reciba.

**`sipp/scenarios/uas_183_200_rtp_echo.xml`**
```xml
<?xml version="1.0" encoding="ISO-8859-1" ?>
&lt;!-- SIPp UAS: responde 183 con SDP (early media), luego 200 OK con SDP.
     Con la opción -rtp_echo, SIPp devolverá cualquier RTP recibido. --&gt;
&lt;scenario name="UAS 183 early media -&gt; 200 OK (RTP echo)"&gt;

  &lt;!-- 1) Recibir INVITE --&gt;
  &lt;recv request="INVITE" rtd="true"/&gt;

  &lt;!-- 2) Enviar 100 Trying --&gt;
  &lt;send&gt;
    &lt;![CDATA[
SIP/2.0 100 Trying
Via: [last_Via:]
From: [last_From:]
To: [last_To:]
Call-ID: [last_Call-ID:]
CSeq: [last_CSeq:]
Content-Length: 0
    ]]&gt;
  &lt;/send&gt;

  &lt;!-- 3) Enviar 183 con SDP (early media) --&gt;
  &lt;send&gt;
    &lt;![CDATA[
SIP/2.0 183 Session Progress
Via: [last_Via:]
From: [last_From:]
To: [last_To:];tag=[call_number]
Call-ID: [last_Call-ID:]
CSeq: [last_CSeq:]
Contact: <sip:[local_ip]:[local_port];transport=[transport]>
Content-Type: application/sdp
Content-Length: [len]

v=0
o=- 0 0 IN IP4 [local_ip]
s=early-media
c=IN IP4 [local_ip]
t=0 0
m=audio [media_port] RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendrecv
    ]]&gt;
  &lt;/send&gt;

  &lt;!-- 4) Pausa corta de early media --&gt;
  &lt;pause milliseconds="2000"/&gt;

  &lt;!-- 5) Enviar 200 OK con SDP (establece llamada) --&gt;
  &lt;send&gt;
    &lt;![CDATA[
SIP/2.0 200 OK
Via: [last_Via:]
From: [last_From:]
To: [last_To:];tag=[call_number]
Call-ID: [last_Call-ID:]
CSeq: [last_CSeq:]
Contact: <sip:[local_ip]:[local_port];transport=[transport]>
Content-Type: application/sdp
Content-Length: [len]

v=0
o=- 0 0 IN IP4 [local_ip]
s=answer
c=IN IP4 [local_ip]
t=0 0
m=audio [media_port] RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendrecv
    ]]&gt;
  &lt;/send&gt;

  &lt;!-- 6) Esperar ACK --&gt;
  &lt;recv request="ACK" crlf="true" /&gt;

  &lt;!-- 7) Mantener llamada X ms para media bidireccional --&gt;
  &lt;pause milliseconds="10000"/&gt;

  &lt;!-- 8) Colgar (BYE) si el origen no lo hace antes --&gt;
  &lt;send&gt;
    &lt;![CDATA[
BYE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:uas@[local_ip]>;tag=[call_number]
To: [last_From:]
Call-ID: [last_Call-ID:]
CSeq: 2 BYE
Max-Forwards: 70
Content-Length: 0
    ]]&gt;
  &lt;/send&gt;
```
- **Integración con Plataformas Externas**:
    - **FusionPBX**:
      1.  No levantes el contenedor `freeswitch` local.
      2.  En FusionPBX, habilita el Event Socket y ajusta la ACL para permitir la conexión desde el backend del dialer.
      3.  Configura `mod_json_cdr` en FusionPBX para que envíe los CDRs a tu backend.
      4.  En el `.env` de tu dialer, apunta `ESL_HOST` a la IP de FusionPBX.
      5.  Origina las llamadas desde tu orquestador hacia las colas o extensiones de FusionPBX.
    - **Issabel/Asterisk**:
      1.  **Opción A (Solo Trunk SIP)**: Configura un troncal SIP desde tu FreeSWITCH (o SBC) hacia Issabel. El dialer origina, Issabel enruta a los agentes.
      2.  **Opción B (Con Bridge AMI)**: Crea un usuario AMI en Issabel y utiliza un microservicio "puente" que traduzca eventos AMI a WebSockets para que tu frontend pueda ver el estado de los agentes y colas.
    - **MagnusBilling**:
      1.  Configura un gateway SIP en `sofia.conf.xml` que apunte al proxy SIP de MagnusBilling.
      2.  Tu orquestador origina las llamadas a través de este gateway. Magnus se encarga de la tarificación y el enrutamiento final hacia el carrier.
      3.  Tu backend sigue recibiendo los CDRs directamente de FreeSWITCH para mantener la observabilidad en tiempo real.
