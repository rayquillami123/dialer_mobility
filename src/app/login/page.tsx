
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage(){
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [err, setErr]     = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent){
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, pass);
      router.push('/'); // al dashboard
    } catch (e:any) {
      setErr(e?.message || 'Error de login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Input
                type="email"
                placeholder="email@dominio.com"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <PasswordInput
                placeholder="••••••••"
                value={pass}
                onChange={(e)=>setPass(e.target.value)}
                required
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <Button className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center text-sm">
          <Link href="/forgot-password" className="w-full text-blue-600 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
