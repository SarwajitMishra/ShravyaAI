
"use client";

import { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, DocumentData, updateDoc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Persona, AiSession, AiMessage, UserProfile } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { app as firebaseApp } from '@/lib/firebase';

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const initialPersona: Persona = 'Friend';

// Callable functions
const ensureProfile = httpsCallable(functions, 'ensureProfile');
const createNewSession = httpsCallable(functions, 'createNewSession');
const updateSession = httpsCallable(functions, 'updateSession');
const deleteSession = httpsCallable(functions, 'deleteSession');
const appendUserMessageAndGetResponse = httpsCallable(functions, 'appendUserMessageAndGetResponse');

export function useChatHistory() {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<Omit<AiSession, 'messages'>[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  
  const activeConversation = sessions.find(s => s.id === activeSessionId);
  const activePersona = activeConversation?.mode || initialPersona;

  // Effect to fetch user profile
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const profileRef = doc(db, `aiProfiles/${user.uid}`);
    const unsubscribe = onSnapshot(profileRef, (doc) => {
      if (doc.exists()) {
        setUserProfile(doc.data().profile as UserProfile);
      }
    });
    return unsubscribe;
  }, [user]);

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
    if (!user || !activeSessionId || !userProfile) return;
    const sessionId = activeSessionId;
    setIsPending(true);
    try {
      const isFirstMessage = messages.length === 0;

      if (isFirstMessage && content) {
        await updateSession({ sessionId, updates: { title: content.substring(0, 20) } });
      }

      const userMessage = {
        role: 'user',
        parts: [{ text: content }],
      };

      const context = {
        persona,
        lang: 'auto',
        hasImage: !!imageUrls?.length,
        safetySensitive: false, // Replace with actual detection logic
        userTier: userProfile.tier || 'free',
      };

      await appendUserMessageAndGetResponse({ sessionId, message: userMessage, context });

    } finally {
      setIsPending(false);
    }
  }, [user, activeSessionId, messages, userProfile]);

  const regenerateLastMessage = useCallback(async () => {
    if (!user || !activeSessionId || messages.length === 0 || !userProfile) return;
    
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) return;


    setIsPending(true);
    try {
        const context = {
            persona: activePersona,
            lang: 'auto',
            hasImage: false,
            safetySensitive: false,
            userTier: userProfile.tier || 'free',
          };
      
          await appendUserMessageAndGetResponse({
            sessionId: activeSessionId,
            message: { role: 'user', parts: [{ text: lastUserMessage.content }] },
            context,
          });

    } catch (error) {
      console.error("Error regenerating message:", error);
    } finally {
      setIsPending(false);
    }
  }, [user, activeSessionId, messages, activePersona, userProfile]);

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
    regenerateLastMessage,
  };
}
