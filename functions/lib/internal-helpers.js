"use strict";
// functions/src/internal-helpers.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearchTool = void 0;
exports._internalPerformWebSearch = _internalPerformWebSearch;
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const generative_ai_1 = require("@google/generative-ai");
// --- This is the single source of truth for your Web Search Tool ---
exports.webSearchTool = {
    functionDeclarations: [
        {
            name: "performWebSearch",
            description: "Use this tool to get real-time information, news, and updates from the web. Essential for any queries about current events, latest developments, or topics beyond the model's May 2024 knowledge cutoff.",
            parameters: {
                type: generative_ai_1.FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    query: {
                        type: generative_ai_1.FunctionDeclarationSchemaType.STRING,
                        description: "A concise and targeted search query that directly addresses the user's request for current information."
                    }
                },
                required: ["query"]
            }
        }
    ]
};
// --- This is the single source of truth for the search logic ---
async function _internalPerformWebSearch(query) {
    logger.info(`[Web Search] Starting internal search with query: "${query}"`);
    if (!query) {
        logger.warn("[Web Search] Search attempted with no query.");
        return { error: "Missing query." };
    }
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.PROGRAMMABLE_SEARCH_ENGINE_ID;
    if (!apiKey || !cx) {
        logger.error("[Web Search] CRITICAL ERROR: Search API keys are not configured.");
        throw new https_1.HttpsError("internal", "The web search service is not configured correctly.");
    }
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    logger.info(`[Web Search] Requesting URL (key omitted for security): https://www.googleapis.com/customsearch/v1?cx=${cx}&q=${encodeURIComponent(query)}`);
    try {
        const response = await fetch(url);
        const json = await response.json();
        if (!response.ok) {
            // Log the detailed error from the API
            logger.error(`[Web Search] API returned an error. Status: ${response.status}`, {
                errorBody: json.error
            });
            return { error: `The Search API returned an error. Status: ${response.status}` };
        }
        // Log success and the number of items found
        logger.info(`[Web Search] Successfully received ${json.items?.length || 0} items from API.`);
        return (json.items || []).map((it) => ({ title: it.title, link: it.link, snippet: it.snippet }));
    }
    catch (e) {
        // Log the full exception
        logger.error("[Web Search] An unexpected error occurred during the fetch operation.", {
            errorMessage: e.message,
            errorStack: e.stack,
        });
        return { error: "An unexpected error occurred during the search." };
    }
}
