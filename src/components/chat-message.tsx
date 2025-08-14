"use client";

import type { Message, Persona } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Languages, Bot, User, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DiyaIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";


interface ChatMessageProps {
  message: Message;
  onRegenerate: (message: Message) => void;
  onScriptToggle: (messageId: string) => void;
}

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
            ? "bg-card border-2 border-accent rounded-br-none"
            : "bg-primary/10 text-primary-foreground rounded-tl-none",
          message.isError && "bg-destructive/20 border border-destructive"
        )}
      >
        {message.isError && (
          <div className="flex items-center gap-2 mb-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <p className="font-bold">Error</p>
          </div>
        )}
        <p className="m-0 whitespace-pre-wrap">{message.displayContent || message.content}</p>
        
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
        <Avatar className="w-8 h-8 border-2 border-accent">
          <div className="flex items-center justify-center w-full h-full bg-accent/20">
            <User className="w-5 h-5 text-accent" />
          </div>
        </Avatar>
      )}
    </div>
  );
}
