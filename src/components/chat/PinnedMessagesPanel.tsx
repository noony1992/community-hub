import { useState, useEffect } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { Pin, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";
import { renderContentWithMentions } from "./MentionAutocomplete";

interface PinnedMessagesPanelProps {
  open: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  members: Record<string, { display_name: string }>;
}

const PinnedMessagesPanel = ({ open, onClose, onJumpToMessage, members }: PinnedMessagesPanelProps) => {
  const { getPinnedMessages, unpinMessage, activeChannelId, activeServerId, channels, setActiveServer, setActiveChannel } = useChatContext();
  const [pinned, setPinned] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const revealPinned = useLoadingReveal(loading);
  const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name || "current channel";
  const handleChannelReferenceClick = (channelRef: { id: string; server_id?: string }) => {
    if (channelRef.id === activeChannelId) return;
    if (channelRef.server_id && channelRef.server_id !== activeServerId) {
      setActiveServer(channelRef.server_id);
      window.setTimeout(() => setActiveChannel(channelRef.id), 110);
      return;
    }
    setActiveChannel(channelRef.id);
  };

  useEffect(() => {
    if (!open || !activeChannelId) return;
    setLoading(true);
    let cancelled = false;
    getPinnedMessages().then((msgs) => {
      if (cancelled) return;
      setPinned(msgs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeChannelId, getPinnedMessages]);

  useEffect(() => {
    if (!open) {
      setLoading(true);
    }
  }, [open]);

  const handleUnpin = async (id: string) => {
    await unpinMessage(id);
    setPinned((prev) => prev.filter((m) => m.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <div
        className="relative bg-card border border-border rounded-xl w-[min(720px,calc(100vw-1.5rem))] h-[78vh] max-h-[78vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/10 via-secondary/30 to-transparent">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-9 w-9 rounded-lg items-center justify-center border border-primary/25 bg-primary/10 text-primary shrink-0">
                <Pin className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm">Pinned Messages</p>
                <p className="text-xs text-muted-foreground truncate">
                  #{activeChannelName} | {loading ? "Loading..." : `${pinned.length} pinned`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-3.5" style={{ width: `${18 + (i * 7) % 14}%` }} />
                        {i % 2 === 0 && <Skeleton className="h-3.5" style={{ width: `${12 + (i * 5) % 10}%` }} />}
                      </div>
                      <Skeleton className="h-3" style={{ width: `${30 + (i * 7) % 16}%` }} />
                    </div>
                    <Skeleton className="h-7 w-14 rounded-md shrink-0" />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-3.5" style={{ width: `${28 + (i * 6) % 16}%` }} />
                    {i % 2 === 1 && <Skeleton className="h-3.5" style={{ width: `${13 + (i * 5) % 10}%` }} />}
                  </div>
                  {i % 3 === 1 && (
                    <Skeleton className="h-24 rounded-md" style={{ width: 184 + ((i * 11) % 32) }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className={`space-y-3 ${revealPinned ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
              {pinned.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 px-6 py-10 text-center">
                  <Pin className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-foreground">No pinned messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pin important messages to keep them easy to find here.
                  </p>
                </div>
              )}

              {pinned.map((msg) => (
                <div key={msg.id} className="group rounded-xl border border-border/60 bg-background/70 p-3 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {(members[msg.user_id]?.display_name || "Unknown")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{members[msg.user_id]?.display_name || "Unknown"}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                          <span>|</span>
                          <span>{format(new Date(msg.created_at), "MMM d, h:mm")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onJumpToMessage(msg.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10 transition-colors"
                        title="Jump to message"
                      >
                        View
                      </button>
                      <button
                        onClick={() => void handleUnpin(msg.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors"
                        title="Unpin message"
                      >
                        <X className="w-3.5 h-3.5" />
                        Unpin
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground mt-2 whitespace-pre-wrap break-words leading-relaxed">
                    {renderContentWithMentions(msg.content || "Message content unavailable", [], {
                      channels,
                      onChannelClick: handleChannelReferenceClick,
                    })}
                  </p>
                  {msg.attachment_url && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
                      Attachment
                      {msg.attachment_name ? `: ${msg.attachment_name}` : ""}
                    </div>
                  )}
                  {msg.pinned_at && (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Pinned {formatDistanceToNow(new Date(msg.pinned_at), { addSuffix: true })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && pinned.length > 0 && (
          <div className={`px-4 py-2.5 border-t border-border bg-card/90 text-[11px] text-muted-foreground ${revealPinned ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
            Showing {pinned.length} pinned message{pinned.length === 1 ? "" : "s"} in #{activeChannelName}.
          </div>
        )}
      </div>
    </div>
  );
};

export default PinnedMessagesPanel;

