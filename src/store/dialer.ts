// store/dialer.ts
import { create } from "zustand";

type Kpi = { asr5m:number; acd:number; cps:number; cc:number; abandon60s:number; ts:number };
type Call = { uuid:string; state:string; number:string; campaignId?:string; trunkId?:string; sip?:string; amd?:any; ts:number; billsec?:number };

interface DialerState {
  kpi: Kpi | null;
  calls: Record<string,Call>;
  onKpi: (m:any)=>void; 
  onCall:(m:any)=>void; 
  onAgent:(m:any)=>void; 
  onQueue:(m:any)=>void;
}

export const useDialerStore = create<DialerState>((set) => ({
  kpi: null,
  calls: {},
  onKpi: (m)=>set({ kpi:{ asr5m:m.asr5m, acd:m.acd, cps:m.cps, cc:m.cc, abandon60s:m.abandon60s, ts:m.ts }}),
  onCall:(m)=>set(s=>({ calls:{ ...s.calls, [m.uuid]:{ ...s.calls[m.uuid], ...m }}})),
  onAgent:()=>{}, 
  onQueue:()=>{}
}));
