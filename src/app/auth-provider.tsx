
"use client";

import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { onAuthStateChanged, User, signInAnonymously, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  createGuestSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: async () => {}, createGuestSession: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const createGuestSession = useCallback(async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Anonymous sign-in failed:", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      // Use the Next.js router for a clean navigation
      router.push('/');
      // A small delay to ensure state updates and redirects complete smoothly
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Logout failed:", error);
      // Re-throw the error if you want the calling component to handle it (e.g., show a toast)
      throw error;
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, createGuestSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
