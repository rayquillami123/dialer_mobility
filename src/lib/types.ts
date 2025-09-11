export interface Trunk {
  id: string;
  name: string;
  host: string;
  codecs: string;
  cliRoute: string;
  maxCPS: number;
  enabled: boolean;
}

export type AmiAriNotesForm = {
  platform: 'asterisk' | 'freeswitch' | 'kamailio' | 'other';
  version: string;
  purpose: string;
};
