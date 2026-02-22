import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { Hash, Volume2, ChevronDown, Settings, UserPlus, LogOut, MessageSquare } from "lucide-react";
import InviteDialog from "./InviteDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useVoiceContext } from "@/context/VoiceContext";
import BottomLeftDock from "./BottomLeftDock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ChannelSidebarProps = {
  embedded?: boolean;
  onNavigate?: () => void;
};

const ChannelSidebar = ({ embedded = false, onNavigate }: ChannelSidebarProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeServerId, activeChannelId, setActiveChannel, channels, channelGroups, servers, members, refreshServers, unreadCountByChannel } = useChatContext();
  const {
    activeVoiceChannelId,
    isConnected,
    connectedVoice,
    joinVoiceChannel,
  } = useVoiceContext();
  const server = servers.find((s) => s.id === activeServerId);
  const [showInvite, setShowInvite] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingVoiceSwitchChannelId, setPendingVoiceSwitchChannelId] = useState<string | null>(null);
  const [switchingVoiceChannel, setSwitchingVoiceChannel] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");
  const forumChannels = channels.filter((c) => c.type === "forum");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const groupedText = channelGroups.map((group) => ({
    group,
    channels: textChannels.filter((c) => c.group_id === group.id),
  }));
  const groupedForum = channelGroups.map((group) => ({
    group,
    channels: forumChannels.filter((c) => c.group_id === group.id),
  }));
  const groupedVoice = channelGroups.map((group) => ({
    group,
    channels: voiceChannels.filter((c) => c.group_id === group.id),
  }));
  const ungroupedText = textChannels.filter((c) => !c.group_id);
  const ungroupedForum = forumChannels.filter((c) => !c.group_id);
  const ungroupedVoice = voiceChannels.filter((c) => !c.group_id);
  const pendingVoiceSwitchChannel = channels.find((c) => c.id === pendingVoiceSwitchChannelId);
  const isOwner = !!user && !!server && server.owner_id === user.id;
  const currentMember = members.find((m) => m.id === user?.id);
  const canManageChannels = isOwner || (currentMember?.role_permissions || []).includes("manage_channels");

  const handleTextChannelClick = (channelId: string) => {
    setActiveChannel(channelId);
    onNavigate?.();
  };

  const handleVoiceChannelClick = async (channelId: string) => {
    setActiveChannel(channelId);
    onNavigate?.();
    if (activeVoiceChannelId === channelId && isConnected) {
      return;
    }
    if (isConnected && activeVoiceChannelId && activeVoiceChannelId !== channelId) {
      setPendingVoiceSwitchChannelId(channelId);
      return;
    }
    await joinVoiceChannel(channelId);
  };

  const handleConfirmVoiceSwitch = async () => {
    if (!pendingVoiceSwitchChannelId || switchingVoiceChannel) return;
    setSwitchingVoiceChannel(true);
    await joinVoiceChannel(pendingVoiceSwitchChannelId);
    setSwitchingVoiceChannel(false);
    setPendingVoiceSwitchChannelId(null);
  };

  const handleLeaveServerRequest = () => {
    if (!user || !server || leaving) return;

    if (isOwner) {
      alert("You are the owner of this server. Transfer ownership or delete the server instead.");
      return;
    }
    setShowLeaveConfirm(true);
  };

  const handleLeaveServerConfirm = async () => {
    if (!user || !server || leaving) return;
    setLeaving(true);
    await supabase
      .from("server_members")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", user.id);
    await refreshServers();
    setShowLeaveConfirm(false);
    setLeaving(false);
  };

  return (
    <div className={`flex flex-col bg-channel-bar shrink-0 ${embedded ? "w-full h-full" : "w-60"}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full border-b border-border/50 transition-colors">
            {server?.banner_url ? (
              <div className="h-20 relative overflow-hidden">
                <img src={server.banner_url} alt={`${server.name} banner`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/65" />
                <div className="absolute bottom-0 left-0 right-0 h-11 px-4 flex items-center justify-between">
                  <span className="font-semibold text-white truncate">{server.name}</span>
                  <ChevronDown className="w-4 h-4 text-white/90 shrink-0" />
                </div>
              </div>
            ) : (
              <div className="h-12 px-4 flex items-center justify-between hover:bg-chat-hover">
                <span className="font-semibold text-foreground truncate">{server?.name || "Select a server"}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {canManageChannels && (
            <DropdownMenuItem
              onClick={() => {
                if (!activeServerId) return;
                navigate(`/servers/${activeServerId}/settings`);
                onNavigate?.();
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Server Settings</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShowInvite(true)} className="flex items-center gap-2 cursor-pointer">
            <UserPlus className="w-4 h-4" />
            <span>Invite People</span>
          </DropdownMenuItem>
          {!isOwner && (
            <DropdownMenuItem
              onClick={handleLeaveServerRequest}
              disabled={leaving}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              <span>{leaving ? "Leaving..." : "Leave Server"}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {(textChannels.length > 0 || groupedText.some((g) => g.channels.length > 0)) && (
          <div>
            <div className="px-1 mb-1">
              <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3 h-3" /> Text Channels
              </button>
            </div>

            {groupedText.filter(({ channels: groupChannels }) => groupChannels.length > 0).map(({ group, channels: groupChannels }) => (
              <div key={`text-${group.id}`} className="mb-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/90 mb-0.5">
                  {group.name}
                </div>
                {groupChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => handleTextChannelClick(ch.id)}
                    className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                      ch.id === activeChannelId ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                    }`}
                  >
                    <Hash className="w-4 h-4 shrink-0 opacity-70" />
                    <span
                      className={`truncate ${
                        ch.type === "text" && (unreadCountByChannel[ch.id] || 0) > 0 && ch.id !== activeChannelId
                          ? "font-semibold text-foreground"
                          : ""
                      }`}
                    >
                      {ch.name}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {ungroupedText.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleTextChannelClick(ch.id)}
                className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                  ch.id === activeChannelId ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <Hash className="w-4 h-4 shrink-0 opacity-70" />
                <span
                  className={`truncate ${
                    ch.type === "text" && (unreadCountByChannel[ch.id] || 0) > 0 && ch.id !== activeChannelId
                      ? "font-semibold text-foreground"
                      : ""
                  }`}
                >
                  {ch.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {(forumChannels.length > 0 || groupedForum.some((g) => g.channels.length > 0)) && (
          <div>
            <div className="px-1 mb-1">
              <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3 h-3" /> Forum Channels
              </button>
            </div>

            {groupedForum.filter(({ channels: groupChannels }) => groupChannels.length > 0).map(({ group, channels: groupChannels }) => (
              <div key={`forum-${group.id}`} className="mb-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/90 mb-0.5">
                  {group.name}
                </div>
                {groupChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => handleTextChannelClick(ch.id)}
                    className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                      ch.id === activeChannelId ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                    <span className={`truncate ${(unreadCountByChannel[ch.id] || 0) > 0 && ch.id !== activeChannelId ? "font-semibold text-foreground" : ""}`}>
                      {ch.name}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {ungroupedForum.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleTextChannelClick(ch.id)}
                className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                  ch.id === activeChannelId ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                <span className={`truncate ${(unreadCountByChannel[ch.id] || 0) > 0 && ch.id !== activeChannelId ? "font-semibold text-foreground" : ""}`}>
                  {ch.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {(voiceChannels.length > 0 || groupedVoice.some((g) => g.channels.length > 0)) && (
          <div>
            <div className="px-1 mb-1">
              <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3 h-3" /> Voice Channels
              </button>
            </div>

            {groupedVoice.filter(({ channels: groupChannels }) => groupChannels.length > 0).map(({ group, channels: groupChannels }) => (
              <div key={`voice-${group.id}`} className="mb-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/90 mb-0.5">
                  {group.name}
                </div>
                {groupChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => void handleVoiceChannelClick(ch.id)}
                    className={`group flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm border transition-all ${
                      ch.id === activeVoiceChannelId && isConnected
                        ? "border-primary/40 bg-gradient-to-r from-primary/15 to-secondary text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                    }`}
                  >
                    <Volume2 className={`w-4 h-4 shrink-0 ${ch.id === activeVoiceChannelId && isConnected ? "text-primary" : "opacity-70"}`} />
                    <span className="truncate">{ch.name}</span>
                    {ch.id === activeVoiceChannelId && isConnected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            ))}

            {ungroupedVoice.map((ch) => (
              <button
                key={ch.id}
                onClick={() => void handleVoiceChannelClick(ch.id)}
                className={`group flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm border transition-all ${
                  ch.id === activeVoiceChannelId && isConnected
                    ? "border-primary/40 bg-gradient-to-r from-primary/15 to-secondary text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <Volume2 className={`w-4 h-4 shrink-0 ${ch.id === activeVoiceChannelId && isConnected ? "text-primary" : "opacity-70"}`} />
                <span className="truncate ">{ch.name}</span>
                {ch.id === activeVoiceChannelId && isConnected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
                )}
              </button>
            ))}
          </div>
        )}

        {channels.length === 0 && activeServerId && (
          <div className="px-2">
            <p className="text-sm text-muted-foreground">No channels yet. Create one in Server Settings.</p>
          </div>
        )}

      </div>

      <BottomLeftDock embedded={embedded} expandIntoServerRail={!embedded} />

      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave server?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Are you sure you want to leave "${server?.name || "this server"}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleLeaveServerConfirm()}
              disabled={leaving}
            >
              {leaving ? "Leaving..." : "Leave Server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!pendingVoiceSwitchChannelId}
        onOpenChange={(open) => {
          if (!open && !switchingVoiceChannel) setPendingVoiceSwitchChannelId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch voice channel?</AlertDialogTitle>
            <AlertDialogDescription>
              {`You're currently in "${connectedVoice?.serverName ? `${connectedVoice.serverName} / ` : ""}${connectedVoice?.channelName || "a voice channel"}". Switch to "${pendingVoiceSwitchChannel?.name || "this channel"}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switchingVoiceChannel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmVoiceSwitch()}
              disabled={switchingVoiceChannel || !pendingVoiceSwitchChannelId}
            >
              {switchingVoiceChannel ? "Switching..." : "Switch Channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChannelSidebar;
