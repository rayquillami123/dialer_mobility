
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

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

type ApiResponse = { items: DidHealthItem[] };

type SortKey =
  | 'e164'
  | 'state'
  | 'calls_total'
  | 'unique_numbers'
  | 'human'
  | 'voicemail'
  | 'fax'
  | 'sit'
  | 'daily_cap'
  | 'util';

export default function DIDHealth() {
  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

  const [items, setItems] = useState<DidHealthItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('state');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  async function fetchHealth() {
    try {
      setLoading(true);
      setError('');
      const r = await fetch(`${API}/api/dids/health`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: ApiResponse = await r.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const byState = stateFilter === 'ALL' || (it.state || '') === stateFilter;
      const bySearch =
        !q ||
        it.e164?.toLowerCase().includes(q) ||
        (it.state || '').toLowerCase().includes(q);
      return byState && bySearch;
    });
  }, [items, search, stateFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const utilA = utilization(a);
      const utilB = utilization(b);

      const val = (key: SortKey, x: DidHealthItem) => {
        switch (key) {
          case 'e164':
            return x.e164 || '';
          case 'state':
            return x.state || '';
          case 'calls_total':
            return x.calls_total ?? -1;
          case 'unique_numbers':
            return x.unique_numbers ?? -1;
          case 'human':
            return x.human ?? -1;
          case 'voicemail':
            return x.voicemail ?? -1;
          case 'fax':
            return x.fax ?? -1;
          case 'sit':
            return x.sit ?? -1;
          case 'daily_cap':
            return x.daily_cap ?? -1;
          case 'util':
            return utilA; // placeholder; lo reemplazamos abajo
        }
      };

      let A = val(sortKey, a);
      let B = val(sortKey, b);

      if (sortKey === 'util') {
        A = utilA;
        B = utilB;
      }

      if (typeof A === 'string' && typeof B === 'string') {
        return sortDir === 'asc' ? A.localeCompare(B) : B.localeCompare(A);
      }
      return sortDir === 'asc' ? (Number(A) - Number(B)) : (Number(B) - Number(A));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function utilization(it: DidHealthItem): number {
    const total = Number(it.calls_total ?? 0);
    const cap = Number(it.daily_cap ?? 0);
    if (!cap || cap <= 0) return 0;
    return Math.min(1, total / cap);
  }

  function utilLabel(it: DidHealthItem) {
    const u = utilization(it);
    return `${Math.round(u * 100)}%`;
  }

  function utilVariant(it: DidHealthItem): 'default' | 'destructive' | 'secondary' | 'outline' {
    if (it.reached_cap) return 'destructive'; // rojo
    const u = utilization(it);
    if (u >= 0.9) return 'destructive';
    if (u >= 0.7) return 'secondary'; // ámbar
    return 'default'; // verde
    // Nota: variant depende de tu tema shadcn; ajusta si usas otros estilos
  }

  function headerCell(label: string, key: SortKey) {
    const active = sortKey === key;
    const dir = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
    return (
      <Button
        variant="ghost"
        size="sm"
        className="px-1"
        onClick={() => {
          if (active) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          else {
            setSortKey(key);
            setSortDir('asc');
          }
        }}
        title={`Ordenar por ${label}`}
      >
        {label} {dir}
      </Button>
    );
  }

  function exportCSV() {
    const rows = [
      [
        'DID',
        'Estado',
        'Llamadas hoy',
        'Números únicos',
        'Human',
        'Voicemail',
        'FAX',
        'SIT',
        'Cap diario',
        'Utilización',
        'Alcanzó cap',
        'Score',
      ],
      ...sorted.map((it) => [
        it.e164,
        it.state || '',
        String(it.calls_total ?? 0),
        String(it.unique_numbers ?? 0),
        String(it.human ?? 0),
        String(it.voicemail ?? 0),
        String(it.fax ?? 0),
        String(it.sit ?? 0),
        String(it.daily_cap ?? 0),
        utilLabel(it),
        String(Boolean(it.reached_cap)),
        String(it.score ?? ''),
      ]),
    ];

    const csv = rows
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `did-health-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const statesAvailable = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => it.state && set.add(it.state));
    return Array.from(set).sort();
  }, [items]);

  return (
    <Card className="p-0">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between">
          <span>DID Health (hoy)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchHealth}>Refresh</Button>
            <Button onClick={exportCSV}>Export CSV</Button>
          </div>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select value={stateFilter} onValueChange={(v) => setStateFilter(v)}>
              <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {statesAvailable.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Buscar por DID o estado…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="text-sm text-muted-foreground p-6">Cargando datos…</div>
        )}
        {!loading && error && (
          <div className="text-sm text-red-600 p-6">Error: {error}</div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div className="text-sm text-muted-foreground p-6">Sin datos para mostrar.</div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{headerCell('DID', 'e164')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Estado', 'state')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Llamadas', 'calls_total')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Únicos', 'unique_numbers')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Human', 'human')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Voicemail', 'voicemail')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('FAX', 'fax')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('SIT', 'sit')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Cap diario', 'daily_cap')}</TableHead>
                  <TableHead className="whitespace-nowrap">{headerCell('Utilización', 'util')}</TableHead>
                  <TableHead className="whitespace-nowrap">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((it) => {
                  const u = utilization(it);
                  const reached = Boolean(it.reached_cap);
                  const nearCap = !reached && u >= 0.9;
                  const badgeVariant = utilVariant(it);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono">{it.e164}</TableCell>
                      <TableCell>{it.state || '—'}</TableCell>
                      <TableCell>{it.calls_total ?? 0}</TableCell>
                      <TableCell>{it.unique_numbers ?? 0}</TableCell>
                      <TableCell>{it.human ?? 0}</TableCell>
                      <TableCell>{it.voicemail ?? 0}</TableCell>
                      <TableCell>{it.fax ?? 0}</TableCell>
                      <TableCell>{it.sit ?? 0}</TableCell>
                      <TableCell>{it.daily_cap ?? '—'}</TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <div className="w-32">
                            <Progress value={u * 100} aria-label="Utilización del DID" />
                          </div>
                          <span className="text-xs text-muted-foreground">{utilLabel(it)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {reached ? (
                          <Badge variant={badgeVariant}>Cap alcanzado</Badge>
                        ) : nearCap ? (
                          <Badge variant={badgeVariant}>Cerca del tope</Badge>
                        ) : (
                          <Badge variant={badgeVariant}>OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              * Las métricas reflejan el día actual. Asegúrate de que el backend alimente <code>did_usage</code> correctamente.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
