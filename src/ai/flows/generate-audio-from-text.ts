'use server';
/**
 * @fileOverview A Genkit flow for generating audio from text using a Text-to-Speech (TTS) model.
 *
 * - generateAudioFromText - A function that converts a given text string into speech audio.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import wav from 'wav';
import { GenerateAudioFromTextInputSchema, GenerateAudioFromTextOutputSchema, type GenerateAudioFromTextInput, type GenerateAudioFromTextOutput } from './schemas';


/**
 * Converts raw PCM audio data to a WAV file format encoded in Base64.
 * @param pcmData The raw PCM audio buffer.
 * @param channels The number of audio channels (default: 1).
 * @param rate The sample rate in Hz (default: 24000).
 * @param sampleWidth The sample width in bytes (default: 2).
 * @returns A promise that resolves with the Base64-encoded WAV data.
 */
async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    const bufs: any[] = [];
    writer.on('error', reject);
    writer.on('data', (d) => bufs.push(d));
    writer.on('end', () => resolve(Buffer.concat(bufs).toString('base64')));

    writer.write(pcmData);
    writer.end();
  });
}

// Define the main flow for text-to-speech conversion
const generateAudioFromTextFlow = ai.defineFlow(
  {
    name: 'generateAudioFromTextFlow',
    inputSchema: GenerateAudioFromTextInputSchema,
    outputSchema: GenerateAudioFromTextOutputSchema,
  },
  async (text) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' }, // A standard, clear voice
          },
        },
      },
      prompt: text,
    });

    if (!media || !media.url) {
      throw new Error('Audio generation failed: no media was returned from the model.');
    }
    
    // The model returns raw PCM data in a data URI, we need to convert it to WAV
    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );
    
    const wavBase64 = await toWav(audioBuffer);

    return {
      media: `data:audio/wav;base64,${wavBase64}`,
    };
  }
);


/**
 * Exported wrapper function to be called from the application.
 * @param text The text to convert to speech.
 * @returns An object containing the Base64-encoded WAV audio data URI.
 */
export async function generateAudioFromText(text: GenerateAudioFromTextInput): Promise<GenerateAudioFromTextOutput> {
    return generateAudioFromTextFlow(text);
}
