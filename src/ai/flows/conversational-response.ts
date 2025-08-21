'use server';
/**
 * @fileoverview A conversational flow that generates a response based on the
 * user's prompt and persona.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';
import {personaResponsePrompt} from './persona-based-responses';

export const ConversationalResponseInputSchema = z.object({
  prompt: z.string(),
  persona: z.string(),
});

export const ConversationalResponseOutputSchema = z.object({
  response: z.string(),
});

export type ConversationalResponseInput = z.infer<
  typeof ConversationalResponseInputSchema
>;
export type ConversationalResponseOutput = z.infer<
  typeof ConversationalResponseOutputSchema
>;

export async function conversationalResponse(
  input: ConversationalResponseInput
): Promise<ConversationalResponseOutput> {
  const response = await conversationalResponseFlow(input);
  return response;
}

export const conversationalResponseFlow = ai.defineFlow(
  {
    name: 'conversationalResponseFlow',
    inputSchema: ConversationalResponseInputSchema,
    outputSchema: ConversationalResponseOutputSchema,
  },
  async (input) => {
    const {response} = await personaResponsePrompt(input);
    return response.output!;
  }
);
