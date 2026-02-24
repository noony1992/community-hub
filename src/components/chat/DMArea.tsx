import { Fragment, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useDMContext } from "@/context/DMContext";
import { useAuth } from "@/context/AuthContext";
import { AtSign, PlusCircle, Gift, Smile, SendHorizonal, PanelLeft, Menu } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StatusIndicator from "./StatusIndicator";
import { getEffectiveStatus } from "@/lib/presence";
import { DMAreaSkeleton } from "@/components/skeletons/AppSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";

interface FriendItem {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  updated_at?: string | null;
}

type DMAreaProps = {
  isMobile?: boolean;
  onOpenServers?: () => void;
  onOpenConversations?: () => void;
};

const DMArea = ({ isMobile = false, onOpenServers, onOpenConversations }: DMAreaProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeConversationId, conversations, dmMessages, sendDM, startConversation, isFriendsView, loadingDmMessages, loadingConversations } = useDMContext();
  const [input, setInput] = useState("");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const dmScrollPositionsRef = useRef<Record<string, number>>({});
  const pendingDmRestoreIdRef = useRef<string | null>(null);
  const showingInitialSkeleton = !isFriendsView && loadingConversations && conversations.length === 0 && !activeConversationId;
  const revealInitial = useLoadingReveal(showingInitialSkeleton);
  const revealFriends = useLoadingReveal(loadingFriends);
  const revealMessages = useLoadingReveal(!!activeConversationId && loadingDmMessages);
  const dmScrollStoragePrefix = user?.id ? `scroll:dm:${user.id}:` : "scroll:dm:anon:";

  const getDmScrollStorageKey = useCallback(
    (conversationId: string) => `${dmScrollStoragePrefix}${conversationId}`,
    [dmScrollStoragePrefix],
  );

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const saveConversationScroll = useCallback((conversationId: string, scrollTop: number) => {
    if (!conversationId || !Number.isFinite(scrollTop) || scrollTop < 0) return;
    dmScrollPositionsRef.current[conversationId] = scrollTop;
    try {
      localStorage.setItem(getDmScrollStorageKey(conversationId), String(Math.round(scrollTop)));
    } catch {
      // Ignore storage errors.
    }
  }, [getDmScrollStorageKey]);

  const readConversationScroll = useCallback((conversationId: string) => {
    if (Object.prototype.hasOwnProperty.call(dmScrollPositionsRef.current, conversationId)) {
      const inMemory = dmScrollPositionsRef.current[conversationId];
      if (typeof inMemory === "number" && Number.isFinite(inMemory) && inMemory >= 0) return inMemory;
    }
    try {
      const raw = localStorage.getItem(getDmScrollStorageKey(conversationId));
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }, [getDmScrollStorageKey]);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const participant = conversation?.participant;

  if (showingInitialSkeleton) {
    return <DMAreaSkeleton />;
  }

  useEffect(() => {
    pendingDmRestoreIdRef.current = activeConversationId || null;
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      if (!activeConversationId) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      saveConversationScroll(activeConversationId, el.scrollTop);
    };
  }, [activeConversationId, saveConversationScroll]);

  useEffect(() => {
    if (isFriendsView && activeConversationId) {
      const el = messagesContainerRef.current;
      if (el) saveConversationScroll(activeConversationId, el.scrollTop);
      return;
    }
    if (!isFriendsView && activeConversationId) {
      pendingDmRestoreIdRef.current = activeConversationId;
    }
  }, [activeConversationId, isFriendsView, saveConversationScroll]);

  useEffect(() => {
    if (!activeConversationId || isFriendsView || loadingDmMessages) return;
    if (pendingDmRestoreIdRef.current !== activeConversationId) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    const savedTop = readConversationScroll(activeConversationId);
    const raf = window.requestAnimationFrame(() => {
      if (savedTop !== null) {
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.min(savedTop, maxTop);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }
      shouldAutoScrollRef.current = isNearBottom();
      pendingDmRestoreIdRef.current = null;
    });

    return () => window.cancelAnimationFrame(raf);
  }, [activeConversationId, isFriendsView, isNearBottom, loadingDmMessages, readConversationScroll]);

  useEffect(() => {
    if (!activeConversationId || isFriendsView || loadingDmMessages) return;
    if (!shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeConversationId, dmMessages.length, isFriendsView, loadingDmMessages]);

  useEffect(() => {
    const loadFriends = async () => {
      if (!user) {
        setFriends([]);
        return;
      }

      setLoadingFriends(true);
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase
          .from("friendships")
          .select("addressee_id")
          .eq("requester_id", user.id)
          .eq("status", "accepted"),
        supabase
          .from("friendships")
          .select("requester_id")
          .eq("addressee_id", user.id)
          .eq("status", "accepted"),
      ]);

      const ids = Array.from(new Set([
        ...(outgoing || []).map((row) => row.addressee_id),
        ...(incoming || []).map((row) => row.requester_id),
      ]));

      if (ids.length === 0) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, status, updated_at")
        .in("id", ids);

      const nextFriends = (profiles || []) as FriendItem[];
      nextFriends.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setFriends(nextFriends);
      setLoadingFriends(false);
    };

    if (isFriendsView) {
      void loadFriends();
    }
  }, [isFriendsView, user]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendDM(trimmed);
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return `Today at ${format(date, "h:mm")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm")}`;
    return format(date, "MM/dd/yyyy h:mm");
  };

  const formatDateDividerLabel = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d, yyyy");
  };

  // Build profile map from conversation participants
  const profileMap = useMemo(() => {
    const map: Record<string, { display_name: string; id: string }> = {};
    if (participant) map[participant.id] = participant;
    if (user) map[user.id] = { display_name: user.user_metadata?.display_name || "You", id: user.id };
    return map;
  }, [participant, user]);

  const handleStartFriendDM = async (friendId: string) => {
    await startConversation(friendId);
  };

  const handleMessagesScroll = useCallback(() => {
    if (!activeConversationId || isFriendsView) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    saveConversationScroll(activeConversationId, el.scrollTop);
    shouldAutoScrollRef.current = isNearBottom();
  }, [activeConversationId, isFriendsView, isNearBottom, saveConversationScroll]);

  return (
    <div className={`flex flex-col flex-1 min-w-0 bg-chat-area ${revealInitial ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
      {/* Header */}
      <div className="h-12 px-3 sm:px-4 flex items-center gap-2 border-b border-border/50 shrink-0">
        {isMobile && (
          <>
            <button
              onClick={onOpenServers}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Open navigation"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenConversations}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Open conversations"
            >
              <Menu className="w-4 h-4" />
            </button>
          </>
        )}
        <div className="flex items-center min-w-0">
          <AtSign className="w-5 h-5 text-muted-foreground mr-2" />
          <span className="font-semibold text-foreground truncate">
            {isFriendsView ? "Friends" : (participant?.display_name || "Direct Message")}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {isFriendsView && (
          <div className={`space-y-2 ${!loadingFriends && revealFriends ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
            {loadingFriends && (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-1 py-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-3.5 w-16" />
                          {i % 2 === 0 && <Skeleton className="h-3.5 w-10" />}
                        </div>
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-10 rounded-md" />
                  </div>
                ))}
              </div>
            )}
            {!loadingFriends && friends.length === 0 && (
              <p className="text-sm text-muted-foreground">You have no friends yet.</p>
            )}
            {!loadingFriends && friends.map((friend) => {
              const initials = friend.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={friend.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-secondary/40 border border-border/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt={friend.display_name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground"
                          style={{ backgroundColor: `hsl(${(friend.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                        >
                          {initials}
                        </div>
                      )}
                      <StatusIndicator status={getEffectiveStatus(friend.status, friend.updated_at)} className="absolute -bottom-0.5 -right-0.5" />
                    </div>
                    <button
                      onClick={() => navigate(`/profile/${friend.id}`)}
                      className="text-left min-w-0 hover:underline"
                      title={`View ${friend.display_name}'s profile`}
                    >
                      <p className="text-sm text-foreground truncate">{friend.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                    </button>
                  </div>
                  <button
                    onClick={() => void handleStartFriendDM(friend.id)}
                    className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                  >
                    DM
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!isFriendsView && (
          <>
            {activeConversationId && loadingDmMessages && (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2.5 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-3.5 w-16" />
                        {i % 2 === 1 && <Skeleton className="h-3.5 w-10" />}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-3.5 w-24" />
                        {i % 3 === 0 && <Skeleton className="h-3.5 w-12" />}
                      </div>
                      {i % 4 === 1 && (
                        <Skeleton
                          className="rounded-md"
                          style={{ width: 176 + ((i * 17) % 44), height: 98 + ((i * 13) % 30) }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loadingDmMessages && (
              <div className={revealMessages ? "animate-in fade-in-0 duration-200 ease-out" : ""}>
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
                  const prevPrevMsg = dmMessages[i - 2];
                  const nextMsg = dmMessages[i + 1];
                  const showDateDivider = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
                  const isGrouped = prevMsg?.user_id === msg.user_id &&
                    !showDateDivider &&
                    new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
                  const startsNewVisualGroupFromPrev = !!prevMsg && !isGrouped && !showDateDivider;
                  const startsGroupedRun = !isGrouped &&
                    !!nextMsg &&
                    nextMsg.user_id === msg.user_id &&
                    isSameDay(new Date(msg.created_at), new Date(nextMsg.created_at)) &&
                    new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime() < 300000;
                  const prevWasGrouped = !!prevMsg &&
                    !!prevPrevMsg &&
                    prevPrevMsg.user_id === prevMsg.user_id &&
                    isSameDay(new Date(prevMsg.created_at), new Date(prevPrevMsg.created_at)) &&
                    new Date(prevMsg.created_at).getTime() - new Date(prevPrevMsg.created_at).getTime() < 300000;
                  const isFirstGroupedFollowup = isGrouped && !prevWasGrouped;
                  const rowSpacingClass = startsNewVisualGroupFromPrev
                    ? (startsGroupedRun ? "pt-2 pb-0" : "pt-3 pb-1")
                    : (startsGroupedRun ? "pt-0.5 pb-0" : "py-1");

                  const displayName = sender?.display_name || "Unknown";
                  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

                  if (isGrouped) {
                    return (
                      <Fragment key={msg.id}>
                        <div className={`pl-[60px] py-0 hover:bg-chat-hover rounded group relative ${isFirstGroupedFollowup ? "-mt-[3px]" : ""}`}>
                          <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[42px] mt-0.5">
                            {format(new Date(msg.created_at), "h:mm")}
                          </span>
                          <p className="text-sm text-foreground">
                            {msg.content}
                            {msg.client_status === "pending" && <span className="text-[10px] text-muted-foreground ml-1">(sending)</span>}
                            {msg.client_status === "retrying" && <span className="text-[10px] text-amber-600 ml-1">(retrying)</span>}
                            {msg.client_status === "failed" && <span className="text-[10px] text-destructive ml-1">(failed)</span>}
                          </p>
                        </div>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="flex items-center gap-3 py-2">
                          <div className="h-px flex-1 bg-border/70" />
                          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                            {formatDateDividerLabel(msg.created_at)}
                          </span>
                          <div className="h-px flex-1 bg-border/70" />
                        </div>
                      )}
                      <div className={`flex gap-4 ${rowSpacingClass} hover:bg-chat-hover rounded px-1 group`}>
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
                          <p className="text-sm text-foreground">
                            {msg.content}
                            {msg.client_status === "pending" && <span className="text-[10px] text-muted-foreground ml-1">(sending)</span>}
                            {msg.client_status === "retrying" && <span className="text-[10px] text-amber-600 ml-1">(retrying)</span>}
                            {msg.client_status === "failed" && <span className="text-[10px] text-destructive ml-1">(failed)</span>}
                          </p>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {activeConversationId && !isFriendsView && (
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
