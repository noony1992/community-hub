import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ServerSidebar from "@/components/chat/ServerSidebar";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import ChatArea from "@/components/chat/ChatArea";
import MemberSidebar from "@/components/chat/MemberSidebar";
import DMSidebar from "@/components/chat/DMSidebar";
import DMArea from "@/components/chat/DMArea";
import { useChatContext } from "@/context/ChatContext";
import { useDMContext } from "@/context/DMContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const ChatLayout = () => {
  const { isDMMode, setIsDMMode, setActiveConversation, loadConversations } = useDMContext();
  const { setActiveServer, setActiveChannel } = useChatContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [serversOpen, setServersOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [dmsOpen, setDmsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

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

  useEffect(() => {
    setChannelsOpen(false);
    setDmsOpen(false);
    setMembersOpen(false);
  }, [isDMMode]);

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] w-full overflow-hidden">
        {isDMMode ? (
          <DMArea
            isMobile
            onOpenServers={() => setServersOpen(true)}
            onOpenConversations={() => setDmsOpen(true)}
          />
        ) : (
          <ChatArea
            isMobile
            onOpenServers={() => setServersOpen(true)}
            onOpenChannels={() => setChannelsOpen(true)}
            onOpenMembers={() => setMembersOpen(true)}
          />
        )}

        <Sheet open={serversOpen} onOpenChange={setServersOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
            <ServerSidebar mode="sheet" onNavigate={() => setServersOpen(false)} />
          </SheetContent>
        </Sheet>

        <Sheet open={isDMMode ? dmsOpen : channelsOpen} onOpenChange={isDMMode ? setDmsOpen : setChannelsOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
            {isDMMode ? (
              <DMSidebar embedded onNavigate={() => setDmsOpen(false)} />
            ) : (
              <ChannelSidebar embedded onNavigate={() => setChannelsOpen(false)} />
            )}
          </SheetContent>
        </Sheet>

        {!isDMMode && (
          <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
            <SheetContent side="right" className="w-[88vw] max-w-sm p-0">
              <MemberSidebar forceVisible />
            </SheetContent>
          </Sheet>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
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
  return <ChatLayout />;
};

export default Index;
