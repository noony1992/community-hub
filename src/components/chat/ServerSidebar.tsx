import { useChatContext } from "@/context/ChatContext";
import { Plus, Compass } from "lucide-react";

const ServerSidebar = () => {
  const { servers, activeServerId, setActiveServer } = useChatContext();

  return (
    <div className="flex flex-col items-center w-[72px] bg-server-bar py-3 gap-2 overflow-y-auto shrink-0">
      {/* Home / DMs button */}
      <button
        className="w-12 h-12 rounded-2xl bg-chat-area flex items-center justify-center text-foreground hover:rounded-xl hover:bg-primary transition-all duration-200 mb-1"
        title="Home"
      >
        <Compass className="w-6 h-6" />
      </button>

      <div className="w-8 h-[2px] bg-border rounded-full" />

      {servers.map((server) => {
        const isActive = server.id === activeServerId;
        return (
          <div key={server.id} className="relative group flex items-center">
            {/* Active indicator pill */}
            <div
              className={`absolute left-0 w-1 rounded-r-full bg-foreground transition-all duration-200 ${
                isActive ? "h-10" : "h-0 group-hover:h-5"
              }`}
            />
            <button
              onClick={() => setActiveServer(server.id)}
              className={`w-12 h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? "rounded-xl"
                  : "rounded-[24px] hover:rounded-xl"
              }`}
              style={{ backgroundColor: isActive ? server.color : undefined }}
              title={server.name}
            >
              <span
                className={isActive ? "text-primary-foreground" : "text-foreground"}
                style={!isActive ? {} : undefined}
              >
                {server.icon}
              </span>
            </button>
          </div>
        );
      })}

      <div className="w-8 h-[2px] bg-border rounded-full" />

      <button className="w-12 h-12 rounded-[24px] bg-chat-area flex items-center justify-center text-status-online hover:rounded-xl hover:bg-status-online hover:text-primary-foreground transition-all duration-200">
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

export default ServerSidebar;
