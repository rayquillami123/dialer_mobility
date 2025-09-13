
'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Home,
  Settings,
  Users,
  Briefcase,
  Zap,
  LayoutGrid,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/store/sidebar';
import { Logo } from '@/components/icons';

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/trunks', label: 'Trunks', icon: Briefcase },
  { href: '/integrations', label: 'Integrations', icon: Zap },
];

const adminNav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function DialerSidebar() {
  const pathname = usePathname();
  const activeSection = useSidebarStore((s) => s.activeSection);
  const setActiveSection = useSidebarStore((s) => s.setActiveSection);

  const isActive = (href: string) => {
    return pathname === href || activeSection === href.replace('/', '');
  };

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Logo className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold">Dialer</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {mainNav.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  isActive={isActive(item.href)}
                  onClick={() => setActiveSection(item.href.replace('/', ''))}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarGroup>
          <Separator className="my-2" />
          <SidebarMenu>
            {adminNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={isActive(item.href)}
                    onClick={() => setActiveSection(item.href.replace('/', ''))}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost">Footer Action</Button>
      </SidebarFooter>
    </>
  );
}
