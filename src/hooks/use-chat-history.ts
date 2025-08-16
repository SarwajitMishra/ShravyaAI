
"use client";

import { useState, useEffect, useTransition, useCallback } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDocs, DocumentData } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Persona, AiSession, AiMessage } from '@/lib/types';
import { getAiResponse, getInitialGreeting } from '@/app/actions';
import { useAuth } from '@/app/auth-provider';
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
  const { user } = useAuth();
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePersona, setActivePersona] = useState<Persona>(initialPersona);

  // Effect to fetch the list of conversations.
  useEffect(() => {
    if (!user) return;
    ensureProfile();
    const q = query(collection(db, `aiProfiles/${user.uid}/sessions`), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const userSessions = querySnapshot.docs.map((doc: DocumentData) => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: data.uid,
          title: data.title,
          mode: data.mode,
          languageIntent: data.languageIntent,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          isArchived: data.isArchived,
          isPremiumSnapshot: data.isPremiumSnapshot,
          messages: [], 
        } as AiSession;
      });
      setSessions(userSessions);
    });
    return unsubscribe;
  }, [user]);

  // Effect to set the initial active session
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionIdState(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Effect to fetch messages for the active session
  useEffect(() => {
    if (user && activeSessionId) {
      const q = query(collection(db, `aiProfiles/${user.uid}/sessions/${activeSessionId}/messages`), orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as AiMessage);
        setSessions(prev =>
          prev.map(s => (s.id === activeSessionId ? { ...s, messages } : s))
        );
      });
      return unsubscribe;
    }
  }, [user, activeSessionId]);
  
  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
    const session = sessions.find(s => s.id === id);
    if (session) {
      setActivePersona(session.mode);
    }
  }, [sessions]);

  const startNewConversation = useCallback(async (persona: Persona) => {
    if (!user) return;
    startTransition(async () => {
      const { content, nativeScript } = await getInitialGreeting(persona);
      const newAiMessage: Omit<AiMessage, 'id'> = {
        role: 'assistant', content, nativeScriptLine: nativeScript, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false
      };
      const result: any = await createNewSession({ title: `[${persona}] ${content.substring(0, 20)}...`, mode: persona, languageIntent: 'auto' });
      const newSessionId = result.data.sessionId;
      await appendUserMessage({ sessionId: newSessionId, message: newAiMessage });
      setActiveConversationId(newSessionId);
    });
  }, [user, setActiveConversationId]);
  
  const handlePersonaChange = useCallback(async (persona: Persona) => {
    if (persona === activePersona) return;

    const existingSession = sessions.find(s => s.mode === persona);
    if (existingSession) {
      setActiveConversationId(existingSession.id);
    } else {
      await startNewConversation(persona);
    }
  }, [sessions, activePersona, setActiveConversationId, startNewConversation]);

  const sendMessage = useCallback(async (content: string, persona: Persona) => {
    if (!user) return;

    startTransition(async () => {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const result: any = await createNewSession({ title: content.substring(0, 30) + "...", mode: persona, languageIntent: 'auto' });
        sessionId = result.data.sessionId;
        setActiveConversationId(sessionId);
      }
      
      if (!sessionId) return;

      const userMessage: Omit<AiMessage, 'id'> = { role: 'user', content, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false };
      await appendUserMessage({ sessionId, message: userMessage });

      const messagesSnapshot = await getDocs(query(collection(db, `aiProfiles/${user.uid}/sessions/${sessionId}/messages`), orderBy("createdAt", "asc")));
      const historyForAi = messagesSnapshot.docs.map(doc => doc.data() as AiMessage);

      const { content: aiContent, nativeScript, isError } = await getAiResponse(historyForAi, persona);
      const aiMessage: Omit<AiMessage, 'id'> = { role: 'assistant', content: aiContent, nativeScriptLine: nativeScript, isError, mode: persona, languageIntent: 'auto', createdAt: Date.now(), showScript: false };
      await appendUserMessage({ sessionId, message: aiMessage });
    });
  }, [user, activeSessionId, setActiveConversationId]);

  const deleteConversation = useCallback(async (sessionId: string) => {
    if (!user) return;
    await deleteSession({ sessionId });
  }, [user]);

  const renameConversation = useCallback(async (sessionId: string, newTitle: string) => {
    if (!user) return;
    await updateSession({ sessionId, updates: { title: newTitle } });
  }, [user]);

  const archiveConversation = useCallback(async (sessionId: string) => {
    if (!user) return;
    await updateSession({ sessionId, updates: { isArchived: true } });
  }, [user]);

  const activeConversation = sessions.find(s => s.id === activeSessionId);
  
  const regenerateResponse = useCallback(async (message: AiMessage) => {
    if (!activeConversation || !user) return;

    startTransition(async () => {
        const messageIndex = activeConversation.messages.findIndex(m => m.id === message.id);
        const history = activeConversation.messages.slice(0, messageIndex);
        
        const { content: aiContent, nativeScript, isError } = await getAiResponse(history, activePersona);
        
        const updatedMessages = [...history, { ...message, content: aiContent, nativeScriptLine: nativeScript, isError }];
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: updatedMessages as AiMessage[] } : s));
    });
  }, [user, activeConversation, activePersona, activeSessionId]);

  const toggleScript = useCallback((messageId: string) => {
    setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
            const newMessages = s.messages.map(m => 
                m.id === messageId ? { ...m, showScript: !m.showScript } : m
            );
            return { ...s, messages: newMessages };
        }
        return s;
    }));
  }, [activeSessionId]);


  return {
    conversations: sessions.filter(s => !s.isArchived),
    activeConversation,
    activeSessionId,
    activePersona,
    setActiveConversationId,
    isPending,
    startNewConversation,
    handlePersonaChange,
    sendMessage,
    regenerateResponse,
    toggleScript,
    deleteConversation,
    renameConversation,
    archiveConversation,
  };
}
