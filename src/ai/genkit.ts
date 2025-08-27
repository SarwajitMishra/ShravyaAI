
/**
 * @fileoverview This file initializes the Genkit AI framework with the necessary
 * plugins and configurations for the application. It exports a configured `ai`
 * object that should be used throughout the app for any generative AI tasks.
 */
'use server';

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Initialize the Genkit AI instance with the Google AI plugin.
// This allows the application to use Google's generative AI models like Gemini.
export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is automatically sourced from the GEMINI_API_KEY
      // environment variable.
    }),
  ],
  // Log generative AI requests and responses to the browser console.
  // This is useful for debugging and understanding the AI's behavior.
  logSinks: [
    (event) => {
      console.log(JSON.stringify(event, null, 2));
    },
  ],
  // Store traces in memory. In a production environment, you would want to
  // use a more persistent storage solution.
  traceStore: 'memory',
  // Allow the AI to generate JSON objects that match a given Zod schema.
  // This is useful for structured data extraction and generation.
  enableSchemaFormat: true,
});
