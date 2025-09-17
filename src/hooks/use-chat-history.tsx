
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, ReactNode } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, DocumentData, updateDoc, getDoc, addDoc, collectionGroup, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { type Persona } from '@/lib/types';
import type { AiSession, AiMessage, UserProfile, CallLog } from '@/lib/types';

import { useAuth } from '@/components/providers/auth-provider';
import { app as firebaseApp } from '@/lib/firebase';

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const initialPersona: Persona = 'Buddy';

// Callable functions
const ensureProfile = httpsCallable(functions, 'ensureProfile');
const createNewSession = httpsCallable(functions, 'createNewSession');
const updateSession = httpsCallable(functions, 'updateSession');
const deleteSession = httpsCallable(functions, 'deleteSession');
const appendUserMessageAndGetResponse = httpsCallable(functions, 'appendUserMessageAndGetResponse');
const updateMessageFeedback = httpsCallable(functions, 'updateMessageFeedback');

// --- 1. Define Types and Contexts ---

type ChatHistoryStateType = {
  conversations: Omit<AiSession, 'messages'>[];
  activeConversation: (Omit<AiSession, 'messages'> & { messages: AiMessage[] }) | undefined;
  activeSessionId: string | null;
  activePersona: Persona;
  isPending: boolean;
  callHistory: CallLog[];
};

type ChatHistoryActionsType = {
  setActiveConversationId: (id: string | null) => void;
  startNewConversation: (persona: Persona) => Promise<void>;
  handlePersonaChange: (persona: Persona) => Promise<void>;
  sendMessage: (content: string, persona: Persona, imageUrls?: string[], documentUrls?: string[]) => Promise<void>;
  deleteConversation: (sessionId: string) => Promise<void>;
  renameConversation: (sessionId: string, newTitle: string) => Promise<void>;
  archiveConversation: (sessionId: string, isArchived: boolean) => Promise<void>;
  regenerateLastMessage: () => Promise<void>;
  submitMessageFeedback: (sessionId: string, messageId: string, feedback: 'liked' | 'disliked') => Promise<void>;
  updateSessionType: (sessionId: string, type: 'voice' | 'text') => Promise<void>;
};

const ChatHistoryStateContext = createContext<ChatHistoryStateType | null>(null);
const ChatHistoryActionsContext = createContext<ChatHistoryActionsType | null>(null);

