import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { useDMContext } from "@/context/DMContext";
import { useAuth } from "@/context/AuthContext";
import { AtSign, PlusCircle, Gift, Smile, SendHorizonal, PanelLeft, Menu } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StatusIndicator from "./StatusIndicator";
import { getEffectiveStatus } from "@/lib/presence";

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
  const { activeConversationId, conversations, dmMessages, sendDM, startConversation, isFriendsView } = useDMContext();
  const [input, setInput] = useState("");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const participant = conversation?.participant;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages.length]);

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
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MM/dd/yyyy h:mm a");
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

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-chat-area">
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isFriendsView && (
          <div className="space-y-2">
            {loadingFriends && <p className="text-sm text-muted-foreground">Loading friends...</p>}
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
          const showDateDivider = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
          const isGrouped = prevMsg?.user_id === msg.user_id &&
            !showDateDivider &&
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;

          const displayName = sender?.display_name || "Unknown";
          const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          if (isGrouped) {
            return (
              <Fragment key={msg.id}>
                <div className="pl-[52px] py-0.5 hover:bg-chat-hover rounded group relative">
                  <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[38px] mt-0.5">
                    {format(new Date(msg.created_at), "h:mm a")}
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
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatDateDividerLabel(msg.created_at)}
                  </span>
                  <div className="h-px flex-1 bg-border/70" />
                </div>
              )}
              <div className={`flex gap-3 py-1 hover:bg-chat-hover rounded px-1 group ${i > 0 ? "mt-3" : ""}`}>
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
