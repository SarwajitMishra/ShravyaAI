
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
              const latestConversation = parsedHistory[parsedHistory.length - 1];
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
        title: `New Chat - ${persona}`,
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
           return [...otherConversations, newConversation];
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
    
    // Start a new conversation if there's no active one or if the user is logged out and this is the first message.
    if (!activeConv || (activeConv.id === 'temp' && activeConv.messages.length === 0)) {
        if(isLoggedIn) {
            startNewConversation(persona);
        }
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };

    let updatedConversation: Conversation | undefined;

    setConversations(prev => {
      return prev.map(c => {
        if (c.id === activeConversationId) {
          const newTitle = c.messages.length < 2 ? content.substring(0, 30) + '...' : c.title;
          updatedConversation = { ...c, title: newTitle, messages: [...c.messages, newUserMessage] };
          return updatedConversation;
        }
        return c;
      });
    });

    startTransition(async () => {
      if (!updatedConversation) return;

      const { content: aiContent, nativeScript, isError } = await getAiResponse(updatedConversation.messages, updatedConversation.persona);
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
    
    // We only want user messages and assistant responses up to the point of regeneration
    const history = conversation.messages.slice(0, messageIndex);

    startTransition(async () => {
        const { content, nativeScript, isError } = await getAiResponse(history, conversation.persona);
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
            // Remove subsequent messages
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
          const newActiveConvo = remainingConversations[remainingConversations.length - 1];
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
