'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const API = process.env.NEXT_PUBLIC_API || '';
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/forgot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg('Si el correo existe, recibirás un enlace para restablecer la contraseña.');
    } catch {
      setMsg('Si el correo existe, recibirás un enlace para restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="email"
              placeholder="email@dominio.com"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
            />
            {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
            <Button className="w-full" disabled={loading || !email}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
