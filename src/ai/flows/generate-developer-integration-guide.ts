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

  Based on the following comprehensive technical plan, generate a complete, well-structured, and developer-ready integration guide. The guide should consolidate all the provided information into a single, coherent document that a backend engineering team can use to build and integrate the system with the existing frontend.

  **Technical Plan Details:**

  **1) 1:1 Field Mappings (Magnus Billing to PJSIP):**
  - **Trunk:** Provider/Host/Port -> host, port; Provider tech -> transport; Codec -> codecs (list); Dtmfmode RFC2833 -> dtmf_mode: rfc4733; NAT -> nat: force_rport,comedia; Directmedia -> direct_media; Qualify -> qualify; Insecure -> insecure=port,invite; Context -> context; Max use/CPS -> max_concurrent, max_cps; Register trunk -> registration.
  - **SIP Users/Agents:** username/password -> agent.login, agent.auth; host -> contact/permit/deny; codec -> allowed_codecs; NAT/Qualify.

  **2) Backend Connectors (API Contracts):**
  - **REST API:**
    - \`GET /api/trunks\`, \`POST /api/trunks\`
    - \`GET /api/agents\`, \`POST /api/agents/:id/state\` (Ready/Pause/Wrapup)
    - \`POST /api/campaigns\`, \`POST /api/campaigns/:id/start|pause|stop\`
    - \`POST /api/lists/upload\`
    - \`GET /api/reports/cdr?from&to&...\`
  - **WebSocket/SSE Events:**
    - \`call.update\`: { callId, status, campaignId, leadId, providerId, agentId, amd: { label, confidence }, ts }
    - \`agent.state\`: { agentId, state, reason, ts }
    - \`queue.metric\`: { queue, ready, inTalk, abandonRate, asr, ts }

  **3) Asterisk Templates (PJSIP & Dialplan):**
  - **PJSIP.conf:** Provide a complete template for an outbound trunk including endpoint, aor, and auth sections. Use placeholders like <TRUNK>, <HOST>, <PORT>, <USER>, <PASS>.
  - **Dialplan (extensions.conf):**
    - \`[outbound-dialer]\`: Show how to use channel variables (X_CAMPAIGN, X_LEAD), set PAI headers, save custom CDR fields, and call a GoSub for AMD.
    - \`[sub-setup]\`: Implement a hangup handler.
    - \`[amd-early]\`: Show usage of the native AMD() application.
    - \`[sub-hangup]\`: Detail how to save custom variables to the CDR on hangup.

  **4) Low-Latency AMD (Hybrid Approach):**
  - **Process:** Stream 200-500ms of early audio to a dedicated AI microservice (gRPC/WebSocket).
  - **Output:** Classify as HUMAN, VOICEMAIL, FAX, SIT, or NOANSWER with a confidence score.
  - **Routing:** Route only HUMAN calls to agents. Handle others with specific rules (hangup, retry, etc.).
  - **Telemetry:** Track False Positives/Negatives, confidence scores, and timeouts per campaign and trunk.

  **5) Predictive Pacing Loop:**
  - **Algorithm:** Every 500ms, calculate \`desired_dials = ceil(occupancy_target * ready_agents * (AHT / setup_time)) - in_talk\`.
  - **Adjustments:** Clamp the result based on the drop rate cap and recent ASR (Answer Seizure Ratio).
  - **Origination:** Originate calls in bursts, respecting trunk CPS limits and caller ID strategy.

  **6) Extended CDR Schema (PostgreSQL):**
  - **Fields:** Include campaign_id, list_id, lead_id, trunk_id, agent_id, queue, amd_label, amd_confidence, sip_code, sip_reason, early_media_ms, disposition, recording_url.
  - **Indexes:** Create indexes on (campaign_id, started_at), (trunk_id, started_at), (amd_label), (agent_id, ended_at).

  **7) Compliance and Operations:**
  - Detail the need for DNC list checks, time-zone-aware dialing windows, abandonment caps, and max attempt limits.
  - Explain the role of dispositions and the callback scheduler.
  - Mention STIR/SHAKEN attestation.

  **Instructions for the AI:**
  - Structure the output as a formal developer guide.
  - Use Markdown for formatting, including code blocks for API payloads, SQL schemas, and Asterisk configurations.
  - Start with a high-level overview of the architecture.
  - Create clear sections for each topic (API Contracts, Database Schema, Asterisk Integration, etc.).
  - For the Asterisk section, provide the full, ready-to-copy PJSIP and dialplan configurations.
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
