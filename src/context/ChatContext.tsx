import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getEffectiveStatus } from "@/lib/presence";
import { encodeAnnouncement } from "@/lib/messageFeatures";
import { contentMatchesKeyword, isWithinQuietHours, type UserNotificationMute, type UserNotificationSettings } from "@/lib/notificationPreferences";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { auditLog } from "@/lib/auditLog";
import { showOperationErrorToast } from "@/lib/errorToasts";
import { RetryQueue } from "@/lib/retryQueue";
import { toast } from "sonner";
import type { RoleBadgeAppearance, RoleTextEffect, RoleTextStyle } from "@/lib/roleAppearance";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  updated_at?: string | null;
  server_role?: string | null;
  role_color?: string | null;
  role_position?: number | null;
  role_permissions?: string[];
  role_icon?: string | null;
  role_username_color?: string | null;
  role_username_style?: RoleTextStyle | null;
  role_username_effect?: RoleTextEffect | null;
  role_badges?: RoleBadgeAppearance[];
}

interface Server {
  id: string;
  name: string;
  icon: string | null;
  icon_url: string | null;
  banner_url: string | null;
  is_discoverable: boolean;
  color: string;
  owner_id: string;
  owner_group_name: string;
  owner_role_color?: string | null;
  owner_role_icon?: string | null;
  owner_role_username_color?: string | null;
  owner_role_username_style?: RoleTextStyle | null;
  owner_role_username_effect?: RoleTextEffect | null;
  onboarding_welcome_title?: string | null;
  onboarding_welcome_message?: string | null;
  onboarding_rules_text?: string | null;
}

interface Channel {
  id: string;
  server_id: string;
  group_id: string | null;
  name: string;
  type: string;
}

interface ChannelGroup {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at: string;
}

type ActiveTemporaryRoleGrant = {
  user_id: string;
  role_id: string;
  expires_at: string | null;
};

type RolePermissionOverride = {
  role_id: string;
  scope_type: "group" | "channel";
  scope_id: string;
  allow_permissions: string[];
  deny_permissions: string[];
};

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  reply_to: string | null;
  client_status?: "pending" | "retrying" | "failed";
  client_request_id?: string | null;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface ModerationState {
  muted_until: string | null;
  timed_out_until: string | null;
  is_banned: boolean;
}

export interface MessageSearchFilters {
  user?: string;
  channel?: string;
  date?: string;
  hasAttachment?: boolean;
  pinned?: boolean;
}

export interface MessageSearchResult {
  message: Message;
  channel_name: string;
  server_name: string;
  server_id: string;
  author_name: string;
}

interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  channels: Channel[];
  channelGroups: ChannelGroup[];
  messages: Message[];
  members: Profile[];
  profile: Profile | null;
  reactions: Record<string, Reaction[]>;
  setActiveServer: (id: string) => void;
  setActiveChannel: (id: string) => void;
  sendMessage: (content: string, attachment?: { url: string; name: string; type: string }, replyTo?: string) => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  createServer: (name: string, icon: string) => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshChannels: () => Promise<void>;
  refreshChannelGroups: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  searchMessages: (query: string, filters?: MessageSearchFilters) => Promise<MessageSearchResult[]>;
  pinMessage: (messageId: string) => Promise<void>;
  unpinMessage: (messageId: string) => Promise<void>;
  getPinnedMessages: () => Promise<Message[]>;
  getThreadReplies: (messageId: string) => Promise<Message[]>;
  isThreadFollowed: (parentMessageId: string) => boolean;
  toggleThreadFollow: (parentMessage: Message) => Promise<void>;
  scheduleMessage: (payload: { content: string; sendAt: string; isAnnouncement?: boolean; replyTo?: string | null }) => Promise<{ ok: boolean; error?: string }>;
  loadingServers: boolean;
  loadingChannels: boolean;
  loadingMessages: boolean;
  loadingMembers: boolean;
  typingUsers: Profile[];
  setTyping: (isTyping: boolean) => void;
  moderationState: ModerationState;
  unreadCountByChannel: Record<string, number>;
  channelLastReadAtByChannel: Record<string, string | null>;
  markChannelAsRead: (channelId?: string) => Promise<void>;
}

const containsEveryoneMention = (value: string) => /(^|[^\w])@everyone\b/i.test(value);

const ChatContext = createContext<ChatState | null>(null);

