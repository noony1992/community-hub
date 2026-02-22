import { useEffect, useMemo, useState } from "react";
import { X, Shield, Clock3, MicOff, UserX, Ban, Hash, AlertTriangle, NotebookPen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
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
import { DialogListSkeleton } from "@/components/skeletons/AppSkeletons";

type TargetUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
};

interface UserModerationSidebarProps {
  open: boolean;
  onClose: () => void;
  serverId?: string;
  user: TargetUser;
}

type Permissions = {
  mod_menu: boolean;
  ban_users: boolean;
  kick_users: boolean;
  timeout_users: boolean;
  mute_users: boolean;
};

type UserHistoryMessage = {
  id: string;
  content: string;
  created_at: string;
  channel_id: string;
  channels?: { name: string; server_id: string } | null;
};

type ModerationNote = {
  id: string;
  note: string;
  created_at: string;
  author_id: string;
  author_name: string;
};

type ModerationWarning = {
  id: string;
  reason: string;
  created_at: string;
  expires_at: string | null;
  cleared_at: string | null;
  author_id: string;
  author_name: string;
};

const defaultPermissions: Permissions = {
  mod_menu: false,
  ban_users: false,
  kick_users: false,
  timeout_users: false,
  mute_users: false,
};

const UserModerationSidebar = ({ open, onClose, serverId, user }: UserModerationSidebarProps) => {
  const { user: currentUser } = useAuth();
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [messagesSent, setMessagesSent] = useState<number>(0);
  const [recentMessages, setRecentMessages] = useState<UserHistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [timedOutUntil, setTimedOutUntil] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [isTargetOwner, setIsTargetOwner] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [warningReason, setWarningReason] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [warnings, setWarnings] = useState<ModerationWarning[]>([]);
  const [notes, setNotes] = useState<ModerationNote[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<null | { type: "kick" } | { type: "ban"; days: number | null; label: string }>(null);

  const canModerate = useMemo(
    () => permissions.ban_users || permissions.kick_users || permissions.timeout_users || permissions.mute_users,
    [permissions],
  );
  const canOpenModMenu = permissions.mod_menu;
  const canActOnTarget = !!serverId && !!currentUser && currentUser.id !== user.id && !isTargetOwner;

  const logAudit = async (action: string, metadata: Record<string, unknown> = {}) => {
    if (!serverId || !currentUser) return;
    await supabase.from("moderation_audit_logs").insert({
      server_id: serverId,
      actor_id: currentUser.id,
      target_user_id: user.id,
      action,
      metadata,
    });
  };

  const loadData = async () => {
    if (!open || !currentUser || !serverId) return;
    setLoading(true);

    await supabase.rpc("expire_moderation_punishments", { _server_id: serverId });

    const permissionKeys = Object.keys(defaultPermissions) as Array<keyof Permissions>;
    const permissionPairs = await Promise.all(
      permissionKeys.map(async (key) => {
        const { data } = await supabase.rpc("has_server_permission", {
          _server_id: serverId,
          _user_id: currentUser.id,
          _permission: key,
        });
        return [key, !!data] as const;
      }),
    );
    const nextPermissions = permissionPairs.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), defaultPermissions);
    setPermissions(nextPermissions);

    const { data: serverData } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", serverId)
      .maybeSingle();
    setIsTargetOwner(!!serverData && serverData.owner_id === user.id);

    const { data: membership } = await supabase
      .from("server_members")
      .select("role, muted_until, timed_out_until")
      .eq("server_id", serverId)
      .eq("user_id", user.id)
      .maybeSingle();
    setTargetRole(membership?.role || null);
    setMutedUntil(membership?.muted_until || null);
    setTimedOutUntil(membership?.timed_out_until || null);

    const { count } = await supabase
      .from("messages")
      .select("id, channels!inner(server_id)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("channels.server_id", serverId);
    setMessagesSent(count || 0);

    const { data: messageRows } = await supabase
      .from("messages")
      .select("id, content, created_at, channel_id, channels!inner(name, server_id)")
      .eq("user_id", user.id)
      .eq("channels.server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(25);
    setRecentMessages((messageRows || []) as unknown as UserHistoryMessage[]);

    const { data: noteRows } = await supabase
      .from("user_moderation_notes")
      .select("id, note, created_at, author_id")
      .eq("server_id", serverId)
      .eq("target_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: warningRows } = await supabase
      .from("user_moderation_warnings")
      .select("id, reason, created_at, expires_at, cleared_at, author_id")
      .eq("server_id", serverId)
      .eq("target_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const profileIds = Array.from(
      new Set(
        [...(noteRows || []).map((n) => n.author_id), ...(warningRows || []).map((w) => w.author_id)].filter(Boolean),
      ),
    );
    const { data: authors } = profileIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
      : { data: [] as Array<{ id: string; display_name: string }> };
    const authorMap = new Map((authors || []).map((row) => [row.id, row.display_name]));

    setNotes(
      (noteRows || []).map((row) => ({
        id: row.id,
        note: row.note,
        created_at: row.created_at,
        author_id: row.author_id,
        author_name: authorMap.get(row.author_id) || "Unknown mod",
      })),
    );

    setWarnings(
      (warningRows || []).map((row) => ({
        id: row.id,
        reason: row.reason,
        created_at: row.created_at,
        expires_at: row.expires_at,
        cleared_at: row.cleared_at,
        author_id: row.author_id,
        author_name: authorMap.get(row.author_id) || "Unknown mod",
      })),
    );

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.id, serverId, user.id]);

  const handleTimeout = async (minutes: number | null) => {
    if (!serverId || !permissions.timeout_users || !canActOnTarget) return;
    setActionLoading("timeout");
    const next = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    const { error } = await supabase
      .from("server_members")
      .update({ timed_out_until: next })
      .eq("server_id", serverId)
      .eq("user_id", user.id);
    setActionLoading(null);
    if (error) {
      alert(`Failed to update timeout: ${error.message}`);
      return;
    }
    await logAudit(minutes ? "timeout_user" : "clear_timeout", { minutes, expires_at: next });
    setTimedOutUntil(next);
  };

  const handleMute = async (minutes: number | null) => {
    if (!serverId || !permissions.mute_users || !canActOnTarget) return;
    setActionLoading("mute");
    const next = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    const { error } = await supabase
      .from("server_members")
      .update({ muted_until: next })
      .eq("server_id", serverId)
      .eq("user_id", user.id);
    setActionLoading(null);
    if (error) {
      alert(`Failed to update mute: ${error.message}`);
      return;
    }
    await logAudit(minutes ? "mute_user" : "unmute_user", { minutes, expires_at: next });
    setMutedUntil(next);
  };

  const handleKick = () => {
    if (!serverId || !permissions.kick_users || !canActOnTarget) return;
    setPendingConfirm({ type: "kick" });
  };

  const handleKickConfirm = async () => {
    if (!serverId || !permissions.kick_users || !canActOnTarget) return;
    setActionLoading("kick");
    const { error } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", user.id);
    setActionLoading(null);
    if (error) {
      alert(`Failed to kick user: ${error.message}`);
      return;
    }
  };

  const handleBan = (days: number | null) => {
    if (!serverId || !permissions.ban_users || !currentUser || !canActOnTarget) return;
    const label = days ? `${days} day ban` : "permanent ban";
    setPendingConfirm({ type: "ban", days, label });
  };

  const handleBanConfirm = async (days: number | null) => {
    if (!serverId || !permissions.ban_users || !currentUser || !canActOnTarget) return;
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    setActionLoading(days ? "temp-ban" : "ban");
    const { error: banError } = await supabase.from("server_bans").insert({
      server_id: serverId,
      banned_user_id: user.id,
      banned_by: currentUser.id,
      reason: banReason.trim() || null,
      expires_at: expiresAt,
    });
    if (banError) {
      setActionLoading(null);
      alert(`Failed to ban user: ${banError.message}`);
      return;
    }

    await logAudit(days ? "temp_ban_user" : "ban_user", {
      source: "user_moderation_sidebar",
      reason: banReason.trim() || null,
      expires_at: expiresAt,
    });

    await supabase
      .from("server_members")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", user.id);

    setBanReason("");
    setActionLoading(null);
  };

  const handleWarn = async (expiresDays: number | null) => {
    if (!serverId || !currentUser || !canActOnTarget || !canOpenModMenu) return;
    const reason = warningReason.trim();
    if (!reason) {
      alert("Warning reason is required.");
      return;
    }
    setActionLoading("warn");
    const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : null;
    const { data, error } = await supabase
      .from("user_moderation_warnings")
      .insert({
        server_id: serverId,
        target_user_id: user.id,
        author_id: currentUser.id,
        reason,
        expires_at: expiresAt,
      })
      .select("id, reason, created_at, expires_at, cleared_at, author_id")
      .single();
    setActionLoading(null);
    if (error || !data) {
      alert(`Failed to issue warning: ${error?.message || "Unknown error"}`);
      return;
    }
    await logAudit("warn_user", { reason, expires_at: expiresAt });
    setWarnings((prev) => [
      {
        id: data.id,
        reason: data.reason,
        created_at: data.created_at,
        expires_at: data.expires_at,
        cleared_at: data.cleared_at,
        author_id: data.author_id,
        author_name: currentUser.user_metadata?.display_name || "You",
      },
      ...prev,
    ]);
    setWarningReason("");
  };

  const handleAddNote = async () => {
    if (!serverId || !currentUser || !canActOnTarget || !canOpenModMenu) return;
    const note = noteInput.trim();
    if (!note) {
      alert("Moderator note cannot be empty.");
      return;
    }
    setActionLoading("note");
    const { data, error } = await supabase
      .from("user_moderation_notes")
      .insert({
        server_id: serverId,
        target_user_id: user.id,
        author_id: currentUser.id,
        note,
      })
      .select("id, note, created_at, author_id")
      .single();
    setActionLoading(null);
    if (error || !data) {
      alert(`Failed to add note: ${error?.message || "Unknown error"}`);
      return;
    }
    await logAudit("add_mod_note", { note });
    setNotes((prev) => [
      {
        id: data.id,
        note: data.note,
        created_at: data.created_at,
        author_id: data.author_id,
        author_name: currentUser.user_metadata?.display_name || "You",
      },
      ...prev,
    ]);
    setNoteInput("");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70]"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[440px] max-w-full bg-card border-l border-border shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Moderation</p>
            <h2 className="text-base font-semibold text-foreground">{user.display_name}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!serverId && (
            <div className="text-sm text-muted-foreground rounded-md border border-border p-3">
              Open this menu from a server context to run moderation actions.
            </div>
          )}
          {serverId && !loading && !canOpenModMenu && (
            <div className="text-sm text-muted-foreground rounded-md border border-border p-3">
              You do not have permission to open the moderation menu.
            </div>
          )}

          <div className="rounded-md border border-border p-3 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">User Info</p>
            <p className="text-sm text-foreground">@{user.username}</p>
            {targetRole && <p className="text-sm text-muted-foreground">Role: <span className="text-foreground">{targetRole}</span></p>}
            <p className="text-sm text-muted-foreground">Messages sent: <span className="text-foreground">{messagesSent}</span></p>
            {timedOutUntil && <p className="text-sm text-muted-foreground">Timed out until: <span className="text-foreground">{new Date(timedOutUntil).toLocaleString()}</span></p>}
            {mutedUntil && <p className="text-sm text-muted-foreground">Muted until: <span className="text-foreground">{new Date(mutedUntil).toLocaleString()}</span></p>}
          </div>

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
                <button
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
              {!canModerate && (
                <p className="text-sm text-muted-foreground">You do not have moderation permissions for this server.</p>
              )}
              {!canActOnTarget && serverId && canModerate && (
                <p className="text-sm text-muted-foreground">You cannot moderate this user (self or server owner).</p>
              )}

              {permissions.timeout_users && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => void handleTimeout(10)}
                    disabled={!canActOnTarget || actionLoading === "timeout"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Clock3 className="w-3.5 h-3.5" />
                    Timeout 10m
                  </button>
                  <button
                    onClick={() => void handleTimeout(60)}
                    disabled={!canActOnTarget || actionLoading === "timeout"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
                  >
                    Timeout 1h
                  </button>
                  <button
                    onClick={() => void handleTimeout(null)}
                    disabled={!canActOnTarget || actionLoading === "timeout"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
                  >
                    Clear Timeout
                  </button>
                </div>
              )}

              {permissions.mute_users && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => void handleMute(30)}
                    disabled={!canActOnTarget || actionLoading === "mute"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <MicOff className="w-3.5 h-3.5" />
                    Mute 30m
                  </button>
                  <button
                    onClick={() => void handleMute(180)}
                    disabled={!canActOnTarget || actionLoading === "mute"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
                  >
                    Mute 3h
                  </button>
                  <button
                    onClick={() => void handleMute(null)}
                    disabled={!canActOnTarget || actionLoading === "mute"}
                    className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
                  >
                    Unmute
                  </button>
                </div>
              )}

              {permissions.kick_users && (
                <button
                  onClick={handleKick}
                  disabled={!canActOnTarget || actionLoading === "kick"}
                  className="px-2 py-1 text-xs rounded-md bg-destructive/10 text-destructive disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Kick User
                </button>
              )}

              {permissions.ban_users && (
                <div className="rounded-md border border-border p-2 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ban</p>
                  <input
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Ban reason (optional)"
                    className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleBan(1)}
                      disabled={!canActOnTarget || actionLoading === "temp-ban"}
                      className="px-2 py-1 text-xs rounded-md bg-destructive/10 text-destructive disabled:opacity-50"
                    >
                      Ban 1d
                    </button>
                    <button
                      onClick={() => handleBan(7)}
                      disabled={!canActOnTarget || actionLoading === "temp-ban"}
                      className="px-2 py-1 text-xs rounded-md bg-destructive/10 text-destructive disabled:opacity-50"
                    >
                      Ban 7d
                    </button>
                    <button
                      onClick={() => handleBan(null)}
                      disabled={!canActOnTarget || actionLoading === "ban"}
                      className="px-2 py-1 text-xs rounded-md bg-destructive text-destructive-foreground disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Permanent Ban
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Warning System</p>
              <input
                value={warningReason}
                onChange={(e) => setWarningReason(e.target.value)}
                placeholder="Warning reason"
                className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => void handleWarn(null)}
                  disabled={!canActOnTarget || actionLoading === "warn"}
                  className="px-2 py-1 text-xs rounded-md bg-amber-500/20 text-amber-700 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Permanent Warning
                </button>
                <button
                  onClick={() => void handleWarn(30)}
                  disabled={!canActOnTarget || actionLoading === "warn"}
                  className="px-2 py-1 text-xs rounded-md bg-amber-500/20 text-amber-700 disabled:opacity-50"
                >
                  Warning 30d
                </button>
              </div>
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Moderator Notes</p>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add private moderator note"
                rows={3}
                className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs resize-y"
              />
              <button
                onClick={() => void handleAddNote()}
                disabled={!canActOnTarget || actionLoading === "note"}
                className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50 inline-flex items-center gap-1"
              >
                <NotebookPen className="w-3.5 h-3.5" />
                Add Note
              </button>
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Warning History</p>
              {warnings.length === 0 && <p className="text-sm text-muted-foreground">No warnings for this user.</p>}
              {warnings.map((warning) => {
                const isActive = !warning.cleared_at && (!warning.expires_at || new Date(warning.expires_at).getTime() > Date.now());
                return (
                  <div key={warning.id} className="rounded-md bg-secondary/40 px-2 py-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{warning.author_name}</span>
                      <span>{formatDistanceToNow(new Date(warning.created_at), { addSuffix: true })}</span>
                    </div>
                    <p className="text-xs text-foreground mt-0.5">{warning.reason}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {warning.expires_at ? `Expires ${new Date(warning.expires_at).toLocaleString()}` : "No expiry"} | {isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Note History</p>
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No moderator notes for this user.</p>}
              {notes.map((note) => (
                <div key={note.id} className="rounded-md bg-secondary/40 px-2 py-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{note.author_name}</span>
                    <span>{formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent Chat History</p>
              {loading && <DialogListSkeleton rows={3} />}
              {!loading && recentMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent messages found.</p>
              )}
              {recentMessages.map((message) => (
                <div key={message.id} className="rounded-md bg-secondary/40 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Hash className="w-3 h-3" />
                    <span>{message.channels?.name || "unknown-channel"}</span>
                    <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 line-clamp-3">{message.content || <span className="italic text-muted-foreground">[empty]</span>}</p>
                </div>
              ))}
            </div>
          )}

          {canOpenModMenu && (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5" />
                Permission Snapshot
              </div>
              <p>mod menu: {permissions.mod_menu ? "yes" : "no"} | ban: {permissions.ban_users ? "yes" : "no"} | kick: {permissions.kick_users ? "yes" : "no"} | timeout: {permissions.timeout_users ? "yes" : "no"} | mute: {permissions.mute_users ? "yes" : "no"}</p>
            </div>
          )}
        </div>
      </aside>
      <AlertDialog
        open={!!pendingConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.type === "kick" ? "Kick user?" : "Apply ban?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.type === "kick"
                ? `Kick ${user.display_name} from this server?`
                : `Apply ${pendingConfirm?.type === "ban" ? pendingConfirm.label : "ban"} to ${user.display_name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!actionLoading}
              onClick={() => {
                if (pendingConfirm?.type === "kick") {
                  void handleKickConfirm();
                } else if (pendingConfirm?.type === "ban") {
                  void handleBanConfirm(pendingConfirm.days);
                }
                setPendingConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserModerationSidebar;
