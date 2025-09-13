
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Square } from 'lucide-react';
import { Campaign } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function CampaignForm({ onSave, campaign }: { onSave: (campaign: Partial<Campaign>) => void, campaign?: Partial<Campaign> }) {
  const [name, setName] = useState(campaign?.name || '');

  const handleSave = () => {
    onSave({ id: campaign?.id, name });
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="name" className="text-right">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
      </div>
      {/* Add other campaign fields here */}
    </div>
  );
}

export default function CampaignsPage() {
  const { authedFetch } = useAuth();
  const API = process.env.NEXT_PUBLIC_API || '';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function fetchCampaigns() {
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch(`${API}/api/campaigns`);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      setCampaigns(data || []);
    } catch (e: any) {
      setError(e.message);
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCampaigns();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveCampaign = async (campaignData: Partial<Campaign>) => {
    try {
      const res = await authedFetch(`${API}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData),
      });
      if (!res.ok) throw new Error('Failed to save campaign');
      await fetchCampaigns();
      setIsFormOpen(false);
      toast({ title: 'Success', description: 'Campaign created.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };
  
  const handleLifecycle = async (id: number, action: 'start' | 'pause' | 'stop') => {
    try {
        const res = await authedFetch(`${API}/api/campaigns/${id}/${action}`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error(`Failed to ${action} campaign`);
        await fetchCampaigns();
        toast({ title: 'Success', description: `Campaign ${action}ed.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };


  const statusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'running': return <Badge variant="default">Running</Badge>;
      case 'paused': return <Badge variant="secondary">Paused</Badge>;
      case 'stopped': return <Badge variant="destructive">Stopped</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <main className="flex-1 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Campaigns Management</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>Add Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Campaign</DialogTitle>
            </DialogHeader>
            <CampaignForm onSave={handleSaveCampaign} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" form="campaign-form" onClick={() => {
                  const nameInput = document.getElementById('name') as HTMLInputElement;
                  if (nameInput) {
                    handleSaveCampaign({ name: nameInput.value });
                  }
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.id}</TableCell>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{statusBadge(campaign.status)}</TableCell>
                    <TableCell className="space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleLifecycle(campaign.id, 'start')} disabled={campaign.status === 'running'}>
                            <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleLifecycle(campaign.id, 'pause')} disabled={campaign.status !== 'running'}>
                            <Pause className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleLifecycle(campaign.id, 'stop')} disabled={campaign.status === 'stopped'}>
                            <Square className="h-4 w-4" />
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
