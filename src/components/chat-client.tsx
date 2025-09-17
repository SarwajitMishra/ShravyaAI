"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/camera-capture";
import { ScreenshotCapture } from "@/components/screenshot-capture";
import { FileUploader } from '@/components/file-uploader';
import { useCall } from '@/components/providers/call-provider'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuSeparator,
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
import { Send, ChevronDown, Trash2, Pencil, Paperclip, Mic, MoreHorizontal, Archive, Share2, Square, LogOut, UserPlus, LogIn, Plus, User as UserIcon, Settings, LifeBuoy, Image as ImageIcon, FileText, Camera, ScreenShare, X, Loader2, Phone } from "lucide-react";
import { BrandIcon } from "@/components/brand-icon";
import { ChatMessage } from "@/components/chat-message";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { cn } from "@/lib/utils";
import { useChatHistoryState, useChatHistoryActions } from "@/hooks/use-chat-history";
import type { AiMessage, AiSession, CallLog, LangIntent } from "@/lib/types";
import { type Persona } from "@/lib/types";
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarGroup, SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app as firebaseApp } from '@/lib/firebase';

const functions = getFunctions(firebaseApp);
const uploadImage = httpsCallable(functions, 'uploadImage');

const personas: Persona[] = ["Buddy", "Doctor Dadi", "Peace Pandit", "Bug Baba", "Zindagi Guru"];
const ENABLE_VOICE_MODE = true; // Feature Flag


const uploadFile = httpsCallable(functions, 'uploadFile');
const transcribeAudio = httpsCallable(functions, 'transcribeAudio'); // Add this line


const personaDetails = {
  'Buddy': {
    description: "I'm your ultimate childhood best friend. Ready for some fun, gentle roasting, and nostalgia?",
    prompts: ["Roast me like we’re still in school.", "Give me the ultimate excuse for being late.", "Yaar, life mein tension bahut hai"],
  },
  'Doctor Dadi': {
    description: "I'm Doctor Dadi, here with a mix of modern health advice and timeless desi remedies. Batao beta, kya pareshani hai?",
    prompts: ["I have a headache, what should I do?", "Give me tips for better sleep", "How to stay healthy in winter?"],
  },
  'Peace Pandit': {
    description: "I am Peace Pandit, here to help you find calm in the chaos. Let's take a deep breath and begin.",
    prompts: ["I'm feeling stressed about work", "Give me a simple meditation exercise", "Give me a mantra for positive thinking."],
  },
  'Bug Baba': {
    description: "I am Bug Baba, the quirky guru of code. Tell me about the bug that's troubling you, and we shall find enlightenment... or a missing semicolon.",
    prompts: ["Why is my code not working?", "Debug this error like a baba: <paste error>", "Explain Git in the style of Bollywood drama."],
  },
  'Zindagi Guru': {
    description: "I am Zindagi Guru, here to inspire you with a mix of motivation and philosophy. What challenge are you facing today?",
    prompts: ["Motivate me like a cricket coach before finals.", "Tell me a story of someone who never gave up.", "How to build self-discipline?"],
  },
};



const guestMessageThresholds = [10, 100, 1000];

type UploadingFile = {
  id: string;
  name: string;
  progress: number; 
};

