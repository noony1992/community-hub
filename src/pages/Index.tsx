import ServerSidebar from "@/components/chat/ServerSidebar";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import ChatArea from "@/components/chat/ChatArea";
import MemberSidebar from "@/components/chat/MemberSidebar";
import DMSidebar from "@/components/chat/DMSidebar";
import DMArea from "@/components/chat/DMArea";
import { ChatProvider } from "@/context/ChatContext";
import { DMProvider } from "@/context/DMContext";
import { useDMContext } from "@/context/DMContext";

const ChatLayout = () => {
  const { isDMMode } = useDMContext();

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
      <DMProvider>
        <ChatLayout />
      </DMProvider>
    </ChatProvider>
  );
};

export default Index;
