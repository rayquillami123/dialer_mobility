"use client";

import { useState } from "react";
import type { Trunk } from "@/lib/types";
import { initialTrunks } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { IntegrationNotesGenerator } from "@/components/ai/integration-notes-generator";
import { AmiAriNotesGenerator } from "@/components/ai/ami-ari-notes-generator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Home() {
  const [trunks, setTrunks] = useState<Trunk[]>(initialTrunks);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [codecs, setCodecs] = useState("");
  const [cliRoute, setCliRoute] = useState("CLI");
  const [maxCPS, setMaxCPS] = useState(10);

  const { toast } = useToast();

  const addTrunk = () => {
    if (!name || !host || !codecs || !cliRoute) {
       toast({
        title: "Missing Fields",
        description: "Please fill out all fields to add a trunk.",
        variant: "destructive",
      });
      return;
    }
    const newTrunk: Trunk = {
      id: new Date().toISOString(),
      name,
      host,
      codecs,
      cliRoute,
      maxCPS,
      enabled: true,
    };
    setTrunks([newTrunk, ...trunks]);
    toast({
      title: "Trunk Created",
      description: `The new trunk "${name}" has been added.`,
    });
    // Reset form
    setName("");
    setHost("");
    setCodecs("");
    setCliRoute("CLI");
    setMaxCPS(10);
  };
  
  const handleDeleteTrunk = (trunkId: string) => {
    const trunkToDelete = trunks.find(t => t.id === trunkId);
    setTrunks(trunks.filter((t) => t.id !== trunkId));
    toast({
      title: "Trunk Deleted",
      description: `The trunk "${trunkToDelete?.name}" has been removed.`,
      variant: "destructive",
    });
  };

  const handleToggleStatus = (trunkId: string, enabled: boolean) => {
    setTrunks(
      trunks.map((t) => (t.id === trunkId ? { ...t, enabled } : t))
    );
     toast({
      title: "Status Updated",
      description: `Trunk status has been changed to ${enabled ? 'enabled' : 'disabled'}.`,
    });
  };


  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center h-16 px-4 border-b shrink-0 bg-background/80 backdrop-blur-sm md:px-8">
        <div className="flex items-center gap-3">
          <Logo className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tighter font-headline">
            Dialer Mobilitytech
          </h1>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">
        <div className="grid gap-8 lg:grid-cols-5 xl:grid-cols-3">
          <div className="space-y-8 lg:col-span-3 xl:col-span-2">
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Nueva troncal</CardTitle>
                    <CardDescription>Define proveedores y límites (CPS, codecs). El backend generará dialstrings y peers.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-3 gap-4">
                    <div>
                        <Label>Nombre</Label>
                        <Input value={name} onChange={e=>setName(e.target.value)} />
                    </div>
                    <div>
                        <Label>Host/Proxy</Label>
                        <Input value={host} onChange={e=>setHost(e.target.value)} />
                    </div>
                    <div>
                        <Label>Codecs</Label>
                        <Input value={codecs} onChange={e=>setCodecs(e.target.value)} />
                    </div>
                    <div>
                        <Label>Ruta</Label>
                        <Select value={cliRoute} onValueChange={(v:any)=>setCliRoute(v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="CLI">CLI</SelectItem>
                                <SelectItem value="CC">CC</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Máx CPS</Label>
                        <Input type="number" value={maxCPS} onChange={e=>setMaxCPS(Number(e.target.value))} />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={addTrunk}><Plus className="mr-2 h-4 w-4"/>Agregar</Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader><CardTitle>Troncales</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {trunks.map(t => (
                        <div key={t.id} className="flex items-center gap-3 p-3 border rounded-xl">
                            <div className="font-medium">{t.name}</div>
                            <div className="text-slate-500">{t.host}</div>
                            <Badge variant="secondary">{t.codecs}</Badge>
                            <Badge variant="secondary">{t.cliRoute}</Badge>
                            <Badge variant="secondary">CPS {t.maxCPS}</Badge>
                            <div className="ml-auto flex items-center gap-2">
                                <Switch checked={t.enabled} onCheckedChange={(val)=>{ handleToggleStatus(t.id, val) }}/>
                                <Button size="sm" variant="outline" disabled>Editar</Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="destructive">Eliminar</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will permanently delete the trunk "{t.name}". This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteTrunk(t.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
          </div>

          <aside className="space-y-8 lg:col-span-2 xl:col-span-1">
             <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Notas de integración (backend)</CardTitle>
                    <CardDescription className="space-y-2">
                        <ul className="list-disc pl-6 text-sm">
                            <li>Conectar AMI/ARI para: originate, bridge, eventos de canal, variables (X-AMD, X-LIST, X-CAMPAIGN).</li>
                            <li>AMD híbrido: usar <code>AMD()</code> de Asterisk + clasificador ML sobre frames PCM (≤ 1s).</li>
                            <li>Preservar CDR extendido: leadId, listId, providerId, amdLabel, amdConfidence, callResult, sipReason.</li>
                            <li>Respetar TCPA/DNC/ventanas horarias y STIR/SHAKEN; limitar abandonos según <code>dropRateCapPct</code>.</li>
                        </ul>
                    </CardDescription>
                </CardHeader>
            </Card>
            <IntegrationNotesGenerator />
            <AmiAriNotesGenerator />
          </aside>
        </div>
      </main>
    </div>
  );
}
