'use client';
import type { Campaign } from '@/lib/types';
import { useDialerStore } from '@/store/dialer';
import Dashboard from '@/components/dialer/Dashboard';

function DialerInteligenteMain() {
  const { campaigns } = useDialerStore();

  return <Dashboard campaigns={campaigns as Campaign[]} />;
}

export default function DashboardPage() {
  return <DialerInteligenteMain />;
}
