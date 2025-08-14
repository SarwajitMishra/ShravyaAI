
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Sparkles, BookOpen, ListOrdered, ChevronDown, MessageSquare, Trash2, X } from "lucide-react";
import { DiyaIcon } from "@/components/icons";
import { ChatMessage } from "@/components/chat-message";
import { ThinkingBubble } from "@/components/thinking-bubble";
import type { Message, Persona, QuickChipAction } from "@/lib/types";
import { Sidebar, SidebarProvider, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/use-chat-history";
import { cn } from "@/lib/utils";

const personas: Persona[] = ["Friend", "Teacher", "Spiritual", "Pro", "Storyteller"];

export function ChatPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const {
    conversations,
    activeConversation,
    isPending,
    startNewConversation,
    sendMessage,
    regenerateResponse,
    performQuickAction,
    toggleScript,
    setActiveConversationId,
    deleteConversation,
    activePersona,
    setActivePersona,
  } = useChatHistory(isLoggedIn);

  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [isPersonaChangeDialogOpen, setIsPersonaChangeDialogOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  useEffect(() => {
    // Show login modal on initial load if not logged in
    if (!isLoggedIn) {
        setShowLoginModal(true);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [activeConversation?.messages]);

  const handlePersonaChange = (persona: Persona) => {
    if (persona !== activePersona) {
      if(isLoggedIn){
        setSelectedPersona(persona);
        setIsPersonaChangeDialogOpen(true);
      } else {
        startNewConversation(persona);
      }
    }
  };

  const confirmPersonaChange = () => {
    if (selectedPersona) {
      startNewConversation(selectedPersona);
    }
    setIsPersonaChangeDialogOpen(false);
    setSelectedPersona(null);
  };
  
  const handleSendMessage = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  return (
    <SidebarProvider>
    <div className="flex flex-col h-screen w-full bg-background">
        <AlertDialog open={isPersonaChangeDialogOpen} onOpenChange={setIsPersonaChangeDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Change Persona?</AlertDialogTitle>
                <AlertDialogDescription>
                    Changing the persona will start a new conversation and save the current one. Are you sure you want to continue?
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedPersona(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmPersonaChange}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
            <DialogContent className="sm:max-w-[425px] bg-[#343541] text-white border-0">
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl font-bold">Log in to unlock Shravya AI</DialogTitle>
                    <DialogDescription className="text-center text-gray-300">
                        Just got better at writing, coding, reasoning, and more — now powered by our latest intelligence model.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <Button onClick={() => { setIsLoggedIn(true); setShowLoginModal(false); }} className="bg-white text-black hover:bg-gray-200">
                        Log in
                    </Button>
                    <Button variant="secondary" onClick={() => { setIsLoggedIn(true); setShowLoginModal(false); }} className="bg-transparent border border-gray-500 hover:bg-gray-700">
                        Sign up for free
                    </Button>
                </div>
                 <DialogClose asChild>
                    <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </DialogClose>
            </DialogContent>
        </Dialog>


        {isLoggedIn && (
          <Sidebar>
              <SidebarContent className="p-2">
                  <div className="flex h-full flex-col">
                      <div className="p-2 flex-grow">
                          <h2 className="text-lg font-semibold mb-4 text-primary-foreground">History</h2>
                          <ScrollArea className="h-[calc(100vh-150px)]">
                              <SidebarMenu>
                              {conversations.map((convo) => (
                                  <SidebarMenuItem key={convo.id}>
                                      <SidebarMenuButton 
                                          onClick={() => setActiveConversationId(convo.id)}
                                          isActive={activeConversation?.id === convo.id}
                                          className="w-full justify-start"
                                      >
                                          <MessageSquare className="h-4 w-4" />
                                          <span className="truncate">{convo.title}</span>
                                      </SidebarMenuButton>
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2"
                                          onClick={() => deleteConversation(convo.id)}
                                      >
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </SidebarMenuItem>
                              ))}
                              </SidebarMenu>
                          </ScrollArea>
                      </div>
                  </div>
              </SidebarContent>
          </Sidebar>
        )}

        <div className="flex flex-col h-screen w-full">
            <header className="p-4 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex justify-between items-center max-w-4xl mx-auto">
                    <div className="flex items-center gap-2">
                        {isLoggedIn && <SidebarTrigger className="md:hidden"/>}
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
                                className={cn(activePersona === persona ? 'bg-primary/10' : '', 'cursor-pointer')}
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
                    {activeConversation?.messages.map((message) => (
                        <ChatMessage key={message.id} message={message} onRegenerate={() => regenerateResponse(message.id)} onScriptToggle={() => toggleScript(message.id)} />
                    ))}
                    {isPending && <ThinkingBubble />}
                </div>
                </ScrollArea>
            </main>

            <footer className="p-4 bg-card/80 backdrop-blur-sm sticky bottom-0 z-10">
                <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => performQuickAction('explain')} disabled={isPending}>
                        <BookOpen className="w-4 h-4 mr-2" /> Explain simply
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => performQuickAction('fun')} disabled={isPending}>
                        <Sparkles className="w-4 h-4 mr-2" /> Make it fun
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => performQuickAction('steps')} disabled={isPending}>
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
    </div>
    </SidebarProvider>
  );
}
