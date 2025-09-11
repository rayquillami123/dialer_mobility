'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting notes for AMI/ARI connections.
 *
 * - suggestAMIARIConnectionNotes - A function that generates notes for AMI/ARI connections.
 */

import {ai} from '@/ai/genkit';
import { SuggestAMIARIConnectionNotesInputSchema, SuggestAMIARIConnectionNotesOutputSchema, type SuggestAMIARIConnectionNotesInput, type SuggestAMIARIConnectionNotesOutput } from './schemas';


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
