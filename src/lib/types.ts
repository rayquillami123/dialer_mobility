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
