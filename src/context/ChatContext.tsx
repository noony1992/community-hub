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
  createServer: (name: string, icon: string) => Promise<void>;
  loadingServers: boolean;
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

  // Load profile
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data as Profile);
    };
    loadProfile();
  }, [user]);

  // Load servers
  useEffect(() => {
    if (!user) return;
    const loadServers = async () => {
      setLoadingServers(true);
      const { data } = await supabase.from("servers").select("*");
      const serverList = (data || []) as Server[];
      setServers(serverList);
      if (serverList.length > 0 && !activeServerId) {
        setActiveServerId(serverList[0].id);
      }
      setLoadingServers(false);
    };
    loadServers();
  }, [user]);

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

    // Load members
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

    // Realtime subscription
    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId]);

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

  const createServer = useCallback(async (name: string, icon: string) => {
    if (!user) return;
    const { data: server } = await supabase
      .from("servers")
      .insert({ name, icon, owner_id: user.id })
      .select()
      .single();
    if (server) {
      const s = server as Server;
      // Add self as owner member
      await supabase.from("server_members").insert({
        user_id: user.id,
        server_id: s.id,
        role: "owner",
      });
      // Create default general channel
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
        createServer,
        loadingServers,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
