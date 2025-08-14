
"use client";

import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Languages, User, AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DiyaIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useState } from "react";


interface ChatMessageProps {
  message: Message;
  onRegenerate: (message: Message) => void;
  onScriptToggle: (messageId: string) => void;
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


export function ChatMessage({ message, onRegenerate, onScriptToggle }: ChatMessageProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast({
      title: "Copied to clipboard!",
      description: "The message has been copied.",
    });
  };

  const isUser = message.role === "user";

  // Don't render the initial greeting from the assistant
  if (message.role === 'assistant' && message.id === '0') {
    return null;
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
          message.isError && "bg-destructive/20 border border-destructive"
        )}
      >
        {message.isError && (
          <div className="flex items-center gap-2 mb-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <p className="font-bold">Error</p>
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
