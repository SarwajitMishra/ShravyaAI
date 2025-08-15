'use server';
/**
 * @fileOverview This flow is responsible for making the AI's response funnier.
 *
 * - makeItFun - A function that takes a string and returns a funnier version of it.
 * - MakeItFunInput - The input type for the makeItFun function.
 * - MakeItFunOutput - The return type for the makeItFun function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const MakeItFunInputSchema = z.object({
  text: z.string().describe('The text to make funnier.'),
});
export type MakeItFunInput = z.infer<typeof MakeItFunInputSchema>;

const MakeItFunOutputSchema = z.object({
  funnierText: z.string().describe('The funnier version of the text.'),
});
export type MakeItFunOutput = z.infer<typeof MakeItFunOutputSchema>;

export async function makeItFun(input: MakeItFunInput): Promise<MakeItFunOutput> {
  return makeItFunFlow(input);
}

const prompt = ai.definePrompt({
  name: 'makeItFunPrompt',
  input: {schema: MakeItFunInputSchema},
  output: {schema: MakeItFunOutputSchema},
  prompt: `Make the following text funnier:

{{{text}}}`,
});

const makeItFunFlow = ai.defineFlow(
  {
    name: 'makeItFunFlow',
    inputSchema: MakeItFunInputSchema,
    outputSchema: MakeItFunOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
