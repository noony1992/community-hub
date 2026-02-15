import { useState, useEffect } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { Pin, X } from "lucide-react";
import { format } from "date-fns";

interface PinnedMessagesPanelProps {
  open: boolean;
  onClose: () => void;
  members: Record<string, { display_name: string }>;
}

const PinnedMessagesPanel = ({ open, onClose, members }: PinnedMessagesPanelProps) => {
  const { getPinnedMessages, unpinMessage, activeChannelId } = useChatContext();
  const [pinned, setPinned] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !activeChannelId) return;
    setLoading(true);
    getPinnedMessages().then((msgs) => { setPinned(msgs); setLoading(false); });
  }, [open, activeChannelId, getPinnedMessages]);

  const handleUnpin = async (id: string) => {
    await unpinMessage(id);
    setPinned((prev) => prev.filter((m) => m.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-card border border-border rounded-lg w-[440px] max-h-[60vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Pinned Messages</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}
          {!loading && pinned.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No pinned messages</p>}
          {pinned.map((msg) => (
            <div key={msg.id} className="bg-secondary/50 rounded-md p-3 group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground">{members[msg.user_id]?.display_name || "Unknown"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), "MMM d, h:mm a")}</span>
                  <button onClick={() => handleUnpin(msg.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" title="Unpin">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground">{msg.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;
