
"use client";

import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { onAuthStateChanged, User, signInAnonymously, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Separate function to handle anonymous sign-in
  const createGuestSession = useCallback(() => {
    return signInAnonymously(auth).catch((error) => {
      console.error("Anonymous sign-in failed:", error);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect to create a guest session on initial load if no user is authenticated
  useEffect(() => {
    // This check ensures we only run this on the initial client-side load
    if (!loading && !user) {
      createGuestSession();
    }
  }, [loading, user, createGuestSession]);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
    await createGuestSession();
  }, [createGuestSession]);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
