
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';

type Point = {
  bucket_start: string;     // ISO
  answered: number;
  abandoned: number;
  abandonment_pct: number;  // 0..100
};
type ApiResp = {
  window: string;
  bucket: string;
  campaign_id: number | null;
  points: Point[];
};

export default function AbandonmentTrend() {
  const { authedFetch } = useAuth();
  const API = process.env.NEXT_PUBLIC_API || '';

  const [campaignId, setCampaignId] = useState<string>(''); // vacío => todas
  const [hours, setHours] = useState<'1' | '6' | '24' | '72'>('6');
  const [bucket, setBucket] = useState<'1m' | '5m' | '15m' | '60m'>('5m');
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function fetchData() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('hours', hours);
      params.set('bucket', bucket);
      if (campaignId) params.set('campaign_id', campaignId);

      const r = await authedFetch(`${API}/api/reports/abandonment/timeseries?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json: ApiResp = await r.json();
      setData(Array.isArray(json.points) ? json.points : []);
    } catch (e: any) {
      setErr(e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, hours, bucket]);

  const chartData = useMemo(() => {
    return (data || []).map(p => ({
      t: new Date(p.bucket_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      answered: p.answered,
      abandoned: p.abandoned,
      pct: Number(p.abandonment_pct || 0),
    }));
  }, [data]);

  const latestPct = chartData.length ? chartData[chartData.length - 1].pct : 0;

  function badgeVariant(p: number): 'default' | 'secondary' | 'destructive' {
    if (p > 3) return 'destructive';
    if (p >= 2) return 'secondary';
    return 'default';
  }

  function exportCSV() {
    const rows = [
      ['timestamp', 'answered', 'abandoned', 'abandonment_pct'],
      ...data.map(p => [p.bucket_start, String(p.answered), String(p.abandoned), String(p.abandonment_pct)]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `abandonment-trend-${hours}h-${bucket}-${ts}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          <span>Tendencia de Abandono (Safe Harbor)</span>
          <div className="flex items-center gap-2">
            <Input
              placeholder="ID de campaña (vacío = todas)"
              className="w-[220px]"
              value={campaignId}
              onChange={(e)=>setCampaignId(e.target.value)}
            />
            <Select value={hours} onValueChange={(v: any)=>setHours(v)}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Horas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1h</SelectItem>
                <SelectItem value="6">6h</SelectItem>
                <SelectItem value="24">24h</SelectItem>
                <SelectItem value="72">72h</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bucket} onValueChange={(v: any)=>setBucket(v)}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Bucket" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1 min</SelectItem>
                <SelectItem value="5m">5 min</SelectItem>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="60m">60 min</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchData}>Refresh</Button>
            <Button onClick={exportCSV}>Export CSV</Button>
          </div>
        </CardTitle>
        {loading && <div className="text-sm text-muted-foreground">Cargando…</div>}
        {!loading && err && <div className="text-sm text-red-600">Error: {err}</div>}
        {!loading && !err && chartData.length === 0 && (
          <div className="text-sm text-muted-foreground">Sin datos para mostrar.</div>
        )}
        {!loading && !err && chartData.length > 0 && (
          <div className="text-sm">
            Estado actual:&nbsp;
            <Badge variant={badgeVariant(latestPct)}>{latestPct.toFixed(2)}%</Badge>
          </div>
        )}
      </CardHeader>

      {!loading && !err && chartData.length > 0 && (
        <CardContent style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" />
              <YAxis yAxisId="left" orientation="left" domain={[0, 'auto']} tickFormatter={(v)=>`${v}%`} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} />
              <Tooltip />
              <Legend />
              {/* Líneas de referencia 2% y 3% */}
              <ReferenceLine yAxisId="left" y={2} strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={3} strokeDasharray="4 4" />
              {/* % Abandono */}
              <Line yAxisId="left" type="monotone" dataKey="pct" name="% Abandono" dot={false} />
              {/* Contestadas para contexto */}
              <Bar yAxisId="right" dataKey="answered" name="Contestadas" barSize={22} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-3">
            * La serie se calcula sobre contestadas (200 OK) y las marcadas con <code>safe_harbor=true</code>.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
