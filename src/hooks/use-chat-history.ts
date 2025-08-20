
"use client";

import { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDocs, DocumentData } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Persona, AiSession, AiMessage } from '@/lib/types';
import { getAiResponse } from '@/app/actions';
import { useAuth } from '@/components/providers/auth-provider';
import { app as firebaseApp } from '@/lib/firebase';

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const initialPersona: Persona = 'Friend';

// Callable functions
const ensureProfile = httpsCallable(functions, 'ensureProfile');
const createNewSession = httpsCallable(functions, 'createNewSession');
const appendUserMessage = httpsCallable(functions, 'appendUserMessage');
const updateSession = httpsCallable(functions, 'updateSession');
const deleteSession = httpsCallable(functions, 'deleteSession');

export function useChatHistory() {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<Omit<AiSession, 'messages'>[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  
  const activeConversation = sessions.find(s => s.id === activeSessionId);
  const activePersona = activeConversation?.mode || initialPersona;

  const startNewConversation = useCallback(async (persona: Persona) => {
    if (!user) return;
    setIsPending(true);
    try {
      const result: any = await createNewSession({ title: `New Chat`, mode: persona, languageIntent: 'auto' });
      setActiveSessionIdState(result.data.sessionId);
    } finally {
      setIsPending(false);
    }
  }, [user]);

  // Effect to fetch the list of conversation sessions
  useEffect(() => {
    if (!user || loading) return;
    ensureProfile();
    const q = query(collection(db, `aiProfiles/${user.uid}/sessions`), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const userSessions = querySnapshot.docs.map((doc: DocumentData) => ({
          id: doc.id,
          ...doc.data(),
      }) as Omit<AiSession, 'messages'>);
      setSessions(userSessions);
      if (querySnapshot.empty) {
        startNewConversation('Friend');
      }
    });
    return unsubscribe;
  }, [user, loading, startNewConversation]);

  // Effect to set the initial active session
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionIdState(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Effect to fetch messages for the active session
  useEffect(() => {
    if (!user || loading || !activeSessionId) {
      setMessages([]);
      return;
    };
    const q = query(collection(db, `aiProfiles/${user.uid}/sessions/${activeSessionId}/messages`), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const messages = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as AiMessage);
      setMessages(messages);
    });
    return unsubscribe;
  }, [user, loading, activeSessionId]);

  const handlePersonaChange = useCallback(async (persona: Persona) => {
    if (persona === activePersona) return;
    const existingSession = sessions.find(s => s.mode === persona);
    if (existingSession) {
      setActiveSessionIdState(existingSession.id);
    } else {
      await startNewConversation(persona);
    }
  }, [sessions, activePersona, startNewConversation]);

  const sendMessage = useCallback(async (content: string, persona: Persona, imageUrls?: string[]) => {
    if (!user || !activeSessionId) return;
    const sessionId = activeSessionId;
    setIsPending(true);
    try {
      const isFirstMessage = messages.length === 0;

      if (isFirstMessage && content) {
        await updateSession({ sessionId, updates: { title: content.substring(0, 20) } });
      }

      const userMessage: Omit<AiMessage, 'id'> = { role: 'user', content, imageUrls, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false };
      await appendUserMessage({ sessionId, message: userMessage });

      const messagesSnapshot = await getDocs(query(collection(db, `aiProfiles/${user.uid}/sessions/${sessionId}/messages`), orderBy("createdAt", "asc")));
      const historyForAi = messagesSnapshot.docs.map(doc => doc.data() as AiMessage);

      const { content: aiContent, nativeScript, isError } = await getAiResponse(historyForAi, persona);
      const aiMessage: Omit<AiMessage, 'id'> = { role: 'assistant', content: aiContent, nativeScriptLine: nativeScript, isError, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false };
      await appendUserMessage({ sessionId, message: aiMessage });
    } finally {
      setIsPending(false);
    }
  }, [user, activeSessionId, messages]);

  const deleteConversation = useCallback(async (sessionId: string) => {
    if (!user) return;
    await deleteSession({ sessionId });
  }, [user]);

  const renameConversation = useCallback(async (sessionId: string, newTitle: string) => {
    if (!user) return;
    await updateSession({ sessionId, updates: { title: newTitle } });
  }, [user]);

  const archiveConversation = useCallback(async (sessionId: string, isArchived: boolean) => {
    if (!user) return;
    await updateSession({ sessionId, updates: { isArchived } });
  }, [user]);

  return {
    conversations: sessions.filter(s => !s.isArchived),
    activeConversation: activeConversation ? { ...activeConversation, messages } : undefined,
    activeSessionId,
    activePersona,
    setActiveConversationId: setActiveSessionIdState,
    isPending,
    startNewConversation,
    handlePersonaChange,
    sendMessage,
    deleteConversation,
    renameConversation,
    archiveConversation,
  };
}
