import ServerSidebar from "@/components/chat/ServerSidebar";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import ChatArea from "@/components/chat/ChatArea";
import MemberSidebar from "@/components/chat/MemberSidebar";
import { ChatProvider } from "@/context/ChatContext";

const Index = () => {
  return (
    <ChatProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <ServerSidebar />
        <ChannelSidebar />
        <ChatArea />
        <MemberSidebar />
      </div>
    </ChatProvider>
  );
};

export default Index;
