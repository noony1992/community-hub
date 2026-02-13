import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChatContext } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { Hash, Bell, Pin, Users, Search, Inbox, HelpCircle, PlusCircle, Gift, Smile, SendHorizonal, Pencil, Trash2, X, Check } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const ChatArea = () => {
  const { user } = useAuth();
  const { activeChannelId, channels, messages, sendMessage, editMessage, deleteMessage, members, typingUsers, setTyping } = useChatContext();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = channels.find((c) => c.id === activeChannelId);

  const memberMap = useMemo(() => {
    const map: Record<string, typeof members[0]> = {};
    members.forEach((m) => { map[m.id] = m; });
    return map;
  }, [members]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleTyping = useCallback(() => {
    setTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
  }, [setTyping]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    setTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    await sendMessage(trimmed);
  };

  const handleEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    await editMessage(editingId, editContent.trim());
    setEditingId(null);
    setEditContent("");
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MM/dd/yyyy h:mm a");
  };

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
        {!activeChannelId && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Hash className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold text-foreground">Select a channel</p>
            <p className="text-sm">Pick a channel to start chatting</p>
          </div>
        )}
        {activeChannelId && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Hash className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold text-foreground">Welcome to #{channel?.name}!</p>
            <p className="text-sm">This is the start of the channel.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const msgUser = memberMap[msg.user_id];
          const prevMsg = messages[i - 1];
          const isGrouped = prevMsg?.user_id === msg.user_id &&
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
          const isOwn = msg.user_id === user?.id;
          const isEditing = editingId === msg.id;

          const displayName = msgUser?.display_name || "Unknown";
          const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          if (isGrouped) {
            return (
              <div key={msg.id} className="pl-[52px] py-0.5 hover:bg-chat-hover rounded group relative">
                <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[38px] mt-0.5">
                  {format(new Date(msg.created_at), "h:mm a")}
                </span>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                    <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <p className="text-sm text-foreground">{msg.content}</p>
                    {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                    {isOwn && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-2">
                        <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
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
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground hover:underline cursor-pointer">{displayName}</span>
                  <span className="text-[11px] text-muted-foreground">{formatTimestamp(msg.created_at)}</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                    <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <p className="text-sm text-foreground">{msg.content}</p>
                    {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                    {isOwn && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-2">
                        <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1">
          <p className="text-xs text-muted-foreground animate-pulse-subtle">
            <span className="font-semibold text-foreground">{typingUsers.map(u => u.display_name).join(", ")}</span>
            {typingUsers.length === 1 ? " is typing..." : " are typing..."}
          </p>
        </div>
      )}

      {/* Input */}
      {activeChannelId && (
        <div className="px-4 pb-6 pt-1">
          <div className="flex items-center gap-2 bg-chat-input rounded-lg px-4 py-2.5">
            <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <PlusCircle className="w-5 h-5" />
            </button>
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value); handleTyping(); }}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={`Message #${channel?.name || "general"}`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button className="text-muted-foreground hover:text-foreground transition-colors"><Gift className="w-5 h-5" /></button>
              <button className="text-muted-foreground hover:text-foreground transition-colors"><Smile className="w-5 h-5" /></button>
              <button onClick={handleSend} disabled={!input.trim()} className="text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors">
                <SendHorizonal className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatArea;
