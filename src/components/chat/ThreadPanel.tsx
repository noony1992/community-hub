import { Fragment, useState, useEffect, useRef } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { X, SendHorizonal, MessageSquare, Search, ArrowLeft, Bell, BellOff } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { parseMessageFeatures } from "@/lib/messageFeatures";

export interface ThreadSummaryItem {
  parentMessage: Message;
  replyCount: number;
  lastReplyAt: string;
  hasUnread: boolean;
  searchText: string;
}

interface ThreadPanelProps {
  parentMessage: Message | null;
  onClose: () => void;
  onOpenThread: (message: Message) => void;
  onBackToList: () => void;
  threadSummaries: ThreadSummaryItem[];
  onThreadSeen: (threadId: string, seenAt: string) => void;
  members: Record<string, { display_name: string }>;
}

const ThreadPanel = ({ parentMessage, onClose, onOpenThread, onBackToList, threadSummaries, onThreadSeen, members }: ThreadPanelProps) => {
  const { getThreadReplies, sendMessage, isThreadFollowed, toggleThreadFollow, messages } = useChatContext();
  const [replies, setReplies] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const dedupeOptimisticReplies = (items: Message[]) => {
    const persistedByFingerprint = new Map<string, number[]>();
    items.forEach((item) => {
      if (item.id.startsWith("optimistic:")) return;
      const key = `${item.user_id}|${item.reply_to || ""}|${item.content}|${item.attachment_url || ""}|${item.attachment_name || ""}|${item.attachment_type || ""}`;
      const ts = new Date(item.created_at).getTime();
      const existing = persistedByFingerprint.get(key) || [];
      existing.push(ts);
      persistedByFingerprint.set(key, existing);
    });

    return items.filter((item) => {
      if (!item.id.startsWith("optimistic:")) return true;
      const key = `${item.user_id}|${item.reply_to || ""}|${item.content}|${item.attachment_url || ""}|${item.attachment_name || ""}|${item.attachment_type || ""}`;
      const optimisticTs = new Date(item.created_at).getTime();
      const persistedTimes = persistedByFingerprint.get(key) || [];
      return !persistedTimes.some((ts) => Math.abs(ts - optimisticTs) < 30000);
    });
  };

  useEffect(() => {
    if (!parentMessage) {
      setReplies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getThreadReplies(parentMessage.id).then((r) => {
      setReplies(r);
      setLoading(false);
    });
  }, [parentMessage, getThreadReplies]);

  useEffect(() => {
    if (!parentMessage) return;
    const liveReplies = messages
      .filter((m) => m.reply_to === parentMessage.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (liveReplies.length === 0) return;

    setReplies((prev) => {
      const byId = new Map<string, Message>();
      prev.forEach((item) => byId.set(item.id, item));
      liveReplies.forEach((item) => byId.set(item.id, item));
      const merged = Array.from(byId.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return dedupeOptimisticReplies(merged);
    });
  }, [messages, parentMessage]);

  useEffect(() => {
    if (!parentMessage) return;
    const latestReply = replies[replies.length - 1];
    onThreadSeen(parentMessage.id, latestReply?.created_at || parentMessage.created_at);
  }, [onThreadSeen, parentMessage, replies]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const handleSend = async () => {
    if (!input.trim() || !parentMessage) return;
    const content = input.trim();
    setInput("");
    await sendMessage(content, undefined, parentMessage.id);
    const r = await getThreadReplies(parentMessage.id);
    setReplies(r);
  };

  const formatDateDividerLabel = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d, yyyy");
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredThreads = normalizedQuery
    ? threadSummaries.filter((item) => {
        const authorName = members[item.parentMessage.user_id]?.display_name?.toLowerCase() || "";
        return (
          item.searchText.includes(normalizedQuery) ||
          authorName.includes(normalizedQuery)
        );
      })
    : threadSummaries;

  if (!parentMessage) {
    return (
      <div className="w-80 bg-channel-bar border-l border-border flex flex-col shrink-0">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Threads</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 border-b border-border/50">
          <div className="flex items-center gap-2 rounded-md bg-chat-input px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search threads"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredThreads.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">
              {threadSummaries.length === 0 ? "No threads yet in this channel." : "No threads match your search."}
            </div>
          )}
          {filteredThreads.map((item) => {
            const author = members[item.parentMessage.user_id]?.display_name || "Unknown";
            return (
              <button
                key={item.parentMessage.id}
                onClick={() => onOpenThread(item.parentMessage)}
                className="w-full text-left rounded-md border border-border/60 hover:bg-chat-hover px-3 py-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs truncate ${item.hasUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {author}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(item.lastReplyAt), "MMM d")}
                  </span>
                </div>
                <p className={`text-sm truncate ${item.hasUnread ? "font-semibold text-foreground" : "text-foreground"}`}>
                  {item.parentMessage.content}
                </p>
                <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                  <span>{item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}</span>
                  {item.hasUnread && <span className="text-primary font-semibold">Unread</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const parentUser = members[parentMessage.user_id]?.display_name || "Unknown";
  const followed = isThreadFollowed(parentMessage.id);
  const parsedParent = parseMessageFeatures(parentMessage.content);

  return (
    <div className="w-80 bg-channel-bar border-l border-border flex flex-col shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <button onClick={onBackToList} className="text-muted-foreground hover:text-foreground" title="Back to threads">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Thread</span>
          <button
            onClick={() => void toggleThreadFollow(parentMessage)}
            className="ml-1 text-muted-foreground hover:text-foreground"
            title={followed ? "Unfollow thread" : "Follow thread"}
          >
            {followed ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div className="bg-secondary/50 rounded-md p-3 border-l-2 border-primary">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-foreground">{parentUser}</span>
            <span className="text-[10px] text-muted-foreground">{format(new Date(parentMessage.created_at), "MMM d, h:mm a")}</span>
          </div>
          <p className="text-sm text-foreground">
            {parsedParent.kind === "poll" ? parsedParent.poll.question : ("text" in parsedParent ? parsedParent.text : parentMessage.content)}
          </p>
        </div>

        {loading && <p className="text-xs text-muted-foreground text-center">Loading replies...</p>}

        <div className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>

        {replies.map((msg, i) => {
          const prevMsg = replies[i - 1];
          const showDateDivider = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));

          return (
            <Fragment key={msg.id}>
              {showDateDivider && (
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-border/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatDateDividerLabel(msg.created_at)}
                  </span>
                  <div className="h-px flex-1 bg-border/70" />
                </div>
              )}
              <div className="flex gap-2">
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
            </Fragment>
          );
        })}
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
