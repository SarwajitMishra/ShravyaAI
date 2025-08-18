
'use server';

/**
 * @fileOverview A flow that transcribes audio to text in the user's spoken language.
 *
 * - transcribeAudio - A function that processes audio data and returns the transcribed text.
 * - TranscribeAudioInput - The input type for the transcribeAudio function.
 * - TranscribeAudioOutput - The return type for the transcribeAudio function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "A chunk of audio, as a data URI that must include a MIME type and use Base64 encoding."
    ),
  languageIntent: z
    .string()
    .describe(
      'The language the user is speaking, e.g., "Hinglish", "Tanglish".'
    ),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  transcription: z.string().describe('The transcribed text from the audio.'),
  isFinal: z.boolean().describe('Whether the transcription is final.'),
});
export type TranscribeAudioOutput = z.infer<
  typeof TranscribeAudioOutputSchema
>;

export async function transcribeAudio(
  input: TranscribeAudioInput
): Promise<TranscribeAudioOutput> {
  return transcribeAudioFlow(input);
}

const transcribeAudioFlow = ai.defineFlow(
  {
    name: 'transcribeAudioFlow',
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async (input) => {
    const { text } = await ai.generate({
        prompt: [
            { text: `You are an expert audio transcription AI.
Your task is to transcribe the provided audio.
The user is speaking in ${input.languageIntent}.
Your transcription MUST be in the SAME Romanized language.
Do NOT translate it to pure Devanagari script or pure English. Transcribe it as you hear it.
For example, if you hear "kaise ho", you must transcribe it as "kaise ho", not "कैसे हो" or "how are you".
If you hear "I am fine", you must transcribe it as "I am fine".` },
            { media: { url: input.audioDataUri } }
        ],
        model: 'googleai/gemini-1.5-flash-latest',
    });

    // For now, we'll treat each chunk as final. True streaming would require a more complex setup.
    return { transcription: text, isFinal: true };
  }
);