// --- 2. Create the Provider Component ---

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<Omit<AiSession, 'messages'>[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);

  // Memoized derived state
  const activeConversationData = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  const activePersona = useMemo(() => activeConversationData?.mode || initialPersona, [activeConversationData]);
  const conversations = useMemo(() => sessions.filter(s => !s.isArchived), [sessions]);
  const activeConversation = useMemo(() => (
    activeConversationData ? { ...activeConversationData, messages } : undefined
  ), [activeConversationData, messages]);

  // State ref for stable callbacks
  const stateRef = useRef({
    user,
    sessions,
    activeSessionId,
    userProfile,
    activePersona,
    messages,
    setActiveSessionIdState,
    setIsPending,
    setMessages,
  });

  useEffect(() => {
    stateRef.current = {
      user,
      sessions,
      activeSessionId,
      userProfile,
      activePersona,
      messages,
      setActiveSessionIdState,
      setIsPending,
      setMessages,
    };
  });
  
  // --- Effects for data fetching ---

  useEffect(() => {
    if (user && !loading) {
      ensureProfile().catch(err => console.error("Error ensuring profile:", err));
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const profileRef = doc(db, `aiProfiles/${user.uid}`);
    const unsubscribe = onSnapshot(profileRef, (doc) => {
      if (doc.exists()) setUserProfile(doc.data().profile as UserProfile);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
        setCallHistory([]);
        return;
    }
    const callsQuery = query(collectionGroup(db, 'calls'), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(callsQuery, (snapshot) => {
        const userCalls: CallLog[] = [];
        snapshot.forEach(doc => {
            if (doc.ref.path.startsWith(`aiProfiles/${user.uid}`)) {
                const data = doc.data();
                if (data.startTime instanceof Timestamp) {
                    userCalls.push({
                        id: doc.id,
                        sessionId: doc.ref.parent.parent!.id,
                        persona: data.persona,
                        startTime: data.startTime.toMillis(),
                        duration: data.duration,
                    });
                }
            }
        });
        setCallHistory(userCalls);
    });
    return unsubscribe;
  }, [user]);

  // --- Stable Action Callbacks ---
  
  const startNewConversation = useCallback(async (persona: Persona) => {
    const { user, setIsPending, setActiveSessionIdState } = stateRef.current;
    if (!user) return;
    setIsPending(true);
    try {
      const result: any = await createNewSession({ title: `New Chat`, mode: persona, languageIntent: 'auto' });
      setActiveSessionIdState(result.data.sessionId);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    const q = query(collection(db, `aiProfiles/${user.uid}/sessions`), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userSessions = querySnapshot.docs.map((doc: DocumentData) => {
            const data = doc.data();
            const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt;
            const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt;
            return { id: doc.id, ...data, updatedAt, createdAt } as Omit<AiSession, 'messages'>;
        });
        setSessions(userSessions);
        if (querySnapshot.empty) {
            startNewConversation('Buddy');
        }
    });
    return unsubscribe;
  }, [user, loading, startNewConversation]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionIdState(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!user || loading || !activeSessionId) {
      setMessages([]);
      return;
    };
    const q = query(collection(db, `aiProfiles/${user.uid}/sessions/${activeSessionId}/messages`), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const newMessages = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt;
            return { ...data, id: doc.id, createdAt } as AiMessage
        });
        setMessages(newMessages);
    });
    return unsubscribe;
  }, [user, loading, activeSessionId]);

  const handlePersonaChange = useCallback(async (persona: Persona) => {
    const { activePersona, sessions, setActiveSessionIdState } = stateRef.current;
    if (persona === activePersona) return;
    const existingSession = sessions.find(s => s.mode === persona);
    if (existingSession) {
        setActiveSessionIdState(existingSession.id);
    } else {
        await startNewConversation(persona);
    }
  }, [startNewConversation]);

  const sendMessage = useCallback(async (content: string, persona: Persona, imageUrls: string[] = [], documentUrls: string[] = []) => {
    const { user, activeSessionId, userProfile, messages, setMessages, setIsPending } = stateRef.current;
    if (!user || !activeSessionId || !userProfile) return;
    const sessionId = activeSessionId;
    const optimisticMessage: AiMessage = {
        id: `temp-${Date.now()}`, role: 'user', content, imageUrls: imageUrls.length > 0 ? imageUrls : undefined, documentUrls: documentUrls.length > 0 ? documentUrls : undefined, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false, isPending: true,
    };
    setMessages([...messages, optimisticMessage]);
    setIsPending(true);
    try {
        if (messages.length === 0 && content) {
            await updateSession({ sessionId, updates: { title: content.substring(0, 20) } });
        }
        await appendUserMessageAndGetResponse({ sessionId, message: { role: 'user', parts: [{ text: content }], content: content, imageUrls: imageUrls, documentUrls: documentUrls, }, context: { persona, lang: 'auto', hasImage: !!imageUrls?.length, safetySensitive: false, userTier: userProfile.tier || 'free', locale: navigator.language || 'en-US' } });
    } catch (error) {
        console.error("Error sending message:", error);
        const errorMessage: Omit<AiMessage, 'id'> = { role: 'assistant', content: "Sorry, something went wrong.", isError: true, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false };
        const messagesCol = collection(db, `aiProfiles/${user.uid}/sessions/${sessionId}/messages`);
        await addDoc(messagesCol, errorMessage);
    } finally {
        setIsPending(false);
    }
  }, []);

  const regenerateLastMessage = useCallback(async () => {
    const { user, activeSessionId, messages, userProfile, activePersona, setIsPending } = stateRef.current;
    if (!user || !activeSessionId || messages.length === 0 || !userProfile) return;
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) return;
    setIsPending(true);
    try {
        await appendUserMessageAndGetResponse({ sessionId: activeSessionId, message: { role: 'user', parts: [{ text: lastUserMessage.content }], content: lastUserMessage.content, }, context: { persona: activePersona, lang: 'auto', hasImage: false, safetySensitive: false, userTier: userProfile.tier || 'free', locale: navigator.language || 'en-US' } });
    } catch (error) {
      console.error("Error regenerating message:", error);
      const lastMessageId = messages[messages.length - 1].id;
      const messageRef = doc(db, `aiProfiles/${user.uid}/sessions/${activeSessionId}/messages`, lastMessageId);
      await updateDoc(messageRef, { content: "Sorry, I was unable to generate a new response.", isError: true, });
    } finally {
      setIsPending(false);
    }
  }, []);

  const deleteConversation = useCallback(async (sessionId: string) => {
    const { user } = stateRef.current;
    if (!user) return;
    await deleteSession({ sessionId });
  }, []);

  const renameConversation = useCallback(async (sessionId: string, newTitle: string) => {
    const { user } = stateRef.current;
    if (!user) return;
    await updateSession({ sessionId, updates: { title: newTitle } });
  }, []);

  const archiveConversation = useCallback(async (sessionId: string, isArchived: boolean) => {
    const { user } = stateRef.current;
    if (!user) return;
    await updateSession({ sessionId, updates: { isArchived } });
  }, []);

  const updateSessionType = useCallback(async (sessionId: string, type: 'voice' | 'text') => {
    const { user } = stateRef.current;
    if (!user) return;
    await updateSession({ sessionId, updates: { type } });
  }, []);

  const submitMessageFeedback = useCallback(async (sessionId: string, messageId: string, feedback: 'liked' | 'disliked') => {
    const { user } = stateRef.current;
    if (!user) return;
    try {
      await updateMessageFeedback({ sessionId, messageId, feedback });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  }, []);

  // --- 3. Memoize Context Values ---

  const stateValue = useMemo(() => ({
    conversations,
    activeConversation,
    activeSessionId,
    activePersona,
    isPending,
    callHistory,
  }), [conversations, activeConversation, activeSessionId, activePersona, isPending, callHistory]);

  const actionsValue = useMemo(() => ({
    setActiveConversationId: setActiveSessionIdState,
    startNewConversation,
    handlePersonaChange,
    sendMessage,
    deleteConversation,
    renameConversation,
    archiveConversation,
    regenerateLastMessage,
    submitMessageFeedback,
    updateSessionType,
  }), [
    setActiveSessionIdState,
    startNewConversation,
    handlePersonaChange,
    sendMessage,
    deleteConversation,
    renameConversation,
    archiveConversation,
    regenerateLastMessage,
    submitMessageFeedback,
    updateSessionType
  ]);

  // --- 4. Render Providers ---

  return (
    <ChatHistoryStateContext.Provider value={stateValue}>
      <ChatHistoryActionsContext.Provider value={actionsValue}>
        {children}
      </ChatHistoryActionsContext.Provider>
    </ChatHistoryStateContext.Provider>
  );
}

// --- 5. Create Consumer Hooks ---

export function useChatHistoryState() {
  const context = useContext(ChatHistoryStateContext);
  if (context === null) {
    throw new Error('useChatHistoryState must be used within a ChatHistoryProvider');
  }
  return context;
}

export function useChatHistoryActions() {
  const context = useContext(ChatHistoryActionsContext);
  if (context === null) {
    throw new Error('useChatHistoryActions must be used within a ChatHistoryProvider');
  }
  return context;
}
