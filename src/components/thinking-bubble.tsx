"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { DiyaIcon } from "@/components/icons";

export function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3 animate-in fade-in duration-500">
      <Avatar className="w-8 h-8 border-2 border-primary">
        <div className="flex items-center justify-center w-full h-full bg-primary/20">
            <DiyaIcon className="w-5 h-5 text-primary" />
        </div>
      </Avatar>
      <div className="p-4 rounded-2xl rounded-tl-none bg-primary/10 text-primary-foreground max-w-sm md:max-w-md">
        <div className="flex space-x-2 justify-center items-center">
          <Skeleton className="h-2 w-2 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.3s]" />
          <Skeleton className="h-2 w-2 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.15s]" />
          <Skeleton className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
