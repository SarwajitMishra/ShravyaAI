
"use client";

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { Message, Persona, QuickChipAction, Conversation } from '@/lib/types';
import { getAiResponse, getQuickResponse, getInitialGreeting } from '@/app/actions';

const initialPersona: Persona = 'Friend';

export function useChatHistory(isLoggedIn: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePersona, setActivePersona] = useState<Persona>(initialPersona);

  const createTemporaryConversation = (persona: Persona) => {
    return {
        id: 'temp',
        title: `New Chat - ${persona}`,
        persona: persona,
        timestamp: Date.now(),
        messages: [],
    };
  };

  useEffect(() => {
    if (isLoggedIn) {
      const savedHistory = localStorage.getItem('shravya-chat-history');
      const savedPersona = localStorage.getItem('shravya-persona') as Persona || initialPersona;
      
      if (savedHistory) {
        try {
            const parsedHistory = JSON.parse(savedHistory);
            if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
              setConversations(parsedHistory);
              const latestConversation = parsedHistory.sort((a,b) => b.timestamp - a.timestamp)[0];
              setActiveConversationId(latestConversation.id);
              setActivePersona(latestConversation.persona);
            } else {
              startNewConversation(savedPersona);
            }
        } catch (e) {
            console.error("Failed to parse chat history:", e);
            startNewConversation(savedPersona);
        }
      } else {
        startNewConversation(savedPersona);
      }
    } else {
        const tempConversation = createTemporaryConversation(initialPersona);
        setConversations([tempConversation]);
        setActiveConversationId(tempConversation.id);
        setActivePersona(tempConversation.persona);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && conversations.length > 0) {
      const convosToSave = conversations.filter(c => c.id !== 'temp');
      if (convosToSave.length > 0) {
        localStorage.setItem('shravya-chat-history', JSON.stringify(convosToSave));
      } else {
        localStorage.removeItem('shravya-chat-history');
      }
    }
    const activeConvo = conversations.find(c => c.id === activeConversationId);
    if(isLoggedIn && activeConvo && activeConvo.id !== 'temp'){
        localStorage.setItem("shravya-persona", activeConvo.persona);
    }
  }, [conversations, activeConversationId, isLoggedIn]);

  const startNewConversation = useCallback((persona: Persona) => {
    startTransition(async () => {
      const { content, nativeScript } = await getInitialGreeting(persona);
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: `New Chat`,
        persona: persona,
        timestamp: Date.now(),
        messages: [{
          id: '0',
          role: 'assistant',
          content,
          displayContent: content,
          nativeScript,
          isRoman: true,
        }],
      };
      
      if (isLoggedIn) {
         setConversations(prev => {
           const otherConversations = prev.filter(c => c.id !== 'temp');
           return [...otherConversations, newConversation].sort((a,b) => a.timestamp - b.timestamp);
         });
      } else {
        setConversations([newConversation]);
      }
      
      setActiveConversationId(newConversation.id);
      setActivePersona(persona);
    });
  }, [isLoggedIn]);

  const updateActiveConversation = useCallback((updater: (conversation: Conversation) => Conversation) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeConversationId ? updater(c) : c))
    );
  }, [activeConversationId]);

  const sendMessage = useCallback((content: string, persona: Persona) => {
    const activeConv = conversations.find(c => c.id === activeConversationId);
    
    if (!activeConv || (activeConv.id === 'temp' && activeConv.messages.length === 0)) {
        if(isLoggedIn) {
            const tempConversation = conversations.find(c => c.id === 'temp');
            if (tempConversation) {
                 const newConversation: Conversation = {
                    id: Date.now().toString(),
                    title: content.substring(0, 30) + '...',
                    persona: persona,
                    timestamp: Date.now(),
                    messages: [],
                };
                setConversations(prev => [...prev.filter(c => c.id !== 'temp'), newConversation].sort((a,b) => a.timestamp - b.timestamp));
                setActiveConversationId(newConversation.id);
            } else {
                startNewConversation(persona);
            }
        }
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };

    let allHistoryForPersona: Message[] = [];

    setConversations(prev => {
        const conversationsForPersona = prev.filter(c => c.persona === persona && c.id !== 'temp');
        
        conversationsForPersona.forEach(c => {
            allHistoryForPersona.push(...c.messages.filter(m => m.id !== '0'));
        });

        return prev.map(c => {
            if (c.id === activeConversationId) {
                const newTitle = (c.messages.length === 0 || (c.messages.length === 1 && c.messages[0].id === '0')) ? content.substring(0, 30) + '...' : c.title;
                const updatedMessages = [...c.messages, newUserMessage];
                allHistoryForPersona.push(newUserMessage); // Add new user message for current context
                return { ...c, title: newTitle, messages: updatedMessages };
            }
            return c;
        });
    });

    startTransition(async () => {
      if (allHistoryForPersona.length === 0) {
        // This can happen if the state update hasn't completed yet, especially on new conversation.
        // We'll manually add the user message to ensure the AI gets it.
        allHistoryForPersona.push(newUserMessage);
      }

      const { content: aiContent, nativeScript, isError } = await getAiResponse(allHistoryForPersona, persona);
      const newAiMessage: Message = {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: aiContent,
        displayContent: aiContent,
        nativeScript,
        isRoman: true,
        isError: isError,
      };
      
      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, newAiMessage],
      }));
    });
  }, [activeConversationId, conversations, isLoggedIn, startNewConversation, updateActiveConversation]);
  
  const regenerateResponse = useCallback((messageId: string) => {
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;
    
    const conversationsForPersona = conversations.filter(c => c.persona === conversation.persona && c.id !== 'temp');
    let historyForPersona: Message[] = [];

    conversationsForPersona.forEach(c => {
      if(c.id === activeConversationId){
        // For the active conversation, only take messages up to the one being regenerated
        historyForPersona.push(...c.messages.slice(0, messageIndex).filter(m => m.id !== '0'));
      } else {
        // For older conversations, take all messages
        historyForPersona.push(...c.messages.filter(m => m.id !== '0'));
      }
    });

    startTransition(async () => {
        const { content, nativeScript, isError } = await getAiResponse(historyForPersona, conversation.persona);
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
            // Remove subsequent messages in the current conversation
            newMessages.splice(messageIndex + 1);
            return {...c, messages: newMessages};
        })
    });
  }, [conversations, activeConversationId, updateActiveConversation]);

  const performQuickAction = useCallback((action: QuickChipAction) => {
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const lastAssistantMessage = [...conversation.messages].reverse().find(m => m.role === 'assistant');
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
      if (!isLoggedIn) return prev;
      
      const remainingConversations = prev.filter(c => c.id !== conversationId);
      
      if (activeConversationId === conversationId) {
        if (remainingConversations.length > 0) {
          const newActiveConvo = remainingConversations.sort((a,b) => b.timestamp - a.timestamp)[0];
          setActiveConversationId(newActiveConvo.id);
          setActivePersona(newActiveConvo.persona);
        } else {
          setActiveConversationId(null);
          setActivePersona(initialPersona);
          // We queue up the action to avoid calling startTransition during a render
          setTimeout(() => startNewConversation(initialPersona), 0);
        }
      }
      return remainingConversations;
    });
  }, [isLoggedIn, activeConversationId, startNewConversation]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return {
    conversations,
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
    activePersona,
    setActivePersona,
  };
}

    