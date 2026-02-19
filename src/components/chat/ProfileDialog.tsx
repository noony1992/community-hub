import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatContext } from "@/context/ChatContext";
import { X, User, Bell } from "lucide-react";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

const statusOptions = [
  { value: "online", label: "Online", color: "bg-status-online" },
  { value: "idle", label: "Idle", color: "bg-status-idle" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-status-dnd" },
  { value: "offline", label: "Invisible", color: "bg-status-offline" },
];

const ProfileDialog = ({ open, onClose }: ProfileDialogProps) => {
  const { profile, refreshProfile, activeServerId, activeChannelId, servers, channels } = useChatContext();
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("online");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionOnly, setMentionOnly] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [quietHoursTimezone, setQuietHoursTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [serverMuted, setServerMuted] = useState(false);
  const [channelMuted, setChannelMuted] = useState(false);
  const [loadingNotificationSettings, setLoadingNotificationSettings] = useState(false);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  useEffect(() => {
    if (!open || !profile) return;
    {
      setDisplayName(profile.display_name);
      setStatus(profile.status);
    }
  }, [open, profile?.id]);

  useEffect(() => {
    const loadNotificationSettings = async () => {
      if (!open || !profile) return;
      setLoadingNotificationSettings(true);
      const { data: settings } = await supabase
        .from("user_notification_settings")
        .select("mention_only, keyword_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
        .eq("user_id", profile.id)
        .maybeSingle();

      setMentionOnly(!!settings?.mention_only);
      setKeywordsInput((settings?.keyword_alerts || []).join(", "));
      setQuietHoursEnabled(!!settings?.quiet_hours_enabled);
      setQuietHoursStart(settings?.quiet_hours_start?.slice(0, 5) || "22:00");
      setQuietHoursEnd(settings?.quiet_hours_end?.slice(0, 5) || "07:00");
      setQuietHoursTimezone(settings?.quiet_hours_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

      const scopeFilters: string[] = [];
      if (activeServerId) scopeFilters.push(`and(scope_type.eq.server,scope_id.eq.${activeServerId})`);
      if (activeChannelId) scopeFilters.push(`and(scope_type.eq.channel,scope_id.eq.${activeChannelId})`);

      if (scopeFilters.length > 0) {
        const { data: mutes } = await supabase
          .from("user_notification_mutes")
          .select("scope_type, scope_id")
          .eq("user_id", profile.id)
          .or(scopeFilters.join(","));

        setServerMuted(!!activeServerId && (mutes || []).some((m) => m.scope_type === "server" && m.scope_id === activeServerId));
        setChannelMuted(!!activeChannelId && (mutes || []).some((m) => m.scope_type === "channel" && m.scope_id === activeChannelId));
      } else {
        setServerMuted(false);
        setChannelMuted(false);
      }
      setLoadingNotificationSettings(false);
    };

    void loadNotificationSettings();
  }, [activeChannelId, activeServerId, open, profile?.id]);

  const toggleMuteScope = async (scopeType: "server" | "channel", scopeId: string, muted: boolean) => {
    if (!profile) return;
    if (muted) {
      await supabase.from("user_notification_mutes").upsert(
        { user_id: profile.id, scope_type: scopeType, scope_id: scopeId },
        { onConflict: "user_id,scope_type,scope_id" },
      );
    } else {
      await supabase
        .from("user_notification_mutes")
        .delete()
        .eq("user_id", profile.id)
        .eq("scope_type", scopeType)
        .eq("scope_id", scopeId);
    }
  };

  const handleSave = async () => {
    if (!profile || !displayName.trim()) return;
    setLoading(true);
    await supabase.from("profiles").update({
      display_name: displayName.trim(),
      status,
    }).eq("id", profile.id);

    const keywordAlerts = Array.from(new Set(
      keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => !!k),
    ));
    await supabase.from("user_notification_settings").upsert(
      {
        user_id: profile.id,
        mention_only: mentionOnly,
        keyword_alerts: keywordAlerts,
        quiet_hours_enabled: quietHoursEnabled,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
        quiet_hours_timezone: quietHoursTimezone || "UTC",
      },
      { onConflict: "user_id" },
    );

    if (activeServerId) {
      await toggleMuteScope("server", activeServerId, serverMuted);
    }
    if (activeChannelId) {
      await toggleMuteScope("channel", activeChannelId, channelMuted);
    }

    await refreshProfile();
    setLoading(false);
    onClose();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;

    let bucket = "profile-avatars";
    let { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);

    // Fallback when profile-avatars bucket/policies are not yet migrated.
    if (uploadError) {
      bucket = "chat-attachments";
      ({ error: uploadError } = await supabase.storage.from(bucket).upload(path, file));
    }

    if (uploadError) {
      alert(`Failed to upload avatar: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: data.publicUrl })
      .eq("id", profile.id);

    if (updateError) {
      alert(`Failed to save avatar: ${updateError.message}`);
      setUploading(false);
      return;
    }

    await refreshProfile();
    setUploading(false);
    e.target.value = "";
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    setUploading(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    if (error) {
      alert(`Failed to remove avatar: ${error.message}`);
      setUploading(false);
      return;
    }
    await refreshProfile();
    setUploading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Edit Profile
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Avatar</label>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-secondary flex items-center justify-center text-sm font-semibold text-foreground">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{(profile?.display_name || "U").slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="flex gap-2">
              <label className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs cursor-pointer hover:opacity-90">
                {uploading ? "Uploading..." : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
              {profile?.avatar_url && (
                <button
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-md bg-background text-foreground border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Status</label>
          <div className="space-y-1">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                  status === opt.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-chat-hover hover:text-foreground"
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${opt.color}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-md border border-border/60 p-3 bg-secondary/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" />
            Notification Settings
          </p>
          {loadingNotificationSettings ? (
            <p className="text-xs text-muted-foreground">Loading notification settings...</p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center justify-between text-xs">
                <span className="text-foreground">Mention-only mode</span>
                <input type="checkbox" checked={mentionOnly} onChange={(e) => setMentionOnly(e.target.checked)} />
              </label>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Keyword alerts (comma-separated)</label>
                <input
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="e.g. jackpot, promo, tournament"
                  className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs"
                />
              </div>

              <label className="flex items-center justify-between text-xs">
                <span className="text-foreground">Quiet hours</span>
                <input type="checkbox" checked={quietHoursEnabled} onChange={(e) => setQuietHoursEnabled(e.target.checked)} />
              </label>

              {quietHoursEnabled && (
                <div className="grid grid-cols-3 gap-2">
                  <input type="time" value={quietHoursStart} onChange={(e) => setQuietHoursStart(e.target.value)} className="px-2 py-1.5 rounded-md bg-background border border-border text-xs" />
                  <input type="time" value={quietHoursEnd} onChange={(e) => setQuietHoursEnd(e.target.value)} className="px-2 py-1.5 rounded-md bg-background border border-border text-xs" />
                  <input value={quietHoursTimezone} onChange={(e) => setQuietHoursTimezone(e.target.value)} placeholder="Timezone" className="px-2 py-1.5 rounded-md bg-background border border-border text-xs" />
                </div>
              )}

              {activeServerId && (
                <label className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Mute server {activeServer?.name ? `(${activeServer.name})` : ""}</span>
                  <input type="checkbox" checked={serverMuted} onChange={(e) => setServerMuted(e.target.checked)} />
                </label>
              )}

              {activeChannelId && activeChannel?.type === "text" && (
                <label className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Mute channel #{activeChannel.name}</span>
                  <input type="checkbox" checked={channelMuted} onChange={(e) => setChannelMuted(e.target.checked)} />
                </label>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={loading || uploading || loadingNotificationSettings || !displayName.trim()}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default ProfileDialog;
