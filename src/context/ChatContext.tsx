import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
}

interface Server {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  owner_id: string;
}

interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: string;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  reply_to: string | null;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  channels: Channel[];
  messages: Message[];
  members: Profile[];
  profile: Profile | null;
  reactions: Record<string, Reaction[]>;
  setActiveServer: (id: string) => void;
  setActiveChannel: (id: string) => void;
  sendMessage: (content: string, attachment?: { url: string; name: string; type: string }, replyTo?: string) => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  createServer: (name: string, icon: string) => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshChannels: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  searchMessages: (query: string) => Promise<{ message: Message; channel_name: string; server_name: string }[]>;
  pinMessage: (messageId: string) => Promise<void>;
  unpinMessage: (messageId: string) => Promise<void>;
  getPinnedMessages: () => Promise<Message[]>;
  getThreadReplies: (messageId: string) => Promise<Message[]>;
  loadingServers: boolean;
  typingUsers: Profile[];
  setTyping: (isTyping: boolean) => void;
}

const ChatContext = createContext<ChatState | null>(null);

export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const refreshServers = useCallback(async () => {
    if (!user) return;
    setLoadingServers(true);
    const { data } = await supabase.from("servers").select("*");
    setServers((data || []) as Server[]);
    setLoadingServers(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingServers(true);
      const { data } = await supabase.from("servers").select("*");
      const serverList = (data || []) as Server[];
      setServers(serverList);
      if (serverList.length > 0 && !activeServerId) setActiveServerId(serverList[0].id);
      setLoadingServers(false);
    };
    load();
  }, [user]);

  const refreshChannels = useCallback(async () => {
    if (!activeServerId) return;
    const { data } = await supabase.from("channels").select("*").eq("server_id", activeServerId);
    setChannels((data || []) as Channel[]);
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) return;
    const loadChannels = async () => {
      const { data } = await supabase.from("channels").select("*").eq("server_id", activeServerId);
      const channelList = (data || []) as Channel[];
      setChannels(channelList);
      const firstText = channelList.find((c) => c.type === "text");
      if (firstText) setActiveChannelId(firstText.id);
      else setActiveChannelId(null);
    };
    loadChannels();

    const loadMembers = async () => {
      const { data } = await supabase.from("server_members").select("user_id").eq("server_id", activeServerId);
      if (data && data.length > 0) {
        const userIds = data.map((m: any) => m.user_id);
        const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
        setMembers((profiles || []) as Profile[]);
      } else {
        setMembers([]);
      }
    };
    loadMembers();
  }, [activeServerId]);

  // Load messages + reactions + realtime
  useEffect(() => {
    if (!activeChannelId) { setMessages([]); setReactions({}); return; }

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages").select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true })
        .limit(100);
      const msgs = (data || []) as Message[];
      setMessages(msgs);

      if (msgs.length > 0) {
        const msgIds = msgs.map(m => m.id);
        const { data: rxns } = await supabase.from("reactions").select("*").in("message_id", msgIds);
        const grouped: Record<string, Reaction[]> = {};
        (rxns || []).forEach((r: any) => {
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          grouped[r.message_id].push(r as Reaction);
        });
        setReactions(grouped);
      }
    };
    loadMessages();

    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => [...prev, payload.new as Message]); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => prev.map((m) => m.id === payload.new.id ? (payload.new as Message) : m)); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)); })
      .subscribe();

    const rxnChannel = supabase
      .channel(`reactions:${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        const msgIds = messages.map(m => m.id);
        if (msgIds.length > 0) {
          supabase.from("reactions").select("*").in("message_id", msgIds).then(({ data }) => {
            const grouped: Record<string, Reaction[]> = {};
            (data || []).forEach((r: any) => {
              if (!grouped[r.message_id]) grouped[r.message_id] = [];
              grouped[r.message_id].push(r as Reaction);
            });
            setReactions(grouped);
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(rxnChannel);
    };
  }, [activeChannelId]);

  // Typing indicator
  useEffect(() => {
    if (!activeChannelId || !user || !profile) { setTypingUsers([]); return; }
    const channel = supabase.channel(`typing:${activeChannelId}`, { config: { presence: { key: user.id } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const typing: Profile[] = [];
      Object.entries(state).forEach(([uid, presences]) => {
        if (uid !== user.id && (presences as any[])[0]?.typing) {
          const member = members.find((m) => m.id === uid);
          if (member) typing.push(member);
        }
      });
      setTypingUsers(typing);
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId, user, profile, members]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!activeChannelId || !user) return;
    const channel = supabase.channel(`typing:${activeChannelId}`);
    channel.track({ typing: isTyping });
  }, [activeChannelId, user]);

  const setActiveServer = useCallback((id: string) => { setActiveServerId(id); }, []);

  const sendMessage = useCallback(async (content: string, attachment?: { url: string; name: string; type: string }, replyTo?: string) => {
    if (!user || !activeChannelId) return;
    await supabase.from("messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      reply_to: replyTo || null,
    });
  }, [user, activeChannelId]);

  const editMessage = useCallback(async (id: string, content: string) => {
    if (!user) return;
    await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", id);
  }, [user]);

  const deleteMessage = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("messages").delete().eq("id", id);
  }, [user]);

  const pinMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("messages").update({ pinned_at: new Date().toISOString(), pinned_by: user.id }).eq("id", messageId);
  }, [user]);

  const unpinMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("messages").update({ pinned_at: null, pinned_by: null }).eq("id", messageId);
  }, [user]);

  const getPinnedMessages = useCallback(async () => {
    if (!activeChannelId) return [];
    const { data } = await supabase.from("messages").select("*")
      .eq("channel_id", activeChannelId)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: false });
    return (data || []) as Message[];
  }, [activeChannelId]);

  const getThreadReplies = useCallback(async (messageId: string) => {
    const { data } = await supabase.from("messages").select("*")
      .eq("reply_to", messageId)
      .order("created_at", { ascending: true });
    return (data || []) as Message[];
  }, []);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    await supabase.from("reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    setReactions(prev => {
      const existing = prev[messageId] || [];
      return { ...prev, [messageId]: [...existing, { id: crypto.randomUUID(), message_id: messageId, user_id: user.id, emoji, created_at: new Date().toISOString() }] };
    });
  }, [user]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji);
    setReactions(prev => {
      const existing = prev[messageId] || [];
      return { ...prev, [messageId]: existing.filter(r => !(r.user_id === user.id && r.emoji === emoji)) };
    });
  }, [user]);

  const searchMessages = useCallback(async (query: string) => {
    if (!query.trim()) return [];
    const { data } = await supabase.from("messages").select("*").ilike("content", `%${query}%`).order("created_at", { ascending: false }).limit(50);
    if (!data || data.length === 0) return [];
    const channelIds = [...new Set((data as Message[]).map(m => m.channel_id))];
    const { data: chData } = await supabase.from("channels").select("*").in("id", channelIds);
    const chMap: Record<string, any> = {};
    (chData || []).forEach((c: any) => { chMap[c.id] = c; });
    const serverIds = [...new Set(Object.values(chMap).map((c: any) => c.server_id))];
    const { data: srvData } = await supabase.from("servers").select("*").in("id", serverIds);
    const srvMap: Record<string, any> = {};
    (srvData || []).forEach((s: any) => { srvMap[s.id] = s; });
    return (data as Message[]).map(msg => ({
      message: msg,
      channel_name: chMap[msg.channel_id]?.name || "unknown",
      server_name: srvMap[chMap[msg.channel_id]?.server_id]?.name || "unknown",
    }));
  }, []);

  const createServer = useCallback(async (name: string, icon: string) => {
    if (!user) return;
    const { data: server } = await supabase.from("servers").insert({ name, icon, owner_id: user.id }).select().single();
    if (server) {
      const s = server as Server;
      await supabase.from("server_members").insert({ user_id: user.id, server_id: s.id, role: "owner" });
      await supabase.from("channels").insert({ server_id: s.id, name: "general", type: "text" });
      setServers((prev) => [...prev, s]);
      setActiveServerId(s.id);
    }
  }, [user]);

  return (
    <ChatContext.Provider
      value={{
        servers, activeServerId, activeChannelId, channels, messages, members, profile, reactions,
        setActiveServer, setActiveChannel: setActiveChannelId, sendMessage, editMessage, deleteMessage,
        createServer, refreshServers, refreshChannels, refreshProfile: loadProfile,
        addReaction, removeReaction, searchMessages, pinMessage, unpinMessage, getPinnedMessages,
        getThreadReplies, loadingServers, typingUsers, setTyping,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
