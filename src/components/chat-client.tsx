
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
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
import { Send, ChevronDown, MessageSquare, Trash2, Pencil, Paperclip, Mic, MoreHorizontal, Archive, Share2, Square, LogOut, UserPlus, LogIn, Plus } from "lucide-react";
import { DiyaIcon } from "@/components/icons";
import { ChatMessage } from "@/components/chat-message";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { useChatHistory } from "@/hooks/use-chat-history";
import { cn } from "@/lib/utils";
import type { Persona, AiMessage } from "@/lib/types";
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { transcribeAudio } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

const personas: Persona[] = ["Friend", "Teacher", "Spiritual", "Pro", "Storyteller"];

const personaDetails = {
  Friend: {
    description: "I'm here to be a supportive and casual companion. Let's chat about anything!",
    prompts: ["Let's brainstorm some ideas", "Give me some encouragement", "Tell me a fun fact"],
  },
  Teacher: {
    description: "I can help you learn and understand new things. Ask me a question!",
    prompts: ["Explain a complex topic simply", "Help me with my homework", "What's the history of..."],
  },
  Spiritual: {
    description: "I can offer guidance and reflections for a moment of calm. How are you feeling?",
    prompts: ["Give me a mindfulness exercise", "Offer a new perspective on...", "Share a piece of wisdom"],
  },
  Pro: {
    description: "I provide concise, factual, and data-driven answers. I can also search the web.",
    prompts: ["Summarize this article for me", "What are today's headlines?", "Help me code a function that..."],
  },
  Storyteller: {
    description: "I can weave stories and make conversations more fun. What should we create a story about?",
    prompts: ["Tell me a bedtime story", "Make up a story about...", "Turn this concept into a narrative"],
  },
};

const GUEST_MESSAGE_LIMIT = 10;

