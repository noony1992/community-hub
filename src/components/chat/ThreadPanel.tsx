import { Fragment, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChatContext, type Message } from "@/context/ChatContext";
import { X, SendHorizonal, MessageSquare, Search, ArrowLeft, Bell, BellOff, Reply, PlusCircle, Smile, ImageIcon, FileIcon } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { parseMessageFeatures } from "@/lib/messageFeatures";
import { cn } from "@/lib/utils";
import EmojiPicker from "./EmojiPicker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
  members: Record<string, { display_name: string; username?: string }>;
  mobileFullscreen?: boolean;
  desktopOverlay?: boolean;
}

const COMMENT_REPLY_HEADER_PREFIX = "[in-reply-to]";
const COMMENT_REPLY_QUOTE_PREFIX = "> ";

type CommentReplyMeta = {
  targetId: string;
  targetAuthor: string;
  targetExcerpt: string;
  body: string;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();
const truncate = (value: string, max = 140) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

const parseCommentReplyMeta = (content: string): CommentReplyMeta | null => {
  if (!content.startsWith(`${COMMENT_REPLY_HEADER_PREFIX} `)) return null;
  const lines = content.split("\n");
  if (lines.length < 2) return null;

  const headerLine = lines[0].slice(COMMENT_REPLY_HEADER_PREFIX.length + 1).trim();
  const headerParts = headerLine.split("|").map((part) => part.trim()).filter(Boolean);
  if (headerParts.length < 2) return null;

  const targetId = headerParts[0];
  const targetAuthor = headerParts.slice(1).join(" | ");
  const quoteLine = lines[1].startsWith(COMMENT_REPLY_QUOTE_PREFIX) ? lines[1].slice(COMMENT_REPLY_QUOTE_PREFIX.length).trim() : "";
  const bodyStartIndex = lines[1].startsWith(COMMENT_REPLY_QUOTE_PREFIX) ? 2 : 1;
  const body = lines.slice(bodyStartIndex).join("\n").trim();

  return {
    targetId,
    targetAuthor,
    targetExcerpt: quoteLine,
    body: body || content,
  };
};

const getMessageBodyText = (content: string): string => {
  const parsed = parseMessageFeatures(content);
  if (parsed.kind === "forum_topic") return `${parsed.topic.title}\n${parsed.topic.body}`.trim();
  if (parsed.kind === "poll") return parsed.poll.question;
  return parsed.text;
};

const getDisplayText = (content: string): string => {
  const commentMeta = parseCommentReplyMeta(content);
  const body = commentMeta?.body || content;
  return getMessageBodyText(body);
};

const encodeCommentReply = (targetMessage: Message, targetAuthor: string, body: string) => {
  const cleanAuthor = collapseWhitespace(targetAuthor).replace(/\|/g, "/");
  const excerpt = truncate(collapseWhitespace(getDisplayText(targetMessage.content)), 120);
  return `${COMMENT_REPLY_HEADER_PREFIX} ${targetMessage.id} | ${cleanAuthor}\n${COMMENT_REPLY_QUOTE_PREFIX}${excerpt}\n${body.trim()}`;
};

const ThreadPanel = ({
  parentMessage,
  onClose,
  onOpenThread,
  onBackToList,
  threadSummaries,
  onThreadSeen,
  members,
  mobileFullscreen = false,
  desktopOverlay = false,
}: ThreadPanelProps) => {
  const { user } = useAuth();
  const { getThreadReplies, sendMessage, isThreadFollowed, toggleThreadFollow, messages } = useChatContext();
  const [replies, setReplies] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [replyToComment, setReplyToComment] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const parentCardRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldStickToBottomRef = useRef(true);
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

  const formatDateDividerLabel = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d, yyyy");
  };

  const getAuthorName = useCallback((userId: string) => members[userId]?.display_name || "Unknown", [members]);

  const threadTitle = useMemo(() => {
    if (!parentMessage) return "Thread";
    const parsedParent = parseMessageFeatures(parentMessage.content);
    if (parsedParent.kind === "forum_topic") return parsedParent.topic.title;
    if (parsedParent.kind === "poll") return parsedParent.poll.question;
    return truncate(collapseWhitespace(parsedParent.text), 90) || "Thread";
  }, [parentMessage]);

  useEffect(() => {
    if (!parentMessage) {
      setReplies([]);
      setLoading(false);
      setInput("");
      setReplyToComment(null);
      setPendingAttachment(null);
      setUploading(false);
      shouldStickToBottomRef.current = true;
      setShowJumpToLatest(false);
      setHighlightedMessageId(null);
      return;
    }
    shouldStickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setHighlightedMessageId(null);
    setReplies([]);
    setPendingAttachment(null);
    setUploading(false);
    setLoading(true);
    let cancelled = false;
    const targetParentId = parentMessage.id;
    getThreadReplies(targetParentId).then((r) => {
      if (cancelled) return;
      if (!parentMessage || parentMessage.id !== targetParentId) return;
      setReplies(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [parentMessage, getThreadReplies]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

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
    if (shouldStickToBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [replies.length]);

  const handleThreadScroll = () => {
    const el = threadScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 42;
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  };

  const jumpToComment = useCallback((messageId: string) => {
    if (!parentMessage) return;
    if (messageId === parentMessage.id) {
      parentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const node = replyRefs.current[messageId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1600);
  }, [parentMessage]);

  const jumpToLatest = () => {
    shouldStickToBottomRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowJumpToLatest(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (error) {
      toast.error(`File upload failed: ${error.message}`);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    setPendingAttachment({ url: urlData.publicUrl, name: file.name, type: file.type });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (!parentMessage || uploading) return;
    const rawInput = input.trim();
    if (!rawInput && !pendingAttachment) return;
    const raw = input.trim();
    const content = replyToComment
      ? encodeCommentReply(replyToComment, getAuthorName(replyToComment.user_id), raw || `[file] ${pendingAttachment?.name || "attachment"}`)
      : (raw || `[file] ${pendingAttachment?.name || "attachment"}`);
    setInput("");
    setReplyToComment(null);
    await sendMessage(content, pendingAttachment || undefined, parentMessage.id);
    setPendingAttachment(null);
    const r = await getThreadReplies(parentMessage.id);
    setReplies(r);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredThreads = useMemo(() => (normalizedQuery
    ? threadSummaries.filter((item) => {
        const authorName = members[item.parentMessage.user_id]?.display_name?.toLowerCase() || "";
        const parsedParent = parseMessageFeatures(item.parentMessage.content);
        const heading = parsedParent.kind === "forum_topic"
          ? parsedParent.topic.title
          : parsedParent.kind === "poll"
            ? parsedParent.poll.question
            : parsedParent.text;
        return (
          item.searchText.includes(normalizedQuery) ||
          authorName.includes(normalizedQuery) ||
          heading.toLowerCase().includes(normalizedQuery)
        );
      })
    : threadSummaries), [members, normalizedQuery, threadSummaries]);

  const panelClassName = cn(
    "bg-channel-bar border-l border-border flex flex-col shrink-0",
    mobileFullscreen
      ? "w-full h-full"
      : desktopOverlay
        ? "h-[100dvh] w-[min(40rem,calc(100vw-4rem))] shadow-2xl"
        : "w-[24rem]",
  );

  const renderPanel = (content: ReactNode) => {
    const panel = <div className={panelClassName}>{content}</div>;
    if (!desktopOverlay || mobileFullscreen) return panel;

    return (
      <div className="fixed inset-0 z-40" onClick={onClose}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute top-0 right-0 h-[100dvh]" onClick={(e) => e.stopPropagation()}>
          {panel}
        </div>
      </div>
    );
  };

  if (!parentMessage) {
    return renderPanel(
      <>
        <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Threads</span>
            <span className="text-[11px] text-muted-foreground">{threadSummaries.length}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 border-b border-border/50 sticky top-0 bg-channel-bar z-10">
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

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredThreads.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6 border border-dashed border-border/70 rounded-lg bg-secondary/20">
              {threadSummaries.length === 0 ? "No threads yet in this channel." : "No threads match your search."}
            </div>
          )}
          {filteredThreads.map((item) => {
            const author = members[item.parentMessage.user_id]?.display_name || "Unknown";
            const parsedParent = parseMessageFeatures(item.parentMessage.content);
            const threadTitle = parsedParent.kind === "forum_topic"
              ? parsedParent.topic.title
              : parsedParent.kind === "poll"
                ? parsedParent.poll.question
                : parsedParent.text;
            const preview = truncate(collapseWhitespace(getDisplayText(item.parentMessage.content)), 120);
            return (
              <button
                key={item.parentMessage.id}
                onClick={() => onOpenThread(item.parentMessage)}
                className={cn(
                  "w-full text-left rounded-lg border border-border/60 px-3 py-2.5 transition-colors",
                  item.hasUnread ? "bg-primary/5 border-primary/30 hover:bg-primary/10" : "hover:bg-chat-hover",
                )}
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
                  {threadTitle}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{preview}</p>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                  <span>{item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}</span>
                  {item.hasUnread && <span className="text-primary font-semibold">Unread</span>}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const parentUser = members[parentMessage.user_id]?.display_name || "Unknown";
  const followed = isThreadFollowed(parentMessage.id);
  const parsedParent = parseMessageFeatures(parentMessage.content);
  const replyTargetPreview = replyToComment ? truncate(collapseWhitespace(getDisplayText(replyToComment.content)), 120) : "";

  return renderPanel(
    <>
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <button onClick={onBackToList} className="text-muted-foreground hover:text-foreground" title="Back to threads">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <MessageSquare className="w-4 h-4 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-none">Thread</p>
            <p className="text-[11px] text-muted-foreground truncate max-w-[12rem]">{threadTitle}</p>
          </div>
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

      <div ref={threadScrollRef} onScroll={handleThreadScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div ref={parentCardRef} className="bg-secondary/50 rounded-lg p-3 border border-primary/30">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-foreground">{parentUser}</span>
            <span className="text-[10px] text-muted-foreground">{format(new Date(parentMessage.created_at), "MMM d, h:mm a")}</span>
          </div>
          {parsedParent.kind === "forum_topic" ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{parsedParent.topic.title}</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{parsedParent.topic.body}</p>
            </div>
          ) : (
            <p className="text-sm text-foreground">
              {parsedParent.kind === "poll" ? parsedParent.poll.question : parsedParent.text}
            </p>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                  <Skeleton className="h-3.5" style={{ width: `${42 + (i * 11) % 26}%` }} />
                  <Skeleton className="h-3.5" style={{ width: `${34 + (i * 9) % 28}%` }} />
                  {i === 2 && <Skeleton className="h-20 w-40 rounded-md" />}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground uppercase tracking-wide px-1 sticky top-0 bg-channel-bar/95 backdrop-blur-sm py-1">
          {loading ? "Loading replies..." : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </div>

        {!loading && replies.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4 text-center">
            <p className="text-sm text-foreground">No replies yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start the conversation below.</p>
          </div>
        )}

        {!loading && replies.map((msg, i) => {
          const prevMsg = replies[i - 1];
          const showDateDivider = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
          const commentReplyMeta = parseCommentReplyMeta(msg.content);
          const messageBody = getDisplayText(msg.content);
          const authorName = getAuthorName(msg.user_id);

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
              <div
                ref={(node) => {
                  replyRefs.current[msg.id] = node;
                }}
                className={cn(
                  "flex gap-2 rounded-lg border border-transparent p-2 transition-colors",
                  highlightedMessageId === msg.id ? "bg-primary/10 border-primary/40" : "hover:bg-chat-hover/70",
                )}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 text-foreground"
                  style={{ backgroundColor: `hsl(${(msg.user_id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                >
                  {authorName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">{authorName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(msg.created_at), "h:mm a")}</span>
                    </div>
                    <button
                      onClick={() => {
                        setReplyToComment(msg);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                      className="text-[11px] text-muted-foreground hover:text-primary shrink-0 inline-flex items-center gap-1"
                      title="Reply to comment"
                    >
                      <Reply className="w-3 h-3" />
                      Reply
                    </button>
                  </div>
                  {commentReplyMeta && (
                    <button
                      onClick={() => jumpToComment(commentReplyMeta.targetId)}
                      className="mt-1.5 w-full text-left rounded-md border border-border/70 bg-secondary/30 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                      title={`Jump to ${commentReplyMeta.targetAuthor}`}
                    >
                      <span className="font-medium text-foreground">Replying to {commentReplyMeta.targetAuthor}</span>
                      {commentReplyMeta.targetExcerpt ? `: ${commentReplyMeta.targetExcerpt}` : ""}
                    </button>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-1">{messageBody}</p>
                  {msg.attachment_url && (
                    <a
                      href={msg.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block rounded-md border border-border/60 bg-secondary/30 p-2 hover:bg-secondary/50 transition-colors"
                    >
                      {msg.attachment_type?.startsWith("image/") ? (
                        <img
                          src={msg.attachment_url}
                          alt={msg.attachment_name || "Attachment"}
                          className="max-h-48 rounded-md object-cover mb-1"
                        />
                      ) : null}
                      <div className="flex items-center gap-2 text-xs text-foreground">
                        {msg.attachment_type?.startsWith("image/") ? <ImageIcon className="w-3.5 h-3.5 text-primary" /> : <FileIcon className="w-3.5 h-3.5 text-primary" />}
                        <span className="truncate">{msg.attachment_name || "Attachment"}</span>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {showJumpToLatest && (
        <div className="px-3 pb-2">
          <button
            onClick={jumpToLatest}
            className="w-full text-xs rounded-md border border-border/70 bg-secondary/50 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40"
          >
            Jump to latest replies
          </button>
        </div>
      )}

      <div className="px-3 pb-3 pt-1 border-t border-border/40">
        {replyToComment && (
          <div className="mb-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground">
                  Replying to {getAuthorName(replyToComment.user_id)}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{replyTargetPreview}</p>
              </div>
              <button
                onClick={() => setReplyToComment(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Cancel comment reply"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        {pendingAttachment && (
          <div className="mb-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2">
            <div className="flex items-center gap-2">
              {pendingAttachment.type.startsWith("image/") ? <ImageIcon className="w-4 h-4 text-primary shrink-0" /> : <FileIcon className="w-4 h-4 text-primary shrink-0" />}
              <span className="text-xs text-foreground truncate flex-1">{pendingAttachment.name}</span>
              <button
                onClick={() => setPendingAttachment(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2 bg-chat-input rounded-lg px-3 py-2">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
            title="Attach file"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={replyToComment ? "Reply to this comment..." : "Reply in thread..."}
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-28"
            disabled={uploading}
          />
          <EmojiPicker onSelect={(emoji) => setInput((prev) => prev + emoji)}>
            <button className="text-muted-foreground hover:text-foreground shrink-0" title="Add emoji">
              <Smile className="w-4 h-4" />
            </button>
          </EmojiPicker>
          <button onClick={() => void handleSend()} disabled={(!input.trim() && !pendingAttachment) || uploading} className="text-muted-foreground hover:text-primary disabled:opacity-30 shrink-0">
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {uploading ? "Uploading file..." : "Press Enter to send, Shift+Enter for a new line."}
        </p>
      </div>
    </>
  );
};

export default ThreadPanel;
