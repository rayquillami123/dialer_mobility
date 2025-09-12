
'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function RequireRole({
  roles,
  children,
}: { roles: string[]; children: ReactNode }) {
  const { user, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (!user) {
        try { await refresh(); }
        catch { router.replace('/login'); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null; // or a loading spinner
  const allowed = roles.some(r => user.roles.includes(r));
  if (!allowed) {
    if (typeof window !== 'undefined') router.replace('/'); // or /403
    return null;
  }
  return <>{children}</>;
}
