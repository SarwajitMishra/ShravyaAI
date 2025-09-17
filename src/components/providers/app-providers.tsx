"use client";

import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-provider";
import { CallProvider } from "./call-provider";
import { ChatHistoryProvider } from "@/hooks/use-chat-history";
import AuthWrapper from "./auth-wrapper";
import { PipCallView } from "./pip-call-view";
import { Toaster } from "../ui/toaster";
import CallGlobalUIHandler from "../logic/CallGlobalUIHandler";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ChatHistoryProvider>
        <CallProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
          >
            <AuthWrapper>{children}</AuthWrapper>
            <PipCallView />
            <Toaster />
            <CallGlobalUIHandler />
          </ThemeProvider>
        </CallProvider>
      </ChatHistoryProvider>
    </AuthProvider>
  );
}
