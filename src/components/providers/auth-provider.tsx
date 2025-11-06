
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User, signOut as firebaseSignOut, signInAnonymously } from 'firebase/auth';
import { app } from '@/lib/firebase'; 
import { useChatHistoryActions } from '@/hooks/use-chat-history';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const auth = getAuth(app);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setActiveConversationId, startNewConversation } = useChatHistoryActions();


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        // If no user, sign in anonymously
        try {
          const { user: anonymousUser } = await signInAnonymously(auth);
          setUser(anonymousUser);
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
        } finally {
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      // Before signing out, reset the chat state
      setActiveConversationId(null);

      await firebaseSignOut(auth);
      // After signing out, we sign in anonymously again to maintain a guest session
      const { user: anonymousUser } = await signInAnonymously(auth);
      setUser(anonymousUser);
      // Start a new default conversation for the new guest user
      startNewConversation('Buddy');
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  };

  const value = { user, loading, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
