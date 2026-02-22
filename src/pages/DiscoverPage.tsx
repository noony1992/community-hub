import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Compass, Users, PanelLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import ServerSidebar from "@/components/chat/ServerSidebar";
import BanAppealDialog from "@/components/chat/BanAppealDialog";
import BottomLeftDock from "@/components/chat/BottomLeftDock";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DiscoverGridSkeleton } from "@/components/skeletons/AppSkeletons";

interface DiscoverServer {
  id: string;
  name: string;
  icon: string | null;
  icon_url: string | null;
  banner_url: string | null;
}

const DiscoverPage = () => {
  const { user } = useAuth();
  const { servers: joinedServers, refreshServers, setActiveServer } = useChatContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [banAppealServerId, setBanAppealServerId] = useState<string | null>(null);
  const [banAppealOpen, setBanAppealOpen] = useState(false);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const joinedIds = useMemo(() => new Set(joinedServers.map((s) => s.id)), [joinedServers]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let request = supabase
        .from("servers")
        .select("id, name, icon, icon_url, banner_url")
        .eq("is_discoverable", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (query.trim()) request = request.ilike("name", `%${query.trim()}%`);
      const { data } = await request;
      setResults((data || []) as DiscoverServer[]);
      setLoading(false);
    };
    load();
  }, [query]);

  const handleJoin = async (serverId: string) => {
    if (!user) return;
    setJoiningId(serverId);

    const { data: activeBan } = await supabase.rpc("is_server_banned", {
      _server_id: serverId,
      _user_id: user.id,
    });

    if (activeBan) {
      setJoiningId(null);
      setBanAppealServerId(serverId);
      setBanAppealOpen(true);
      return;
    }

    const { error } = await supabase
      .from("server_members")
      .insert({ server_id: serverId, user_id: user.id });

    if (error && error.code !== "23505") {
      setJoiningId(null);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("row-level security") || msg.includes("permission")) {
        setBanAppealServerId(serverId);
        setBanAppealOpen(true);
      } else {
        alert(`Failed to join server: ${error.message}`);
      }
      return;
    }

    await refreshServers();
    setActiveServer(serverId);
    setJoiningId(null);
    navigate("/");
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      {!isMobile && <ServerSidebar />}
      <div className="flex-1 min-w-0 bg-chat-area p-4 sm:p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <Compass className="w-6 h-6 text-primary" />
              Discover Servers
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Browse and join public community servers.</p>
            </div>
            {isMobile && (
              <button
                onClick={() => setMobileNavOpen(true)}
                className="shrink-0 rounded-md border border-border bg-secondary px-2.5 py-2 text-secondary-foreground"
                title="Open navigation"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search servers by name..."
              className="w-full pl-9 pr-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {loading && <DiscoverGridSkeleton />}

          {!loading && results.length === 0 && (
            <div className="text-sm text-muted-foreground bg-secondary/40 rounded-md p-4 border border-border/60">
              No discoverable servers found.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((server) => {
              const joined = joinedIds.has(server.id);
              return (
                <div key={server.id} className="rounded-lg border border-border/60 overflow-hidden bg-card">
                  {server.banner_url ? (
                    <img src={server.banner_url} alt={`${server.name} banner`} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="h-28 w-full bg-gradient-to-br from-primary/25 to-primary/5" />
                  )}

                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-secondary overflow-hidden flex items-center justify-center text-foreground font-semibold">
                        {server.icon_url ? (
                          <img src={server.icon_url} alt={`${server.name} icon`} className="w-full h-full object-cover" />
                        ) : (
                          <span>{server.icon || server.name[0]}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{server.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Community server
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (joined) {
                          setActiveServer(server.id);
                          navigate("/");
                          return;
                        }
                        void handleJoin(server.id);
                      }}
                      disabled={joiningId === server.id}
                      className="w-full py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {joiningId === server.id ? "Joining..." : joined ? "Open Server" : "Join Server"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <BanAppealDialog
        open={banAppealOpen}
        onOpenChange={setBanAppealOpen}
        serverId={banAppealServerId}
      />
      {!isMobile && (
        <div className="fixed bottom-0 left-[72px] z-30 w-60">
          <BottomLeftDock expandIntoServerRail />
        </div>
      )}
      {isMobile && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
            <ServerSidebar mode="sheet" onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default DiscoverPage;
