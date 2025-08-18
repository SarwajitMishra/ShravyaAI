
// --- Core AI and Data Types ---

export type Persona = "Friend" | "Teacher" | "Spiritual" | "Pro" |
"Storyteller";
export type Mode = Persona;
export type LangIntent = "Hindi"|"Tamil"|"Telugu"|"Marathi"|"Bengali"|
"Malayalam"|"English"|"auto";

// --- Firestore Models ---
// These are the base structures for documents in Firestore.

export type AiProfile = {
  uid: string;
  displayName?: string;
  defaultMode: Mode;
  languageIntent: LangIntent;
  lastScriptToggle?: "romanized"|"native";
  createdAt: number;
  lastSeenAt: number;
};

export type AiSession = {
  id: string;
  uid: string;
  title: string;
  mode: Mode;
  languageIntent: LangIntent;
  isPremiumSnapshot?: boolean;
  createdAt: number;
  updatedAt: number;
  isArchived?: boolean;
  // This messages array is a client-side convenience;
  // it's not stored on the session document.
  messages: AiMessage[];
};

export type AiMessage = {
  showScript: boolean;
  id: string;
  role: "user"|"assistant";
  content: string;
  romanizedHint?: string;
  nativeScriptLine?: string;
  imageUrls?: string[];
  audio?: string;
  mode: Mode;
  languageIntent: LangIntent;
  createdAt: number;
  // Client-side fields
  displayContent?: string;
  isRoman?: boolean;
  isError?: boolean;
};


// --- UI-Specific Types ---

export type QuickChipAction = "explain" | "fun" | "steps";
