'use client';

import { useState } from 'react';
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

// Mock data for trunks
const mockTrunks: Trunk[] = [
  {
    id: '1',
    name: 'Main Provider',
    host: 'sip.mainprovider.com',
    codecs: 'PCMU,PCMA',
    cliRoute: 'CLI',
    maxCPS: 100,
    enabled: true,
  },
  {
    id: '2',
    name: 'Backup Route',
    host: 'sip.backupprovider.net',
    codecs: 'PCMU,G729',
    cliRoute: 'CC',
    maxCPS: 50,
    enabled: false,
  },
  {
    id: '3',
    name: 'Test Gateway',
    host: '192.168.1.10',
    codecs: 'PCMU',
    cliRoute: 'CLI',
    maxCPS: 10,
    enabled: true,
  },
];

export default function TrunksPage() {
  const [trunks, setTrunks] = useState<Trunk[]>(mockTrunks);

  const handleToggle = (id: string) => {
    setTrunks((prevTrunks) =>
      prevTrunks.map((trunk) =>
        trunk.id === id ? { ...trunk, enabled: !trunk.enabled } : trunk
      )
    );
  };

  return (
    <main className="flex-1 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Trunks Management</h1>
        <Button>Add Trunk</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Trunks</CardTitle>
        </CardHeader>
        <CardContent>
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
                      onCheckedChange={() => handleToggle(trunk.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
