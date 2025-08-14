"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog';
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Sparkles, BookOpen, ListOrdered, ChevronDown } from "lucide-react";
import { DiyaIcon } from "@/components/icons";
import { ChatMessage } from "@/components/chat-message";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { getAiResponse, getQuickResponse, getInitialGreeting } from "@/app/actions";
import type { Message, Persona, QuickChipAction } from "@/lib/types";

const personas: Persona[] = ["Friend", "Teacher", "Spiritual", "Pro", "Storyteller"];

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [activePersona, setActivePersona] = useState<Persona>("Friend");
  const [isPending, startTransition] = useTransition();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  useEffect(() => {
    const savedPersona = localStorage.getItem("shravya-persona") as Persona;
    if (savedPersona && personas.includes(savedPersona)) {
      setActivePersona(savedPersona);
    } else {
        setActivePersona("Friend");
    }
  }, []);

  useEffect(() => {
    if (activePersona) {
      localStorage.setItem("shravya-persona", activePersona);
      startTransition(async () => {
        const { content, nativeScript } = await getInitialGreeting(activePersona);
        setMessages([
          {
            id: "0",
            role: "assistant",
            content: content,
            displayContent: content,
            nativeScript: nativeScript,
            isRoman: true,
          },
        ]);
      });
    }
  }, [activePersona]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handlePersonaChange = (persona: Persona) => {
    if (persona !== activePersona) {
      setSelectedPersona(persona);
      setIsDialogOpen(true);
    }
  };

  const confirmPersonaChange = () => {
    if (selectedPersona) {
      setActivePersona(selectedPersona);
    }
    setIsDialogOpen(false);
  };

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);

    startTransition(async () => {
      const { content, nativeScript } = await getAiResponse(updatedMessages, activePersona);
      const newAiMessage: Message = {
        id: Date.now().toString() + "-ai",
        role: "assistant",
        content,
        displayContent: content,
        nativeScript,
        isRoman: true,
      };
      setMessages((prev) => [...prev, newAiMessage]);
    });
  };

  const handleQuickChipAction = (action: QuickChipAction) => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
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
        setMessages(prev => [...prev, newAiMessage]);
    });
  };

  const handleRegenerate = (message: Message) => {
    const history = messages.slice(0, messages.findIndex(m => m.id === message.id));
    
    startTransition(async () => {
        const { content, nativeScript } = await getAiResponse(history, message.persona || activePersona);
        setMessages(prev => prev.map(m => 
            m.id === message.id 
            ? { ...m, content, displayContent: content, nativeScript, isRoman: true, isError: false } 
            : m
        ));
    });
  };
  
  const handleScriptToggle = (messageId: string) => {
      setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
              return { ...m, isRoman: !m.isRoman, displayContent: m.isRoman ? m.nativeScript : m.content };
          }
          return m;
      }));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Change Persona?</AlertDialogTitle>
                <AlertDialogDescription>
                    Changing the persona will clear your current chat history. Are you sure you want to continue?
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmPersonaChange}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      <header className="p-4 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
                <DiyaIcon className="h-8 w-8 text-primary" />
                <h1 className="text-xl font-bold font-headline text-primary-foreground">Shravya AI</h1>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-40 justify-between">
                        <span>{activePersona}</span>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-40">
                    {personas.map((persona) => (
                    <DropdownMenuItem
                        key={persona}
                        onSelect={() => handlePersonaChange(persona)}
                        className={activePersona === persona ? 'bg-primary/10' : ''}
                    >
                        {persona}
                    </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <ScrollArea className="h-full" ref={scrollAreaRef}>
          <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onRegenerate={handleRegenerate} onScriptToggle={handleScriptToggle} />
            ))}
            {isPending && <ThinkingBubble />}
          </div>
        </ScrollArea>
      </main>

      <footer className="p-4 bg-card/80 backdrop-blur-sm sticky bottom-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-3">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleQuickChipAction('explain')} disabled={isPending}>
                  <BookOpen className="w-4 h-4 mr-2" /> Explain simply
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleQuickChipAction('fun')} disabled={isPending}>
                  <Sparkles className="w-4 h-4 mr-2" /> Make it fun
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleQuickChipAction('steps')} disabled={isPending}>
                  <ListOrdered className="w-4 h-4 mr-2" /> Give steps
              </Button>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Chat with ${activePersona}...`}
              className="flex-1 rounded-2xl min-h-[44px] max-h-48 bg-background resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isPending}
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full w-11 h-11 shrink-0 bg-accent hover:bg-accent/90"
              disabled={isPending || !input.trim()}
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </footer>
    </div>
  );
}
