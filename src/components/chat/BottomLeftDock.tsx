import { useState } from "react";
import { Headphones, LogOut, Mic, PhoneOff, ScreenShare, ScreenShareOff, Settings, Video, VideoOff, Volume2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { useVoiceContext } from "@/context/VoiceContext";
import NotificationBell from "./NotificationBell";
import ProfileDialog from "./ProfileDialog";
import StatusIndicator from "./StatusIndicator";
import VoiceSettingsDialog from "./VoiceSettingsDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type BottomLeftDockProps = {
  embedded?: boolean;
  expandIntoServerRail?: boolean;
};

const BottomLeftDock = ({ embedded = false, expandIntoServerRail = false }: BottomLeftDockProps) => {
  const { profile } = useChatContext();
  const { signOut } = useAuth();
  const {
    connectedVoice,
    isConnected,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    voiceLatencyMs,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
  } = useVoiceContext();
  const [showProfile, setShowProfile] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const voiceWrapperClass = embedded
    ? "px-2 pb-2"
    : expandIntoServerRail
      ? "relative z-20 -ml-[72px] w-[calc(100%+72px)] px-2 pb-2"
      : "px-2 pb-2";
  const panelWrapperClass = embedded
    ? "h-[52px] px-2 bg-server-bar flex items-center justify-between"
    : expandIntoServerRail
      ? "relative z-20 -ml-[72px] w-[calc(100%+72px)] h-[52px] px-2 bg-server-bar flex items-center justify-between"
      : "h-[52px] px-2 bg-server-bar flex items-center justify-between";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  };

  return (
    <>
      {isConnected && connectedVoice && (
        <div className={voiceWrapperClass}>
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
              <div className="min-w-0 leading-tight">
                <p className="truncate">
                  Connected to voice
                </p>
                <p className="truncate text-primary">
                  {connectedVoice.serverName ? `${connectedVoice.serverName} / ` : ""}#{connectedVoice.channelName}
                </p>
              </div>
              {isCameraOn && (
                <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <Video className="w-3 h-3" />
                  Camera
                </span>
              )}
              {isScreenSharing && (
                <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <ScreenShare className="w-3 h-3" />
                  Screen
                </span>
              )}
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

      <div className={panelWrapperClass}>
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
          <button
            onClick={() => void toggleCamera()}
            disabled={!isConnected}
            className={`p-1 transition-colors disabled:opacity-40 ${
              isCameraOn ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            title={isCameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {isCameraOn ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>
          <button
            onClick={() => void toggleScreenShare()}
            disabled={!isConnected}
            className={`p-1 transition-colors disabled:opacity-40 ${
              isScreenSharing ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            title={isScreenSharing ? "Stop screen share" : "Share screen"}
          >
            {isScreenSharing ? <ScreenShareOff className="w-4 h-4" /> : <ScreenShare className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowVoiceSettings(true)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Voice settings">
            <Settings className="w-4 h-4" />
          </button>
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

      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
      <VoiceSettingsDialog open={showVoiceSettings} onOpenChange={setShowVoiceSettings} />
    </>
  );
};

export default BottomLeftDock;
