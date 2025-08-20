
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { webSearch } from './web-search';
import { googleAI } from '@genkit-ai/googleai';
import wav from 'wav';

// Define the input schema for the conversationalResponse flow
const ConversationalResponseInputSchema = z.object({
  history: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })),
  persona: z.string(),
});
export type ConversationalResponseInput = z.infer<typeof ConversationalResponseInputSchema>;

// Define the output schema for the conversationalResponse flow
const ConversationalResponseOutputSchema = z.object({
  response: z.string(),
  audio: z.string().optional(), // Audio will be a Base64 encoded string
});
export type ConversationalResponseOutput = z.infer<typeof ConversationalResponseOutputSchema>;

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

export const conversationalResponse = ai.defineFlow(
  {
    name: 'conversationalResponse',
    inputSchema: ConversationalResponseInputSchema,
    outputSchema: ConversationalResponseOutputSchema,
  },
  async (input) => {
    const { history, persona } = input;
    const userPrompt = history[history.length - 1]?.content || '';

    // Step 1: Generate the text response
    const textGenerationResponse = await ai.generate({
      prompt: `You are an AI assistant with a specific persona: ${persona}. 
      Your conversation history with the user is as follows:
      ${JSON.stringify(history)}

      You have access to a tool called 'webSearch' that can search the internet for real-time information.

      **CRITICAL INSTRUCTION:** You must decide whether to use your internal knowledge or the 'webSearch' tool based on these rules:

      1.  **Use the 'webSearch' tool ONLY for these specific cases:**
          *   If the user explicitly asks you to search the web (e.g., "search for...", "look up...", "find information on...").
          *   For queries about news, current events, stock prices, weather, or other topics that require real-time, up-to-the-minute information.
          *   For questions about recent developments or public figures where information is likely to have changed.

      2.  **For ALL OTHER queries, you MUST use your internal knowledge.** This includes, but is not limited to:
          *   Recipes, DIY instructions, and "how-to" guides.
          *   Creative tasks like writing stories, poems, or code.
          *   General knowledge questions about history, science, and established facts.
          *   Explanations of concepts.

      Based on the latest user prompt ("${userPrompt}"), generate a helpful and conversational response that is consistent with your persona.`,
      model: 'googleai/gemini-1.5-flash-latest',
      tools: [webSearch],
    });
    
    const textResponse = textGenerationResponse.text;
    let audioResponse: string | undefined = undefined;

    // Step 2: Generate the audio from the text response
    if (textResponse) {
        const { media } = await ai.generate({
            model: googleAI.model('gemini-2.5-flash-preview-tts'),
            prompt: textResponse,
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: 'en-IN-Neural2-A', // Young Indian Lady voice
                        },
                    },
                },
            },
        });
        
        if (media?.url) {
            const audioBuffer = Buffer.from(
                media.url.substring(media.url.indexOf(',') + 1),
                'base64'
            );
            audioResponse = 'data:audio/wav;base64,' + await toWav(audioBuffer);
        }
    }


    return { 
      response: textResponse,
      audio: audioResponse,
    };
  }
);
