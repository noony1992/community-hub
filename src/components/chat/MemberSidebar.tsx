import { useState } from "react";
import { useChatContext } from "@/context/ChatContext";
import StatusIndicator from "./StatusIndicator";
import UserProfileCard from "./UserProfileCard";

type SidebarMember = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  server_role?: string | null;
  role_position?: number | null;
  role_color?: string | null;
};

const MemberItem = ({
  user,
  onUserClick,
}: {
  user: SidebarMember;
  onUserClick: (user: SidebarMember, e: React.MouseEvent) => void;
}) => {
  const initials = user.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      onClick={(e) => onUserClick(user, e)}
      className="flex items-center gap-3 w-full px-2 py-1.5 rounded-md hover:bg-chat-hover transition-colors group"
      title={`View ${user.display_name}'s profile`}
    >
      <div className="relative shrink-0">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name}
            className={`w-8 h-8 rounded-full object-cover ${user.status === "offline" ? "opacity-40" : ""}`}
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground ${
              user.status === "offline" ? "opacity-40" : ""
            }`}
            style={{ backgroundColor: `hsl(${(user.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
          >
            {initials}
          </div>
        )}
        <StatusIndicator status={user.status as "online" | "idle" | "dnd" | "offline"} className="absolute -bottom-0.5 -right-0.5" />
      </div>
      <span className={`text-sm truncate ${user.status === "offline" ? "text-muted-foreground" : "text-secondary-foreground"}`}>
        {user.display_name}
      </span>
    </button>
  );
};

const MemberSidebar = ({ forceVisible = false }: { forceVisible?: boolean }) => {
  const { members, activeServerId } = useChatContext();
  const [profileUser, setProfileUser] = useState<typeof members[0] | null>(null);
  const [profilePos, setProfilePos] = useState<{ top: number; left: number } | undefined>();

  const offlineMembers = members
    .filter((member) => member.status === "offline")
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const groupedByRole = members
    .filter((member) => member.status !== "offline")
    .reduce<Record<string, typeof members>>((acc, member) => {
    const key = (member.server_role || "member").trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(member);
    return acc;
  }, {});

  const orderedRoleGroups = Object.entries(groupedByRole).sort(([roleA, membersA], [roleB, membersB]) => {
    const posA = membersA[0]?.role_position ?? -9999;
    const posB = membersB[0]?.role_position ?? -9999;
    if (posA !== posB) return posB - posA;
    return roleA.localeCompare(roleB);
  });

  const handleUserClick = (user: SidebarMember, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfilePos({ top: rect.top, left: rect.left - 330 });
    setProfileUser(user as typeof members[0]);
  };

  return (
    <div className={`${forceVisible ? "w-full h-full block" : "w-60 hidden lg:block"} bg-member-bar shrink-0 overflow-y-auto`}>
      <div className="px-4 py-4 space-y-4">
        {orderedRoleGroups.map(([roleName, roleMembers]) => {
          const sortedMembers = [...roleMembers].sort((a, b) => a.display_name.localeCompare(b.display_name));
          return (
            <div key={roleName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
                {roleName} - {roleMembers.length}
              </p>
              {sortedMembers.map((member) => (
                <MemberItem key={member.id} user={member as SidebarMember} onUserClick={handleUserClick} />
              ))}
            </div>
          );
        })}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
              Offline - {offlineMembers.length}
            </p>
            {offlineMembers.map((member) => (
              <MemberItem key={member.id} user={member as SidebarMember} onUserClick={handleUserClick} />
            ))}
          </div>
        )}
        {members.length === 0 && <p className="text-sm text-muted-foreground px-2">No members</p>}
      </div>

      {profileUser && (
        <UserProfileCard
          user={profileUser}
          open={!!profileUser}
          onClose={() => setProfileUser(null)}
          position={profilePos}
          serverId={activeServerId || undefined}
          serverRole={profileUser.server_role || undefined}
          serverRoleColor={profileUser.role_color || undefined}
        />
      )}
    </div>
  );
};

export default MemberSidebar;
