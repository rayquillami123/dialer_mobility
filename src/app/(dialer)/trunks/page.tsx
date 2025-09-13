
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
import { Switch } from '@/components/ui/switch';
import { Trunk } from '@/lib/types';
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

function TrunkForm({ onSave, trunk }: { onSave: (trunk: Partial<Trunk>) => void, trunk?: Partial<Trunk> }) {
  const [name, setName] = useState(trunk?.name || '');
  const [host, setHost] = useState(trunk?.host || '');
  const [maxCPS, setMaxCPS] = useState(trunk?.maxCPS || 10);

  const handleSave = () => {
    onSave({ id: trunk?.id, name, host, maxCPS: Number(maxCPS), enabled: trunk?.enabled ?? true });
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="name" className="text-right">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="host" className="text-right">Host</Label>
        <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} className="col-span-3" />
      </div>
       <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="maxCPS" className="text-right">Max CPS</Label>
        <Input id="maxCPS" type="number" value={maxCPS} onChange={(e) => setMaxCPS(Number(e.target.value))} className="col-span-3" />
      </div>
    </div>
  );
}

export default function TrunksPage() {
  const { authedFetch } = useAuth();
  const API = process.env.NEXT_PUBLIC_API || '';
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function fetchTrunks() {
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch(`${API}/api/providers`);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      setTrunks(data.items || []);
    } catch (e: any) {
      setError(e.message);
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTrunks();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await authedFetch(`${API}/api/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled }),
      });
      if (!res.ok) throw new Error('Failed to update trunk status');
      setTrunks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
      toast({ title: 'Success', description: 'Trunk status updated.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleSaveTrunk = async (trunkData: Partial<Trunk>) => {
    const isEditing = !!trunkData.id;
    const url = isEditing ? `${API}/api/providers/${trunkData.id}` : `${API}/api/providers`;
    const method = isEditing ? 'PATCH' : 'POST';

    try {
      const res = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trunkData),
      });
      if (!res.ok) throw new Error('Failed to save trunk');
      await fetchTrunks(); // Re-fetch all trunks to get the latest list
      setIsFormOpen(false);
      toast({ title: 'Success', description: `Trunk ${isEditing ? 'updated' : 'created'}.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  return (
    <main className="flex-1 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Trunks Management</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>Add Trunk</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Trunk</DialogTitle>
            </DialogHeader>
            <TrunkForm onSave={handleSaveTrunk} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" onClick={() => {
                // This is a bit of a hack, we should get the form data from the form component
                const form = document.querySelector('form');
                if (form) {
                    const formData = new FormData(form);
                    const trunkData: Partial<Trunk> = {};
                    for (const [key, value] of formData.entries()) {
                        (trunkData as any)[key] = value;
                    }
                    handleSaveTrunk(trunkData);
                }
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Trunks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Codecs</TableHead>
                  <TableHead>CLI Route</TableHead>
                  <TableHead>Max CPS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trunks.map((trunk) => (
                  <TableRow key={trunk.id}>
                    <TableCell>{trunk.name}</TableCell>
                    <TableCell>{trunk.host}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {trunk.codecs?.split(',').map((codec) => (
                          <Badge key={codec} variant="secondary">
                            {codec}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{trunk.cliRoute}</TableCell>
                    <TableCell>{trunk.maxCPS}</TableCell>
                    <TableCell>
                      <Badge variant={trunk.enabled ? 'default' : 'destructive'}>
                        {trunk.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={trunk.enabled}
                        onCheckedChange={(checked) => handleToggle(trunk.id, checked)}
                      />
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
