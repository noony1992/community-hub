import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Hash, Bell, Pin, Users, Search, Inbox, HelpCircle, PlusCircle, Gift, Smile, SendHorizonal, Pencil, Trash2, X, Check, Paperclip, FileIcon, ImageIcon, MessageSquare, Reply } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import EmojiPicker from "./EmojiPicker";
import MessageReactions from "./MessageReactions";
import SearchDialog from "./SearchDialog";
import PinnedMessagesPanel from "./PinnedMessagesPanel";
import ThreadPanel from "./ThreadPanel";
import MentionAutocomplete, { renderContentWithMentions } from "./MentionAutocomplete";

const ChatArea = () => {
  const { user } = useAuth();
  const { activeChannelId, channels, messages, sendMessage, editMessage, deleteMessage, members, typingUsers, setTyping, addReaction, pinMessage, unpinMessage } = useChatContext();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    handleTyping();

    // Check for @mention
    const cursorPos = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursorPos);
    const mentionMatch = textBefore.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (username: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const newBefore = textBefore.replace(/@\w*$/, `@${username} `);
    setInput(newBefore + textAfter);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (!error) {
      const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      setPendingAttachment({ url: urlData.publicUrl, name: file.name, type: file.type });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && !pendingAttachment) return;
    setInput("");
    setTyping(false);
    setShowMentions(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    await sendMessage(trimmed || (pendingAttachment ? `📎 ${pendingAttachment.name}` : ""), pendingAttachment || undefined, replyTo?.id);
    setPendingAttachment(null);
    setReplyTo(null);
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

  const isImage = (type: string | null) => type?.startsWith("image/");

  const renderAttachment = (msg: Message) => {
    if (!msg.attachment_url) return null;
    if (isImage(msg.attachment_type)) {
      return (
        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img src={msg.attachment_url} alt={msg.attachment_name || "image"} className="max-w-xs max-h-64 rounded-lg border border-border" />
        </a>
      );
    }
    return (
      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-1 px-3 py-2 bg-secondary rounded-lg max-w-xs hover:bg-chat-hover transition-colors">
        <FileIcon className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm text-foreground truncate">{msg.attachment_name || "File"}</span>
      </a>
    );
  };

  const renderReplyPreview = (msg: Message) => {
    if (!msg.reply_to) return null;
    const parent = messages.find((m) => m.id === msg.reply_to);
    if (!parent) return null;
    const parentUser = memberMap[parent.user_id]?.display_name || "Unknown";
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5 pl-1 border-l-2 border-primary/40 ml-0">
        <Reply className="w-3 h-3" />
        <span className="font-medium text-foreground">{parentUser}</span>
        <span className="truncate max-w-[200px]">{parent.content}</span>
      </div>
    );
  };

  // Count thread replies for a message
  const replyCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    messages.forEach((m) => {
      if (m.reply_to) {
        map[m.reply_to] = (map[m.reply_to] || 0) + 1;
      }
    });
    return map;
  }, [messages]);

  const renderMessageActions = (msg: Message, isOwn: boolean) => (
    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-2">
      <EmojiPicker onSelect={(emoji) => addReaction(msg.id, emoji)} />
      <button onClick={() => setReplyTo(msg)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Reply"><Reply className="w-3.5 h-3.5" /></button>
      <button onClick={() => setThreadMessage(msg)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Thread"><MessageSquare className="w-3.5 h-3.5" /></button>
      <button onClick={() => msg.pinned_at ? unpinMessage(msg.id) : pinMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-foreground" title={msg.pinned_at ? "Unpin" : "Pin"}>
        <Pin className={`w-3.5 h-3.5 ${msg.pinned_at ? "text-primary" : ""}`} />
      </button>
      {isOwn && (
        <>
          <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => deleteMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );

  const renderThreadIndicator = (msg: Message) => {
    const count = replyCountMap[msg.id];
    if (!count) return null;
    return (
      <button onClick={() => setThreadMessage(msg)} className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5">
        <MessageSquare className="w-3 h-3" />
        {count} {count === 1 ? "reply" : "replies"}
      </button>
    );
  };

  const renderContent = (content: string) => {
    return renderContentWithMentions(content, members);
  };

  // Filter out thread replies from main view (show only top-level messages)
  const topLevelMessages = messages.filter((m) => !m.reply_to);

  return (
    <div className="flex flex-1 min-w-0">
      <div className="flex flex-col flex-1 min-w-0 bg-chat-area">
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{channel?.name || "general"}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-muted-foreground hover:text-foreground transition-colors"><Bell className="w-5 h-5" /></button>
            <button onClick={() => setShowPinned(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Pinned Messages"><Pin className="w-5 h-5" /></button>
            <button className="text-muted-foreground hover:text-foreground transition-colors"><Users className="w-5 h-5" /></button>
            <button onClick={() => setShowSearch(true)} className="text-muted-foreground hover:text-foreground transition-colors"><Search className="w-5 h-5" /></button>
            <button className="text-muted-foreground hover:text-foreground transition-colors"><Inbox className="w-5 h-5" /></button>
            <button className="text-muted-foreground hover:text-foreground transition-colors"><HelpCircle className="w-5 h-5" /></button>
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
          {activeChannelId && topLevelMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Hash className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-foreground">Welcome to #{channel?.name}!</p>
              <p className="text-sm">This is the start of the channel.</p>
            </div>
          )}
          {topLevelMessages.map((msg, i) => {
            const msgUser = memberMap[msg.user_id];
            const prevMsg = topLevelMessages[i - 1];
            const isGrouped = prevMsg?.user_id === msg.user_id &&
              new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
            const isOwn = msg.user_id === user?.id;
            const isEditing = editingId === msg.id;
            const displayName = msgUser?.display_name || "Unknown";
            const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

            if (isGrouped) {
              return (
                <div key={msg.id} className={`pl-[52px] py-0.5 hover:bg-chat-hover rounded group relative ${msg.pinned_at ? "border-l-2 border-primary/40 -ml-1 pl-[54px]" : ""}`}>
                  <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[38px] mt-0.5">
                    {format(new Date(msg.created_at), "h:mm a")}
                  </span>
                  {renderReplyPreview(msg)}
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                      <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <p className="text-sm text-foreground">{renderContent(msg.content)}</p>
                        {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                        {renderMessageActions(msg, isOwn)}
                      </div>
                      {renderAttachment(msg)}
                      <MessageReactions messageId={msg.id} />
                      {renderThreadIndicator(msg)}
                    </>
                  )}
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex gap-3 py-1 hover:bg-chat-hover rounded px-1 group ${i > 0 ? "mt-3" : ""} ${msg.pinned_at ? "border-l-2 border-primary/40" : ""}`}>
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
                    {msg.pinned_at && <Pin className="w-3 h-3 text-primary inline" />}
                  </div>
                  {renderReplyPreview(msg)}
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                      <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <p className="text-sm text-foreground">{renderContent(msg.content)}</p>
                        {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                        {renderMessageActions(msg, isOwn)}
                      </div>
                      {renderAttachment(msg)}
                      <MessageReactions messageId={msg.id} />
                      {renderThreadIndicator(msg)}
                    </>
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

        {/* Reply preview */}
        {replyTo && (
          <div className="px-4 py-1">
            <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2">
              <Reply className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">Replying to</span>
              <span className="text-xs font-semibold text-foreground">{memberMap[replyTo.user_id]?.display_name || "Unknown"}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{replyTo.content}</span>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Pending attachment preview */}
        {pendingAttachment && (
          <div className="px-4 py-1">
            <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2 max-w-xs">
              {pendingAttachment.type.startsWith("image/") ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileIcon className="w-4 h-4 text-primary" />}
              <span className="text-sm text-foreground truncate flex-1">{pendingAttachment.name}</span>
              <button onClick={() => setPendingAttachment(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Input */}
        {activeChannelId && (
          <div className="px-4 pb-6 pt-1 relative">
            <MentionAutocomplete
              query={mentionQuery}
              members={members}
              onSelect={handleMentionSelect}
              visible={showMentions}
            />
            <div className="flex items-center gap-2 bg-chat-input rounded-lg px-4 py-2.5">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50">
                <PlusCircle className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !showMentions) handleSend();
                  if (e.key === "Escape") { setShowMentions(false); setReplyTo(null); }
                }}
                placeholder={uploading ? "Uploading..." : `Message #${channel?.name || "general"}`}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                disabled={uploading}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button className="text-muted-foreground hover:text-foreground transition-colors"><Gift className="w-5 h-5" /></button>
                <EmojiPicker onSelect={(emoji) => setInput(prev => prev + emoji)}>
                  <button className="text-muted-foreground hover:text-foreground transition-colors"><Smile className="w-5 h-5" /></button>
                </EmojiPicker>
                <button onClick={handleSend} disabled={(!input.trim() && !pendingAttachment) || uploading} className="text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors">
                  <SendHorizonal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <SearchDialog open={showSearch} onClose={() => setShowSearch(false)} />
        <PinnedMessagesPanel open={showPinned} onClose={() => setShowPinned(false)} members={memberMap} />
      </div>

      {/* Thread panel */}
      {threadMessage && (
        <ThreadPanel parentMessage={threadMessage} onClose={() => setThreadMessage(null)} members={memberMap} />
      )}
    </div>
  );
};

export default ChatArea;
