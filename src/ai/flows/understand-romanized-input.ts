'use server';

/**
 * @fileOverview A flow that understands Romanized Hindi (Hinglish) input and responds contextually.
 *
 * - understandRomanizedInput - A function that processes romanized input and returns a relevant response.
 * - UnderstandRomanizedInputInput - The input type for the understandRomanizedInput function.
 * - UnderstandRomanizedInputOutput - The return type for the understandRomanizedInput function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const UnderstandRomanizedInputInputSchema = z.object({
  romanizedInput: z.string().describe('The user input in Romanized Hindi (Hinglish).'),
});
export type UnderstandRomanizedInputInput = z.infer<typeof UnderstandRomanizedInputInputSchema>;

const UnderstandRomanizedInputOutputSchema = z.object({
  understoodQuery: z.string().describe('The understood and contextually relevant query.'),
});
export type UnderstandRomanizedInputOutput = z.infer<typeof UnderstandRomanizedInputOutputSchema>;

export async function understandRomanizedInput(input: UnderstandRomanizedInputInput): Promise<UnderstandRomanizedInputOutput> {
  return understandRomanizedInputFlow(input);
}

const prompt = ai.definePrompt({
  name: 'understandRomanizedInputPrompt',
  input: {schema: UnderstandRomanizedInputInputSchema},
  output: {schema: UnderstandRomanizedInputOutputSchema},
  prompt: `You are an AI assistant that understands Romanized Hindi (Hinglish).

  The user will provide input in Romanized Hindi, and you will need to understand the intent and meaning of the query.
  Return a contextually relevant and properly understood version of the query.

  Romanized Input: {{{romanizedInput}}}`,
});

const understandRomanizedInputFlow = ai.defineFlow(
  {
    name: 'understandRomanizedInputFlow',
    inputSchema: UnderstandRomanizedInputInputSchema,
    outputSchema: UnderstandRomanizedInputOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
