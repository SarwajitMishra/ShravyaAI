
"use client";

import React, { useRef, RefObject } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AiSession, CallLog, UserProfile, Persona } from "@/lib/types";

// UI Components
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Child Components
import { ChatHeader } from "./chat/ChatHeader";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { CameraCapture } from "@/components/camera-capture";
import { ScreenshotCapture } from "@/components/screenshot-capture";
import { FileUploader } from '@/components/file-uploader';

// Type definitions from ChatInput
export type UploadingFile = {
  id: string;
  name: string;
  progress: number;
};

// Main Prop Type
type ChatViewProps = {
  // User Data & Auth
  user: UserProfile | null;
  isLoggedIn: boolean;
  isGuest: boolean;
  onLogout: () => void;

  // Conversations & Messages
  conversations: Omit<AiSession, 'messages'>[];
  activeConversation?: AiSession;
  isPending: boolean;
  callHistory: CallLog[];
  onSetActiveConversation: (id: string) => void;
  onRegenerateLastMessage: () => void;

  // Message Input
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  isRecording: boolean;
  onMicClick: () => void;

  // Attachments
  stagedImageUrls: string[];
  stagedDocumentUrls: string[];
  uploadingFiles: UploadingFile[];
  onRemoveStagedImage: (index: number) => void;
  onRemoveStagedDocument: (index: number) => void;
  onCapture: (dataUrl: string, type: 'photo' | 'screenshot') => void;
  onFileUpload: (files: File[]) => void;
  onImageFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

  // Persona
  activePersona: Persona;
  onPersonaChange: (persona: Persona) => void;

  // Call Management
  isCallActive: boolean;
  activeCallPersona: string | null;
  elapsedTime: number;
  onStartCall: () => void;
  onNavigateToVoice: () => void;

  // UI State & Handlers
  greeting: string;
  viewportRef: RefObject<HTMLDivElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  imageInputRef: RefObject<HTMLInputElement>;
  documentInputRef: RefObject<HTMLInputElement>;
  onToast: (config: { title: string, description?: string, variant?: 'default' | 'destructive' }) => void;

  // Dialogs
  cameraOpen: boolean;
  onCameraOpenChange: (open: boolean) => void;
  screenshotOpen: boolean;
  onScreenshotOpenChange: (open: boolean) => void;
  fileUploaderOpen: boolean;
  onFileUploaderOpenChange: (open: boolean) => void;

  renameDialogOpen: boolean;
  onRenameDialogOpenChange: (open: boolean) => void;
  conversationToRename: { id: string, title: string } | null;
  onConversationToRenameChange: (convo: { id: string, title: string } | null) => void;
  newConversationName: string;
  onNewConversationNameChange: (name: string) => void;
  onRenameSubmit: () => void;
  onRenameClick: (id: string, title: string) => void;

  deleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onDeleteClick: (id: string) => void;
  onDeleteSubmit: () => void;

  newChatDialogOpen: boolean;
  onNewChatDialogOpenChange: (open: boolean) => void;
  onNewChatSubmit: (persona: Persona) => void;

  guestPromptOpen: boolean;
  onGuestPromptOpenChange: (open: boolean) => void;
  onGuestPromptDismiss: () => void;

  // Conversation Actions
  onArchiveConversation: (id: string, isArchived: boolean) => void;
};


