// This file contains the Genkit flow for simplifying explanations.

'use server';

/**
 * @fileOverview Implements the 'Explain simply' quick chip functionality.
 *
 * - explainSimply - Simplifies complex topics for easier understanding.
 * - ExplainSimplyInput - The input type for the explainSimply function.
 * - ExplainSimplyOutput - The return type for the explainSimply function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const ExplainSimplyInputSchema = z.object({
  text: z.string().describe('The text to be simplified.'),
});
export type ExplainSimplyInput = z.infer<typeof ExplainSimplyInputSchema>;

const ExplainSimplyOutputSchema = z.object({
  simplifiedText: z.string().describe('The simplified explanation.'),
});
export type ExplainSimplyOutput = z.infer<typeof ExplainSimplyOutputSchema>;

export async function explainSimply(input: ExplainSimplyInput): Promise<ExplainSimplyOutput> {
  return explainSimplyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'explainSimplyPrompt',
  input: {schema: ExplainSimplyInputSchema},
  output: {schema: ExplainSimplyOutputSchema},
  prompt: `Explain the following text in simple terms:

{{{text}}}`,
});

const explainSimplyFlow = ai.defineFlow(
  {
    name: 'explainSimplyFlow',
    inputSchema: ExplainSimplyInputSchema,
    outputSchema: ExplainSimplyOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
