import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { Hash, Volume2, ChevronDown, Settings, Mic, Headphones, UserPlus, LogOut, PhoneOff } from "lucide-react";
import StatusIndicator from "./StatusIndicator";
import InviteDialog from "./InviteDialog";
import ProfileDialog from "./ProfileDialog";
import NotificationBell from "./NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useVoiceContext } from "@/context/VoiceContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const ChannelSidebar = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { activeServerId, activeChannelId, setActiveChannel, channels, channelGroups, servers, profile, members, refreshServers, unreadCountByChannel } = useChatContext();
  const { activeVoiceChannelId, isConnected, isMuted, isDeafened, voiceLatencyMs, joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } = useVoiceContext();
  const server = servers.find((s) => s.id === activeServerId);
  const [showInvite, setShowInvite] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingVoiceSwitchChannelId, setPendingVoiceSwitchChannelId] = useState<string | null>(null);
  const [switchingVoiceChannel, setSwitchingVoiceChannel] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const groupedText = channelGroups.map((group) => ({
    group,
    channels: textChannels.filter((c) => c.group_id === group.id),
  }));
  const groupedVoice = channelGroups.map((group) => ({
    group,
    channels: voiceChannels.filter((c) => c.group_id === group.id),
  }));
  const ungroupedText = textChannels.filter((c) => !c.group_id);
  const ungroupedVoice = voiceChannels.filter((c) => !c.group_id);
  const activeVoiceChannel = channels.find((c) => c.id === activeVoiceChannelId);
  const pendingVoiceSwitchChannel = channels.find((c) => c.id === pendingVoiceSwitchChannelId);
  const isOwner = !!user && !!server && server.owner_id === user.id;
  const currentMember = members.find((m) => m.id === user?.id);
  const canManageChannels = isOwner || (currentMember?.role_permissions || []).includes("manage_channels");
  const handleVoiceChannelClick = async (channelId: string) => {
    setActiveChannel(channelId);
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

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  };

  return (
    <div className="flex flex-col w-60 bg-channel-bar shrink-0">
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
              onClick={() => activeServerId && navigate(`/servers/${activeServerId}/settings`)}
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
                    onClick={() => setActiveChannel(ch.id)}
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
                onClick={() => setActiveChannel(ch.id)}
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

      {isConnected && activeVoiceChannel && (
        <div className="relative z-20 -ml-[72px] w-[calc(100%+72px)] px-2 pb-2">
          <div className="rounded-lg border border-border/50 bg-gradient-to-r from-server-bar via-secondary/20 to-server-bar px-2.5 py-2 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0 text-xs font-semibold text-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex w-6 h-6 rounded-md bg-primary/15 border border-primary/30 items-center justify-center">
                    <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  {voiceLatencyMs === null ? "Latency unavailable" : `Latency: ${voiceLatencyMs} ms`}
                </TooltipContent>
              </Tooltip>
              <span className="truncate leading-tight">
                Connected to voice: <span className="text-primary">#{activeVoiceChannel.name}</span>
              </span>
            </div>
            <button
              onClick={() => void leaveVoiceChannel()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Leave
            </button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div className="relative z-20 -ml-[72px] w-[calc(100%+72px)] h-[52px] px-2 bg-server-bar flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setShowProfile(true)} className="relative shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
              ) : (
                <span>{profile?.display_name?.slice(0, 2).toUpperCase() || "??"}</span>
              )}
            </div>
            <StatusIndicator status={(profile?.status as "online" | "idle" | "dnd" | "offline") || "online"} className="absolute -bottom-0.5 -right-0.5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate leading-tight">{profile?.display_name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight capitalize">{profile?.status || "Online"}</p>
          </div>
          <NotificationBell />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleMute}
            className={`p-1 transition-colors ${isMuted ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={toggleDeafen}
            className={`p-1 transition-colors ${isDeafened ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
            title={isDeafened ? "Undeafen" : "Deafen"}
          >
            <Headphones className="w-4 h-4" />
          </button>
          <button onClick={() => setShowProfile(true)} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Settings className="w-4 h-4" /></button>
          <button
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={signingOut ? "Signing out..." : "Log Out"}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />
      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
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
              {`You're currently in "${activeVoiceChannel?.name || "a voice channel"}". Switch to "${pendingVoiceSwitchChannel?.name || "this channel"}"?`}
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
