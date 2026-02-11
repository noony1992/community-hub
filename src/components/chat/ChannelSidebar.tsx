import { useChatContext } from "@/context/ChatContext";
import { Hash, Volume2, ChevronDown, Settings, Mic, Headphones } from "lucide-react";
import { mockServers, currentUser } from "@/data/mockData";
import StatusIndicator from "./StatusIndicator";

const ChannelSidebar = () => {
  const { activeServerId, activeChannelId, setActiveChannel, getChannels } = useChatContext();
  const channels = getChannels();
  const server = mockServers.find((s) => s.id === activeServerId);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  return (
    <div className="flex flex-col w-60 bg-channel-bar shrink-0">
      {/* Server header */}
      <button className="h-12 px-4 flex items-center justify-between border-b border-border/50 hover:bg-chat-hover transition-colors">
        <span className="font-semibold text-foreground truncate">{server?.name}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {/* Channel lists */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Text channels */}
        <div>
          <button className="flex items-center gap-1 px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors w-full">
            <ChevronDown className="w-3 h-3" />
            Text Channels
          </button>
          {textChannels.map((ch) => {
            const isActive = ch.id === activeChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <Hash className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{ch.name}</span>
              </button>
            );
          })}
        </div>

        {/* Voice channels */}
        <div>
          <button className="flex items-center gap-1 px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors w-full">
            <ChevronDown className="w-3 h-3" />
            Voice Channels
          </button>
          {voiceChannels.map((ch) => (
            <button
              key={ch.id}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-chat-hover transition-colors"
            >
              <Volume2 className="w-4 h-4 shrink-0 opacity-70" />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User panel */}
      <div className="h-[52px] px-2 flex items-center gap-2 bg-server-bar">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
            {currentUser.avatar}
          </div>
          <StatusIndicator status={currentUser.status} className="absolute -bottom-0.5 -right-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">{currentUser.displayName}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Online</p>
        </div>
        <div className="flex gap-1">
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <Mic className="w-4 h-4" />
          </button>
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <Headphones className="w-4 h-4" />
          </button>
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelSidebar;
