
"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { ChatMessage } from "@/components/chat-message";
import { BrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { type AiMessage, type Persona } from "@/lib/types";
import { personaDetails } from "@/lib/persona-details";
import { format, isToday, isYesterday } from 'date-fns';
import React, { RefObject } from 'react';

type ChatMessagesProps = {
    isPending: boolean;
    activeConversation: any; // More specific type
    activePersona: Persona;
    greeting: string;
    viewportRef: RefObject<HTMLDivElement>;
    onPromptStarterClick: (prompt: string) => void;
    onRegenerateLastMessage: () => void;
};

export function ChatMessages({ 
    isPending, 
    activeConversation, 
    activePersona, 
    greeting, 
    viewportRef, 
    onPromptStarterClick,
    onRegenerateLastMessage
}: ChatMessagesProps) {

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
                    onRegenerate={onRegenerateLastMessage}
                    onScriptToggle={() => { /* Not implemented */ }}
                    isVoiceSession={activeConversation?.type === 'voice'}
                />
            );
        });
        return messageElements;
    };

    const showWelcomeScreen = !activeConversation || activeConversation.messages.length === 0;

    return (
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
                                    <Button key={i} variant="outline" size="sm" onClick={() => onPromptStarterClick(prompt)}>
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
    );
}
