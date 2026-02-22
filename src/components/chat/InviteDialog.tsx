import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { Copy, Check, Link, X, Trash2, RefreshCcw } from "lucide-react";
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

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
}

type InviteRow = {
  id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  assigned_role: string | null;
};

type ServerRole = {
  id: string;
  name: string;
};

const InviteDialog = ({ open, onClose }: InviteDialogProps) => {
  const { user } = useAuth();
  const { activeServerId } = useChatContext();
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [profileNamesById, setProfileNamesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);
  const [canManageInvites, setCanManageInvites] = useState(false);
  const [basicInviteCode, setBasicInviteCode] = useState<string | null>(null);
  const [basicInviteRole, setBasicInviteRole] = useState<string>("member");

  const [oneTime, setOneTime] = useState(false);
  const [expiresHours, setExpiresHours] = useState<string>("24");
  const [maxUses, setMaxUses] = useState<string>("0");
  const [assignedRole, setAssignedRole] = useState<string>("");

  const isInviteActive = (invite: InviteRow) => {
    const expired = !!invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now();
    const depleted = invite.max_uses != null && invite.uses >= invite.max_uses;
    return !expired && !depleted;
  };

  const loadData = async () => {
    if (!open || !activeServerId) return;
    setLoading(true);
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: permission } = await supabase.rpc("has_server_permission", {
      _server_id: activeServerId,
      _user_id: user.id,
      _permission: "manage_invites",
    });
    const canManage = !!permission;
    setCanManageInvites(canManage);

    const { data: membership } = user
      ? await supabase
          .from("server_members")
          .select("role")
          .eq("server_id", activeServerId)
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };
    const membershipRole = membership?.role || "member";
    const currentRole = membershipRole === "owner" ? "member" : membershipRole;
    setBasicInviteRole(currentRole);

    if (!canManage) {
      const { data: personalInvites } = await supabase
        .from("invite_codes")
        .select("id, code, created_by, created_at, expires_at, max_uses, uses, assigned_role")
        .eq("server_id", activeServerId)
        .eq("created_by", user.id)
        .eq("assigned_role", currentRole)
        .order("created_at", { ascending: false })
        .limit(25);

      const existing = ((personalInvites || []) as InviteRow[]).find((invite) => isInviteActive(invite));
      if (existing) {
        setBasicInviteCode(existing.code);
        setLoading(false);
        return;
      }

      const { data: created, error } = await supabase
        .from("invite_codes")
        .insert({
          server_id: activeServerId,
          created_by: user.id,
          assigned_role: currentRole,
        })
        .select("code")
        .single();

      if (error) {
        alert(`Failed to generate invite: ${error.message}`);
      }
      setBasicInviteCode(created?.code || null);
      setLoading(false);
      return;
    }

    const { data: inviteRows } = await supabase
      .from("invite_codes")
      .select("id, code, created_by, created_at, expires_at, max_uses, uses, assigned_role")
      .eq("server_id", activeServerId)
      .order("created_at", { ascending: false });

    const rows = (inviteRows || []) as InviteRow[];
    setInvites(rows);

    const creatorIds = Array.from(new Set(rows.map((r) => r.created_by)));
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", creatorIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p) => {
        map[p.id] = p.display_name;
      });
      setProfileNamesById(map);
    } else {
      setProfileNamesById({});
    }

    const { data: roleRows } = await supabase
      .from("server_roles")
      .select("id, name")
      .eq("server_id", activeServerId)
      .order("position", { ascending: false })
      .order("created_at", { ascending: true });
    setRoles((roleRows || []) as ServerRole[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeServerId, user?.id]);

  const analytics = useMemo(() => {
    const total = invites.length;
    const totalUses = invites.reduce((sum, invite) => sum + (invite.uses || 0), 0);
    const active = invites.filter((invite) => isInviteActive(invite)).length;
    const oneTimeCount = invites.filter((invite) => invite.max_uses === 1).length;
    const roleLimitedCount = invites.filter((invite) => !!invite.assigned_role).length;
    return { total, totalUses, active, oneTimeCount, roleLimitedCount };
  }, [invites]);

  const handleCreateInvite = async () => {
    if (!activeServerId || !user || !canManageInvites) return;
    setCreating(true);
    const parsedExpiryHours = Number(expiresHours);
    const expiresAt =
      Number.isFinite(parsedExpiryHours) && parsedExpiryHours > 0
        ? new Date(Date.now() + parsedExpiryHours * 60 * 60 * 1000).toISOString()
        : null;
    const parsedMaxUses = Number(maxUses);
    const inviteMaxUses = oneTime ? 1 : (Number.isFinite(parsedMaxUses) && parsedMaxUses > 0 ? parsedMaxUses : null);

    const { error } = await supabase.from("invite_codes").insert({
      server_id: activeServerId,
      created_by: user.id,
      expires_at: expiresAt,
      max_uses: inviteMaxUses,
      assigned_role: assignedRole || null,
    });
    setCreating(false);
    if (error) {
      alert(`Failed to create invite: ${error.message}`);
      return;
    }
    await loadData();
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleRevoke = async (inviteId: string) => {
    if (!canManageInvites) return;
    setRevokingId(inviteId);
    const { error } = await supabase.from("invite_codes").delete().eq("id", inviteId);
    setRevokingId(null);
    if (error) {
      alert(`Failed to revoke invite: ${error.message}`);
      return;
    }
    setInvites((prev) => prev.filter((row) => row.id !== inviteId));
  };

  const handleRevokeAllRequest = () => {
    if (!activeServerId || !canManageInvites || revokingAll) return;
    setShowRevokeAllConfirm(true);
  };

  const handleRevokeAllConfirm = async () => {
    if (!activeServerId || !canManageInvites) return;
    setRevokingAll(true);
    const { error } = await supabase.from("invite_codes").delete().eq("server_id", activeServerId);
    setRevokingAll(false);
    setShowRevokeAllConfirm(false);
    if (error) {
      alert(`Failed to revoke all invites: ${error.message}`);
      return;
    }
    setInvites([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-[780px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Link className="w-5 h-5 text-primary" />
            {canManageInvites ? "Invite Management" : "Invite Code"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && <DialogListSkeleton rows={4} />}

        {!loading && !canManageInvites && (
          <div className="rounded-md border border-border p-4">
            <p className="text-sm text-muted-foreground mb-3">
              You do not have invite-management permission. You can share your role invite code.
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Assigned Role</p>
            <p className="text-sm text-foreground mb-3">{basicInviteRole}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-foreground font-mono text-sm select-all">
                {basicInviteCode || "Unable to generate invite code"}
              </div>
              <button
                onClick={() => basicInviteCode && void handleCopy(basicInviteCode)}
                disabled={!basicInviteCode}
                className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
              >
                {copiedCode === basicInviteCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedCode === basicInviteCode ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {!loading && canManageInvites && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Invites</p>
                <p className="text-lg font-semibold">{analytics.total}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</p>
                <p className="text-lg font-semibold">{analytics.active}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Uses</p>
                <p className="text-lg font-semibold">{analytics.totalUses}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">One-Time</p>
                <p className="text-lg font-semibold">{analytics.oneTimeCount}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Role-Limited</p>
                <p className="text-lg font-semibold">{analytics.roleLimitedCount}</p>
              </div>
            </div>

            <div className="rounded-md border border-border p-3 mb-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Create Invite</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={oneTime}
                    onChange={(e) => setOneTime(e.target.checked)}
                    className="rounded border-border"
                  />
                  One-time invite
                </label>
                <input
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(e.target.value)}
                  placeholder="Expires in hours (0=never)"
                  className="px-2 py-1.5 rounded-md bg-background border border-border text-sm"
                />
                <input
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Max uses (0=unlimited)"
                  disabled={oneTime}
                  className="px-2 py-1.5 rounded-md bg-background border border-border text-sm disabled:opacity-50"
                />
                <select
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value)}
                  className="px-2 py-1.5 rounded-md bg-background border border-border text-sm"
                >
                  <option value="">Default role (member)</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleCreateInvite()}
                  disabled={creating}
                  className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Invite"}
                </button>
                <button
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  onClick={handleRevokeAllRequest}
                  disabled={revokingAll || invites.length === 0}
                  className="ml-auto px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {revokingAll ? "Revoking..." : "Revoke All"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Invite Codes</p>
              {invites.length === 0 && <p className="text-sm text-muted-foreground">No invites yet.</p>}
              {invites.length > 0 && (
                <div className="space-y-2">
                  {invites.map((invite) => {
                    const expired = !!invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now();
                    const depleted = invite.max_uses != null && invite.uses >= invite.max_uses;
                    return (
                      <div key={invite.id} className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm text-foreground truncate">{invite.code}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Created by {profileNamesById[invite.created_by] || "Unknown"} on {new Date(invite.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => void handleCopy(invite.code)}
                              className="px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs inline-flex items-center gap-1"
                            >
                              {copiedCode === invite.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedCode === invite.code ? "Copied" : "Copy"}
                            </button>
                            <button
                              onClick={() => void handleRevoke(invite.id)}
                              disabled={revokingId === invite.id}
                              className="px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {revokingId === invite.id ? "Revoking..." : "Revoke"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Uses: {invite.uses}{invite.max_uses != null ? ` / ${invite.max_uses}` : " / unlimited"} |{" "}
                          Expiry: {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "never"} |{" "}
                          Role: {invite.assigned_role || "member"} |{" "}
                          Status: {expired ? "expired" : depleted ? "depleted" : "active"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        <AlertDialog open={showRevokeAllConfirm} onOpenChange={setShowRevokeAllConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke all invites?</AlertDialogTitle>
              <AlertDialogDescription>
                This will deactivate all invite codes for this server.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={revokingAll}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleRevokeAllConfirm()}
                disabled={revokingAll}
              >
                {revokingAll ? "Revoking..." : "Revoke All"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default InviteDialog;
