import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { LogIn, X } from "lucide-react";

interface JoinServerDialogProps {
  open: boolean;
  onClose: () => void;
}

const JoinServerDialog = ({ open, onClose }: JoinServerDialogProps) => {
  const { user } = useAuth();
  const { setActiveServer } = useChatContext();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || !user) return;
    setError("");
    setLoading(true);

    // Look up invite code
    const { data: invite } = await supabase
      .from("invite_codes")
      .select("server_id, max_uses, uses")
      .eq("code", code.trim())
      .single();

    if (!invite) {
      setError("Invalid invite code");
      setLoading(false);
      return;
    }

    if (invite.max_uses && invite.uses >= invite.max_uses) {
      setError("This invite has expired");
      setLoading(false);
      return;
    }

    // Check if already a member
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

    // Join server
    await supabase.from("server_members").insert({
      server_id: invite.server_id,
      user_id: user.id,
    });

    // Increment uses
    await supabase
      .from("invite_codes")
      .update({ uses: invite.uses + 1 })
      .eq("code", code.trim());

    setActiveServer(invite.server_id);
    setCode("");
    onClose();
    setLoading(false);
    // Reload page to refresh server list
    window.location.reload();
  };

  if (!open) return null;

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
    </div>
  );
};

export default JoinServerDialog;
