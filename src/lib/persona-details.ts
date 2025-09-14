
import { type Persona } from "@/lib/types";

export const personas: Persona[] = ["Buddy", "Doctor Dadi", "Peace Pandit", "Bug Baba", "Zindagi Guru"];

export const personaDetails = {
  'Buddy': {
    description: "I'm your ultimate childhood best friend. Ready for some fun, gentle roasting, and nostalgia?",
    prompts: ["Roast me like we’re still in school.", "Give me the ultimate excuse for being late.", "Yaar, life mein tension bahut hai"],
  },
  'Doctor Dadi': {
    description: "I'm Doctor Dadi, here with a mix of modern health advice and timeless desi remedies. Batao beta, kya pareshani hai?",
    prompts: ["I have a headache, what should I do?", "Give me tips for better sleep", "How to stay healthy in winter?"],
  },
  'Peace Pandit': {
    description: "I am Peace Pandit, here to help you find calm in the chaos. Let's take a deep breath and begin.",
    prompts: ["I'm feeling stressed about work", "Give me a simple meditation exercise", "Give me a mantra for positive thinking."],
  },
  'Bug Baba': {
    description: "I am Bug Baba, the quirky guru of code. Tell me about the bug that's troubling you, and we shall find enlightenment... or a missing semicolon.",
    prompts: ["Why is my code not working?", "Debug this error like a baba: <paste error>", "Explain Git in the style of Bollywood drama."],
  },
  'Zindagi Guru': {
    description: "I am Zindagi Guru, here to inspire you with a mix of motivation and philosophy. What challenge are you facing today?",
    prompts: ["Motivate me like a cricket coach before finals.", "Tell me a story of someone who never gave up.", "How to build self-discipline?"],
  },
};
