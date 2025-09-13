'use client';
import type { SectionId, Campaign, LeadList, Trunk, Schedule } from '@/lib/types';

import { useAuth } from '@/hooks/useAuth';
import RequireRole from '@/components/RequireRole';
import { useDialerStore } from '@/store/dialer';
import { useDialerWS } from '@/hooks/useDialerWS';

import Dashboard from '@/components/dialer/Dashboard';
import Campaigns from '@/components/dialer/Campaigns';
import Lists from '@/components/dialer/Lists';
import Realtime from '@/components/dialer/Realtime';
import Dispositions from '@/components/dialer/Dispositions';
import Scheduler from '@/components/dialer/Scheduler';
import TrunksSettings from '@/components/dialer/TrunksSettings';
import ComplianceCenter from '@/components/dialer/ComplianceCenter';
import ScriptsDesigner from '@/components/dialer/ScriptsDesigner';
import QARecordings from '@/components/dialer/QARecordings';
import Integrations from '@/components/dialer/Integrations';
import AuditLog from '@/components/dialer/AuditLog';
import Reports from '@/components/dialer/Reports';
import UsersPage from '@/app/admin/users/page';
import SettingsPage from '@/components/dialer/SettingsPage';
import { useSidebarStore } from '@/store/sidebar';

function DialerInteligenteMain() {
  const { onKpi, onCall, onAgent, onQueue } = useDialerStore();

  useDialerWS((data) => {
    try {
      if (data.type === 'kpi.tick') onKpi(data);
      else if (data.type === 'call.update') onCall(data);
      else if (data.type === 'agent.update') onAgent(data);
      else if (data.type === 'queue.update') onQueue(data);
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  const activeSection = useSidebarStore(s => s.activeSection);
  const {campaigns, lists, trunks, schedules, setCampaigns, setLists, setTrunks, setSchedules} = useDialerStore();

  const allCalls = useDialerStore((s) => Object.values(s.calls));

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return <Dashboard campaigns={campaigns} />;
      case 'campaigns': return <Campaigns campaigns={campaigns} setCampaigns={setCampaigns} lists={lists} trunks={trunks} schedules={schedules} />;
      case 'lists': return <Lists lists={lists} setLists={setLists} />;
      case 'realtime': return <Realtime />;
      case 'dispositions': return <Dispositions />;
      case 'scheduler': return <Scheduler schedules={schedules} setSchedules={setSchedules} />;
      case 'providers': return <TrunksSettings trunks={trunks} setTrunks={setTrunks} />;
      case 'compliance': return <ComplianceCenter />;
      case 'scripts': return <ScriptsDesigner />;
      case 'audio': return <div>Audio Library</div>;
      case 'qa': return <QARecordings />;
      case 'integrations': return <Integrations />;
      case 'audit': return <AuditLog />;
      case 'reports': return <Reports allCalls={allCalls} campaigns={campaigns} />;
      case 'users': return <UsersPage />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard campaigns={campaigns} />;
    }
  }

  return <main className="p-4 sm:p-6 lg:p-8">{renderSection()}</main>;
}

export default function DialerInteligenteApp() {
  return (
    <RequireRole roles={['admin', 'supervisor', 'agent', 'viewer']}>
      <DialerInteligenteMain />
    </RequireRole>
  );
}
