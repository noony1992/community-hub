import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, MessageSquare, AtSign, Calendar, MoreVertical, Shield } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useDMContext } from "@/context/DMContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StatusIndicator from "./StatusIndicator";
import UserModerationSidebar from "./UserModerationSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserProfileCardProps {
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    status: string;
    created_at?: string;
  };
  open: boolean;
  onClose: () => void;
  position?: { top: number; left: number };
  serverId?: string;
  serverRole?: string;
  serverRoleColor?: string;
}

const UserProfileCard = ({ user, open, onClose, position, serverId, serverRole, serverRoleColor }: UserProfileCardProps) => {
  const { user: currentUser } = useAuth();
  const { startConversation } = useDMContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [canOpenModMenu, setCanOpenModMenu] = useState(false);
  const [resolvedPosition, setResolvedPosition] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkPermission = async () => {
      if (!open || !serverId || !currentUser) {
        setCanOpenModMenu(false);
        return;
      }
      const { data } = await supabase.rpc("has_server_permission", {
        _server_id: serverId,
        _user_id: currentUser.id,
        _permission: "mod_menu",
      });
      setCanOpenModMenu(!!data);
    };
    void checkPermission();
  }, [open, serverId, currentUser]);

  useLayoutEffect(() => {
    if (!open || !position) {
      setResolvedPosition(null);
      return;
    }

    const card = cardRef.current;
    const cardHeight = card?.offsetHeight ?? 420;
    const cardWidth = card?.offsetWidth ?? 320;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const margin = 12;

    let nextTop = position.top;
    let nextLeft = position.left;

    // Flip above the anchor when opening downward would clip at the viewport bottom.
    if (nextTop + cardHeight + margin > viewportHeight) {
      nextTop = position.top - cardHeight - 8;
    }

    // Clamp into viewport.
    nextTop = Math.max(margin, Math.min(nextTop, viewportHeight - cardHeight - margin));
    nextLeft = Math.max(margin, Math.min(nextLeft, viewportWidth - cardWidth - margin));

    setResolvedPosition({ top: nextTop, left: nextLeft });
  }, [open, position, user.id, user.created_at, serverRole, canOpenModMenu]);

  if (!open) return null;

  const initials = user.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColor = `hsl(${(user.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)`;
  const isSelf = user.id === currentUser?.id;

  const handleDM = async () => {
    if (isSelf) {
      toast.error("You cannot message yourself.");
      return;
    }
    setLoading(true);
    const conversationId = await startConversation(user.id);
    setLoading(false);
    if (!conversationId) {
      toast.error("Could not open a direct message.");
      return;
    }
    onClose();
    navigate(`/?view=dm&dm=${encodeURIComponent(conversationId)}`);
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={cardRef}
        className="absolute bg-card border border-border rounded-xl shadow-2xl w-80 overflow-hidden"
        style={position
          ? { top: resolvedPosition?.top ?? position.top, left: resolvedPosition?.left ?? position.left }
          : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${avatarColor}, hsl(var(--primary)))` }}>
          {canOpenModMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="absolute top-2 right-8 text-white/70 hover:text-white">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => setShowModeration(true)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  <span>Moderate User</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button onClick={onClose} className="absolute top-2 right-2 text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar */}
        <div className="px-4 -mt-8 relative">
          <div className="relative inline-block">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="w-16 h-16 rounded-full object-cover border-4 border-card"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-foreground border-4 border-card"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
            )}
            <StatusIndicator status={user.status as "online" | "idle" | "dnd" | "offline"} className="absolute bottom-0 right-0" size="md" />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 pt-2">
          <h3 className="text-lg font-bold text-foreground">{user.display_name}</h3>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          {serverRole && (
            <span
              className="mt-2 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium"
              style={{ borderColor: serverRoleColor || "hsl(var(--border))", color: serverRoleColor || "hsl(var(--foreground))" }}
            >
              {serverRole}
            </span>
          )}

          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <AtSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Username:</span>
              <span className="text-foreground">{user.username}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${
                user.status === "online" ? "bg-status-online" :
                user.status === "idle" ? "bg-status-idle" :
                user.status === "dnd" ? "bg-status-dnd" : "bg-status-offline"
              }`} />
              <span className="text-muted-foreground">Status:</span>
              <span className="text-foreground capitalize">{user.status === "dnd" ? "Do Not Disturb" : user.status}</span>
            </div>
            {user.created_at && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Joined:</span>
                <span className="text-foreground">{format(new Date(user.created_at), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleDM}
            disabled={loading || isSelf}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            {loading ? "Opening..." : isSelf ? "Cannot Message Yourself" : "Message"}
          </button>
          <button
            onClick={() => {
              onClose();
              const suffix = serverId ? `?server=${serverId}` : "";
              navigate(`/profile/${user.id}${suffix}`);
            }}
            className="mt-2 w-full py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            View Full Profile
          </button>
        </div>
      </div>
      <UserModerationSidebar
        open={showModeration}
        onClose={() => setShowModeration(false)}
        serverId={serverId}
        user={user}
      />
    </div>
  );
};

export default UserProfileCard;
