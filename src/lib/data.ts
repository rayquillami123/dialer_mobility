import type { Trunk } from './types';

export const initialTrunks: Trunk[] = [
  {
    id: '1',
    name: 'Twilio Main',
    host: 'sip.twilio.com',
    codecs: 'G.711, G.729',
    cliRoute: '/twilio/main',
    maxCPS: 100,
    enabled: true,
  },
  {
    id: '2',
    name: 'VoIP.ms Backup',
    host: 'newyork1.voip.ms',
    codecs: 'G.711, Opus',
    cliRoute: '/voipms/backup',
    maxCPS: 50,
    enabled: true,
  },
  {
    id: '3',
    name: 'Telnyx Dev',
    host: 'sip.telnyx.com',
    codecs: 'G.711, G.722, Opus',
    cliRoute: '/telnyx/dev',
    maxCPS: 25,
    enabled: false,
  },
  {
    id: '4',
    name: 'Bandwidth Emergency',
    host: 'sip.bandwidth.com',
    codecs: 'G.711',
    cliRoute: '/bandwidth/emergency',
    maxCPS: 200,
    enabled: false,
  },
];
