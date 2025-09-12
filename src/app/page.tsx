'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Download, PhoneCall, Play, Plus, Settings, Upload, User, Activity, Database, Factory, PhoneOutgoing, PhoneOff, FileDown, Bot, Code, Volume2, HardDrive } from 'lucide-react';
import { generateIntegrationNotes } from '@/ai/flows/generate-integration-notes';
import { AmiAriNotesForm, Trunk } from '@/lib/types';
import { suggestAMIARIConnectionNotes } from '@/ai/flows/suggest-ami-ari-connection-notes';
import { useForm, Controller } from 'react-hook-form';
import { generateDeveloperIntegrationGuide } from '@/ai/flows/generate-developer-integration-guide';
import { generateAudioFromText } from '@/ai/flows/generate-audio-from-text';
import { useDialerWS } from '@/hooks/useDialerWS';
import { useDialerStore } from '@/store/dialer';

/**
 * FRONTEND MVP – DIALER INTELIGENTE (FreeSWITCH backend)
 * ----------------------------------------------------
 * Arquitectura UI (sin backend):
 * - Dashboard en tiempo real (KPIs + monitor de llamadas)
 * - Campañas (CRUD + configuración por tipo: Predictive, Power, Preview, Press-1)
 * - Listas / Leads (carga CSV, validación básica, preview)
 * - Monitor en tiempo real (tabla de llamadas con estados y AMD)
 * - Reportes (exportar CSV de CDR/llamadas)
 * - Ajustes (Troncales/Proveedores + parámetros globales)
 *
 * El backend es un "motor de marcación" puro. No gestiona agentes ni colas.
 * Origina llamadas, detecta humanos, y transfiere las llamadas contestadas a una PBX externa.
 */

// -------------------------- Tipos base --------------------------

type CampaignType = 'Predictive' | 'Power' | 'Preview' | 'Press1';

type AMDEngine = 'Asterisk' | 'AI-ML' | 'Hybrid';

type CallStatus =
  | 'Dialing'
  | 'EarlyMedia'
  | 'Ringing'
  | 'Connected'
  | 'Human'
  | 'Voicemail'
  | 'Fax'
  | 'SIT'
  | 'NoAnswer'
  | 'Abandoned'
  | 'Ended';

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  listId?: string;
  trunkId?: string;
  callerIdStrategy?: 'Static' | 'ByState' | 'PoolRotation';
  callerIdValue?: string; // si Static
  pacingRatio?: number; // p.ej. 2.0
  maxChannels?: number;
  dropRateCapPct?: number; // % abandono permitido
  abandonMessage?: string; // TTS/locución para abandonos
  amdEngine: AMDEngine;
  amd: {
    enabled: boolean;
    confidenceMin: number; // 0..1
    analyzeMs: number; // ventana máxima análisis
    detectFax: boolean;
    detectSIT: boolean;
    asteriskParams?: {
      initialSilence: number;
      greeting: number;
      afterGreetingSilence: number;
      totalAnalysisTime: number;
      minWordLength: number;
      betweenWordsSilence: number;
      maximumNumberOfWords: number;
    };
  };
  press1?: {
    promptTTS: string;
    digitToTransfer: string; // '1'
    transferQueue: string;
    noInputAction: 'Hangup' | 'Retry' | 'Voicemail';
  };
  predictive?: {
    targetOccupancyPct: number;
    avgHandleTimeSec: number;
  };
  status: 'Draft' | 'Running' | 'Paused' | 'Completed';
  createdAt: string;
}

interface Lead {
  id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  timezone?: string;
  meta?: Record<string, any>;
}

interface LeadList { id: string; name: string; leads: Lead[]; createdAt: string; }

interface LiveCall {
  uuid: string;
  phone: string;
  state?: string;
  leadId?: string;
  campaignId?: string;
  trunkId?: string;
  status: CallStatus;
  amd?: {label?: 'HUMAN' | 'VOICEMAIL' | 'FAX' | 'SIT' | 'NOANSWER' | 'UNKNOWN'; confidence?: number};
  agent?: string;
  billsec?: number;
  ts: number;
}

// -------------------------- Utilidades --------------------------

const uid = () => Math.random().toString(36).slice(2, 10);

function downloadCSV(filename: string, rows: any[]) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function parseCSV(text: string): any[] {
  // Parser simple (no soporta comillas escapadas complejas)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const row: any = {};
    headers.forEach((h, i) => (row[h] = (cols[i] ?? '').trim()));
    return row;
  });
}

// -------------------------- Shell --------------------------

