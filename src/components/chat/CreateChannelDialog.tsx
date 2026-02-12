import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatContext } from "@/context/ChatContext";
import { Hash, Volume2, X } from "lucide-react";

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreateChannelDialog = ({ open, onClose }: CreateChannelDialogProps) => {
  const { activeServerId, setActiveChannel } = useChatContext();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !activeServerId) return;
    setLoading(true);

    const channelName = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data } = await supabase
      .from("channels")
      .insert({ server_id: activeServerId, name: channelName, type })
      .select()
      .single();

    if (data && type === "text") {
      setActiveChannel(data.id);
    }

    setName("");
    setType("text");
    setLoading(false);
    onClose();
    // Reload channels
    window.location.reload();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Create Channel</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Channel Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType("text")}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                type === "text" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Hash className="w-4 h-4" /> Text
            </button>
            <button
              onClick={() => setType("voice")}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                type === "voice" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Volume2 className="w-4 h-4" /> Voice
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Channel Name</label>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-background border border-border">
            {type === "text" ? <Hash className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-muted-foreground" />}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="new-channel"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Channel"}
        </button>
      </div>
    </div>
  );
};

export default CreateChannelDialog;
