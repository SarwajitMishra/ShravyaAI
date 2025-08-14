
"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { Send, ChevronDown, MessageSquare, Trash2, Pencil, Paperclip, Mic, MoreHorizontal, Archive, Share2 } from "lucide-react";
import { DiyaIcon } from "@/components/icons";
import { ChatMessage } from "@/components/chat-message";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { useChatHistory } from "@/hooks/use-chat-history";
import { cn } from "@/lib/utils";
import type { Persona } from "@/lib/types";
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LoginPrompt } from "@/components/login-prompt";

const personas: Persona[] = ["Friend", "Teacher", "Spiritual", "Pro", "Storyteller"];

const suggestionChips = [
    { text: "Surprise me" },
    { text: "Summarize text" },
    { text: "Analyze images" },
    { text: "Make a plan" },
];

function ChatLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { toast } = useToast();

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
    renameConversation,
    archiveConversation,
    activePersona,
    setActivePersona,
    dismissLoginPrompt,
  } = useChatHistory(isLoggedIn);

  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [isPersonaChangeDialogOpen, setIsPersonaChangeDialogOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [newConversationName, setNewConversationName] = useState("");

  useEffect(() => {
    if (viewportRef.current) {
        viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [activeConversation?.messages, isPending]);

  const handlePersonaChange = (persona: Persona) => {
    if (persona !== activePersona) {
      if(isLoggedIn && activeConversation && activeConversation.messages.length > 1){
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
  
  const handleSendMessage = (message?: string) => {
    const content = (message || input).trim();
    if (!content) return;
    
    if(!isLoggedIn) {
        // This is a guest user. We don't automatically log them in here.
        // The useChatHistory hook will handle temporary state.
    }

    sendMessage(content, activePersona);
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };
  
  const handleLogin = () => {
    setIsLoggedIn(true);
    toast({
        title: "Logged In",
        description: "Your chat history is now being saved.",
    });
  }

  const handleRenameClick = (conversationId: string, currentTitle: string) => {
    setConversationToRename(conversationId);
    setNewConversationName(currentTitle);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (conversationToRename && newConversationName.trim()) {
      renameConversation(conversationToRename, newConversationName.trim());
      setRenameDialogOpen(false);
      setConversationToRename(null);
      setNewConversationName("");
    }
  };

  const showWelcomeScreen = !activeConversation || activeConversation.messages.length === 0 || (activeConversation.messages.length === 1 && activeConversation.messages[0].role === 'assistant');

  return (
    <div className="flex h-screen w-full bg-background">
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

        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename Conversation</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        value={newConversationName}
                        onChange={(e) => setNewConversationName(e.target.value)}
                        placeholder="Enter new name"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRenameSubmit}>Rename</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {isLoggedIn && (
          <Sidebar>
              <SidebarContent className="p-2">
                  <div className="flex h-full flex-col">
                      <div className="p-2 flex-grow">
                          <h2 className="text-lg font-semibold mb-4 text-foreground">History</h2>
                          <ScrollArea className="h-[calc(100vh-150px)]">
                              <SidebarMenu>
                                {conversations.map((convo) => (
                                    <SidebarMenuItem key={convo.id}>
                                        <SidebarMenuButton 
                                            onClick={() => setActiveConversationId(convo.id)}
                                            isActive={activeConversation?.id === convo.id}
                                            className="w-full justify-start pr-10"
                                        >
                                            <MessageSquare className="h-4 w-4" />
                                            <span className="truncate">{convo.title}</span>
                                        </SidebarMenuButton>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleRenameClick(convo.id, convo.title)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    <span>Rename</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => toast({ title: 'Sharing not implemented yet.'})}>
                                                    <Share2 className="mr-2 h-4 w-4" />
                                                    <span>Share</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => archiveConversation(convo.id)}>
                                                    <Archive className="mr-2 h-4 w-4" />
                                                    <span>Archive</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => deleteConversation(convo.id)} className="text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    <span>Delete</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
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
            <header className="p-4 border-b border-border/50 sticky top-0 z-10 bg-background/50 backdrop-blur-sm">
                <div className="flex justify-between items-center max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        {isLoggedIn && <SidebarTrigger className="md:hidden"/>}
                        <h1 className="text-xl font-bold font-headline text-foreground">Shravya AI</h1>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline">
                                    <span>{activePersona}</span>
                                    <ChevronDown className="h-4 w-4 ml-2" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56">
                                {personas.map((persona) => (
                                <DropdownMenuItem
                                    key={persona}
                                    onSelect={() => handlePersonaChange(persona)}
                                    className={cn(activePersona === persona ? 'bg-muted' : '', 'cursor-pointer')}
                                >
                                    {persona}
                                </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    
                    {!isLoggedIn && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={handleLogin}>Log in</Button>
                            <Button onClick={handleLogin}>Sign up for free</Button>
                        </div>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto">
                <ScrollArea className="h-full" viewportRef={viewportRef}>
                <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto" ref={scrollAreaRef}>
                    {showWelcomeScreen && !isPending ? (
                         <div className="flex flex-col items-center justify-center h-full pt-16">
                            <DiyaIcon className="h-12 w-12 text-primary mb-4" />
                            <h2 className="text-2xl font-bold mb-8">How can I help you today?</h2>
                        </div>
                    ) : (
                        activeConversation?.messages.map((message) => 
                           message.role === 'system' ? (
                            <LoginPrompt key={message.id} onLogin={handleLogin} onDismiss={() => dismissLoginPrompt(message.id)} />
                           ) : (
                            <ChatMessage key={message.id} message={message} onRegenerate={() => regenerateResponse(message.id)} onScriptToggle={() => toggleScript(message.id)} />
                           )
                        )
                    )}
                    {isPending && <ThinkingBubble />}
                </div>
                </ScrollArea>
            </main>

            <footer className="p-4 bg-background sticky bottom-0 z-10">
                <div className="max-w-4xl mx-auto">
                    {showWelcomeScreen && !isPending && (
                        <div className="flex justify-center items-center gap-2 mb-2">
                            {suggestionChips.map((chip, i) => (
                                <Button key={i} variant="outline" size="sm" onClick={() => handleSendMessage(chip.text)}>
                                    {chip.text}
                                </Button>
                            ))}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="relative">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask anything..."
                            className="flex-1 rounded-2xl min-h-[56px] max-h-48 bg-card pr-32 pl-12 resize-none text-base"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                                }
                            }}
                            disabled={isPending}
                        />
                        <div className="absolute top-1/2 -translate-y-1/2 left-3 flex items-center">
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <Paperclip className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <Mic className="w-5 h-5" />
                            </Button>
                            <Button
                                type="submit"
                                size="icon"
                                className="rounded-full w-10 h-10 shrink-0 bg-accent hover:bg-accent/90"
                                disabled={isPending || !input.trim()}
                            >
                                <Send className="w-5 h-5" />
                            </Button>
                        </div>
                    </form>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                        By messaging Shravya AI, you agree to our Terms and have read our Privacy Policy.
                    </p>
                </div>
            </footer>
        </div>
    </div>
  );
}

export function ChatPage() {
    return (
        <SidebarProvider>
            <ChatLayout />
        </SidebarProvider>
    )
}
