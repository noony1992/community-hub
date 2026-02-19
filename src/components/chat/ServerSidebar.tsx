import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { useDMContext } from "@/context/DMContext";
import { Plus, MessageCircle, LogIn, Compass } from "lucide-react";
import JoinServerDialog from "./JoinServerDialog";

const ServerSidebar = () => {
  const { servers, activeServerId, setActiveServer, createServer, refreshServers } = useChatContext();
  const { isDMMode, setIsDMMode, setActiveConversation } = useDMContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const icon = newName.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    await createServer(newName.trim(), icon);
    setNewName("");
    setShowCreate(false);
  };

  const handleServerClick = (id: string) => {
    setIsDMMode(false);
    setActiveConversation(null);
    setActiveServer(id);
    navigate("/");
  };

  return (
    <div className="flex flex-col items-center w-[72px] bg-server-bar py-3 gap-2 overflow-y-auto shrink-0">
      <button
        onClick={() => {
          setIsDMMode(true);
          setActiveConversation(null);
          navigate("/?view=dm");
        }}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          isDMMode ? "rounded-xl bg-primary text-primary-foreground" : "bg-chat-area text-foreground hover:rounded-xl hover:bg-primary hover:text-primary-foreground"
        }`}
        title="Direct Messages"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      <div className="w-8 h-[2px] bg-border rounded-full" />

      <button
        onClick={() => navigate("/discover")}
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

      {servers.map((server) => {
        const isActive = server.id === activeServerId && !isDMMode;
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
                <span className={isActive ? "text-primary-foreground" : "text-foreground"}>
                  {server.icon || server.name[0]}
                </span>
              )}
            </button>
          </div>
        );
      })}

      <div className="w-8 h-[2px] bg-border rounded-full" />

      {showCreate && (
        <div className="fixed left-[80px] top-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-lg p-4 shadow-xl w-64">
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
