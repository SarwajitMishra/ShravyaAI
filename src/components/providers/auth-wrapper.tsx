
"use client";

import { useAuth } from "./auth-provider";
import { usePathname } from 'next/navigation';
import { ThinkingBubble } from '@/components/thinking-bubble';

const publicRoutes = ['/']; // Add any other public routes here

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isPublicRoute = publicRoutes.includes(pathname);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <ThinkingBubble />
      </div>
    );
  }

  // If it's a public route, just show the content
  if (isPublicRoute && !user) {
      return <>{children}</>;
  }
  
  // If we are on a protected route and not logged in, you might want to redirect
  // For now, we're handling guest access, so we just show the content
  // A redirect could be added here if needed for certain pages.

  return <>{children}</>;
}
