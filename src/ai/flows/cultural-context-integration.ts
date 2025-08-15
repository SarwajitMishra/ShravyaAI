'use server';

/**
 * @fileOverview Implements a Genkit flow for providing culturally relevant responses, including greetings, festival wishes, and everyday Indian examples.
 *
 * - culturalContextIntegration - A function that enriches responses with cultural context.
 * - CulturalContextIntegrationInput - The input type for the culturalContextIntegration function.
 * - CulturalContextIntegrationOutput - The return type for the culturalContextIntegration function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const CulturalContextIntegrationInputSchema = z.object({
  query: z.string().describe('The user query to be enriched with cultural context.'),
  currentDate: z.string().describe('The current date in ISO format.'),
  languageIntent: z.string().optional().describe('The language intent of the user (e.g., Hindi, Tamil, Telugu).'),
});
export type CulturalContextIntegrationInput = z.infer<typeof CulturalContextIntegrationInputSchema>;

const CulturalContextIntegrationOutputSchema = z.object({
  response: z.string().describe('The culturally relevant response.'),
});
export type CulturalContextIntegrationOutput = z.infer<typeof CulturalContextIntegrationOutputSchema>;

export async function culturalContextIntegration(input: CulturalContextIntegrationInput): Promise<CulturalContextIntegrationOutput> {
  return culturalContextIntegrationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'culturalContextIntegrationPrompt',
  input: {schema: CulturalContextIntegrationInputSchema},
  output: {schema: CulturalContextIntegrationOutputSchema},
  prompt: `You are an AI assistant specializing in providing culturally relevant responses, particularly for users from India.

  Today's date is {{{currentDate}}}.

  Based on the user's query and the current date, provide a response that incorporates relevant cultural elements such as greetings, festival wishes, and everyday Indian examples. The response should maintain a neutral and inclusive tone.

  If the user's language intent is specified as {{{languageIntent}}}, tailor the response to that language and culture accordingly.

  Query: {{{query}}}
  Language Intent: {{{languageIntent}}}

  Response:`,
});

const culturalContextIntegrationFlow = ai.defineFlow(
  {
    name: 'culturalContextIntegrationFlow',
    inputSchema: CulturalContextIntegrationInputSchema,
    outputSchema: CulturalContextIntegrationOutputSchema,
  },
  async input => {
    const {
      currentDate
    } = input;

    // Simple logic for demonstration.  In a real application, you would use a more
    // sophisticated method for determining the appropriate greeting or festival wish.
    let greeting = 'Namaste!';
    const date = new Date(currentDate);
    const month = date.getMonth(); // Month is 0-indexed

    if (month === 9) {
      greeting = 'Happy Dussehra!';
    }

    const enrichedInput = {
      ...input,
      query: `${greeting} ${input.query}`,
    };

    const {output} = await prompt(enrichedInput);
    return output!;
  }
);
