
"use client";

import { Button } from "@/components/ui/button";

interface LoginPromptProps {
    onLogin: () => void;
}

export function LoginPrompt({ onLogin }: LoginPromptProps) {
    return (
        <div className="bg-card/50 border border-border rounded-2xl p-6 max-w-md mx-auto text-center">
            <h3 className="text-xl font-bold mb-2">Thanks for trying Shravya AI</h3>
            <p className="text-muted-foreground mb-4">
                Log in or sign up to save your chats, upload files and images, and more.
            </p>
            <div className="flex flex-col gap-3">
                <Button onClick={onLogin} size="lg" className="w-full">Log In</Button>
                <Button onClick={onLogin} variant="outline" size="lg" className="w-full">Sign up for free</Button>
            </div>
        </div>
    );
}
