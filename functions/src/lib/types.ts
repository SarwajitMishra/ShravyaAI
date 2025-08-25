
export type Persona = "Buddy" | "Doctor Dadi" | "Peace Pandit" | "Bug Baba" | "Zindagi Guru";
export type Mode = Persona;
export type LangIntent = "Hindi"|"Tamil"|"Telugu"|"Marathi"|"Bengali"|"Malayalam"|"English"|"Bhojpuri"|"Gujrati"|"auto";

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
  displayContent?: string;
  isRoman?: boolean;
  isError?: boolean;
};
