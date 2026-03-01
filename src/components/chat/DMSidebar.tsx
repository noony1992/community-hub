import { useEffect, useRef, useState } from "react";
import { useDMContext } from "@/context/DMContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Search, Users, ChevronRight, X } from "lucide-react";
import StatusIndicator from "./StatusIndicator";
import { getEffectiveStatus } from "@/lib/presence";
import BottomLeftDock from "./BottomLeftDock";
import { DMSidebarSkeleton } from "@/components/skeletons/AppSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";

type DMSidebarProps = {
  embedded?: boolean;
  onNavigate?: () => void;
};

type SearchProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  updated_at: string | null;
};

const DMSidebar = ({ embedded = false, onNavigate }: DMSidebarProps) => {
  const { user } = useAuth();
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    startConversation,
    isFriendsView,
    setIsFriendsView,
    dmUnreadCountByConversation,
    pendingFriendRequestCount,
    loadingConversations,
  } = useDMContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRequestSeqRef = useRef(0);
  const showingSkeleton = loadingConversations && conversations.length === 0 && !searchQuery;
  const revealConversations = useLoadingReveal(showingSkeleton);

  if (showingSkeleton) {
    return <DMSidebarSkeleton embedded={embedded} />;
  }

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !user?.id) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const requestSeq = ++searchRequestSeqRef.current;
    setSearching(true);
    const timerId = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, status, updated_at")
        .neq("id", user.id)
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      if (requestSeq !== searchRequestSeqRef.current) return;
      setSearchResults((data || []) as SearchProfile[]);
      setSearching(false);
    }, 220);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [searchQuery, user?.id]);

  const handleStartDM = async (userId: string) => {
    await startConversation(userId);
    setIsFriendsView(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    onNavigate?.();
  };

  return (
    <div
      className={`flex flex-col bg-channel-bar shrink-0 ${embedded ? "w-full h-full" : "w-60"} ${
        revealConversations ? "animate-in fade-in-0 duration-200 ease-out" : ""
      }`}
    >
      <div className="h-12 px-4 flex items-center border-b border-border/50">
        <span className="font-semibold text-foreground">Direct Messages</span>
      </div>

      {/* User search */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find or start a conversation"
            className="w-full pl-8 pr-8 py-1.5 rounded-md bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border focus:ring-1 focus:ring-primary/50"
          />
          {searchQuery && (
            <button onClick={() => { searchRequestSeqRef.current += 1; setSearchQuery(""); setSearchResults([]); setSearching(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchQuery && (
          <div className="mt-1 bg-card border border-border rounded-md overflow-hidden">
            {searching && (
              <div className="space-y-2.5 p-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 px-1 py-2">
                    <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-3.5 w-14" />
                        {i % 2 === 0 && <Skeleton className="h-3.5 w-10" />}
                      </div>
                      <Skeleton className="h-3 w-11" />
                    </div>
                    </div>
                    {i === 1 && (
                      <Skeleton className="h-20 w-36 rounded-md ml-12" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {!searching && searchResults.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No users found</p>}
            {searchResults.map((p) => {
              const initials = p.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button
                  key={p.id}
                  onClick={() => handleStartDM(p.id)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-chat-hover transition-colors"
                >
                  <div className="relative shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.display_name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground"
                        style={{ backgroundColor: `hsl(${(p.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                      >
                        {initials}
                      </div>
                    )}
                    <StatusIndicator status={getEffectiveStatus(p.status, p.updated_at)} className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-foreground truncate">{p.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={() => setIsFriendsView(!isFriendsView)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-colors ${
            isFriendsView
              ? "bg-primary/15 border border-primary/35 text-primary"
              : "bg-secondary/70 border border-border text-foreground hover:bg-secondary"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${isFriendsView ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
              <Users className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">Friends Hub</span>
              <span className={`block text-[11px] leading-tight ${isFriendsView ? "text-primary/80" : "text-muted-foreground"}`}>
                Browse friends and start DMs
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {pendingFriendRequestCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                {pendingFriendRequestCount > 99 ? "99+" : pendingFriendRequestCount}
              </span>
            )}
            <ChevronRight className={`w-4 h-4 transition-transform ${isFriendsView ? "rotate-90" : ""}`} />
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {conversations.length === 0 && !searchQuery && (
          <p className="text-sm text-muted-foreground px-2 py-4">No conversations yet. Search for a user above to start a DM.</p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const p = conv.participant;
          const unreadCount = dmUnreadCountByConversation[conv.id] || 0;
          const initials = p.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          return (
            <button
              key={conv.id}
              onClick={() => {
                setIsFriendsView(false);
                setActiveConversation(conv.id);
                onNavigate?.();
              }}
              className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
              }`}
            >
              <div className="relative shrink-0">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={p.display_name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground"
                    style={{ backgroundColor: `hsl(${(p.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                  >
                    {initials}
                  </div>
                )}
                <StatusIndicator status={getEffectiveStatus(p.status, p.updated_at)} className="absolute -bottom-0.5 -right-0.5" />
              </div>
              <span className={`truncate ${unreadCount > 0 && !isActive ? "font-semibold text-foreground" : ""}`}>
                {p.display_name}
              </span>
              {unreadCount > 0 && !isActive && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <BottomLeftDock embedded={embedded} expandIntoServerRail={!embedded} />
    </div>
  );
};

export default DMSidebar;
