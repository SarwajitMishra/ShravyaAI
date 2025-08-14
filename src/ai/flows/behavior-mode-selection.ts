'use server';

/**
 * @fileOverview Implements the behavior mode selection flow.
 *
 * - behaviorModeSelection - A function that handles the behavior mode selection process.
 * - BehaviorModeSelectionInput - The input type for the behaviorModeSelection function.
 * - BehaviorModeSelectionOutput - The return type for the behaviorModeSelection function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const BehaviorModeSelectionInputSchema = z.object({
  query: z.string().describe('The user query.'),
  previousMode: z.string().optional().describe('The previously selected behavior mode.'),
});
export type BehaviorModeSelectionInput = z.infer<typeof BehaviorModeSelectionInputSchema>;

const BehaviorModeSelectionOutputSchema = z.object({
  mode: z.string().describe('The selected behavior mode (Friend, Teacher, Spiritual, Pro, or Storyteller).'),
  response: z.string().describe('The AI response in the selected mode.'),
});
export type BehaviorModeSelectionOutput = z.infer<typeof BehaviorModeSelectionOutputSchema>;

export async function behaviorModeSelection(input: BehaviorModeSelectionInput): Promise<BehaviorModeSelectionOutput> {
  return behaviorModeSelectionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'behaviorModeSelectionPrompt',
  input: {
    schema: BehaviorModeSelectionInputSchema,
  },
  output: {
    schema: BehaviorModeSelectionOutputSchema,
  },
  prompt: `You are a helpful AI assistant that can respond in different behavior modes.

The available behavior modes are: Friend, Teacher, Spiritual, Pro, and Storyteller.

If the user has not specified a mode, or if the query does not fit the current mode, select the most appropriate mode and respond accordingly.
If the user has specified a mode, respond in that mode.
If the user has not specified a mode and there is no previous mode, ask the user to select a mode.

Previous mode: {{previousMode}}
User query: {{{query}}}

Output in JSON format the selected mode and the response in that mode.`,
});

const behaviorModeSelectionFlow = ai.defineFlow(
  {
    name: 'behaviorModeSelectionFlow',
    inputSchema: BehaviorModeSelectionInputSchema,
    outputSchema: BehaviorModeSelectionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
