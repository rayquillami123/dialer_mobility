'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting notes for AMI/ARI connections.
 *
 * - suggestAMIARIConnectionNotes - A function that generates notes for AMI/ARI connections.
 * - SuggestAMIARIConnectionNotesInput - The input type for the suggestAMIARIConnectionNotes function.
 * - SuggestAMIARIConnectionNotesOutput - The return type for the suggestAMIARIConnectionNotes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAMIARIConnectionNotesInputSchema = z.object({
  platform: z.string().describe('The platform for which AMI/ARI connection notes are requested (e.g., Asterisk, FreePBX).'),
  version: z.string().describe('The version of the platform.'),
  purpose: z.string().describe('The intended purpose of the AMI/ARI connection (e.g., monitoring, control).'),
});
export type SuggestAMIARIConnectionNotesInput = z.infer<typeof SuggestAMIARIConnectionNotesInputSchema>;

const SuggestAMIARIConnectionNotesOutputSchema = z.object({
  notes: z.string().describe('Notes for AMI/ARI connection, including configuration steps and security considerations.'),
});
export type SuggestAMIARIConnectionNotesOutput = z.infer<typeof SuggestAMIARIConnectionNotesOutputSchema>;

export async function suggestAMIARIConnectionNotes(input: SuggestAMIARIConnectionNotesInput): Promise<SuggestAMIARIConnectionNotesOutput> {
  return suggestAMIARIConnectionNotesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestAMIARIConnectionNotesPrompt',
  input: {schema: SuggestAMIARIConnectionNotesInputSchema},
  output: {schema: SuggestAMIARIConnectionNotesOutputSchema},
  prompt: `You are an expert in telecommunications systems, specializing in AMI/ARI connections.

  Based on the platform, version, and purpose provided, generate a set of notes that a developer can use to configure the AMI/ARI connection.

  Include specific configuration steps, security considerations, and any relevant warnings or best practices.

  Platform: {{{platform}}}
  Version: {{{version}}}
  Purpose: {{{purpose}}}`,
});

const suggestAMIARIConnectionNotesFlow = ai.defineFlow(
  {
    name: 'suggestAMIARIConnectionNotesFlow',
    inputSchema: SuggestAMIARIConnectionNotesInputSchema,
    outputSchema: SuggestAMIARIConnectionNotesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
