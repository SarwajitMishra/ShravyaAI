
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { webSearch } from './web-search';
import { MessageData, Role } from 'genkit';

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

const conversationalResponseFlow = ai.defineFlow(
  {
    name: 'conversationalResponseFlow',
    inputSchema: ConversationalResponseInputSchema,
    outputSchema: ConversationalResponseOutputSchema,
  },
  async (input) => {
    const systemPrompt = `You are an AI assistant named Shravya AI. Your current persona is: ${input.persona}.
      
      Your primary goal is to respond in the same language and style as the user's last message.
      
      **CRITICAL INSTRUCTION:** If the user's query requires information about current events, news, weather, stock prices, or any other topic that requires up-to-date, real-time information, you **MUST** use the 'webSearch' tool. For all other queries, you can use your internal knowledge. Do not mention that you are searching the web.
      
      Analyze the entire chat history to provide a contextually relevant response.`;

    const messages: MessageData[] = [
        { role: 'system', content: [{ text: systemPrompt }] },
        ...input.history.map(msg => ({
            role: (msg.role === 'assistant' ? 'model' : 'user') as Role,
            content: [{ text: msg.content }],
        }))
    ];

    const llmResponse = await ai.generate({
      messages: messages,
      tools: [webSearch],
      model: 'googleai/gemini-2.0-flash',
    });

    const output = llmResponse.text;
    return { response: output };
  }
);
