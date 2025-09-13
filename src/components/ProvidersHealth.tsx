
'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/useAuth';

type HealthItem = {
    trunk_id: number;
    trunk_name: string;
    total_calls: number;
    asr: number;
    p50_pdd_ms: number;
    p90_pdd_ms: number;
    sip_mix: Record<string, number> | null;
};

export default function ProvidersHealth() {
    const { authedFetch } = useAuth();
    const API = process.env.NEXT_PUBLIC_API || '';
    const [health, setHealth] = useState<HealthItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function fetchHealth() {
        setLoading(true);
        setError('');
        try {
            const r = await authedFetch(`${API}/api/providers/health`);
            if (!r.ok) throw new Error(`HTTP error ${r.status}`);
            const data = await r.json();
            setHealth(data);
        } catch (e: any) {
            setError(e.message || 'Failed to fetch health data');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchHealth();
         // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const codeBadgeVariant = (code: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
        if (code.startsWith('5')) return 'destructive';
        if (code.startsWith('4')) return 'secondary';
        if (code.startsWith('6')) return 'destructive';
        return 'outline';
    };

    return (
        <Card className="shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    Salud de Proveedores (últimos 15 min)
                    <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
                        {loading ? 'Cargando...' : 'Refrescar'}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}
                {error && <p className="text-sm text-red-600">Error: {error}</p>}
                {health && health.length === 0 && <p className="text-sm text-muted-foreground">No hay datos de proveedores para mostrar.</p>}
                {health && health.length > 0 && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Troncal</TableHead>
                                <TableHead>ASR</TableHead>
                                <TableHead>PDD p50</TableHead>
                                <TableHead>PDD p90</TableHead>
                                <TableHead>SIP Mix</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {health.map((item: HealthItem) => (
                                <TableRow key={item.trunk_id}>
                                    <TableCell>{item.trunk_name} ({item.trunk_id})</TableCell>
                                    <TableCell>{(item.asr * 100).toFixed(1)}%</TableCell>
                                    <TableCell>{item.p50_pdd_ms || 'N/A'} ms</TableCell>
                                    <TableCell>{item.p90_pdd_ms || 'N/A'} ms</TableCell>
                                    <TableCell className="flex flex-wrap gap-1">
                                        {item.sip_mix && Object.entries(item.sip_mix)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([code, count]) => (
                                                <Badge key={code} variant={codeBadgeVariant(code)} className="font-mono">
                                                    {code}: {count}
                                                </Badge>
                                            ))}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
