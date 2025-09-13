# Runbook de Operación — Dialer Inteligente

Este documento contiene procedimientos estándar para operar, monitorear y responder a incidentes comunes de la plataforma. **Nota:** La información más relevante para el arranque y la configuración inicial ha sido consolidada en el `README.md` principal del proyecto.

## Cierre Ejecutivo: Estado Actual de la Plataforma

Tras un intenso ciclo de desarrollo, la plataforma ha alcanzado un nivel de madurez "enterprise", lista para operación 24/7. Las capacidades clave incluyen:

*   **Motor de Marcación Inteligente**: Equipado con Auto-Protección dinámica, failover de troncales basado en salud y cumplimiento normativo integrado (ventanas de marcación y Safe Harbor).
*   **Arquitectura SaaS Multi-tenant**: Aislamiento de datos completo por inquilino, con un sistema de autenticación robusto (JWT de acceso + refresh vía cookie HttpOnly) y control de acceso basado en roles (RBAC).
*   **Observabilidad 360°**: Dashboards en tiempo real para monitorear el abandono, la salud de DIDs/troncales y un sistema de WebSocket resiliente con heartbeats y reconexión automática.
*   **Operaciones Listas para Producción**: Métricas personalizadas para Prometheus, alertas predefinidas para KPIs críticos, estrategia de backups y manifiestos de despliegue para Docker Compose y Kubernetes.
*   **Experiencia de Usuario (UX) Profesional**: Flujo de onboarding de usuarios completo (invitar, aceptar, resetear contraseña), dashboard con alertas globales y un widget de estado de sesión claro.

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
El onboarding de nuevos tenants y usuarios se realiza a través del **Admin CLI** (`ops/cli/admin.mjs`). Esto evita la necesidad de re-habilitar el endpoint de bootstrap.

```bash
# Invitar un nuevo usuario a un tenant existente
node ops/cli/admin.mjs --api <URL> invite-user -e <admin_email> -p <admin_pass> -t <tenant_name> --invite <new_user_email>
```

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

### 5. Playbook de Pruebas de Carga (SIPp)

Esta sección describe cómo usar SIPp para generar una carga realista y validar el rendimiento de la plataforma.

#### Escenario SIPp: UAS con Early Media y RTP Echo
Este escenario simula un agente de usuario del lado del proveedor (UAS) que responde con `183 Session Progress` (early media), seguido de un `200 OK`, y utiliza la opción `-rtp_echo` de SIPp para devolver cualquier paquete RTP que reciba.

**`sipp/scenarios/uas_183_200_rtp_echo.xml`**
```xml
<?xml version="1.0" encoding="ISO-8859-1" ?>
<!-- SIPp UAS: responde 183 con SDP (early media), luego 200 OK con SDP.
     Con la opción -rtp_echo, SIPp devolverá cualquier RTP recibido. -->
<scenario name="UAS 183 early media -> 200 OK (RTP echo)">

  <!-- 1) Recibir INVITE -->
  <recv request="INVITE" rtd="true"/>

  <!-- 2) Enviar 100 Trying -->
  <send>
    <![CDATA[
SIP/2.0 100 Trying
Via: [last_Via:]
From: [last_From:]
To: [last_To:]
Call-ID: [last_Call-ID:]
CSeq: [last_CSeq:]
Content-Length: 0
    ]]>
  </send>

  <!-- 3) Enviar 183 con SDP (early media) -->
  <send>
    <![CDATA[
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
    ]]>
  </send>

  <!-- 4) Pausa corta de early media -->
  <pause milliseconds="2000"/>

  <!-- 5) Enviar 200 OK con SDP (establece llamada) -->
  <send>
    <![CDATA[
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
    ]]>
  </send>

  <!-- 6) Esperar ACK -->
  <recv request="ACK" crlf="true" />

  <!-- 7) Mantener llamada X ms para media bidireccional -->
  <pause milliseconds="10000"/>

  <!-- 8) Colgar (BYE) si el origen no lo hace antes -->
  <send>
    <![CDATA[
BYE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
From: <sip:uas@[local_ip]>;tag=[call_number]
To: [last_From:]
Call-ID: [last_Call-ID:]
CSeq: 2 BYE
Max-Forwards: 70
Content-Length: 0