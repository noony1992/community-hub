import { useState } from "react";
import { X, MessageSquare, AtSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useDMContext } from "@/context/DMContext";
import StatusIndicator from "./StatusIndicator";

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
}

const UserProfileCard = ({ user, open, onClose, position }: UserProfileCardProps) => {
  const { startConversation } = useDMContext();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const initials = user.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColor = `hsl(${(user.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)`;

  const handleDM = async () => {
    setLoading(true);
    await startConversation(user.id);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bg-card border border-border rounded-xl shadow-2xl w-80 overflow-hidden"
        style={position ? { top: position.top, left: position.left } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${avatarColor}, hsl(var(--primary)))` }}>
          <button onClick={onClose} className="absolute top-2 right-2 text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar */}
        <div className="px-4 -mt-8 relative">
          <div className="relative inline-block">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-foreground border-4 border-card"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
            <StatusIndicator status={user.status as any} className="absolute bottom-0 right-0" size="md" />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 pt-2">
          <h3 className="text-lg font-bold text-foreground">{user.display_name}</h3>
          <p className="text-sm text-muted-foreground">@{user.username}</p>

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
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            {loading ? "Opening..." : "Message"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileCard;
