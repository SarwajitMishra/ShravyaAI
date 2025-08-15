
"use client";

import { useState, useEffect, useTransition, useCallback } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot } from "firebase/firestore";
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

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
    if (id) {
      const session = sessions.find(s => s.id === id);
      if (session) {
        setActivePersona(session.mode);
      }
    }
  }, [sessions]);

  // Effect for fetching the list of conversations.
  useEffect(() => {
    if (user) {
      ensureProfile();
      const sessionsQuery = query(collection(db, `aiProfiles/${user.uid}/sessions`), orderBy("updatedAt", "desc"));
      const unsubscribe = onSnapshot(sessionsQuery, snapshot => {
        const userSessions = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        }) as AiSession);
        setSessions(userSessions);
      });
      return () => unsubscribe();
    } else {
      const savedHistory = localStorage.getItem('shravya-guest-history');
      if (savedHistory) {
        const parsedSessions: AiSession[] = JSON.parse(savedHistory);
        setSessions(parsedSessions);
      }
    }
  }, [user]);

  // Effect for setting the initial active session when the list loads.
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      const latestSession = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveConversationId(latestSession.id);
    }
  }, [sessions, activeSessionId, setActiveConversationId]);

  // Effect for saving guest data to localStorage
  useEffect(() => {
    if (!user) {
      localStorage.setItem('shravya-guest-history', JSON.stringify(sessions));
    }
  }, [sessions, user]);

  // Effect for fetching messages for the active session.
  useEffect(() => {
    if (user && activeSessionId) {
      const messagesQuery = query(collection(db, `aiProfiles/${user.uid}/sessions/${activeSessionId}/messages`), orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const sessionMessages = snapshot.docs.map(doc => ({ ...doc.data() as AiMessage, id: doc.id }));
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: sessionMessages } : s));
      });
      return () => unsubscribe();
    }
  }, [user, activeSessionId]);


  const startNewConversation = useCallback(async (persona: Persona) => {
    startTransition(async () => {
      const { content, nativeScript } = await getInitialGreeting(persona);
      const newAiMessage: Omit<AiMessage, 'id'> = {
        role: 'assistant',
        content,
        nativeScriptLine: nativeScript,
        mode: persona,
        languageIntent: 'auto',
        createdAt: Date.now(),
        showScript: undefined
      };
  
      const newSessionData = {
        title: `[${persona}] ${content.substring(0, 20)}...`,
        mode: persona,
        languageIntent: 'auto' as const,
      };
  
      if (user) {
        const result: any = await createNewSession(newSessionData);
        const newSessionId = result.data.sessionId;
        await appendUserMessage({ sessionId: newSessionId, message: newAiMessage });
        setActiveConversationId(newSessionId);
      } else {
        const newSession: AiSession = {
          id: Date.now().toString(),
          uid: 'guest',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [{ ...newAiMessage, id: '0' }],
          ...newSessionData,
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveConversationId(newSession.id);
      }
      setActivePersona(persona);
    });
  }, [user, setActiveConversationId]);
  

  const sendMessage = useCallback(async (content: string, persona: Persona) => {
    const newUserMessage: Omit<AiMessage, 'id' | 'createdAt'> = {
        role: 'user',
        content,
        mode: persona,
        languageIntent: 'auto',
        showScript: undefined,
    };

    startTransition(async () => {
        let currentSessionId = activeSessionId;
        let sessionToUpdate: AiSession | undefined = sessions.find(s => s.id === currentSessionId);

        if (!sessionToUpdate) {
            console.log("[useChatHistory] No active session, creating a new one.");
            
            const newSessionData = {
                title: content.substring(0, 30) + "...",
                mode: persona,
                languageIntent: 'auto' as const,
            };

            const result: any = user 
                ? await createNewSession(newSessionData)
                : { data: { sessionId: Date.now().toString() } };

            const newSessionId = result.data.sessionId;
            
            const newSession: AiSession = {
                id: newSessionId,
                uid: user ? user.uid : 'guest',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
                ...newSessionData
            };
            
            setSessions(prev => [newSession, ...prev]);
            setActiveConversationId(newSessionId);
            
            currentSessionId = newSessionId;
            sessionToUpdate = newSession;
        }

        if (!sessionToUpdate || !currentSessionId) {
            console.error("[useChatHistory] Failed to get a valid session. Exiting.");
            return;
        }

        const historyForAi = [...sessionToUpdate.messages, { ...newUserMessage, id: 'temp-user', createdAt: Date.now() }];
        
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: historyForAi as AiMessage[] } : s));
        
        const { content: aiContent, nativeScript, isError } = await getAiResponse(historyForAi, persona);
        
        const newAiMessage: Omit<AiMessage, 'id' | 'createdAt'> = {
            role: 'assistant',
            content: aiContent,
            nativeScriptLine: nativeScript,
            isError,
            mode: persona,
            languageIntent: 'auto',
            showScript: undefined
        };

        if (user) {
            await appendUserMessage({ sessionId: currentSessionId, message: newUserMessage });
            await appendUserMessage({ sessionId: currentSessionId, message: newAiMessage });
        } else {
            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    const finalMessages = s.messages.filter(m => m.id !== 'temp-user');
                    return { ...s, messages: [...finalMessages, { ...newUserMessage, id: Date.now().toString(), createdAt: Date.now() }, { ...newAiMessage, id: Date.now().toString() + '-ai', createdAt: Date.now() }] };
                }
                return s;
            }));
        }
    });
}, [user, activeSessionId, sessions, setActiveConversationId]);