export function ChatView(props: ChatViewProps) {

    if (!props.user) {
        return (
          <div className="flex h-screen w-full bg-background items-center justify-center">
            <ThinkingBubble />
          </div>
        );
    }

    const handlePromptStarterClick = (prompt: string) => {
        props.onInputChange(prompt + ' ');
        props.textareaRef.current?.focus();
    };

    return (
        <div className="flex h-screen w-full bg-background">
            {/* Dialogs and other top-level elements */}
            <CameraCapture open={props.cameraOpen} onOpenChange={props.onCameraOpenChange} onCapture={(dataUrl) => props.onCapture(dataUrl, 'photo')} />
            <ScreenshotCapture
                open={props.screenshotOpen}
                onOpenChange={props.onScreenshotOpenChange}
                onCapture={(dataUrl) => props.onCapture(dataUrl, 'screenshot')}
                onUploadRequest={() => props.imageInputRef.current?.click()}
            />
            <FileUploader open={props.fileUploaderOpen} onOpenChange={props.onFileUploaderOpenChange} onUpload={props.onFileUpload} />

            <input type="file" ref={props.imageInputRef} onChange={props.onImageFileChange} accept="image/*" className="hidden" multiple />
            <input type="file" ref={props.documentInputRef} onChange={(e) => props.onFileUpload(Array.from(e.target.files || []))} accept=".pdf,.doc,.docx,.txt" className="hidden" multiple />

            <Dialog open={props.renameDialogOpen} onOpenChange={props.onRenameDialogOpenChange}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Rename Conversation</DialogTitle></DialogHeader>
                    <Input value={props.newConversationName} onChange={(e) => props.onNewConversationNameChange(e.target.value)} placeholder="Enter new name" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => props.onRenameDialogOpenChange(false)}>Cancel</Button>
                        <Button onClick={props.onRenameSubmit}>Rename</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={props.deleteDialogOpen} onOpenChange={props.onDeleteDialogOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogDescription>This will permanently delete this conversation. This action cannot be undone.</AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={props.onDeleteSubmit}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={props.newChatDialogOpen} onOpenChange={props.onNewChatDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Start a New Chat</DialogTitle>
                        <DialogDescription>Please select a persona to start your new chat.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 grid grid-cols-2 gap-4">
                        {["Buddy", "Doctor Dadi", "Peace Pandit", "Bug Baba", "Zindagi Guru"].map((p) => <Button key={p} variant="outline" onClick={() => props.onNewChatSubmit(p as Persona)}>{p}</Button>)}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={props.guestPromptOpen} onOpenChange={props.onGuestPromptOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Unlock More Features!</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogDescription>Sign up or log in to save your chat history, upload images and documents, and access more features.</AlertDialogDescription>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={props.onGuestPromptDismiss}>Continue as Guest</AlertDialogCancel>
                        <AlertDialogAction asChild><Link href="/login">Login</Link></AlertDialogAction>
                        <AlertDialogAction asChild><Link href="/signup">Sign Up</Link></AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Main Layout */}
            {props.isLoggedIn && (
                <ChatSidebar 
                    conversations={props.conversations}
                    activeConversationId={props.activeConversation?.id}
                    onSetActiveConversation={props.onSetActiveConversation}
                    onNewChat={() => props.onNewChatDialogOpenChange(true)}
                    onRenameConversation={props.onRenameClick}
                    onShareConversation={(id) => props.onToast({ title: 'Sharing not implemented yet.' })}
                    onArchiveConversation={props.onArchiveConversation}
                    onDeleteConversation={props.onDeleteClick}
                    isCallActive={props.isCallActive}
                    activeCallPersona={props.activeCallPersona}
                    elapsedTime={props.elapsedTime}
                    callHistory={props.callHistory}
                    onNavigateToVoice={props.onNavigateToVoice}
                    user={props.user}
                    isGuest={props.isGuest}
                    onLogout={props.onLogout}
                />
            )}

            <div className="flex flex-col h-screen w-full">
                <ChatHeader
                    isLoggedIn={props.isLoggedIn}
                    activePersona={props.activePersona}
                    activeConversation={props.activeConversation}
                    onPersonaChange={props.onPersonaChange}
                    onRenameClick={() => props.activeConversation && props.onRenameClick(props.activeConversation.id, props.activeConversation.title)}
                    onShareClick={() => props.onToast({ title: 'Sharing not implemented yet.'})}
                    onArchiveClick={() => props.activeConversation && props.onArchiveConversation(props.activeConversation.id, !props.activeConversation.isArchived)}
                    onDeleteClick={() => props.activeConversation && props.onDeleteClick(props.activeConversation.id)}
                />
                <ChatMessages 
                    isPending={props.isPending}
                    activeConversation={props.activeConversation}
                    activePersona={props.activePersona}
                    greeting={props.greeting}
                    viewportRef={props.viewportRef}
                    onPromptStarterClick={handlePromptStarterClick}
                    onRegenerateLastMessage={props.onRegenerateLastMessage}
                />
                <ChatInput 
                    input={props.input}
                    onInputChange={props.onInputChange}
                    onSendMessage={props.onSendMessage}
                    isRecording={props.isRecording}
                    onMicClick={props.onMicClick}
                    isPending={props.isPending}
                    isCallActive={props.isCallActive}
                    isGuest={props.isGuest}
                    onGuestPromptOpenChange={props.onGuestPromptOpenChange}
                    stagedImageUrls={props.stagedImageUrls}
                    stagedDocumentUrls={props.stagedDocumentUrls}
                    uploadingFiles={props.uploadingFiles}
                    onRemoveStagedImage={props.onRemoveStagedImage}
                    onRemoveStagedDocument={props.onRemoveStagedDocument}
                    imageInputRef={props.imageInputRef}
                    onFileUploaderOpenChange={props.onFileUploaderOpenChange}
                    onScreenshotOpenChange={props.onScreenshotOpenChange}
                    onCameraOpenChange={props.onCameraOpenChange}
                    textareaRef={props.textareaRef}
                    onStartCall={props.onStartCall}
                />
            </div>
        </div>
    );
}
