
"use client";

import type { AiMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, User, AlertTriangle, Check, FileText, Phone, ThumbsUp, ThumbsDown, Volume2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DiyaIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatHistory } from "@/hooks/use-chat-history";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/lib/firebase';


const functions = getFunctions(firebaseApp);
const textToSpeech = httpsCallable(functions, 'textToSpeech');

interface ChatMessageProps {
  message: AiMessage;
  onRegenerate: () => void;
  isVoiceSession?: boolean;
}

const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
    const [copied, setCopied] = useState(false);
    const language = className?.replace("language-", "") || "code";

    const handleCopyCode = () => {
        if (typeof children === 'string') {
            navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="relative my-2 bg-background/50 rounded-md">
            <div className="flex items-center justify-between px-4 py-1.5 border-b">
                <span className="text-xs font-sans text-muted-foreground">{language}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyCode}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
                <code>{children}</code>
            </pre>
        </div>
    );
};


export function ChatMessage({ message, onRegenerate, isVoiceSession }: ChatMessageProps) {
  const { toast } = useToast();
  const { activeConversation, submitMessageFeedback } = useChatHistory();
  const [isReadingAloud, setIsReadingAloud] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast({
      title: "Copied to clipboard!",
      description: "The message has been copied.",
    });
  };

  const handleFeedback = (feedback: 'liked' | 'disliked') => {
    if (!activeConversation) return;
    submitMessageFeedback(activeConversation.id, message.id, feedback);
  }

  const handleReadAloud = async () => {
    setIsReadingAloud(true);
    try {
      const result: any = await textToSpeech({ text: message.content, persona: message.mode });
      if (result.data && result.data.audioContent) {
        const audio = new Audio(`data:audio/mp3;base64,${result.data.audioContent}`);
        audio.play();
        audio.onended = () => setIsReadingAloud(false);
      } else {
        throw new Error("Audio content not found in response.");
      }
    } catch (error) {
      console.error("Error reading aloud:", error);
      toast({
        variant: "destructive",
        title: "Read Aloud Failed",
        description: "Could not play the audio. Please try again.",
      });
      setIsReadingAloud(false);
    }
  };


  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
      return (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground my-2">
            <Phone className="h-3 w-3" />
            <span>{message.content}</span>
        </div>
      )
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <Avatar className="w-8 h-8 border-2 border-primary">
           <div className="flex items-center justify-center w-full h-full bg-primary/20">
            <DiyaIcon className="w-5 h-5 text-primary" />
           </div>
        </Avatar>
      )}

      <div
        className={cn(
          "group relative p-4 rounded-2xl max-w-sm md:max-w-md prose prose-sm dark:prose-invert",
          isUser
            ? "bg-secondary text-secondary-foreground rounded-br-none"
            : "bg-transparent text-foreground rounded-tl-none",
          message.isError && "bg-destructive/20 border border-destructive",
          message.isPending && "opacity-50",
          isVoiceSession && "italic"
        )}
      >
        {message.isError && (
          <div className="flex items-center gap-2 mb-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <p className="font-bold">Error</p>
          </div>
        )}

        {message.imageUrls && message.imageUrls.length > 0 && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            {message.imageUrls.map((url, index) => (
              <Dialog key={index}>
                <DialogTrigger asChild>
                <div className="relative w-40 md:w-56 aspect-[4/3] rounded-md overflow-hidden cursor-pointer bg-muted">
                  <Image
                    src={url}
                    alt={`Uploaded image ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 160px, 224px"
                    className="object-cover"
                  />
                </div>
       
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <Image src={url} alt={`Uploaded image ${index + 1}`} width={800} height={600} className="object-contain" />
                </DialogContent>
              </Dialog>
            ))}
          </div>
        )}
        {message.documentUrls && message.documentUrls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.documentUrls.map((url, index) => {
              const decodedUrl = decodeURIComponent(url);
              const fileName = decodedUrl.split('/').pop()?.split('?')[0].split('%2F').pop() || 'Document';
              return (
                <a 
                  key={index} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center gap-2 p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors no-underline"
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="truncate text-sm font-medium text-foreground">{fileName}</span>
                </a>
              );
            })}
          </div>
        )}

        {isUser ? (
          <p className="m-0 whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ReactMarkdown
            className="whitespace-pre-wrap"
            components={{
                p: ({node, ...props}) => <p className="m-0" {...props} />,
                pre: ({ node, ...props }) => {
                  const codeChunk = node?.children[0] as any;
                  return (
                    <CodeBlock {...props} className={codeChunk?.properties?.className?.[0]}>
                      {codeChunk?.children?.[0]?.value}
                    </CodeBlock>
                  );
                },
            }}
          >
            {message.displayContent || message.content}
          </ReactMarkdown>
        )}
        
        {!isUser && !message.isError && (
          <TooltipProvider>
            <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Copy</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRegenerate()}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Regenerate</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReadAloud} disabled={isReadingAloud}>
                            {isReadingAloud ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Read Aloud</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={() => handleFeedback('liked')}
                        >
                            <ThumbsUp className={cn("h-4 w-4", message.feedback === 'liked' && "text-primary fill-primary/20")} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Like</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={() => handleFeedback('disliked')}
                        >
                            <ThumbsDown className={cn("h-4 w-4", message.feedback === 'disliked' && "text-destructive fill-destructive/20")} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Dislike</p></TooltipContent>
                </Tooltip>
            </div>
            </TooltipProvider>
        )}

        {message.isError && (
            <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onRegenerate()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Error
                </Button>
            </div>
        )}

      </div>
      {isUser && (
        <Avatar className="w-8 h-8 border-accent">
          <div className="flex items-center justify-center w-full h-full bg-accent/20">
            <User className="w-5 h-5 text-accent" />
          </div>
        </Avatar>
      )}
    </div>
  );
}
