
"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Share2, Archive, Trash2, ChevronDown } from "lucide-react";
import { BrandIcon } from "@/components/brand-icon";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { type Persona } from "@/lib/types";

const personas: Persona[] = ["Buddy", "Doctor Dadi", "Peace Pandit", "Bug Baba", "Zindagi Guru"];

type ChatHeaderProps = {
    isLoggedIn: boolean;
    activePersona: Persona;
    activeConversation: any; // Consider a more specific type
    onPersonaChange: (persona: Persona) => void;
    onRenameClick: () => void;
    onShareClick: () => void;
    onArchiveClick: () => void;
    onDeleteClick: () => void;
};

export function ChatHeader({ 
    isLoggedIn, 
    activePersona, 
    activeConversation, 
    onPersonaChange, 
    onRenameClick, 
    onShareClick, 
    onArchiveClick, 
    onDeleteClick 
}: ChatHeaderProps) {
    return (
        <header className="p-4 border-b border-border/50 sticky top-0 z-10 bg-background/50 backdrop-blur-sm">
            <div className="flex justify-between items-center max-w-7xl mx-auto">
                <div className="flex items-center gap-4">
                    {isLoggedIn && <SidebarTrigger className="md:hidden" />}
                    <BrandIcon className="h-8 w-8 text-primary" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <span>{activePersona}</span>
                                <ChevronDown className="h-4 w-4 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56">
                            {personas.map((persona) => (
                                <DropdownMenuItem
                                    key={persona}
                                    onSelect={() => onPersonaChange(persona)}
                                    className={cn(activePersona === persona ? 'bg-muted' : '', 'cursor-pointer')}
                                >
                                    {persona}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                {activeConversation && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onRenameClick}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Rename</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onShareClick}>
                                <Share2 className="mr-2 h-4 w-4" />
                                <span>Share</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onArchiveClick}>
                                <Archive className="mr-2 h-4 w-4" />
                                <span>{activeConversation.isArchived ? 'Unarchive' : 'Archive'}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onDeleteClick} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </header>
    );
}
