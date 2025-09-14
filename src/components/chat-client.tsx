
"use client";

import { useChatHistory } from "@/hooks/use-chat-history";
import { ChatView } from "@/components/chat-view";

export function ChatClient() {
  const chatHistoryProps = useChatHistory();

  return <ChatView {...chatHistoryProps} />;
}
