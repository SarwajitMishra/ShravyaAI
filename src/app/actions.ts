
'use server';

import {
  personaBasedResponse
} from '@/ai/flows/persona-based-responses';
import {
  explainSimply
} from '@/ai/flows/explain-simply';
import {
  makeItFun
} from '@/ai/flows/make-it-fun';
import type {
  Message,
  Persona,
  QuickChipAction
} from '@/lib/types';
import {
  checkSafetyAndTone
} from '@/ai/flows/safety-and-tone';
import {
  understandRomanizedInput
} from '@/ai/flows/understand-romanized-input';
import {
  culturalContextIntegration
} from '@/ai/flows/cultural-context-integration';
import {
  behaviorModeSelection
} from '@/ai/flows/behavior-mode-selection';
import { conversationalResponse } from '@/ai/flows/conversational-response';


const transliterateToDevanagari = (text: string): string => {
  if (!text) return '';
  const mapping: { [key: string]: string } = {
    'a': 'अ', 'b': 'ब', 'c': 'स', 'd': 'ड', 'e': 'ए', 'f': 'फ', 'g': 'ग', 'h': 'ह', 'i': 'इ', 'j': 'ज', 'k': 'क', 'l': 'ल', 'm': 'म', 'n': 'न', 'o': 'ओ', 'p': 'प', 'q': 'क़', 'r': 'र', 's': 'स', 't': 'ट', 'u': 'उ', 'v': 'व', 'w': 'व', 'x': 'क्स', 'y': 'य', 'z': 'ज़',
    'namaste': 'नमस्ते', 'hello': 'नमस्ते', 'kaise ho': 'कैसे हो', 'how are you': 'कैसे हो', 'dhanyavaad': 'धन्यवाद', 'thank you': 'धन्यवाद', 'shukriya': 'शुक्रिया',
    'main': 'मैं', 'theek': 'ठीक', 'hoon': 'हूँ',
    'friend': 'मित्र', 'teacher': 'शिक्षक', 'spiritual': 'आध्यात्मिक', 'pro': 'विशेषज्ञ', 'storyteller': 'कथावाचक'
  };
  return text.toLowerCase().split(' ').map(word => {
    const cleanedWord = word.replace(/[.,!?]/g, '');
    return mapping[cleanedWord] || Array.from(word).map(char => mapping[char.toLowerCase()] || char).join('');
  }).join(' ');
};

export async function getAiResponse(
  history: Message[],
  persona: Persona
): Promise < {
  content: string;
  nativeScript: string;
  isError: boolean;
} > {
  const latestUserMessage = history[history.length - 1];
  let responseContent = "";
  let nativeScript = "";
  let isError = false;

  try {
    const safetyResult = await checkSafetyAndTone({
      userInput: latestUserMessage.content,
      persona,
    });
    
    const isSafe = !safetyResult.safeResponse.includes("I cannot respond to that request");

    if (!isSafe) {
        responseContent = safetyResult.safeResponse;
    } else {
        const historyWithoutDisplay = history.map(({ role, content }) => ({ role, content }));
        const userMessagesCount = historyWithoutDisplay.filter(m => m.role === 'user').length;
        const assistantMessagesCount = historyWithoutDisplay.filter(m => m.role === 'assistant').length;

        // For the very first user message in a new conversation, use the simple flow.
        // This occurs when there is one assistant message (the greeting) and one user message.
        if (userMessagesCount === 1 && assistantMessagesCount === 1) {
            const result = await personaBasedResponse({
                prompt: latestUserMessage.content,
                persona,
            });
            responseContent = result.response;
        } else {
            const result = await conversationalResponse({
                history: historyWithoutDisplay,
                persona,
            });
            responseContent = result.response;
        }
    }
  } catch (error) {
    console.error("Error getting AI response:", error);
    responseContent = "I'm having a little trouble right now. Please try again in a moment.";
    isError = true;
  }
  
  nativeScript = transliterateToDevanagari(responseContent);

  return {
    content: responseContent,
    nativeScript,
    isError,
  };
}

export async function getQuickResponse(
  action: QuickChipAction,
  lastMessage: Message
): Promise<{ content: string; nativeScript: string; isError: boolean; }> {
    let result = "";
    let isError = false;
    let nativeScript = "";
    try {
        if (action === 'explain') {
            const { simplifiedText } = await explainSimply({ text: lastMessage.content });
            result = simplifiedText;
        } else if (action === 'fun') {
            const { funnierText } = await makeItFun({ text: lastMessage.content });
            result = funnierText;
        } else if (action === 'steps') {
            const stepsPrompt = `Provide a step-by-step guide for: ${lastMessage.content}`;
            const personaResult = await personaBasedResponse({ prompt: stepsPrompt, persona: lastMessage.persona || 'Teacher' });
            result = personaResult.response;
        } else {
            throw new Error("Invalid quick action");
        }
    } catch (error) {
        console.error("Error getting quick response:", error);
        result = "I'm having a little trouble with that request. Please try again.";
        isError = true;
    }

    nativeScript = transliterateToDevanagari(result);
    return { content: result, nativeScript, isError };
}

export async function getInitialGreeting(persona: Persona): Promise<{ content: string; nativeScript: string; isError: boolean; }> {
  try {
    const result = await behaviorModeSelection({
        query: `Start a new conversation and greet me in the style of a ${persona}.`,
        previousMode: persona,
    });
    const nativeScript = transliterateToDevanagari(result.response);
    return { content: result.response, nativeScript, isError: false };
  } catch(error) {
    console.error("Error getting initial greeting:", error);
    const content = "Hello! How can I help you today?";
    const nativeScript = transliterateToDevanagari(content);
    return { content, nativeScript, isError: true };
  }
}
