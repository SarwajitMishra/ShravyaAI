
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
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
    if (id) {
      const session = sessions.find(s => s.id === id);
      if (session) {
        setActivePersona(session.mode);
      }
    }
  }, [sessions]);

  // Effect for initial data load (Firestore for users, localStorage for guests)
  useEffect(() => {
    if (isInitialLoad) {
      if (user) {
        ensureProfile();
        const sessionsQuery = query(collection(db, `aiProfiles/${user.uid}/sessions`), orderBy("updatedAt", "desc"));
        const unsubscribe = onSnapshot(sessionsQuery, snapshot => {
          const userSessions = snapshot.docs.map(doc => {
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
              messages: [] 
            } as AiSession;
          });
          setSessions(userSessions);
          if (userSessions.length > 0) {
            setActiveConversationId(userSessions[0].id);
          }
          setIsInitialLoad(false);
        });
        return () => unsubscribe();
      } else {
        const savedHistory = localStorage.getItem('shravya-guest-history');
        if (savedHistory) {
            const parsedSessions: AiSession[] = JSON.parse(savedHistory);
            setSessions(parsedSessions);
            if(parsedSessions.length > 0) {
                const latestSession = parsedSessions.sort((a,b) => b.updatedAt - a.updatedAt)[0];
                setActiveConversationId(latestSession.id);
            }
        }
        setIsInitialLoad(false);
      }
    }
  }, [isInitialLoad, user, setActiveConversationId]);

  // Effect for saving guest data to localStorage
  useEffect(() => {
    if (!user && !isInitialLoad) {
      localStorage.setItem('shravya-guest-history', JSON.stringify(sessions));
    }
  }, [sessions, isInitialLoad, user]);

  // Effect for fetching messages for the active session (Firestore users only)
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

        if (user) {
            const result: any = await createNewSession({ title: `[${persona}] ${content.substring(0,20)}...`, mode: persona, languageIntent: 'auto' });
            await appendUserMessage({ sessionId: result.data.sessionId, message: newAiMessage });
            setActiveConversationId(result.data.sessionId);
        } else {
            const newSession: AiSession = {
                id: Date.now().toString(),
                uid: 'guest',
                title: `[${persona}] - New Chat`,
                mode: persona,
                languageIntent: 'auto',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [{...newAiMessage, id: '0' }],
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
      showScript: undefined
    };

    if(!user) {
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, {...newUserMessage, id: 'temp-user', createdAt: Date.now()}] } : s));
    }
    
    startTransition(async () => {
        const activeSession = sessions.find(s => s.id === activeSessionId);
        if(!activeSession) return;
        
        const historyForAi = [...activeSession.messages, {...newUserMessage, id: 'temp-user', createdAt: Date.now()}];
        
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

        if (user && activeSessionId) {
            await appendUserMessage({ sessionId: activeSessionId, message: newUserMessage });
            await appendUserMessage({ sessionId: activeSessionId, message: newAiMessage });
        } else {
             setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    const newMessages = s.messages.filter(m => m.id !== 'temp-user');
                    return { ...s, messages: [...newMessages, {...newUserMessage, id: Date.now().toString(), createdAt: Date.now()}, {...newAiMessage, id: Date.now().toString() + '-ai', createdAt: Date.now()} ]};
                }
                return s;
             }));
        }
    });
  }, [user, activeSessionId, sessions]);

    const deleteConversation = useCallback(async (sessionId: string) => {
        if(user) {
            await deleteSession({ sessionId });
        } else {
            setSessions(prev => prev.filter(s => s.id !== sessionId));
        }
    }, [user]);

    const renameConversation = useCallback(async (sessionId: string, newTitle: string) => {
        if(user) {
            await updateSession({ sessionId, updates: { title: newTitle } });
        } else {
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
        }
    }, [user]);

    const archiveConversation = useCallback(async (sessionId: string) => {
        if(user) {
            await updateSession({ sessionId, updates: { isArchived: true } });
        } else {
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isArchived: true } : s));
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
