
'use client';

import { useState } from 'react';
import { useSidebarStore } from '@/store/sidebar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DashboardAutoProtect from '@/components/DashboardAutoProtect';
import AbandonmentReport from '@/components/AbandonmentReport';
import AbandonmentTrend from '@/components/AbandonmentTrend';
import ProvidersHealth from '@/components/ProvidersHealth';
import DIDHealth from '@/components/DIDHealth';
import TopSipByDid from '@/components/TopSipByDid';

// Mock data for campaigns
const mockCampaigns = [
    { id: 1, name: 'Ventas Q1' },
    { id: 2, name: 'Marketing MX' },
    { id: 3, name: 'Soporte US' },
];

export default function Dashboard({ campaigns = mockCampaigns }: { campaigns: { id: number, name: string }[] }) {
    const activeSection = useSidebarStore(s => s.activeSection);
    const setActiveSection = useSidebarStore(s => s.setActiveSection);

    const campaignIds = campaigns.map(c => c.id);
    const campaignLabels = campaigns.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});

    return (
        <main className="flex-1 p-6 space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>

            <DashboardAutoProtect campaignIds={campaignIds} campaignLabels={campaignLabels} columns={3} />

            <Tabs defaultValue="abandonment" className="w-full">
                <TabsList>
                    <TabsTrigger value="abandonment">Reporte de Abandono</TabsTrigger>
                    <TabsTrigger value="trend">Tendencia de Abandono</TabsTrigger>
                    <TabsTrigger value="providers">Salud de Proveedores</TabsTrigger>
                    <TabsTrigger value="dids">Salud de DIDs</TabsTrigger>
                    <TabsTrigger value="top-sip">Top SIP por DID</TabsTrigger>
                </TabsList>
                <TabsContent value="abandonment" className="mt-4">
                    <AbandonmentReport />
                </TabsContent>
                <TabsContent value="trend" className="mt-4">
                    <AbandonmentTrend />
                </TabsContent>
                <TabsContent value="providers" className="mt-4">
                    <ProvidersHealth />
                </TabsContent>
                <TabsContent value="dids" className="mt-4">
                    <DIDHealth />
                </TabsContent>
                <TabsContent value="top-sip" className="mt-4">
                    <TopSipByDid />
                </TabsContent>
            </Tabs>
        </main>
    );
}
