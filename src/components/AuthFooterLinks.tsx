'use client';

import Link from 'next/link';

export default function AuthFooterLinks() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
      <div className="space-x-3">
        <Link className="underline" href="/forgot-password">¿Olvidaste tu contraseña?</Link>
        <Link className="underline" href="/accept-invite">Aceptar invitación</Link>
      </div>
      <div className="space-x-3">
        <a className="underline" href="/legal/terms">Términos</a>
        <a className="underline" href="/legal/privacy">Privacidad</a>
      </div>
    </div>
  );
}
