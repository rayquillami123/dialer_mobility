import client from 'prom-client';

export const wsConnections = new client.Gauge({
  name: 'ws_connections', help: 'WebSocket connections', labelNames: ['tenant_id']
});

export const autoprotectMultiplier = new client.Gauge({
  name: 'autoprotect_multiplier',
  help: 'Pacing multiplier (0..1) por campaña',
  labelNames: ['tenant_id','campaign_id']
});

export const abandonmentWeighted = new client.Gauge({
  name: 'abandonment_weighted_pct',
  help: 'Abandono ponderado (0..100) ventana corta',
  labelNames: ['tenant_id']
});
