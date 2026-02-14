import { useChatContext, type Reaction } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import EmojiPicker from "./EmojiPicker";
import { Smile } from "lucide-react";

interface MessageReactionsProps {
  messageId: string;
}

const MessageReactions = ({ messageId }: MessageReactionsProps) => {
  const { user } = useAuth();
  const { reactions, addReaction, removeReaction } = useChatContext();
  const msgReactions = reactions[messageId] || [];

  // Group by emoji
  const grouped: Record<string, { count: number; userReacted: boolean; users: string[] }> = {};
  msgReactions.forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userReacted: false, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.user_id);
    if (r.user_id === user?.id) grouped[r.emoji].userReacted = true;
  });

  const handleClick = (emoji: string, userReacted: boolean) => {
    if (userReacted) removeReaction(messageId, emoji);
    else addReaction(messageId, emoji);
  };

  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      {Object.entries(grouped).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={() => handleClick(emoji, data.userReacted)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs transition-colors ${
            data.userReacted
              ? "bg-primary/20 border border-primary/40 text-foreground"
              : "bg-secondary border border-transparent text-muted-foreground hover:bg-chat-hover"
          }`}
        >
          <span>{emoji}</span>
          <span>{data.count}</span>
        </button>
      ))}
      {Object.keys(grouped).length > 0 && (
        <EmojiPicker onSelect={(emoji) => addReaction(messageId, emoji)}>
          <button className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-secondary text-muted-foreground hover:bg-chat-hover transition-colors">
            <Smile className="w-3.5 h-3.5" />
          </button>
        </EmojiPicker>
      )}
    </div>
  );
};

export default MessageReactions;
