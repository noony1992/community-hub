import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getEffectiveStatus } from "@/lib/presence";
import { isWithinQuietHours, type UserNotificationSettings } from "@/lib/notificationPreferences";
import { auditLog } from "@/lib/auditLog";
import { showOperationErrorToast } from "@/lib/errorToasts";
import { RetryQueue } from "@/lib/retryQueue";

interface DMConversation {
  id: string;
  created_at: string;
  participant: { id: string; username: string; display_name: string; avatar_url: string | null; status: string; updated_at?: string | null };
}

interface DMMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string;
  created_at: string;
  client_status?: "pending" | "retrying" | "failed";
  client_request_id?: string | null;
}

interface DMState {
  conversations: DMConversation[];
  activeConversationId: string | null;
  dmMessages: DMMessage[];
  loadingConversations: boolean;
  loadingDmMessages: boolean;
  setActiveConversation: (id: string | null) => void;
  sendDM: (content: string) => Promise<void>;
  startConversation: (otherUserId: string) => Promise<string | null>;
  loadConversations: () => Promise<void>;
  isDMMode: boolean;
  setIsDMMode: (v: boolean) => void;
  isFriendsView: boolean;
  setIsFriendsView: (v: boolean) => void;
}

const DMContext = createContext<DMState | null>(null);

export const useDMContext = () => {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error("useDMContext must be used within DMProvider");
  return ctx;
};

