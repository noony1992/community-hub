import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatContext } from "@/context/ChatContext";
import { X, User } from "lucide-react";

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
  const { profile, refreshProfile } = useChatContext();
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("online");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setStatus(profile.status);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile || !displayName.trim()) return;
    setLoading(true);
    await supabase.from("profiles").update({
      display_name: displayName.trim(),
      status,
    }).eq("id", profile.id);
    await refreshProfile();
    setLoading(false);
    onClose();
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

        <button
          onClick={handleSave}
          disabled={loading || !displayName.trim()}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default ProfileDialog;
