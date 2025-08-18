
'use server';

/**
 * @fileOverview A flow that transcribes audio to text with smart formatting.
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
Your task is to transcribe the provided audio with high accuracy and intelligent formatting.

Follow these rules strictly:
1.  **Language:** The user is speaking in ${input.languageIntent}. Your transcription MUST be in the SAME Romanized language. Do NOT translate it. For example, if you hear "kaise ho", you must transcribe it as "kaise ho".
2.  **Punctuation:** Add appropriate punctuation, including commas, periods, and question marks.
3.  **Capitalization:** Capitalize the beginning of sentences and proper nouns.
4.  **Smart Formatting:** Convert spoken numbers, dates, times, and currencies into their written format (e.g., "call me at nine eight seven six five" becomes "call me at 98765", "it costs twenty dollars" becomes "$20", "see you on May first twenty twenty-four" becomes "see you on May 1st, 2024").
5.  **Correction:** Correct obvious spelling and grammatical errors based on the context of the sentence.` },
            { media: { url: input.audioDataUri } }
        ],
        model: 'googleai/gemini-1.5-flash-latest',
    });

    // For now, we'll treat each chunk as final. True streaming would require a more complex setup.
    return { transcription: text, isFinal: true };
  }
);
