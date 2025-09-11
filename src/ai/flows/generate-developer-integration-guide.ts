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
  prompt: `You are a principal engineer and system architect specializing in VoIP, contact center solutions, and real-time communication platforms.

Your task is to take the following comprehensive technical blueprint and generate a complete, professional, and developer-ready integration guide. The guide should be structured logically, starting with a high-level architectural overview and then drilling down into specific implementation details for each component. The target audience is a skilled backend engineering team proficient in Node.js/Go, SQL, and VoIP technologies.

**Technical Blueprint & Professional Dialer Specifications:**

**1. Core Dialer Features (Must-Have):**
   - **Dialing Modes:** Predictive, Power/Progressive, Preview/Manual, Press-1/IVR Campaign.
   - **Campaign & List Management:** Bulk import, configurable retry rules, dialing windows by timezone, list prioritization.
   - **ACD & Queues:** Skills-based routing, agent states (Ready, Busy, Wrapup, Pause with reason codes), configurable abandon rate limits.
   - **Answering Machine Detection (AMD):** Low-latency (<1s) detection of Human, Voicemail, FAX, SIT tones. Critical for routing only live humans to agents. Telemetry per campaign and provider is required.
     - *Asterisk Ref:* \`AMD()\` app, exposes \`AMDSTATUS\`.
     - *FreeSWITCH Ref:* \`mod_vmd\`/\`mod_avmd\` for beep detection, or commercial modules like \`mod_com_amd\`.
   - **Compliance:** DNC list support, adherence to abandon rate caps (e.g., 3% TSR rule in the US), STIR/SHAKEN attestation, and consent-based recording.
   - **SIP Trunk Management:** CPS limits (global and per-route), failover logic, flexible Caller ID strategies, real-time health monitoring (ASR, RTT, %SIT/FAX, SIP error codes).
   - **Real-time Monitoring & Reporting:** Live dashboard showing call states (Ringing, Connected, Hangup), AMD labels, provider usage. Extended CDRs are crucial.
   - **QA & Quality:** Call recordings, agent scorecards, full-text search on recordings (via ASR), monitoring of jitter, RTT, and packet loss.
   - **Security:** Privilege separation, transport encryption (TLS/SRTP), access control for management interfaces (AMI/ESL/ARI), and comprehensive audit logs.
   - **Observability:** Granular metrics per campaign, provider, and agent. Alarms for critical failures (e.g., ASR drop, CPS limit hit, high abandon rate).

**2. Key Protocols & Standards (SIP/RTP/SDP):**
   - **SIP (RFC 3261):** Session Initiation Protocol for signaling.
   - **RTP/RTCP (RFC 3550):** Real-time Transport Protocol for audio.
   - **SDP (RFC 8866):** Session Description Protocol for media negotiation.
   - **DTMF (RFC 4733):** Out-of-band DTMF transport via RTP "telephone-event".
   - **NAT Traversal (RFC 3581):** Use symmetric response (\`rport\`) for NAT. In Asterisk PJSIP, this means \`rtp_symmetric=yes\`, \`force_rport=yes\`, and \`rewrite_contact=yes\`.

**3. Platform Integration Blueprints (Asterisk vs. FreeSWITCH):**

   **A) Asterisk Integration:**
     - **AMI (Asterisk Manager Interface):** TCP socket for events and actions (Originate, Hangup). Use for real-time monitoring and basic control.
     - **ARI (Asterisk REST Interface):** Modern REST API + WebSocket for fine-grained control of channels, bridges, and external media. Best for custom dialer logic.
     - **External Media (ARI):** Use "ExternalMedia" channels to stream audio to an external AI/AMD service and receive results.
     - **Dialplan Apps:** \`AMD()\` for native AMD, \`Dial()\` for trunk connections.
     - **Typical Flow:**
       1. Originate call via AMI/ARI with channel variables (\`X_CAMPAIGN\`, \`X_LEAD\`, \`X_TRUNK\`).
       2. On early media, use \`AMD()\` or bridge to an ARI ExternalMedia channel for AI-based AMD.
       3. If HUMAN, bridge to an agent queue. If MACHINE, execute rules (hangup, play message, retry).
       4TAIN, amd_confidence, sip_code\`).

   **B) FreeSWITCH Integration:**
     - **ESL (mod_event_socket):** TCP interface (inbound/outbound) for full control and event subscription. The primary integration point.
     - **Commands:** Use \`originate\` for new calls, \`bridge\` for connecting channels.
     - **Events:** Subscribe to \`CHANNEL_CREATE\`, \`CHANNEL_ANSWER\`, \`CHANNEL_HANGUP\`, \`DTMF\`, etc.
     - **ACD:** \`mod_callcenter\` provides robust queueing capabilities.
     - **AMD:** Use \`mod_avmd\`/\`mod_vmd\` for voicemail beep detection or a commercial AMD module. For external AI, use \`local_stream\` or a custom socket application.

**4. Proposed Microservices Architecture:**
   - **Dialer-Orchestrator:** Core service. Runs the predictive pacing loop (every ~500ms), manages campaign state, and assigns leads.
   - **AMD-Engine:** A dedicated gRPC/WebSocket service that receives early-media audio (200-500ms PCM stream) and returns a classification ({label, confidence}).
   - **Compliance-Service:** Enforces DNC, timezone dialing windows, attempt limits, and STIR/SHAKEN policies.
   - **Quality-Monitor:** Aggregates and analyzes ASR, SIP error codes, and RTT/jitter per provider to assess trunk health.
   - **Storage Layer:** PostgreSQL for relational data (CDRs, entities), S3-compatible storage for call recordings.
   - **Real-time Layer:** WebSocket/SSE server broadcasting events consumed from AMI/ESL.

**5. API Contracts & Data Models:**

   **A) Real-time Events (WebSocket/SSE):**
     - \`call.update\`: \`{ callId, status, campaignId, leadId, providerId, agentId, amd: { label, confidence }, ts }\`
     - \`agent.state\`: \`{ agentId, state, reason, ts }\`
     - \`queue.metric\`: \`{ queue, ready, inTalk, abandonRate, asr, ts }\`

   **B) REST API:**
     - \`GET /api/trunks\`, \`POST /api/trunks\`
     - \`GET /api/agents\`, \`POST /api/agents/:id/state\` (Ready/Pause/Wrapup)
     - \`POST /api/campaigns\`, \`POST /api/campaigns/:id/start|pause|stop\`
     - \`POST /api/lists/upload\`
     - \`GET /api/reports/cdr?from&to&...\`
     - \`POST /api/dispositions\`, \`POST /api/callbacks\`
     - \`POST /api/import/magnus\` (For importing existing Magnus Billing configurations)

   **C) PostgreSQL Schema (Simplified):**
     - **campaigns**: id, name, type, pacing_ratio, drop_cap_pct, amd_engine, ...
     - **lists**: id, name, created_at; **leads**: id, list_id, phone, state, tz, meta jsonb
     - **trunks**: id, name, host, codecs, route, max_cps, enabled
     - **queues**: id, name; **agents**: id, name, skills jsonb, state
     - **cdr**: id, call_id, campaign_id, lead_id, trunk_id, agent_id, queue, started_at, connected_at, ended_at, duration, amd_label, amd_confidence, sip_code, disposition, recording_url
     - **callbacks**: id, lead_id, campaign_id, when_at, priority, notes
     - **audit**: id, actor, action, target, ts, ip
     - *Indexes:* (campaign_id, started_at), (trunk_id, started_at), (amd_label), (agent_id, ended_at).

**6. Magnus Billing Import Payload Example:**
   - Endpoint: \`POST /api/import/magnus\`
   - Payload:
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

**7. Live Connection to Asterisk (P0 - Quickest Path to Live Data):**
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
   - **Frontend Task:** Connect to \`ws://<host>:8081\` and update the UI based on incoming events.
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

**Instructions for the AI:**
- Generate a comprehensive, well-structured developer integration guide.
- Use Markdown for formatting. Include clear headings, lists, and properly formatted code blocks for API payloads, SQL schemas, and Asterisk/FreeSWITCH configurations.
- Begin with a high-level overview of the architecture and a phased implementation plan (P0, P1, P2...).
- Dedicate clear sections to each major topic (Real-time Eventing, API Contracts, Database Schema, Platform Integration for Asterisk/FreeSWITCH, Advanced Features like Predictive Pacing, etc.).
- Ensure all provided snippets are included and explained in the context of the overall system.
- The guide must be professional, actionable, and assume a competent backend developer audience.
- Return the entire guide as a single, consolidated string.
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
