
"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { ThinkingBubble } from "@/components/thinking-bubble";

const publicRoutes = ["/", "/login", "/signup", "/phone-auth"];

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const isPublicRoute = publicRoutes.includes(pathname);
    const isRegisteredUser = user && !user.isAnonymous;

    // If a registered user is on a public route (e.g., landing, login),
    // redirect them to the chat.
    if (isRegisteredUser && isPublicRoute) {
      router.push("/chat");
      return;
    }

    // If a user (guest or registered) is on a protected route,
    // they are in the right place.
    if (user && !isPublicRoute) {
      return;
    }

    // If there is NO user at all and they are on a PROTECTED route,
    // send them to the landing page.
    if (!user && !isPublicRoute) {
      router.push("/");
      return;
    }

  }, [user, loading, router, pathname]);

  // To prevent flicker, show a loading bubble while auth state resolves,
  // or if a non-user is trying to access a protected page before redirect.
  if (loading || (!user && !publicRoutes.includes(pathname))) {
    return (
      <div className="flex h-screen w-full bg-background items-center justify-center">
        <ThinkingBubble />
      </div>
    );
  }

  return <>{children}</>;
}
