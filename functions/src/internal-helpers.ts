// functions/src/internal-helpers.ts

import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { FunctionDeclarationSchemaType } from "@google/generative-ai";

// --- This is the single source of truth for your Web Search Tool ---
export const webSearchTool = {
    functionDeclarations: [
        {
            name: "performWebSearch",
            description: "Search the web for fresh, time-sensitive information.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    query: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Concise search query capturing the user's request."
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
        return { error: "Missing query." };
    }

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;

    if (!apiKey || !cx) {
        logger.error("[Web Search] CRITICAL ERROR: Search API keys are not configured.");
        throw new HttpsError("internal", "The web search service is not configured correctly.");
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        const json = await response.json() as { error?: any; items?: any[] };
        if (!response.ok) {
            return { error: "The Search API returned an error." };
        }
        return (json.items || []).map((it: any) => ({ title: it.title, link: it.link, snippet: it.snippet }));
    } catch (e) {
        return { error: "An unexpected error occurred during the search." };
    }
}
