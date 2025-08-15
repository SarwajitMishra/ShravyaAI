'use server';

/**
 * @fileOverview A tool that allows the AI to search the web for current information.
 *
 * - webSearch - A Genkit tool that simulates a web search and returns results.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const WebSearchInputSchema = z.object({
  query: z.string().describe('The search query to look up on the internet.'),
});

const SearchResultSchema = z.object({
  title: z.string().describe('The title of the search result.'),
  snippet: z.string().describe('A brief snippet of the search result content.'),
  link: z.string().describe('A URL to the search result.'),
});

const WebSearchOutputSchema = z.object({
  results: z.array(SearchResultSchema).describe('A list of search results.'),
});

export const webSearch = ai.defineTool(
  {
    name: 'webSearch',
    description: 'Searches the web for information about a given query. Use this for current events, news, or topics that require up-to-date information.',
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
  },
  async (input) => {
    console.log(`[WebSearch Tool] Received query: ${input.query}`);

    // In a real application, you would call a search engine API here.
    // For this example, we'll return some plausible, hardcoded results.
    const query = input.query.toLowerCase();
    let results = [];

    if (query.includes('cricket')) {
      results = [
        {
          title: 'Live Cricket Score - India vs Australia',
          snippet: 'Follow the live cricket score and commentary for the T20 match between India and Australia. India won by 6 wickets.',
          link: 'https://www.example-sports.com/cricket/live-score',
        },
        {
          title: 'ICC World Cup 2024 Schedule',
          snippet: 'The official schedule for the upcoming ICC T20 World Cup has be en announced. The tournament will begin on June 1st.',
          link: 'https://www.example-icc.com/schedule',
        },
      ];
    } else if (query.includes('stock market') || query.includes('sensex')) {
        results = [
            {
                title: 'BSE SENSEX Live - Indian Stock Market Today',
                snippet: 'The BSE SENSEX is currently trading at 75,410.39, up 0.3% today. Nifty 50 also sees gains.',
                link: 'https://www.example-finance.com/markets/sensex',
            },
            {
                title: 'Why the Indian stock market is rallying - Economic Times',
                snippet: 'Analysts point to strong corporate earnings and positive global cues as key drivers for the recent stock market rally.',
                link: 'https://www.example-economictimes.com/market-analysis',
            }
        ]
    }
     else {
      results = [
        {
          title: 'Latest News Headlines - Example News',
          snippet: 'Breaking news from around the world, including politics, technology, and entertainment. Stay updated with the latest events.',
          link: 'https://www.example-news.com/latest',
        },
        {
          title: `What is "${input.query}"? - Wikipedia`,
          snippet: `An overview of ${input.query}, its history, significance, and related topics.`,
          link: `https://en.wikipedia.org/wiki/${input.query.replace(/\s/g, '_')}`,
        },
      ];
    }
    
    console.log(`[WebSearch Tool] Returning ${results.length} results.`);
    return { results };
  }
);
