import { useChatContext } from "@/context/ChatContext";
import StatusIndicator from "./StatusIndicator";

const MemberSidebar = () => {
  const { members } = useChatContext();

  const online = members.filter((u) => u.status !== "offline");
  const offline = members.filter((u) => u.status === "offline");

  const MemberItem = ({ user }: { user: typeof members[0] }) => {
    const initials = user.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <button className="flex items-center gap-3 w-full px-2 py-1.5 rounded-md hover:bg-chat-hover transition-colors group">
        <div className="relative shrink-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground ${
              user.status === "offline" ? "opacity-40" : ""
            }`}
            style={{ backgroundColor: `hsl(${(user.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
          >
            {initials}
          </div>
          <StatusIndicator status={user.status as any} className="absolute -bottom-0.5 -right-0.5" />
        </div>
        <span className={`text-sm truncate ${user.status === "offline" ? "text-muted-foreground" : "text-secondary-foreground"}`}>
          {user.display_name}
        </span>
      </button>
    );
  };

  return (
    <div className="w-60 bg-member-bar shrink-0 overflow-y-auto hidden lg:block">
      <div className="px-4 py-4 space-y-4">
        {online.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
              Online — {online.length}
            </p>
            {online.map((u) => (
              <MemberItem key={u.id} user={u} />
            ))}
          </div>
        )}
        {offline.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
              Offline — {offline.length}
            </p>
            {offline.map((u) => (
              <MemberItem key={u.id} user={u} />
            ))}
          </div>
        )}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground px-2">No members</p>
        )}
      </div>
    </div>
  );
};

export default MemberSidebar;
