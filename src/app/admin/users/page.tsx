'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import RequireRole from '@/components/RequireRole';
import { useAuth } from '@/hooks/useAuth';

type UserRow = { id:number; email:string; name:string|null; is_active:boolean; roles:string[]; created_at:string };

export default function UsersPage(){
  return (
    <RequireRole roles={['admin']}>
      <UsersInner />
    </RequireRole>
  );
}

function UsersInner(){
  const API = process.env.NEXT_PUBLIC_API || '';
  const { authedFetch } = useAuth();
  const [items,setItems]=useState<UserRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [email,setEmail]=useState('');
  const [role,setRole]=useState<'viewer'|'agent'|'supervisor'|'admin'>('viewer');
  const [link,setLink]=useState<string>('');

  async function load() {
    setLoading(true); setErr('');
    try{
      const r = await authedFetch(`${API}/api/users`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setItems(j.items||[]);
    }catch(e:any){ setErr(e?.message||'Error'); } finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */},[]);

  async function invite(){
    setLink('');
    try{
      const r = await authedFetch(`${API}/api/users/invite`, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ email, roles:[role], ttl_hours:48 })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error||`HTTP ${r.status}`);
      setLink(j.link);
      setEmail('');
      await load();
    }catch(e:any){ alert(e?.message||'Error'); }
  }

  return (
    <Card className="m-6">
      <CardHeader>
        <CardTitle>Usuarios del Tenant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <Input placeholder="email@dominio.com" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-64" />
          <Select value={role} onValueChange={(v:any)=>setRole(v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">viewer</SelectItem>
              <SelectItem value="agent">agent</SelectItem>
              <SelectItem value="supervisor">supervisor</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={!email}>Invitar</Button>
          {link && <a className="text-xs underline ml-2" href={link} target="_blank" rel="noreferrer">Link de invitación</a>}
        </div>

        {loading && <div className="text-sm text-muted-foreground">Cargando…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}

        {!loading && !err && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(u=>(
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell className="font-mono">{u.email}</TableCell>
                    <TableCell>{u.name||'—'}</TableCell>
                    <TableCell className="space-x-1">
                      {u.roles?.map(r=><Badge key={r} variant="secondary">{r}</Badge>)}
                    </TableCell>
                    <TableCell>{u.is_active ? <Badge>activo</Badge> : <Badge variant="secondary">inactivo</Badge>}</TableCell>
                    <TableCell className="text-xs">{new Date(u.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
