
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { app } from '@/lib/firebase'; // We only need the app for its config

// This is the URL of our new, secure HTTPS function.
const searchFunctionUrl = `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/performWebSearch`;

const WebSearchInputSchema = z.object({
  query: z.string().describe('The search query to look up on the internet.'),
});

export const webSearch = ai.defineTool(
  {
    name: 'webSearch',
    description: 'Searches the web for information about a given query. Use this for current events, news, or topics that require up-to-date information.',
    inputSchema: WebSearchInputSchema,
    outputSchema: z.any(),
  },
  async (input) => {
    console.log(`[WebSearch Tool] Invoked with query: "${input.query}"`);
    try {
      const response = await fetch(searchFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { query: input.query } }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Backend search function returned an error:", response.status, errorBody);
        return { results: [] };
      }

      const result = await response.json();
      console.log(`[WebSearch Tool] Received ${result.data.results?.length || 0} results from backend.`);
      return result.data;
      
    } catch (error) {
      console.error("[WebSearch Tool] Error calling backend function:", error);
      return { results: [] };
    }

  }
);
