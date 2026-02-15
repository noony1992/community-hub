import { useState, useEffect, useRef } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { X, SendHorizonal, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface ThreadPanelProps {
  parentMessage: Message | null;
  onClose: () => void;
  members: Record<string, { display_name: string }>;
}

const ThreadPanel = ({ parentMessage, onClose, members }: ThreadPanelProps) => {
  const { user } = useAuth();
  const { getThreadReplies, sendMessage } = useChatContext();
  const [replies, setReplies] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parentMessage) return;
    setLoading(true);
    getThreadReplies(parentMessage.id).then((r) => { setReplies(r); setLoading(false); });
  }, [parentMessage, getThreadReplies]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const handleSend = async () => {
    if (!input.trim() || !parentMessage) return;
    const content = input.trim();
    setInput("");
    await sendMessage(content, undefined, parentMessage.id);
    // Reload replies
    const r = await getThreadReplies(parentMessage.id);
    setReplies(r);
  };

  if (!parentMessage) return null;

  const parentUser = members[parentMessage.user_id]?.display_name || "Unknown";

  return (
    <div className="w-80 bg-channel-bar border-l border-border flex flex-col shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Thread</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Parent message */}
        <div className="bg-secondary/50 rounded-md p-3 border-l-2 border-primary">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-foreground">{parentUser}</span>
            <span className="text-[10px] text-muted-foreground">{format(new Date(parentMessage.created_at), "MMM d, h:mm a")}</span>
          </div>
          <p className="text-sm text-foreground">{parentMessage.content}</p>
        </div>

        {loading && <p className="text-xs text-muted-foreground text-center">Loading replies...</p>}

        <div className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>

        {replies.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 text-foreground"
              style={{ backgroundColor: `hsl(${(msg.user_id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
            >
              {(members[msg.user_id]?.display_name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold text-foreground">{members[msg.user_id]?.display_name || "Unknown"}</span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), "h:mm a")}</span>
              </div>
              <p className="text-sm text-foreground">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center gap-2 bg-chat-input rounded-lg px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Reply..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button onClick={handleSend} disabled={!input.trim()} className="text-muted-foreground hover:text-primary disabled:opacity-30">
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThreadPanel;