export const DMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DMMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingDmMessages, setLoadingDmMessages] = useState(false);
  const [isDMMode, setIsDMMode] = useState(false);
  const [isFriendsView, setIsFriendsView] = useState(false);
  const dmRetryQueueRef = useRef(new RetryQueue());

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
    if (id) setIsFriendsView(false);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user) {
      setLoadingConversations(false);
      return;
    }
    setLoadingConversations(true);
    // Get conversations the user is part of
    const { data: participations, error: participationsError } = await supabase
      .from("dm_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (participationsError) {
      console.error("Failed to load DM participations:", participationsError.message);
      setLoadingConversations(false);
      return;
    }

    if (!participations || participations.length === 0) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    const convIds = participations.map((p: any) => p.conversation_id);

    // For each conversation, find the other participant
    const { data: allParticipants, error: allParticipantsError } = await supabase
      .from("dm_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds);

    if (allParticipantsError) {
      console.error("Failed to load DM participants:", allParticipantsError.message);
      setLoadingConversations(false);
      return;
    }

    if (!allParticipants) {
      setLoadingConversations(false);
      return;
    }

    const otherUserIds = allParticipants
      .filter((p: any) => p.user_id !== user.id)
      .map((p: any) => ({ convId: p.conversation_id, userId: p.user_id }));

    if (otherUserIds.length === 0) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    const uniqueUserIds = [...new Set(otherUserIds.map((o) => o.userId))];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", uniqueUserIds);

    if (profilesError) {
      console.error("Failed to load DM profiles:", profilesError.message);
      setLoadingConversations(false);
      return;
    }

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    const convs: DMConversation[] = otherUserIds
      .filter((o) => profileMap[o.userId])
      .map((o) => ({
        id: o.convId,
        created_at: "",
        participant: {
          ...profileMap[o.userId],
          status: getEffectiveStatus(profileMap[o.userId].status, profileMap[o.userId].updated_at),
        },
      }));

    const uniqueConversations = Array.from(new Map(convs.map((c) => [c.id, c])).values());
    setConversations(uniqueConversations);
    setLoadingConversations(false);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!user) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadConversations();
      }
    };

    const intervalId = window.setInterval(() => {
      void loadConversations();
    }, 15000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadConversations, user]);

  // Load DM messages + realtime
  useEffect(() => {
    if (!activeConversationId) {
      setDmMessages([]);
      setLoadingDmMessages(false);
      return;
    }
    setLoadingDmMessages(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) {
        console.error("Failed to load direct messages:", error.message);
        setLoadingDmMessages(false);
        return;
      }
      setDmMessages((data || []) as DMMessage[]);
      setLoadingDmMessages(false);
    };
    load();

    const channel = supabase
      .channel(`dm:${activeConversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `conversation_id=eq.${activeConversationId}`,
      }, (payload) => {
        const incoming = payload.new as DMMessage;
        setDmMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConversationId]);

  const createDMNotification = useCallback(async (content: string, conversationId: string) => {
    if (!user) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv || conv.participant.id === user.id) return;

    const { data: recipientSettings } = await supabase
      .from("user_notification_settings")
      .select("user_id, mention_only, keyword_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
      .eq("user_id", conv.participant.id)
      .maybeSingle();
    if (recipientSettings && isWithinQuietHours(recipientSettings as UserNotificationSettings)) {
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Failed to load sender profile for DM notification:", profileError.message);
      return;
    }

    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: conv.participant.id,
      type: "dm",
      title: `${profile?.display_name || "Someone"} sent you a message`,
      body: content.slice(0, 100),
      link_conversation_id: conversationId,
    });
    if (notificationError) {
      console.error("Failed to create DM notification:", notificationError.message);
    }
  }, [conversations, user]);

  const sendDM = useCallback(async (content: string) => {
    if (!user || !activeConversationId) return;
    const requestId = crypto.randomUUID();
    const optimisticId = `optimistic:${requestId}`;
    const optimisticMessage: DMMessage = {
      id: optimisticId,
      conversation_id: activeConversationId,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      client_status: "pending",
      client_request_id: requestId,
    };
    setDmMessages((prev) => [...prev, optimisticMessage]);
    auditLog({
      level: "info",
      scope: "dm.send",
      event: "optimistic_enqueued",
      requestId,
      details: { conversation_id: activeConversationId },
    });

    const runSend = async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: user.id,
          content,
        })
        .select("*")
        .single();
      if (error) throw error;
      const saved = data as DMMessage;
      setDmMessages((prev) => prev.map((m) => (m.id === optimisticId ? saved : m)));
      await createDMNotification(content, activeConversationId);
      auditLog({
        level: "info",
        scope: "dm.send",
        event: "send_succeeded",
        requestId,
        details: { message_id: saved.id },
      });
    };

    const enqueueRetry = () => {
      dmRetryQueueRef.current.enqueue({
        id: requestId,
        initialDelayMs: 1_500,
        maxAttempts: 5,
        run: async (attempt) => {
          setDmMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
          auditLog({
            level: "warn",
            scope: "dm.send",
            event: "retry_attempt",
            requestId,
            details: { attempt },
          });
          await runSend();
        },
        onAttemptFailed: (error, attempt, nextDelayMs) => {
          auditLog({
            level: "warn",
            scope: "dm.send",
            event: "retry_failed",
            requestId,
            details: {
              attempt,
              next_delay_ms: nextDelayMs,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
        onPermanentFailure: (error, attempts) => {
          setDmMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "failed" } : m)));
          showOperationErrorToast("Send DM", error as { message?: string }, {
            requestId,
            onRetryNow: () => {
              setDmMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
              enqueueRetry();
              dmRetryQueueRef.current.runNow(requestId);
            },
          });
          auditLog({
            level: "error",
            scope: "dm.send",
            event: "permanent_failure",
            requestId,
            details: {
              attempts,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
      });
    };

    try {
      await runSend();
      return;
    } catch (error) {
      const details = showOperationErrorToast("Send DM", error as { message?: string }, {
        requestId,
        onRetryNow: () => dmRetryQueueRef.current.runNow(requestId),
      });
      if (!details.retryable) {
        setDmMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        auditLog({
          level: "error",
          scope: "dm.send",
          event: "send_failed_non_retryable",
          requestId,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
        return;
      }

      setDmMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
      enqueueRetry();
      auditLog({
        level: "warn",
        scope: "dm.send",
        event: "send_queued_for_retry",
        requestId,
      });
    }
  }, [user, activeConversationId, createDMNotification]);

  const startConversation = useCallback(async (otherUserId: string) => {
    if (!user) return null;
    if (otherUserId === user.id) return null;

    // Check if conversation already exists
    const existing = conversations.find((c) => c.participant.id === otherUserId);
    if (existing) {
      setActiveConversationId(existing.id);
      setIsDMMode(true);
      setIsFriendsView(false);
      return existing.id;
    }

    const { data: conversationId, error } = await supabase.rpc("start_direct_conversation", {
      _other_user_id: otherUserId,
    });
    if (error || !conversationId) {
      console.error("Failed to start DM conversation:", error?.message || "Unknown error");
      return null;
    }

    await loadConversations();
    setActiveConversationId(conversationId);
    setIsDMMode(true);
    setIsFriendsView(false);
    return conversationId;
  }, [user, conversations, loadConversations]);

  return (
    <DMContext.Provider value={{
      conversations,
      activeConversationId,
      dmMessages,
      loadingConversations,
      loadingDmMessages,
      setActiveConversation,
      sendDM,
      startConversation,
      loadConversations,
      isDMMode,
      setIsDMMode,
      isFriendsView,
      setIsFriendsView,
    }}>
      {children}
    </DMContext.Provider>
  );
};
