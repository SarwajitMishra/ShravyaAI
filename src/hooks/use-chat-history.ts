
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

  useEffect(() => {
    if (isLoggedIn) {
      const savedHistory = localStorage.getItem('shravya-chat-history');
      const savedPersona = localStorage.getItem('shravya-persona') as Persona || initialPersona;
      
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
          setConversations(parsedHistory);
          const latestConversation = parsedHistory[parsedHistory.length - 1];
          setActiveConversationId(latestConversation.id);
          setActivePersona(latestConversation.persona);
        } else {
          startNewConversation(savedPersona);
        }
      } else {
        startNewConversation(savedPersona);
      }
    } else {
        // Not logged in, create a temporary conversation that won't be saved
        const tempConversation: Conversation = {
          id: 'temp',
          title: `New Chat - ${initialPersona}`,
          persona: initialPersona,
          timestamp: Date.now(),
          messages: [],
        };
        setConversations([tempConversation]);
        setActiveConversationId(tempConversation.id);
        setActivePersona(initialPersona);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && conversations.length > 0 && activeConversationId !== 'temp') {
      const convosToSave = conversations.filter(c => c.id !== 'temp');
      if (convosToSave.length > 0) {
        localStorage.setItem('shravya-chat-history', JSON.stringify(convosToSave));
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
    let currentConversationId = activeConversationId;
    
    // If user is not logged in and sends a message, we start a new conversation
    if (!isLoggedIn || !currentConversationId || currentConversationId === 'temp' || conversations.find(c => c.id === currentConversationId)?.messages.length === 0) {
        const newConversation: Conversation = {
            id: Date.now().toString(),
            title: content.substring(0, 30) + '...',
            persona: persona,
            timestamp: Date.now(),
            messages: [],
        };
        
        if(isLoggedIn){
            setConversations(prev => {
                const otherConversations = prev.filter(c => c.id !== 'temp');
                return [...otherConversations, newConversation];
            });
        } else {
            // This case should ideally not happen if login flow is enforced
            setConversations([newConversation]);
        }
        currentConversationId = newConversation.id;
        setActiveConversationId(newConversation.id);
        setActivePersona(persona);
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
    
    let updatedConversation: Conversation | null = null;
    
    setConversations(prev => prev.map(c => {
        if(c.id === currentConversationId) {
            const newTitle = c.messages.length < 2 ? content.substring(0, 30) + '...' : c.title;
            updatedConversation = { ...c, title: newTitle, messages: [...c.messages, newUserMessage] };
            return updatedConversation;
        }
        return c;
    }));

    startTransition(async () => {
        if (!updatedConversation) return;

      const { content: aiContent, nativeScript } = await getAiResponse(updatedConversation.messages, updatedConversation.persona);
      const newAiMessage: Message = {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: aiContent,
        displayContent: aiContent,
        nativeScript,
        isRoman: true,
      };
       setConversations(prev =>
            prev.map(c => (c.id === currentConversationId ? {...c, messages: [...c.messages, newAiMessage]} : c))
        );
    });
  }, [activeConversationId, updateActiveConversation, isLoggedIn, conversations]);
  
  const regenerateResponse = useCallback((messageId: string) => {
    if (!activeConversationId) return;
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const history = conversation.messages.slice(0, messageIndex);

    startTransition(async () => {
        const { content, nativeScript } = await getAiResponse(history, conversation.persona);
        updateActiveConversation(c => {
            const newMessages = [...c.messages];
            newMessages[messageIndex] = {
                ...newMessages[messageIndex],
                content,
                displayContent: content,
                nativeScript,
                isRoman: true,
                isError: false,
            };
            return {...c, messages: newMessages};
        })
    });
  }, [conversations, activeConversationId, updateActiveConversation]);

  const performQuickAction = useCallback((action: QuickChipAction) => {
    if (!activeConversationId) return;
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    const lastAssistantMessage = [...conversation.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return;

    startTransition(async () => {
        const { content, nativeScript } = await getQuickResponse(action, lastAssistantMessage);
        const newAiMessage: Message = {
            id: Date.now().toString() + "-ai-quick",
            role: "assistant",
            content,
            displayContent: content,
            nativeScript,
            isRoman: true,
        };
        updateActiveConversation(c => ({...c, messages: [...c.messages, newAiMessage]}));
    });
  }, [activeConversationId, conversations, updateActiveConversation]);

  const toggleScript = useCallback((messageId: string) => {
      updateActiveConversation(c => {
          const newMessages = c.messages.map(m => {
              if (m.id === messageId && m.role === 'assistant') {
                  const isRoman = !m.isRoman;
                  return { ...m, isRoman, displayContent: isRoman ? m.content : m.nativeScript };
              }
              return m;
          });
          return {...c, messages: newMessages};
      });
  }, [updateActiveConversation]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!isLoggedIn) return;
    
    setConversations(prev => {
      const newConversations = prev.filter(c => c.id !== conversationId);
      if (activeConversationId === conversationId) {
        if (newConversations.length > 0) {
          setActiveConversationId(newConversations[newConversations.length - 1].id);
        } else {
          startNewConversation(activePersona);
        }
      }
      return newConversations;
    });

  }, [activeConversationId, activePersona, startNewConversation, isLoggedIn]);

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
