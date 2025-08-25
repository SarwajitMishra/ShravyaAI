
// --- Core AI and Data Types ---

export type Persona = "Buddy" | "Doctor Dadi" | "Peace Pandit" | "Bug Baba" | "Zindagi Guru";
export type Mode = Persona;
export type LangIntent = "Hindi"|"Tamil"|"Telugu"|"Marathi"|"Bengali"|"Malayalam"|"English"|"Bhojpuri"|"Gujrati"|"auto";

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

export type UserProfile = {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  tier: 'free' | 'pro';
  createdAt: number;
  lastSeenAt: number;
};

export type AiSession = {
  id: string;
  uid: string;
  title: string;
  mode: Mode;
  type?: 'voice' | 'text'; 
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
  documentUrls?: string[];
  audio?: string;
  mode: Mode;
  languageIntent: LangIntent;
  createdAt: number;
  // Client-side fields
  displayContent?: string;
  isRoman?: boolean;
  isError?: boolean;
  isPending?: boolean;
};


// --- UI-Specific Types ---

export type QuickChipAction = "explain" | "fun" | "steps";
