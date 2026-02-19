import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ServerSidebar from "@/components/chat/ServerSidebar";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import ChatArea from "@/components/chat/ChatArea";
import MemberSidebar from "@/components/chat/MemberSidebar";
import DMSidebar from "@/components/chat/DMSidebar";
import DMArea from "@/components/chat/DMArea";
import { ChatProvider } from "@/context/ChatContext";
import { useChatContext } from "@/context/ChatContext";
import { DMProvider } from "@/context/DMContext";
import { useDMContext } from "@/context/DMContext";
import { VoiceProvider } from "@/context/VoiceContext";

const ChatLayout = () => {
  const { isDMMode, setIsDMMode, setActiveConversation, loadConversations } = useDMContext();
  const { setActiveServer, setActiveChannel } = useChatContext();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const view = searchParams.get("view");
    const dmConversationId = searchParams.get("dm");
    const targetServerId = searchParams.get("server");
    const targetChannelId = searchParams.get("channel");
    const hasDmParams = !!dmConversationId || view === "dm";
    const hasChatParams = !!targetServerId || !!targetChannelId;
    if (!hasDmParams && !hasChatParams) return;

    if (hasChatParams) {
      setIsDMMode(false);
      if (targetServerId) setActiveServer(targetServerId);
      if (targetChannelId) setActiveChannel(targetChannelId);
    }

    if (view === "dm" && !hasChatParams) {
      setIsDMMode(true);
      if (!dmConversationId) setActiveConversation(null);
    }

    if (dmConversationId && !hasChatParams) {
      setIsDMMode(true);
      setActiveConversation(dmConversationId);
      void loadConversations();
    }

    const next = new URLSearchParams(searchParams);
    next.delete("dm");
    next.delete("view");
    next.delete("server");
    next.delete("channel");
    setSearchParams(next, { replace: true });
  }, [loadConversations, searchParams, setActiveChannel, setActiveConversation, setActiveServer, setIsDMMode, setSearchParams]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <ServerSidebar />
      {isDMMode ? (
        <>
          <DMSidebar />
          <DMArea />
        </>
      ) : (
        <>
          <ChannelSidebar />
          <ChatArea />
          <MemberSidebar />
        </>
      )}
    </div>
  );
};

const Index = () => {
  return (
    <ChatProvider>
      <VoiceProvider>
        <DMProvider>
          <ChatLayout />
        </DMProvider>
      </VoiceProvider>
    </ChatProvider>
  );
};

export default Index;
