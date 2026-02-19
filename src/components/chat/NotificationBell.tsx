import { useState, useEffect, useCallback } from "react";
import { Bell, X, MessageSquare, AtSign, Check, UserPlus, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link_server_id: string | null;
  link_channel_id: string | null;
  link_message_id: string | null;
  link_conversation_id: string | null;
  link_user_id: string | null;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data || []) as Notification[]);
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications();
  }, [loadNotifications, open]);

  useEffect(() => {
    if (!user) return;
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 10000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadNotifications, user]);

  // Realtime notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
  };

  const getIcon = (type: string) => {
    if (type === "mention") return <AtSign className="w-4 h-4 text-accent" />;
    if (type === "dm") return <MessageSquare className="w-4 h-4 text-primary" />;
    if (type === "thread_reply") return <MessageSquare className="w-4 h-4 text-accent" />;
    if (type === "keyword") return <AtSign className="w-4 h-4 text-primary" />;
    if (type === "friend_request") return <UserPlus className="w-4 h-4 text-primary" />;
    if (type === "event") return <CalendarDays className="w-4 h-4 text-primary" />;
    if (type === "event_rsvp") return <CalendarDays className="w-4 h-4 text-accent" />;
    return <Bell className="w-4 h-4 text-muted-foreground" />;
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);
    setOpen(false);

    if (notification.link_user_id) {
      navigate(`/profile/${notification.link_user_id}`);
      return;
    }

    if (notification.link_conversation_id) {
      navigate(`/?dm=${notification.link_conversation_id}`);
      return;
    }

    if (notification.link_channel_id) {
      const params = new URLSearchParams();
      if (notification.link_server_id) params.set("server", notification.link_server_id);
      params.set("channel", notification.link_channel_id);
      if (notification.link_message_id) {
        params.set("message", notification.link_message_id);
      }
      navigate(`/?${params.toString()}`);
    }
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="relative inline-flex h-5 w-5 items-center justify-center leading-none text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-5 h-5 block" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive">Clear all</button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleNotificationClick(n)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-chat-hover transition-colors ${!n.is_read ? "bg-secondary/30" : ""}`}
              >
                <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${!n.is_read ? "text-foreground font-medium" : "text-muted-foreground"}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
