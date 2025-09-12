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

Your task is to take the following comprehensive technical blueprint and market context for a professional dialer system and generate a complete, professional, and developer-ready integration guide. The guide should be structured logically, starting with a high-level architectural overview and then drilling down into specific implementation details for each component. The target audience is a skilled backend engineering team proficient in Node.js/Go, SQL, and VoIP technologies.

**Dialer Market & Technology Context**

*   **Dialing Modes:**
    *   **Predictive:** Maximizes agent talk-time by anticipating availability. Risks "abandoned calls" if it over-dials. Regulated by abandon rate caps (e.g., <=3%).
    *   **Power/Progressive:** More conservative 1:1 or N:1 dialing ratio. Reduces abandon risk, ideal for compliance-heavy environments.
    *   **Preview:** Agent reviews lead data before initiating the call. Used for complex sales.
    *   **Agentless / Outbound IVR ("Press-1"):** Broadcasts messages with DTMF options for surveys, reminders, etc.

*   **Compliance (Key Regulations):**
    *   **USA (TSR/FCC):** Enforces a "Safe Harbor" for predictive dialers if the abandon rate is **≤ 3% per campaign over a 30-day period**. An abandoned call must play an informative message, and unanswered calls must ring for at least 15 seconds or 4 rings.
    *   **UK (Ofcom):** Similar guidelines, historically focusing on a 3% abandon rate per 24-hour period per campaign. Emphasizes preventing "nuisance calls."
    *   **Practical Implication:** The system *must* have active pacing control, per-campaign abandon rate tracking, and automated abandonment messages to be compliant.

*   **Answer Machine Detection (AMD/CPA):**
    *   **Challenge:** No AMD is 100% accurate. Real-world accuracy is often 75-90% with a trade-off in latency (can take 4-5 seconds).
    *   **Risks:** False Positives (hanging up on a human) create bad UX. False Negatives (connecting an agent to a voicemail) waste agent time.
    *   **Our Solution's Approach:** A hybrid model. Use AI-based AMD for primary detection, with tunable confidence thresholds per campaign. Use beep detection (\`mod_avmd\`) for reliable voicemail drops after the tone.

*   **Caller ID Reputation (STIR/SHAKEN & "Spam Likely"):**
    *   **STIR/SHAKEN:** Authenticates the caller's right to use a number, resulting in an A, B, or C-level "attestation." It fights spoofing but does *not* by itself prevent spam labeling.
    *   **Spam Labeling:** Determined by carrier analytics based on call frequency, answer rates, and complaint data.
    *   **Our Solution's Strategy:** Achieve A-level attestation. Rotate DIDs strategically, use local presence (matching area codes), monitor reputation, and register numbers with analytics providers.

**Dialer Technical Blueprint: FreeSWITCH Edition**

