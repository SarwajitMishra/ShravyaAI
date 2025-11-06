
'use client';
import { ChatPage } from '@/components/chat-page';
import dynamic from 'next/dynamic';

const DynamicChatPage = dynamic(() => import('@/components/chat-page').then(mod => mod.ChatPage), { ssr: false });

export default function Chat() {
  return <DynamicChatPage />;
}
