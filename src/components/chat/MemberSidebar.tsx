import { useEffect, useMemo, useState } from "react";
import { useChatContext } from "@/context/ChatContext";
import StatusIndicator from "./StatusIndicator";
import UserProfileCard from "./UserProfileCard";
import { MemberSidebarSkeleton } from "@/components/skeletons/AppSkeletons";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";
import { getRoleNamePresentation, type RoleBadgeAppearance } from "@/lib/roleAppearance";

type SidebarMember = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  server_role?: string | null;
  role_position?: number | null;
  role_color?: string | null;
  role_icon?: string | null;
  role_username_color?: string | null;
  role_username_style?: string | null;
  role_username_effect?: string | null;
  role_badges?: RoleBadgeAppearance[];
};

const MemberItem = ({
  user,
  onUserClick,
}: {
  user: SidebarMember;
  onUserClick: (user: SidebarMember, e: React.MouseEvent) => void;
}) => {
  const initials = user.display_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const roleNamePresentation = getRoleNamePresentation(user);
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
      <span
        className={`text-sm truncate ${user.status === "offline" ? "text-muted-foreground" : "text-secondary-foreground"} ${roleNamePresentation.className}`}
        style={roleNamePresentation.style}
      >
        {user.display_name}
      </span>
    </button>
  );
};

const MemberSidebar = ({ forceVisible = false }: { forceVisible?: boolean }) => {
  const { members, activeServerId, loadingMembers } = useChatContext();
  const [profileUser, setProfileUser] = useState<typeof members[0] | null>(null);
  const [profilePos, setProfilePos] = useState<{ top: number; left: number } | undefined>();
  const [visibleOnlineCount, setVisibleOnlineCount] = useState(200);
  const [visibleOfflineCount, setVisibleOfflineCount] = useState(120);
  const showingSkeleton = !!activeServerId && loadingMembers;
  const revealMembers = useLoadingReveal(showingSkeleton);

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

  useEffect(() => {
    setVisibleOnlineCount(200);
    setVisibleOfflineCount(120);
  }, [activeServerId]);

  const totalOnlineMembers = members.length - offlineMembers.length;
  const visibleRoleGroups = useMemo(() => {
    let remaining = visibleOnlineCount;
    return orderedRoleGroups
      .map(([roleName, roleMembers]) => {
        const sortedMembers = [...roleMembers].sort((a, b) => a.display_name.localeCompare(b.display_name));
        if (remaining <= 0) {
          return { roleName, members: [] as typeof sortedMembers, total: sortedMembers.length };
        }
        const nextVisible = sortedMembers.slice(0, remaining);
        remaining -= nextVisible.length;
        return { roleName, members: nextVisible, total: sortedMembers.length };
      })
      .filter((group) => group.members.length > 0);
  }, [orderedRoleGroups, visibleOnlineCount]);
  const visibleOfflineMembers = offlineMembers.slice(0, visibleOfflineCount);

  return (
    <div
      className={`${forceVisible ? "w-full h-full block" : "w-60 hidden lg:block"} bg-member-bar shrink-0 overflow-y-auto ${
        revealMembers ? "animate-in fade-in-0 duration-200 ease-out" : ""
      }`}
    >
      {showingSkeleton ? (
        <MemberSidebarSkeleton forceVisible={forceVisible} />
      ) : (
        <>
      <div className="px-4 py-4 space-y-4">
        {visibleRoleGroups.map(({ roleName, members: roleMembers, total }) => (
          <div key={roleName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
                {roleName} - {total}
              </p>
              {roleMembers.map((member) => (
                <MemberItem key={member.id} user={member as SidebarMember} onUserClick={handleUserClick} />
              ))}
          </div>
        ))}
        {totalOnlineMembers > visibleOnlineCount && (
          <button
            onClick={() => setVisibleOnlineCount((prev) => prev + 200)}
            className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Load More Members ({totalOnlineMembers - visibleOnlineCount} remaining)
          </button>
        )}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">
              Offline - {offlineMembers.length}
            </p>
            {visibleOfflineMembers.map((member) => (
              <MemberItem key={member.id} user={member as SidebarMember} onUserClick={handleUserClick} />
            ))}
            {offlineMembers.length > visibleOfflineCount && (
              <button
                onClick={() => setVisibleOfflineCount((prev) => prev + 120)}
                className="mt-2 w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Load More Offline ({offlineMembers.length - visibleOfflineCount} remaining)
              </button>
            )}
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
          serverRoleBadges={profileUser.role_badges || []}
        />
      )}
        </>
      )}
    </div>
  );
};

export default MemberSidebar;
