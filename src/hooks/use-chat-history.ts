
"use client";

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { Message, Persona, QuickChipAction, Conversation } from '@/lib/types';
import { getAiResponse, getQuickResponse, getInitialGreeting } from '@/app/actions';

const initialPersona: Persona = 'Friend';
const LOGIN_PROMPT_INTERVAL = 3; // Show prompt after every 3 user messages for guests

export function useChatHistory(isLoggedIn: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePersona, setActivePersona] = useState<Persona>(initialPersona);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const createTemporaryConversation = (persona: Persona): Conversation => {
    return {
        id: 'temp',
        title: `[${persona}] - New Chat`,
        persona: persona,
        timestamp: Date.now(),
        messages: [],
        isArchived: false,
    };
  };

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
    if (id) {
        const conversation = conversations.find(c => c.id === id);
        if (conversation) {
            setActivePersona(conversation.persona);
        }
    }
  }, [conversations]);

  const startNewConversation = useCallback((persona: Persona) => {
    const createNew = (p: Persona) => {
        startTransition(async () => {
          const { content, nativeScript } = await getInitialGreeting(p);
          const newConversation: Conversation = {
            id: isLoggedIn ? Date.now().toString() : 'temp',
            title: `[${p}] - New Chat`,
            persona: p,
            timestamp: Date.now(),
            messages: [{
              id: '0',
              role: 'assistant',
              content,
              displayContent: content,
              nativeScript,
              isRoman: true,
            }],
            isArchived: false,
          };
          
          if (isLoggedIn) {
             setConversations(prev => {
               const otherConversations = prev.filter(c => c.id !== 'temp');
               return [...otherConversations, newConversation].sort((a,b) => b.timestamp - a.timestamp);
             });
             setActiveConversationIdState(newConversation.id);
          } else {
            setConversations([newConversation]);
            setActiveConversationIdState('temp');
          }
          setActivePersona(p);
        });
    }

    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv || (activeConv.messages.length <=1 && activeConv.id !=='temp' )) {
        if(isLoggedIn){
            if (activeConv) {
                setConversations(prev => prev.map(c => c.id === activeConv.id ? {...c, persona: persona, title: `[${persona}] - New Chat`} : c));
                 setActivePersona(persona);
            } else {
                createNew(persona);
            }
        } else {
            createNew(persona);
        }
    } else {
        createNew(persona);
    }
  }, [isLoggedIn, conversations, activeConversationId]);
  
  useEffect(() => {
    if (isInitialLoad) {
        if (isLoggedIn) {
            const savedHistory = localStorage.getItem('shravya-chat-history');
            const savedPersona = localStorage.getItem('shravya-persona') as Persona || initialPersona;
            try {
                const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
                if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
                    setConversations(parsedHistory);
                    const latestConversation = parsedHistory.sort((a,b) => b.timestamp - a.timestamp)[0];
                    setActiveConversationIdState(latestConversation.id);
                    setActivePersona(latestConversation.persona);
                } else {
                    startNewConversation(savedPersona);
                }
            } catch (e) {
                console.error("Failed to parse chat history:", e);
                startNewConversation(savedPersona);
            }
        } else {
            startNewConversation(initialPersona);
        }
        setIsInitialLoad(false);
    }
  }, [isLoggedIn, isInitialLoad, startNewConversation]);

  useEffect(() => {
    if (isLoggedIn && !isInitialLoad && conversations.length > 0) {
      const convosToSave = conversations.filter(c => c.id !== 'temp');
      if (convosToSave.length > 0) {
        localStorage.setItem('shravya-chat-history', JSON.stringify(convosToSave));
      } else {
        localStorage.removeItem('shravya-chat-history');
      }
    }
    const activeConvo = conversations.find(c => c.id === activeConversationId);
    if(isLoggedIn && !isInitialLoad && activeConvo && activeConvo.id !== 'temp'){
        localStorage.setItem("shravya-persona", activeConvo.persona);
    }
  }, [conversations, activeConversationId, isLoggedIn, isInitialLoad]);

  const updateActiveConversation = useCallback((updater: (conversation: Conversation) => Conversation) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeConversationId ? updater(c) : c))
    );
  }, [activeConversationId]);

  const sendMessage = useCallback((content: string, persona: Persona) => {
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
  
    let currentConversation = conversations.find(c => c.id === activeConversationId);
  
    if (isLoggedIn && (!currentConversation || currentConversation.id === 'temp')) {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: `[${persona}] - ${content.substring(0, 30)}...`,
        persona: persona,
        timestamp: Date.now(),
        messages: currentConversation ? currentConversation.messages.filter(m => m.role !== 'system') : [],
        isArchived: false,
      };
      
      const newConversations = [...conversations.filter(c => c.id !== 'temp'), newConversation].sort((a, b) => b.timestamp - a.timestamp);
      setConversations(newConversations);
      setActiveConversationIdState(newConversation.id);
      currentConversation = newConversation;
    }
  
    const updatedMessages = currentConversation ? [...currentConversation.messages.filter(m => m.role !== 'system'), newUserMessage] : [newUserMessage];
    const newTitle = (currentConversation?.messages.length <= 1) 
      ? `[${persona}] - ${content.substring(0, 30)}...` 
      : currentConversation?.title;
  
    setConversations(prev =>
      prev.map(c =>
        c.id === (currentConversation?.id || activeConversationId)
          ? { ...c, messages: updatedMessages, title: newTitle || c.title }
          : c
      )
    );
  
    startTransition(async () => {
      const historyToConsider = updatedMessages.map(({ id, role, content }) => ({ id, role, content }));
      const { content: aiContent, nativeScript, isError } = await getAiResponse(historyToConsider, persona);
  
      const newAiMessage: Message = {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: aiContent,
        displayContent: aiContent,
        nativeScript,
        isRoman: true,
        isError: isError,
      };
      
      let finalMessages: Message[] = [...updatedMessages, newAiMessage];

      if (!isLoggedIn) {
        const userMessagesCount = finalMessages.filter(m => m.role === 'user').length;
        if (userMessagesCount > 0 && userMessagesCount % LOGIN_PROMPT_INTERVAL === 0) {
            const loginPromptMessage: Message = {
                id: 'login-prompt-' + userMessagesCount,
                role: 'system',
                content: 'login-prompt',
            };
            finalMessages.push(loginPromptMessage);
        }
      }

      setConversations(prev =>
        prev.map(c => (c.id === (currentConversation?.id || activeConversationId) ? {...c, messages: finalMessages} : c))
      );
    });
  }, [activeConversationId, conversations, isLoggedIn, updateActiveConversation]);
  
  const regenerateResponse = useCallback((messageId: string) => {
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;
    
    const historyToConsider = conversation.messages.slice(0, messageIndex);

    startTransition(async () => {
        const { content, nativeScript, isError } = await getAiResponse(historyToConsider, conversation.persona);
        updateActiveConversation(c => {
            const newMessages = [...c.messages];
            const currentMessage = newMessages[messageIndex];
            newMessages[messageIndex] = {
                ...currentMessage,
                content,
                displayContent: content,
                nativeScript,
                isRoman: true,
                isError,
            };
            newMessages.splice(messageIndex + 1);
            return {...c, messages: newMessages};
        })
    });
  }, [conversations, activeConversationId, updateActiveConversation]);

  const performQuickAction = useCallback((action: QuickChipAction) => {
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const lastAssistantMessage = [...conversation.messages].reverse().find(m => m.role === 'assistant' && !m.isError);
    if (!lastAssistantMessage) return;

    startTransition(async () => {
        const { content, nativeScript, isError } = await getQuickResponse(action, lastAssistantMessage);
        const newAiMessage: Message = {
            id: Date.now().toString() + "-ai-quick",
            role: "assistant",
            content,
            displayContent: content,
            nativeScript,
            isRoman: true,
            isError,
        };
        updateActiveConversation(c => ({...c, messages: [...c.messages, newAiMessage]}));
    });
  }, [activeConversationId, conversations, updateActiveConversation]);

  const toggleScript = useCallback((messageId: string) => {
      updateActiveConversation(c => {
          const newMessages = c.messages.map(m => {
              if (m.id === messageId && m.role === 'assistant' && m.nativeScript) {
                  const isRoman = !m.isRoman;
                  return { ...m, isRoman, displayContent: isRoman ? m.content : m.nativeScript };
              }
              return m;
          });
          return {...c, messages: newMessages};
      });
  }, [updateActiveConversation]);

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== conversationId);
      if (activeConversationId === conversationId) {
        if (remaining.length > 0) {
          const newActive = remaining.sort((a,b) => b.timestamp - a.timestamp)[0];
          setActiveConversationIdState(newActive.id);
          setActivePersona(newActive.persona);
        } else {
            setActiveConversationIdState(null);
        }
      }
      return remaining;
    });
  }, [activeConversationId]);

  const renameConversation = useCallback((conversationId: string, newTitle: string) => {
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, title: newTitle } : c));
  }, []);

  const archiveConversation = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, isArchived: true } : c));
     if (activeConversationId === conversationId) {
        setActiveConversationIdState(null);
     }
  }, [activeConversationId]);

  const dismissLoginPrompt = useCallback((messageId: string) => {
    updateActiveConversation(c => ({
        ...c,
        messages: c.messages.filter(m => m.id !== messageId)
    }));
  }, [updateActiveConversation]);


  useEffect(() => {
    if (!isInitialLoad && !isPending && activeConversationId === null && isLoggedIn) {
      startNewConversation(activePersona || initialPersona);
    } else if (!isInitialLoad && !isPending && conversations.length === 0 && !isLoggedIn) {
       startNewConversation(activePersona || initialPersona);
    }
  }, [activeConversationId, isInitialLoad, isLoggedIn, conversations, startNewConversation, activePersona, isPending]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return {
    conversations: conversations.filter(c => !c.isArchived),
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    isPending,
    startNewConversation,
    sendMessage,
    regenerateResponse,
    performQuickAction,
    toggleScript,
    deleteConversation,
    renameConversation,
    archiveConversation,
    activePersona,
    setActivePersona,
    dismissLoginPrompt,
  };
}
