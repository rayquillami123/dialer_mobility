'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ShieldAlert, Activity, Gauge, RefreshCw } from 'lucide-react';

type AbItem = {
  campaign_id: number | null;
  total_answered: number;
  abandoned_safeharbor: number;
  abandonment_pct: number; // 0..100
};
type AbResp = { window: string; items: AbItem[] };

type WSMsg = {
  type: 'campaign.autoprotect';
  campaign_id: number;
  pct: number;
  cap: number;
  multiplier: number; // 0..1
  status: 'ok' | 'recovering' | 'holding' | 'throttled' | 'disabled';
  ts?: number;
};

type Status = Omit<WSMsg, 'type'>;

type Props = {
  /** Opcional: filtra a estas campañas */
  campaignIds?: number[];
};

export default function DashboardAutoProtectSummary({ campaignIds }: Props) {
  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';
  const DEFAULT_WS = API ? API.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws' : '';
  const WSURL = process.env.NEXT_PUBLIC_WS || DEFAULT_WS;

  const [windowVal, setWindowVal] = useState<'15m' | '60m' | '1d' | '7d'>('15m');
  const [abItems, setAbItems] = useState<AbItem[]>([]);
  const [statuses, setStatuses] = useState<Record<number, Status>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  async function fetchAbandonment() {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(`${API}/api/reports/abandonment?window=${windowVal}`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AbResp = await r.json();
      const items = (data.items || []).map(x => ({
        campaign_id: Number(x.campaign_id ?? 0) || 0,
        total_answered: Number(x.total_answered ?? 0),
        abandoned_safeharbor: Number(x.abandoned_safeharbor ?? 0),
        abandonment_pct: Number(x.abandonment_pct ?? 0),
      })) as AbItem[];
      setAbItems(items);
    } catch (e: any) {
      setErr(e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAbandonment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowVal]);

  // WS: capta estados/multiplicadores en vivo
  useEffect(() => {
    if (!WSURL) return;
    try {
      const ws = new WebSocket(WSURL);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg: WSMsg = JSON.parse(ev.data);
          if (msg?.type === 'campaign.autoprotect') {
            if (campaignIds && !campaignIds.includes(msg.campaign_id)) return;
            setStatuses(prev => ({ ...prev, [msg.campaign_id]: {
              campaign_id: msg.campaign_id,
              pct: Number(msg.pct || 0),
              cap: Number(msg.cap || 3),
              multiplier: Number(msg.multiplier || 1),
              status: msg.status,
              ts: msg.ts || Date.now(),
            }}));
          }
        } catch {}
      };
      return () => { try { ws.close(); } catch {} };
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WSURL, JSON.stringify(campaignIds)]);

  // Filtra por campañas si se especifican
  const filteredAb = useMemo(() => {
    if (!campaignIds?.length) return abItems;
    const set = new Set(campaignIds);
    return abItems.filter(i => i.campaign_id && set.has(i.campaign_id));
  }, [abItems, JSON.stringify(campaignIds)]);

  // Promedio ponderado por contestadas
  const weightedAvgPct = useMemo(() => {
    let num = 0, den = 0;
    for (const it of filteredAb) {
      num += (it.abandonment_pct || 0) * (it.total_answered || 0);
      den += (it.total_answered || 0);
    }
    return den ? num / den : 0;
  }, [filteredAb]);

  // Campañas throttled y promedio de multiplicador (de WS)
  const throttledCount = useMemo(() => {
    const vals = Object.values(statuses);
    const filtered = campaignIds?.length ? vals.filter(v => campaignIds.includes(v.campaign_id)) : vals;
    return filtered.filter(s => s.status === 'throttled' || (s.multiplier ?? 1) < 1).length;
  }, [statuses, JSON.stringify(campaignIds)]);

  const avgMultiplier = useMemo(() => {
    const vals = Object.values(statuses);
    const filtered = campaignIds?.length ? vals.filter(v => campaignIds.includes(v.campaign_id)) : vals;
    if (!filtered.length) return 1;
    const sum = filtered.reduce((s, v) => s + Math.max(0, Math.min(1, v.multiplier ?? 1)), 0);
    return sum / filtered.length;
  }, [statuses, JSON.stringify(campaignIds)]);

  function badgeForPct(p: number): 'default' | 'secondary' | 'destructive' {
    if (p > 3) return 'destructive';
    if (p >= 2) return 'secondary';
    return 'default';
  }

  const mulPct = Math.round(Math.max(0, Math.min(1, avgMultiplier)) * 100);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Resumen Auto-Protección
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={windowVal} onValueChange={(v: any)=>setWindowVal(v)}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Ventana" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15m">15 min</SelectItem>
              <SelectItem value="60m">60 min</SelectItem>
              <SelectItem value="1d">1 día</SelectItem>
              <SelectItem value="7d">7 días</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchAbandonment}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && <div className="text-sm text-muted-foreground">Cargando…</div>}
        {!loading && err && <div className="text-sm text-red-600">Error: {err}</div>}
        {!loading && !err && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1: Abandono promedio ponderado */}
            <div className="rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Abandono (promedio)
                </div>
                <Badge variant={badgeForPct(weightedAvgPct)} className="text-xs">
                  {weightedAvgPct.toFixed(2)}%
                </Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Ponderado por llamadas contestadas en la ventana seleccionada.
              </div>
            </div>

            {/* KPI 2: Campañas limitadas */}
            <div className="rounded-2xl border p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Campañas limitadas
              </div>
              <div className="mt-3 text-2xl font-semibold">{throttledCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Con protección activa (status "throttled" o multiplicador &lt; 1).
              </div>
            </div>

            {/* KPI 3: Multiplicador promedio */}
            <div className="rounded-2xl border p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Gauge className="h-4 w-4" /> Multiplicador promedio
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="w-28">
                  <Progress value={mulPct} aria-label="Multiplicador promedio" />
                </div>
                <div className="text-sm tabular-nums">{(avgMultiplier || 1).toFixed(2)}×</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">1.00× = ritmo base.</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