const deleteConversation = useCallback(async (sessionId: string) => {
    const remainingSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(remainingSessions);

    if (activeSessionId === sessionId) {
        setActiveConversationId(remainingSessions.length > 0 ? remainingSessions[0].id : null);
    }

    if (user) {
        await deleteSession({ sessionId });
    }
}, [user, sessions, activeSessionId, setActiveConversationId]);


    const renameConversation = useCallback(async (sessionId: string, newTitle: string) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
        if (user) {
            await updateSession({ sessionId, updates: { title: newTitle } });
        }
    }, [user]);

    const archiveConversation = useCallback(async (sessionId: string) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isArchived: true } : s));
        if(user) {
            await updateSession({ sessionId, updates: { isArchived: true } });
        }
    }, [user]);


  const activeConversation = sessions.find(s => s.id === activeSessionId);

  const regenerateResponse = async (message: AiMessage) => {
    if (!activeConversation) return;

    startTransition(async () => {
        const messageIndex = activeConversation.messages.findIndex(m => m.id === message.id);
        const history = activeConversation.messages.slice(0, messageIndex);
        
        const { content: aiContent, nativeScript, isError } = await getAiResponse(history, activePersona);
        
        const newAiMessage: AiMessage = {
            ...message,
            content: aiContent,
            nativeScriptLine: nativeScript,
            isError,
        };

        if (user && activeSessionId) {
            // This needs a specific backend function to replace a message
            console.warn("Regenerate for logged-in users not fully implemented.");
        } else {
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    const newMessages = [...history, newAiMessage];
                    return { ...s, messages: newMessages };
                }
                return s;
            }));
        }
    });
  };

  const toggleScript = (messageId: string) => {
    setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
            const newMessages = s.messages.map(m => 
                m.id === messageId ? { ...m, showScript: !m.showScript } : m
            );
            return { ...s, messages: newMessages };
        }
        return s;
    }));
  };

  return {
    conversations: sessions.filter(s => !s.isArchived),
    activeConversation,
    activeSessionId,
    setActiveConversationId,
    isPending,
    startNewConversation,
    sendMessage,
    regenerateResponse,
    performQuickAction: () => {},
    toggleScript,
    deleteConversation,
    renameConversation,
    archiveConversation,
    dismissLoginPrompt: () => {},
    activePersona,
    setActivePersona,
  };
}