**1. Core Architecture ("FreeSWITCH-first"):**
   - **Engine:** FreeSWITCH with key modules enabled.
   - **Orchestrator:** A custom Node.js service responsible for the predictive pacing loop (using \`computeDialRate\`), retry logic, compliance enforcement (DNC, dialing windows, abandon caps), and provider/CPS routing.
   - **Real-time Service:** A WebSocket server that subscribes to FreeSWITCH events via ESL and broadcasts them to the UI.
   - **Reporting Layer:** An extended CDR schema in PostgreSQL, with recordings stored in a blob/S3-compatible object store.

**2. Required FreeSWITCH Modules:**
   - **mod_event_socket:** The core for real-time control and eventing (ESL).
   - **mod_callcenter:** Provides robust ACD/queue capabilities for routing calls to agents.
   - **mod_json_cdr:** For pushing detailed CDRs to our backend's HTTP endpoint.
   - **mod_avmd:** For reliable voicemail beep detection.

**3. UI/Backend Integration Plan by Screen:**
   *(Existing detailed plan for Dashboard, Campaigns, Lists, Real-time monitor, etc. remains here)*

**4. Dialplan & AMD Logic (FreeSWITCH XML):**
   \`\`\`xml
   <extension name="dialer-outbound">
     <condition field="destination_number" expression="^(.+)$">
       <!-- 1) Set compliance and routing variables -->
       <action application="set" data="ringback=\${us-ring}"/>
       <action application="set" data="call_timeout=25"/>
       <action application="set" data="progress_timeout=13"/> 
       <action application="record_session" data="\${recordings_dir}/\${uuid}.wav"/>

       <!-- 2) Bridge the call to the gateway -->
       <action application="bridge" data="sofia/gateway/\${X_TRUNK}/\${destination_number}"/>

       <!-- 3) Post-bridge routing based on AMD result (set by external service via ESL) -->
       <condition field="\${AMD_LABEL}" expression="^HUMAN$">
         <action application="set" data="cc_export_vars=X_CAMPAIGN,X_LIST,X_LEAD,X_TRUNK"/>
         <action application="callcenter" data="sales"/>
       </condition>
       <condition field="\${AMD_LABEL}" expression="^(VOICEMAIL|FAX|SIT|UNKNOWN)$">
         <action application="hangup" data="NORMAL_CLEARING"/>
       </condition>
     </condition>
   </extension>
   \`\`\`

**5. CDR & Reporting Schema (PostgreSQL):**
   - **Mechanism:** Use \`mod_json_cdr\` to post a JSON payload to the backend's \`/cdr\` endpoint.
   - **Extended Fields (PostgreSQL table \`cdr\`):**
     - id, call_id, start_stamp, answer_stamp, end_stamp, billsec
     - campaign_id, list_id, lead_id, trunk_id, agent_id, queue
     - amd_label, amd_confidence, disposition, recording_url
     - **Signaling**: fs_hangup_cause, sip_code, sip_disposition, sip_term_status
     - **PDD**: progress_msec, progress_media_msec, early_media_ms

**6. FreeSWITCH Configuration Templates:**

**A. event_socket.conf.xml:**
\`\`\`xml
<configuration name="event_socket.conf" description="Event Socket">
  <settings>
    <param name="listen-ip" value="127.0.0.1"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="YourSecurePassword"/>
    <param name="apply-inbound-acl" value="loopback.auto"/>
  </settings>
</configuration>
\`\`\`

**B. callcenter.conf.xml:**
\`\`\`xml
<configuration name="callcenter.conf" description="Callcenter / ACD">
  <queues>
    <queue name="sales">
      <param name="strategy" value="longest-idle-agent"/>
      <param name="moh-sound" value="local_stream://moh"/>
      <param name="time-base-score" value="queue"/>
      <param name="max-wait-time" value="0"/>
      <param name="tier-rules-apply" value="false"/>
      <param name="discard-abandoned-after" value="60"/>
      <param name="abandoned-resume-allowed" value="false"/>
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

**C. json_cdr.conf.xml:**
\`\`\`xml
<configuration name="json_cdr.conf" description="JSON CDR to HTTP">
  <settings>
    <param name="url" value="http://localhost:9003/cdr"/>
    <param name="log-b-leg" value="true"/>
    <param name="retries" value="2"/>
  </settings>
  <templates>
    <template name="default"><![CDATA[
{
  "uuid": "$\{uuid}", "direction": "$\{direction}",
  "start_stamp": "$\{start_stamp}", "answer_stamp": "$\{answer_stamp}", "end_stamp": "$\{end_stamp}",
  "duration": $\{duration}, "billsec": $\{billsec},
  "caller_id_number": "$\{caller_id_number}", "destination_number": "$\{destination_number}",
  "campaign_id": "$\{X_CAMPAIGN}", "list_id": "$\{X_LIST}", "lead_id": "$\{X_LEAD}", "trunk_id": "$\{X_TRUNK}",
  "queue": "$\{cc_queue}", "agent_id": "$\{cc_agent}",
  "amd_label": "$\{AMD_LABEL}", "amd_confidence": "$\{AMD_CONFIDENCE}",
  "fs_hangup_cause": "$\{hangup_cause}",
  "sip_code": "$\{sip_hangup_cause}",
  "sip_disposition": "$\{sip_hangup_disposition}",
  "sip_term_status": "$\{sip_term_status}",
  "progress_msec": "$\{progress_msec}",
  "progress_media_msec": "$\{progress_media_msec}"
}
    ]]\></template>
  </templates>
</configuration>
\`\`\`

**7. Go-Live & Production Checklist (P0)**
   **1. Database Setup:**
     - Run \`psql -d dialer -f sql/schema.sql\` & \`sql/sample_data.sql\`.
     - Load full NANPA area code list into \`state_area_codes\`.
     - Ensure leads have E.164 numbers and correct timezones.
   **2. FreeSWITCH ↔ Backend Connection:**
     - Deploy XML files.
     - Update passwords and URLs in \`event_socket.conf.xml\` and \`json_cdr.conf.xml\`.
     - Verify ESL connection: \`telnet 127.0.0.1 8021\`.
   **3. Backend (Node.js) Deployment:**
     - Configure \`.env\` with PostgreSQL, ESL, and API token credentials.
     - Run \`npm i\` and \`npm run dev\`.
   **4. Orchestrator Configuration:**
     - Set compliance variables in \`.env\`: \`MAX_CALLS_PER_LEAD_PER_DAY=8\`, \`MAX_CALLS_PER_DID_PER_DAY=300\`.
     - Test campaign start via API: \`POST /api/campaigns/:id/start\`.

**8. End-to-End Acceptance Tests**
   - **Golden Path:** Start campaign, see a "Connected" call in the UI, and verify a CDR with \`billsec > 0\` is created.
   - **DID by State:** Call numbers in different states (TX, CA) and confirm the correct state-specific Caller ID was used via the \`attempts\` table.
   - **Daily Call Limit:** Simulate 8 calls to one lead. The 9th call must not be originated.
   - **SIP Mix / PDD:** Generate failed calls (486, 404, 503) and verify the SQL queries for provider health report them correctly.
   - **AMD to Queue Routing:** Ensure a call with \`AMD_LABEL=HUMAN\` is routed to the \`sales\` queue.

**9. Key Operational Metrics (SQL Queries)**
   **A) Provider Health (Last 15 min):**
   \`\`\`sql
    SELECT trunk_id,
      COUNT(*) FILTER (WHERE raw->>'sip_code'='200')::float/NULLIF(COUNT(*),0) AS asr,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE((raw->>'progress_media_msec')::int,(raw->>'progress_msec')::int)) AS p50_pdd_ms,
      jsonb_object_agg(raw->>'sip_code', 1) FILTER (WHERE raw->>'sip_code' IS NOT NULL) AS sip_mix
    FROM cdr
    WHERE received_at >= now() - interval '15 minutes' AND trunk_id IS NOT NULL
    GROUP BY trunk_id ORDER BY asr ASC;
   \`\`\`
   **B) DID Usage (Today):**
   \`\`\`sql
    SELECT d.id, d.e164, d.state, d.score, d.daily_cap,
      coalesce(du.calls_total, 0) as calls_today,
      (coalesce(du.calls_total, 0) >= d.daily_cap) as reached_cap
    FROM dids d
    LEFT JOIN did_usage du ON du.did_id = d.id AND du.day = current_date
    WHERE d.enabled = true ORDER BY d.state, calls_today DESC;
   \`\`\`

**Instructions for the AI:**
- Generate a comprehensive, well-structured developer integration guide based on this enriched blueprint.
- Use Markdown for formatting. Include clear headings, lists, and properly formatted code blocks.
- Ensure all provided context (market, compliance, AMD, STIR/SHAKEN), configurations, and SQL queries are included and explained.
- The guide must be professional, actionable, and assume a competent backend developer audience with FreeSWITCH experience.
- Return the entire guide as a single, consolidated string.
  `,
});

const generateDeveloperIntegrationGuideFlow = ai.defineFlow(
  {
    name: 'generateDeveloperIntegration-integration-guideFlow',
    outputSchema: GenerateDeveloperIntegrationGuideOutputSchema,
  },
  async () => {
    const {output} = await prompt({});
    return output!;
  }
);
