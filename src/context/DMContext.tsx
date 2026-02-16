import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface DMConversation {
  id: string;
  created_at: string;
  participant: { id: string; username: string; display_name: string; avatar_url: string | null; status: string };
}

interface DMMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface DMState {
  conversations: DMConversation[];
  activeConversationId: string | null;
  dmMessages: DMMessage[];
  setActiveConversation: (id: string | null) => void;
  sendDM: (content: string) => Promise<void>;
  startConversation: (otherUserId: string) => Promise<string | null>;
  loadConversations: () => Promise<void>;
  isDMMode: boolean;
  setIsDMMode: (v: boolean) => void;
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
  const [isDMMode, setIsDMMode] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    // Get conversations the user is part of
    const { data: participations } = await supabase
      .from("dm_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      return;
    }

    const convIds = participations.map((p: any) => p.conversation_id);

    // For each conversation, find the other participant
    const { data: allParticipants } = await supabase
      .from("dm_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds);

    if (!allParticipants) return;

    const otherUserIds = allParticipants
      .filter((p: any) => p.user_id !== user.id)
      .map((p: any) => ({ convId: p.conversation_id, userId: p.user_id }));

    if (otherUserIds.length === 0) {
      setConversations([]);
      return;
    }

    const uniqueUserIds = [...new Set(otherUserIds.map((o) => o.userId))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", uniqueUserIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    const convs: DMConversation[] = otherUserIds
      .filter((o) => profileMap[o.userId])
      .map((o) => ({
        id: o.convId,
        created_at: "",
        participant: profileMap[o.userId],
      }));

    setConversations(convs);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load DM messages + realtime
  useEffect(() => {
    if (!activeConversationId) { setDmMessages([]); return; }

    const load = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(100);
      setDmMessages((data || []) as DMMessage[]);
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
        setDmMessages((prev) => [...prev, payload.new as DMMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConversationId]);

  const sendDM = useCallback(async (content: string) => {
    if (!user || !activeConversationId) return;
    await supabase.from("direct_messages").insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      content,
    });

    // Create notification for the other participant
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (conv && conv.participant.id !== user.id) {
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      await supabase.from("notifications").insert({
        user_id: conv.participant.id,
        type: "dm",
        title: `${profile?.display_name || "Someone"} sent you a message`,
        body: content.slice(0, 100),
        link_conversation_id: activeConversationId,
      });
    }
  }, [user, activeConversationId, conversations]);

  const startConversation = useCallback(async (otherUserId: string) => {
    if (!user) return null;

    // Check if conversation already exists
    const existing = conversations.find((c) => c.participant.id === otherUserId);
    if (existing) {
      setActiveConversationId(existing.id);
      setIsDMMode(true);
      return existing.id;
    }

    // Create new conversation
    const { data: conv } = await supabase
      .from("direct_conversations")
      .insert({})
      .select()
      .single();

    if (!conv) return null;

    // Add self as participant (RLS allows this)
    await supabase.from("dm_participants").insert({ conversation_id: conv.id, user_id: user.id });
    // Add other user - need updated RLS or use the conversation creator pattern
    await supabase.from("dm_participants").insert({ conversation_id: conv.id, user_id: otherUserId });

    await loadConversations();
    setActiveConversationId(conv.id);
    setIsDMMode(true);
    return conv.id;
  }, [user, conversations, loadConversations]);

  return (
    <DMContext.Provider value={{
      conversations,
      activeConversationId,
      dmMessages,
      setActiveConversation: setActiveConversationId,
      sendDM,
      startConversation,
      loadConversations,
      isDMMode,
      setIsDMMode,
    }}>
      {children}
    </DMContext.Provider>
  );
};
