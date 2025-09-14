
"use client";

import React, { RefObject } from "react";
import Image from "next/image";
import {
    Send, Paperclip, Mic, Square, ImageIcon, FileText, Camera, ScreenShare, X, Loader2, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type UploadingFile } from "@/components/chat-view";

type ChatInputProps = {
    input: string;
    onInputChange: (value: string) => void;
    onSendMessage: () => void;
    isRecording: boolean;
    onMicClick: () => void;
    isPending: boolean;
    isCallActive: boolean;
    isGuest: boolean;
    onGuestPromptOpenChange: (open: boolean) => void;
    stagedImageUrls: string[];
    stagedDocumentUrls: string[];
    uploadingFiles: UploadingFile[];
    onRemoveStagedImage: (index: number) => void;
    onRemoveStagedDocument: (index: number) => void;
    imageInputRef: RefObject<HTMLInputElement>;
    onFileUploaderOpenChange: (open: boolean) => void;
    onScreenshotOpenChange: (open: boolean) => void;
    onCameraOpenChange: (open: boolean) => void;
    textareaRef: RefObject<HTMLTextAreaElement>;
    onStartCall: () => void;
};

export function ChatInput({
    input,
    onInputChange,
    onSendMessage,
    isRecording,
    onMicClick,
    isPending,
    isCallActive,
    isGuest,
    onGuestPromptOpenChange,
    stagedImageUrls,
    stagedDocumentUrls,
    uploadingFiles,
    onRemoveStagedImage,
    onRemoveStagedDocument,
    imageInputRef,
    onFileUploaderOpenChange,
    onScreenshotOpenChange,
    onCameraOpenChange,
    textareaRef,
    onStartCall,
}: ChatInputProps) {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSendMessage();
    };

    return (
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
                                        onClick={() => onRemoveStagedImage(index)}
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
                                            onClick={() => onRemoveStagedDocument(index)}
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
                        onChange={(e) => onInputChange(e.target.value)}
                        placeholder={isRecording ? "Listening..." : "Ask anything..."}
                        className={cn(
                            "flex-1 rounded-2xl min-h-[56px] max-h-48 bg-card pr-40 pl-12 resize-none text-base",
                            (stagedImageUrls.length > 0 || stagedDocumentUrls.length > 0 || uploadingFiles.length > 0) && "rounded-t-none"
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
                            <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => onGuestPromptOpenChange(true)}>
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
                                    <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                                        <ImageIcon className="mr-2 h-4 w-4" />
                                        Upload Image
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onFileUploaderOpenChange(true)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Upload Document
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onScreenshotOpenChange(true)}>
                                        <ScreenShare className="mr-2 h-4 w-4" />
                                        Take Screenshot
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onCameraOpenChange(true)}>
                                        <Camera className="mr-2 h-4 w-4" />
                                        Take a Picture
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                    <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
                        <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onStartCall}>
                            <Phone className="h-5 w-5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className={cn("rounded-full", isRecording && "bg-destructive/20 text-destructive animate-pulse")} onClick={onMicClick}>
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
    );
}
