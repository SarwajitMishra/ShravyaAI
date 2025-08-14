
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

  const createTemporaryConversation = (persona: Persona): Conversation => {
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
      
      try {
        const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
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
      const tempConversation = createTemporaryConversation(activePersona);
      setConversations([tempConversation]);
      setActiveConversationId(tempConversation.id);
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
        id: isLoggedIn ? Date.now().toString() : 'temp',
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
           return [...otherConversations, newConversation].sort((a,b) => b.timestamp - a.timestamp);
         });
         setActiveConversationId(newConversation.id);
      } else {
        setConversations([newConversation]);
        setActiveConversationId('temp');
      }
      
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
            const newConversation: Conversation = {
                id: Date.now().toString(),
                title: content.substring(0, 30) + '...',
                persona: persona,
                timestamp: Date.now(),
                messages: [],
            };
            setConversations(prev => [...prev.filter(c => c.id !== 'temp'), newConversation].sort((a,b) => b.timestamp - a.timestamp));
            setActiveConversationId(newConversation.id);
        }
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };

    let allHistoryForPersona: Message[] = [];

    setConversations(prev => {
        if (isLoggedIn) {
            const conversationsForPersona = prev.filter(c => c.persona === persona && c.id !== 'temp');
            
            conversationsForPersona.forEach(c => {
                allHistoryForPersona.push(...c.messages.filter(m => m.id !== '0'));
            });
        }
        
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
      const historyToConsider = isLoggedIn ? allHistoryForPersona : [newUserMessage];

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
      
      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, newAiMessage],
      }));
    });
  }, [activeConversationId, conversations, isLoggedIn, updateActiveConversation]);
  
  const regenerateResponse = useCallback((messageId: string) => {
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;
    
    let historyForPersona: Message[] = [];
    if(isLoggedIn){
        const conversationsForPersona = conversations.filter(c => c.persona === conversation.persona && c.id !== 'temp');
        conversationsForPersona.forEach(c => {
          if(c.id === activeConversationId){
            historyForPersona.push(...c.messages.slice(0, messageIndex).filter(m => m.id !== '0'));
          } else {
            historyForPersona.push(...c.messages.filter(m => m.id !== '0'));
          }
        });
    } else {
        historyForPersona.push(...conversation.messages.slice(0, messageIndex).filter(m => m.id !== '0'));
    }

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
            newMessages.splice(messageIndex + 1);
            return {...c, messages: newMessages};
        })
    });
  }, [conversations, activeConversationId, updateActiveConversation, isLoggedIn]);

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
          setActiveConversationId(newActive.id);
          setActivePersona(newActive.persona);
        } else {
            setActiveConversationId(null);
            if (isLoggedIn) {
                startNewConversation(activePersona || initialPersona);
            }
        }
      }
      return remaining;
    });
  }, [activeConversationId, activePersona, isLoggedIn, startNewConversation]);

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
