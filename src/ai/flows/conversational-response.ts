'use server';

/**
 * @fileOverview A flow that provides a conversational response, taking into account the entire chat history.
 *
 * - conversationalResponse - A function that processes the chat history and returns a relevant response.
 * - ConversationalResponseInput - The input type for the conversationalResponse function.
 * - ConversationalResponseOutput - The return type for the conversationalResponse function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ConversationalResponseInputSchema = z.object({
  history: z.array(MessageSchema).describe('The entire conversation history.'),
  persona: z.string().describe('The persona to use for the response (e.g., Friend, Teacher, Spiritual, Pro, Storyteller).'),
});
export type ConversationalResponseInput = z.infer<typeof ConversationalResponseInputSchema>;

const ConversationalResponseOutputSchema = z.object({
  response: z.string().describe('The contextually relevant response.'),
});
export type ConversationalResponseOutput = z.infer<typeof ConversationalResponseOutputSchema>;

export async function conversationalResponse(input: ConversationalResponseInput): Promise<ConversationalResponseOutput> {
  return conversationalResponseFlow(input);
}

const prompt = ai.definePrompt({
  name: 'conversationalResponsePrompt',
  input: { schema: ConversationalResponseInputSchema },
  output: { schema: ConversationalResponseOutputSchema },
  prompt: `You are an AI assistant that understands and communicates in various Romanized Indian languages (like Hinglish, Tanglish, etc.). 

Your current persona is: {{{persona}}}.
  
Your primary goal is to respond in the same language and style as the user's last message. Analyze the user's input to determine the language and mimic it in your reply. Avoid mixing different languages unless it's a natural part of the user's expression (e.g., using English words within a Hinglish sentence is acceptable, but mixing entire sentences from different languages is not).

Conversation History:
  {{#each history}}
  {{role}}: {{{content}}}
  {{/each}}
  
  assistant:`,
});

const conversationalResponseFlow = ai.defineFlow(
  {
    name: 'conversationalResponseFlow',
    inputSchema: ConversationalResponseInputSchema,
    outputSchema: ConversationalResponseOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
