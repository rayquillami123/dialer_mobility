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

**3.1. Dashboard (P0):**
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
   - **UI Adds:** Selector for Campaign/Provider + quick range (1h/Today/24h). Mini sparklines for 5-min trends.
   - **DoD:** WS "kpi.tick" cada 1s. Cambiar scope sin refrescar (global/campaña/troncal).

**3.2. Real-Time Monitor (P0):**
   - **Required Columns:** Campaign, Trunk, SIP Code, Queue, Agent, AMD Confidence.
   - **Required Filters:** By Campaign, Trunk, Status, and AMD label. Search by phone number.
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
   - **DoD:** UI latency <500ms from event. On hangup, row grays out for 3-5s then disappears.

**3.3. Campaigns (P0):**
   - **Required Fields:** Destination Queue (for \`mod_callcenter\`), Trunk Weights/CPS Caps, Start/Pause/Stop actions in header.
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
   - **DoD:** Orchestrator originates calls with correct vars. HUMANs are routed to \`callcenter\`; others follow rules. Pacing respects abandon cap.

**3.4. Lists / Leads (P0):**
   - **CSV Import Validation:** Normalize numbers to E.164, detect timezone, check against DNC, find duplicates. Show import progress.
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
   - **DoD:** Each lead record has \`attempts\`, \`lastDisposition\`, \`nextTryAt\`. List-level metrics (coverage, contact rate) are available.

**3.5. Providers / Trunks (P1):**
   - **UI Adds:** Health table per trunk (ASR 5m, PDD, SIP mix, %SIT/FAX, CPS). Failover policy configuration.
   - **DoD:** Alerts trigger on ASR < 20%, PDD > 5s, SIT/FAX > 3%, CPS > 90% of cap. "Test Route" button originates a test call.

**3.6. Queues & Agents (P1):**
   - **UI Adds:** Manage queues/tiers, assign agents. Agent metrics (SLA, AHT). Softphone UI for WebRTC (JsSIP or Verto).
   - **Backend Management:** Expose functionality to execute \`callcenter_config\` commands.
   - **Real-time State:** Use \`CUSTOM callcenter::info\` events to update agent/queue status on the UI.
   - **DoD:** \`callcenter::info\` events drive live UI metrics. Agent state changes affect predictive pacing (occupancy).

**3.7. Dispositions & Callbacks (P0->P1):**
   - **UI Adds:** CRUD for dispositions and their associated rules (retry, DNC, etc.). Calendar for scheduling callbacks.
   - **DoD:** At end of call, orchestrator applies disposition rules to update lead/schedule callbacks.
   
**3.8. Audio TTS/Prompts & Scripts (P2):**
    - **UI Adds:** Library of prompts, assignment to campaigns, caching. Voicemail drop config per campaign (file or TTS). Script editor with variables ({{firstName}}), quick responses, and versioning.
    - **DoD:** Audio preview player, normalized format (e.g., WAV 16kHz).

**3.9. Reports (P1):**
    - **UI Adds:** Filters (date, campaign, provider, agent, disposition, AMD). Grouping by campaign, provider, agent, hour. Header metrics (ASR, ACD, contact rate, AMD split, abandon 60s).
    - **DoD:** Standard views for Campaign, Provider, Agent, Hour, and AMD matrix. CSV export and scheduled reports.

**3.10. Integrations (P2):**
    - **UI Adds:** "Generate Tech Guide" button to provide a zip with config files. Checklist for fs_cli commands, ESL tests, CDR posts.
    - **DoD:** Guide generation with all necessary configs and a README.

**3.11. Audit Log (P2):**
    - **UI Adds:** Audit table (timestamp, actor, IP, action, target, details). Filters by date, user, action. CSV export.
    - **DoD:** Log critical actions (CRUD campaigns, start/stop, trunk changes, logins). 180-day retention.

**3.12. Compliance (P2):**
    - **UI Adds:** Config for abandon cap (60s window), dialing windows by timezone, DNC lists, ring timeouts. Consent/recording fields.
    - **DoD:** Pre-dial check to block calls outside windows or to DNC numbers.

**4. Dialplan & AMD Logic (FreeSWITCH XML):**
   - **Audio Fork for AI AMD:**
     \`uuid_audio_fork \\\${uuid} start ws://amd-svc:8080 {mix=true,rate=16000,format=L16}\`

   - **Routing based on AMD result (set by external service):**
     \`\`\`xml
     <condition field="\\\${AMD_LABEL}" expression="^HUMAN$">
       <action application="set" data="cc_export_vars=X_CAMPAIGN,X_LEAD,X_TRUNK"/>
       <action application="callcenter" data="sales"/>
     </condition>
     <condition field="\\\${AMD_LABEL}" expression="^(VOICEMAIL|FAX|SIT|UNKNOWN)$">
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
    <!-- Optional ODBC DSN if you share state across nodes -->
    <!-- <param name="odbc-dsn" value="pgsql://user:pass@127.0.0.1:5432/ccdb"/> -->
    <param name="debug" value="0"/>
  </settings>

  <queues>
    <queue name="sales">
      <param name="strategy" value="longest-idle-agent"/>
      <param name="time-base-score" value="queue"/>
      <param name="moh-sound" value="local_stream://moh"/>
      <param name="max-wait-time" value="3600"/>
      <param name="max-wait-time-with-no-agent" value="30"/>
      <param name="tier-rules-apply" value="true"/>
      <param name="tier-rule-wait-second" value="15"/>
      <param name="tier-rule-wait-multiply-level" value="true"/>
      <param name="discard-abandoned-after" value="5"/>
      <param name="abandoned-resume-allowed" value="false"/>
      <param name="no-answer-delay-time" value="2"/>
      <param name="wrap-up-time" value="3"/>
    </queue>
  </queues>

  <agents>
    <agent name="1001" type="callback" contact="user/1001"
           status="Logged Out" max-no-answer="3" wrap-up-time="3"
           no-answer-delay-time="2" ready-timeout="0"/>
    <agent name="1002" type="callback" contact="user/1002"
           status="Logged Out" max-no-answer="3" wrap-up-time="3"
           no-answer-delay-time="2" ready-timeout="0"/>
  </agents>

  <tiers>
    <tier agent="1001" queue="sales" level="1" position="1"/>
    <tier agent="1002" queue="sales" level="1" position="1"/>
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
  "uuid": "\\\${uuid}", "call_id": "\\\${sip_call_id}", "direction": "\\\${direction}",
  "start_stamp": "\\\${start_stamp}", "answer_stamp": "\\\${answer_stamp}", "end_stamp": "\\\${end_stamp}",
  "duration": \\\${duration}, "billsec": \\\${billsec},
  "hangup_cause": "\\\${hangup_cause}", "sip_hangup_cause": "\\\${sip_hangup_cause}",
  "campaign_id": "\\\${X_CAMPAIGN}", "list_id": "\\\${X_LIST}", "lead_id": "\\\${X_LEAD}",
  "trunk_id": "\\\${X_TRUNK}", "queue": "\\\${cc_queue}", "agent_id": "\\\${cc_agent}",
  "amd_label": "\\\${AMD_LABEL}", "amd_confidence": "\\\${AMD_CONFIDENCE}",
  "progress_ms": "\\\${progress_ms}", "early_media_ms": "\\\${early_media_ms}"
}
      ]]\>
    </template>
  </templates>
</configuration>
\`\`\`

**7. Backend: Core Technical Services**

**A) ESL Aggregator (P0):**
   - **Subscription:** \`CHANNEL_CREATE/ANSWER/HANGUP\`, \`CUSTOM callcenter::info\`.
   - **Logic:** Aggregates metrics in-memory or in Redis across 5s, 60s, and 5m windows (ASR, CPS, CC, abandonment, AMD split, ACD).
   - **Output:** Publishes \`kpi.tick\` and \`call.update\` events to the UI via WebSocket.

**B) CDR Handler (P0):**
   - **Endpoint:** Exposes a \`/cdr\` endpoint for \`mod_json_cdr\` to POST to.
   - **Logic:** Responds with a 2xx status code to acknowledge receipt. If it fails, FreeSWITCH will save the CDR to \`log-dir\`.
   - **Data to Persist:** \`campaign_id, list_id, lead_id, trunk_id, queue, agent_id, start/answer/end, billsec, sip_hangup_cause, hangup_cause, amd_label/confidence/latency_ms, recording_url\`. Remember to use \`export_vars\` in the originate command.

**C) AMD/IA Service (P1):**
   - **Input:** Receives audio via WebSocket from \`mod_audio_fork\` (PCM L16 @ 16kHz).
   - **Output:** Returns a classification and sets channel variables: \`AMD_LABEL\`, \`AMD_CONFIDENCE\`, \`AMD_LATENCY_MS\`.
   - **Routing Rules:** \`HUMAN\` -> \`callcenter\`; \`VOICEMAIL\` -> trigger beep detection (\`avmd\`) and drop message; \`FAX/SIT\` -> hang up and flag the provider/list for review.

**D) Predictive Predictor (P1):**
   - **Algorithm:** A pacing loop that balances occupancy and AHT goals, constrained by CPS limits and the 60s abandonment rate, and adjusted by the 5m ASR.
   - **Distribution:** Distributes calls across trunks based on configured weights and CPS capacity.

**8. Seguridad y escalado (recomendado)**
   - ESL en 127.0.0.1 o detrás de proxy + ACL + password fuerte.
   - TLS para WSS/WebRTC; rotación de tokens/API keys.
   - Cola de jobs (Redis/Rabbit) para originate masivo; idempotencia por lead_id.
   - FS en clúster “multi-gw” con base CDR/queue externa.

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
