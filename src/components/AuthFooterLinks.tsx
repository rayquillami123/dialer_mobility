'use client';

export default function AuthFooterLinks() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
      <div className="space-x-3">
        <a className="underline" href="/forgot-password">¿Olvidaste tu contraseña?</a>
        <a className="underline" href="/accept-invite">Aceptar invitación</a>
      </div>
      <div className="space-x-3">
        <a className="underline" href="/legal/terms">Términos</a>
        <a className="underline" href="/legal/privacy">Privacidad</a>
      </div>
    </div>
  );
}
