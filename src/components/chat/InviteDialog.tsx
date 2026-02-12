import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { Copy, Check, Link, X } from "lucide-react";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
}

const InviteDialog = ({ open, onClose }: InviteDialogProps) => {
  const { user } = useAuth();
  const { activeServerId } = useChatContext();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !activeServerId || !user) return;
    const generate = async () => {
      setLoading(true);
      // Check for existing code
      const { data: existing } = await supabase
        .from("invite_codes")
        .select("code")
        .eq("server_id", activeServerId)
        .eq("created_by", user.id)
        .limit(1);

      if (existing && existing.length > 0) {
        setCode(existing[0].code);
      } else {
        const { data: newCode } = await supabase
          .from("invite_codes")
          .insert({ server_id: activeServerId, created_by: user.id })
          .select("code")
          .single();
        if (newCode) setCode(newCode.code);
      }
      setLoading(false);
    };
    generate();
  }, [open, activeServerId, user]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Link className="w-5 h-5 text-primary" />
            Invite People
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">Share this invite code with friends to join your server.</p>

        {loading ? (
          <div className="h-12 flex items-center justify-center text-muted-foreground text-sm">Generating...</div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-foreground font-mono text-sm select-all">
              {code}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteDialog;
