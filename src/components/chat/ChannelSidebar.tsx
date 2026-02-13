import { useState } from "react";
import { useChatContext } from "@/context/ChatContext";
import { Hash, Volume2, ChevronDown, Settings, Mic, Headphones, Plus, UserPlus } from "lucide-react";
import StatusIndicator from "./StatusIndicator";
import CreateChannelDialog from "./CreateChannelDialog";
import InviteDialog from "./InviteDialog";
import ProfileDialog from "./ProfileDialog";

const ChannelSidebar = () => {
  const { activeServerId, activeChannelId, setActiveChannel, channels, servers, profile } = useChatContext();
  const server = servers.find((s) => s.id === activeServerId);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  return (
    <div className="flex flex-col w-60 bg-channel-bar shrink-0">
      <button className="h-12 px-4 flex items-center justify-between border-b border-border/50 hover:bg-chat-hover transition-colors">
        <span className="font-semibold text-foreground truncate">{server?.name || "Select a server"}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {activeServerId && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-chat-hover transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite People</span>
          </button>
        )}

        {textChannels.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3 h-3" /> Text Channels
              </button>
              <button onClick={() => setShowCreateChannel(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Create Channel">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {textChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                  ch.id === activeChannelId ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <Hash className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3 h-3" /> Voice Channels
              </button>
              <button onClick={() => setShowCreateChannel(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Create Channel">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {voiceChannels.map((ch) => (
              <button key={ch.id} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-chat-hover transition-colors">
                <Volume2 className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        )}

        {channels.length === 0 && activeServerId && (
          <div className="px-2">
            <p className="text-sm text-muted-foreground mb-2">No channels yet</p>
            <button onClick={() => setShowCreateChannel(true)} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" /> Create a channel
            </button>
          </div>
        )}
      </div>

      {/* User panel */}
      <div className="h-[52px] px-2 flex items-center gap-2 bg-server-bar">
        <button onClick={() => setShowProfile(true)} className="relative">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
            {profile?.display_name?.slice(0, 2).toUpperCase() || "??"}
          </div>
          <StatusIndicator status={(profile?.status as any) || "online"} className="absolute -bottom-0.5 -right-0.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">{profile?.display_name}</p>
          <p className="text-[10px] text-muted-foreground leading-tight capitalize">{profile?.status || "Online"}</p>
        </div>
        <div className="flex gap-1">
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Mic className="w-4 h-4" /></button>
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Headphones className="w-4 h-4" /></button>
          <button onClick={() => setShowProfile(true)} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      <CreateChannelDialog open={showCreateChannel} onClose={() => setShowCreateChannel(false)} />
      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
    </div>
  );
};

export default ChannelSidebar;
