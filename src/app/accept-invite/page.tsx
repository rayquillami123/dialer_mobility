'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PasswordInput from '@/components/PasswordInput';

function AcceptInvite() {
  const API = process.env.NEXT_PUBLIC_API || '';
  const router = useRouter();
  const sp = useSearchParams();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = sp.get('token') || '';
    setToken(t);
  }, [sp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!token) { setErr('Falta el token de invitación.'); return; }
    if (pass.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (pass !== pass2) { setErr('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/accept-invite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name, password: pass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOk(true);
      setTimeout(() => router.push('/login'), 1200);
    } catch (e:any) {
      const msg = String(e?.message || 'Error al aceptar invitación');
      setErr(msg === 'invalid_or_used' ? 'El enlace ya fue usado o no es válido.' :
             msg === 'expired' ? 'El enlace de invitación expiró.' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Aceptar invitación</CardTitle>
        </CardHeader>
        <CardContent>
          {!token && (
            <div className="text-sm text-red-600 mb-4">
              Falta el parámetro <span className="font-mono">token</span> en la URL.
            </div>
          )}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="text-sm">Nombre (opcional)</label>
              <Input
                placeholder="Tu nombre"
                value={name}
                onChange={(e)=>setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Contraseña</label>
              <PasswordInput placeholder="••••••••" value={pass} onChange={(e)=>setPass(e.target.value)} />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm">Confirmar contraseña</label>
              <PasswordInput placeholder="••••••••" value={pass2} onChange={(e)=>setPass2(e.target.value)} />
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}
            {ok && <div className="text-sm text-green-600">¡Invitación aceptada! Redirigiendo…</div>}

            <Button className="w-full" disabled={loading || !token}>
              {loading ? 'Guardando…' : 'Crear cuenta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <AcceptInvite />
    </Suspense>
  );
}
