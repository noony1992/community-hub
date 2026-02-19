import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSessionRef = useRef<Session | null>(null);

  const updateStatus = useCallback(async (userId: string, status: "online" | "idle" | "dnd" | "offline") => {
    await supabase.from("profiles").update({ status }).eq("id", userId);
  }, []);

  const touchPresence = useCallback(async (userId: string) => {
    await supabase.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", userId);
  }, []);

  const updateStatusKeepalive = useCallback((userId: string, accessToken: string, status: "online" | "idle" | "dnd" | "offline") => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) return;

    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status }),
      keepalive: true,
    }).catch(() => {
      // Best-effort on page shutdown.
    });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const previousSession = lastSessionRef.current;

      if ((!nextSession || event === "SIGNED_OUT") && previousSession?.user?.id && previousSession.access_token) {
        updateStatusKeepalive(previousSession.user.id, previousSession.access_token, "offline");
      }

      if (nextSession?.user?.id) {
        void updateStatus(nextSession.user.id, "online");
      }

      lastSessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      lastSessionRef.current = currentSession;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user?.id) {
        void updateStatus(currentSession.user.id, "online");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [updateStatus, updateStatusKeepalive]);

  useEffect(() => {
    if (!user?.id || !session?.access_token) return;

    const setOfflineOnExit = () => {
      updateStatusKeepalive(user.id, session.access_token, "offline");
    };

    window.addEventListener("pagehide", setOfflineOnExit);
    window.addEventListener("beforeunload", setOfflineOnExit);

    return () => {
      window.removeEventListener("pagehide", setOfflineOnExit);
      window.removeEventListener("beforeunload", setOfflineOnExit);
    };
  }, [user?.id, session?.access_token, updateStatusKeepalive]);

  useEffect(() => {
    if (!user?.id) return;

    void touchPresence(user.id);
    const intervalId = window.setInterval(() => {
      void touchPresence(user.id);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [touchPresence, user?.id]);

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: username },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    const activeSession = lastSessionRef.current;
    if (activeSession?.user?.id) {
      await updateStatus(activeSession.user.id, "offline");
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
