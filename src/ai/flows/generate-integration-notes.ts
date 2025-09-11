'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating integration notes for trunk management.
 *
 * The flow takes no input and returns a string containing integration notes for developers.
 * - generateIntegrationNotes - A function that generates integration notes.
 * - GenerateIntegrationNotesOutput - The return type for the generateIntegrationNotes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateIntegrationNotesOutputSchema = z.string().describe('Integration notes for trunk management.');
export type GenerateIntegrationNotesOutput = z.infer<typeof GenerateIntegrationNotesOutputSchema>;

export async function generateIntegrationNotes(): Promise<GenerateIntegrationNotesOutput> {
  return generateIntegrationNotesFlow();
}

const prompt = ai.definePrompt({
  name: 'generateIntegrationNotesPrompt',
  output: {schema: GenerateIntegrationNotesOutputSchema},
  prompt: `You are an AI assistant specialized in generating integration notes for developers.

  Based on the following UI components and features for trunk management, generate a comprehensive list of integration notes to guide developers in creating the backend and integrating the frontend components.

  UI Components and Features:
  - Trunk Creation: Form to define new trunk providers by specifying name, host, codecs, CLI route, and maximum CPS (calls per second).
  - Trunk Listing: Display a list of configured trunks with their key details (name, host, codecs, CLI route, CPS, and enabled status).
  - Trunk Status Toggle: Enable or disable trunks via a toggle switch.
  - Trunk Editing: Form to modify trunk settings.
  - Trunk Deletion: Functionality to permanently remove trunk configurations.

  The integration notes should include key integration points to enable calls and manage trunk configurations effectively.
  Focus on providing clear and actionable guidelines for backend development and frontend integration.
  Make sure to return the integration notes as a single string.
  `,
});

const generateIntegrationNotesFlow = ai.defineFlow(
  {
    name: 'generateIntegrationNotesFlow',
    outputSchema: GenerateIntegrationNotesOutputSchema,
  },
  async () => {
    const {output} = await prompt({});
    return output!;
  }
);