// Culturally aware greetings
const greetings: { [locale: string]: { morning: string; afternoon: string; evening: string } } = {
  "en-IN": { morning: "Namaste", afternoon: "Namaste", evening: "Namaste" },
  "hi-IN": { morning: "नमस्ते", afternoon: "नमस्ते", evening: "नमस्ते" },
  "bn-IN": { morning: "নমস্কার", afternoon: "নমস্কার", evening: "নমস্কার" },
  "te-IN": { morning: "నమస్కారం", afternoon: "నమస్కారం", evening: "నమస్కారం" },
  "mr-IN": { morning: "नमस्कार", afternoon: "नमस्कार", evening: "नमस्कार" },
  "ta-IN": { morning: "வணக்கம்", afternoon: "வணக்கம்", evening: "வணக்கம்" },
  "gu-IN": { morning: "નમસ્તે", afternoon: "નમસ્તે", evening: "નમસ્તે" },
  "kn-IN": { morning: "ನಮಸ್ಕಾರ", afternoon: "ನಮಸ್ಕಾರ", evening: "ನಮస్ಕಾರ" },
  "ml-IN": { morning: "നമസ്കാരം", afternoon: "നమస్കാരം", evening: "നమస్കാരം" },
  "pa-IN": { morning: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", afternoon: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", evening: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ" },
  "en-US": { morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening" },
  "en-GB": { morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening" },
};

function formatCallDuration(seconds: number) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function formatCallTimestamp(timestamp: number) {
    const now = new Date();
    const callDate = new Date(timestamp);
    const diffDays = (now.getTime() - callDate.getTime()) / (1000 * 3600 * 24);

    if (diffDays < 1 && now.getDate() === callDate.getDate()) {
        return format(callDate, 'p'); // e.g., 4:30 PM
    } else if (diffDays < 7) {
        return format(callDate, 'eee p'); // e.g., Wed 4:30 PM
    } else {
        return format(callDate, 'MMM d, yyyy'); // e.g., Aug 23, 2024
    }
}

function formatElapsedTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${paddedMinutes}:${paddedSeconds}`;
}


export function ChatClient() {
  console.log("===== CHKPT 1: ChatClient Component Rendered =====");
  const { user, loading, logout } = useAuth();
  const { isCallActive, activeCallSessionId, startCall, activePersona: activeCallPersona, elapsedTime } = useCall();
  console.log("===== CHKPT 2: useCall hook. Is startCall a function?", typeof startCall);
  const isLoggedIn = !!user;
  const isGuest = user?.isAnonymous === true;
  const { toast } = useToast();
  const router = useRouter();
  
  const [cameraOpen, setCameraOpen] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  // Add these state variables
  const [stagedDocumentUrls, setStagedDocumentUrls] = useState<string[]>([]);
  const [fileUploaderOpen, setFileUploaderOpen] = useState(false);
  // Add this line below the uploadImage function definition
  const uploadFile = httpsCallable(functions, 'uploadFile');

  const {
    conversations,
    activeConversation,
    isPending,
    activePersona,
    callHistory,
  } = useChatHistoryState();
  
  const {
    startNewConversation,
    sendMessage,
    setActiveConversationId,
    deleteConversation,
    renameConversation,
    archiveConversation,
    handlePersonaChange,
    regenerateLastMessage,
  } = useChatHistoryActions();
  

  const [input, setInput] = useState("");
  const [stagedImageUrls, setStagedImageUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [newConversationName, setNewConversationName] = useState("");
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [guestPromptDismissals, setGuestPromptDismissals] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };


  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, isPending]);
  
  // Load guest prompt dismissals from localStorage on mount
  useEffect(() => {
    const dismissals = parseInt(localStorage.getItem('guestPromptDismissals') || '0', 10);
    setGuestPromptDismissals(dismissals);
  }, []);

  // Effect to check for guest user message limit
  useEffect(() => {
    if (isGuest && activeConversation?.messages) {
      const userMessages = activeConversation.messages.filter((m: AiMessage) => m.role === 'user').length;
      const dismissals = parseInt(localStorage.getItem('guestPromptDismissals') || '0', 10);

      if (dismissals < guestMessageThresholds.length) {
        const currentThreshold = guestMessageThresholds[dismissals];
        if (userMessages >= currentThreshold) {
          setGuestPromptOpen(true);
        }
      }
    }
  }, [isGuest, activeConversation?.messages]);

  useEffect(() => {
    // If a call is active and we have the session ID, switch to it.
    if (isCallActive && activeCallSessionId) {
      setActiveConversationId(activeCallSessionId);
    }
  }, [isCallActive, activeCallSessionId, setActiveConversationId]);


  const handleGuestPromptDismiss = () => {
    const newDismissals = guestPromptDismissals + 1;
    setGuestPromptDismissals(newDismissals);
    localStorage.setItem('guestPromptDismissals', newDismissals.toString());
    setGuestPromptOpen(false);
  };

  // Add this new handler function inside the ChatClient component

const handleFileUpload = async (files: File[]) => {
  files.forEach(async (file) => {
    const fileId = `${file.name}-${Date.now()}`;
    const newUploadingFile: UploadingFile = { id: fileId, name: file.name, progress: 0 };
    setUploadingFiles((prev) => [...prev, newUploadingFile]);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64FileData = reader.result?.toString().split(',')[1];
      if (base64FileData) {
        try {
          const result: any = await uploadFile({ fileData: base64FileData, fileName: file.name });
          const fileUrl = result.data.fileUrl;
          setStagedDocumentUrls(prev => [...prev, fileUrl]);
        } catch (error) {
          toast({ variant: 'destructive', title: `Upload Failed for ${file.name}`, description: 'Could not upload your file.' });
        } finally {
          setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
          }
        }
     };
    });
  };

  
  const handleSendMessage = () => {
    const content = input.trim();
    if (!content && stagedImageUrls.length === 0 && stagedDocumentUrls.length === 0) return;

    sendMessage(content, activePersona, stagedImageUrls, stagedDocumentUrls);

    setInput("");
    setStagedImageUrls([]);
    setStagedDocumentUrls([]); // Add this line
  };

  const handleStartCall = () => {
    if (activeConversation) {
      // Open the voice page in a new, dedicated tab
      const voiceUrl = `/voice?sessionId=${activeConversation.id}&persona=${activeConversation.mode}`;
      window.open(voiceUrl, '_blank');
    } else {
      toast({
        variant: "destructive",
        title: "No Active Chat",
        description: "Please send at least one message in a chat before starting a call.",
      });
    }
  };  

  // Non-destructive wrapper that logs errors and captures async/sync failures from handleStartCall
  const phoneClickWrapper = async () => {
    console.log('[UI] phoneClickWrapper fired (before handleStartCall)');
    try {
      console.log('[UI] activeConversation at click:', activeConversation?.id);
      await Promise.resolve(handleStartCall());
      console.log('[UI] handleStartCall completed');
    } catch (err) {
      console.error('[UI] handleStartCall threw:', err);
    }
  };



  const handleRemoveStagedImage = (index: number) => {
    setStagedImageUrls(prev => prev.filter((_, i) => i !== index));
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          } 
        });
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
            setInput("Transcribing, please wait..."); // Let the user know we're working
        
            try {
                const langIntent = activeConversation?.languageIntent || 'auto';
                const conversationHistory = activeConversation?.messages
                  .slice(-1)
                  .map(msg => msg.content) || [];
                
                const result: any = await transcribeAudio({
                  audioData: base64Audio,
                  langIntent: langIntent,
                  conversationHistory: conversationHistory, 
              });
              setInput(result.data.transcription);
            } catch (error) {
                console.error("Error transcribing audio:", error);
                toast({
                    variant: "destructive",
                    title: "Transcription Failed",
                    description: "Could not process the audio. Please try again.",
                });
                setInput(""); // Clear the input on error
            }
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
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred while logging out. Please try again.",
      });
    }
  };

const handleCapture = async (dataUrl: string, type: 'photo' | 'screenshot') => {
  const fileName = `${type}-${Date.now()}.png`;
  const fileId = `${fileName}-${Date.now()}`;
  const newUploadingFile: UploadingFile = { id: fileId, name: fileName, progress: 0 };
  setUploadingFiles(prev => [...prev, newUploadingFile]);

  try {
      const base64ImageData = dataUrl.split(',')[1];
      if (base64ImageData) {
          const result: any = await uploadImage({ imageData: base64ImageData, fileName });
          const imageUrl = result.data.fileUrl;
          setStagedImageUrls(prev => [...prev, imageUrl]);
      }
  } catch (error) {
      toast({ variant: 'destructive', title: `Upload Failed`, description: `Could not upload the ${type}.` });
  } finally {
      setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  }
};


  const [greeting, setGreeting] = useState("");
  const [userLocale, setUserLocale] = useState("en-US");

  useEffect(() => {
    setUserLocale(navigator.language || "en-US");
  }, []);

  useEffect(() => {
    const getGreeting = (locale: string) => {
      const hour = new Date().getHours();
      const defaultGreeting = greetings["en-US"];
      const localizedGreeting = greetings[locale] || defaultGreeting;

      if (hour < 12) return localizedGreeting.morning;
      if (hour < 18) return localizedGreeting.afternoon;
      return localizedGreeting.evening;
    };
    setGreeting(getGreeting(userLocale));
  }, [userLocale]);
  
  const showWelcomeScreen = !activeConversation || activeConversation.messages.length === 0;

  const chatHistory = conversations?.filter(c => !c.isArchived);

  const groupedChats = chatHistory?.reduce((acc: Record<Persona, (Omit<AiSession, 'messages'>)[]>, convo: Omit<AiSession, 'messages'>) => {
    const persona = convo.mode || 'Buddy';
    if (!acc[persona]) {
      acc[persona] = [];
    }
    acc[persona].push(convo);
    return acc;
}, {} as Record<Persona, (Omit<AiSession, 'messages'>)[]>);

const renderMessagesWithDateSeparators = () => {
  if (!activeConversation?.messages) return null;

  const messageElements: React.ReactNode[] = [];
  let lastDate: string | null = null;

  activeConversation.messages.forEach((message: AiMessage) => {
    const messageDate = new Date(message.createdAt);
    let dateString: string;

    if (isToday(messageDate)) {
      dateString = "Today";
    } else if (isYesterday(messageDate)) {
      dateString = "Yesterday";
    } else {
      dateString = format(messageDate, "MMMM d, yyyy");
    }

    if (dateString !== lastDate) {
      messageElements.push(
        <div key={`date-${dateString}-${message.id}`} className="text-center text-xs text-muted-foreground my-4">
          {dateString}
        </div>
      );
      lastDate = dateString;
    }

    messageElements.push(
      <ChatMessage 
        key={message.id} 
        message={message} 
        onRegenerate={() => regenerateLastMessage()} 
        onScriptToggle={() => { /* Not implemented */ }}
        isVoiceSession={activeConversation?.type === 'voice'}
      />
    );
  });

  return messageElements;
};

  if (loading) {
    return (
      <div className="flex h-screen w-full bg-background items-center justify-center">
        <ThinkingBubble />
      </div>
    );
  }

  const handleImageUpload = () => imageInputRef.current?.click();
  const handleDocumentUpload = () => documentInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
  
    const filesToUpload = Array.from(files);
  
    filesToUpload.forEach(file => {
      const fileId = `${file.name}-${Date.now()}`;
      const newUploadingFile: UploadingFile = { id: fileId, name: file.name, progress: 0 };
      setUploadingFiles(prev => [...prev, newUploadingFile]);
  
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64ImageData = reader.result?.toString().split(',')[1];
        if (base64ImageData) {
          try {
            const result: any = await uploadImage({ imageData: base64ImageData, fileName: file.name });
            const imageUrl = result.data.fileUrl;
            setStagedImageUrls(prev => [...prev, imageUrl]);
          } catch (error) {
            toast({ variant: 'destructive', title: `Upload Failed for ${file.name}`, description: 'Could not upload your image.' });
          } finally {
            setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
          }
        }
      };
      reader.onerror = () => {
        toast({ variant: 'destructive', title: `Error reading ${file.name}` });
        setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      };
    });
  
    event.target.value = '';
  };
  
  const handleComingSoon = () => {
    toast({ title: 'Coming Soon!', description: 'This feature is under development.' });
  }

  return (
    <div className="flex h-screen w-full bg-background">
        <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={(dataUrl) => handleCapture(dataUrl, 'photo')} />
        <ScreenshotCapture 
            open={screenshotOpen} 
            onOpenChange={setScreenshotOpen} 
            onCapture={(dataUrl) => handleCapture(dataUrl, 'screenshot')}
            onUploadRequest={handleImageUpload} // Add this line
        />
        <FileUploader open={fileUploaderOpen} onOpenChange={setFileUploaderOpen} onUpload={handleFileUpload} />

      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        multiple
      />
      <input
        type="file"
        ref={documentInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        multiple
      />

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
                    <AlertDialogCancel onClick={handleGuestPromptDismiss}>Continue as Guest</AlertDialogCancel>
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
                            <h2 className="text-lg font-semibold text-foreground">Chats</h2>
                            <Button variant="ghost" size="icon" onClick={() => setNewChatDialogOpen(true)}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <ScrollArea className="h-[calc(100vh-200px)]">
                            <SidebarMenu>
                            {groupedChats && Object.entries(groupedChats).map(([persona, convos]) => (
                                <SidebarGroup key={persona}>
                                    <SidebarGroupLabel>{persona}</SidebarGroupLabel>
                                    <SidebarGroupContent>
                                        <SidebarMenu>
                                        {(convos as Omit<AiSession, 'messages'>[]).map((convo) => (
                                            <SidebarMenuItem key={convo.id}>
                                                <SidebarMenuButton 
                                                    onClick={() => setActiveConversationId(convo.id)}
                                                    isActive={activeConversation?.id === convo.id}
                                                    className="justify-between"
                                                >
                                                    <span className="truncate min-w-0 flex-1 text-left">
                                                      {convo.title.replace(`[${persona}] `, '')}
                                                    </span>
                                                </SidebarMenuButton>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <SidebarMenuAction showOnHover>
                                                        <MoreHorizontal />
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
                                    </SidebarGroupContent>
                                </SidebarGroup>
                            ))}
                            {(isCallActive || (callHistory && callHistory.length > 0)) && (
                                <SidebarGroup>
                                    <SidebarGroupLabel>Live Calls</SidebarGroupLabel>
                                    <SidebarGroupContent>
                                        <SidebarMenu>
                                            {isCallActive && (
                                                <SidebarMenuItem>
                                                    <Link href="/voice" className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 w-full">
                                                        <Phone className="h-4 w-4 text-green-500 animate-pulse" />
                                                        <div className="flex flex-col flex-1 truncate">
                                                            <span className="text-sm font-medium truncate">{activeCallPersona}</span>
                                                            <span className="text-xs text-muted-foreground">{formatElapsedTime(elapsedTime)}</span>
                                                        </div>
                                                    </Link>
                                                </SidebarMenuItem>
                                            )}
                                            {callHistory.map((call: CallLog) => (
                                                <SidebarMenuItem key={call.id}>
                                                    <div className="flex flex-col w-full p-2 rounded-md hover:bg-accent/50">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium">{call.persona}</span>
                                                            <span className="text-xs text-muted-foreground">{formatCallDuration(call.duration)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center mt-1">
                                                            <span className="text-xs text-muted-foreground">
                                                                {call.startTime && formatCallTimestamp(call.startTime)}
                                                            </span>
                                                            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => startCall(call.sessionId, call.persona)}>
                                                                Call Back
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </SidebarMenuItem>
                                            ))}
                                        </SidebarMenu>
                                    </SidebarGroupContent>
                                </SidebarGroup>
                            )}
                            </SidebarMenu>
                        </ScrollArea>
                    </div>
                    <div className="p-2 border-t border-border/50">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="w-full justify-start items-center gap-2 px-2">
                            <UserIcon className="h-5 w-5" />
                            <span className="truncate">
                              {isGuest ? "Guest User" : user.email || user.phoneNumber || "User"}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {isGuest ? (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href="/login"><LogIn className="mr-2 h-4 w-4" />Login</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href="/signup"><UserPlus className="mr-2 h-4 w-4" />Sign Up</Link>
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href="/profile">
                                  <UserIcon className="mr-2 h-4 w-4" />
                                  <span>Profile</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href="/settings">
                                  <Settings className="mr-2 h-4 w-4" />
                                  <span>Settings</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href="/help">
                                  <LifeBuoy className="mr-2 h-4 w-4" />
                                  <span>Help Center</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Logout</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                        <BrandIcon className="h-8 w-8 text-primary" />
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
                    {activeConversation && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRenameClick(activeConversation.id, activeConversation.title)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    <span>Rename</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast({ title: 'Sharing not implemented yet.'})}>
                                    <Share2 className="mr-2 h-4 w-4" />
                                    <span>Share</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => archiveConversation(activeConversation.id, !activeConversation.isArchived)}>
                                    <Archive className="mr-2 h-4 w-4" />
                                    <span>{activeConversation.isArchived ? 'Unarchive' : 'Archive'}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteClick(activeConversation.id)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
        </header>

        <main className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full" viewportRef={viewportRef}>
            <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
                {showWelcomeScreen && !isPending ? (
                     <div className="flex flex-col items-center justify-center h-full pt-16">
                        <BrandIcon className="h-12 w-12 text-primary mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{greeting}</h2>
                        <p className="text-muted-foreground mb-6">{personaDetails[activePersona].description}</p>

<div className="flex flex-wrap justify-center gap-3 w-full max-w-md">
    {personaDetails[activePersona].prompts.map((prompt, i) => (
        <Button key={i} variant="outline" size="sm" onClick={() => handlePromptStarterClick(prompt)}>
            {prompt}
        </Button>
    ))}
</div>

                    </div>
                ) : (
                    renderMessagesWithDateSeparators()
                )}
                {isPending && <ThinkingBubble />}
            </div>
            </ScrollArea>
        </main>

        <footer className="p-2 md:p-4 bg-background sticky bottom-0 z-10">
            <div className="max-w-4xl mx-auto">
                <form onSubmit={handleSubmit} className="relative">
                    {(stagedImageUrls.length > 0 || stagedDocumentUrls.length > 0 || uploadingFiles.length > 0) && (
                      <div className="p-2 bg-card border border-b-0 rounded-t-2xl flex gap-2 flex-wrap">
                        {uploadingFiles.map(file => (
                          <div key={file.id} className="w-20 h-20 rounded-md bg-muted flex items-center justify-center">
                            <Loader2 className="animate-spin h-6 w-6" />
                          </div>
                        ))}
                        {stagedImageUrls.map((url, index) => (
                          <div key={url} className="relative w-20 h-20 rounded-md">
                            <Image src={url} alt="Staged image" fill sizes="100vw" className="object-cover rounded-md" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
                              onClick={() => handleRemoveStagedImage(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {stagedDocumentUrls.map((url, index) => {
      const fileName = decodeURIComponent(url).split('/').pop()?.split('?')[0].split('%2F').pop() || 'Document';
      return (
        <div key={url} className="relative w-20 h-20 rounded-md bg-muted p-2 flex flex-col items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-xs text-center truncate w-full mt-1">{fileName}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
            onClick={() => setStagedDocumentUrls(prev => prev.filter((_, i) => i !== index))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    })}
                      </div>
                    )}
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={scrollToBottom}
                        placeholder={isRecording ? "Listening..." : "Ask anything..."}
                        className={cn(
                          "flex-1 rounded-2xl min-h-[56px] max-h-48 bg-card pr-40 pl-12 resize-none text-base",
                          (stagedImageUrls.length > 0 || uploadingFiles.length > 0) && "rounded-t-none"
                        )}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                            }
                        }}
                        disabled={isPending || isCallActive}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 left-3 flex items-center">
                        {isGuest ? (
                            <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => setGuestPromptOpen(true)}>
                                <Paperclip className="h-5 w-5" />
                            </Button>
                        ) : (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="rounded-full">
                                        <Paperclip className="h-5 w-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={handleImageUpload}>
                                        <ImageIcon className="mr-2 h-4 w-4" />
                                        Upload Image
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setFileUploaderOpen(true)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Upload Document
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setScreenshotOpen(true)}>
                                      <ScreenShare className="mr-2 h-4 w-4" />
                                        Take Screenshot
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setCameraOpen(true)}>
                                      <Camera className="mr-2 h-4 w-4" />
                                        Take a Picture
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                    <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
                        {ENABLE_VOICE_MODE && (
                           <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={phoneClickWrapper} disabled={isCallActive}>
                                <Phone className="h-5 w-5" />
                            </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className={cn("rounded-full", isRecording && "bg-destructive/20 text-destructive animate-pulse")} onClick={handleMicClick} disabled={isCallActive}>
                            {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        <Button
                            type="submit"
                            size="icon"
                            className="rounded-full w-10 h-10 shrink-0 bg-accent hover:bg-accent/hover"
                            disabled={isPending || (!input.trim() && stagedImageUrls.length === 0 && stagedDocumentUrls.length === 0)}
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
