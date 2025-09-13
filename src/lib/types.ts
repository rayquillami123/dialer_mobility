
export interface Trunk { 
  id: string; 
  name: string; 
  host: string; 
  username?: string; 
  codecs?: string; 
  cliRoute?: 'CLI' | 'CC'; 
  maxCPS?: number; 
  enabled: boolean; 
}

export type AmiAriNotesForm = {
  platform: 'asterisk' | 'freeswitch' | 'kamailio' | 'other';
  version: string;
  purpose: string;
};


export interface Campaign {
  id: number;
  name: string;
  status: 'running' | 'paused' | 'stopped';
  type: string;
  pacing: number;
  max_channels: number;
  abandon_cap: number;
  queue: string;
}
