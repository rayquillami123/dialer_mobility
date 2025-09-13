'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import SessionStatusBadge from '@/components/SessionStatusBadge';

export default function DialerHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <h1 className="text-lg font-semibold sm:text-xl">Dialer</h1>
      </div>
      <div className="flex items-center gap-2">
        <SessionStatusBadge />
      </div>
    </header>
  );
}
