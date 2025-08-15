'use server';

/**
 * @fileOverview Implements a Genkit flow to ensure safe and respectful AI interactions.
 *
 * - `checkSafetyAndTone` - A function that checks the safety and tone of a user's input and provides a safe response.
 * - `SafetyAndToneInput` - The input type for the `checkSafetyAndTone` function.
 * - `SafetyAndToneOutput` - The return type for the `checkSafetyAndTone` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const SafetyAndToneInputSchema = z.object({
  userInput: z.string().describe('The user input to be checked for safety and tone.'),
  persona: z.string().optional().describe('The persona of the AI assistant.'),
});

export type SafetyAndToneInput = z.infer<typeof SafetyAndToneInputSchema>;

const SafetyAndToneOutputSchema = z.object({
  safeResponse: z.string().describe('A safe and respectful response from the AI.'),
});

export type SafetyAndToneOutput = z.infer<typeof SafetyAndToneOutputSchema>;

export async function checkSafetyAndTone(input: SafetyAndToneInput): Promise<SafetyAndToneOutput> {
  return safetyAndToneFlow(input);
}

const safetyAndTonePrompt = ai.definePrompt({
  name: 'safetyAndTonePrompt',
  input: {schema: SafetyAndToneInputSchema},
  output: {schema: SafetyAndToneOutputSchema},
  prompt: `You are an AI assistant that prioritizes safety and respect in all interactions. 

  Given the following user input, assess its safety and tone. If the input is inappropriate, 
  decline the request politely and suggest alternative, safe topics. Never scold the user. 
  Maintain a {{persona}} communication style.

  User Input: {{{userInput}}}

  Provide a safe and respectful response:
  `,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
    ],
  },
});

const safetyAndToneFlow = ai.defineFlow(
  {
    name: 'safetyAndToneFlow',
    inputSchema: SafetyAndToneInputSchema,
    outputSchema: SafetyAndToneOutputSchema,
  },
  async input => {
    const {output} = await safetyAndTonePrompt(input);
    return output!;
  }
);
