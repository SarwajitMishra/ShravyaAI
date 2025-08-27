
'use server';
/**
 * @fileoverview Defines a Genkit prompt for generating persona-based responses.
 * This prompt takes a user's query and a selected persona to generate a
 * contextually appropriate and stylized response.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';

export const PersonaResponseInputSchema = z.object({
  prompt: z
    .string()
    .describe('The user\'s request or question to the persona.'),
  persona: z
    .string()
    .describe(
      'The persona that the AI should adopt for the response. This influences the tone, style, and content of the answer.'
    ),
});

export const PersonaResponseOutputSchema = z.object({
  response: z.string().describe('The generated response from the persona.'),
});

export const personaResponsePrompt = ai.definePrompt(
  {
    name: 'personaResponsePrompt',
    input: {
      schema: PersonaResponseInputSchema,
    },
    output: {
      schema: PersonaResponseOutputSchema,
    },
    prompt: `You are a helpful assistant. Please adopt the following persona for your response: {{persona}}.

The user's prompt is:
"{{prompt}}"

Please provide a response in character.`,
  },
  async (input) => {
    // This is a placeholder for any additional logic you might want to add.
    // For example, you could fetch additional context based on the persona.
    return {
      ...input,
    };
  }
);
