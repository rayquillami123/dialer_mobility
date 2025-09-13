'use client';

import { useAuth } from '@/hooks/useAuth';
import RequireRole from '@/components/RequireRole';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import DialerSidebar from '@/components/dialer/DialerSidebar';
import DialerHeader from '@/components/dialer/DialerHeader';
import GlobalAlertBar from '@/components/GlobalAlertBar';
import { useSidebarStore } from '@/store/sidebar';

function DialerLayoutContent({ children }: { children: React.ReactNode }) {
  const setActiveSection = useSidebarStore(s => s.setActiveSection);
  return (
    <SidebarProvider>
      <GlobalAlertBar onNavigate={setActiveSection} />
      <div className="flex">
        <Sidebar>
          <DialerSidebar />
        </Sidebar>
        <SidebarInset className="flex flex-col">
          <DialerHeader />
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default function DialerLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <RequireRole roles={['admin', 'supervisor', 'agent', 'viewer']}>
      <DialerLayoutContent>{children}</DialerLayoutContent>
    </RequireRole>
  );
}
