'use client';

import { useEffect, useMemo, useState } from 'react';
import { decodeJwt } from '@/lib/jwt';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';

function fmt(mm: number, ss: number) {
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function SessionStatusBadge() {
  const { user, accessToken, refresh, logout } = useAuth();
  const [now, setNow] = useState(Date.now());

  // tick cada segundo para countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { mmLeft, ssLeft } = useMemo(() => {
    if (!accessToken) return { mmLeft: 0, ssLeft: 0 };
    const p: any = decodeJwt(accessToken);
    const expMs = p?.exp ? p.exp * 1000 : now;
    const left = Math.max(0, Math.floor((expMs - now) / 1000));
    return { mmLeft: Math.floor(left / 60), ssLeft: left % 60 };
  }, [accessToken, now]);

  if (!user) return null;

  const roles = user.roles?.length ? user.roles.join(', ') : '—';
  const variant = mmLeft < 1 ? 'destructive' : mmLeft < 5 ? 'secondary' : 'default';

  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant} className="font-mono">
        {fmt(mmLeft, ssLeft)}
      </Badge>
      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
        <span className="truncate max-w-[180px]">{user.email}</span>
        <span>·</span>
        <span className="truncate max-w-[160px]">{roles}</span>
      </div>
      <Button variant="outline" size="sm" onClick={() => refresh()} title="Renovar ahora">
        <RefreshCw className="h-4 w-4 mr-1" /> Renovar
      </Button>
      <Button variant="ghost" size="icon" onClick={() => logout()} title="Cerrar sesión">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