export function ChatClient() {
  const { user, loading, logout } = useAuth();
  const isLoggedIn = !!user;
  const isGuest = user?.isAnonymous === true;
  const { toast } = useToast();
  const router = useRouter();

  const {
    conversations,
    activeConversation,
    isPending,
    startNewConversation,
    sendMessage,
    setActiveConversationId,
    deleteConversation,
    renameConversation,
    archiveConversation,
    activePersona,
    handlePersonaChange,
  } = useChatHistory();

  const [input, setInput] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [newConversationName, setNewConversationName] = useState("");
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (viewportRef.current) {
        viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [activeConversation?.messages, isPending]);

  // Effect to check for guest user message limit
  useEffect(() => {
    if (isGuest && activeConversation?.messages) {
      const userMessages = activeConversation.messages.filter(m => m.role === 'user').length;
      if (userMessages >= GUEST_MESSAGE_LIMIT) {
        setGuestPromptOpen(true);
      }
    }
  }, [isGuest, activeConversation?.messages]);
  
  const handleSendMessage = (message?: string) => {
    const content = (message || input).trim();
    if (!content) return;
    
    sendMessage(content, activePersona);
    setInput("");
  };
  
  const handlePromptStarterClick = (prompt: string) => {
    setInput(prompt + ' ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

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
  
  const handleDeleteClick = (conversationId: string) => {
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete);
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };
  
  const handleNewChat = (persona: Persona) => {
    startNewConversation(persona);
    setNewChatDialogOpen(false);
  };

  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
          audioChunksRef.current.push(event.data);
        });

        mediaRecorderRef.current.addEventListener("stop", async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            setInput("Transcribing audio...");
            const { transcription } = await transcribeAudio(base64Audio);
            setInput(transcription);
          };
          stream.getTracks().forEach(track => track.stop());
        });

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        toast({
          variant: "destructive",
          title: "Microphone Access Denied",
          description: "Please enable microphone permissions in your browser settings.",
        });
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred while logging out. Please try again.",
      });
    }
  };

  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return "Good Morning";
      if (hour < 18) return "Good Afternoon";
      return "Good Evening";
    };
    setGreeting(getGreeting());
  }, []);
  
  const showWelcomeScreen = !activeConversation || activeConversation.messages.length === 0;

  if (loading) {
    return (
      <div className="flex h-screen w-full bg-background items-center justify-center">
        <ThinkingBubble />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename Conversation</DialogTitle>
                    <DialogDescription>Enter a new name for your conversation below.</DialogDescription>
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
        
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete this conversation. This action cannot be undone.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={newChatDialogOpen} onOpenChange={setNewChatDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Start a New Chat</DialogTitle>
                    <DialogDescription>Please select a persona to start your new chat.</DialogDescription>
                </DialogHeader>
                <div className="py-4 grid grid-cols-2 gap-4">
                    {personas.map(persona => (
                        <Button key={persona} variant="outline" onClick={() => handleNewChat(persona)}>
                            {persona}
                        </Button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>

        <AlertDialog open={guestPromptOpen} onOpenChange={setGuestPromptOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Unlock More Features!</AlertDialogTitle>
                    <AlertDialogDescription>
                        Sign up or log in to save your chat history, upload images and documents, and access more features.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Continue as Guest</AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Link href="/login">Login</Link>
                    </AlertDialogAction>
                    <AlertDialogAction asChild>
                        <Link href="/signup">Sign Up</Link>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
      {isLoggedIn && (
        <Sidebar>
            <SidebarContent className="p-2">
                <div className="flex h-full flex-col">
                    <div className="p-2 flex-grow">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-foreground">History</h2>
                            <Button variant="ghost" size="icon" onClick={() => setNewChatDialogOpen(true)}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <ScrollArea className="h-[calc(100vh-150px)]">
                            <SidebarMenu>
                            {conversations?.map((convo) => (
                                <SidebarMenuItem key={convo.id}>
                                    <SidebarMenuButton 
                                        className="pr-8"
                                        onClick={() => setActiveConversationId(convo.id)}
                                        isActive={activeConversation?.id === convo.id}
                                    >
                                        <MessageSquare className="h-4 w-4" />
                                        <span className="truncate">{convo.title}</span>
                                    </SidebarMenuButton>
                                    <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <SidebarMenuAction className="z-10">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </SidebarMenuAction>
                                    </DropdownMenuTrigger>
                                        <DropdownMenuPortal>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleRenameClick(convo.id, convo.title)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    <span>Rename</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => toast({ title: 'Sharing not implemented yet.'})}>
                                                    <Share2 className="mr-2 h-4 w-4" />
                                                    <span>Share</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => archiveConversation(convo.id, !convo.isArchived)}>
                                                    <Archive className="mr-2 h-4 w-4" />
                                                    <span>{convo.isArchived ? 'Unarchive' : 'Archive'}</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDeleteClick(convo.id)} className="text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    <span>Delete</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenuPortal>
                                    </DropdownMenu>
                                </SidebarMenuItem>
                            ))}
                            </SidebarMenu>
                        </ScrollArea>
                    </div>
                    <div className="p-2 border-t border-border/50">
                        {isGuest ? (
                            <div className="space-y-2">
                                <Button variant="outline" className="w-full justify-start" asChild>
                                    <Link href="/login"><LogIn className="mr-2 h-4 w-4" />Login</Link>
                                </Button>
                                <Button className="w-full justify-start bg-primary-saffron" asChild>
                                    <Link href="/signup"><UserPlus className="mr-2 h-4 w-4" />Sign Up to Save</Link>
                                </Button>
                            </div>
                        ) : (
                            <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Logout</span>
                            </Button>
                        )}
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
                </div>
        </header>

        <main className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full" viewportRef={viewportRef}>
            <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
                {showWelcomeScreen && !isPending ? (
                     <div className="flex flex-col items-center justify-center h-full pt-16">
                        <DiyaIcon className="h-12 w-12 text-primary mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{greeting}</h2>
                        <p className="text-muted-foreground mb-6">{personaDetails[activePersona].description}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                            {personaDetails[activePersona].prompts.map((prompt, i) => (
                                <Button key={i} variant="outline" size="sm" onClick={() => handlePromptStarterClick(prompt)}>
                                    {prompt}
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : (
                    activeConversation?.messages?.map((message: AiMessage) => (
                        <ChatMessage key={message.id} message={message} onRegenerate={() => { /* Not implemented */ }} onScriptToggle={() => { /* Not implemented */ }} />
                    ))
                )}
                {isPending && <ThinkingBubble />}
            </div>
            </ScrollArea>
        </main>

        <footer className="p-2 md:p-4 bg-background sticky bottom-0 z-10">
            <div className="max-w-4xl mx-auto">
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
                        <Button type="button" variant="ghost" size="icon" className="rounded-full">
                            <Paperclip className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
                        <Button type="button" variant="ghost" size="icon" className={cn("rounded-full", isRecording && "bg-destructive/20 text-destructive")} onClick={handleMicClick}>
                            {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        <Button
                            type="submit"
                            size="icon"
                            className="rounded-full w-10 h-10 shrink-0 bg-accent hover:bg-accent/90"
                            disabled={isPending || !input.trim()}
                        >
                            <Send className="h-5 w-5" />
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
