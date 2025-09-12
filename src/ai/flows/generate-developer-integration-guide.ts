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
    *   **USA (TSR/FCC):** Enforces a "Safe Harbor" for predictive dialers if the abandon rate is **≤ 3% per campaign over a 30-day period**. An abandoned call must play an informative message, and unanswered calls must ring for at least 15 seconds or 4 rings. A call is considered abandoned if a live agent is not connected within 2 seconds of the recipient's completed greeting.
    *   **UK (Ofcom):** Similar guidelines, historically focusing on a 3% abandon rate per 24-hour period per campaign. Emphasizes preventing "nuisance calls."
    *   **Practical Implication:** The system *must* have active pacing control, per-campaign abandon rate tracking, automated abandonment messages, and dialing window enforcement to be compliant.

*   **Answer Machine Detection (AMD/CPA):**
    *   **Challenge:** No AMD is 100% accurate. Real-world accuracy is often 75-90% with a trade-off in latency (can take 4-5 seconds).
    *   **Risks:** False Positives (hanging up on a human) create bad UX. False Negatives (connecting an agent to a voicemail) waste agent time.
    *   **Our Solution's Approach:** A hybrid model. Use AI-based AMD for primary detection, with tunable confidence thresholds per campaign. Use beep detection (\`mod_avmd\`) for reliable voicemail drops after the tone.

*   **Caller ID Reputation (STIR/SHAKEN & "Spam Likely"):**
    *   **STIR/SHAKEN:** Authenticates the caller's right to use a number, resulting in an A, B, or C-level "attestation." It fights spoofing but does *not* by itself prevent spam labeling.
    *   **Spam Labeling:** Determined by carrier analytics based on call frequency, answer rates, and complaint data.
    *   **Our Solution's Strategy:** Achieve A-level attestation. Rotate DIDs strategically, use local presence (matching area codes), monitor reputation, and register numbers with analytics providers.

**Dialer Technical Blueprint: FreeSWITCH Edition**

**1. Core Architecture ("Dialer Engine-Only"):**
   - **Engine:** FreeSWITCH with key modules enabled. Its only job is to dial out and detect humans.
   - **Orchestrator:** A custom Node.js service responsible for the predictive pacing loop, retry logic, compliance (DNC, dialing windows), and provider routing.
   - **External PBX:** An existing PBX (Asterisk, FreeSWITCH, Cloud PBX) where agents are registered and receive calls.
   - **Real-time Service:** A WebSocket server that subscribes to FreeSWITCH events via ESL and broadcasts them to the UI.
   - **Reporting Layer:** An extended CDR schema in PostgreSQL.

**2. Required FreeSWITCH Modules:**
   - **mod_event_socket:** The core for real-time control and eventing (ESL).
   - **mod_json_cdr:** For pushing detailed CDRs to our backend's HTTP endpoint.
   - **mod_avmd:** For reliable voicemail beep detection.
   - **mod_sofia:** For SIP trunking to both outbound providers and the internal PBX.

