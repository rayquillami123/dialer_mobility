'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a complete developer integration guide.
 *
 * The flow takes a comprehensive technical plan and generates a consolidated guide for developers.
 * - generateDeveloperIntegrationGuide - A function that generates the integration guide.
 */

import {ai} from '@/ai/genkit';
import { GenerateDeveloperIntegrationGuideOutputSchema, type GenerateDeveloperIntegrationGuideOutput } from './schemas';

export async function generateDeveloperIntegrationGuide(): Promise<GenerateDeveloperIntegrationGuideOutput> {
  return generateDeveloperIntegrationGuideFlow();
}

const prompt = ai.definePrompt({
  name: 'generateDeveloperIntegrationGuidePrompt',
  output: {schema: GenerateDeveloperIntegrationGuideOutputSchema},
  prompt: `You are a principal engineer and system architect specializing in VoIP, contact center solutions, and real-time communication platforms, with a deep expertise in FreeSWITCH.

Your task is to take the following comprehensive technical blueprint for a professional dialer system and generate a complete, professional, and developer-ready integration guide. The guide should be structured logically, starting with a high-level architectural overview and then drilling down into specific implementation details for each component, including module configuration, API contracts, database schemas, and operational logic (telemetry, KPIs, etc.). The target audience is a skilled backend engineering team proficient in Node.js/Go, SQL, and VoIP technologies.

**Dialer Technical Blueprint: FreeSWITCH Edition**

**1. Core Architecture ("FreeSWITCH-first"):**
   - **Engine:** FreeSWITCH with key modules enabled.
   - **Orchestrator:** A custom service (e.g., Node.js/Go) responsible for the predictive pacing loop, retry logic, compliance enforcement (DNC, dialing windows, abandon caps), and provider/CPS routing.
   - **Real-time Service:** A WebSocket/SSE server that subscribes to FreeSWITCH events via ESL and broadcasts them to the UI.
   - **AMD/AI Service:** A dedicated microservice that receives forked audio (via mod_audio_fork) and returns low-latency classifications (HUMAN, VOICEMAIL, etc.).
   - **Reporting Layer:** An extended CDR schema in PostgreSQL, with recordings stored in a blob/S3-compatible object store.

**2. Required FreeSWITCH Modules:**
   - **mod_event_socket:** The core for real-time control and eventing (ESL).
   - **mod_callcenter:** Provides robust ACD/queue capabilities for routing calls to agents.
   - **mod_audio_fork:** Duplicates channel audio and streams it via WebSocket to an external service (essential for AI-based AMD/ASR).
   - **mod_avmd / mod_vmd:** For voicemail beep detection (useful for reliable voicemail drops).
   - **mod_json_cdr / mod_cdr_pg_csv:** For pushing CDRs to an HTTP endpoint or directly to a PostgreSQL database.

**3. UI/Backend Integration Plan by Screen:**

**3.1. Dashboard:**
   - **Required KPIs:** ASR (5m), CPS (current), CC (concurrency), Abandon Rate (60s), ACD/ALOC.
   - **Data Source:** A real-time aggregator (in-memory or Redis-based) consuming ESL events.
   - **WebSocket Event Contract (tick every 1s):**
     \`\`\`json
     {
       "type": "kpi.tick",
       "scope": "global|campaign|trunk",
       "id": "global",
       "asr5m": 0.52, "acd": 67, "cps": 14, "cc": 122,
       "abandon60s": 0.018, "humanRate": 0.31,
       "amd": {"HUMAN": 12, "VOICEMAIL": 8, "FAX": 1, "SIT": 2, "UNKNOWN": 5}
     }
     \`\`\`

**3.2. Real-Time Monitor:**
   - **Required Columns:** Campaign, Trunk, SIP Code, Queue, Agent.
   - **Required Filters:** By Campaign, Trunk, and Status.
   - **ESL Events to Subscribe:** \`CHANNEL_CREATE\`, \`CHANNEL_ANSWER\`, \`CHANNEL_HANGUP\`, \`CUSTOM callcenter::info\`.
   - **WebSocket Event Contract (per call event):**
     \`\`\`json
     {
       "type": "call.update",
       "uuid": "5a...", "ts": 1736722800123,
       "campaignId": "cmp_42", "trunkId": "gw_main",
       "number": "+12223334444",
       "state": "Ringing|Connected|Hangup",
       "amd": {"label": "HUMAN", "conf": 0.84},
       "sip": "486", "queue": "sales", "agentId": "1001", "billsec": 10
     }
     \`\`\`

**3.3. Campaigns (Create/Edit):**
   - **Required Fields:** Destination Queue (for \`mod_callcenter\`), Trunk Weights/CPS Caps.
   - **API Endpoints:**
     - \`POST /api/campaigns\` (Create)
     - \`PATCH /api/campaigns/:id\` (Edit)
     - \`POST /api/campaigns/:id/start|pause|stop\`
   - **Create Payload Example:**
     \`\`\`json
     {
       "name": "Ventas Q1", "type": "predictive",
       "listId": "lst_2025_12_09", "queue": "sales",
       "trunkPolicy": {"weights": {"gw_main": 70, "gw_backup": 30}, "caps": {"gw_main": 20, "gw_backup": 10}},
       "pacing": 2, "maxChannels": 50,
       "abandonCap": 0.03,
       "amd": {"engine": "hybrid", "minConfidence": 0.7, "windowMs": 900},
       "predictive": {"targetOccupancy": 0.85, "ahtSec": 240}
     }
     \`\`\`
   - **FreeSWITCH Originate Command (from Orchestrator):**
     \`\`\`
     originate {origination_caller_id_number=+13055550123,X_CAMPAIGN=cmp_42,X_LIST=lst_2025_12_09,X_LEAD=lead_99,X_TRUNK=gw_main,export_vars='X_CAMPAIGN,X_LIST,X_LEAD,X_TRUNK'} sofia/gateway/gw_main/12223334444 &park()
     \`\`\`

**3.4. Lists / Leads:**
   - **CSV Import Validation:** Normalize numbers to E.164, detect timezone, check against DNC, find duplicates.
   - **Retry Logic (by disposition):**
     \`\`\`json
     {
       "NOANSWER": {"cooldownMin": 30, "maxAttempts": 4},
       "BUSY": {"cooldownMin": 10, "maxAttempts": 3}
     }
     \`\`\`
   - **API Endpoints:**
     - \`POST /api/lists/:id/import\` (for CSV upload)
     - \`GET /api/lists/:id/leads\` (paginated)

**3.5. Queues (mod_callcenter):**
   - **Backend Management:** Expose functionality to execute \`callcenter_config\` commands.
   - **Real-time State:** Use \`CUSTOM callcenter::info\` events to update agent/queue status on the UI.

**3.6. Agent Desk:**
   - **State Management:** \`POST /api/agents/:id/state {"state": "Available"}\` translates to \`callcenter_config agent set status <agent_id> Available\`.
   - **WebRTC:** Use JsSIP with a FreeSWITCH Sofia profile configured for WSS and DTLS-SRTP.

**4. Dialplan & AMD Logic (FreeSWITCH XML):**
   - **Audio Fork for AI AMD:**
     \`\`\`xml
     <action application="javascript" data="scripts/audio_fork.js"/>
     \`\`\`
     *Or using the application directly:*
     \`uuid_audio_fork \${uuid} start ws://amd-svc:8080 {mix=true,rate=16000,format=L16}\`

   - **Routing based on AMD result (set by external service):**
     \`\`\`xml
     <condition field="\${AMD_LABEL}" expression="^HUMAN$">
       <action application="set" data="cc_export_vars=X_CAMPAIGN,X_LEAD,X_TRUNK"/>
       <action application="callcenter" data="sales"/>
     </condition>
     <condition field="\${AMD_LABEL}" expression="^(VOICEMAIL|FAX|SIT|UNKNOWN)$">
       <action application="hangup" data="NORMAL_CLEARING"/>
     </condition>
     \`\`\`

**5. CDR & Reporting Schema (PostgreSQL):**
   - **Mechanism:** Use \`mod_json_cdr\` to post a JSON payload to a backend API endpoint.
   - **Extended Fields (PostgreSQL table \`cdr\`):**
     - id, call_id, start_stamp, answer_stamp, end_stamp, billsec
     - sip_hangup_cause, hangup_cause, progress_ms, early_media_ms
     - campaign_id, list_id, lead_id, trunk_id, agent_id, queue
     - amd_label, amd_confidence, disposition, recording_url

**6. FreeSWITCH Configuration Templates:**

**A. event_socket.conf.xml (for ESL):**
\`\`\`xml
<configuration name="event_socket.conf" description="Event Socket">
  <settings>
    <param name="listen-ip" value="127.0.0.1"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="CAMBIA_ESTA_CLAVE_SUPER_SECRETA"/>
    <param name="apply-inbound-acl" value="loopback.auto"/>
  </settings>
</configuration>
\`\`\`

**B. callcenter.conf.xml (for ACD/Queues):**
\`\`\`xml
<configuration name="callcenter.conf" description="Callcenter / ACD">
  <settings>
    <param name="debug" value="0"/>
  </settings>
  <queues>
    <queue name="sales">
      <param name="strategy" value="longest-idle-agent"/>
      <param name="moh-sound" value="local_stream://moh"/>
      <param name="tier-rules-apply" value="true"/>
      <param name="tier-rule-wait-second" value="15"/>
      <param name="wrap-up-time" value="3"/>
    </queue>
  </queues>
  <agents>
    <agent name="1001" type="callback" contact="user/1001" status="Logged Out"/>
  </agents>
  <tiers>
    <tier agent="1001" queue="sales" level="1" position="1"/>
  </tiers>
</configuration>
\`\`\`

**C. json_cdr.conf.xml (for CDRs via HTTP):**
\`\`\`xml
<configuration name="json_cdr.conf" description="JSON CDR to HTTP">
  <settings>
    <param name="log-dir" value="/var/log/freeswitch/json_cdr"/>
    <param name="url" value="https://api.mi-dialer.com/cdr"/>
    <param name="auth-scheme" value="Bearer"/>
    <param name="auth-credential" value="PON_AQUI_TU_TOKEN"/>
    <param name="retries" value="3"/>
    <param name="delay" value="5"/>
    <param name="log-b-leg" value="true"/>
    <param name="template" value="default"/>
  </settings>
  <templates>
    <template name="default"><![CDATA[
{
  "uuid": "\${uuid}", "call_id": "\${sip_call_id}", "direction": "\${direction}",
  "start_stamp": "\${start_stamp}", "answer_stamp": "\${answer_stamp}", "end_stamp": "\${end_stamp}",
  "duration": \${duration}, "billsec": \${billsec},
  "hangup_cause": "\${hangup_cause}", "sip_hangup_cause": "\${sip_hangup_cause}",
  "campaign_id": "\${X_CAMPAIGN}", "list_id": "\${X_LIST}", "lead_id": "\${X_LEAD}",
  "trunk_id": "\${X_TRUNK}", "queue": "\${cc_queue}", "agent_id": "\${cc_agent}",
  "amd_label": "\${AMD_LABEL}", "amd_confidence": "\${AMD_CONFIDENCE}",
  "progress_ms": "\${progress_ms}", "early_media_ms": "\${early_media_ms}"
}
      ]]\>
    </template>
  </templates>
</configuration>
\`\`\`

**Instructions for the AI:**
- Generate a comprehensive, well-structured developer integration guide based on this FreeSWITCH-first blueprint.
- Use Markdown for formatting. Include clear headings, lists, and properly formatted code blocks for API payloads, SQL schemas, and FreeSWITCH configurations/commands.
- Ensure all provided snippets and SQL queries are included and explained in the context of the overall system.
- The guide must be professional, actionable, and assume a competent backend developer audience with FreeSWITCH experience.
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
