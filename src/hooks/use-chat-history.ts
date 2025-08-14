
"use client";

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { Message, Persona, QuickChipAction, Conversation } from '@/lib/types';
import { getAiResponse, getQuickResponse, getInitialGreeting } from '@/app/actions';

const initialPersona: Persona = 'Friend';
const LOGIN_PROMPT_INTERVAL = 10; // Show prompt after every 10 user messages for guests

let guestConversationCount = 0;

export function useChatHistory(isLoggedIn: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePersona, setActivePersona] = useState<Persona>(initialPersona);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

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
    startTransition(async () => {
      const { content, nativeScript } = await getInitialGreeting(persona);
      const newConversation: Conversation = {
        id: isLoggedIn ? Date.now().toString() : `guest-${++guestConversationCount}`,
        title: `[${persona}] - New Chat`,
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
        isArchived: false,
      };

      if (isLoggedIn) {
          setConversations(prev => [...prev, newConversation].sort((a,b) => b.timestamp - a.timestamp));
      } else {
        // For guests, we add to the list of conversations in memory for the session
        setConversations(prev => [...prev, newConversation]);
      }
      setActiveConversationIdState(newConversation.id);
      setActivePersona(persona);
    });
  }, [isLoggedIn]);
  
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
      const convosToSave = conversations.filter(c => !c.id.startsWith('guest-'));
      if (convosToSave.length > 0) {
        localStorage.setItem('shravya-chat-history', JSON.stringify(convosToSave));
      } else {
        localStorage.removeItem('shravya-chat-history');
      }
    }
    const activeConvo = conversations.find(c => c.id === activeConversationId);
    if(isLoggedIn && !isInitialLoad && activeConvo && !activeConvo.id.startsWith('guest-')){
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
    let conversationIdToUpdate = activeConversationId;
  
    // If user is logged in and was on a guest conversation, save it as a new permanent one
    if (isLoggedIn && currentConversation?.id.startsWith('guest-')) {
      const newConversation: Conversation = {
        ...currentConversation,
        id: Date.now().toString(),
        title: `[${persona}] - ${content.substring(0, 30)}...`,
        messages: [...currentConversation.messages.filter(m => m.role !== 'system'), newUserMessage]
      };
      conversationIdToUpdate = newConversation.id;
      
      setConversations(prev => [...prev.filter(c => c.id !== currentConversation?.id), newConversation].sort((a,b) => b.timestamp - a.timestamp));
      setActiveConversationIdState(newConversation.id);
    } else {
       const updatedMessages = currentConversation ? [...currentConversation.messages.filter(m => m.role !== 'system'), newUserMessage] : [newUserMessage];
        const newTitle = (currentConversation?.messages.length === 0 || (currentConversation?.messages.length === 1 && currentConversation?.messages[0].role === 'assistant'))
          ? `[${persona}] - ${content.substring(0, 30)}...` 
          : currentConversation?.title;

        updateActiveConversation(c => ({
            ...c,
            messages: updatedMessages,
            title: newTitle || c.title,
        }));
    }
  
    startTransition(async () => {
      // Need to find the conversation again after potential state updates
      const updatedConversation = conversations.find(c => c.id === conversationIdToUpdate);
      const historyToConsider = updatedConversation?.messages.map(({ role, content }) => ({ role, content })) || [{role: 'user', content}];
      
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
      
      updateActiveConversation(c => {
        let finalMessages: Message[] = [...c.messages, newAiMessage];
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
        return {...c, messages: finalMessages};
      });
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
    if (!isInitialLoad && activeConversationId === null) {
      startNewConversation(activePersona || initialPersona);
    }
  }, [activeConversationId, isInitialLoad, startNewConversation, activePersona]);

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
