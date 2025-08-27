
"use client";

import type { AiMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Languages, User, AlertTriangle, Check, FileText, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DiyaIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MoreHorizontal } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useState } from "react";


interface ChatMessageProps {
  message: AiMessage;
  onRegenerate: (message: AiMessage) => void;
  onScriptToggle: (messageId: string) => void;
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


export function ChatMessage({ message, onRegenerate, onScriptToggle, isVoiceSession }: ChatMessageProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast({
      title: "Copied to clipboard!",
      description: "The message has been copied.",
    });
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
      // This logic creates a clean, readable filename from the long URL
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
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-card hover:bg-card/90">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleCopy}>
                            <Copy className="mr-2 h-4 w-4" />
                            <span>Copy</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRegenerate(message)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            <span>Regenerate</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onScriptToggle(message.id)}>
                            <Languages className="mr-2 h-4 w-4" />
                            <span>{message.isRoman ? "Show Devanagari" : "Show Roman"}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )}

        {message.isError && (
            <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onRegenerate(message)}>
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
