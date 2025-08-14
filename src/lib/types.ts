
export type Persona = 'Friend' | 'Teacher' | 'Spiritual' | 'Pro' | 'Storyteller';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  timestamp?: number;
  persona?: Persona;
  // for script toggle
  displayContent?: string;
  nativeScript?: string;
  isRoman?: boolean;
};

export type QuickChipAction = 'explain' | 'fun' | 'steps';

export type Conversation = {
    id: string;
    title: string;
    messages: Message[];
    persona: Persona;
    timestamp: number;
};
