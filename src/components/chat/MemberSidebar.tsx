import { mockUsers } from "@/data/mockData";
import StatusIndicator from "./StatusIndicator";
import { User } from "@/data/types";

const MemberSidebar = () => {
  const online = mockUsers.filter((u) => u.status === "online" || u.status === "idle" || u.status === "dnd");
  const offline = mockUsers.filter((u) => u.status === "offline");

  const MemberItem = ({ user }: { user: User }) => (
    <button className="flex items-center gap-3 w-full px-2 py-1.5 rounded-md hover:bg-chat-hover transition-colors group">
      <div className="relative shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
            user.status === "offline" ? "opacity-40" : ""
          }`}
          style={{ backgroundColor: `hsl(${(user.id.charCodeAt(1) || 0) * 60}, 50%, 40%)` }}
        >
          <span className="text-foreground">{user.avatar}</span>
        </div>
        <StatusIndicator status={user.status} className="absolute -bottom-0.5 -right-0.5" />
      </div>
      <span className={`text-sm truncate ${user.status === "offline" ? "text-muted-foreground" : "text-secondary-foreground"}`}>
        {user.displayName}
      </span>
    </button>
  );

  return (
    <div className="w-60 bg-member-bar shrink-0 overflow-y-auto hidden lg:block">
      <div className="px-4 py-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
            Online — {online.length}
          </p>
          {online.map((u) => (
            <MemberItem key={u.id} user={u} />
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
            Offline — {offline.length}
          </p>
          {offline.map((u) => (
            <MemberItem key={u.id} user={u} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemberSidebar;
