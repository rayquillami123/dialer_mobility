'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a complete developer integration guide.
 *
 * The flow takes a comprehensive technical plan and generates a consolidated guide for developers.
 * - generateDeveloperIntegrationGuide - A function that generates the integration guide.
 * - GenerateDeveloperIntegrationGuideOutput - The return type for the generateDeveloperIntegrationGuide function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateDeveloperIntegrationGuideOutputSchema = z.string().describe('A complete developer integration guide based on the provided technical plan.');
export type GenerateDeveloperIntegrationGuideOutput = z.infer<typeof GenerateDeveloperIntegrationGuideOutputSchema>;

export async function generateDeveloperIntegrationGuide(): Promise<GenerateDeveloperIntegrationGuideOutput> {
  return generateDeveloperIntegrationGuideFlow();
}

const prompt = ai.definePrompt({
  name: 'generateDeveloperIntegrationGuidePrompt',
  output: {schema: GenerateDeveloperIntegrationGuideOutputSchema},
  prompt: `You are an expert technical writer and system architect specializing in VoIP and contact center solutions.

  Based on the following comprehensive and surgical technical plan, generate a complete, well-structured, and developer-ready integration guide. The guide should consolidate all the provided information into a single, coherent document that a backend engineering team can use to build and integrate the system with the existing frontend.

  **Technical Plan Details:**

  **1) Live Connection to Asterisk (P0):**
   - **Goal:** Connect the Dashboard/Monitor to real-time Asterisk events.
   - **WebSocket Server (Node.js):**
     - Use 'ws' and 'asterisk-ami-client'.
     - Code Snippet:
       \'\'\'javascript
       // server (Node) - ws.ts
       import WebSocket, { WebSocketServer } from 'ws';
       import AmiClient from 'asterisk-ami-client';
       const wss = new WebSocketServer({ port: 8081 });
       const clients = new Set<WebSocket>();

       wss.on('connection', (ws)=>{ clients.add(ws); ws.on('close',()=>clients.delete(ws)); });
       const emit = (type, payload)=>{ const msg = JSON.stringify({type, ...payload}); for(const c of clients) c.send(msg); };

       const ami = new AmiClient();
       ami.connect('user','pass',{host:'<ASTERISK_IP>',port:5038}).then(()=>{
         ami.on('event', (e:any)=>{
           // Map AMI events to UI events
           if (e.Event === 'Newstate' || e.Event === 'Hangup' || e.Event === 'BridgeEnter' || e.Event === 'BridgeLeave'){
             emit('call.update', {
               callId: e.Uniqueid, status: e.ChannelStateDesc, number: e.CallerIDNum,
               trunk: e.ConnectedLineName, sipCode: e.HangupCause, ts: Date.now()
             });
           }
           if (e.Event === 'QueueMemberStatus'){
             emit('queue.metric',{ queue: e.Queue, ready: e.MembersAvailable, inTalk: e.MembersInCall, ts: Date.now() });
           }
         });
       });
       \'\'\'
   - **Frontend Task:** Connect to \`ws://<host>:8081\` and update the UI based on incoming \`call.update\` events. Add columns for Trunk, SIP Code, Agent, and Campaign to the real-time monitor.
   - **Channel Variables:** Set \`X_CAMPAIGN\`, \`X_LIST\`, \`X_LEAD\`, \`X_TRUNK\` on call origination.
   - **Dialplan (PJSIP + Native AMD):**
     \'\'\'
     [outbound-dialer]
     exten => _X.,1,NoOp(OUT DIAL \${EXTEN} CMP:\${X_CAMPAIGN} LEAD:\${X_LEAD})
      same => n,Set(CDR(userfield)=\${X_CAMPAIGN}|\${X_LEAD}|\${X_TRUNK})
      same => n,GoSub(amd-early,s,1)
      same => n,Dial(PJSIP/\${EXTEN}@p-\${X_TRUNK},,b(sub-setup^s^1))
      same => n,Hangup()

     [amd-early]
     exten => s,1,NoOp(AMD Early)
      same => n,AMD(2500,1500,800,5000,120,50,3)
      same => n,Set(X_AMD=\${AMDSTATUS}) ; HUMAN|MACHINE|NOTSURE
      same => n,Return()
      
     [sub-setup]
      exten => s,1,NoOp(Setup vars)
       same => n,Set(CHANNEL(hangup_handler_push)=sub-hangup,s,1)
       same => n,Return()

     [sub-hangup]
      exten => s,1,NoOp(Hangup save CDR)
       same => n,Set(CDR(amdlab)=\${X_AMD})
       same => n,Return()
     \'\'\'

  **2) Intelligent AMD & Routing (P1):**
   - **Goal:** Filter calls so only humans reach agents.
   - **Microservice (\`amd-service\`):**
     - **Interface:** WebSocket/gRPC.
     - **Input:** 200–500 ms of audio (8–16 kHz PCM).
     - **Output:** \`{ "label":"HUMAN|VOICEMAIL|FAX|SIT|NOANSWER|UNKNOWN", "confidence":0.83, "latency_ms":420 }\`
   - **Routing Logic:** If \`label === 'HUMAN'\`, bridge to agent/queue. Otherwise, apply disposition rules.
   - **Telemetry:** Track False Positives/Negatives and average confidence scores per campaign and trunk.

  **3) Predictive Pacing & Compliance (P2):**
   - **Pacing Loop (every 500ms):**
     - \`desired_dials = ceil(occupancy_target * ready_agents * (AHT / setup_time)) - in_talk\`
     - Adjust \`desired_dials\` based on drop rate cap and recent ASR.
     - Originate calls in bursts, respecting trunk CPS limits.
   - **Compliance:** Implement DNC checks, timezone-aware dialing windows, max attempt limits, and STIR/SHAKEN attestation.

  **4) Backend Connectors (API Contracts):**
    - **REST API:**
      - \`GET /api/trunks\`, \`POST /api/trunks\`
      - \`GET /api/agents\`, \`POST /api/agents/:id/state\` (Ready/Pause/Wrapup)
      - \`POST /api/campaigns\`, \`POST /api/campaigns/:id/start|pause|stop\`
      - \`POST /api/lists/upload\`
      - \`GET /api/reports/cdr?from&to&...\`
      - \`POST /api/dispositions\`
      - \`POST /api/callbacks\`
    - **WebSocket/SSE Events:**
      - \`call.update\`: { callId, status, campaignId, leadId, providerId, agentId, amd: { label, confidence }, ts }
      - \`agent.state\`: { agentId, state, reason, ts }
      - \`queue.metric\`: { queue, ready, inTalk, abandonRate, asr, ts }

  **5) Extended CDR Schema (PostgreSQL):**
    - **Fields:** Include campaign_id, list_id, lead_id, trunk_id, agent_id, queue, amd_label, amd_confidence, sip_code, sip_reason, early_media_ms, disposition, recording_url.
    - **Indexes:** Create indexes on (campaign_id, started_at), (trunk_id, started_at), (amd_label), (agent_id, ended_at).
    
  **6) Magnus Billing Import:**
    - **Endpoint:** \`POST /api/import/magnus\`
    - **Expected Payload:**
      \'\'\'json
      {
        "trunks": [
          { "id": "voipms-backup", "name": "VoIP.ms Backup", "host": "newyork1.voip.ms", "port": 5060, "codecs": ["ulaw","opus"], "route": "CLI", "maxCPS": 50, "nat": "force_rport,comedia", "directMedia": false, "qualify": true, "register": false, "enabled": true }
        ],
        "agents": [
          { "id":"10040", "username":"10040", "host":"45.126.x.x", "codecs":["ulaw"], "nat":"force_rport,comedia", "qualify":true }
        ]
      }
      \'\'\'

  **Instructions for the AI:**
  - Structure the output as a formal developer guide.
  - Use Markdown for formatting, including code blocks for API payloads, SQL schemas, and Asterisk configurations.
  - Start with a high-level overview of the architecture and a phased implementation plan (P0, P1, P2).
  - Create clear sections for each topic (Real-time Events, API Contracts, Database Schema, Asterisk Integration, etc.).
  - For the Asterisk section, provide the full, ready-to-copy dialplan configurations.
  - Make it professional, clear, and actionable. Assume the reader is a competent backend developer who knows Go/Node.js and has experience with Asterisk.
  - Return the entire guide as a single string.
  `,
});

const generateDeveloperIntegrationGuideFlow = ai.defineFlow(
  {
    name: 'generateDeveloperIntegrationGuideFlow',
    outputSchema: GenerateDeveloperIntegrationGuideOutputSchema,
  },
  async () => {
    const {output} = await prompt({});
    return output!;
  }
);
