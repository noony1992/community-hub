import { useState, useRef, useEffect } from "react";
import { useChatContext } from "@/context/ChatContext";
import { mockUsers, mockChannels } from "@/data/mockData";
import { Hash, Bell, Pin, Users, Search, Inbox, HelpCircle, PlusCircle, Gift, Smile, SendHorizonal } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const ChatArea = () => {
  const { activeChannelId, activeServerId, getMessages, sendMessage } = useChatContext();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = getMessages();

  const channel = (mockChannels[activeServerId] || []).find((c) => c.id === activeChannelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInput("");
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MM/dd/yyyy h:mm a");
  };

  const getUserById = (id: string) => mockUsers.find((u) => u.id === id);

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-chat-area">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold text-foreground">{channel?.name || "general"}</span>
        </div>
        <div className="flex items-center gap-3">
          {[Bell, Pin, Users, Search, Inbox, HelpCircle].map((Icon, i) => (
            <button key={i} className="text-muted-foreground hover:text-foreground transition-colors">
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Hash className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold text-foreground">Welcome to #{channel?.name}!</p>
            <p className="text-sm">This is the start of the channel.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const user = getUserById(msg.userId);
          const prevMsg = messages[i - 1];
          const isGrouped = prevMsg?.userId === msg.userId && msg.timestamp - prevMsg.timestamp < 300000;

          if (isGrouped) {
            return (
              <div key={msg.id} className="pl-[52px] py-0.5 hover:bg-chat-hover rounded group">
                <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[38px] mt-0.5">
                  {format(new Date(msg.timestamp), "h:mm a")}
                </span>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex gap-3 py-1 hover:bg-chat-hover rounded px-1 group ${i > 0 ? "mt-3" : ""}`}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
                style={{ backgroundColor: `hsl(${(user?.id.charCodeAt(1) || 0) * 60}, 50%, 40%)` }}
              >
                <span className="text-foreground">{user?.avatar}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground hover:underline cursor-pointer">
                    {user?.displayName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>
                </div>
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-1">
        <div className="flex items-center gap-2 bg-chat-input rounded-lg px-4 py-2.5">
          <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <PlusCircle className="w-5 h-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Message #${channel?.name || "general"}`}
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
    </div>
  );
};

export default ChatArea;
