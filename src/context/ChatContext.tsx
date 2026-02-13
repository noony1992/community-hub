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

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
}

interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  channels: Channel[];
  messages: Message[];
  members: Profile[];
  profile: Profile | null;
  setActiveServer: (id: string) => void;
  setActiveChannel: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  createServer: (name: string, icon: string) => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshChannels: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (data) setProfile(data as Profile);
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const refreshServers = useCallback(async () => {
    if (!user) return;
    setLoadingServers(true);
    const { data } = await supabase.from("servers").select("*");
    const serverList = (data || []) as Server[];
    setServers(serverList);
    setLoadingServers(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingServers(true);
      const { data } = await supabase.from("servers").select("*");
      const serverList = (data || []) as Server[];
      setServers(serverList);
      if (serverList.length > 0 && !activeServerId) {
        setActiveServerId(serverList[0].id);
      }
      setLoadingServers(false);
    };
    load();
  }, [user]);

  const refreshChannels = useCallback(async () => {
    if (!activeServerId) return;
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("server_id", activeServerId);
    const channelList = (data || []) as Channel[];
    setChannels(channelList);
  }, [activeServerId]);

  // Load channels when server changes
  useEffect(() => {
    if (!activeServerId) return;
    const loadChannels = async () => {
      const { data } = await supabase
        .from("channels")
        .select("*")
        .eq("server_id", activeServerId);
      const channelList = (data || []) as Channel[];
      setChannels(channelList);
      const firstText = channelList.find((c) => c.type === "text");
      if (firstText) setActiveChannelId(firstText.id);
      else setActiveChannelId(null);
    };
    loadChannels();

    const loadMembers = async () => {
      const { data } = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", activeServerId);
      if (data && data.length > 0) {
        const userIds = data.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds);
        setMembers((profiles || []) as Profile[]);
      } else {
        setMembers([]);
      }
    };
    loadMembers();
  }, [activeServerId]);

  // Load messages + realtime when channel changes
  useEffect(() => {
    if (!activeChannelId) { setMessages([]); return; }

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data || []) as Message[]);
    };
    loadMessages();

    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => [...prev, payload.new as Message]); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => m.id === payload.new.id ? (payload.new as Message) : m));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // Typing indicator via presence
  useEffect(() => {
    if (!activeChannelId || !user || !profile) { setTypingUsers([]); return; }

    const channel = supabase.channel(`typing:${activeChannelId}`, {
      config: { presence: { key: user.id } },
    });

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

  const setActiveServer = useCallback((id: string) => {
    setActiveServerId(id);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !activeChannelId) return;
    await supabase.from("messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content,
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

  const createServer = useCallback(async (name: string, icon: string) => {
    if (!user) return;
    const { data: server } = await supabase
      .from("servers")
      .insert({ name, icon, owner_id: user.id })
      .select()
      .single();
    if (server) {
      const s = server as Server;
      await supabase.from("server_members").insert({
        user_id: user.id,
        server_id: s.id,
        role: "owner",
      });
      await supabase.from("channels").insert({
        server_id: s.id,
        name: "general",
        type: "text",
      });
      setServers((prev) => [...prev, s]);
      setActiveServerId(s.id);
    }
  }, [user]);

  return (
    <ChatContext.Provider
      value={{
        servers,
        activeServerId,
        activeChannelId,
        channels,
        messages,
        members,
        profile,
        setActiveServer,
        setActiveChannel: setActiveChannelId,
        sendMessage,
        editMessage,
        deleteMessage,
        createServer,
        refreshServers,
        refreshChannels,
        refreshProfile: loadProfile,
        loadingServers,
        typingUsers,
        setTyping,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
