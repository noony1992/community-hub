import React, { createContext, useContext, useState, useCallback } from "react";
import { Server, Channel, Message } from "@/data/types";
import { mockServers, mockChannels, mockMessages, currentUser } from "@/data/mockData";

interface ChatState {
  servers: Server[];
  activeServerId: string;
  activeChannelId: string;
  messages: Record<string, Message[]>;
  setActiveServer: (id: string) => void;
  setActiveChannel: (id: string) => void;
  sendMessage: (content: string) => void;
  getChannels: () => Channel[];
  getMessages: () => Message[];
}

const ChatContext = createContext<ChatState | null>(null);

export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeServerId, setActiveServerId] = useState("s1");
  const [activeChannelId, setActiveChannelId] = useState("c1");
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);

  const setActiveServer = useCallback((id: string) => {
    setActiveServerId(id);
    const channels = mockChannels[id] || [];
    const firstText = channels.find((c) => c.type === "text");
    if (firstText) setActiveChannelId(firstText.id);
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      const msg: Message = {
        id: `m-${Date.now()}`,
        content,
        userId: currentUser.id,
        channelId: activeChannelId,
        timestamp: Date.now(),
      };
      setMessages((prev) => ({
        ...prev,
        [activeChannelId]: [...(prev[activeChannelId] || []), msg],
      }));
    },
    [activeChannelId]
  );

  const getChannels = useCallback(() => mockChannels[activeServerId] || [], [activeServerId]);
  const getMessages = useCallback(() => messages[activeChannelId] || [], [messages, activeChannelId]);

  return (
    <ChatContext.Provider
      value={{
        servers: mockServers,
        activeServerId,
        activeChannelId,
        messages,
        setActiveServer,
        setActiveChannel: setActiveChannelId,
        sendMessage,
        getChannels,
        getMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
