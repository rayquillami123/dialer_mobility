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
