'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldAlert, Activity, RefreshCw, Gauge } from 'lucide-react';

type AutoProtectState = {
  campaign_id: number;
  pct: number;         // abandono reciente %
  cap: number;         // umbral %
  multiplier: number;  // 0..1
  status: 'ok' | 'recovering' | 'holding' | 'throttled' | 'disabled';
  ts?: number;
};

type SnapshotResp = {
  campaign_id: number;
  cap_pct: number;
  window_min: number;
  answered: number;
  abandoned: number;
  abandonment_pct: number;
};

type Props = {
  /** Opcional: IDs de campañas a mostrar (si no, se pobla con eventos WS). */
  campaignIds?: number[];
  /** Opcional: etiqueta por campaña, ej. {1:'Ventas MX'} */
  campaignLabels?: Record<number, string>;
  /** Tamaño máximo de tarjetas por fila */
  columns?: 2 | 3 | 4;
};

export default function DashboardAutoProtect({
  campaignIds,
  campaignLabels = {},
  columns = 3,
}: Props) {
  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';
  const DEFAULT_WS = API ? API.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws' : '';
  const WSURL = process.env.NEXT_PUBLIC_WS || DEFAULT_WS;

  const [items, setItems] = useState<Record<number, AutoProtectState>>({});
  const [connecting, setConnecting] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Prefetch: estado actual por campaignIds (si se proveen)
  async function fetchSnapshot(id: number): Promise<AutoProtectState | null> {
    try {
      const r = await fetch(`${API}/api/campaigns/${id}/autoprotect`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
        cache: 'no-store',
      });
      if (!r.ok) return null;
      const j: SnapshotResp = await r.json();
      return {
        campaign_id: j.campaign_id,
        pct: Number(j.abandonment_pct || 0),
        cap: Number(j.cap_pct || 3),
        multiplier: 1, // el snapshot no trae multiplier; lo asumimos 1 al inicio
        status: 'ok',
        ts: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async function refreshAll() {
    if (!campaignIds?.length) return;
    const arr = await Promise.all(campaignIds.map(fetchSnapshot));
    const next: Record<number, AutoProtectState> = { ...items };
    arr.forEach((it) => {
      if (it) next[it.campaign_id] = it;
    });
    setItems(next);
  }

  // WebSocket live feed
  useEffect(() => {
    if (!WSURL) return;
    setConnecting(true);
    try {
      const ws = new WebSocket(WSURL);
      wsRef.current = ws;
      ws.onopen = () => setConnecting(false);
      ws.onclose = () => setConnecting(false);
      ws.onerror = () => setConnecting(false);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === 'campaign.autoprotect') {
            const s: AutoProtectState = {
              campaign_id: Number(data.campaign_id),
              pct: Number(data.pct || 0),
              cap: Number(data.cap || 3),
              multiplier: Number(data.multiplier || 1),
              status: (data.status || 'ok') as AutoProtectState['status'],
              ts: Number(data.ts || Date.now()),
            };
            // Si campaignIds está definido, filtrar a esos; si no, aceptar todos
            if (!campaignIds || campaignIds.includes(s.campaign_id)) {
              setItems((prev) => ({ ...prev, [s.campaign_id]: s }));
            }
          }
        } catch {}
      };
      return () => {
        try { ws.close(); } catch {}
      };
    } catch {
      setConnecting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WSURL, JSON.stringify(campaignIds)]);

  // Prefetch inicial (si nos pasan IDs)
  useEffect(() => {
    if (campaignIds?.length) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(campaignIds), API]);

  const list = useMemo(() => {
    const vals = Object.values(items);
    // Si hay campaignIds, ordena según esa lista; si no, por riesgo (pct desc)
    if (campaignIds?.length) {
      const map = new Map(vals.map((v) => [v.campaign_id, v]));
      return campaignIds
        .map((id) => map.get(id))
        .filter(Boolean) as AutoProtectState[];
    }
    return vals.sort((a, b) => b.pct - a.pct);
  }, [items, JSON.stringify(campaignIds)]);

  function statusBadgeVariant(s: AutoProtectState['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (s === 'throttled') return 'destructive';
    if (s === 'recovering' || s === 'holding') return 'secondary';
    if (s === 'disabled') return 'outline';
    return 'default';
  }
  function statusLabel(s: AutoProtectState['status']) {
    switch (s) {
      case 'ok': return 'OK';
      case 'recovering': return 'Recuperando';
      case 'holding': return 'Manteniendo';
      case 'throttled': return 'Limitada';
      case 'disabled': return 'Desactivada';
      default: return s;
    }
  }

  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
  }[columns];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Auto-Protección por Campaña
        </CardTitle>
        <div className="flex items-center gap-2">
          {connecting && <Badge variant="secondary" className="text-xs">WS conectando…</Badge>}
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={!campaignIds?.length}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3">
            {campaignIds?.length
              ? 'Sin datos aún. Esperando actualizaciones…'
              : 'No hay campañas activas o eventos recibidos. Configure campaignIds o genere tráfico.'}
          </div>
        ) : (
          <div className={`grid gap-4 ${gridCols}`}>
            {list.map((it) => {
              const pct = Math.max(0, Math.min(100, it.pct || 0));
              const cap = Number(it.cap || 3);
              const mul = Math.max(0, Math.min(1, it.multiplier || 1));
              const mulPct = Math.round(mul * 100);
              const label = campaignLabels[it.campaign_id] || `Campaña #${it.campaign_id}`;
              const pctVariant =
                pct > 3 ? 'destructive' : pct >= 2 ? 'secondary' : 'default';

              return (
                <div key={it.campaign_id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{label}</div>
                    <Badge variant={statusBadgeVariant(it.status)}>{statusLabel(it.status)}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {/* Medidor de multiplicador */}
                    <div className="col-span-3 sm:col-span-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Gauge className="h-4 w-4" /> Ritmo efectivo
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="w-28">
                          <Progress value={mulPct} aria-label="Multiplicador" />
                        </div>
                        <div className="text-sm tabular-nums">{(mul).toFixed(2)}×</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        1.00× = ritmo base; &lt;1.00× = protección activa
                      </div>
                    </div>

                    {/* % Abandono (reciente) */}
                    <div className="col-span-3 sm:col-span-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" /> % abandono (reciente)
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="w-28">
                          <Progress value={Math.min(100, pct)} aria-label="% abandono" />
                        </div>
                        <Badge variant={pctVariant as any} className="text-xs">
                          {pct.toFixed(2)}%
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Umbral: {cap.toFixed(2)}%
                      </div>
                    </div>

                    {/* Meta / tooltips */}
                    <div className="col-span-3 sm:col-span-1">
                      <TooltipProvider>
                        <div className="text-sm text-muted-foreground">Detalles</div>
                        <div className="mt-2 text-xs grid gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-between">
                                <span>Estado</span><span className="font-mono">{statusLabel(it.status)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>OK: normal · Recovering: subiendo ritmo · Holding: estable bajo cap · Throttled: recortado</p>
                            </TooltipContent>
                          </Tooltip>
                          <div className="flex items-center justify-between">
                            <span>Cap</span><span className="font-mono">{cap}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Multiplicador</span><span className="font-mono">{mul.toFixed(2)}×</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Últ. act.</span>
                            <span className="font-mono">
                              {it.ts ? new Date(it.ts).toLocaleTimeString() : '—'}
                            </span>
                          </div>
                        </div>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
