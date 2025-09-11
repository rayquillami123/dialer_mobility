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
  prompt: `You are a principal engineer and system architect specializing in VoIP, contact center solutions, and real-time communication platforms, with a deep expertise in FreeSWITCH and Asterisk.

Your task is to take the following comprehensive technical blueprint for a professional dialer system and generate a complete, professional, and developer-ready integration guide. The guide should be structured logically, starting with a high-level architectural overview and then drilling down into specific implementation details for each component, including module configuration, API contracts, database schemas, and operational logic (telemetry, KPIs, etc.). The target audience is a skilled backend engineering team proficient in Node.js/Go, SQL, and VoIP technologies.

**Dialer Technical Blueprint & Telemetry Plan:**

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
   - **Standard Modules:** mod_dptools, mod_commands, codec modules (mod_opus, mod_pcmu, mod_pcma), mod_sofia, etc.

**3. Outbound Call Flow & Variable Management:**
   - **Originate Command:** Use the \`originate\` command to launch calls, injecting all necessary metadata as channel variables.
     - **Template:** \`originate <call-url> <app>|&<app>(args)\`
     - **Example with Variables:**
       \`\`\`
       originate {origination_caller_id_number=+13051234567,cc_export_vars=X_CAMPAIGN,X_LEAD,X_TRUNK,X_CAMPAIGN=cmp_42,X_LEAD=lead_99,X_TRUNK=voipms} sofia/gateway/voipms/17865551212 &park()
       \`\`\`
     - The \`cc_export_vars\` or \`export_vars\` setting is critical for ensuring variables persist to the B-leg of the call for CDRs and agent context.

   - **XML Dialplan (Minimum):**
     \`\`\`xml
     <extension name="outbound-bridge">
       <condition field="destination_number" expression="^(\\d+)$">
         <action application="set" data="export_vars=X_CAMPAIGN,X_LEAD,X_TRUNK"/>
         <action application="set" data="hangup_after_bridge=true"/>
         <action application="bridge" data="sofia/gateway/\${X_TRUNK}/$1"/>
       </condition>
     </extension>
     \`\`\`

**4. Queues & Agents (mod_callcenter):**
   - **Function:** This module provides a full-featured ACD for managing agent queues. It is the target for calls classified as HUMAN.
   - **Configuration:** Define queues with specific strategies (e.g., \`longest-idle-agent\`), and add agents and tiers via the CLI or ESL.
   - **Management Commands:**
     \`\`\`
     callcenter_config queue add sales
     callcenter_config agent add 1001@default
     callcenter_config tier add sales 1001@default 1 1
     \`\`\`
   - **Routing:** Use \`<action application="callcenter" data="sales@default"/>\` in the dialplan to transfer a call to the "sales" queue.

**5. Real-time Eventing (mod_event_socket):**
   - **Mechanism:** Connect to the FreeSWITCH Event Socket Layer (ESL) to subscribe to system-wide events.
   - **Events to Monitor:** \`CHANNEL_CREATE\`, \`CHANNEL_ANSWER\`, \`CHANNEL_HANGUP\`, \`DTMF\`, and \`CUSTOM callcenter::info\`.
   - **Example (Node.js ESL Client → UI WebSocket):**
     \'\'\'javascript
     import net from 'net';
     const sock = net.createConnection({host: '127.0.0.1', port: 8021});
     sock.on('data', buf => {
       const s = buf.toString();
       if (s.includes('Content-Type: auth/request')) {
         sock.write('auth ClaveSuperSecreta\\n\\n'); // Replace with your ESL password
         sock.write('event json CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP CUSTOM callcenter::info\\n\\n');
       } else if (s.includes('Content-Type: text/event-json')) {
         const eventJson = JSON.parse(s.substring(s.indexOf('\\n\\n') + 2));
         // Map FS event to UI event and emit via WebSocket to frontend
       }
     });
     \'\'\'

**6. Answering Machine Detection (AMD):**
   - **Voicemail Beep Detection (Simple):** Use \`mod_avmd\`/\`mod_vmd\` for reliable voicemail drops (triggers on the beep).
   - **AI-Powered AMD (Advanced):** Use \`mod_audio_fork\` to stream early media (200-500ms) to a custom AI microservice via WebSockets. The service should return a classification (\`{label, confidence}\`) in under 1 second.
     - **Command:** \`uuid_audio_fork <uuid> start ws://amd-svc:8080 {mix=true,channels=mono,rate=16000,format=L16}\`
   - **Routing Logic:** If the AMD result is \`HUMAN\`, route immediately to a \`mod_callcenter\` queue. All other results (VOICEMAIL, FAX, SIT, etc.) should trigger rules like playing a message, hanging up, or retrying.

**7. Predictive Pacing Algorithm:**
   - **Loop Frequency:** Every ~500ms.
   - **Core Logic:**
     1. \`ready_agents = get_agents_in_state('Ready')\`
     2. \`in_talk = get_connected_calls()\`
     3. \`avg_setup_time = p95_call_setup_time_last_5m()\`
     4. \`desired_dials = ceil(target_occupancy * ready_agents * (avg_handle_time / avg_setup_time)) - in_talk\`
   - **Compliance & Quality Adjustments:**
     - Clamp \`desired_dials\` to respect the abandon rate cap (e.g., <= 3% over a 60s window).
     - Adjust \`desired_dials\` based on the recent Answer-Seizure Ratio (ASR) to avoid over-dialing on low-performing routes.
   - **Execution:** Distribute the final number of dials across available providers based on their CPS limits and configured weights.

**8. CDR & Reporting Schema (PostgreSQL):**
   - **Mechanism:** Use \`mod_json_cdr\` to post a JSON payload to a backend API endpoint, or \`mod_cdr_pg_csv\` for direct-to-database insertion.
   - **Extended Fields (PostgreSQL table \`cdr\`):**
     - id, call_id, start_stamp, answer_stamp, end_stamp, billsec
     - sip_hangup_cause, hangup_cause, progress_ms, early_media_ms
     - campaign_id, list_id, lead_id, trunk_id, agent_id, queue
     - amd_label, amd_confidence, disposition, recording_url

**9. Telemetry & KPIs:**

   **A. KPIs and Formulas:**
   - **ASR (Answer-Seizure Ratio):** \`(calls with billsec > 0) / total_attempts\`
   - **ACD/ALOC (Average Call Duration):** \`avg(billsec) where billsec > 0\`
   - **PDD (Post-Dial Delay):** Approx. \`answer_stamp - start_stamp\`
   - **Contact Rate:** \`unique_human_leads_reached / unique_leads_dialed\`
   - **Abandon Rate (TSR):** \`(human_calls - agent_bridges) / human_calls\` (within a 2-second window)
   - **Conversion Rate:** \`sales_dispositions / human_calls\`
   - **AHT (Average Handle Time):** \`(talk + hold + wrapup) / total_handled_calls\`
   - **Occupancy:** \`(talk + hold) / (ready + talk + hold + wrapup + pause)\`

   **B. Real-time Monitoring (via ESL & Redis):**
   - Subscribe to \`CHANNEL_CREATE/ANSWER/HANGUP\`, \`CUSTOM callcenter::info\`.
   - Maintain counters in Redis for 5s/60s/5min windows (e.g., \`cps_5s\`, \`asr_5min\`, \`abandon_60s\`).
   - Publish aggregated KPIs to the UI via WebSocket:
     \`\`\`json
     {
       "type": "kpi.tick",
       "campaignId": "cmp_1",
       "asr5m": 0.54, "acd": 69, "cps": 32, "cc": 420,
       "abandon60s": 0.021, "humanRate": 0.31,
       "amd": {"HUMAN": 12, "VM": 8, "FAX": 2, "SIT": 1, "UNK": 5}
     }
     \`\`\`

   **C. SQL Queries for Reporting (PostgreSQL):**

   - **ASR/ACD per Campaign/Provider:**
     \`\`\`sql
     SELECT campaign_id, trunk_id,
            sum(CASE WHEN billsec>0 THEN 1 ELSE 0 END)::float / count(*) AS asr,
            avg(NULLIF(billsec,0)) AS acd_aloc
     FROM cdr
     WHERE start_stamp BETWEEN (now() - interval '24 hour') AND now()
     GROUP BY campaign_id, trunk_id;
     \`\`\`

   - **SIP Error Mix:**
     \`\`\`sql
     SELECT trunk_id, sip_hangup_cause, count(*) AS n
     FROM cdr
     WHERE start_stamp BETWEEN (now() - interval '24 hour') AND now()
     GROUP BY trunk_id, sip_hangup_cause
     ORDER BY trunk_id, n DESC;
     \`\`\`

   - **Abandon Rate (TSR Safe Harbor):**
     \`\`\`sql
     SELECT campaign_id,
       sum(CASE WHEN amd_label='HUMAN' AND (agent_id IS NULL OR (answer_stamp IS NOT NULL AND (extract(epoch from (answer_stamp - start_stamp)) <= 2) AND billsec=0)) THEN 1 ELSE 0 END)::float
       / NULLIF(sum(CASE WHEN amd_label='HUMAN' THEN 1 ELSE 0 END),0) AS abandon_rate
     FROM cdr
     WHERE start_stamp BETWEEN (now() - interval '24 hour') AND now()
     GROUP BY campaign_id;
     \`\`\`

   - **AMD Split & Estimated FP/FN:**
     \`\`\`sql
     SELECT campaign_id,
       count(*) FILTER (WHERE amd_label='HUMAN') AS human,
       count(*) FILTER (WHERE amd_label='VOICEMAIL') AS vm,
       -- FP: classified MACHINE but had conversation
       count(*) FILTER (WHERE amd_label IN ('VOICEMAIL','FAX','SIT','NOANSWER') AND billsec>0) AS amd_fp,
       -- FN: classified HUMAN but dispositioned as machine
       count(*) FILTER (WHERE amd_label='HUMAN' AND disposition IN ('VOICEMAIL','FAX','SIT')) AS amd_fn
     FROM cdr
     WHERE start_stamp BETWEEN (now() - interval '24 hour') AND now()
     GROUP BY campaign_id;
     \`\`\`

**10. Implementation Roadmap & "Definition of Done":**
   - **P0: Live Data:** Enable \`mod_event_socket\`, connect an ESL client, and stream real-time events to the UI dashboard.
   - **P1: Core Call Flow:** Implement \`originate\` with variables, dialplan logic for bridging, and extended CDR logging via \`mod_json_cdr\` or \`mod_cdr_pg_csv\`.
   - **P2: Intelligent AMD:** Integrate \`mod_audio_fork\` with an AI service for HUMAN/MACHINE classification and route calls accordingly. Use \`mod_avmd\` for simple voicemail drops.
   - **P3: Predictive & Compliance:** Build the pacing loop, enforcing abandon caps, dialing windows, and DNC list checks.

**Instructions for the AI:**
- Generate a comprehensive, well-structured developer integration guide based on this FreeSWITCH-first blueprint.
- Use Markdown for formatting. Include clear headings, lists, and properly formatted code blocks for API payloads, SQL schemas, and FreeSWITCH configurations/commands.
- Begin with a high-level overview of the architecture and the phased implementation plan.
- Dedicate clear sections to each major topic (Real-time Eventing, API Contracts, Database Schema, AMD, Predictive Pacing, Telemetry & KPIs, etc.).
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