**3. Dialplan & AMD Logic (transfer to external PBX):**
   \`\`\`xml
   <extension name="dialer_amd_routing">
     <condition field="destination_number" expression="^.*$">
        <!-- 1. Execute Answer Machine Detection -->
        <!-- This part is now handled by the Orchestrator sending ESL commands, -->
        <!-- or you can use a dedicated AMD application here if preferred. -->
        <!-- The result is expected in the AMD_LABEL channel variable. -->
        <action application="answer"/>
        <action application="sleep" data="500"/>
        
        <!-- 2. Post-AMD Routing -->
        <condition field="\${AMD_LABEL}" expression="^HUMAN$">
          <!-- HUMAN: Transfer to the external PBX queue -->
          <action application="log" data="INFO: Human detected. Transferring call \${uuid} to PBX queue \${X_PBX_QUEUE}"/>
          <!-- NOTE: Define a separate gateway for your internal PBX -->
          <action application="bridge" data="sofia/gateway/internal-pbx-trunk/\${X_PBX_QUEUE}"/>
        </condition>

        <condition field="\${AMD_LABEL}" expression="^MACHINE_VOICEMAIL$">
          <!-- VOICEMAIL: Hang up or implement voicemail drop -->
          <action application="log" data="INFO: Voicemail detected. Hanging up call \${uuid}."/>
          <action application="hangup" data="NORMAL_CLEARING"/>
        </condition>

        <condition field="\${AMD_LABEL}" expression="^(FAX|SIT|UNKNOWN)$">
          <!-- OTHER: Hang up -->
          <action application="log" data="INFO: \${AMD_LABEL} detected. Hanging up call \${uuid}."/>
          <action application="hangup" data="NORMAL_CLEARING"/>
        </condition>

        <!-- Fallback: if no AMD result, hang up -->
        <action application="log" data="WARNING: No AMD result for call \${uuid}. Hanging up."/>
        <action application="hangup" data="NORMAL_CLEARING"/>
     </condition>
   </extension>
   \`\`\`

**4. CDR & Reporting Schema (PostgreSQL):**
   - **Mechanism:** Use \`mod_json_cdr\` to post a JSON payload to the backend's \`/cdr\` endpoint.
   - **Extended Fields (PostgreSQL table \`cdr\`):**
     - id, call_id, start_stamp, answer_stamp, end_stamp, billsec
     - campaign_id, list_id, lead_id, trunk_id, agent_id, queue
     - amd_label, amd_confidence, disposition, recording_url
     - **Signaling**: fs_hangup_cause, sip_code, sip_disposition, sip_term_status
     - **PDD**: progress_msec, progress_media_msec, early_media_ms

**5. FreeSWITCH Configuration Templates:**

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

**B. Gateway Configurations (Example):**
- **Outbound Provider Trunk (e.g., to Twilio, Bandwidth):**
  \`sofia/conf/dialer/outbound_provider.xml\`
  \`\`\`xml
  <gateway name="outbound-provider-trunk">
    <param name="username" value="..."/>
    <param name="password" value="..."/>
    <param name="proxy" value="sip.provider.com"/>
    <param name="register" value="false"/>
  </gateway>
  \`\`\`
- **Internal PBX Trunk (to transfer calls to):**
  \`sofia/conf/dialer/internal_pbx.xml\`
  \`\`\`xml
  <gateway name="internal-pbx-trunk">
    <param name="proxy" value="192.168.1.100"/> <!-- IP of your PBX -->
    <param name="register" value="false"/>
    <param name="context" value="from-dialer"/> <!-- Optional context on PBX side -->
  </gateway>
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
  "queue": "$\{X_PBX_QUEUE}", "agent_id": "$\{cc_agent}",
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

**6. Go-Live & Production Checklist (P0)**
   **1. Database Setup:**
     - Run \`psql -d dialer -f sql/schema.sql\` & \`sql/sample_data.sql\`.
     - Load full NANPA area code list into \`state_area_codes\`.
     - Ensure leads have E.164 numbers and correct timezones.
     - Create and populate the \`call_windows\` table for dialing window compliance.
   **2. FreeSWITCH ↔ Backend Connection:**
     - Deploy XML files (gateways, dialplan, json_cdr).
     - Update passwords and URLs in \`event_socket.conf.xml\` and \`json_cdr.conf.xml\`.
     - Verify ESL connection: \`telnet 127.0.0.1 8021\`.
   **3. Backend (Node.js) Deployment:**
     - Configure \`.env\` with PostgreSQL, ESL, and API token credentials.
     - Run \`npm i\` and \`npm run dev\`.
     - Implement the 2-second "Safe Harbor" timer for abandoned calls.
   **4. Orchestrator Configuration:**
     - Set compliance variables in \`.env\`: \`MAX_CALLS_PER_LEAD_PER_DAY=8\`, \`MAX_CALLS_PER_DID_PER_DAY=300\`.
     - Test campaign start via API: \`POST /api/campaigns/:id/start\`.
     - Integrate \`computeDialRate()\` and trunk failover logic into the main loop.
   **5. CDR and Reporting:**
     - Verify that the extended JSON CDR fields are being correctly populated in the database.
     - Confirm the \`/api/providers/health\` and \`/api/dids/health\` endpoints are working.

**7. End-to-End Acceptance Tests**
   - **Golden Path:** Start campaign, see a "Connected" call in the UI, and verify a CDR with \`billsec > 0\` is created.
   - **DID by State:** Call numbers in diferentes states (TX, CA) and confirm the correct state-specific Caller ID was used via the \`attempts\` table.
   - **Dialing Window:** Schedule a dialing window and confirm the orchestrator does not place calls outside of it.
   - **Safe Harbor Abandon:** Manually hold a call without connecting an agent and verify it's abandoned with the correct message after 2 seconds.
   - **SIP Mix / PDD:** Generate failed calls (486, 404, 503) and verify the SQL queries for provider health report them correctly.
   - **Trunk Failover:** Simulate a high 5xx error rate on a trunk and verify the orchestrator reduces its weight.
   - **Human to PBX:** Set AMD_LABEL=HUMAN and verify the call is bridged to your internal PBX trunk.

**8. Key Operational Metrics (SQL Queries)**
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
- Emphasize the separation of concerns: the dialer handles outbound calls, and an external PBX handles agents.
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
