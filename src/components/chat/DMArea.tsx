import { useState, useRef, useEffect, useMemo } from "react";
import { useDMContext } from "@/context/DMContext";
import { useAuth } from "@/context/AuthContext";
import { AtSign, PlusCircle, Gift, Smile, SendHorizonal } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const DMArea = () => {
  const { user } = useAuth();
  const { activeConversationId, conversations, dmMessages, sendDM } = useDMContext();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const participant = conversation?.participant;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendDM(trimmed);
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MM/dd/yyyy h:mm a");
  };

  // Build profile map from conversation participants
  const profileMap = useMemo(() => {
    const map: Record<string, { display_name: string; id: string }> = {};
    if (participant) map[participant.id] = participant;
    if (user) map[user.id] = { display_name: user.user_metadata?.display_name || "You", id: user.id };
    return map;
  }, [participant, user]);

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-chat-area">
      {/* Header */}
      <div className="h-12 px-4 flex items-center border-b border-border/50 shrink-0">
        <AtSign className="w-5 h-5 text-muted-foreground mr-2" />
        <span className="font-semibold text-foreground">{participant?.display_name || "Direct Message"}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {!activeConversationId && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AtSign className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold text-foreground">Select a conversation</p>
            <p className="text-sm">Pick a conversation or start a new one</p>
          </div>
        )}
        {activeConversationId && dmMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AtSign className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold text-foreground">Start of your conversation with {participant?.display_name}</p>
            <p className="text-sm">Send a message to begin!</p>
          </div>
        )}
        {dmMessages.map((msg, i) => {
          const sender = profileMap[msg.user_id];
          const prevMsg = dmMessages[i - 1];
          const isGrouped = prevMsg?.user_id === msg.user_id &&
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;

          const displayName = sender?.display_name || "Unknown";
          const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          if (isGrouped) {
            return (
              <div key={msg.id} className="pl-[52px] py-0.5 hover:bg-chat-hover rounded group relative">
                <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[38px] mt-0.5">
                  {format(new Date(msg.created_at), "h:mm a")}
                </span>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex gap-3 py-1 hover:bg-chat-hover rounded px-1 group ${i > 0 ? "mt-3" : ""}`}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 text-foreground"
                style={{ backgroundColor: `hsl(${(msg.user_id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="text-[11px] text-muted-foreground">{formatTimestamp(msg.created_at)}</span>
                </div>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {activeConversationId && (
        <div className="px-4 pb-6 pt-1">
          <div className="flex items-center gap-2 bg-chat-input rounded-lg px-4 py-2.5">
            <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <PlusCircle className="w-5 h-5" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={`Message @${participant?.display_name || "user"}`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Gift className="w-5 h-5" />
              </button>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Smile className="w-5 h-5" />
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
              >
                <SendHorizonal className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DMArea;
