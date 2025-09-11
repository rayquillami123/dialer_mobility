/**
 * @fileOverview This file contains the Zod schemas and TypeScript types for the Genkit flows.
 * It is separated from the flow definitions to avoid issues with the "use server" directive.
 */

import { z } from 'zod';

// Schema for generateAudioFromText flow
export const GenerateAudioFromTextInputSchema = z.string();
export type GenerateAudioFromTextInput = z.infer<typeof GenerateAudioFromTextInputSchema>;

export const GenerateAudioFromTextOutputSchema = z.object({
  media: z.string().describe("The generated audio as a data:audio/wav;base64,... URI."),
});
export type GenerateAudioFromTextOutput = z.infer<typeof GenerateAudioFromTextOutputSchema>;


// Schema for generateDeveloperIntegrationGuide flow
export const GenerateDeveloperIntegrationGuideOutputSchema = z.string().describe('A complete developer integration guide based on the provided technical plan.');
export type GenerateDeveloperIntegrationGuideOutput = z.infer<typeof GenerateDeveloperIntegrationGuideOutputSchema>;


// Schema for generateIntegrationNotes flow
export const GenerateIntegrationNotesOutputSchema = z.string().describe('Integration notes for trunk management.');
export type GenerateIntegrationNotesOutput = z.infer<typeof GenerateIntegrationNotesOutputSchema>;


// Schema for suggestAMIARIConnectionNotes flow
export const SuggestAMIARIConnectionNotesInputSchema = z.object({
  platform: z.string().describe('The platform for which AMI/ARI connection notes are requested (e.g., Asterisk, FreePBX).'),
  version: z.string().describe('The version of the platform.'),
  purpose: z.string().describe('The intended purpose of the AMI/ARI connection (e.g., monitoring, control).'),
});
export type SuggestAMIARIConnectionNotesInput = z.infer<typeof SuggestAMIARIConnectionNotesInputSchema>;

export const SuggestAMIARIConnectionNotesOutputSchema = z.object({
  notes: z.string().describe('Notes for AMI/ARI connection, including configuration steps and security considerations.'),
});
export type SuggestAMIARIConnectionNotesOutput = z.infer<typeof SuggestAMIARIConnectionNotesOutputSchema>;
