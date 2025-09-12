
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';

type Row = {
  campaign_id: number | null;
  total_answered: number;
  abandoned_safeharbor: number;
  abandonment_pct: number; // 0..100
};
type ApiResp = { window: string; items: Row[] };

type SortKey = 'campaign' | 'answered' | 'abandoned' | 'pct';

export default function AbandonmentReport() {
  const { authedFetch } = useAuth();
  const API = process.env.NEXT_PUBLIC_API || '';

  const [windowVal, setWindowVal] = useState<'15m' | '60m' | '1d' | '7d'>('1d');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  async function fetchData() {
    setLoading(true);
    setErr('');
    try {
      const r = await authedFetch(`${API}/api/reports/abandonment?window=${windowVal}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: ApiResp = await r.json();

      // Normaliza y protege tipos faltantes
      const items = (data.items || []).map((x: any) => ({
        campaign_id: Number(x.campaign_id ?? 0) || 0,
        total_answered: Number(x.total_answered ?? 0),
        abandoned_safeharbor: Number(x.abandoned_safeharbor ?? 0),
        abandonment_pct: Number(x.abandonment_pct ?? 0),
      })) as Row[];

      setRows(items);
    } catch (e: any) {
      setErr(e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowVal]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => String(r.campaign_id).toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let A: number | string = 0, B: number | string = 0;
      switch (sortKey) {
        case 'campaign':  A = a.campaign_id ?? 0; B = b.campaign_id ?? 0; break;
        case 'answered':  A = a.total_answered;   B = b.total_answered;   break;
        case 'abandoned': A = a.abandoned_safeharbor; B = b.abandoned_safeharbor; break;
        case 'pct':       A = a.abandonment_pct;  B = b.abandonment_pct;  break;
      }
      const cmp = (typeof A === 'string' && typeof B === 'string')
        ? A.localeCompare(B, undefined, { numeric: true })
        : Number(A) - Number(B);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function th(label: string, key: SortKey) {
    const active = sortKey === key;
    const dir = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
    return (
      <Button
        variant="ghost"
        size="sm"
        className="px-1"
        onClick={() => {
          if (active) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          else { setSortKey(key); setSortDir('desc'); }
        }}
        title={`Ordenar por ${label}`}
      >
        {label} {dir}
      </Button>
    );
  }

  function badgeVariant(pct: number): 'default' | 'secondary' | 'destructive' {
    if (pct > 3) return 'destructive';     // rojo
    if (pct >= 2) return 'secondary';      // ámbar
    return 'default';                      // verde
  }

  function exportCSV() {
    const rowsCSV = [
      ['Campaña', 'Contestadas', 'Abandonadas (2s)', '% Abandono', 'Ventana'],
      ...sorted.map(r => [
        String(r.campaign_id ?? ''),
        String(r.total_answered),
        String(r.abandoned_safeharbor),
        `${r.abandonment_pct.toFixed(2)}%`,
        windowVal,
      ]),
    ];
    const csv = rowsCSV.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `abandonment-${windowVal}-${ts}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          <span>Abandono por Campaña (Safe Harbor)</span>
          <div className="flex items-center gap-2">
            <Select value={windowVal} onValueChange={(v: any)=>setWindowVal(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Ventana" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="60m">60 min</SelectItem>
                <SelectItem value="1d">1 día</SelectItem>
                <SelectItem value="7d">7 días</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar campaña…"
              className="w-[220px]"
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
            <Button variant="outline" onClick={fetchData}>Refresh</Button>
            <Button onClick={exportCSV}>Export CSV</Button>
          </div>
        </CardTitle>
        {loading && <div className="text-sm text-muted-foreground">Cargando…</div>}
        {!loading && err && <div className="text-sm text-red-600">Error: {err}</div>}
        {!loading && !err && sorted.length === 0 && (
          <div className="text-sm text-muted-foreground">Sin datos para mostrar.</div>
        )}
      </CardHeader>

      {!loading && !err && sorted.length > 0 && (
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{th('Campaña', 'campaign')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('Contestadas', 'answered')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('Abandonadas (≤2s)', 'abandoned')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('% Abandono', 'pct')}</TableHead>
                  <TableHead className="whitespace-nowrap">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => {
                  const pct = Number(r.abandonment_pct || 0);
                  const variant = badgeVariant(pct);
                  return (
                    <TableRow key={`${r.campaign_id}-${i}`}>
                      <TableCell className="font-mono">{r.campaign_id ?? '—'}</TableCell>
                      <TableCell>{r.total_answered}</TableCell>
                      <TableCell>{r.abandoned_safeharbor}</TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <div className="w-32">
                            <Progress value={Math.max(0, Math.min(100, pct))} aria-label="% abandono" />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct.toFixed(2)}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={variant}>
                        {pct > 3 ? 'Fuera de rango' : pct >= 2 ? 'Atención' : 'OK'}
                      </Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              * Medición aproximada basada en el evento de Safe Harbor (≤ 2s). Ajusta la fuente si cambias la lógica.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
