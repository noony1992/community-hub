import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { LogIn, X } from "lucide-react";
import BanAppealDialog from "@/components/chat/BanAppealDialog";

interface JoinServerDialogProps {
  open: boolean;
  onClose: () => void;
}

const JoinServerDialog = ({ open, onClose }: JoinServerDialogProps) => {
  const { user } = useAuth();
  const { setActiveServer, refreshServers } = useChatContext();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [banAppealOpen, setBanAppealOpen] = useState(false);
  const [banAppealServerId, setBanAppealServerId] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!code.trim() || !user) return;
    setError("");
    setLoading(true);

    const { data: invite } = await supabase
      .from("invite_codes")
      .select("server_id, max_uses, uses, expires_at, assigned_role")
      .eq("code", code.trim())
      .maybeSingle();

    if (!invite) {
      setError("Invalid invite code");
      setLoading(false);
      return;
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      setError("This invite has expired");
      setLoading(false);
      return;
    }

    if (invite.max_uses && invite.uses >= invite.max_uses) {
      setError("This invite has expired");
      setLoading(false);
      return;
    }

    const { data: activeBan } = await supabase.rpc("is_server_banned", {
      _server_id: invite.server_id,
      _user_id: user.id,
    });

    if (activeBan) {
      setError("You can't join this server because you are banned.");
      setBanAppealServerId(invite.server_id);
      setBanAppealOpen(true);
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("server_members")
      .select("id")
      .eq("server_id", invite.server_id)
      .eq("user_id", user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      setActiveServer(invite.server_id);
      onClose();
      setLoading(false);
      return;
    }

    let roleToAssign = "member";
    if (invite.assigned_role) {
      const { data: role } = await supabase
        .from("server_roles")
        .select("name")
        .eq("server_id", invite.server_id)
        .eq("name", invite.assigned_role)
        .maybeSingle();
      roleToAssign = role?.name || "member";
    }

    const { error: joinError } = await supabase.from("server_members").insert({
      server_id: invite.server_id,
      user_id: user.id,
      role: roleToAssign,
    });
    if (joinError) {
      const msg = (joinError.message || "").toLowerCase();
      if (msg.includes("row-level security") || msg.includes("permission")) {
        setError("You can't join this server because you are banned.");
      } else {
        setError(joinError.message || "Failed to join server.");
      }
      setLoading(false);
      return;
    }

    await supabase
      .from("invite_codes")
      .update({ uses: invite.uses + 1 })
      .eq("code", code.trim());

    await refreshServers();
    setActiveServer(invite.server_id);
    setCode("");
    onClose();
    setLoading(false);
  };

  if (!open) {
    return (
      <BanAppealDialog
        open={banAppealOpen}
        onOpenChange={setBanAppealOpen}
        serverId={banAppealServerId}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <LogIn className="w-5 h-5 text-primary" />
            Join a Server
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Enter an invite code to join a server.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Enter invite code"
          className="w-full px-3 py-2.5 rounded-md bg-background text-foreground border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 mb-3 font-mono"
          autoFocus
        />
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={loading || !code.trim()}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join Server"}
        </button>
      </div>
      <BanAppealDialog
        open={banAppealOpen}
        onOpenChange={setBanAppealOpen}
        serverId={banAppealServerId}
      />
    </div>
  );
};

export default JoinServerDialog;
