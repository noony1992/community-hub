import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { useDMContext } from "@/context/DMContext";
import { Plus, MessageCircle, LogIn, Compass } from "lucide-react";
import JoinServerDialog from "./JoinServerDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";

type ServerSidebarProps = {
  mode?: "rail" | "sheet";
  onNavigate?: () => void;
};

const ServerSidebar = ({ mode = "rail", onNavigate }: ServerSidebarProps) => {
  const { servers, activeServerId, setActiveServer, createServer, loadingServers } = useChatContext();
  const { isDMMode, setIsDMMode, setActiveConversation, totalDmUnreadCount, pendingFriendRequestCount } = useDMContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const isSheet = mode === "sheet";
  const isDiscoverRoute = location.pathname.startsWith("/discover");
  const isDMActive = isDMMode && !isDiscoverRoute;
  const totalDmIndicatorCount = totalDmUnreadCount + pendingFriendRequestCount;
  const revealServers = useLoadingReveal(loadingServers);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const icon = newName.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    await createServer(newName.trim(), icon);
    setNewName("");
    setShowCreate(false);
    onNavigate?.();
  };

  const handleServerClick = (id: string) => {
    setIsDMMode(false);
    setActiveConversation(null);
    setActiveServer(id);
    navigate("/");
    onNavigate?.();
  };

  const handleOpenDMs = () => {
    setIsDMMode(true);
    setActiveConversation(null);
    navigate("/?view=dm");
    onNavigate?.();
  };

  const handleOpenDiscover = () => {
    setIsDMMode(false);
    setActiveConversation(null);
    navigate("/discover");
    onNavigate?.();
  };

  if (isSheet) {
    return (
      <div className="flex h-full flex-col bg-channel-bar">
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Navigation</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            onClick={handleOpenDMs}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
              isDMActive ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:opacity-90"
            }`}
          >
            <span className="inline-flex items-center gap-2 w-full">
              <MessageCircle className="h-4 w-4" />
              Direct Messages
              {totalDmIndicatorCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold inline-flex items-center justify-center">
                  {totalDmIndicatorCount > 99 ? "99+" : totalDmIndicatorCount}
                </span>
              )}
            </span>
          </button>

          <button
            onClick={handleOpenDiscover}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
              location.pathname.startsWith("/discover")
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:opacity-90"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Compass className="h-4 w-4" />
              Discover
            </span>
          </button>

          <div className="pt-2">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Servers
            </p>
            <div className="space-y-1">
              {loadingServers && Array.from({ length: 6 }).map((_, idx) => (
                <div key={`server-skeleton-${idx}`} className="flex items-center gap-3 px-2 py-2.5">
                  <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-5 w-14" />
                    {idx % 2 === 1 && <Skeleton className="h-5 w-8" />}
                  </div>
                </div>
              ))}
              {!loadingServers && (
                <div className={revealServers ? "space-y-1 animate-in fade-in-0 duration-200 ease-out" : "space-y-1"}>
                  {servers.map((server) => {
                    const isActive = server.id === activeServerId && !isDMMode && !isDiscoverRoute;
                    return (
                      <button
                        key={server.id}
                        onClick={() => handleServerClick(server.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                          isActive ? "bg-primary text-primary-foreground" : "hover:bg-chat-hover text-foreground"
                        }`}
                      >
                        <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-background/60">
                          {server.icon_url ? (
                            <img src={server.icon_url} alt={`${server.name} icon`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold">
                              {server.icon || server.name[0]}
                            </div>
                          )}
                        </div>
                        <span className="truncate">{server.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 p-3 space-y-2">
          {showCreate && (
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                placeholder="Server name"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleCreate()}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground"
            >
              <LogIn className="h-4 w-4" />
              Join
            </button>
          </div>
        </div>

        <JoinServerDialog open={showJoin} onClose={() => setShowJoin(false)} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center w-[72px] bg-server-bar py-3 gap-2 overflow-y-auto shrink-0">
      <button
        onClick={handleOpenDMs}
        className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          isDMActive ? "rounded-xl bg-primary text-primary-foreground" : "bg-chat-area text-foreground hover:rounded-xl hover:bg-primary hover:text-primary-foreground"
        }`}
        title="Direct Messages"
      >
        <MessageCircle className="w-6 h-6" />
        {totalDmIndicatorCount > 0 && (
          <span className="absolute top-2 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center">
            {totalDmIndicatorCount > 99 ? "99+" : totalDmIndicatorCount}
          </span>
        )}
      </button>

      <div className="w-8 h-[2px] bg-border rounded-full" />

      <button
        onClick={handleOpenDiscover}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          location.pathname.startsWith("/discover")
            ? "rounded-xl bg-primary text-primary-foreground"
            : "bg-chat-area text-foreground hover:rounded-xl hover:bg-primary hover:text-primary-foreground"
        }`}
        title="Discover"
      >
        <Compass className="w-5 h-5" />
      </button>

      <div className="w-8 h-[2px] bg-border rounded-full" />

      {loadingServers && Array.from({ length: 7 }).map((_, idx) => (
        <div key={`server-rail-skeleton-${idx}`} className="relative group flex items-center">
          <Skeleton className="w-12 h-12 rounded-2xl" />
        </div>
      ))}

      {!loadingServers && (
        <div className={revealServers ? "animate-in fade-in-0 duration-200 ease-out space-y-2" : "space-y-2"}>
          {servers.map((server) => {
            const isActive = server.id === activeServerId && !isDMMode && !isDiscoverRoute;
            return (
              <div key={server.id} className="relative group flex items-center">
                <div className={`absolute left-0 w-1 rounded-r-full bg-foreground transition-all duration-200 ${isActive ? "h-10" : "h-0 group-hover:h-5"}`} />
                <button
                  onClick={() => handleServerClick(server.id)}
                  className={`w-12 h-12 overflow-hidden flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "rounded-xl text-primary-foreground"
                      : "rounded-[24px] text-foreground hover:rounded-xl hover:text-primary-foreground"
                  }`}
                  title={server.name}
                >
                  {server.icon_url ? (
                    <img
                      src={server.icon_url}
                      alt={`${server.name} icon`}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <span className={isActive ? "text-foreground" : "text-foreground"}>
                      {server.icon || server.name[0]}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="w-8 h-[2px] bg-border rounded-full" />

      {showCreate && (
        <div className="fixed left-[80px] top-1/2 -translate-y-1/2 z-[120] bg-card border border-border rounded-lg p-4 shadow-xl w-64">
          <p className="text-sm font-semibold text-foreground mb-2">Create Server</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Server name"
            className="w-full px-3 py-2 rounded-md bg-background text-foreground border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
            <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm">Cancel</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowCreate(true)}
        className="w-12 h-12 rounded-[24px] bg-chat-area flex items-center justify-center text-status-online hover:rounded-xl hover:bg-status-online hover:text-primary-foreground transition-all duration-200"
        title="Create Server"
      >
        <Plus className="w-6 h-6" />
      </button>

      <button
        onClick={() => setShowJoin(true)}
        className="w-12 h-12 rounded-[24px] bg-chat-area flex items-center justify-center text-primary hover:rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-200"
        title="Join Server"
      >
        <LogIn className="w-5 h-5" />
      </button>

      <JoinServerDialog open={showJoin} onClose={() => setShowJoin(false)} />
    </div>
  );
};

export default ServerSidebar;
