# **App Name**: Shravya AI

## Core Features:

- Romanized Input Understanding: Understands romanized input (e.g., Hinglish) and responds contextually, detecting language intent using defined rules (tie-breakers and default to Hinglish/Hindi).
- Persona-Based Responses: Adopts persona-based communication styles (Friend, Teacher, etc.) to tailor responses; the mode influences tone, structure, and pacing.
- Cultural Context Integration: Provides culturally relevant responses, including greetings, festival wishes (by date), and everyday Indian examples, acting as a tool for generating localized content; maintains a neutral and inclusive spiritual tone.
- Behavior Mode Selection: Chooses a mode of interaction, by prompting the user if one isn't specified, such as Friend, Teacher, Spiritual, Pro, and Storyteller, and persists/remembers the last selected mode per user/session, showing it in the header chips.
- Behavior Mode UI: Allows users to select from available output modes such as Friend, Teacher, Spiritual, Pro, or Storyteller via single-select toggleable chips.
- Chat Interface: Displays the assistant's replies in rounded saffron-colored bubbles on the left side of the screen; displays the user's prompts in rounded bubbles with a teal outline on the right side of the screen.
- Script Toggle: Features a script toggle button on each assistant reply to switch between romanized text and native script display (Hindi: देवनागरी, Tamil: தமிழ், Telugu: తెలుగు), using a server-side transliteration service and caching both forms; remembers the last toggle choice for the session.
- Error States: Friendly error bubbles for model errors/network issues with “Retry” + “Copy error” options.
- Fallback Behavior: Includes fallback behavior: if intent is unclear, reply in the current mode and ask: “Prefer Hindi, Tamil, Telugu…? (tap to set)”.
- Accessibility: Ensures accessibility through color contrast for saffron/teal, focus states, large tap targets, and screen reader labels.
- API and Sessions: Manages API contracts for chat (`POST /api/chat`) and session management (Firestore `users/{uid}/sessions/{sid}/messages/{mid}` with security rules) with “New Chat / Rename / Delete” features.
- Feature Flags and Runtime: Implements feature flags (e.g., `ENABLE_TTS`, `ENABLE_IMAGE_GEN_PAID_ONLY`, `ENABLE_STT`) and uses Node runtime for `@google-cloud/*` libraries, marking flows with `'use server'` and `import 'server-only'`. Features and runtime.
- Voice and Media: Provides STT intent bias by passing current `languageIntent` as a hint for better romanized capture and implements TTS voices (en-IN/hi-IN/ta-IN/te-IN/mr-IN/bn-IN/ml-IN) with soft-fail to text-only.
- Premium Pathway: Includes quotas (free: unlimited text, limited images; Pro: higher limits) and gating with a jolly upsell bubble when image quota is hit, tracking usage in `usage/{uid}/{yyyyMM}`.
- Quick Chips: Offers quick chips under the composer: “Explain simply”, “Make it fun”, “Give steps”, “Show script”.
- Thinking Shimmer: Shows a thinking shimmer on the assistant bubble placeholder.
- Message Actions: Includes Copy / Regenerate / Edit options under each assistant message.
- Safety and Tone: Ensures safety and tone with polite refusal patterns and offers safe alternatives; never scolds.

## Style Guidelines:

- Primary color: Saffron (#FF9933) to represent Indian culture and warmth.
- Accent color: Teal (#008080) for CTAs and interactive elements.
- Background color: Light Beige (#F5F5DC) to create a soft, inviting ambiance.
- Font: 'PT Sans' (sans-serif) for a modern, readable interface across devices.
- Subtle Indian-themed icons (diyas, henna patterns) as decorative flourishes.
- Mobile-first design with a focus on responsive components and touch-friendly interactions.
- Shimmer effect during 'Shravya is thinking...' to enhance perceived performance.