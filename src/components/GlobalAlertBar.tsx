'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, Gauge, RefreshCw, X } from 'lucide-react';

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

const MUTE_KEY = 'global_alertbar_mute_until';

export default function GlobalAlertBar({ onNavigate }: { onNavigate: (section: string) => void }) {
  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';
  const DEFAULT_WS = API ? API.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws' : '';
  const WSURL = process.env.NEXT_PUBLIC_WS || DEFAULT_WS;

  const [weightedAvgPct, setWeightedAvgPct] = useState(0);
  const [throttledCount, setThrottledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const statusesRef = useRef<Map<number, WSMsg>>(new Map());

  useEffect(() => {
    const ts = Number(localStorage.getItem(MUTE_KEY) || 0);
    setIsMuted(Date.now() < ts);
  }, []);

  async function fetchAbandonment() {
    setLoading(true);
    setErr('');
    try {
      // Ventana corta para sensibilidad
      const r = await fetch(`${API}/api/reports/abandonment?window=15m`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AbResp = await r.json();
      const items = (data.items || []).map((x) => ({
        campaign_id: Number(x.campaign_id ?? 0) || 0,
        total_answered: Number(x.total_answered ?? 0),
        abandoned_safeharbor: Number(x.abandoned_safeharbor ?? 0),
        abandonment_pct: Number(x.abandonment_pct ?? 0),
      })) as AbItem[];

      // Promedio ponderado por contestadas
      let num = 0, den = 0;
      for (const it of items) {
        num += (it.abandonment_pct || 0) * (it.total_answered || 0);
        den += (it.total_answered || 0);
      }
      setWeightedAvgPct(den ? num / den : 0);
    } catch (e: any) {
      setErr(e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  // WS: detectar campañas throttled
  useEffect(() => {
    if (!WSURL) return;
    try {
      const ws = new WebSocket(WSURL);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg: WSMsg = JSON.parse(ev.data);
          if (msg?.type === 'campaign.autoprotect') {
            statusesRef.current.set(msg.campaign_id, msg);
            const vals = Array.from(statusesRef.current.values());
            const count = vals.filter(
              (s) => s.status === 'throttled' || (s.multiplier ?? 1) < 1
            ).length;
            setThrottledCount(count);
          }
        } catch {}
      };
      return () => { try { ws.close(); } catch {} };
    } catch {}
  }, [WSURL]);

  useEffect(() => {
    fetchAbandonment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mute30min() {
    const until = Date.now() + 30 * 60 * 1000;
    localStorage.setItem(MUTE_KEY, String(until));
    setIsMuted(true);
  }

  const show =
    !isMuted &&
    !loading &&
    !err &&
    (weightedAvgPct > 3 || throttledCount > 0);

  const severity =
    weightedAvgPct > 3 || throttledCount > 0 ? 'destructive' : 'secondary';

  if (!show) return null;

  return (
    <div
      role="alert"
      className={`sticky top-0 z-50 w-full border-b ${
        severity === 'destructive'
          ? 'bg-red-600/10 border-red-600/40 text-red-800'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-800'
      } backdrop-blur supports-[backdrop-filter]:bg-opacity-75`}
    >
      <div className="mx-auto max-w-screen-2xl px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className={`h-5 w-5 ${
            severity === 'destructive' ? 'text-red-600' : 'text-amber-600'
          }`} />
          <div className="text-sm">
            <div className="font-medium">
              Atención: Auto-Protección activada
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Abandono ponderado:&nbsp;
                <Badge
                  variant={weightedAvgPct > 3 ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {weightedAvgPct.toFixed(2)}%
                </Badge>
              </span>
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                Campañas limitadas:&nbsp;
                <Badge variant="secondary" className="text-[10px]">{throttledCount}</Badge>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAbandonment}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => onNavigate('reports')}
          >
            Ver tendencias
          </Button>
          <Button variant="ghost" size="icon" onClick={mute30min} title="Silenciar 30 min">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
