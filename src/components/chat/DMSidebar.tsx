import { useDMContext } from "@/context/DMContext";
import StatusIndicator from "./StatusIndicator";

const DMSidebar = () => {
  const { conversations, activeConversationId, setActiveConversation } = useDMContext();

  return (
    <div className="flex flex-col w-60 bg-channel-bar shrink-0">
      <div className="h-12 px-4 flex items-center border-b border-border/50">
        <span className="font-semibold text-foreground">Direct Messages</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground px-2 py-4">No conversations yet. Click on a member to start a DM.</p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const p = conv.participant;
          const initials = p.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          return (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
              }`}
            >
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground"
                  style={{ backgroundColor: `hsl(${(p.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                >
                  {initials}
                </div>
                <StatusIndicator status={p.status as any} className="absolute -bottom-0.5 -right-0.5" />
              </div>
              <span className="truncate">{p.display_name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DMSidebar;
