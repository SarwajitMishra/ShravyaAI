
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useCall } from '@/components/providers/call-provider';
import { useChatHistory } from "@/hooks/use-chat-history";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app as firebaseApp } from '@/lib/firebase';
import { ChatView, type UploadingFile } from "@/components/chat-view";
import type { Persona } from "@/lib/types";

// Setup Firebase Functions
const functions = getFunctions(firebaseApp);
const uploadImage = httpsCallable(functions, 'uploadImage');
const uploadFile = httpsCallable(functions, 'uploadFile');
const transcribeAudio = httpsCallable(functions, 'transcribeAudio');

// Greetings data
const greetings: { [locale: string]: { morning: string; afternoon: string; evening: string } } = {
  "en-IN": { morning: "Namaste", afternoon: "Namaste", evening: "Namaste" },
  "hi-IN": { morning: "नमस्ते", afternoon: "नमस्ते", evening: "नमस्ते" },
  "default": { morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening" },
};

export function ChatClient() {
  const { user, loading, logout } = useAuth();
  const { isCallActive, activeCallSessionId, startCall, elapsedTime, activePersona: activeCallPersona } = useCall();
  const { toast } = useToast();
  const router = useRouter();

  const isGuest = user?.isAnonymous === true;
  const isLoggedIn = !!user;

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
    regenerateLastMessage,
    callHistory,
  } = useChatHistory();

  // Component State
  const [input, setInput] = useState("");
  const [greeting, setGreeting] = useState("");
  const [userLocale, setUserLocale] = useState("default");
  
  // Dialog States
  const [cameraOpen, setCameraOpen] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [fileUploaderOpen, setFileUploaderOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);

  // Form & Ref States
  const viewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Attachment & Upload States
  const [stagedImageUrls, setStagedImageUrls] = useState<string[]>([]);
  const [stagedDocumentUrls, setStagedDocumentUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  // Conversation & Deletion State
  const [conversationToRename, setConversationToRename] = useState<{id: string, title: string} | null>(null);
  const [newConversationName, setNewConversationName] = useState("");
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  // Mic & Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ---- Effects ----

  useEffect(() => {
    setUserLocale(navigator.language || "default");
    const getGreeting = (locale: string) => {
      const hour = new Date().getHours();
      const localized = greetings[locale] || greetings["default"];
      if (hour < 12) return localized.morning;
      if (hour < 18) return localized.afternoon;
      return localized.evening;
    };
    setGreeting(getGreeting(navigator.language));
  }, []);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [activeConversation?.messages, isPending]);

  useEffect(() => {
    if (isCallActive && activeCallSessionId) {
      setActiveConversationId(activeCallSessionId);
    }
  }, [isCallActive, activeCallSessionId, setActiveConversationId]);
  

  // ---- Handlers ----

  const handleSendMessage = () => {
    const content = input.trim();
    if (!content && stagedImageUrls.length === 0 && stagedDocumentUrls.length === 0) return;
    sendMessage(content, activePersona, stagedImageUrls, stagedDocumentUrls);
    setInput("");
    setStagedImageUrls([]);
    setStagedDocumentUrls([]);
  };

  const handleStartCall = () => {
    if (activeConversation) {
      startCall(activeConversation.id, activeConversation.mode);
      router.push('/voice');
    } else {
        toast({ title: "No active chat", description: "Please start a chat before making a call." });
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            setInput("Transcribing...");
            try {
              const lang = activeConversation?.languageIntent || 'auto';
              const history = activeConversation?.messages.slice(-1).map(m => m.content) || [];
              const result: any = await transcribeAudio({ audioData: base64Audio, langIntent: lang, conversationHistory: history });
              setInput(result.data.transcription);
            } catch (error) {
              toast({ variant: "destructive", title: "Transcription Failed" });
              setInput("");
            }
          };
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
        };
        recorder.start();
        setIsRecording(true);
      } catch (error) {
        toast({ variant: "destructive", title: "Microphone Access Denied" });
      }
    }
  };

  const handleAttachment = async (files: File[], type: 'image' | 'document') => {
    const uploader = type === 'image' ? uploadImage : uploadFile;
    const urlSetter = type === 'image' ? setStagedImageUrls : setStagedDocumentUrls;

    files.forEach(async (file) => {
        const fileId = `${file.name}-${Date.now()}`;
        setUploadingFiles(prev => [...prev, { id: fileId, name: file.name, progress: 0 }]);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            if (base64Data) {
                try {
                    const result: any = await uploader({ [type === 'image' ? 'imageData' : 'fileData']: base64Data, fileName: file.name });
                    urlSetter(prev => [...prev, result.data.fileUrl]);
                } catch (error) {
                    toast({ variant: 'destructive', title: `Upload Failed for ${file.name}` });
                } finally {
                    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
                }
            }
        };
    });
  };

  const handleCapture = (dataUrl: string, type: 'photo' | 'screenshot') => {
    const file = new File([], `${type}.png`); // create a dummy file for the handler
    handleAttachment([file], 'image'); // The handler will re-process it
  }

  const handleRenameClick = (id: string, title: string) => {
    setConversationToRename({ id, title });
    setNewConversationName(title);
    setRenameDialogOpen(true);
  };
  
  const handleRenameSubmit = () => {
    if (conversationToRename && newConversationName.trim()) {
      renameConversation(conversationToRename.id, newConversationName.trim());
    }
    setRenameDialogOpen(false);
  };

  const handleDeleteClick = (id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSubmit = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete);
    }
    setDeleteDialogOpen(false);
  };
  
  const handleNewChat = (persona: Persona) => {
      startNewConversation(persona);
      setNewChatDialogOpen(false);
  };
  
  const handleGuestPromptDismiss = () => {
    // Logic to handle guest dismissal can be added here
    setGuestPromptOpen(false);
  }

  if (loading) {
    return <div className="flex h-screen w-full bg-background items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <ChatView
      user={user}
      isLoggedIn={isLoggedIn}
      isGuest={isGuest}
      onLogout={logout}
      conversations={conversations}
      activeConversation={activeConversation}
      isPending={isPending}
      callHistory={callHistory}
      onSetActiveConversation={setActiveConversationId}
      onRegenerateLastMessage={regenerateLastMessage}
      input={input}
      onInputChange={setInput}
      onSendMessage={handleSendMessage}
      isRecording={isRecording}
      onMicClick={handleMicClick}
      stagedImageUrls={stagedImageUrls}
      stagedDocumentUrls={stagedDocumentUrls}
      uploadingFiles={uploadingFiles}
      onRemoveStagedImage={(index) => setStagedImageUrls(prev => prev.filter((_, i) => i !== index))}
      onRemoveStagedDocument={(index) => setStagedDocumentUrls(prev => prev.filter((_, i) => i !== index))}
      onCapture={handleCapture}
      onFileUpload={(files) => handleAttachment(files, 'document')}
      onImageFileChange={(e) => handleAttachment(Array.from(e.target.files || []), 'image')}
      activePersona={activePersona}
      onPersonaChange={handlePersonaChange}
      isCallActive={isCallActive}
      activeCallPersona={activeCallPersona}
      elapsedTime={elapsedTime}
      onStartCall={handleStartCall}
      onNavigateToVoice={() => router.push('/voice')}
      greeting={greeting}
      viewportRef={viewportRef}
      textareaRef={textareaRef}
      imageInputRef={imageInputRef}
      documentInputRef={documentInputRef}
      onToast={(config) => toast(config)}
      cameraOpen={cameraOpen}
      onCameraOpenChange={setCameraOpen}
      screenshotOpen={screenshotOpen}
      onScreenshotOpenChange={setScreenshotOpen}
      fileUploaderOpen={fileUploaderOpen}
      onFileUploaderOpenChange={setFileUploaderOpen}
      renameDialogOpen={renameDialogOpen}
      onRenameDialogOpenChange={setRenameDialogOpen}
      conversationToRename={conversationToRename}
      onConversationToRenameChange={setConversationToRename}
      newConversationName={newConversationName}
      onNewConversationNameChange={setNewConversationName}
      onRenameSubmit={handleRenameSubmit}
      onRenameClick={handleRenameClick}
      deleteDialogOpen={deleteDialogOpen}
      onDeleteDialogOpenChange={setDeleteDialogOpen}
      onDeleteClick={handleDeleteClick}
      onDeleteSubmit={handleDeleteSubmit}
      newChatDialogOpen={newChatDialogOpen}
      onNewChatDialogOpenChange={setNewChatDialogOpen}
      onNewChatSubmit={handleNewChat}
      guestPromptOpen={guestPromptOpen}
      onGuestPromptOpenChange={setGuestPromptOpen}
      onGuestPromptDismiss={handleGuestPromptDismiss}
      onArchiveConversation={archiveConversation}
    />
  );
}