const sections = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'campaigns', label: 'Campañas', icon: PhoneOutgoing },
  { id: 'lists', label: 'Listas / Leads', icon: Database },
  { id: 'realtime', label: 'Tiempo real', icon: PhoneCall },
  { id: 'dispositions', label: 'Disposiciones', icon: PhoneOff },
  { id: 'scheduler', label: 'Agendador', icon: Play },
  { id: 'providers', label: 'Proveedores', icon: Factory },
  { id: 'compliance', label: 'Cumplimiento', icon: Settings },
  { id: 'scripts', label: 'Guiones', icon: FileDown },
  { id: 'audio', label: 'Audio TTS/Prompts', icon: Volume2 },
  { id: 'qa', label: 'Grabaciones & QA', icon: HardDrive },
  { id: 'integrations', label: 'Integraciones', icon: Bot },
  { id: 'audit', label: 'Auditoría', icon: Settings },
  { id: 'reports', label: 'Reportes', icon: FileDown },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const;

export default function DialerInteligenteApp() {
  const [active, setActive] = useState<(typeof sections)[number]['id']>('dashboard');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<LeadList[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([{
    id: uid(), name: 'US-CLI-MAIN', host: 'sip.provider.net', codecs: 'ulaw,alaw', cliRoute: 'CLI', maxCPS: 20, enabled: true,
  }]);
  
  // Connect to the WebSocket, assuming it's served on the same host.
  // In a real app, you'd get this from an environment variable.
  const wsUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol.replace('http', 'ws')}//${window.location.host.replace(/:\d+$/, ':9003')}/ws`
    : '';
  useDialerWS(wsUrl);

  const allCalls = useDialerStore((s) => Object.values(s.calls));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="font-bold text-xl">Dialer Inteligente</div>
          <Badge variant="secondary" className="ml-2">FreeSWITCH Backend</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setActive('dashboard')}>
              <Activity className="mr-2 h-4 w-4"/> KPI Live
            </Button>
            <Button size="sm" onClick={() => setActive('campaigns')}>
              <Plus className="mr-2 h-4 w-4"/> Nueva campaña
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <nav className="lg:col-span-3 xl:col-span-2 space-y-2">
          {sections.map(s => (
            <Button key={s.id} variant={active === s.id ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => setActive(s.id)}>
              <s.icon className="mr-2 h-4 w-4"/> {s.label}
            </Button>
          ))}
        </nav>

        <main className="lg:col-span-9 xl:col-span-10">
          {active === 'dashboard' && <Dashboard />} 
          {active === 'campaigns' && <Campaigns campaigns={campaigns} setCampaigns={setCampaigns} lists={lists} trunks={trunks}/>} 
          {active === 'lists' && <Lists lists={lists} setLists={setLists}/>} 
          {active === 'realtime' && <Realtime />} 
          {active === 'dispositions' && <Dispositions/>}
          {active === 'scheduler' && <Scheduler/>}
          {active === 'providers' && <TrunksSettings trunks={trunks} setTrunks={setTrunks}/>}
          {active === 'compliance' && <ComplianceCenter/>}
          {active === 'scripts' && <ScriptsDesigner/>}
          {active === 'audio' && <AudioLibrary/>}
          {active === 'qa' && <QARecordings/>}
          {active === 'integrations' && <Integrations/>}
          {active === 'audit' && <AuditLog/>}
          {active === 'reports' && <Reports allCalls={allCalls} campaigns={campaigns}/>}
          {active === 'settings' && <SettingsPage/>}
        </main>
      </div>

      <footer className="border-t py-6 text-center text-sm text-slate-500">© {new Date().getFullYear()} Dialer Inteligente — UI MVP</footer>
    </div>
  );
}

// -------------------------- Dashboard --------------------------

