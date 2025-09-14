
"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from 'date-fns';
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarGroup, SidebarGroupLabel, SidebarGroupContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AiSession, type CallLog, type Persona, type UserProfile } from "@/lib/types";
import {
    Plus, MoreHorizontal, Pencil, Share2, Archive, Trash2,
    User as UserIcon, LogIn, UserPlus, Settings, LifeBuoy, LogOut, Phone
} from "lucide-react";

const formatCallDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
};

const formatCallTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return format(date, 'p');
};

const formatElapsedTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

type ChatSidebarProps = {
    conversations: Omit<AiSession, 'messages'>[];
    activeConversationId?: string;
    onSetActiveConversation: (id: string) => void;
    onNewChat: () => void;
    onRenameConversation: (id: string, title: string) => void;
    onShareConversation: (id: string) => void;
    onArchiveConversation: (id: string, isArchived: boolean) => void;
    onDeleteConversation: (id: string) => void;
    isCallActive: boolean;
    activeCallPersona: string | null;
    elapsedTime: number;
    callHistory: CallLog[];
    onNavigateToVoice: () => void;
    user: UserProfile | null;
    isGuest: boolean;
    onLogout: () => void;
};

export function ChatSidebar({ 
    conversations, 
    activeConversationId, 
    onSetActiveConversation, 
    onNewChat, 
    onRenameConversation,
    onShareConversation,
    onArchiveConversation,
    onDeleteConversation,
    isCallActive,
    activeCallPersona,
    elapsedTime,
    callHistory,
    onNavigateToVoice,
    user,
    isGuest,
    onLogout
}: ChatSidebarProps) {

    const groupedChats = conversations.reduce((acc, convo) => {
        const persona = convo.mode || 'Buddy';
        if (!acc[persona]) {
            acc[persona] = [];
        }
        acc[persona].push(convo);
        return acc;
    }, {} as Record<Persona, Omit<AiSession, 'messages'>[]>);

    if (!user) return null;

    return (
        <Sidebar>
            <SidebarContent className="p-2">
                <div className="flex h-full flex-col">
                    <div className="p-2 flex-grow">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-foreground">Chats</h2>
                            <Button variant="ghost" size="icon" onClick={onNewChat}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <ScrollArea className="h-[calc(100vh-200px)]">
                            <SidebarMenu>
                                {Object.entries(groupedChats).map(([persona, convos]) => (
                                    <SidebarGroup key={persona}>
                                        <SidebarGroupLabel>{persona as Persona}</SidebarGroupLabel>
                                        <SidebarGroupContent>
                                            <SidebarMenu>
                                                {convos.map((convo) => (
                                                    <SidebarMenuItem key={convo.id}>
                                                        <SidebarMenuButton 
                                                            onClick={() => onSetActiveConversation(convo.id)} 
                                                            isActive={activeConversationId === convo.id} 
                                                            className="justify-between"
                                                        >
                                                            <span className="truncate min-w-0 flex-1 text-left">
                                                                {convo.title.replace(`[${persona}] `, '')}
                                                            </span>
                                                        </SidebarMenuButton>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <SidebarMenuAction showOnHover><MoreHorizontal /></SidebarMenuAction>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => onRenameConversation(convo.id, convo.title)}>
                                                                        <Pencil className="mr-2 h-4 w-4" />
                                                                        <span>Rename</span>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => onShareConversation(convo.id)}>
                                                                        <Share2 className="mr-2 h-4 w-4" />
                                                                        <span>Share</span>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => onArchiveConversation(convo.id, !convo.isArchived)}>
                                                                        <Archive className="mr-2 h-4 w-4" />
                                                                        <span>{convo.isArchived ? 'Unarchive' : 'Archive'}</span>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => onDeleteConversation(convo.id)} className="text-destructive">
                                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                                        <span>Delete</span>
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenu>
                                                    </SidebarMenuItem>
                                                ))}
                                            </SidebarMenu>
                                        </SidebarGroupContent>
                                    </SidebarGroup>
                                ))}
                                {(isCallActive || (callHistory && callHistory.length > 0)) && (
                                    <SidebarGroup>
                                        <SidebarGroupLabel>Live Calls</SidebarGroupLabel>
                                        <SidebarGroupContent>
                                            <SidebarMenu>
                                                {isCallActive && (
                                                    <SidebarMenuItem>
                                                        <div onClick={onNavigateToVoice} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 w-full cursor-pointer">
                                                            <Phone className="h-4 w-4 text-green-500 animate-pulse" />
                                                            <div className="flex flex-col flex-1 truncate">
                                                                <span className="text-sm font-medium truncate">{activeCallPersona}</span>
                                                                <span className="text-xs text-muted-foreground">{formatElapsedTime(elapsedTime)}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarMenuItem>
                                                )}
                                                {callHistory.map((call) => (
                                                    <SidebarMenuItem key={call.id}>
                                                        <div className="flex flex-col w-full p-2 rounded-md hover:bg-accent/50">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm font-medium">{call.persona}</span>
                                                                <span className="text-xs text-muted-foreground">{formatCallDuration(call.duration)}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center mt-1">
                                                                <span className="text-xs text-muted-foreground">
                                                                    {call.startTime ? formatCallTimestamp(call.startTime) : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </SidebarMenuItem>
                                                ))}
                                            </SidebarMenu>
                                        </SidebarGroupContent>
                                    </SidebarGroup>
                                )}
                            </SidebarMenu>
                        </ScrollArea>
                    </div>
                    <div className="p-2 border-t border-border/50">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="w-full justify-start items-center gap-2 px-2">
                                    <UserIcon className="h-5 w-5" />
                                    <span className="truncate">
                                        {isGuest ? "Guest User" : user.email || user.phoneNumber || "User"}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {isGuest ? (
                                    <>
                                        <DropdownMenuItem asChild>
                                            <Link href="/login">
                                                <LogIn className="mr-2 h-4 w-4" />
                                                Login
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link href="/signup">
                                                <UserPlus className="mr-2 h-4 w-4" />
                                                Sign Up
                                            </Link>
                                        </DropdownMenuItem>
                                    </>
                                ) : (
                                    <>
                                        <DropdownMenuItem asChild>
                                            <Link href="/profile">
                                                <UserIcon className="mr-2 h-4 w-4" />
                                                <span>Profile</span>
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link href="/settings">
                                                <Settings className="mr-2 h-4 w-4" />
                                                <span>Settings</span>
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link href="/help">
                                                <LifeBuoy className="mr-2 h-4 w-4" />
                                                <span>Help Center</span>
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={onLogout}>
                                            <LogOut className="mr-2 h-4 w-4" />
                                            <span>Logout</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </SidebarContent>
        </Sidebar>
    );
}
