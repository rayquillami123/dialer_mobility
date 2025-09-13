
import { create } from "zustand";

type Kpi = { asr5m:number; acd:number; cps:number; cc:number; abandon60s:number; ts:number };
type Call = { uuid:string; state:string; number:string; campaignId?:string; trunkId?:string; sip?:string; amd?:any; ts:number; billsec?:number };
export type Campaign = { id: number; name: string; status: 'running' | 'paused' | 'stopped' };
type AutoprotectEvent = { type: 'campaign.autoprotect', campaign_id: number, pct: number, cap: number, multiplier: number, status: string, ts: number };

interface DialerState {
  kpi: Kpi | null;
  calls: Record<string,Call>;
  campaigns: Campaign[];
  autoprotect: AutoprotectEvent[];
  onKpi: (m:any)=>void; 
  onCall:(m:any)=>void; 
  onAgent:(m:any)=>void; 
  onQueue:(m:any)=>void;
  onAutoprotect: (m: AutoprotectEvent) => void;
  setCampaigns: (campaigns: Campaign[]) => void;
}

export const useDialerStore = create<DialerState>((set) => ({
  kpi: null,
  calls: {},
  campaigns: [],
  autoprotect: [],
  onKpi: (m)=>set({ kpi:{ asr5m:m.asr5m, acd:m.acd, cps:m.cps, cc:m.cc, abandon60s:m.abandon60s, ts:m.ts }}),
  onCall:(m)=>set(s=>({ calls:{ ...s.calls, [m.uuid]:{ ...s.calls[m.uuid], ...m }}})),
  onAgent:()=>{}, 
  onQueue:()=>{},
  onAutoprotect: (m) => set(s => ({ autoprotect: [...s.autoprotect, m].slice(-100) })), // Keep last 100 events
  setCampaigns: (campaigns) => set({ campaigns }),
}));
