// functions/src/internal-helpers.ts

import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { FunctionDeclarationSchemaType } from "@google/generative-ai";

// --- This is the single source of truth for your Web Search Tool ---
export const webSearchTool = {
    functionDeclarations: [
        {
            name: "performWebSearch",
            description: "Use this tool to get real-time information, news, and updates from the web. Essential for any queries about current events, latest developments, or topics beyond the model's May 2024 knowledge cutoff.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    query: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "A concise and targeted search query that directly addresses the user's request for current information."
                    }
                },
                required: ["query"]
            }
        }
    ]
};

// --- This is the single source of truth for the search logic ---
export async function _internalPerformWebSearch(query: string): Promise<any> {
    logger.info(`[Web Search] Starting internal search with query: "${query}"`);
    if (!query) {
        logger.warn("[Web Search] Search attempted with no query.");
        return { error: "Missing query." };
    }

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;

    if (!apiKey || !cx) {
        logger.error("[Web Search] CRITICAL ERROR: Search API keys are not configured.");
        throw new HttpsError("internal", "The web search service is not configured correctly.");
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    logger.info(`[Web Search] Requesting URL (key omitted for security): https://www.googleapis.com/customsearch/v1?cx=${cx}&q=${encodeURIComponent(query)}`);

    try {
        const response = await fetch(url);
        const json = await response.json() as { error?: any; items?: any[] };

        if (!response.ok) {
            // Log the detailed error from the API
            logger.error(`[Web Search] API returned an error. Status: ${response.status}`, {
                errorBody: json.error
            });
            return { error: `The Search API returned an error. Status: ${response.status}` };
        }

        // Log success and the number of items found
        logger.info(`[Web Search] Successfully received ${json.items?.length || 0} items from API.`);

        return (json.items || []).map((it: any) => ({ title: it.title, link: it.link, snippet: it.snippet }));
    } catch (e: any) {
        // Log the full exception
        logger.error("[Web Search] An unexpected error occurred during the fetch operation.", {
            errorMessage: e.message,
            errorStack: e.stack,
        });
        return { error: "An unexpected error occurred during the search." };
    }
}