export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [moderationState, setModerationState] = useState<ModerationState>({
    muted_until: null,
    timed_out_until: null,
    is_banned: false,
  });
  const [unreadCountByChannel, setUnreadCountByChannel] = useState<Record<string, number>>({});
  const [channelLastReadAtByChannel, setChannelLastReadAtByChannel] = useState<Record<string, string | null>>({});
  const [followedThreadIds, setFollowedThreadIds] = useState<Set<string>>(new Set());
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingSubscribedRef = useRef(false);
  const desiredTypingStateRef = useRef(false);
  const lastTrackedTypingStateRef = useRef<boolean | null>(null);
  const membersRef = useRef<Profile[]>([]);
  const channelsRef = useRef<Channel[]>([]);
  const activeServerIdRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const userIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const messageRetryQueueRef = useRef(new RetryQueue());
  const hasLoadedServersRef = useRef(false);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    profileRef.current = profile;
    userIdRef.current = user?.id ?? null;
  }, [profile, user]);
  const typingUserId = user?.id;
  const typingDisplayName = profile?.display_name;
  const applyEffectivePresence = useCallback((entry: Profile): Profile => ({
    ...entry,
    status: getEffectiveStatus(entry.status, entry.updated_at),
  }), []);
  const hasRenderableProfileChange = useCallback((prev: Profile, next: Profile) => (
    prev.status !== next.status ||
    prev.username !== next.username ||
    prev.display_name !== next.display_name ||
    prev.avatar_url !== next.avatar_url
  ), []);
  const sameServerList = useCallback((prev: Server[], next: Server[]) => (
    prev.length === next.length &&
    prev.every((server, index) => {
      const rhs = next[index];
      return !!rhs &&
        server.id === rhs.id &&
        server.name === rhs.name &&
        server.icon === rhs.icon &&
        server.icon_url === rhs.icon_url &&
        server.banner_url === rhs.banner_url &&
        server.is_discoverable === rhs.is_discoverable &&
        server.color === rhs.color &&
        server.owner_id === rhs.owner_id &&
        server.owner_group_name === rhs.owner_group_name;
    })
  ), []);

  useEffect(() => {
    if (!activeServerId) return;

    const statusChannel = supabase
      .channel(`member-status:${activeServerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const next = payload.new as {
            id: string;
            status?: string;
            username?: string;
            display_name?: string;
            avatar_url?: string | null;
            updated_at?: string;
          };

          const isMember = membersRef.current.some((member) => member.id === next.id);
          if (!isMember) return;

          setMembers((prev) => {
            let changed = false;
            const updated = prev.map((member) => {
              if (member.id !== next.id) return member;
              const merged = applyEffectivePresence({
                ...member,
                status: next.status ?? member.status,
                username: next.username ?? member.username,
                display_name: next.display_name ?? member.display_name,
                avatar_url: next.avatar_url === undefined ? member.avatar_url : next.avatar_url,
                updated_at: next.updated_at ?? member.updated_at,
              });
              if (!hasRenderableProfileChange(member, merged)) return member;
              changed = true;
              return merged;
            });
            return changed ? updated : prev;
          });

          if (userIdRef.current === next.id) {
            setProfile((prev) =>
              prev
                ? (() => {
                    const merged = applyEffectivePresence({
                      ...prev,
                      status: next.status ?? prev.status,
                      username: next.username ?? prev.username,
                      display_name: next.display_name ?? prev.display_name,
                      avatar_url: next.avatar_url === undefined ? prev.avatar_url : next.avatar_url,
                      updated_at: next.updated_at ?? prev.updated_at,
                    });
                    return hasRenderableProfileChange(prev, merged) ? merged : prev;
                  })()
                : prev,
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
    };
  }, [activeServerId, applyEffectivePresence, hasRenderableProfileChange]);

  useEffect(() => {
    if (!activeServerId) return;

    const syncMemberStatuses = async () => {
      const ids = membersRef.current.map((member) => member.id);
      if (ids.length === 0) return;

      const { data } = await supabase
        .from("profiles")
        .select("id, status, username, display_name, avatar_url, updated_at")
        .in("id", ids);

      if (!data || data.length === 0) return;
      const statusById = new Map(data.map((row) => [row.id, row]));

      setMembers((prev) => {
        let changed = false;
        const updated = prev.map((member) => {
          const next = statusById.get(member.id);
          if (!next) return member;
          const merged = applyEffectivePresence({
            ...member,
            status: next.status ?? member.status,
            username: next.username ?? member.username,
            display_name: next.display_name ?? member.display_name,
            avatar_url: next.avatar_url === undefined ? member.avatar_url : next.avatar_url,
            updated_at: next.updated_at ?? member.updated_at,
          });
          if (!hasRenderableProfileChange(member, merged)) return member;
          changed = true;
          return merged;
        });
        return changed ? updated : prev;
      });

      if (userIdRef.current) {
        const nextSelf = statusById.get(userIdRef.current);
        if (nextSelf) {
          setProfile((prev) =>
            prev
              ? (() => {
                  const merged = applyEffectivePresence({
                    ...prev,
                    status: nextSelf.status ?? prev.status,
                    username: nextSelf.username ?? prev.username,
                    display_name: nextSelf.display_name ?? prev.display_name,
                    avatar_url: nextSelf.avatar_url === undefined ? prev.avatar_url : nextSelf.avatar_url,
                    updated_at: nextSelf.updated_at ?? prev.updated_at,
                  });
                  return hasRenderableProfileChange(prev, merged) ? merged : prev;
                })()
              : prev,
          );
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncMemberStatuses();
      }
    };

    void syncMemberStatuses();
    const intervalId = window.setInterval(() => {
      void syncMemberStatuses();
    }, 15000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeServerId, applyEffectivePresence, hasRenderableProfileChange]);

  const fetchModerationState = useCallback(async (serverId: string) => {
    if (!user) {
      return { muted_until: null, timed_out_until: null, is_banned: false } as ModerationState;
    }

    const [{ data: membership }, { data: banned }] = await Promise.all([
      supabase
        .from("server_members")
        .select("muted_until, timed_out_until")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("is_server_banned", {
        _server_id: serverId,
        _user_id: user.id,
      }),
    ]);

    return {
      muted_until: membership?.muted_until || null,
      timed_out_until: membership?.timed_out_until || null,
      is_banned: !!banned,
    } as ModerationState;
  }, [user]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) {
      const nextProfile = applyEffectivePresence(data as Profile);
      setProfile(nextProfile);
      // Preserve server-specific role metadata on the member list entry.
      setMembers((prev) =>
        prev.map((m) => (m.id === nextProfile.id ? applyEffectivePresence({ ...m, ...nextProfile }) : m)),
      );
    }
  }, [applyEffectivePresence, user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const filterOutBannedServerIds = useCallback(async (serverIds: string[]) => {
    if (!user) return [];
    if (serverIds.length === 0) return [];

    const checks = await Promise.all(
      serverIds.map(async (serverId) => {
        const { data: banned } = await supabase.rpc("is_server_banned", {
          _server_id: serverId,
          _user_id: user.id,
        });
        return banned ? null : serverId;
      }),
    );

    return checks.filter((id): id is string => !!id);
  }, [user]);

  const refreshServers = useCallback(async () => {
    if (!user) return;
    const shouldToggleLoading = !hasLoadedServersRef.current;
    if (shouldToggleLoading) {
      setLoadingServers(true);
    }

    const { data: memberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", user.id);

    const rawServerIds = Array.from(new Set((memberships || []).map((m) => m.server_id)));
    const serverIds = await filterOutBannedServerIds(rawServerIds);
    if (serverIds.length === 0) {
      setServers((prev) => (prev.length === 0 ? prev : []));
      if (activeServerIdRef.current !== null) {
        setActiveServerId(null);
        setActiveChannelId(null);
      }
      hasLoadedServersRef.current = true;
      if (shouldToggleLoading) {
        setLoadingServers(false);
      }
      return;
    }

    const { data } = await supabase.from("servers").select("*").in("id", serverIds);
    const serverList = (data || []) as Server[];
    setServers((prev) => (sameServerList(prev, serverList) ? prev : serverList));

    // Keep active server in sync after leave/delete operations.
    const currentActiveServerId = activeServerIdRef.current;
    if (serverList.length === 0) {
      if (currentActiveServerId !== null) {
        setActiveServerId(null);
        setActiveChannelId(null);
      }
    } else if (!currentActiveServerId || !serverList.some((s) => s.id === currentActiveServerId)) {
      setActiveServerId(serverList[0].id);
    }

    hasLoadedServersRef.current = true;
    if (shouldToggleLoading) {
      setLoadingServers(false);
    }
  }, [filterOutBannedServerIds, sameServerList, user]);

  useEffect(() => {
    if (!user) {
      hasLoadedServersRef.current = false;
      setServers([]);
      setActiveServerId(null);
      setActiveChannelId(null);
      setLoadingServers(false);
      return;
    }
    void refreshServers();
  }, [refreshServers, user]);

  useEffect(() => {
    if (!user) return;

    const membershipAndBanChannel = supabase
      .channel(`membership-ban-self:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_members", filter: `user_id=eq.${user.id}` },
        () => {
          void refreshServers();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_bans", filter: `banned_user_id=eq.${user.id}` },
        () => {
          void refreshServers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membershipAndBanChannel);
    };
  }, [user, refreshServers]);

  useEffect(() => {
    if (!user) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshServers();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, refreshServers]);

  const refreshChannels = useCallback(async () => {
    if (!activeServerId) return;
    const requestServerId = activeServerId;
    const { data } = await supabase.from("channels").select("*").eq("server_id", requestServerId);
    if (activeServerIdRef.current !== requestServerId) return;
    setChannels((data || []) as Channel[]);
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId || !user) {
      setModerationState({ muted_until: null, timed_out_until: null, is_banned: false });
      return;
    }

    const loadCurrentModerationState = async () => {
      const nextState = await fetchModerationState(activeServerId);
      setModerationState(nextState);
    };

    void loadCurrentModerationState();

    const membersRealtime = supabase
      .channel(`server-members-self:${activeServerId}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "server_members", filter: `server_id=eq.${activeServerId}` },
        (payload) => {
          const next = payload.new as { user_id: string; muted_until: string | null; timed_out_until: string | null };
          if (next.user_id !== user.id) return;

          const prev = payload.old as { muted_until: string | null; timed_out_until: string | null };
          const timedOutStarted = !prev?.timed_out_until && !!next.timed_out_until;
          const mutedStarted = !prev?.muted_until && !!next.muted_until;

          setModerationState((curr) => ({
            ...curr,
            muted_until: next.muted_until || null,
            timed_out_until: next.timed_out_until || null,
          }));

          if (timedOutStarted && next.timed_out_until) {
            toast.error(`You were timed out until ${new Date(next.timed_out_until).toLocaleString()}`);
          }
          if (mutedStarted && next.muted_until) {
            toast.error(`You were muted until ${new Date(next.muted_until).toLocaleString()}`);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "server_members", filter: `server_id=eq.${activeServerId}` },
        (payload) => {
          const old = payload.old as { user_id: string };
          if (old.user_id !== user.id) return;
          toast.error("You were removed from this server.");
          void refreshServers();
        },
      )
      .subscribe();

    const bansRealtime = supabase
      .channel(`server-bans-self:${activeServerId}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "server_bans", filter: `server_id=eq.${activeServerId}` },
        (payload) => {
          const ban = payload.new as { banned_user_id: string };
          if (ban.banned_user_id !== user.id) return;
          setModerationState((curr) => ({ ...curr, is_banned: true }));
          toast.error("You were banned from this server.");
          void refreshServers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membersRealtime);
      supabase.removeChannel(bansRealtime);
    };
  }, [activeServerId, fetchModerationState, refreshServers, user]);

  const refreshChannelGroups = useCallback(async () => {
    if (!activeServerId) return;
    const requestServerId = activeServerId;
    const { data } = await supabase
      .from("channel_groups")
      .select("*")
      .eq("server_id", requestServerId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (activeServerIdRef.current !== requestServerId) return;
    setChannelGroups((data || []) as ChannelGroup[]);
  }, [activeServerId]);

  const refreshChannelReadState = useCallback(async () => {
    if (!user?.id || !activeServerId) {
      setUnreadCountByChannel({});
      setChannelLastReadAtByChannel({});
      return;
    }

    const textChannelIds = channels
      .filter((c) => c.type === "text" || c.type === "forum")
      .map((c) => c.id);
    if (textChannelIds.length === 0) {
      setUnreadCountByChannel({});
      setChannelLastReadAtByChannel({});
      return;
    }

    const { data: reads } = await supabase
      .from("channel_reads")
      .select("channel_id, last_read_at")
      .eq("user_id", user.id)
      .in("channel_id", textChannelIds);

    const readMap = new Map<string, string>((reads || []).map((row) => [row.channel_id, row.last_read_at]));
    const nextLastRead: Record<string, string | null> = {};
    textChannelIds.forEach((channelId) => {
      nextLastRead[channelId] = readMap.get(channelId) || null;
    });
    setChannelLastReadAtByChannel(nextLastRead);

    const unreadEntries = await Promise.all(
      textChannelIds.map(async (channelId) => {
        if (channelId === activeChannelId && document.visibilityState === "visible") {
          return [channelId, 0] as const;
        }

        const lastReadAt = readMap.get(channelId);
        let query = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channelId)
          .is("reply_to", null);

        if (lastReadAt) {
          query = query.gt("created_at", lastReadAt);
        }

        const { count } = await query;
        return [channelId, count || 0] as const;
      }),
    );

    setUnreadCountByChannel(Object.fromEntries(unreadEntries));
  }, [activeChannelId, activeServerId, channels, user?.id]);

  const markChannelAsRead = useCallback(async (channelId?: string) => {
    if (!user?.id) return;
    const targetChannelId = channelId || activeChannelId;
    if (!targetChannelId) return;

    let lastReadAt = new Date().toISOString();
    const { data: latest } = await supabase
      .from("messages")
      .select("created_at")
      .eq("channel_id", targetChannelId)
      .is("reply_to", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.created_at) lastReadAt = latest.created_at;

    await supabase.from("channel_reads").upsert(
      {
        user_id: user.id,
        channel_id: targetChannelId,
        last_read_at: lastReadAt,
      },
      { onConflict: "user_id,channel_id" },
    );

    setChannelLastReadAtByChannel((prev) => ({ ...prev, [targetChannelId]: lastReadAt }));
    setUnreadCountByChannel((prev) => ({ ...prev, [targetChannelId]: 0 }));
  }, [activeChannelId, user?.id]);

  const resolveEffectivePermissions = useCallback(
    (
      basePermissions: string[],
      roleIds: string[],
      overrides: RolePermissionOverride[],
      activeScope: { channelId: string | null; groupId: string | null },
    ) => {
      const next = new Set(basePermissions);
      const activeRoleIds = new Set(roleIds);

      const applyScope = (scopeType: "group" | "channel", scopeId: string | null) => {
        if (!scopeId) return;
        const relevant = overrides.filter(
          (override) =>
            override.scope_type === scopeType &&
            override.scope_id === scopeId &&
            activeRoleIds.has(override.role_id),
        );
        relevant.forEach((override) => {
          (override.deny_permissions || []).forEach((permission) => {
            next.delete(permission);
          });
        });
        relevant.forEach((override) => {
          (override.allow_permissions || []).forEach((permission) => {
            next.add(permission);
          });
        });
      };

      // Group applies first, channel applies second so channel-level config wins.
      applyScope("group", activeScope.groupId);
      applyScope("channel", activeScope.channelId);

      return Array.from(next);
    },
    [],
  );

  const loadMembers = useCallback(async () => {
    if (!activeServerId) {
      setLoadingMembers(false);
      return;
    }
    if (membersRef.current.length === 0) {
      setLoadingMembers(true);
    }
    const activeServer = servers.find((s) => s.id === activeServerId);
    const ownerGroupName = activeServer?.owner_group_name || "Owner";
    const ownerRoleColor = activeServer?.owner_role_color || "#f59e0b";
    const ownerRoleIcon = activeServer?.owner_role_icon || null;
    const ownerRoleUsernameColor = activeServer?.owner_role_username_color || ownerRoleColor;
    const ownerRoleUsernameStyle: RoleTextStyle =
      activeServer?.owner_role_username_style === "normal" ||
      activeServer?.owner_role_username_style === "italic" ||
      activeServer?.owner_role_username_style === "underline"
        ? activeServer.owner_role_username_style
        : "bold";
    const ownerRoleUsernameEffect: RoleTextEffect =
      activeServer?.owner_role_username_effect === "none" ||
      activeServer?.owner_role_username_effect === "shadow"
        ? activeServer.owner_role_username_effect
        : "glow";
    const { data: memberships } = await supabase
      .from("server_members")
      .select("user_id, role")
      .eq("server_id", activeServerId);

    if (!memberships || memberships.length === 0) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    const userIds = memberships.map((m) => m.user_id);
    const nowIso = new Date().toISOString();
    const activeChannelForPermissions = channelsRef.current.find((channel) => channel.id === activeChannelIdRef.current) || null;
    const activeGroupIdForPermissions = activeChannelForPermissions?.group_id || null;

    const overrideScopeFilter = activeChannelForPermissions
      ? activeGroupIdForPermissions
        ? `and(scope_type.eq.channel,scope_id.eq.${activeChannelForPermissions.id}),and(scope_type.eq.group,scope_id.eq.${activeGroupIdForPermissions})`
        : `and(scope_type.eq.channel,scope_id.eq.${activeChannelForPermissions.id})`
      : null;

    const [
      { data: profiles },
      { data: serverRoles },
      { data: temporaryRoleGrantRows },
      { data: overrideRows },
    ] = await Promise.all([
      supabase.from("profiles").select("*").in("id", userIds),
      supabase
        .from("server_roles")
        .select("id, name, color, position, permissions, icon, username_color, username_style, username_effect")
        .eq("server_id", activeServerId),
      (supabase as any)
        .from("server_temporary_role_grants")
        .select("user_id, role_id, expires_at")
        .eq("server_id", activeServerId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      overrideScopeFilter
        ? (supabase as any)
            .from("role_permission_overrides")
            .select("role_id, scope_type, scope_id, allow_permissions, deny_permissions")
            .eq("server_id", activeServerId)
            .or(overrideScopeFilter)
        : Promise.resolve({ data: [] as RolePermissionOverride[] }),
    ]);

    const roleMap = new Map<string, {
      id: string;
      color: string;
      position: number;
      permissions: string[];
      icon: string | null;
      username_color: string | null;
      username_style: RoleTextStyle;
      username_effect: RoleTextEffect;
    }>();
    const roleById = new Map<string, {
      id: string;
      name: string;
      color: string;
      position: number;
      permissions: string[];
      icon: string | null;
      username_color: string | null;
      username_style: RoleTextStyle;
      username_effect: RoleTextEffect;
    }>();
    (serverRoles || []).forEach((role) => {
      const normalizedPermissions = Array.isArray(role.permissions)
        ? role.permissions.filter((p): p is string => typeof p === "string")
        : [];
      const normalizedStyle: RoleTextStyle = role.username_style === "bold" || role.username_style === "italic" || role.username_style === "underline"
        ? role.username_style
        : "normal";
      const normalizedEffect: RoleTextEffect = role.username_effect === "glow" || role.username_effect === "shadow"
        ? role.username_effect
        : "none";
      roleMap.set(role.name.toLowerCase(), {
        id: role.id,
        color: role.color,
        position: role.position,
        permissions: normalizedPermissions,
        icon: role.icon || null,
        username_color: role.username_color || null,
        username_style: normalizedStyle,
        username_effect: normalizedEffect,
      });
      roleById.set(role.id, {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: normalizedPermissions,
        icon: role.icon || null,
        username_color: role.username_color || null,
        username_style: normalizedStyle,
        username_effect: normalizedEffect,
      });
    });

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const activeTemporaryRoleGrants = ((temporaryRoleGrantRows || []) as ActiveTemporaryRoleGrant[]).filter((grant) =>
      !grant.expires_at || new Date(grant.expires_at).getTime() > Date.now(),
    );
    const temporaryRoleIdsByUser = new Map<string, Set<string>>();
    activeTemporaryRoleGrants.forEach((grant) => {
      const bucket = temporaryRoleIdsByUser.get(grant.user_id) || new Set<string>();
      bucket.add(grant.role_id);
      temporaryRoleIdsByUser.set(grant.user_id, bucket);
    });
    const activeOverrides = ((overrideRows || []) as Array<{
      role_id: string;
      scope_type: "group" | "channel";
      scope_id: string;
      allow_permissions: unknown;
      deny_permissions: unknown;
    }>).map((override) => ({
      role_id: override.role_id,
      scope_type: override.scope_type,
      scope_id: override.scope_id,
      allow_permissions: Array.isArray(override.allow_permissions)
        ? override.allow_permissions.filter((p): p is string => typeof p === "string")
        : [],
      deny_permissions: Array.isArray(override.deny_permissions)
        ? override.deny_permissions.filter((p): p is string => typeof p === "string")
        : [],
    }));
    const enriched = memberships
      .map((membership) => {
        const base = profileMap.get(membership.user_id);
        if (!base) return null;
        const roleName = membership.role as string;
        const displayRoleName = roleName === "owner" ? ownerGroupName : roleName;
        const roleMeta = roleMap.get(roleName.toLowerCase());
        const temporaryRoleIds = temporaryRoleIdsByUser.get(membership.user_id) || new Set<string>();
        const allRoleIds = new Set<string>();
        const basePermissions = new Set<string>(roleMeta?.permissions || []);
        const roleBadges: RoleBadgeAppearance[] = [];
        if (roleMeta?.id) allRoleIds.add(roleMeta.id);
        if (roleMeta) {
          roleBadges.push({
            id: roleMeta.id,
            name: displayRoleName,
            color: roleMeta.color,
            icon: roleMeta.icon,
            username_color: roleMeta.username_color,
            username_style: roleMeta.username_style,
            username_effect: roleMeta.username_effect,
            position: roleMeta.position,
          });
        } else if (roleName === "owner") {
          roleBadges.push({
            name: ownerGroupName,
            color: ownerRoleColor,
            icon: ownerRoleIcon,
            username_color: ownerRoleUsernameColor,
            username_style: ownerRoleUsernameStyle,
            username_effect: ownerRoleUsernameEffect,
            position: Number.MAX_SAFE_INTEGER,
          });
        }
        temporaryRoleIds.forEach((roleId) => {
          const tempRole = roleById.get(roleId);
          if (!tempRole) return;
          allRoleIds.add(roleId);
          tempRole.permissions.forEach((permission) => basePermissions.add(permission));
          roleBadges.push({
            id: tempRole.id,
            name: tempRole.name,
            color: tempRole.color,
            icon: tempRole.icon,
            username_color: tempRole.username_color,
            username_style: tempRole.username_style,
            username_effect: tempRole.username_effect,
            position: tempRole.position,
          });
        });
        const uniqueRoleBadges = Array.from(
          new Map(roleBadges.map((badge) => [`${badge.id || badge.name.toLowerCase()}`, badge])).values(),
        ).sort((a, b) => (b.position || 0) - (a.position || 0));
        const topRoleBadge = uniqueRoleBadges[0] || null;
        const effectivePermissions = resolveEffectivePermissions(
          Array.from(basePermissions),
          Array.from(allRoleIds),
          activeOverrides,
          {
            channelId: activeChannelForPermissions?.id || null,
            groupId: activeGroupIdForPermissions,
          },
        );
        return {
          ...(base as Profile),
          server_role: topRoleBadge?.name || displayRoleName,
          role_color: topRoleBadge?.color || null,
          role_icon: topRoleBadge?.icon || null,
          role_position: typeof topRoleBadge?.position === "number" ? topRoleBadge.position : null,
          role_username_color: topRoleBadge?.username_color || null,
          role_username_style: topRoleBadge?.username_style || "normal",
          role_username_effect: topRoleBadge?.username_effect || "none",
          role_badges: uniqueRoleBadges,
          role_permissions: effectivePermissions,
        } as Profile;
      })
      .filter((entry: Profile | null): entry is Profile => !!entry);

    enriched.sort((a, b) => {
      const aPos = a.role_position ?? -9999;
      const bPos = b.role_position ?? -9999;
      if (aPos !== bPos) return bPos - aPos;
      return a.display_name.localeCompare(b.display_name);
    });

    setMembers(enriched.map(applyEffectivePresence));
    setLoadingMembers(false);
  }, [activeServerId, applyEffectivePresence, resolveEffectivePermissions, servers]);

  useEffect(() => {
    if (!activeServerId) {
      setLoadingChannels(false);
      setLoadingMembers(false);
      return;
    }
    const requestServerId = activeServerId;
    setLoadingChannels(true);
    setLoadingMembers(true);
    setChannels([]);
    setChannelGroups([]);
    setActiveChannelId(null);

    const loadChannels = async () => {
      const { data } = await supabase.from("channels").select("*").eq("server_id", requestServerId);
      if (activeServerIdRef.current !== requestServerId) return;
      const channelList = (data || []) as Channel[];
      setChannels(channelList);
      setActiveChannelId((prev) => {
        if (prev && channelList.some((c) => c.id === prev)) return prev;
        const firstConversationChannel = channelList.find((c) => c.type === "text" || c.type === "forum");
        return firstConversationChannel?.id || null;
      });
      setLoadingChannels(false);
    };
    loadChannels();

    const loadChannelGroups = async () => {
      const { data } = await supabase
        .from("channel_groups")
        .select("*")
        .eq("server_id", requestServerId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (activeServerIdRef.current !== requestServerId) return;
      setChannelGroups((data || []) as ChannelGroup[]);
    };
    loadChannelGroups();

    void loadMembers();

    const membersChannel = supabase
      .channel(`server-members-list:${activeServerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_members", filter: `server_id=eq.${activeServerId}` },
        () => {
          void loadMembers();
        },
      )
      .subscribe();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadMembers();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(membersChannel);
    };
  }, [activeServerId, loadMembers]);

  useEffect(() => {
    if (!activeServerId || !user) {
      setUnreadCountByChannel({});
      setChannelLastReadAtByChannel({});
      return;
    }

    void refreshChannelReadState();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshChannelReadState();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeServerId, refreshChannelReadState, user]);

  useEffect(() => {
    if (!activeServerId || !user) return;
    const textChannelIds = new Set(
      channels
        .filter((c) => c.type === "text" || c.type === "forum")
        .map((c) => c.id),
    );
    if (textChannelIds.size === 0) return;

    const unreadRealtime = supabase
      .channel(`unread-messages:${activeServerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const next = payload.new as {
            id: string;
            channel_id: string;
            user_id: string;
            content: string;
            reply_to: string | null;
          };
          if (!textChannelIds.has(next.channel_id)) return;
          if (next.user_id === user.id) return;

          if (next.reply_to) {
            if (!followedThreadIds.has(next.reply_to)) return;
            const senderName = membersRef.current.find((m) => m.id === next.user_id)?.display_name || "Someone";
            void (async () => {
              const { count } = await supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("user_id", user.id)
                .eq("type", "thread_reply")
                .eq("link_message_id", next.id);
              if ((count || 0) > 0) return;

              await supabase.from("notifications").insert({
                user_id: user.id,
                type: "thread_reply",
                title: `${senderName} replied to a thread you follow`,
                body: next.content.slice(0, 100),
                link_channel_id: next.channel_id,
                link_server_id: activeServerId,
                link_message_id: next.id,
              });
            })();
            return;
          }
          if (next.channel_id === activeChannelId && document.visibilityState === "visible") return;

          setUnreadCountByChannel((prev) => ({
            ...prev,
            [next.channel_id]: (prev[next.channel_id] || 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(unreadRealtime);
    };
  }, [activeChannelId, activeServerId, channels, followedThreadIds, user]);

  // Clear channel-scoped data before paint so previous-channel content never flashes.
  useLayoutEffect(() => {
    setMessages([]);
    setReactions({});
  }, [activeChannelId]);

  // Load messages + reactions + realtime
  useEffect(() => {
    if (!activeChannelId) {
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    const currentChannelId = activeChannelId;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages").select("*")
        .eq("channel_id", currentChannelId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (activeChannelIdRef.current !== currentChannelId) return;
      const baseMsgs = (data || []) as Message[];
      const existingIds = new Set(baseMsgs.map((m) => m.id));
      const missingParentIds = Array.from(
        new Set(
          baseMsgs
            .map((m) => m.reply_to)
            .filter((id): id is string => !!id && !existingIds.has(id)),
        ),
      );

      let mergedMsgs = baseMsgs;
      if (missingParentIds.length > 0) {
        const { data: parentRows } = await supabase
          .from("messages")
          .select("*")
          .in("id", missingParentIds);
        if (activeChannelIdRef.current !== currentChannelId) return;
        const parentMsgs = (parentRows || []) as Message[];
        mergedMsgs = [...baseMsgs, ...parentMsgs];
      }

      const msgs = mergedMsgs.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setMessages((prev) => {
        if (
          prev.length === msgs.length &&
          prev.every((m, i) =>
            m.id === msgs[i].id &&
            m.content === msgs[i].content &&
            m.edited_at === msgs[i].edited_at &&
            m.pinned_at === msgs[i].pinned_at &&
            m.reply_to === msgs[i].reply_to &&
            m.attachment_url === msgs[i].attachment_url &&
            m.attachment_name === msgs[i].attachment_name &&
            m.attachment_type === msgs[i].attachment_type,
          )
        ) {
          return prev;
        }
        return msgs;
      });

      if (msgs.length > 0) {
        const msgIds = msgs.map(m => m.id);
        const { data: rxns } = await supabase.from("reactions").select("*").in("message_id", msgIds);
        if (activeChannelIdRef.current !== currentChannelId) return;
        const grouped: Record<string, Reaction[]> = {};
        (rxns || []).forEach((r) => {
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          grouped[r.message_id].push(r as Reaction);
        });
        setReactions(grouped);
      }
      setLoadingMessages(false);
    };
    void loadMessages();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadMessages();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const channel = supabase
      .channel(`messages:${activeChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const optimisticIndex = prev.findIndex((m) => {
              if (!m.id.startsWith("optimistic:")) return false;
              if (m.user_id !== incoming.user_id) return false;
              if ((m.reply_to || null) !== (incoming.reply_to || null)) return false;
              if ((m.content || "") !== (incoming.content || "")) return false;
              if ((m.attachment_url || null) !== (incoming.attachment_url || null)) return false;
              const optimisticTs = new Date(m.created_at).getTime();
              const incomingTs = new Date(incoming.created_at).getTime();
              return Math.abs(incomingTs - optimisticTs) < 30_000;
            });

            if (optimisticIndex >= 0) {
              const next = [...prev];
              next[optimisticIndex] = incoming;
              return next;
            }

            return [...prev, incoming];
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => prev.map((m) => m.id === payload.new.id ? (payload.new as Message) : m)); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => { setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)); })
      .subscribe();

    const rxnChannel = supabase
      .channel(`reactions:${activeChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, (payload) => {
        const incoming = payload.new as Reaction;
        const currentMessageIds = new Set(messagesRef.current.map((m) => m.id));
        if (!currentMessageIds.has(incoming.message_id)) return;
        setReactions((prev) => {
          const existingForMessage = prev[incoming.message_id] || [];
          if (existingForMessage.some((rxn) => rxn.id === incoming.id)) return prev;
          if (existingForMessage.some((rxn) => rxn.user_id === incoming.user_id && rxn.emoji === incoming.emoji)) return prev;
          return {
            ...prev,
            [incoming.message_id]: [...existingForMessage, incoming],
          };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (payload) => {
        const removed = payload.old as { id: string; message_id: string };
        setReactions((prev) => {
          const existingForMessage = prev[removed.message_id];
          if (!existingForMessage || existingForMessage.length === 0) return prev;
          const nextForMessage = existingForMessage.filter((rxn) => rxn.id !== removed.id);
          if (nextForMessage.length === existingForMessage.length) return prev;
          if (nextForMessage.length === 0) {
            const { [removed.message_id]: _omit, ...rest } = prev;
            return rest;
          }
          return {
            ...prev,
            [removed.message_id]: nextForMessage,
          };
        });
      })
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
      supabase.removeChannel(rxnChannel);
    };
  }, [activeChannelId]);

  useEffect(() => {
    if (!user?.id || !activeChannelId) {
      setFollowedThreadIds(new Set());
      return;
    }

    const loadThreadSubscriptions = async () => {
      const { data } = await (supabase as any)
        .from("thread_subscriptions")
        .select("parent_message_id")
        .eq("user_id", user.id)
        .eq("channel_id", activeChannelId);
      const next = new Set<string>(((data || []) as Array<{ parent_message_id: string }>).map((row) => row.parent_message_id));
      setFollowedThreadIds(next);
    };

    void loadThreadSubscriptions();
  }, [activeChannelId, user?.id]);

  // Typing indicator
  useEffect(() => {
    if (!activeChannelId || !typingUserId || !typingDisplayName) {
      setTypingUsers([]);
      typingChannelRef.current = null;
      typingSubscribedRef.current = false;
      desiredTypingStateRef.current = false;
      lastTrackedTypingStateRef.current = null;
      return;
    }

    const channel = supabase.channel(`typing:${activeChannelId}`, {
      config: { presence: { key: typingUserId } },
    });

    const syncTypingUsersFromPresence = () => {
      const state = channel.presenceState();
      const typing: Profile[] = [];
      Object.entries(state).forEach(([uid, presences]) => {
        const presenceList = presences as Array<{ typing?: boolean; display_name?: string }>;
        const anyTyping = presenceList.some((p) => !!p?.typing);
        if (uid !== typingUserId && anyTyping) {
          const member = membersRef.current.find((m) => m.id === uid);
          if (member) {
            typing.push(member);
            return;
          }

          const displayName = presenceList.find((p) => p.display_name)?.display_name || "Someone";
          typing.push({
            id: uid,
            username: displayName.toLowerCase().replace(/\s+/g, "-"),
            display_name: displayName,
            avatar_url: null,
            status: "online",
          });
        }
      });
      setTypingUsers(typing);
    };

    channel.on("presence", { event: "sync" }, syncTypingUsersFromPresence);
    channel.on("presence", { event: "join" }, syncTypingUsersFromPresence);
    channel.on("presence", { event: "leave" }, syncTypingUsersFromPresence);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        typingChannelRef.current = channel;
        typingSubscribedRef.current = true;
        lastTrackedTypingStateRef.current = desiredTypingStateRef.current;
        void channel.track({
          typing: desiredTypingStateRef.current,
          user_id: typingUserId,
          display_name: typingDisplayName,
        });
      }
    });

    return () => {
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
      }
      typingSubscribedRef.current = false;
      desiredTypingStateRef.current = false;
      lastTrackedTypingStateRef.current = null;
      setTypingUsers([]);
      channel.track({ typing: false });
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, typingUserId, typingDisplayName]);

  const setTyping = useCallback((isTyping: boolean) => {
    desiredTypingStateRef.current = isTyping;
    if (!typingSubscribedRef.current || !typingChannelRef.current) return;
    if (lastTrackedTypingStateRef.current === isTyping) return;
    lastTrackedTypingStateRef.current = isTyping;
    void typingChannelRef.current.track({
      typing: isTyping,
      user_id: userIdRef.current,
      display_name: profileRef.current?.display_name || "Someone",
    });
  }, []);

  const setActiveServer = useCallback((id: string) => {
    setActiveServerId((prev) => {
      if (prev === id) return prev;
      setActiveChannelId(null);
      setChannels([]);
      setChannelGroups([]);
      setLoadingChannels(true);
      setLoadingMessages(true);
      return id;
    });
  }, []);

  const setActiveChannel = useCallback((id: string) => {
    setActiveChannelId((prev) => {
      if (prev === id) return prev;
      setLoadingMessages(true);
      return id;
    });

    // Opening a channel should clear its unread badge immediately.
    setUnreadCountByChannel((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: 0 };
    });
    void markChannelAsRead(id);
  }, [markChannelAsRead]);

  const processScheduledMessages = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const { data } = await (supabase as any)
      .from("scheduled_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lte("send_at", nowIso)
      .order("send_at", { ascending: true })
      .limit(20);

    const rows = (data || []) as Array<{
      id: string;
      channel_id: string;
      content: string;
      reply_to: string | null;
      failed_attempts: number;
    }>;
    if (rows.length === 0) return;

    await Promise.all(rows.map(async (row) => {
      const { data: inserted, error: sendError } = await supabase
        .from("messages")
        .insert({
          channel_id: row.channel_id,
          user_id: user.id,
          content: row.content,
          reply_to: row.reply_to,
        })
        .select("id")
        .single();

      if (sendError || !inserted?.id) {
        await (supabase as any)
          .from("scheduled_messages")
          .update({
            failed_attempts: (row.failed_attempts || 0) + 1,
            last_error: sendError?.message || "Unknown error",
          })
          .eq("id", row.id)
          .eq("status", "pending");
        return;
      }

      await (supabase as any)
        .from("scheduled_messages")
        .update({
          status: "sent",
          sent_message_id: inserted.id,
        })
        .eq("id", row.id)
        .eq("status", "pending");
    }));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void processScheduledMessages();
    const interval = window.setInterval(() => {
      void processScheduledMessages();
    }, 15000);
    return () => {
      window.clearInterval(interval);
    };
  }, [processScheduledMessages, user]);

  const createMessageNotifications = useCallback(async (content: string, channelId: string, serverId: string, messageId: string) => {
    if (!user) return;

    const channel = channels.find((c) => c.id === channelId);
    const { data: memberRows } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId);

    const recipientIds = Array.from(
      new Set((memberRows || []).map((row) => row.user_id).filter((id) => id !== user.id)),
    );
    if (recipientIds.length === 0) return;

    const mentionRegex = /@(\w+)/g;
    const mentionedUserIds = new Set<string>();
    let hasEveryoneMention = false;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const token = (match[1] || "").toLowerCase();
      if (token === "everyone") {
        hasEveryoneMention = true;
        continue;
      }
      const mentionedUser = members.find((m) => m.username.toLowerCase() === token);
      if (mentionedUser && mentionedUser.id !== user.id) {
        mentionedUserIds.add(mentionedUser.id);
      }
    }

    const { data: settingsRows } = await supabase
      .from("user_notification_settings")
      .select("user_id, mention_only, keyword_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
      .in("user_id", recipientIds);

    const { data: muteRows } = await supabase
      .from("user_notification_mutes")
      .select("user_id, scope_type, scope_id")
      .in("user_id", recipientIds)
      .or(`and(scope_type.eq.server,scope_id.eq.${serverId}),and(scope_type.eq.channel,scope_id.eq.${channelId})`);

    const settingsByUser = new Map<string, UserNotificationSettings>(
      (settingsRows || []).map((row) => [row.user_id, row as UserNotificationSettings]),
    );
    const mutesByUser = new Map<string, UserNotificationMute[]>();
    (muteRows || []).forEach((row) => {
      const key = row.user_id;
      if (!mutesByUser.has(key)) mutesByUser.set(key, []);
      mutesByUser.get(key)!.push(row as UserNotificationMute);
    });

    const inserts = recipientIds.flatMap((recipientId) => {
      const userSettings = settingsByUser.get(recipientId);
      const userMutes = mutesByUser.get(recipientId) || [];
      const mutedServer = userMutes.some((m) => m.scope_type === "server" && m.scope_id === serverId);
      const mutedChannel = userMutes.some((m) => m.scope_type === "channel" && m.scope_id === channelId);
      if (mutedServer || mutedChannel) return [];
      if (userSettings && isWithinQuietHours(userSettings)) return [];

      const isMention = hasEveryoneMention || mentionedUserIds.has(recipientId);
      if (isMention) {
        return [{
          user_id: recipientId,
          type: "mention",
          title: hasEveryoneMention
            ? `${profile?.display_name || "Someone"} mentioned @everyone in #${channel?.name || "channel"}`
            : `${profile?.display_name || "Someone"} mentioned you in #${channel?.name || "channel"}`,
          body: content.slice(0, 100),
          link_channel_id: channelId,
          link_server_id: serverId,
          link_message_id: messageId,
        }];
      }

      if (userSettings?.mention_only) return [];
      if (!contentMatchesKeyword(content, userSettings?.keyword_alerts)) return [];
      return [{
        user_id: recipientId,
        type: "keyword",
        title: `${profile?.display_name || "Someone"} mentioned one of your keywords in #${channel?.name || "channel"}`,
        body: content.slice(0, 100),
        link_channel_id: channelId,
        link_server_id: serverId,
        link_message_id: messageId,
      }];
    });

    if (inserts.length > 0) {
      const { error } = await supabase.from("notifications").insert(inserts);
      if (error) {
        auditLog({
          level: "warn",
          scope: "chat.message_notifications",
          event: "insert_failed",
          details: {
            error: error.message,
            recipient_count: inserts.length,
            channel_id: channelId,
            server_id: serverId,
          },
        });
      }
    }
  }, [channels, members, profile, user]);

  const notifyThreadSubscribers = useCallback(async (
    parentMessageId: string,
    content: string,
    channelId: string,
    serverId: string,
    messageId: string,
  ) => {
    if (!user) return;
    const { error } = await (supabase as any).rpc("notify_thread_subscribers", {
      _parent_message_id: parentMessageId,
      _reply_message_id: messageId,
      _channel_id: channelId,
      _server_id: serverId,
      _content: content,
      _sender_display_name: profile?.display_name || "Someone",
    });
    if (error) {
      auditLog({
        level: "warn",
        scope: "chat.thread_notifications",
        event: "rpc_failed",
        details: {
          parent_message_id: parentMessageId,
          reply_message_id: messageId,
          error: error.message,
        },
      });
    }
  }, [profile?.display_name, user]);

  const scheduleMessage = useCallback(async (
    payload: { content: string; sendAt: string; isAnnouncement?: boolean; replyTo?: string | null },
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user || !activeServerId || !activeChannelId) {
      return { ok: false, error: "Missing active server or channel." };
    }

    const scheduledContent = payload.isAnnouncement ? encodeAnnouncement(payload.content) : payload.content;
    const activeServer = servers.find((s) => s.id === activeServerId);
    const isServerOwner = !!activeServer && activeServer.owner_id === user.id;
    const currentMember = membersRef.current.find((m) => m.id === user.id);
    const canScheduleMessages = isServerOwner || (currentMember?.role_permissions || []).includes("schedule_messages");
    if (!canScheduleMessages) {
      return { ok: false, error: "You don't have permission to schedule messages." };
    }
    const canUseEveryoneMention = isServerOwner || (currentMember?.role_permissions || []).includes("mention_everyone");
    if (!canUseEveryoneMention && containsEveryoneMention(scheduledContent)) {
      return { ok: false, error: "You don't have permission to use @everyone." };
    }
    const { error } = await (supabase as any)
      .from("scheduled_messages")
      .insert({
        user_id: user.id,
        server_id: activeServerId,
        channel_id: activeChannelId,
        content: scheduledContent,
        send_at: payload.sendAt,
        is_announcement: !!payload.isAnnouncement,
        reply_to: payload.replyTo || null,
      });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, [activeChannelId, activeServerId, servers, user]);

  const sendMessage = useCallback(async (content: string, attachment?: { url: string; name: string; type: string }, replyTo?: string) => {
    if (!user || !activeChannelId) return;
    if (moderationState.is_banned) {
      toast.error("You are banned from this server.");
      return;
    }
    if (moderationState.timed_out_until && new Date(moderationState.timed_out_until).getTime() > Date.now()) {
      toast.error(`You are timed out until ${new Date(moderationState.timed_out_until).toLocaleString()}`);
      return;
    }
    if (moderationState.muted_until && new Date(moderationState.muted_until).getTime() > Date.now()) {
      toast.error(`You are muted until ${new Date(moderationState.muted_until).toLocaleString()}`);
      return;
    }

    const channel = channels.find((c) => c.id === activeChannelId);
    const serverId = channel?.server_id || activeServerId;
    if (!serverId) {
      toast.error("Unable to resolve active server for this message.");
      return;
    }
    const activeServer = servers.find((s) => s.id === serverId);
    const isServerOwner = !!activeServer && activeServer.owner_id === user.id;
    const currentMember = membersRef.current.find((m) => m.id === user.id);
    const canUseEveryoneMention = isServerOwner || (currentMember?.role_permissions || []).includes("mention_everyone");
    if (!canUseEveryoneMention && containsEveryoneMention(content)) {
      toast.error("You don't have permission to use @everyone.");
      return;
    }
    const { data: automodResult, error: automodError } = await (supabase as any).rpc("evaluate_automod_message", {
      _server_id: serverId,
      _user_id: user.id,
      _content: content,
    });

    if (automodError) {
      auditLog({
        level: "warn",
        scope: "chat.send_message",
        event: "automod_check_failed",
        details: { error: automodError.message, server_id: serverId },
      });
    } else if (automodResult?.blocked) {
      const reasons = Array.isArray(automodResult.reasons) ? automodResult.reasons.length : 0;
      toast.error(`Message blocked by AutoMod${reasons > 0 ? ` (${reasons} rule${reasons === 1 ? "" : "s"} matched)` : ""}.`);
      return;
    }

    const requestId = crypto.randomUUID();
    const optimisticId = `optimistic:${requestId}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      channel_id: activeChannelId,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      edited_at: null,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      pinned_at: null,
      pinned_by: null,
      reply_to: replyTo || null,
      client_status: "pending",
      client_request_id: requestId,
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    auditLog({
      level: "info",
      scope: "chat.send_message",
      event: "optimistic_enqueued",
      requestId,
      details: { channel_id: activeChannelId, server_id: serverId },
    });

    const runSend = async () => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          channel_id: activeChannelId,
          user_id: user.id,
          content,
          attachment_url: attachment?.url || null,
          attachment_name: attachment?.name || null,
          attachment_type: attachment?.type || null,
          reply_to: replyTo || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      const saved = data as Message;
      setMessages((prev) => {
        const withoutOptimisticOrDuplicate = prev.filter(
          (m) => m.id !== optimisticId && m.id !== saved.id,
        );
        return [...withoutOptimisticOrDuplicate, saved].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
      await createMessageNotifications(content, activeChannelId, serverId, saved.id);
      if (replyTo) {
        if (!followedThreadIds.has(replyTo)) {
          const { error: followError } = await (supabase as any)
            .from("thread_subscriptions")
            .insert({
              user_id: user.id,
              parent_message_id: replyTo,
              server_id: serverId,
              channel_id: activeChannelId,
            });
          if (!followError) {
            setFollowedThreadIds((prev) => {
              const next = new Set(prev);
              next.add(replyTo);
              return next;
            });
          } else if (followError.code !== "23505") {
            auditLog({
              level: "warn",
              scope: "chat.send_message",
              event: "thread_auto_follow_failed",
              requestId,
              details: { error: followError.message, parent_message_id: replyTo },
            });
          }
        }
        await notifyThreadSubscribers(replyTo, content, activeChannelId, serverId, saved.id);
      }
      auditLog({
        level: "info",
        scope: "chat.send_message",
        event: "send_succeeded",
        requestId,
        details: { message_id: saved.id },
      });
    };

    const enqueueRetry = () => {
      messageRetryQueueRef.current.enqueue({
        id: requestId,
        initialDelayMs: 1_500,
        maxAttempts: 5,
        run: async (attempt) => {
          setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
          auditLog({
            level: "warn",
            scope: "chat.send_message",
            event: "retry_attempt",
            requestId,
            details: { attempt },
          });
          await runSend();
        },
        onAttemptFailed: (error, attempt, nextDelayMs) => {
          auditLog({
            level: "warn",
            scope: "chat.send_message",
            event: "retry_failed",
            requestId,
            details: {
              attempt,
              next_delay_ms: nextDelayMs,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
        onPermanentFailure: (error, attempts) => {
          setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "failed" } : m)));
          showOperationErrorToast("Send message", error as { message?: string }, {
            requestId,
            onRetryNow: () => {
              setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
              enqueueRetry();
              messageRetryQueueRef.current.runNow(requestId);
            },
          });
          auditLog({
            level: "error",
            scope: "chat.send_message",
            event: "permanent_failure",
            requestId,
            details: {
              attempts,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
      });
    };

    try {
      await runSend();
      return;
    } catch (error) {
      const details = showOperationErrorToast("Send message", error as { message?: string }, {
        requestId,
        onRetryNow: () => messageRetryQueueRef.current.runNow(requestId),
      });
      if (!details.retryable) {
        const err = error as { message?: string };
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        if ((err.message || "").toLowerCase().includes("row-level security") && activeServerId) {
          const nextState = await fetchModerationState(activeServerId);
          setModerationState(nextState);
        }
        auditLog({
          level: "error",
          scope: "chat.send_message",
          event: "send_failed_non_retryable",
          requestId,
          details: { error: err.message || "unknown" },
        });
        return;
      }

      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, client_status: "retrying" } : m)));
      enqueueRetry();
      auditLog({
        level: "warn",
        scope: "chat.send_message",
        event: "send_queued_for_retry",
        requestId,
      });
    }
  }, [user, activeChannelId, channels, servers, activeServerId, moderationState, followedThreadIds, createMessageNotifications, notifyThreadSubscribers, fetchModerationState]);

  const isThreadFollowed = useCallback((parentMessageId: string) => followedThreadIds.has(parentMessageId), [followedThreadIds]);

  const toggleThreadFollow = useCallback(async (parentMessage: Message) => {
    if (!user || !activeServerId || !activeChannelId) return;
    const followed = followedThreadIds.has(parentMessage.id);
    if (followed) {
      const { error } = await (supabase as any)
        .from("thread_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("parent_message_id", parentMessage.id);
      if (error) {
        toast.error(`Failed to unfollow thread: ${error.message}`);
        return;
      }
      setFollowedThreadIds((prev) => {
        const next = new Set(prev);
        next.delete(parentMessage.id);
        return next;
      });
      return;
    }

    const { error } = await (supabase as any)
      .from("thread_subscriptions")
      .insert({
        user_id: user.id,
        parent_message_id: parentMessage.id,
        server_id: activeServerId,
        channel_id: activeChannelId,
      });

    if (error && error.code !== "23505") {
      toast.error(`Failed to follow thread: ${error.message}`);
      return;
    }
    setFollowedThreadIds((prev) => {
      const next = new Set(prev);
      next.add(parentMessage.id);
      return next;
    });
  }, [activeChannelId, activeServerId, followedThreadIds, user]);

  const editMessage = useCallback(async (id: string, content: string) => {
    if (!user) return;
    await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", id);
  }, [user]);

  const deleteMessage = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("messages").delete().eq("id", id);
  }, [user]);

  const pinMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("messages").update({ pinned_at: new Date().toISOString(), pinned_by: user.id }).eq("id", messageId);
  }, [user]);

  const unpinMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase.from("messages").update({ pinned_at: null, pinned_by: null }).eq("id", messageId);
  }, [user]);

  const getPinnedMessages = useCallback(async () => {
    if (!activeChannelId) return [];
    const { data } = await supabase.from("messages").select("*")
      .eq("channel_id", activeChannelId)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: false });
    return (data || []) as Message[];
  }, [activeChannelId]);

  const getThreadReplies = useCallback(async (messageId: string) => {
    const { data } = await supabase.from("messages").select("*")
      .eq("reply_to", messageId)
      .order("created_at", { ascending: true });
    return (data || []) as Message[];
  }, []);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji })
      .select("*")
      .single();
    if (error || !data) return;

    const inserted = data as Reaction;
    setReactions((prev) => {
      const existing = prev[messageId] || [];
      if (existing.some((rxn) => rxn.id === inserted.id)) return prev;
      if (existing.some((rxn) => rxn.user_id === inserted.user_id && rxn.emoji === inserted.emoji)) return prev;
      return { ...prev, [messageId]: [...existing, inserted] };
    });
  }, [user]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji);
    setReactions(prev => {
      const existing = prev[messageId] || [];
      return { ...prev, [messageId]: existing.filter(r => !(r.user_id === user.id && r.emoji === emoji)) };
    });
  }, [user]);

  const searchMessages = useCallback(async (query: string, filters?: MessageSearchFilters): Promise<MessageSearchResult[]> => {
    const normalizedFilters: MessageSearchFilters = {
      ...filters,
      user: filters?.user?.trim(),
      channel: filters?.channel?.trim(),
      date: filters?.date?.trim(),
    };

    let normalizedQuery = query.trim();
    let hasAttachment = !!normalizedFilters.hasAttachment;
    let pinned = !!normalizedFilters.pinned;

    if (/\bhas:attachment\b/i.test(normalizedQuery)) {
      hasAttachment = true;
      normalizedQuery = normalizedQuery.replace(/\bhas:attachment\b/gi, " ").trim();
    }
    if (/\bpinned\b/i.test(normalizedQuery)) {
      pinned = true;
      normalizedQuery = normalizedQuery.replace(/\bpinned\b/gi, " ").trim();
    }

    if (
      !normalizedQuery &&
      !normalizedFilters.user &&
      !normalizedFilters.channel &&
      !normalizedFilters.date &&
      !hasAttachment &&
      !pinned
    ) {
      return [];
    }

    let userIdsFilter: string[] | null = null;
    if (normalizedFilters.user) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .or(`username.ilike.%${normalizedFilters.user}%,display_name.ilike.%${normalizedFilters.user}%`)
        .limit(50);
      userIdsFilter = (users || []).map((u) => u.id);
      if (userIdsFilter.length === 0) return [];
    }

    let channelIdsFilter: string[] | null = null;
    if (normalizedFilters.channel) {
      const { data: channelsByName } = await supabase
        .from("channels")
        .select("id")
        .ilike("name", `%${normalizedFilters.channel}%`)
        .limit(100);
      channelIdsFilter = (channelsByName || []).map((c) => c.id);
      if (channelIdsFilter.length === 0) return [];
    }

    let messageQuery = supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (normalizedQuery) {
      messageQuery = messageQuery.ilike("content", `%${normalizedQuery}%`);
    }
    if (userIdsFilter) {
      messageQuery = messageQuery.in("user_id", userIdsFilter);
    }
    if (channelIdsFilter) {
      messageQuery = messageQuery.in("channel_id", channelIdsFilter);
    }
    if (normalizedFilters.date) {
      const start = new Date(`${normalizedFilters.date}T00:00:00`);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        messageQuery = messageQuery.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
      }
    }
    if (hasAttachment) {
      messageQuery = messageQuery.not("attachment_url", "is", null);
    }
    if (pinned) {
      messageQuery = messageQuery.not("pinned_at", "is", null);
    }

    const { data } = await messageQuery;
    if (!data || data.length === 0) return [];

    const messageRows = data as Message[];
    const channelIds = [...new Set(messageRows.map((m) => m.channel_id))];
    const userIds = [...new Set(messageRows.map((m) => m.user_id))];

    const [{ data: chData }, { data: srvData }, { data: userData }] = await Promise.all([
      supabase.from("channels").select("id, server_id, name").in("id", channelIds),
      (async () => {
        const { data: channelsForServers } = await supabase.from("channels").select("id, server_id").in("id", channelIds);
        const serverIds = [...new Set((channelsForServers || []).map((c) => c.server_id))];
        if (serverIds.length === 0) return { data: [] as Array<{ id: string; name: string }> };
        return supabase.from("servers").select("id, name").in("id", serverIds);
      })(),
      supabase.from("profiles").select("id, display_name").in("id", userIds),
    ]);

    const chMap: Record<string, { id: string; server_id: string; name: string }> = {};
    (chData || []).forEach((c) => {
      chMap[c.id] = { id: c.id, server_id: c.server_id, name: c.name };
    });
    const srvMap: Record<string, { id: string; name: string }> = {};
    (srvData || []).forEach((s) => {
      srvMap[s.id] = { id: s.id, name: s.name };
    });
    const userMap: Record<string, string> = {};
    (userData || []).forEach((u) => {
      userMap[u.id] = u.display_name;
    });

    return messageRows.map((msg) => {
      const channel = chMap[msg.channel_id];
      const serverId = channel?.server_id || "";
      return {
        message: msg,
        channel_name: channel?.name || "unknown",
        server_name: srvMap[serverId]?.name || "unknown",
        server_id: serverId,
        author_name: userMap[msg.user_id] || "Unknown",
      };
    });
  }, []);

  const createServer = useCallback(async (name: string, icon: string) => {
    if (!user) return;
    const { data: server } = await supabase.from("servers").insert({ name, icon, owner_id: user.id }).select().single();
    if (server) {
      const s = server as Server;
      await supabase.from("server_roles").insert({
        server_id: s.id,
        name: "member",
        color: "#9CA3AF",
        position: 0,
      });
      await supabase.from("server_members").insert({ user_id: user.id, server_id: s.id, role: "owner" });
      await supabase.from("channels").insert([
        { server_id: s.id, name: "general", type: "text" },
        { server_id: s.id, name: "start-here", type: "text" },
        { server_id: s.id, name: "introductions", type: "text" },
      ]);
      await (supabase as any).from("server_onboarding_flows").upsert({
        server_id: s.id,
        enabled: true,
        assign_role_on_complete: null,
      });
      await (supabase as any).from("server_onboarding_steps").insert({
        server_id: s.id,
        position: 1,
        step_type: "rules_acceptance",
        title: "Accept server rules",
        description: "Review and accept server rules before participating.",
        is_required: true,
      });
      setServers((prev) => [...prev, s]);
      setActiveServerId(s.id);
    }
  }, [user]);

  return (
    <ChatContext.Provider
      value={{
        servers, activeServerId, activeChannelId, channels, messages, members, profile, reactions,
        channelGroups,
        setActiveServer, setActiveChannel, sendMessage, editMessage, deleteMessage,
        createServer, refreshServers, refreshChannels, refreshChannelGroups, refreshProfile: loadProfile,
        addReaction, removeReaction, searchMessages, pinMessage, unpinMessage, getPinnedMessages,
        getThreadReplies, isThreadFollowed, toggleThreadFollow, scheduleMessage, loadingServers, loadingChannels, loadingMessages, loadingMembers, typingUsers, setTyping, moderationState,
        unreadCountByChannel, channelLastReadAtByChannel, markChannelAsRead,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