function Stat({ title, value, icon: Icon }: { title: string; value: React.ReactNode; icon: any }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-400"/>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const kpi = useDialerStore((s) => s.kpi);
  const calls = useDialerStore((s) => Object.values(s.calls));
  
  const humans = calls.filter(c => c.amd?.label === 'HUMAN').length;
  const vm = calls.filter(c => c.amd?.label === 'VOICEMAIL').length;
  const otherAmd = calls.filter(c => ['FAX', 'SIT'].includes(c.amd?.label ?? '')).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Stat title="ASR (5m)" value={kpi ? (kpi.asr5m * 100).toFixed(1) + '%' : '...'} icon={PhoneOutgoing}/>
        <Stat title="ACD (s)" value={kpi ? kpi.acd.toFixed(1) : '...'} icon={PhoneCall}/>
        <Stat title="Humanos" value={humans} icon={User}/>
        <Stat title="Buzones" value={vm} icon={PhoneOff}/>
        <Stat title="SIT/Fax" value={otherAmd} icon={Factory}/>
        <Stat title="Abandono (60s)" value={kpi ? (kpi.abandon60s * 100).toFixed(2) + '%' : '...'} icon={Activity}/>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Monitor en tiempo real</CardTitle>
          <CardDescription>Mostrando las últimas 30 llamadas del stream en vivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <LiveTable rows={calls.slice(0, 30)} />
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------- Campañas --------------------------

function Campaigns({ campaigns, setCampaigns, lists, trunks }: { campaigns: Campaign[]; setCampaigns: any; lists: LeadList[]; trunks: Trunk[] }) {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold mr-auto">Campañas</h2>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-2 h-4 w-4"/>Nueva campaña</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map(c => (
          <Card key={c.id} className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{c.name}</span>
                <Badge variant={c.status === 'Running' ? 'default' : 'secondary'}>{c.status}</Badge>
              </CardTitle>
              <CardDescription>{c.type} · AMD: {c.amdEngine}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div><b>Lista:</b> {lists.find(l => l.id === c.listId)?.name ?? '—'}</div>
              <div><b>Troncal:</b> {c.trunkId ? trunks.find(t => t.id === c.trunkId)?.name : '—'}</div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline">Pausar</Button>
                <Button size="sm" variant="outline">Duplicar</Button>
                <Button size="sm" variant="destructive">Eliminar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showNew && (
        <NewCampaign
          onClose={() => setShowNew(false)}
          onSave={(c: Campaign) => { setCampaigns((prev: Campaign[]) => [c, ...prev]); setShowNew(false); }}
          lists={lists}
          trunks={trunks}
        />
      )}
    </div>
  );
}

function NewCampaign({ onClose, onSave, lists, trunks }: { onClose: () => void; onSave: (c: Campaign) => void; lists: LeadList[]; trunks: Trunk[] }) {
  const [name, setName] = useState('Campaña sin nombre');
  const [type, setType] = useState<CampaignType>('Predictive');
  const [listId, setListId] = useState<string | undefined>(lists[0]?.id);
  const [trunkId, setTrunkId] = useState<string | undefined>(trunks[0]?.id);
  const [callerIdStrategy, setCallerIdStrategy] = useState<'Static' | 'ByState' | 'PoolRotation'>('PoolRotation');
  const [callerIdValue, setCallerIdValue] = useState('');
  const [pacingRatio, setPacingRatio] = useState(2);
  const [maxChannels, setMaxChannels] = useState(50);
  const [dropRateCapPct, setDropRateCapPct] = useState(3);
  const [abandonMessage, setAbandonMessage] = useState('Lo sentimos, todos nuestros agentes se encuentran ocupados.');

  const [amdEngine, setAmdEngine] = useState<AMDEngine>('Hybrid');
  const [amdEnabled, setAmdEnabled] = useState(true);
  const [confidenceMin, setConfidenceMin] = useState(0.7);
  const [analyzeMs, setAnalyzeMs] = useState(900);
  const [detectFax, setDetectFax] = useState(true);
  const [detectSIT, setDetectSIT] = useState(true);

  const [asterisk, setAsterisk] = useState({
    initialSilence: 2500,
    greeting: 1500,
    afterGreetingSilence: 800,
    totalAnalysisTime: 5000,
    minWordLength: 120,
    betweenWordsSilence: 50,
    maximumNumberOfWords: 3,
  });

  const [press1Prompt, setPress1Prompt] = useState('Para hablar con un agente, presione 1.');
  const [press1Digit, setPress1Digit] = useState('1');
  const [press1Queue, setPress1Queue] = useState('sales');
  const [noInputAction, setNoInputAction] = useState<'Hangup' | 'Retry' | 'Voicemail'>('Hangup');

  const [targetOccupancyPct, setTargetOccupancyPct] = useState(85);
  const [avgHandleTimeSec, setAvgHandleTimeSec] = useState(240);

  function save() {
    const c: Campaign = {
      id: uid(),
      name,
      type,
      listId,
      trunkId,
      callerIdStrategy,
      callerIdValue: callerIdStrategy === 'Static' ? callerIdValue : undefined,
      pacingRatio,
      maxChannels,
      dropRateCapPct,
      abandonMessage,
      amdEngine,
      amd: { enabled: amdEnabled, confidenceMin, analyzeMs, detectFax, detectSIT, asteriskParams: asterisk },
      press1: type === 'Press1' ? { promptTTS: press1Prompt, digitToTransfer: press1Digit, transferQueue: press1Queue, noInputAction } : undefined,
      predictive: type === 'Predictive' ? { targetOccupancyPct, avgHandleTimeSec } : undefined,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };
    onSave(c);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Nueva campaña</CardTitle>
        <CardDescription>Configura parámetros esenciales. Más ajustes podrán exponerse conforme se implemente el backend.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de campaña"/>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v:any)=>setType(v)}>
              <SelectTrigger><SelectValue placeholder="Tipo"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="Predictive">Predictive</SelectItem>
                <SelectItem value="Power">Power</SelectItem>
                <SelectItem value="Preview">Preview</SelectItem>
                <SelectItem value="Press1">Press-1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Lista</Label>
            <Select value={listId} onValueChange={(v:any)=>setListId(v)}>
              <SelectTrigger><SelectValue placeholder="Lista"/></SelectTrigger>
              <SelectContent>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Troncal</Label>
            <Select value={trunkId} onValueChange={(v:any)=>setTrunkId(v)}>
              <SelectTrigger><SelectValue placeholder="Troncal"/></SelectTrigger>
              <SelectContent>
                {trunks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Estrategia Caller ID</Label>
            <Select value={callerIdStrategy} onValueChange={(v:any)=>setCallerIdStrategy(v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="Static">Static</SelectItem>
                <SelectItem value="ByState">Por estado</SelectItem>
                <SelectItem value="PoolRotation">Pool rotation</SelectItem>
              </SelectContent>
            </Select>
            {callerIdStrategy === 'Static' && (
              <div className="mt-2">
                <Input value={callerIdValue} onChange={e=>setCallerIdValue(e.target.value)} placeholder="+13051234567"/>
              </div>
            )}
          </div>
          <div>
            <Label>Pacing ratio</Label>
            <Input type="number" value={pacingRatio} onChange={e=>setPacingRatio(Number(e.target.value))}/>
          </div>
          <div>
            <Label>Máx. canales</Label>
            <Input type="number" value={maxChannels} onChange={e=>setMaxChannels(Number(e.target.value))}/>
          </div>
          <div>
            <Label>Cap abandono (%)</Label>
            <Input type="number" value={dropRateCapPct} onChange={e=>setDropRateCapPct(Number(e.target.value))}/>
          </div>
          <div className="md:col-span-2">
            <Label>Mensaje de abandono</Label>
            <Textarea value={abandonMessage} onChange={e=>setAbandonMessage(e.target.value)} />
          </div>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Detección Inteligente (AMD)</CardTitle>
            <CardDescription>Decide en tiempo real si es humano, buzón, fax o SIT. Sólo los humanos pasan a agente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <Label>Motor</Label>
                <Select value={amdEngine} onValueChange={(v:any)=>setAmdEngine(v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asterisk">Asterisk AMD</SelectItem>
                    <SelectItem value="AI-ML">AI-ML</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <Switch checked={amdEnabled} onCheckedChange={setAmdEnabled}/>
                <Label>Activado</Label>
              </div>
              <div>
                <Label>Confianza mínima</Label>
                <Input type="number" step="0.05" value={confidenceMin} onChange={e=>setConfidenceMin(Number(e.target.value))}/>
              </div>
              <div>
                <Label>Ventana análisis (ms)</Label>
                <Input type="number" value={analyzeMs} onChange={e=>setAnalyzeMs(Number(e.target.value))}/>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={detectFax} onCheckedChange={setDetectFax}/>
                <Label>Detectar fax</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={detectSIT} onCheckedChange={setDetectSIT}/>
                <Label>Detectar SIT</Label>
              </div>
            </div>
            {amdEngine !== 'Asterisk' ? null : (
              <div className="grid md:grid-cols-3 gap-4">
                {Object.entries(asterisk).map(([k, v]) => (
                  <div key={k}>
                    <Label>{k}</Label>
                    <Input type="number" value={v as number} onChange={e=>setAsterisk({ ...asterisk, [k]: Number(e.target.value) })}/>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {type === 'Press1' && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Press-1 (IVR)</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Prompt TTS</Label>
                <Textarea value={press1Prompt} onChange={e=>setPress1Prompt(e.target.value)}/>
              </div>
              <div>
                <Label>Dígito de transferencia</Label>
                <Input value={press1Digit} onChange={e=>setPress1Digit(e.target.value)}/>
              </div>
              <div>
                <Label>Cola destino</Label>
                <Input value={press1Queue} onChange={e=>setPress1Queue(e.target.value)}/>
              </div>
              <div>
                <Label>Sin input</Label>
                <Select value={noInputAction} onValueChange={(v:any)=>setNoInputAction(v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hangup">Colgar</SelectItem>
                    <SelectItem value="Retry">Reintentar</SelectItem>
                    <SelectItem value="Voicemail">Buzón</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {type === 'Predictive' && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Predictive</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Target occupancy (%)</Label>
                <Input type="number" value={targetOccupancyPct} onChange={e=>setTargetOccupancyPct(Number(e.target.value))}/>
              </div>
              <div>
                <Label>AHT estimado (s)</Label>
                <Input type="number" value={avgHandleTimeSec} onChange={e=>setAvgHandleTimeSec(Number(e.target.value))}/>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={save}><Play className="mr-2 h-4 w-4"/>Guardar campaña</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Listas / Leads --------------------------

function Lists({ lists, setLists }: { lists: LeadList[]; setLists: any }) {
  const [name, setName] = useState('Lista ' + new Date().toLocaleDateString());
  const [rows, setRows] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const data = parseCSV(text);
      setRows(data);
    };
    reader.readAsText(f);
  }

  function saveList() {
    const leads: Lead[] = rows.map((r, idx) => ({
      id: uid(), phone: r.phone || r.Phone || r.telefono || '',
      firstName: r.firstName || r.nombre || '', lastName: r.lastName || r.apellido || '',
      state: r.state || r.estado || '', timezone: r.timezone || '', meta: r,
    })).filter(l => l.phone);
    const list: LeadList = { id: uid(), name, leads, createdAt: new Date().toISOString() };
    setLists((prev: LeadList[]) => [list, ...prev]);
    setRows([]);
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Cargar lista (CSV)</CardTitle>
          <CardDescription>Columnas mínimas: <code>phone</code>. Opcionales: firstName, lastName, state, timezone…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <Label>Nombre de la lista</Label>
              <Input value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
              <Label>Archivo CSV</Label>
              <Input ref={fileRef} type="file" accept=".csv" onChange={onFile} />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveList} disabled={!rows.length}><Upload className="mr-2 h-4 w-4"/>Guardar lista</Button>
              <Button variant="outline" onClick={() => rows.length && downloadCSV('plantilla.csv', [{ phone: '+13051234567', firstName: 'John', lastName: 'Doe', state: 'FL' }])}><Download className="mr-2 h-4 w-4"/>Plantilla</Button>
            </div>
          </div>

          {!!rows.length && (
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr>{Object.keys(rows[0]).map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((r,i) => (
                    <tr key={i} className="border-t"><td className="px-3 py-2" colSpan={Object.keys(rows[0]).length}>
                      {Object.keys(r).map((h,j) => <span key={j} className="inline-block min-w-[160px]">{String(r[h])}</span>)}
                    </td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader><CardTitle>Listas existentes</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lists.map(l => (
            <Card key={l.id} className="border">
              <CardHeader>
                <CardTitle className="text-base">{l.name}</CardTitle>
                <CardDescription>{l.leads.length} leads</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadCSV(`${l.name}.csv`, l.leads)}>Descargar</Button>
                <Button size="sm" variant="outline">Ver</Button>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------- Tiempo real --------------------------

function LiveTable({ rows }: { rows: LiveCall[] }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="overflow-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Hora</th>
            <th className="px-3 py-2 text-left">Teléfono</th>
            <th className="px-3 py-2 text-left">Estado</th>
            <th className="px-3 py-2 text-left">AMD</th>
            <th className="px-3 py-2 text-left">Conf.</th>
            <th className="px-3 py-2 text-left">Duración</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.uuid} className="border-t">
              <td className="px-3 py-2">{new Date(r.ts).toLocaleTimeString()}</td>
              <td className="px-3 py-2 font-mono">{r.phone}</td>
              <td className="px-3 py-2">{r.state}</td>
              <td className="px-3 py-2">{r.amd?.label}</td>
              <td className="px-3 py-2">{typeof r.amd?.confidence === 'number' ? r.amd.confidence.toFixed(2) : ''}</td>
              <td className="px-3 py-2">{r.billsec ?? Math.max(0, Math.floor((now - r.ts) / 1000))}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Realtime() {
  const calls = useDialerStore((s) => Object.values(s.calls));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Monitor en tiempo real</h2>
      <LiveTable rows={calls}/>
      <p className="text-xs text-slate-500">*Datos conectados al WebSocket del backend.</p>
    </div>
  );
}

// -------------------------- Reportes --------------------------

function Reports({ allCalls, campaigns }: { allCalls: LiveCall[]; campaigns: Campaign[] }) {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string | 'all'>('all');

  const rows = useMemo(() => {
    const f = from ? new Date(from).getTime() : 0;
    const t = to ? new Date(to).getTime() : Infinity;
    return allCalls.filter(c => {
      const ts = c.ts;
      return ts >= f && ts <= t && (campaignId === 'all' || c.campaignId === campaignId);
    });
  }, [from, to, campaignId, allCalls]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <Label>Desde</Label>
          <Input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div>
          <Label>Hasta</Label>
          <Input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <div className="min-w-[240px]">
          <Label>Campaña</Label>
          <Select value={campaignId} onValueChange={(v:any)=>setCampaignId(v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="ml-auto" onClick={() => downloadCSV('cdr.csv', rows)}>Exportar CSV</Button>
      </div>

      <LiveTable rows={rows}/>
    </div>
  );
}

// -------------------------- Ajustes (Troncales/Proveedores) --------------------------

type Health = {
  window: string;
  items: Array<{
    trunk_id: number|null;
    asr: number|null;
    p50_pdd_ms: number|null;
    p90_pdd_ms: number|null;
    c4xx: number; c5xx: number; busy_486: number; forb_403: number; notfound_404: number;
    sip_mix?: any;
  }>;
};

function ProvidersHealth() {
  const [health, setHealth] = useState<Health|null>(null);

  useEffect(()=>{
    // In a real app, you'd get this from an environment variable.
    const apiUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host.replace(/:\d+$/, ':9003')}`
    : '';

    fetch(`${apiUrl}/api/providers/health?window=15m`, {
      // headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN||''}` }
    }).then(r=>r.json()).then(setHealth).catch((e) => {
      console.error("Failed to fetch provider health:", e)
      setHealth(null)
    });
  },[]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salud de Proveedores (últimos 15 minutos)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Troncal</TableHead>
              <TableHead>ASR</TableHead>
              <TableHead>PDD p50</TableHead>
              <TableHead>PDD p90</TableHead>
              <TableHead>4xx</TableHead>
              <TableHead>5xx</TableHead>
              <TableHead>486 Busy</TableHead>
              <TableHead>403 Forbidden</TableHead>
              <TableHead>404 Not Found</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health?.items?.map((it: any, i: number)=>(
              <TableRow key={i}>
                <TableCell>{it.trunk_id ?? '—'}</TableCell>
                <TableCell>{it.asr !== null ? (it.asr*100).toFixed(1)+'%' : '—'}</TableCell>
                <TableCell>{it.p50_pdd_ms ?? '—'} ms</TableCell>
                <TableCell>{it.p90_pdd_ms ?? '—'} ms</TableCell>
                <TableCell>{it.c4xx ?? it.sip_mix?.['4xx'] ?? 0}</TableCell>
                <TableCell>{it.c5xx ?? it.sip_mix?.['5xx'] ?? 0}</TableCell>
                <TableCell>{it.busy_486 ?? it.sip_mix?.['486'] ?? 0}</TableCell>
                <TableCell>{it.forb_403 ?? it.sip_mix?.['403'] ?? 0}</TableCell>
                <TableCell>{it.notfound_404 ?? it.sip_mix?.['404'] ?? 0}</TableCell>
              </TableRow>
            )) || <TableRow><TableCell colSpan={9}>Sin datos</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function TrunksSettings({ trunks, setTrunks }: { trunks: Trunk[]; setTrunks: any }) {
  const [name, setName] = useState('US-CLI-BACKUP');
  const [host, setHost] = useState('sip.backup.net');
  const [codecs, setCodecs] = useState('ulaw,alaw');
  const [cliRoute, setCliRoute] = useState<'CLI' | 'CC'>('CLI');
  const [maxCPS, setMaxCPS] = useState(10);
  const [editingTrunk, setEditingTrunk] = useState<Trunk | null>(null);

  function addTrunk() {
    const t: Trunk = { id: uid(), name, host, codecs, cliRoute, maxCPS, enabled: true };
    setTrunks((prev: Trunk[]) => [t, ...prev]);
  }
  
  function deleteTrunk(id: string) {
    setTrunks((prev: Trunk[]) => prev.filter(t => t.id !== id));
  }

  return (
    <div className="space-y-6">
      <ProvidersHealth />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Troncales Configurados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {trunks.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-3 border rounded-xl">
              <div className="font-medium">{t.name}</div>
              <div className="text-slate-500">{t.host}</div>
              <Badge variant="secondary">{t.codecs}</Badge>
              <Badge variant="secondary">{t.cliRoute}</Badge>
              <Badge variant="secondary">CPS {t.maxCPS}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <Switch checked={t.enabled} onCheckedChange={(val)=>{
                  setTrunks((prev: Trunk[]) => prev.map(x => x.id === t.id ? { ...x, enabled: !!val } : x));
                }}/>
                <Button size="sm" variant="outline" disabled>Editar</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteTrunk(t.id)}>Eliminar</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
       <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Nueva troncal</CardTitle>
            <CardDescription>Define proveedores y límites (CPS, codecs). El backend generará dialstrings y peers.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
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
    </div>
  );
}

// -------------------------- Disposiciones --------------------------
function Dispositions() {
  const base = ['SALE','CALLBACK','NO_ANSWER','BUSY','VOICEMAIL','DO_NOT_CALL'];
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Disposiciones</CardTitle>
        <CardDescription>Configura resultados y su lógica (reintentos, listas, prioridad).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">{base.map(d => <Badge key={d}>{d}</Badge>)}</div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Agendador --------------------------
function Scheduler() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Agendador & Ventanas Horarias</CardTitle>
        <CardDescription>Define ventanas por timezone y límites de intentos por lead.</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Máx intentos/lead</Label>
          <Input type="number" defaultValue={4}/>
        </div>
        <div>
          <Label>Cooldown (min)</Label>
          <Input type="number" defaultValue={30}/>
        </div>
        <div>
          <Label>Ventanas (ej. 9:00–20:00 local)</Label>
          <Input placeholder="09:00-20:00"/>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Cumplimiento --------------------------
function ComplianceCenter() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Cumplimiento</CardTitle>
        <CardDescription>DNC, consentimiento, caps de abandono, STIR/SHAKEN (placeholders).</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Cap de abandono (%)</Label>
          <Input type="number" defaultValue={3}/>
        </div>
        <div>
          <Label>Lista DNC</Label>
          <Input placeholder="Subir CSV / integrar API"/>
        </div>
        <div>
          <Label>Attestation</Label>
          <Select defaultValue="A">
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Guiones --------------------------
function ScriptsDesigner() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Guiones de Llamada</CardTitle>
        <CardDescription>Editor simple para scripts por campaña (variables lead, respuestas rápidas).</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea placeholder="Hola {{firstName}}, te llamo de..."/>
      </CardContent>
    </Card>
  );
}

// -------------------------- Biblioteca de Audio --------------------------
function AudioLibrary() {
  const [text, setText] = useState('Hola, te llamamos de MobilityTech para ofrecerte una solución de contact center.');
  const [audioData, setAudioData] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerateAudio = async () => {
    setLoading(true);
    setAudioData('');
    try {
      const result = await generateAudioFromText(text);
      if (result.media) {
        setAudioData(result.media);
      } else {
        console.error('No audio data returned');
        setAudioData('');
      }
    } catch (error) {
      console.error(error);
      setAudioData('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Generador de Audio (TTS)</CardTitle>
        <CardDescription>Crea prompts de audio para tus campañas, IVRs y mensajes usando IA. Escribe el texto y genera el audio para escucharlo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="tts-input">Texto a convertir</Label>
          <Textarea 
            id="tts-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe el texto para generar el audio..."
            rows={4}
          />
        </div>
        <Button onClick={handleGenerateAudio} disabled={loading || !text.trim()}>
          <Volume2 className="mr-2 h-4 w-4" />
          {loading ? 'Generando...' : 'Generar Audio'}
        </Button>
        {audioData && (
          <div className="mt-4">
             <Label>Resultado</Label>
            <audio controls src={audioData} className="w-full">
              Tu navegador no soporta el elemento de audio.
            </audio>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------- Grabaciones & QA --------------------------
function QARecordings() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Grabaciones & QA</CardTitle>
        <CardDescription>Lista de grabaciones, calificación por scorecard, búsqueda por texto (ASR).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-slate-500 text-sm">Placeholder: tabla de grabaciones y reproductor.</div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Integraciones --------------------------
function Integrations() {
  const [integrationNotes, setIntegrationNotes] = useState('');
  const [amiAriNotes, setAmiAriNotes] = useState('');
  const [devGuide, setDevGuide] = useState('');
  const [loading, setLoading] = useState(''); // Can be 'notes', 'ami', or 'guide'

  const { control, handleSubmit, formState: { errors } } = useForm<AmiAriNotesForm>({
    defaultValues: {
      platform: 'freeswitch',
      version: '1.10',
      purpose: 'real-time monitoring and call control'
    }
  });

  const handleGenerateIntegrationNotes = async () => {
    setLoading('notes');
    setIntegrationNotes('');
    try {
      const notes = await generateIntegrationNotes();
      setIntegrationNotes(notes);
    } catch (error) {
      console.error(error);
      setIntegrationNotes('Error generating integration notes.');
    } finally {
      setLoading('');
    }
  };

  const handleSuggestAmiAriNotes = async (data: AmiAriNotesForm) => {
    setLoading('ami');
    setAmiAriNotes('');
    try {
      const result = await suggestAMIARIConnectionNotes(data);
      setAmiAriNotes(result.notes);
    } catch (error) {
      console.error(error);
      setAmiAriNotes('Error generating AMI/ARI connection notes.');
    } finally {
      setLoading('');
    }
  };
  
  const handleGenerateDevGuide = async () => {
    setLoading('guide');
    setDevGuide('');
    try {
      const result = await generateDeveloperIntegrationGuide();
      setDevGuide(result);
    } catch (error) {
      console.error(error);
      setDevGuide('Error generating the developer integration guide.');
    } finally {
      setLoading('');
    }
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Guía de Integración para Desarrolladores (FreeSWITCH)</CardTitle>
          <CardDescription>
            Genere una guía técnica completa para integrar este frontend con un backend de FreeSWITCH, basado en las especificaciones detalladas del proyecto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGenerateDevGuide} disabled={loading === 'guide'}>
            <Code className="mr-2 h-4 w-4" />
            {loading === 'guide' ? 'Generando Guía...' : 'Generar Guía Técnica Completa'}
          </Button>
          {devGuide && (
            <div className="mt-4 p-4 border rounded-xl bg-slate-50">
              <h3 className="font-semibold mb-2">Guía de Integración para Desarrolladores:</h3>
              <pre className="whitespace-pre-wrap text-sm">{devGuide}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Generador de Notas de Integración</CardTitle>
          <CardDescription>
            Utilice IA para generar notas detalladas para que los desarrolladores creen el backend y lo integren con este frontend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGenerateIntegrationNotes} disabled={loading === 'notes'}>
            <Bot className="mr-2 h-4 w-4" />
            {loading === 'notes' ? 'Generando...' : 'Generar Notas de Integración'}
          </Button>
          {integrationNotes && (
            <div className="mt-4 p-4 border rounded-xl bg-slate-50">
              <h3 className="font-semibold mb-2">Notas de Integración Generadas:</h3>
              <pre className="whitespace-pre-wrap text-sm">{integrationNotes}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Sugerencias de Conexión ESL (FreeSWITCH)</CardTitle>
          <CardDescription>
            Obtenga notas de configuración de IA para conectar su plataforma de telefonía.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleSuggestAmiAriNotes)} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Plataforma</Label>
                <Controller
                  name="platform"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="freeswitch">FreeSWITCH</SelectItem>
                        <SelectItem value="asterisk">Asterisk</SelectItem>
                        <SelectItem value="kamailio">Kamailio</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label>Versión</Label>
                <Controller
                  name="version"
                  control={control}
                  render={({ field }) => <Input {...field} placeholder="p.ej. 1.10.x" />}
                />
              </div>
              <div>
                <Label>Propósito</Label>
                 <Controller
                  name="purpose"
                  control={control}
                  render={({ field }) => <Input {...field} placeholder="p.ej. Monitoreo"/>}
                />
              </div>
            </div>
            <Button type="submit" disabled={loading === 'ami'}>
              <Bot className="mr-2 h-4 w-4" />
              {loading === 'ami' ? 'Generando...' : 'Sugerir Notas de Conexión'}
            </Button>
          </form>
          {amiAriNotes && (
            <div className="mt-4 p-4 border rounded-xl bg-slate-50">
              <h3 className="font-semibold mb-2">Notas de Conexión ESL Sugeridas:</h3>
              <pre className="whitespace-pre-wrap text-sm">{amiAriNotes}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------- Auditoría --------------------------
function AuditLog() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Auditoría</CardTitle>
        <CardDescription>Eventos relevantes con usuario, IP, timestamp (placeholder).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-slate-500 text-sm">Placeholder: tabla de eventos.</div>
      </CardContent>
    </Card>
  );
}

// -------------------------- Ajustes (Globales) --------------------------
function SettingsPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Ajustes Globales</CardTitle>
        <CardDescription>
          Aquí vivirá la configuración global del sistema (branding, autenticación, límites por defecto, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">Parámetros generales del sistema (placeholder).</p>
      </CardContent>
    </Card>
  );
}
