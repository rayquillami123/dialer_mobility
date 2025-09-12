# Runbook de Operación — Dialer Inteligente

Este documento contiene procedimientos estándar para operar, monitorear y responder a incidentes comunes de la plataforma.

## Alertas Comunes & Acciones

### 1. Alerta: Abandono > 3%
- **Gatillo**: `GlobalAlertBar` en rojo; alerta de Grafana/Prometheus sobre `weighted_abandonment_pct > 3`.
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
