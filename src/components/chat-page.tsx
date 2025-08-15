
'use client';

import { SidebarProvider } from '@/components/ui/sidebar';
import dynamic from 'next/dynamic';

const ChatClient = dynamic(() => import('@/components/chat-client').then(mod => mod.ChatClient), {
  ssr: false,
  loading: () => <div className="flex h-screen w-full items-center justify-center">Loading...</div>,
});

export function ChatPage() {
    return (
        <SidebarProvider>
            <ChatClient />
        </SidebarProvider>
    )
}
