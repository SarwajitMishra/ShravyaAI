
'use client';

import { SidebarProvider } from '@/components/ui/sidebar';
import dynamic from 'next/dynamic';
import { ThinkingBubble } from '@/components/thinking-bubble';

const ChatClient = dynamic(() => import('./chat-client').then(mod => mod.ChatClient), {
  ssr: false,
  loading: () => <div className="flex h-screen w-full items-center justify-center"><ThinkingBubble /></div>,
});

export function ChatPage() {
    return (
        <SidebarProvider>
            <ChatClient />
        </SidebarProvider>
    )
}
