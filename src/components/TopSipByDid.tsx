'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type TopSipRow = {
  did_id: number | null;
  sip_code: string;
  n: number;
};

type TopSipResponse = { window: string; rows: TopSipRow[] };

type DidHealthItem = {
  id: number;
  e164: string;
  state: string | null;
  daily_cap: number | null;
  score: number | null;
  calls_total: number | null;
  unique_numbers: number | null;
  human: number | null;
  voicemail: number | null;
  fax: number | null;
  sit: number | null;
  reached_cap: boolean | null;
};
type DidHealthResponse = { items: DidHealthItem[] };

type SortKey = 'did' | 'state' | 'code' | 'count' | 'pct';

export default function TopSipByDid() {
  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

  const [windowVal, setWindowVal] = useState<'15m' | '60m' | '1d'>('15m');
  const [rows, setRows] = useState<TopSipRow[]>([]);
  const [dids, setDids] = useState<DidHealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  async function fetchAll() {
    setLoading(true);
    setErr('');
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API}/api/dids/top-sip?window=${windowVal}`, {
          headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
          cache: 'no-store',
        }),
        fetch(`${API}/api/dids/health`, {
          headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
          cache: 'no-store',
        }),
      ]);
      if (!r1.ok) throw new Error(`TopSIP HTTP ${r1.status}`);
      if (!r2.ok) throw new Error(`DIDs HTTP ${r2.status}`);

      const data1: TopSipResponse = await r1.json();
      const data2: DidHealthResponse = await r2.json();
      setRows(Array.isArray(data1.rows) ? data1.rows : []);
      setDids(Array.isArray(data2.items) ? data2.items : []);
    } catch (e: any) {
      setErr(e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowVal]);

  const didMap = useMemo(() => {
    const m = new Map<number, DidHealthItem>();
    dids.forEach(d => m.set(d.id, d));
    return m;
  }, [dids]);

  // Totales por DID para calcular %
  const totalsByDid = useMemo(() => {
    const t = new Map<number | null, number>();
    rows.forEach(r => {
      const key = r.did_id ?? -1;
      t.set(key, (t.get(key) || 0) + Number(r.n || 0));
    });
    return t;
  }, [rows]);

  // Enriquecemos filas con e164/state y % por DID
  type Enriched = TopSipRow & { e164: string; state: string; pct: number };
  const enriched: Enriched[] = useMemo(() => {
    return rows.map(r => {
      const meta = r.did_id ? didMap.get(r.did_id) : undefined;
      const total = totalsByDid.get(r.did_id ?? -1) || 0;
      const pct = total > 0 ? (Number(r.n) / total) * 100 : 0;
      return {
        ...r,
        e164: meta?.e164 || (r.did_id ? `DID#${r.did_id}` : '—'),
        state: meta?.state || '—',
        pct,
      };
    });
  }, [rows, didMap, totalsByDid]);

  // Filtro de búsqueda (DID, estado, código)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(r =>
      r.e164.toLowerCase().includes(q) ||
      r.state.toLowerCase().includes(q) ||
      r.sip_code.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  // Ordenamiento
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let A: string | number = 0, B: string | number = 0;
      switch (sortKey) {
        case 'did':   A = a.e164; B = b.e164; break;
        case 'state': A = a.state; B = b.state; break;
        case 'code':  A = a.sip_code; B = b.sip_code; break;
        case 'count': A = a.n; B = b.n; break;
        case 'pct':   A = a.pct; B = b.pct; break;
      }
      if (typeof A === 'string' && typeof B === 'string') {
        const cmp = A.localeCompare(B, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const cmp = Number(A) - Number(B);
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

  function exportCSV() {
    const rowsCSV = [
      ['DID', 'Estado', 'SIP code', 'Conteo', 'Porcentaje', 'Ventana'],
      ...sorted.map(r => [
        r.e164,
        r.state,
        r.sip_code,
        String(r.n),
        `${r.pct.toFixed(2)}%`,
        windowVal,
      ]),
    ];
    const csv = rowsCSV.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `top-sip-by-did-${windowVal}-${ts}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function codeBadgeVariant(code: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    // Sugerencia visual rápida
    if (/^5\d\d$/.test(code)) return 'destructive'; // 5xx
    if (/^4\d\d$/.test(code)) return 'secondary';   // 4xx
    if (code === '200') return 'default';           // ok
    return 'outline';
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          <span>Top SIP por DID</span>
          <div className="flex items-center gap-2">
            <Select value={windowVal} onValueChange={(v: any)=>setWindowVal(v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Ventana" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="60m">60 min</SelectItem>
                <SelectItem value="1d">1 día</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar DID, estado o código…"
              className="w-[260px]"
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
            <Button variant="outline" onClick={fetchAll}>Refresh</Button>
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
                  <TableHead className="whitespace-nowrap">{th('DID', 'did')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('Estado', 'state')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('Código SIP', 'code')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('Conteo', 'count')}</TableHead>
                  <TableHead className="whitespace-nowrap">{th('% por DID', 'pct')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => (
                  <TableRow key={`${r.did_id ?? 'null'}-${r.sip_code}-${i}`}>
                    <TableCell className="font-mono">{r.e164}</TableCell>
                    <TableCell>{r.state}</TableCell>
                    <TableCell>
                      <Badge variant={codeBadgeVariant(r.sip_code)}>{r.sip_code}</Badge>
                    </TableCell>
                    <TableCell>{r.n}</TableCell>
                    <TableCell>{r.pct.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              * El porcentaje se calcula sobre el total de códigos por cada DID en la ventana seleccionada.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
