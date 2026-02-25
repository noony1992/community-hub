import { Fragment, useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Hash, Pin, Users, Search, Inbox, HelpCircle, PlusCircle, Gift, Smile, SendHorizonal, Pencil, Trash2, X, Check, Paperclip, FileIcon, ImageIcon, MessageSquare, Reply, Volume2, PhoneOff, CalendarClock, Megaphone, BarChart3, CalendarDays, MicOff, UserX, Video, VideoOff, ScreenShare, ScreenShareOff, Maximize2, PanelLeft, Menu } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import EmojiPicker from "./EmojiPicker";
import MessageReactions from "./MessageReactions";
import SearchDialog from "./SearchDialog";
import PinnedMessagesPanel from "./PinnedMessagesPanel";
import ThreadPanel, { type ThreadSummaryItem } from "./ThreadPanel";
import MentionAutocomplete, { renderContentWithMentions } from "./MentionAutocomplete";
import UserProfileCard from "./UserProfileCard";
import { useVoiceContext } from "@/context/VoiceContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { encodeForumTopic, encodePoll, encodeQuestion, parseMessageFeatures, type ForumTopicDefinition, type PollDefinition } from "@/lib/messageFeatures";
import { useSearchParams } from "react-router-dom";
import { ChatAreaSkeleton } from "@/components/skeletons/AppSkeletons";
import { useLoadingReveal } from "@/hooks/useLoadingReveal";
import { getRoleNamePresentation } from "@/lib/roleAppearance";

type ServerEvent = {
  id: string;
  server_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

type EventRsvp = {
  event_id: string;
  user_id: string;
  status: "going" | "maybe" | "not_going";
};

type OnboardingFlow = {
  enabled: boolean;
  assign_role_on_complete: string | null;
};

type OnboardingStep = {
  id: string;
  server_id: string;
  step_type: "rules_acceptance" | "read_channel" | "custom_ack";
  title: string;
  description: string | null;
  required_channel_id: string | null;
  is_required: boolean;
  position: number;
};

type ChatAreaProps = {
  isMobile?: boolean;
  onOpenServers?: () => void;
  onOpenChannels?: () => void;
  onOpenMembers?: () => void;
};

const ChatArea = ({
  isMobile = false,
  onOpenServers,
  onOpenChannels,
  onOpenMembers,
}: ChatAreaProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeChannelId, activeServerId, channels, messages, sendMessage, scheduleMessage, editMessage, deleteMessage, members, profile, typingUsers, setTyping, addReaction, pinMessage, unpinMessage, moderationState, servers, unreadCountByChannel, channelLastReadAtByChannel, markChannelAsRead, setActiveServer, setActiveChannel, loadingChannels, loadingMessages } = useChatContext();
  const {
    isConnected,
    activeVoiceChannelId,
    participants,
    videoStreamsByUser,
    isCameraOn,
    isScreenSharing,
    leaveVoiceChannel,
    moderateVoiceParticipant,
    toggleCamera,
    toggleScreenShare,
  } = useVoiceContext();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [showThreadPanel, setShowThreadPanel] = useState(false);
  const [threadReadAtByParent, setThreadReadAtByParent] = useState<Record<string, string>>({});
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [profileUser, setProfileUser] = useState<typeof members[0] | null>(null);
  const [profilePos, setProfilePos] = useState<{ top: number; left: number } | undefined>();
  const [checkingRulesAcceptance, setCheckingRulesAcceptance] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(true);
  const [rulesChecklistChecked, setRulesChecklistChecked] = useState(false);
  const [acceptingRules, setAcceptingRules] = useState(false);
  const [onboardingFlow, setOnboardingFlow] = useState<OnboardingFlow>({ enabled: false, assign_role_on_complete: null });
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
  const [onboardingCustomCompletedIds, setOnboardingCustomCompletedIds] = useState<Set<string>>(new Set());
  const [onboardingReadChannelIds, setOnboardingReadChannelIds] = useState<Set<string>>(new Set());
  const [onboardingCustomChecks, setOnboardingCustomChecks] = useState<Record<string, boolean>>({});
  const [submittingOnboardingCompletion, setSubmittingOnboardingCompletion] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleAnnouncement, setScheduleAnnouncement] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultipleChoice, setPollMultipleChoice] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicBody, setTopicBody] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [pollVotesByMessage, setPollVotesByMessage] = useState<Record<string, Record<number, string[]>>>({});
  const [qaModeEnabled, setQaModeEnabled] = useState(false);
  const [togglingQaMode, setTogglingQaMode] = useState(false);
  const [asQuestion, setAsQuestion] = useState(false);
  const [submittingTimeoutAppeal, setSubmittingTimeoutAppeal] = useState(false);
  const [showTimeoutAppealModal, setShowTimeoutAppealModal] = useState(false);
  const [timeoutAppealReason, setTimeoutAppealReason] = useState("");
  const [timeoutAppealError, setTimeoutAppealError] = useState<string | null>(null);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [eventRsvps, setEventRsvps] = useState<EventRsvp[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [rsvpSavingEventId, setRsvpSavingEventId] = useState<string | null>(null);
  const [moveVoiceTargetByUser, setMoveVoiceTargetByUser] = useState<Record<string, string>>({});
  const [expandedVideoUserId, setExpandedVideoUserId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const forumMessagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const channelScrollPositionsRef = useRef<Record<string, number>>({});
  const pendingChannelRestoreIdRef = useRef<string | null>(null);
  const restrictionToastAtRef = useRef<number>(0);
  const voiceVideoContainerRefByUser = useRef<Record<string, HTMLDivElement | null>>({});
  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const channel = channels.find((c) => c.id === activeChannelId);
  const isVoiceChannelView = channel?.type === "voice";
  const isForumChannelView = channel?.type === "forum";
  const timedOutActive = !!moderationState.timed_out_until && new Date(moderationState.timed_out_until).getTime() > Date.now();
  const mutedActive = !!moderationState.muted_until && new Date(moderationState.muted_until).getTime() > Date.now();
  const bannedActive = moderationState.is_banned;
  const activeUnreadCount = activeChannelId ? (unreadCountByChannel[activeChannelId] || 0) : 0;
  const activeLastReadAt = activeChannelId ? (channelLastReadAtByChannel[activeChannelId] || null) : null;
  const threadReadStorageKey = user?.id && activeChannelId ? `thread-read:${user.id}:${activeChannelId}` : null;

  const notifyRestriction = useCallback(() => {
    const now = Date.now();
    if (now - restrictionToastAtRef.current < 2000) return;
    restrictionToastAtRef.current = now;
    if (bannedActive) {
      toast.error("You are banned from this server.");
      return;
    }
    if (timedOutActive && moderationState.timed_out_until) {
      toast.error(`You are timed out until ${new Date(moderationState.timed_out_until).toLocaleString()}`);
      return;
    }
    if (mutedActive && moderationState.muted_until) {
      toast.error(`You are muted until ${new Date(moderationState.muted_until).toLocaleString()}`);
    }
  }, [bannedActive, mutedActive, timedOutActive, moderationState.muted_until, moderationState.timed_out_until]);

  const handleTimeoutAppeal = useCallback(async () => {
    if (!user || !activeServerId || !timedOutActive) return;
    const reason = timeoutAppealReason.trim();
    if (!reason) {
      setTimeoutAppealError("Appeal reason is required.");
      return;
    }
    setSubmittingTimeoutAppeal(true);
    setTimeoutAppealError(null);
    const { error } = await supabase
      .from("moderation_appeals")
      .insert({
        server_id: activeServerId,
        user_id: user.id,
        punishment_type: "timeout",
        reason,
      });
    setSubmittingTimeoutAppeal(false);
    if (error) {
      setTimeoutAppealError(`Failed to submit appeal: ${error.message}`);
      return;
    }
    setTimeoutAppealReason("");
    setShowTimeoutAppealModal(false);
    toast.success("Timeout appeal submitted.");
  }, [user, activeServerId, timedOutActive, timeoutAppealReason]);

  const memberMap = useMemo(() => {
    const map: Record<string, typeof members[0]> = {};
    members.forEach((m) => { map[m.id] = m; });
    return map;
  }, [members]);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isServerOwner = !!user && !!activeServer && activeServer.owner_id === user.id;
  const currentMember = members.find((m) => m.id === user?.id);
  const currentPermissions = currentMember?.role_permissions || [];
  const canManageChannels = currentPermissions.includes("manage_channels") || isServerOwner;
  const canCreateEvents = currentPermissions.includes("events") || isServerOwner;
  const canPinMessages = currentPermissions.includes("pin_messages") || isServerOwner;
  const canDeleteAnyMessages = currentPermissions.includes("delete_messages") || isServerOwner;
  const canVoiceKickUsers = currentPermissions.includes("voice_kick_users") || isServerOwner;
  const canVoiceMuteUsers = currentPermissions.includes("voice_mute_users") || isServerOwner;
  const canMoveVoiceUsers = currentPermissions.includes("move_voice_users") || isServerOwner;
  const canModerateVoiceUsers = canVoiceKickUsers || canVoiceMuteUsers || canMoveVoiceUsers;
  const voiceChannelOptions = useMemo(() => channels.filter((c) => c.type === "voice"), [channels]);
  const onboardingTitle = activeServer?.onboarding_welcome_title || `Welcome to ${activeServer?.name || "this server"}`;
  const onboardingMessage =
    activeServer?.onboarding_welcome_message || "Please review and accept the server rules before you can chat.";
  const onboardingRulesText =
    activeServer?.onboarding_rules_text || "Be respectful. No harassment. Stay on topic and follow moderator guidance.";
  const onboardingStepStatus = useMemo(() => {
    return onboardingSteps.map((step) => {
      if (step.step_type === "rules_acceptance") {
        return { ...step, complete: rulesAccepted };
      }
      if (step.step_type === "read_channel") {
        return { ...step, complete: !!step.required_channel_id && onboardingReadChannelIds.has(step.required_channel_id) };
      }
      return { ...step, complete: onboardingCustomCompletedIds.has(step.id) };
    });
  }, [onboardingCustomCompletedIds, onboardingReadChannelIds, onboardingSteps, rulesAccepted]);
  const missingRequiredOnboardingSteps = useMemo(
    () => onboardingStepStatus.filter((step) => step.is_required && !step.complete),
    [onboardingStepStatus],
  );
  const onboardingBlocked = onboardingFlow.enabled && missingRequiredOnboardingSteps.length > 0;
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, ServerEvent[]>();
    events.forEach((event) => {
      const key = new Date(event.starts_at).toDateString();
      const bucket = grouped.get(key) || [];
      bucket.push(event);
      grouped.set(key, bucket);
    });
    return Array.from(grouped.entries()).map(([dateLabel, items]) => ({
      dateLabel,
      items: items.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    }));
  }, [events]);
  const loadingMainContent = !!(activeServerId && (loadingChannels || (activeChannelId && loadingMessages)));
  const revealMainContent = useLoadingReveal(loadingMainContent);
  const revealEvents = useLoadingReveal(loadingEvents);
  const channelScrollStoragePrefix = user?.id ? `scroll:channel:${user.id}:` : "scroll:channel:anon:";

  const getChannelScrollStorageKey = useCallback((channelId: string) => `${channelScrollStoragePrefix}${channelId}`, [channelScrollStoragePrefix]);

  const readSavedChannelScroll = useCallback((channelId: string) => {
    if (Object.prototype.hasOwnProperty.call(channelScrollPositionsRef.current, channelId)) {
      const inMemory = channelScrollPositionsRef.current[channelId];
      if (typeof inMemory === "number" && Number.isFinite(inMemory) && inMemory >= 0) return inMemory;
    }
    try {
      const raw = localStorage.getItem(getChannelScrollStorageKey(channelId));
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }, [getChannelScrollStorageKey]);

  const saveChannelScroll = useCallback((channelId: string, scrollTop: number) => {
    if (!channelId || !Number.isFinite(scrollTop) || scrollTop < 0) return;
    channelScrollPositionsRef.current[channelId] = scrollTop;
    try {
      localStorage.setItem(getChannelScrollStorageKey(channelId), String(Math.round(scrollTop)));
    } catch {
      // Ignore storage errors.
    }
  }, [getChannelScrollStorageKey]);

  const getActiveChannelScrollContainer = useCallback(() => {
    if (isForumChannelView) return forumMessagesContainerRef.current;
    if (isVoiceChannelView) return null;
    return messagesContainerRef.current;
  }, [isForumChannelView, isVoiceChannelView]);

  const loadEvents = useCallback(async () => {
    if (!activeServerId || !user) return;
    setLoadingEvents(true);
    const { data: eventRows, error: eventsError } = await (supabase as any)
      .from("server_events")
      .select("id, server_id, created_by, title, description, location, starts_at, ends_at, created_at")
      .eq("server_id", activeServerId)
      .order("starts_at", { ascending: true })
      .limit(200);
    if (eventsError) {
      setLoadingEvents(false);
      toast.error(`Failed to load events: ${eventsError.message}`);
      return;
    }
    const nextEvents = (eventRows || []) as ServerEvent[];
    setEvents(nextEvents);
    if (nextEvents.length === 0) {
      setEventRsvps([]);
      setLoadingEvents(false);
      return;
    }
    const eventIds = nextEvents.map((event) => event.id);
    const { data: rsvpRows, error: rsvpError } = await (supabase as any)
      .from("event_rsvps")
      .select("event_id, user_id, status")
      .in("event_id", eventIds);
    if (rsvpError) {
      setLoadingEvents(false);
      toast.error(`Failed to load RSVPs: ${rsvpError.message}`);
      return;
    }
    setEventRsvps((rsvpRows || []) as EventRsvp[]);
    setLoadingEvents(false);
  }, [activeServerId, user]);

  const notifyEventCreated = useCallback(async (event: ServerEvent) => {
    if (!activeServerId || !user) return;
    const { data: membersData } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", activeServerId)
      .neq("user_id", user.id);
    const recipientIds = Array.from(new Set((membersData || []).map((m) => m.user_id)));
    if (recipientIds.length === 0) return;
    const bodyParts = [
      `Starts ${new Date(event.starts_at).toLocaleString()}`,
      event.location ? `at ${event.location}` : null,
    ].filter(Boolean);
    const inserts = recipientIds.map((recipientId) => ({
      user_id: recipientId,
      type: "event",
      title: `New event: ${event.title}`,
      body: bodyParts.join(" "),
      link_server_id: activeServerId,
      link_channel_id: activeChannelId || null,
    }));
    const { error } = await supabase.from("notifications").insert(inserts as any);
    if (error) {
      auditLog({
        level: "warn",
        scope: "events.create",
        event: "notification_insert_failed",
        details: { error: error.message, recipient_count: recipientIds.length },
      });
    }
  }, [activeChannelId, activeServerId, user]);

  const createEvent = useCallback(async () => {
    if (!activeServerId || !user) return;
    if (!canCreateEvents) {
      toast.error("You do not have permission to create events.");
      return;
    }
    const title = eventTitle.trim();
    if (!title) {
      toast.error("Event title is required.");
      return;
    }
    if (!eventStartsAt) {
      toast.error("Start date/time is required.");
      return;
    }
    setCreatingEvent(true);
    const startsAtIso = new Date(eventStartsAt).toISOString();
    const endsAtIso = eventEndsAt ? new Date(eventEndsAt).toISOString() : null;
    const { data, error } = await (supabase as any)
      .from("server_events")
      .insert({
        server_id: activeServerId,
        created_by: user.id,
        title,
        description: eventDescription.trim() || null,
        location: eventLocation.trim() || null,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
      })
      .select("id, server_id, created_by, title, description, location, starts_at, ends_at, created_at")
      .single();
    setCreatingEvent(false);
    if (error || !data) {
      toast.error(`Failed to create event: ${error?.message || "Unknown error"}`);
      return;
    }
    const createdEvent = data as ServerEvent;
    setEvents((prev) => [...prev, createdEvent].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
    setEventTitle("");
    setEventDescription("");
    setEventLocation("");
    setEventStartsAt("");
    setEventEndsAt("");
    await notifyEventCreated(createdEvent);
    toast.success("Event created.");
  }, [activeServerId, user, canCreateEvents, eventTitle, eventStartsAt, eventEndsAt, eventDescription, eventLocation, notifyEventCreated]);

  const upsertRsvp = useCallback(async (event: ServerEvent, status: EventRsvp["status"]) => {
    if (!user) return;
    setRsvpSavingEventId(event.id);
    const { error } = await (supabase as any)
      .from("event_rsvps")
      .upsert({
        event_id: event.id,
        user_id: user.id,
        status,
        responded_at: new Date().toISOString(),
      }, { onConflict: "event_id,user_id" });
    setRsvpSavingEventId(null);
    if (error) {
      toast.error(`Failed to save RSVP: ${error.message}`);
      return;
    }
    setEventRsvps((prev) => {
      const others = prev.filter((rsvp) => !(rsvp.event_id === event.id && rsvp.user_id === user.id));
      return [...others, { event_id: event.id, user_id: user.id, status }];
    });

    if (event.created_by !== user.id) {
      const rsvpLabel = status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Not Going";
      const { error: notifyError } = await supabase.from("notifications").insert({
        user_id: event.created_by,
        type: "event_rsvp",
        title: `RSVP update: ${event.title}`,
        body: `${profile?.display_name || "A member"} responded: ${rsvpLabel}`,
        link_server_id: event.server_id,
        link_channel_id: activeChannelId || null,
      } as any);
      if (notifyError) {
        auditLog({
          level: "warn",
          scope: "events.rsvp",
          event: "notification_insert_failed",
          details: { error: notifyError.message, event_id: event.id },
        });
      }
    }
    toast.success("RSVP updated.");
  }, [activeChannelId, profile?.display_name, user]);

  useEffect(() => {
    if (!showEventsModal) return;
    void loadEvents();
  }, [loadEvents, showEventsModal]);

  useEffect(() => {
    if (!activeChannelId) {
      setQaModeEnabled(false);
      return;
    }
    const loadQaMode = async () => {
      const { data } = await (supabase as any)
        .from("channel_features")
        .select("qa_mode_enabled")
        .eq("channel_id", activeChannelId)
        .maybeSingle();
      setQaModeEnabled(!!data?.qa_mode_enabled);
    };
    void loadQaMode();
  }, [activeChannelId]);

  const pollMessageIds = useMemo(
    () => messages.filter((m) => parseMessageFeatures(m.content).kind === "poll").map((m) => m.id),
    [messages],
  );

  const loadVotesForMessage = useCallback(async (messageId: string) => {
    const { data, error } = await (supabase as any)
      .from("poll_votes")
      .select("message_id, option_index, user_id")
      .eq("message_id", messageId);
    if (error) return;

    const grouped: Record<number, string[]> = {};
    ((data || []) as Array<{ option_index: number; user_id: string }>).forEach((row) => {
      if (!grouped[row.option_index]) grouped[row.option_index] = [];
      grouped[row.option_index].push(row.user_id);
    });
    setPollVotesByMessage((prev) => ({ ...prev, [messageId]: grouped }));
  }, []);

  const loadVotesForMessages = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) {
      setPollVotesByMessage({});
      return;
    }

    const { data, error } = await (supabase as any)
      .from("poll_votes")
      .select("message_id, option_index, user_id")
      .in("message_id", messageIds);
    if (error) return;

    const grouped: Record<string, Record<number, string[]>> = {};
    ((data || []) as Array<{ message_id: string; option_index: number; user_id: string }>).forEach((row) => {
      if (!grouped[row.message_id]) grouped[row.message_id] = {};
      if (!grouped[row.message_id][row.option_index]) grouped[row.message_id][row.option_index] = [];
      grouped[row.message_id][row.option_index].push(row.user_id);
    });
    setPollVotesByMessage(grouped);
  }, []);

  useEffect(() => {
    if (pollMessageIds.length === 0) {
      setPollVotesByMessage({});
      return;
    }
    const pollMessageIdSet = new Set(pollMessageIds);
    void loadVotesForMessages(pollMessageIds);

    const channel = supabase
      .channel(`poll-votes:${activeChannelId || "global"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "poll_votes",
        },
        (payload) => {
          const messageId = (payload.old as { message_id?: string })?.message_id || (payload.new as { message_id?: string })?.message_id;
          if (messageId && pollMessageIdSet.has(messageId)) {
            void loadVotesForMessage(messageId);
          }
        },
      )
      .subscribe();

    // Fallback refresh in case realtime is delayed or unavailable in this environment.
    const refreshId = window.setInterval(() => {
      void loadVotesForMessages(pollMessageIds);
    }, 4000);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(refreshId);
    };
  }, [activeChannelId, loadVotesForMessage, loadVotesForMessages, pollMessageIds]);

  useEffect(() => {
    if (!threadReadStorageKey) {
      setThreadReadAtByParent({});
      return;
    }
    try {
      const saved = localStorage.getItem(threadReadStorageKey);
      if (!saved) {
        setThreadReadAtByParent({});
        return;
      }
      const parsed = JSON.parse(saved) as Record<string, string>;
      setThreadReadAtByParent(parsed || {});
    } catch {
      setThreadReadAtByParent({});
    }
  }, [threadReadStorageKey]);

  useEffect(() => {
    if (!threadReadStorageKey) return;
    localStorage.setItem(threadReadStorageKey, JSON.stringify(threadReadAtByParent));
  }, [threadReadAtByParent, threadReadStorageKey]);

  useEffect(() => {
    pendingChannelRestoreIdRef.current = activeChannelId || null;
  }, [activeChannelId]);

  useEffect(() => {
    return () => {
      if (!activeChannelId) return;
      const container = getActiveChannelScrollContainer();
      if (!container) return;
      saveChannelScroll(activeChannelId, container.scrollTop);
    };
  }, [activeChannelId, getActiveChannelScrollContainer, saveChannelScroll]);

  useEffect(() => {
    if (!activeChannelId || loadingMainContent) return;
    if (pendingChannelRestoreIdRef.current !== activeChannelId) return;
    const container = getActiveChannelScrollContainer();
    if (!container) return;

    const savedTop = readSavedChannelScroll(activeChannelId);
    const raf = window.requestAnimationFrame(() => {
      if (savedTop !== null) {
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = Math.min(savedTop, maxTop);
        shouldAutoScrollRef.current = isNearBottom();
      }
      pendingChannelRestoreIdRef.current = null;
    });

    return () => window.cancelAnimationFrame(raf);
  }, [activeChannelId, getActiveChannelScrollContainer, isNearBottom, loadingMainContent, readSavedChannelScroll]);

  useEffect(() => {
    if (activeUnreadCount > 0) return;
    if (!shouldAutoScrollRef.current && !isNearBottom()) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeUnreadCount, activeChannelId, isNearBottom, messages.length]);

  const loadOnboardingState = useCallback(async () => {
    if (!user?.id || !activeServerId) {
      setRulesAccepted(true);
      setOnboardingFlow({ enabled: false, assign_role_on_complete: null });
      setOnboardingSteps([]);
      setOnboardingCustomCompletedIds(new Set());
      setOnboardingReadChannelIds(new Set());
      return;
    }

    setCheckingRulesAcceptance(true);

    const [{ data: flowRow }, { data: stepRows }, { data: ruleAcceptance }, { data: customProgressRows }] = await Promise.all([
      (supabase as any)
        .from("server_onboarding_flows")
        .select("enabled, assign_role_on_complete")
        .eq("server_id", activeServerId)
        .maybeSingle(),
      (supabase as any)
        .from("server_onboarding_steps")
        .select("id, server_id, step_type, title, description, required_channel_id, is_required, position")
        .eq("server_id", activeServerId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("server_rule_acceptances")
        .select("accepted_at")
        .eq("server_id", activeServerId)
        .eq("user_id", user.id)
        .maybeSingle(),
      (supabase as any)
        .from("user_onboarding_step_progress")
        .select("step_id")
        .eq("server_id", activeServerId)
        .eq("user_id", user.id),
    ]);

    const requiredReadChannelIds = ((stepRows || []) as OnboardingStep[])
      .filter((step) => step.step_type === "read_channel" && !!step.required_channel_id)
      .map((step) => step.required_channel_id as string);

    const { data: readRows } = requiredReadChannelIds.length > 0
      ? await (supabase as any)
          .from("channel_reads")
          .select("channel_id")
          .eq("user_id", user.id)
          .in("channel_id", requiredReadChannelIds)
      : { data: [] as Array<{ channel_id: string }> };

    setOnboardingFlow({
      enabled: flowRow?.enabled ?? false,
      assign_role_on_complete: flowRow?.assign_role_on_complete || null,
    });
    setOnboardingSteps((stepRows || []) as OnboardingStep[]);
    setOnboardingCustomChecks({});
    setRulesAccepted(!!ruleAcceptance?.accepted_at);
    setOnboardingCustomCompletedIds(new Set(((customProgressRows || []) as Array<{ step_id: string }>).map((row) => row.step_id)));
    setOnboardingReadChannelIds(new Set(((readRows || []) as Array<{ channel_id: string }>).map((row) => row.channel_id)));
    setRulesChecklistChecked(false);
    setCheckingRulesAcceptance(false);
  }, [activeServerId, user?.id]);

  useEffect(() => {
    void loadOnboardingState();
  }, [loadOnboardingState]);

  const handleAcceptRules = useCallback(async () => {
    if (!user?.id || !activeServerId || rulesAccepted) return;
    setAcceptingRules(true);
    const { data: existing } = await supabase
      .from("server_rule_acceptances")
      .select("id")
      .eq("server_id", activeServerId)
      .eq("user_id", user.id)
      .maybeSingle();

    let error: { message: string } | null = null;
    if (!existing?.id) {
      const result = await supabase.from("server_rule_acceptances").insert({
        server_id: activeServerId,
        user_id: user.id,
        accepted_at: new Date().toISOString(),
      });
      error = result.error;
    }

    setAcceptingRules(false);
    if (error) {
      toast.error(`Failed to accept rules: ${error.message}`);
      return;
    }
    setRulesAccepted(true);
    await (supabase as any).rpc("complete_onboarding_for_current_user", {
      _server_id: activeServerId,
      _completed_custom_step_ids: [],
    });
    await loadOnboardingState();
  }, [activeServerId, loadOnboardingState, rulesAccepted, user?.id]);

  const handleCompleteOnboarding = useCallback(async () => {
    if (!activeServerId || !user?.id) return;
    const customStepIdsToSubmit = onboardingStepStatus
      .filter((step) => step.step_type === "custom_ack")
      .filter((step) => onboardingCustomChecks[step.id] && !onboardingCustomCompletedIds.has(step.id))
      .map((step) => step.id);
    setSubmittingOnboardingCompletion(true);
    const { data, error } = await (supabase as any).rpc("complete_onboarding_for_current_user", {
      _server_id: activeServerId,
      _completed_custom_step_ids: customStepIdsToSubmit,
    });
    setSubmittingOnboardingCompletion(false);
    if (error) {
      toast.error(`Failed to update onboarding progress: ${error.message}`);
      return;
    }
    await loadOnboardingState();
    if (data?.complete) {
      toast.success(data?.role_assigned ? "Onboarding complete. Role assigned." : "Onboarding complete.");
    } else {
      toast.error(`${data?.missing_required_steps || 0} required step(s) remaining.`);
    }
  }, [activeServerId, loadOnboardingState, onboardingCustomChecks, onboardingCustomCompletedIds, onboardingStepStatus, user?.id]);

  useLayoutEffect(() => {
    shouldAutoScrollRef.current = true;
    setShowThreadPanel(false);
    setThreadMessage(null);
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    const targetThreadId = searchParams.get("thread");
    const targetMessageId = searchParams.get("message");
    if (!targetThreadId && !targetMessageId) return;

    let handled = false;
    if (targetThreadId) {
      const parent = messages.find((m) => m.id === targetThreadId);
      if (parent) {
        setThreadMessage(parent);
        setShowThreadPanel(true);
        handled = true;
      }
    }

    if (targetMessageId) {
      const el = document.getElementById(`msg-${targetMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        handled = true;
      } else {
        const targetMessage = messages.find((m) => m.id === targetMessageId);
        if (targetMessage?.reply_to) {
          const parent = messages.find((m) => m.id === targetMessage.reply_to);
          if (parent) {
            setThreadMessage(parent);
            setShowThreadPanel(true);
            handled = true;
          }
        }
      }
    }

    if (!handled) return;
    const next = new URLSearchParams(searchParams);
    next.delete("thread");
    next.delete("message");
    setSearchParams(next, { replace: true });
  }, [activeChannelId, messages, searchParams, setSearchParams]);

  const handleTyping = useCallback(() => {
    setTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
  }, [setTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (checkingRulesAcceptance) return;
    if (onboardingBlocked) return;
    if (timedOutActive || mutedActive || bannedActive) {
      notifyRestriction();
      return;
    }
    const val = e.target.value;
    setInput(val);
    handleTyping();

    // Check for @mention
    const cursorPos = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursorPos);
    const mentionMatch = textBefore.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (username: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const newBefore = textBefore.replace(/@\w*$/, `@${username} `);
    setInput(newBefore + textAfter);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (!error) {
      const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      setPendingAttachment({ url: urlData.publicUrl, name: file.name, type: file.type });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (checkingRulesAcceptance) return;
    if (onboardingBlocked) return;
    if (timedOutActive || mutedActive || bannedActive) {
      notifyRestriction();
      return;
    }
    const trimmed = input.trim();
    if (!trimmed && !pendingAttachment) return;
    if (qaModeEnabled && !replyTo && !asQuestion) {
      toast.error("Q&A mode is enabled. Mark your message as a question or reply within a thread.");
      return;
    }
    setInput("");
    setTyping(false);
    setShowMentions(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const outgoing = asQuestion && trimmed ? encodeQuestion(trimmed) : trimmed;
    await sendMessage(outgoing || (pendingAttachment ? `📎 ${pendingAttachment.name}` : ""), pendingAttachment || undefined, replyTo?.id);
    await markChannelAsRead(activeChannelId || undefined);
    setPendingAttachment(null);
    setReplyTo(null);
    setAsQuestion(false);
  };

  const toggleQaMode = async () => {
    if (!activeChannelId || !canManageChannels || togglingQaMode || !user) return;
    setTogglingQaMode(true);
    const { error } = await (supabase as any)
      .from("channel_features")
      .upsert({
        channel_id: activeChannelId,
        qa_mode_enabled: !qaModeEnabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "channel_id" });
    setTogglingQaMode(false);
    if (error) {
      toast.error(`Failed to toggle Q&A mode: ${error.message}`);
      return;
    }
    setQaModeEnabled((prev) => !prev);
  };

  const handleScheduleCurrentMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!scheduleAt) {
      toast.error("Pick a date and time for scheduling.");
      return;
    }
    setScheduling(true);
    const result = await scheduleMessage({
      content: trimmed,
      sendAt: new Date(scheduleAt).toISOString(),
      isAnnouncement: scheduleAnnouncement,
      replyTo: replyTo?.id || null,
    });
    setScheduling(false);
    if (!result.ok) {
      toast.error(`Failed to schedule message: ${result.error || "Unknown error"}`);
      return;
    }
    toast.success("Message scheduled.");
    setInput("");
    setReplyTo(null);
    setAsQuestion(false);
    setScheduleAnnouncement(false);
    setScheduleAt("");
    setShowScheduleModal(false);
  };

  const handleCreatePoll = async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((opt) => opt.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      toast.error("A poll needs a question and at least 2 options.");
      return;
    }
    const poll: PollDefinition = {
      question,
      options,
      multipleChoice: pollMultipleChoice,
      expiresAt: null,
    };
    setCreatingPoll(true);
    await sendMessage(encodePoll(poll));
    setCreatingPoll(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollMultipleChoice(false);
    setShowPollModal(false);
  };

  const handleCreateTopic = async () => {
    if (!isForumChannelView) return;
    if (checkingRulesAcceptance || onboardingBlocked) return;
    if (timedOutActive || mutedActive || bannedActive) {
      notifyRestriction();
      return;
    }
    const title = topicTitle.trim();
    const body = topicBody.trim();
    if (!title) {
      toast.error("Topic title is required.");
      return;
    }

    const payload: ForumTopicDefinition = {
      title,
      body: body || title,
    };

    setCreatingTopic(true);
    await sendMessage(encodeForumTopic(payload));
    await markChannelAsRead(activeChannelId || undefined);
    setCreatingTopic(false);
    setTopicTitle("");
    setTopicBody("");
    setShowCreateTopicModal(false);
  };

  const handleVotePoll = async (messageId: string, optionIndex: number, multipleChoice: boolean) => {
    if (!user) return;
    const current = pollVotesByMessage[messageId] || {};
    const hasVotedForOption = (current[optionIndex] || []).includes(user.id);

    // Optimistic update for instant feedback.
    setPollVotesByMessage((prev) => {
      const previous = prev[messageId] || {};
      const nextForMessage: Record<number, string[]> = {};
      Object.entries(previous).forEach(([idx, ids]) => {
        nextForMessage[Number(idx)] = [...ids];
      });

      if (hasVotedForOption) {
        nextForMessage[optionIndex] = (nextForMessage[optionIndex] || []).filter((id) => id !== user.id);
      } else {
        if (!multipleChoice) {
          Object.keys(nextForMessage).forEach((idx) => {
            nextForMessage[Number(idx)] = (nextForMessage[Number(idx)] || []).filter((id) => id !== user.id);
          });
        }
        if (!nextForMessage[optionIndex]) nextForMessage[optionIndex] = [];
        if (!nextForMessage[optionIndex].includes(user.id)) nextForMessage[optionIndex].push(user.id);
      }

      return { ...prev, [messageId]: nextForMessage };
    });

    let error: { message: string } | null = null;
    if (hasVotedForOption) {
      const result = await (supabase as any)
        .from("poll_votes")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("option_index", optionIndex);
      error = result.error;
    } else {
      if (!multipleChoice) {
        const clearResult = await (supabase as any)
          .from("poll_votes")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id);
        if (clearResult.error) {
          error = clearResult.error;
        }
      }

      if (!error) {
        const voteResult = await (supabase as any)
          .from("poll_votes")
          .upsert({
            message_id: messageId,
            user_id: user.id,
            option_index: optionIndex,
          }, {
            onConflict: "message_id,user_id,option_index",
          });
        error = voteResult.error;
      }
    }

    if (error) {
      toast.error(`Failed to vote on poll: ${error.message}`);
    }
    void loadVotesForMessage(messageId);
  };

  const handleEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    await editMessage(editingId, editContent.trim());
    setEditingId(null);
    setEditContent("");
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MM/dd/yyyy h:mm a");
  };

  const formatDateDividerLabel = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d, yyyy");
  };

  const isImage = (type: string | null) => type?.startsWith("image/");

  const renderAttachment = (msg: Message) => {
    if (!msg.attachment_url) return null;
    if (isImage(msg.attachment_type)) {
      return (
        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img src={msg.attachment_url} alt={msg.attachment_name || "image"} className="max-w-xs max-h-64 rounded-lg border border-border" />
        </a>
      );
    }
    return (
      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-1 px-3 py-2 bg-secondary rounded-lg max-w-xs hover:bg-chat-hover transition-colors">
        <FileIcon className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm text-foreground truncate">{msg.attachment_name || "File"}</span>
      </a>
    );
  };

  const renderReplyPreview = (msg: Message) => {
    if (!msg.reply_to) return null;
    const parent = messages.find((m) => m.id === msg.reply_to);
    if (!parent) return null;
    const parentUser = memberMap[parent.user_id]?.display_name || "Unknown";
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5 pl-1 border-l-2 border-primary/40 ml-0">
        <Reply className="w-3 h-3" />
        <span className="font-medium text-foreground">{parentUser}</span>
        <span className="truncate max-w-[200px]">{parent.content}</span>
      </div>
    );
  };

  const parseTs = useCallback((value?: string | null) => {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? 0 : ts;
  }, []);

  const getMessageBodyText = useCallback((msg: Message) => {
    const parsed = parseMessageFeatures(msg.content);
    if (parsed.kind === "poll") return parsed.poll.question;
    if (parsed.kind === "forum_topic") return `${parsed.topic.title} ${parsed.topic.body}`.trim();
    return parsed.text;
  }, []);

  const getForumTopic = useCallback((msg: Message): ForumTopicDefinition => {
    const parsed = parseMessageFeatures(msg.content);
    if (parsed.kind === "forum_topic") {
      return {
        title: parsed.topic.title,
        body: parsed.topic.body,
      };
    }
    const fallbackText = parsed.kind === "poll" ? parsed.poll.question : parsed.text;
    const firstLine = fallbackText.split("\n").map((line) => line.trim()).find(Boolean) || "Untitled topic";
    return {
      title: firstLine.slice(0, 120),
      body: fallbackText.trim() || firstLine,
    };
  }, []);

  const threadRepliesByParent = useMemo(() => {
    const map: Record<string, Message[]> = {};
    messages.forEach((m) => {
      if (!m.reply_to) return;
      if (!map[m.reply_to]) map[m.reply_to] = [];
      map[m.reply_to].push(m);
    });
    Object.values(map).forEach((items) => {
      items.sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));
    });
    return map;
  }, [messages, parseTs]);

  const threadUnreadCountByParent = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(threadRepliesByParent).forEach(([parentId, replies]) => {
      const baseTs = Math.max(parseTs(activeLastReadAt), parseTs(threadReadAtByParent[parentId]));
      const unreadCount = replies.filter((reply) => reply.user_id !== user?.id && parseTs(reply.created_at) > baseTs).length;
      map[parentId] = unreadCount;
    });
    return map;
  }, [activeLastReadAt, parseTs, threadReadAtByParent, threadRepliesByParent, user?.id]);

  const threadSummaries = useMemo<ThreadSummaryItem[]>(() => {
    return messages
      .filter((m) => !m.reply_to)
      .map((parent) => {
        const replies = threadRepliesByParent[parent.id] || [];
        if (replies.length === 0) return null;
        const lastReplyAt = replies[replies.length - 1]?.created_at || parent.created_at;
        return {
          parentMessage: parent,
          replyCount: replies.length,
          lastReplyAt,
          hasUnread: (threadUnreadCountByParent[parent.id] || 0) > 0,
          searchText: `${getMessageBodyText(parent)} ${replies.map((reply) => getMessageBodyText(reply)).join(" ")}`.toLowerCase(),
        };
      })
      .filter((item): item is ThreadSummaryItem => !!item)
      .sort((a, b) => parseTs(b.lastReplyAt) - parseTs(a.lastReplyAt));
  }, [getMessageBodyText, messages, parseTs, threadRepliesByParent, threadUnreadCountByParent]);

  const markThreadAsSeen = useCallback((threadId: string, seenAt: string) => {
    setThreadReadAtByParent((prev) => {
      const prevTs = parseTs(prev[threadId]);
      const nextTs = parseTs(seenAt);
      if (nextTs <= prevTs) return prev;
      return { ...prev, [threadId]: seenAt };
    });
  }, [parseTs]);

  const openThread = useCallback((msg: Message) => {
    setThreadMessage(msg);
    setShowThreadPanel(true);
  }, []);

  const renderMessageActions = (msg: Message, isOwn: boolean) => (
    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-2">
      <EmojiPicker onSelect={(emoji) => addReaction(msg.id, emoji)} />
      <button onClick={() => setReplyTo(msg)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Reply"><Reply className="w-3.5 h-3.5" /></button>
      <button onClick={() => openThread(msg)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Thread"><MessageSquare className="w-3.5 h-3.5" /></button>
      {canPinMessages && (
        <button onClick={() => msg.pinned_at ? unpinMessage(msg.id) : pinMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-foreground" title={msg.pinned_at ? "Unpin" : "Pin"}>
          <Pin className={`w-3.5 h-3.5 ${msg.pinned_at ? "text-primary" : ""}`} />
        </button>
      )}
      {isOwn && <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>}
      {(isOwn || canDeleteAnyMessages) && (
        <button onClick={() => deleteMessage(msg.id)} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
      )}
    </div>
  );

  const renderThreadIndicator = (msg: Message, compact = false) => {
    const count = (threadRepliesByParent[msg.id] || []).length;
    if (!count) return null;
    const unreadCount = threadUnreadCountByParent[msg.id] || 0;
    return (
      <button onClick={() => openThread(msg)} className={`flex items-center gap-1 text-xs text-primary hover:underline ${compact ? "mt-0" : "mt-0.5"}`}>
        <MessageSquare className="w-3 h-3" />
        {count} {count === 1 ? "reply" : "replies"}
        {unreadCount > 0 && <span className="font-semibold">({unreadCount} unread)</span>}
      </button>
    );
  };

  const renderContent = (content: string) => {
    const parsed = parseMessageFeatures(content);
    if (parsed.kind === "announcement" || parsed.kind === "question") {
      return renderContentWithMentions(parsed.text, members, {
        channels,
        onChannelClick: handleChannelReferenceClick,
        onMentionClick: handleMentionClick,
      });
    }
    if (parsed.kind === "forum_topic") {
      const topicText = parsed.topic.body && parsed.topic.body !== parsed.topic.title
        ? `${parsed.topic.title}\n${parsed.topic.body}`
        : parsed.topic.title;
      return renderContentWithMentions(topicText, members, {
        channels,
        onChannelClick: handleChannelReferenceClick,
        onMentionClick: handleMentionClick,
      });
    }
    if (parsed.kind === "plain") {
      return renderContentWithMentions(parsed.text, members, {
        channels,
        onChannelClick: handleChannelReferenceClick,
        onMentionClick: handleMentionClick,
      });
    }
    return parsed.poll.question;
  };

  const renderPollCard = (msg: Message) => {
    const parsed = parseMessageFeatures(msg.content);
    if (parsed.kind !== "poll") return null;
    const poll = parsed.poll;
    const votes = pollVotesByMessage[msg.id] || {};
    const totalVotes = Object.values(votes).reduce((sum, ids) => sum + ids.length, 0);
    return (
      <div className="mt-1 rounded-md border border-border/60 bg-secondary/40 p-3 max-w-xl">
        <p className="text-sm font-semibold text-foreground">{poll.question}</p>
        <div className="mt-2 space-y-1.5">
          {poll.options.map((option, idx) => {
            const optionVotes = votes[idx] || [];
            const voted = !!user?.id && optionVotes.includes(user.id);
            const pct = totalVotes > 0 ? Math.round((optionVotes.length / totalVotes) * 100) : 0;
            return (
              <button
                key={`${msg.id}-opt-${idx}`}
                onClick={() => void handleVotePoll(msg.id, idx, !!poll.multipleChoice)}
                className={`w-full text-left px-2.5 py-2 rounded-md border text-sm transition-colors ${
                  voted
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/70 text-foreground hover:bg-chat-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{option}</span>
                  <span className="text-xs text-muted-foreground">{optionVotes.length} ({pct}%)</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {totalVotes} vote{totalVotes === 1 ? "" : "s"}{poll.multipleChoice ? " | Multiple choice" : ""}
        </p>
      </div>
    );
  };

  // Filter out thread replies from main view (show only top-level messages)
  const topLevelMessages = messages.filter((m) => !m.reply_to);
  const forumTopics = useMemo(
    () => [...topLevelMessages].sort((a, b) => parseTs(b.created_at) - parseTs(a.created_at)),
    [parseTs, topLevelMessages],
  );
  const firstUnreadTopLevelMessageId = useMemo(() => {
    if (activeUnreadCount <= 0) return null;
    if (topLevelMessages.length === 0) return null;
    if (!activeLastReadAt) return topLevelMessages[0].id;
    const lastReadTs = new Date(activeLastReadAt).getTime();
    const firstUnread = topLevelMessages.find((m) => new Date(m.created_at).getTime() > lastReadTs);
    return firstUnread?.id || null;
  }, [activeLastReadAt, activeUnreadCount, topLevelMessages]);

  const jumpToFirstUnread = useCallback(() => {
    if (!firstUnreadTopLevelMessageId) return;
    const el = document.getElementById(`msg-${firstUnreadTopLevelMessageId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [firstUnreadTopLevelMessageId]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (activeChannelId && el) {
      saveChannelScroll(activeChannelId, el.scrollTop);
    }
    shouldAutoScrollRef.current = isNearBottom();
    if (!activeChannelId || activeUnreadCount === 0) return;
    if (shouldAutoScrollRef.current) {
      void markChannelAsRead(activeChannelId);
    }
  }, [activeChannelId, activeUnreadCount, isNearBottom, markChannelAsRead, saveChannelScroll]);

  const handleForumMessagesScroll = useCallback(() => {
    if (!activeChannelId) return;
    const el = forumMessagesContainerRef.current;
    if (!el) return;
    saveChannelScroll(activeChannelId, el.scrollTop);
  }, [activeChannelId, saveChannelScroll]);

  const getVoiceMoveTarget = useCallback(
    (userId: string) => {
      const selected = moveVoiceTargetByUser[userId];
      if (selected) return selected;
      const fallback = voiceChannelOptions.find((c) => c.id !== activeVoiceChannelId);
      return fallback?.id || "";
    },
    [activeVoiceChannelId, moveVoiceTargetByUser, voiceChannelOptions],
  );

  const handleModerateVoiceParticipant = useCallback(
    async (userId: string, action: "kick" | "force_mute" | "force_unmute" | "move", targetChannelId?: string) => {
      try {
        await moderateVoiceParticipant(userId, action, targetChannelId);
        if (action === "kick") toast.success("User kicked from voice.");
        if (action === "force_mute") toast.success("User voice-muted.");
        if (action === "force_unmute") toast.success("User unmuted.");
        if (action === "move") toast.success("User moved to another voice channel.");
      } catch (error) {
        toast.error(`Voice moderation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
    [moderateVoiceParticipant],
  );

  const handleToggleExpandedVideoCard = useCallback((userId: string) => {
    setExpandedVideoUserId((prev) => (prev === userId ? null : userId));
  }, []);

  const handleChannelReferenceClick = useCallback((channelRef: { id: string; server_id?: string }) => {
    if (channelRef.id === activeChannelId) return;
    if (channelRef.server_id && channelRef.server_id !== activeServerId) {
      setActiveServer(channelRef.server_id);
      window.setTimeout(() => setActiveChannel(channelRef.id), 110);
      return;
    }
    setActiveChannel(channelRef.id);
  }, [activeChannelId, activeServerId, setActiveChannel, setActiveServer]);

  const openProfileFromAnchor = useCallback((targetUser: typeof members[0] | undefined, anchorEl: HTMLElement) => {
    if (!targetUser) return;
    const rect = anchorEl.getBoundingClientRect();
    setProfilePos({ top: rect.bottom + 4, left: rect.left });
    setProfileUser(targetUser);
  }, []);

  const handleMentionClick = useCallback((username: string, anchorEl: HTMLElement) => {
    const target = members.find((m) => m.username.toLowerCase() === username.toLowerCase());
    openProfileFromAnchor(target, anchorEl);
  }, [members, openProfileFromAnchor]);

  const handleFullscreenVideoCard = useCallback((userId: string) => {
    const element = voiceVideoContainerRefByUser.current[userId];
    if (!element) return;
    const compatElement = element as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (element.requestFullscreen) {
      void element.requestFullscreen().catch(() => undefined);
      return;
    }
    if (compatElement.webkitRequestFullscreen) {
      void compatElement.webkitRequestFullscreen();
      return;
    }
    if (compatElement.msRequestFullscreen) {
      void compatElement.msRequestFullscreen();
    }
  }, []);

  useEffect(() => {
    if (!activeChannelId || activeUnreadCount === 0) return;
    if (isNearBottom()) {
      void markChannelAsRead(activeChannelId);
    }
  }, [activeChannelId, activeUnreadCount, isNearBottom, markChannelAsRead, messages.length]);

  useEffect(() => {
    if (!isForumChannelView || !activeChannelId || activeUnreadCount === 0) return;
    void markChannelAsRead(activeChannelId);
  }, [activeChannelId, activeUnreadCount, isForumChannelView, markChannelAsRead]);

  useEffect(() => {
    setMoveVoiceTargetByUser({});
    setExpandedVideoUserId(null);
  }, [activeChannelId]);

  useEffect(() => {
    if (!expandedVideoUserId) return;
    const hasExpandedVideo = participants.some(
      (participant) =>
        participant.userId === expandedVideoUserId &&
        !!videoStreamsByUser[participant.userId] &&
        (participant.cameraOn || participant.screenSharing),
    );
    if (!hasExpandedVideo) setExpandedVideoUserId(null);
  }, [expandedVideoUserId, participants, videoStreamsByUser]);

  useEffect(() => {
    if (!activeVoiceChannelId || !activeChannelId) return;
    const selectedChannel = channels.find((c) => c.id === activeChannelId);
    if (selectedChannel?.type !== "voice") return;
    if (activeChannelId === activeVoiceChannelId) return;
    setActiveChannel(activeVoiceChannelId);
  }, [activeChannelId, activeVoiceChannelId, channels, setActiveChannel]);

  if (loadingMainContent) {
    return <ChatAreaSkeleton forum={isForumChannelView} />;
  }

  if (isVoiceChannelView) {
    const connectedToSelected = isConnected && activeVoiceChannelId === activeChannelId;
    const visibleParticipants = connectedToSelected ? participants : [];
    const orderedVisibleParticipants = expandedVideoUserId
      ? [...visibleParticipants].sort((a, b) => {
          if (a.userId === expandedVideoUserId) return -1;
          if (b.userId === expandedVideoUserId) return 1;
          return 0;
        })
      : visibleParticipants;
    const speakingCount = visibleParticipants.filter((p) => p.speaking).length;
    const participantCount = visibleParticipants.length;
    const voiceGridColumns = participantCount <= 1 ? 1 : participantCount <= 4 ? 2 : participantCount <= 9 ? 3 : 4;
    const voiceCardHeightClass = participantCount <= 1
      ? "h-[420px]"
      : participantCount <= 2
        ? "h-[360px]"
        : participantCount <= 4
          ? "h-[310px]"
          : participantCount <= 6
            ? "h-[270px]"
            : participantCount <= 9
              ? "h-[230px]"
              : "h-[200px]";
    const voiceAvatarSizeClass = participantCount <= 1
      ? "w-36 h-36 text-3xl"
      : participantCount <= 2
        ? "w-32 h-32 text-2xl"
        : participantCount <= 4
          ? "w-28 h-28 text-2xl"
          : participantCount <= 6
            ? "w-24 h-24 text-xl"
            : participantCount <= 9
              ? "w-20 h-20 text-lg"
              : "w-16 h-16 text-base";
    const hasExpandedVideoCard = !!expandedVideoUserId && orderedVisibleParticipants.some(
      (participant) =>
        participant.userId === expandedVideoUserId &&
        !!videoStreamsByUser[participant.userId] &&
        (participant.cameraOn || participant.screenSharing),
    );
    const voiceExpandedCardHeightClass = participantCount <= 4
      ? "h-[min(72vh,760px)]"
      : participantCount <= 9
        ? "h-[min(66vh,680px)]"
        : "h-[min(60vh,620px)]";
    const voiceCompactCardHeightClass = "h-[120px]";

    return (
      <div className={`flex flex-1 min-w-0 bg-chat-area ${revealMainContent ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
        <div className="relative flex flex-col flex-1 min-w-0">
          <div className="h-14 px-2 sm:px-4 flex items-center justify-between border-b border-border/50 shrink-0 bg-gradient-to-r from-secondary/25 via-secondary/10 to-transparent">
            <div className="flex items-center gap-2.5 min-w-0">
              {isMobile && (
                <>
                  <button
                    onClick={onOpenServers}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Open navigation"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenChannels}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Open channels"
                  >
                    <Menu className="w-4 h-4" />
                  </button>
                </>
              )}
              <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{channel?.name || "Voice Channel"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {connectedToSelected
                    ? `${visibleParticipants.length} connected${speakingCount > 0 ? ` | ${speakingCount} speaking` : ""}`
                    : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connectedToSelected && (
                <span className="text-[11px] px-2 py-1 rounded-full border border-border bg-background/70 text-muted-foreground">
                  Live
                </span>
              )}
              {isMobile && (
                <button
                  onClick={onOpenMembers}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Members"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-24">
            {!connectedToSelected && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground rounded-xl border border-border/60 bg-card/70 px-8 py-10 max-w-md">
                  <Volume2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-foreground mb-1">You are not connected to this voice channel.</p>
                  <p className="text-xs">Join from the channel list to view live participant cards and controls.</p>
                </div>
              </div>
            )}

            {connectedToSelected && (
              <div className={`grid h-full w-full gap-4 ${hasExpandedVideoCard ? "content-start" : "content-center"}`}>
                <div
                  className="grid w-full gap-4"
                  style={{ gridTemplateColumns: `repeat(${voiceGridColumns}, minmax(0, 1fr))` }}
                >
                {orderedVisibleParticipants.map((p) => {
                  const profile = memberMap[p.userId];
                  const participantVideoStream = videoStreamsByUser[p.userId];
                  const hasVideoStream = !!participantVideoStream && (p.cameraOn || p.screenSharing);
                  const isVideoExpanded = hasVideoStream && expandedVideoUserId === p.userId;
                  const expandedCardSpan = hasExpandedVideoCard
                    ? (voiceGridColumns >= 3 ? voiceGridColumns - 1 : voiceGridColumns)
                    : (voiceGridColumns > 1 ? Math.min(2, voiceGridColumns) : 1);
                  const expandedCardStyle = isVideoExpanded
                    ? {
                        gridColumn: `span ${expandedCardSpan} / span ${expandedCardSpan}`,
                        gridRow: `span ${hasExpandedVideoCard ? 3 : 2} / span ${hasExpandedVideoCard ? 3 : 2}`,
                      }
                    : undefined;
                  const defaultCardHeightClass = hasExpandedVideoCard && !isVideoExpanded
                    ? voiceCompactCardHeightClass
                    : voiceCardHeightClass;
                  const cardHeightClass = isVideoExpanded ? voiceExpandedCardHeightClass : defaultCardHeightClass;
                  const initials = p.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                  const isTargetOwner = activeServer?.owner_id === p.userId;
                  const canActOnParticipant = !p.self && !isTargetOwner;
                  const moveTarget = getVoiceMoveTarget(p.userId);
                  const displayName = `${p.displayName}${p.self ? " (You)" : ""}`;
                  const stateLabel = p.deafened
                    ? "Deafened"
                    : p.forcedMuted
                      ? "Voice-muted by moderator"
                      : p.muted
                        ? "Muted"
                        : p.speaking
                          ? "Speaking"
                          : "Listening";
                  const stateClass = p.deafened || p.forcedMuted
                    ? "text-destructive"
                    : p.speaking
                      ? "text-status-online"
                      : "text-muted-foreground";
                  const videoStateBadgeClass = p.deafened || p.forcedMuted
                    ? "text-destructive border-destructive/40 bg-destructive/20"
                    : p.speaking
                      ? "text-status-online border-status-online/40 bg-status-online/15"
                      : "text-white/85 border-white/30 bg-black/35";
                  return (
                    <div
                      key={p.userId}
                      onDoubleClick={() => {
                        if (!hasVideoStream) return;
                        handleToggleExpandedVideoCard(p.userId);
                      }}
                      style={expandedCardStyle}
                      className={`group relative overflow-hidden rounded-2xl border border-border/60 shadow-sm flex flex-col ${cardHeightClass} ${
                        hasVideoStream ? "bg-black p-0" : "bg-gradient-to-br from-card via-card to-secondary/20 p-3"
                      } ${
                        hasVideoStream ? (isVideoExpanded ? "cursor-zoom-out ring-2 ring-primary/40" : "cursor-zoom-in") : ""
                      }`}
                    >
                      {hasVideoStream ? (
                        <>
                          <div className="relative h-full w-full overflow-hidden" ref={(el) => { voiceVideoContainerRefByUser.current[p.userId] = el; }}>
                            <video
                              ref={(el) => {
                                if (!el || el.srcObject === participantVideoStream) return;
                                el.srcObject = participantVideoStream;
                              }}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/25" />
                            <div className="absolute left-3 bottom-3 z-10 min-w-0 max-w-[75%]">
                              <p className="text-sm font-medium text-white truncate">
                                {displayName}
                              </p>
                            </div>
                            <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFullscreenVideoCard(p.userId);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-white/30 bg-black/45 px-1.5 py-1 text-[11px] text-white hover:bg-black/60"
                                title="Fullscreen"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 opacity-0 transition-opacity group-hover:opacity-100">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${videoStateBadgeClass}`}>
                                  {stateLabel}
                                </span>
                                <div className="flex items-center gap-1">
                                  {p.forcedMuted && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/25 text-destructive border border-destructive/35">
                                      Forced
                                    </span>
                                  )}
                                  {p.cameraOn && !p.screenSharing && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/30 bg-black/45 text-white">
                                      Camera
                                    </span>
                                  )}
                                  {p.screenSharing && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/30 bg-black/45 text-white">
                                      Screen
                                    </span>
                                  )}
                                  {p.muted && !p.forcedMuted && (
                                    <MicOff className="w-3.5 h-3.5 text-white/85" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          {canModerateVoiceUsers && canActOnParticipant && (
                            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {canVoiceMuteUsers && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleModerateVoiceParticipant(p.userId, p.forcedMuted ? "force_unmute" : "force_mute");
                                    }}
                                    className={`px-2 py-1 rounded text-xs border ${
                                      p.forcedMuted
                                        ? "border-primary/60 text-primary bg-primary/20 hover:bg-primary/30"
                                        : "border-white/35 text-white bg-black/45 hover:bg-black/65"
                                    }`}
                                  >
                                    {p.forcedMuted ? "Unmute" : "Mute"}
                                  </button>
                                )}
                                {canVoiceKickUsers && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleModerateVoiceParticipant(p.userId, "kick");
                                    }}
                                    className="px-2 py-1 rounded text-xs border border-white/35 bg-black/45 text-white hover:text-destructive hover:bg-black/65 inline-flex items-center gap-1"
                                  >
                                    <UserX className="w-3 h-3" />
                                    Kick
                                  </button>
                                )}
                                {canMoveVoiceUsers && voiceChannelOptions.length > 1 && (
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={moveTarget}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setMoveVoiceTargetByUser((prev) => ({ ...prev, [p.userId]: e.target.value }))}
                                      className="px-1.5 py-1 rounded bg-black/55 border border-white/35 text-[11px] text-white"
                                    >
                                      {voiceChannelOptions
                                        .filter((voiceChannel) => voiceChannel.id !== activeVoiceChannelId)
                                        .map((voiceChannel) => (
                                          <option key={`${p.userId}-${voiceChannel.id}`} value={voiceChannel.id}>
                                            #{voiceChannel.name}
                                          </option>
                                        ))}
                                    </select>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleModerateVoiceParticipant(p.userId, "move", moveTarget);
                                      }}
                                      disabled={!moveTarget}
                                      className="px-2 py-1 rounded text-xs border border-white/35 text-white hover:bg-black/65 disabled:opacity-50"
                                    >
                                      Move
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="relative z-10 flex items-center justify-between gap-2">
                            <span className={`text-[11px] px-1.5 py-0.5 rounded border bg-secondary/60 border-border/60 ${stateClass}`}>
                              {stateLabel}
                            </span>
                            <div className="flex items-center gap-1">
                              {p.forcedMuted && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">
                                  Forced
                                </span>
                              )}
                              {p.muted && !p.forcedMuted && (
                                <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          <div className="relative z-10 flex flex-1 items-center justify-center">
                            {profile?.avatar_url ? (
                              <img
                                src={profile.avatar_url}
                                alt={p.displayName}
                                className={`${voiceAvatarSizeClass} rounded-full object-cover ring-4 shadow-xl ${
                                  p.speaking ? "ring-status-online/70" : "ring-border/70"
                                }`}
                              />
                            ) : (
                              <div className={`${voiceAvatarSizeClass} rounded-full bg-secondary flex items-center justify-center font-semibold text-foreground ring-4 shadow-xl ${
                                p.speaking ? "ring-status-online/70" : "ring-border/70"
                              }`}>
                                {initials}
                              </div>
                            )}
                          </div>

                          <div className="relative z-10 mt-1 text-center">
                            <p className={`text-sm truncate text-foreground ${p.self ? "font-semibold" : ""}`}>
                              {displayName}
                            </p>
                            <div className="mt-1 flex items-center justify-center gap-1">
                              {p.cameraOn && !p.screenSharing && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/15 text-primary border-primary/30">
                                  Camera
                                </span>
                              )}
                              {p.screenSharing && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/15 text-primary border-primary/30">
                                  Screen
                                </span>
                              )}
                            </div>
                          </div>
                          {canModerateVoiceUsers && canActOnParticipant && (
                            <div className="relative z-10 mt-3 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
                              {canVoiceMuteUsers && (
                                <button
                                  onClick={() => void handleModerateVoiceParticipant(p.userId, p.forcedMuted ? "force_unmute" : "force_mute")}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    p.forcedMuted
                                      ? "border-primary/50 text-primary hover:bg-primary/10"
                                      : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {p.forcedMuted ? "Unmute" : "Mute"}
                                </button>
                              )}
                              {canVoiceKickUsers && (
                                <button
                                  onClick={() => void handleModerateVoiceParticipant(p.userId, "kick")}
                                  className="px-2 py-1 rounded text-xs border border-border bg-background/70 text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                                >
                                  <UserX className="w-3 h-3" />
                                  Kick
                                </button>
                              )}
                              {canMoveVoiceUsers && voiceChannelOptions.length > 1 && (
                                <div className="ml-auto flex items-center gap-1">
                                  <select
                                    value={moveTarget}
                                    onChange={(e) => setMoveVoiceTargetByUser((prev) => ({ ...prev, [p.userId]: e.target.value }))}
                                    className="px-1.5 py-1 rounded bg-background border border-border text-[11px] text-foreground"
                                  >
                                    {voiceChannelOptions
                                      .filter((voiceChannel) => voiceChannel.id !== activeVoiceChannelId)
                                      .map((voiceChannel) => (
                                        <option key={`${p.userId}-${voiceChannel.id}`} value={voiceChannel.id}>
                                          #{voiceChannel.name}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    onClick={() => void handleModerateVoiceParticipant(p.userId, "move", moveTarget)}
                                    disabled={!moveTarget}
                                    className="px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                                  >
                                    Move
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
          {connectedToSelected && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
              <div className="pointer-events-auto rounded-lg border border-border/50 bg-gradient-to-r from-server-bar via-secondary/20 to-server-bar px-3 py-2 flex items-center gap-2 shadow-sm">
                <button
                  onClick={() => void toggleCamera()}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors ${
                    isCameraOn
                      ? "border-primary/50 text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={isCameraOn ? "Turn camera off" : "Turn camera on"}
                >
                  {isCameraOn ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  Camera
                </button>
                <button
                  onClick={() => void toggleScreenShare()}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors ${
                    isScreenSharing
                      ? "border-primary/50 text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={isScreenSharing ? "Stop screen share" : "Share screen"}
                >
                  {isScreenSharing ? <ScreenShareOff className="w-3.5 h-3.5" /> : <ScreenShare className="w-3.5 h-3.5" />}
                  Screen
                </button>
                <button
                  onClick={() => void leaveVoiceChannel()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  Leave
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isForumChannelView) {
    return (
      <div className="flex flex-1 min-w-0">
        <div className={`flex flex-col flex-1 min-w-0 bg-chat-area ${revealMainContent ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
          <div className="h-12 px-2 sm:px-4 flex items-center justify-between border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {isMobile && (
                <>
                  <button
                    onClick={onOpenServers}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Open navigation"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenChannels}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Open channels"
                  >
                    <Menu className="w-4 h-4" />
                  </button>
                </>
              )}
              <MessageSquare className="w-5 h-5 text-muted-foreground" />
              <span className="font-semibold text-foreground truncate">{channel?.name || "forum"}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={() => setShowSearch(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Search"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setShowThreadPanel(true);
                  setThreadMessage(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Topics with replies"
              >
                <Inbox className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowCreateTopicModal(true)}
                className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                title="Create topic"
              >
                New Topic
              </button>
            </div>
          </div>

          <div
            ref={forumMessagesContainerRef}
            onScroll={handleForumMessagesScroll}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {!activeChannelId && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-semibold text-foreground">Select a forum channel</p>
                <p className="text-sm">Pick a forum to browse long-running topics.</p>
              </div>
            )}

            {activeChannelId && forumTopics.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-semibold text-foreground">No topics yet</p>
                <p className="text-sm">Start the first topic for this forum.</p>
                <button
                  onClick={() => setShowCreateTopicModal(true)}
                  className="mt-4 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >
                  Create Topic
                </button>
              </div>
            )}

            {forumTopics.map((topicMessage) => {
              const topic = getForumTopic(topicMessage);
              const author = memberMap[topicMessage.user_id]?.display_name || "Unknown";
              const replies = threadRepliesByParent[topicMessage.id] || [];
              const unreadReplies = threadUnreadCountByParent[topicMessage.id] || 0;
              const lastActivity = replies[replies.length - 1]?.created_at || topicMessage.created_at;
              const bodyPreview = topic.body.length > 240 ? `${topic.body.slice(0, 240)}...` : topic.body;

              return (
                <div key={topicMessage.id} className="rounded-xl border border-border/60 bg-card/80 hover:border-primary/35 transition-colors p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">{topic.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{author}</span>
                        <span>|</span>
                        <span>{formatTimestamp(topicMessage.created_at)}</span>
                        <span>|</span>
                        <span>Last activity {formatTimestamp(lastActivity)}</span>
                      </div>
                    </div>
                    {topicMessage.pinned_at && <Pin className="w-4 h-4 text-primary shrink-0" />}
                  </div>

                  {bodyPreview && (
                    <p className="mt-2 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {bodyPreview}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                        {replies.length} {replies.length === 1 ? "reply" : "replies"}
                      </span>
                      {unreadReplies > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                          {unreadReplies} unread
                        </span>
                      )}
                      {topicMessage.attachment_url && (
                        <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">Attachment</span>
                      )}
                    </div>
                    <button
                      onClick={() => openThread(topicMessage)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Open Discussion
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <Dialog open={showCreateTopicModal} onOpenChange={setShowCreateTopicModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Topic</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <input
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder="Topic title"
                  className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                />
                <textarea
                  value={topicBody}
                  onChange={(e) => setTopicBody(e.target.value)}
                  placeholder="Describe the topic (optional)"
                  rows={5}
                  className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm resize-y"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowCreateTopicModal(false)}
                    className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleCreateTopic()}
                    disabled={creatingTopic || !topicTitle.trim()}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  >
                    {creatingTopic ? "Posting..." : "Post Topic"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <SearchDialog open={showSearch} onClose={() => setShowSearch(false)} />
          <PinnedMessagesPanel open={showPinned} onClose={() => setShowPinned(false)} members={memberMap} />
        </div>

        {showThreadPanel && (
          isMobile ? (
            <div className="fixed inset-0 z-50 bg-chat-area">
              <ThreadPanel
                parentMessage={threadMessage}
                onClose={() => { setShowThreadPanel(false); setThreadMessage(null); }}
                onOpenThread={openThread}
                onBackToList={() => setThreadMessage(null)}
                threadSummaries={threadSummaries}
                onThreadSeen={markThreadAsSeen}
                members={memberMap}
                mobileFullscreen
              />
            </div>
          ) : (
            <ThreadPanel
              parentMessage={threadMessage}
              onClose={() => { setShowThreadPanel(false); setThreadMessage(null); }}
              onOpenThread={openThread}
              onBackToList={() => setThreadMessage(null)}
              threadSummaries={threadSummaries}
              onThreadSeen={markThreadAsSeen}
              members={memberMap}
              desktopOverlay
            />
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-w-0">
      <div className={`flex flex-col flex-1 min-w-0 bg-chat-area relative ${revealMainContent ? "animate-in fade-in-0 duration-200 ease-out" : ""}`}>
        {/* Header */}
        <div className="h-12 px-2 sm:px-4 flex items-center justify-between border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <>
                <button
                  onClick={onOpenServers}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Open navigation"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenChannels}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Open channels"
                >
                  <Menu className="w-4 h-4" />
                </button>
              </>
            )}
            <Hash className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-foreground truncate">{channel?.name || "general"}</span>
            {activeUnreadCount > 0 && firstUnreadTopLevelMessageId && (
              <button
                onClick={jumpToFirstUnread}
                className="ml-1 sm:ml-2 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 whitespace-nowrap"
              >
                Jump to first unread ({activeUnreadCount})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => {
                setLoadingEvents(true);
                setShowEventsModal(true);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Events Calendar"
            >
              <CalendarDays className="w-5 h-5" />
            </button>
            <button onClick={() => setShowPinned(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Pinned Messages"><Pin className="w-5 h-5" /></button>
            <button
              onClick={() => {
                if (isMobile) {
                  onOpenMembers?.();
                }
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Members"
            >
              <Users className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSearch(true)} className="text-muted-foreground hover:text-foreground transition-colors"><Search className="w-5 h-5" /></button>
            <button
              onClick={() => { setShowThreadPanel(true); setThreadMessage(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Threads"
            >
              <Inbox className="w-5 h-5" />
            </button>
            {canManageChannels && channel?.type === "text" && (
              <button
                onClick={() => void toggleQaMode()}
                disabled={togglingQaMode}
                className={`text-xs px-2 py-1 rounded border transition-colors ${qaModeEnabled ? "border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                title={qaModeEnabled ? "Disable Q&A mode" : "Enable Q&A mode"}
              >
                Q&A
              </button>
            )}
            <button className={`${isMobile ? "hidden" : "inline-flex"} text-muted-foreground hover:text-foreground transition-colors`}><HelpCircle className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {!activeChannelId && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Hash className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-foreground">Select a channel</p>
              <p className="text-sm">Pick a channel to start chatting</p>
            </div>
          )}
          {activeChannelId && topLevelMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Hash className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-foreground">Welcome to #{channel?.name}!</p>
              <p className="text-sm">This is the start of the channel.</p>
            </div>
          )}
          {topLevelMessages.map((msg, i) => {
            const msgUser = memberMap[msg.user_id];
            const prevMsg = topLevelMessages[i - 1];
            const prevPrevMsg = topLevelMessages[i - 2];
            const nextMsg = topLevelMessages[i + 1];
            const isOwn = msg.user_id === user?.id;
            const isEditing = editingId === msg.id;
            const isBannedTombstone = msg.content === "User Banned";
            const parsedMessage = parseMessageFeatures(msg.content);
            const showDateDivider = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
            const isGrouped = !isBannedTombstone &&
              !showDateDivider &&
              prevMsg?.user_id === msg.user_id &&
              new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
            const startsNewVisualGroupFromPrev = !!prevMsg && !isGrouped && !showDateDivider;
            const startsGroupedRun = !isBannedTombstone &&
              !isGrouped &&
              !!nextMsg &&
              nextMsg.user_id === msg.user_id &&
              isSameDay(new Date(msg.created_at), new Date(nextMsg.created_at)) &&
              new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime() < 300000;
            const prevWasGrouped = !isBannedTombstone &&
              !!prevMsg &&
              !!prevPrevMsg &&
              prevPrevMsg.user_id === prevMsg.user_id &&
              isSameDay(new Date(prevMsg.created_at), new Date(prevPrevMsg.created_at)) &&
              new Date(prevMsg.created_at).getTime() - new Date(prevPrevMsg.created_at).getTime() < 300000;
            const isFirstGroupedFollowup = isGrouped && !prevWasGrouped;
            const rowSpacingClass = startsNewVisualGroupFromPrev
              ? (startsGroupedRun ? "pt-2 pb-0" : "pt-3 pb-1")
              : (startsGroupedRun ? "pt-0.5 pb-0" : "py-1");
            const groupedRunGapAdjustClass = startsGroupedRun ? "-mb-[2px]" : "";
            const displayName = isBannedTombstone ? "User Banned" : (msgUser?.display_name || "Unknown");
            const displayNamePresentation = getRoleNamePresentation(msgUser);
            const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            const isFirstUnread = msg.id === firstUnreadTopLevelMessageId;

            if (isGrouped) {
              return (
                <Fragment key={msg.id}>
                  {showDateDivider && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="h-px flex-1 bg-border/70" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatDateDividerLabel(msg.created_at)}
                      </span>
                      <div className="h-px flex-1 bg-border/70" />
                    </div>
                  )}
                  {isFirstUnread && activeUnreadCount > 0 && (
                    <div className="flex items-center gap-2 py-2">
                      <div className="h-px flex-1 bg-primary/40" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                        {activeUnreadCount} unread
                      </span>
                      <div className="h-px flex-1 bg-primary/40" />
                    </div>
                  )}
                <div
                  id={`msg-${msg.id}`}
                  className={`${isBannedTombstone ? "pl-1" : "pl-[60px]"} py-0 hover:bg-chat-hover rounded group relative ${
                    msg.pinned_at ? "border-l-2 border-primary/40 -ml-1 pl-[62px]" : ""
                  }`}
                  style={isFirstGroupedFollowup ? { marginTop: "-0px" } : undefined}
                >
                  <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -ml-[42px] mt-0.5">
                    {format(new Date(msg.created_at), "h:mm")}
                  </span>
                  {renderReplyPreview(msg)}
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                      <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      {!isBannedTombstone && (
                        <div className="flex items-center gap-1">
                          {parsedMessage.kind === "announcement" && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              <Megaphone className="w-3 h-3" />
                              Announcement
                            </span>
                          )}
                          {parsedMessage.kind === "question" && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                              Q&A
                            </span>
                          )}
                          <p className="text-sm text-foreground">{renderContent(msg.content)}</p>
                          {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                          {msg.client_status === "pending" && <span className="text-[10px] text-muted-foreground">(sending)</span>}
                          {msg.client_status === "retrying" && <span className="text-[10px] text-amber-600">(retrying)</span>}
                          {msg.client_status === "failed" && <span className="text-[10px] text-destructive">(failed)</span>}
                          {renderMessageActions(msg, isOwn)}
                        </div>
                      )}
                      {renderPollCard(msg)}
                      {renderAttachment(msg)}
                      <MessageReactions messageId={msg.id} compact={startsGroupedRun} />
                      {!isBannedTombstone && renderThreadIndicator(msg, startsGroupedRun)}
                    </>
                  )}
                </div>
                </Fragment>
              );
            }

            return (
              <Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-border/70" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {formatDateDividerLabel(msg.created_at)}
                    </span>
                    <div className="h-px flex-1 bg-border/70" />
                  </div>
                )}
                {isFirstUnread && activeUnreadCount > 0 && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-px flex-1 bg-primary/40" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {activeUnreadCount} unread
                    </span>
                    <div className="h-px flex-1 bg-primary/40" />
                  </div>
                )}
              <div id={`msg-${msg.id}`} className={`flex gap-4 ${rowSpacingClass} ${groupedRunGapAdjustClass} hover:bg-chat-hover rounded px-1 group ${msg.pinned_at ? "border-l-2 border-primary/40" : ""}`}>
                {!isBannedTombstone && (
                  <div className="w-10 h-10 rounded-full shrink-0 mt-0.5 overflow-hidden bg-secondary flex items-center justify-center text-xs font-semibold text-foreground">
                    {msgUser?.avatar_url ? (
                      <img src={msgUser.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: `hsl(${(msg.user_id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                      >
                        {initials}
                      </div>
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {!isBannedTombstone ? (
                      <span
                        className={`text-sm text-foreground hover:underline cursor-pointer ${displayNamePresentation.className}`}
                        style={displayNamePresentation.style}
                        onClick={(e) => {
                          openProfileFromAnchor(msgUser, e.currentTarget as HTMLElement);
                        }}
                      >
                        {displayName}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">{displayName}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{formatTimestamp(msg.created_at)}</span>
                    {msg.pinned_at && <Pin className="w-3 h-3 text-primary inline" />}
                  </div>
                  {renderReplyPreview(msg)}
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditingId(null); }} className="flex-1 bg-chat-input text-sm text-foreground px-2 py-1 rounded outline-none" autoFocus />
                      <button onClick={handleEdit} className="text-status-online"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      {!isBannedTombstone && (
                        <div className="flex items-center gap-1">
                          {parsedMessage.kind === "announcement" && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              <Megaphone className="w-3 h-3" />
                              Announcement
                            </span>
                          )}
                          {parsedMessage.kind === "question" && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                              Q&A
                            </span>
                          )}
                          <p className="text-sm text-foreground">{renderContent(msg.content)}</p>
                          {msg.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                          {msg.client_status === "pending" && <span className="text-[10px] text-muted-foreground">(sending)</span>}
                          {msg.client_status === "retrying" && <span className="text-[10px] text-amber-600">(retrying)</span>}
                          {msg.client_status === "failed" && <span className="text-[10px] text-destructive">(failed)</span>}
                          {renderMessageActions(msg, isOwn)}
                        </div>
                      )}
                      {renderPollCard(msg)}
                      {renderAttachment(msg)}
                      <MessageReactions messageId={msg.id} />
                      {!isBannedTombstone && renderThreadIndicator(msg)}
                    </>
                  )}
                </div>
              </div>
              </Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1">
            <p className="text-xs text-muted-foreground animate-pulse-subtle">
              <span className="font-semibold text-foreground">{typingUsers.map(u => u.display_name).join(", ")}</span>
              {typingUsers.length === 1 ? " is typing..." : " are typing..."}
            </p>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="px-4 py-1">
            <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2">
              <Reply className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">Replying to</span>
              <span className="text-xs font-semibold text-foreground">{memberMap[replyTo.user_id]?.display_name || "Unknown"}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{replyTo.content}</span>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Pending attachment preview */}
        {pendingAttachment && (
          <div className="px-4 py-1">
            <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2 max-w-xs">
              {pendingAttachment.type.startsWith("image/") ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileIcon className="w-4 h-4 text-primary" />}
              <span className="text-sm text-foreground truncate flex-1">{pendingAttachment.name}</span>
              <button onClick={() => setPendingAttachment(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Input */}
        {activeChannelId && (
          <div className="px-4 pb-6 pt-1 relative">
            <MentionAutocomplete
              query={mentionQuery}
              members={members}
              onSelect={handleMentionSelect}
              visible={showMentions}
            />
            <div className="flex items-center gap-2 bg-chat-input rounded-lg px-4 py-2.5">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50">
                <PlusCircle className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !showMentions) handleSend();
                  if (e.key === "Escape") { setShowMentions(false); setReplyTo(null); }
                }}
                placeholder={
                  timedOutActive
                    ? `Timed out until ${new Date(moderationState.timed_out_until as string).toLocaleTimeString()}`
                    : mutedActive
                      ? `Muted until ${new Date(moderationState.muted_until as string).toLocaleTimeString()}`
                      : bannedActive
                        ? "You are banned from this server"
                        : qaModeEnabled && !replyTo
                          ? "Ask a question..."
                        : uploading
                          ? "Uploading..."
                          : `Message #${channel?.name || "general"}`
                }
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                disabled={uploading || onboardingBlocked || checkingRulesAcceptance}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowScheduleModal(true)}
                  disabled={!input.trim()}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Schedule message"
                >
                  <CalendarClock className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowPollModal(true)}
                  disabled={qaModeEnabled && !replyTo}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Create poll"
                >
                  <BarChart3 className="w-5 h-5" />
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors"><Gift className="w-5 h-5" /></button>
                <EmojiPicker onSelect={(emoji) => setInput(prev => prev + emoji)}>
                  <button className="text-muted-foreground hover:text-foreground transition-colors"><Smile className="w-5 h-5" /></button>
                </EmojiPicker>
                <button onClick={handleSend} disabled={(!input.trim() && !pendingAttachment) || uploading} className="text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors">
                  <SendHorizonal className="w-5 h-5" />
                </button>
              </div>
            </div>
            {(qaModeEnabled || asQuestion) && !replyTo && (
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={asQuestion}
                  onChange={(e) => setAsQuestion(e.target.checked)}
                  className="rounded border-border"
                />
                Send as question
              </label>
            )}
          </div>
        )}

        {!checkingRulesAcceptance && onboardingBlocked && (
          <div className="absolute inset-0 z-30 bg-chat-area/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl p-5">
              <h2 className="text-xl font-semibold text-foreground mb-2">{onboardingTitle}</h2>
              <p className="text-sm text-muted-foreground mb-4">{onboardingMessage}</p>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {onboardingStepStatus.map((step) => {
                  const stepComplete = step.complete;
                  if (step.step_type === "rules_acceptance") {
                    return (
                      <div key={step.id} className="rounded-md border border-border bg-secondary/20 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-foreground">{step.title}</p>
                          <span className={`text-xs ${stepComplete ? "text-primary" : "text-muted-foreground"}`}>
                            {stepComplete ? "Completed" : "Required"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">
                          {step.description || onboardingRulesText}
                        </p>
                        <div className="rounded-md border border-border bg-background/70 p-2 max-h-40 overflow-y-auto mb-2">
                          <p className="text-sm whitespace-pre-wrap text-foreground">{onboardingRulesText}</p>
                        </div>
                        {!stepComplete && (
                          <>
                            <label className="flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={rulesChecklistChecked}
                                onChange={(e) => setRulesChecklistChecked(e.target.checked)}
                                className="rounded border-border"
                              />
                              I have read and agree to these rules.
                            </label>
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => void handleAcceptRules()}
                                disabled={!rulesChecklistChecked || acceptingRules}
                                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                              >
                                {acceptingRules ? "Accepting..." : "Accept Rules"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }

                  if (step.step_type === "read_channel") {
                    const requiredChannel = channels.find((c) => c.id === step.required_channel_id);
                    return (
                      <div key={step.id} className="rounded-md border border-border bg-secondary/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{step.title}</p>
                          <span className={`text-xs ${stepComplete ? "text-primary" : "text-muted-foreground"}`}>
                            {stepComplete ? "Completed" : "Required"}
                          </span>
                        </div>
                        {step.description && <p className="text-xs text-muted-foreground mt-1">{step.description}</p>}
                        <p className="text-xs text-foreground mt-2">
                          Read channel: <span className="font-medium">#{requiredChannel?.name || "unknown"}</span>
                        </p>
                        {!stepComplete && requiredChannel && (
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => {
                                setActiveChannel(requiredChannel.id);
                                void (async () => {
                                  await markChannelAsRead(requiredChannel.id);
                                  await loadOnboardingState();
                                })();
                              }}
                              className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                            >
                              Open Channel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={step.id} className="rounded-md border border-border bg-secondary/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{step.title}</p>
                        <span className={`text-xs ${stepComplete ? "text-primary" : "text-muted-foreground"}`}>
                          {stepComplete ? "Completed" : "Required"}
                        </span>
                      </div>
                      {step.description && <p className="text-xs text-muted-foreground mt-1">{step.description}</p>}
                      {!stepComplete && (
                        <label className="mt-2 inline-flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={!!onboardingCustomChecks[step.id]}
                            onChange={(e) => setOnboardingCustomChecks((prev) => ({ ...prev, [step.id]: e.target.checked }))}
                            className="rounded border-border"
                          />
                          Mark complete
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => void handleCompleteOnboarding()}
                  disabled={submittingOnboardingCompletion}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {submittingOnboardingCompletion ? "Saving..." : "Complete Onboarding"}
                </button>
              </div>
            </div>
            {timedOutActive && (
              <div className="mt-2">
                <button
                  onClick={() => setShowTimeoutAppealModal(true)}
                  disabled={submittingTimeoutAppeal}
                  className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
                >
                  {submittingTimeoutAppeal ? "Submitting appeal..." : "Appeal Timeout"}
                </button>
              </div>
            )}
          </div>
        )}

        <SearchDialog open={showSearch} onClose={() => setShowSearch(false)} />
        <PinnedMessagesPanel open={showPinned} onClose={() => setShowPinned(false)} members={memberMap} />
        <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
              />
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={scheduleAnnouncement}
                  onChange={(e) => setScheduleAnnouncement(e.target.checked)}
                  className="rounded border-border"
                />
                Send as announcement
              </label>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleScheduleCurrentMessage()}
                  disabled={scheduling || !input.trim() || !scheduleAt}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {scheduling ? "Scheduling..." : "Schedule"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showPollModal} onOpenChange={setShowPollModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Poll</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Poll question"
                className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
              />
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <input
                    key={`poll-opt-${idx}`}
                    value={opt}
                    onChange={(e) => setPollOptions((prev) => prev.map((curr, i) => (i === idx ? e.target.value : curr)))}
                    placeholder={`Option ${idx + 1}`}
                    className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                  />
                ))}
                {pollOptions.length < 6 && (
                  <button
                    onClick={() => setPollOptions((prev) => [...prev, ""])}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add option
                  </button>
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={pollMultipleChoice}
                  onChange={(e) => setPollMultipleChoice(e.target.checked)}
                  className="rounded border-border"
                />
                Allow multiple choices
              </label>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowPollModal(false)}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreatePoll()}
                  disabled={creatingPoll}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {creatingPoll ? "Posting..." : "Post Poll"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={showEventsModal}
          onOpenChange={(open) => {
            if (open) setLoadingEvents(true);
            setShowEventsModal(open);
          }}
        >
          <DialogContent className="max-w-3xl h-[78vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Events Calendar</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 space-y-4 overflow-hidden">
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Create Event</p>
                {!canCreateEvents && (
                  <p className="text-sm text-muted-foreground">
                    You need the <span className="text-foreground font-medium">events</span> permission to create events.
                  </p>
                )}
                {canCreateEvents && (
                  <>
                    <input
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="Event title"
                      className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                    />
                    <textarea
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder="Description (optional)"
                      rows={3}
                      className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm resize-y"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="Location / voice channel / external link"
                        className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="datetime-local"
                          value={eventStartsAt}
                          onChange={(e) => setEventStartsAt(e.target.value)}
                          className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                        />
                        <input
                          type="datetime-local"
                          value={eventEndsAt}
                          onChange={(e) => setEventEndsAt(e.target.value)}
                          className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => void createEvent()}
                        disabled={creatingEvent || !eventTitle.trim() || !eventStartsAt}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                      >
                        {creatingEvent ? "Creating..." : "Create Event"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 min-h-0 rounded-md border border-border/60 bg-background/70 p-3 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Upcoming Events</p>
                  <button
                    onClick={() => void loadEvents()}
                    className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground"
                  >
                    Refresh
                  </button>
                </div>
                {loadingEvents && (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2.5">
                              <Skeleton className="h-4" style={{ width: `${20 + (i * 7) % 14}%` }} />
                              {i % 2 === 0 && <Skeleton className="h-4" style={{ width: `${12 + (i * 5) % 9}%` }} />}
                            </div>
                            <Skeleton className="h-3.5" style={{ width: `${30 + (i * 7) % 16}%` }} />
                            <div className="flex items-center gap-2.5">
                              <Skeleton className="h-3.5" style={{ width: `${18 + (i * 6) % 13}%` }} />
                              <Skeleton className="h-3.5" style={{ width: `${12 + (i * 5) % 9}%` }} />
                            </div>
                            {i % 2 === 1 && (
                              <Skeleton className="h-20 rounded-md" style={{ width: 176 + ((i * 13) % 36) }} />
                            )}
                            <div className="flex items-center gap-2.5 pt-1">
                              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                              <Skeleton className="h-3.5" style={{ width: `${16 + (i * 5) % 10}%` }} />
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-14" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-14 rounded-md" />
                          <Skeleton className="h-8 w-16 rounded-md" />
                          <Skeleton className="h-8 w-12 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingEvents && (
                  <div className={revealEvents ? "animate-in fade-in-0 duration-200 ease-out space-y-3" : "space-y-3"}>
                    {events.length === 0 && (
                      <p className="text-sm text-muted-foreground">No events scheduled.</p>
                    )}
                    {eventsByDate.map((group) => (
                      <div key={group.dateLabel} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{group.dateLabel}</p>
                        {group.items.map((event) => {
                          const eventRsvpRows = eventRsvps.filter((row) => row.event_id === event.id);
                          const ownRsvp = eventRsvpRows.find((row) => row.user_id === user?.id)?.status || null;
                          const goingCount = eventRsvpRows.filter((row) => row.status === "going").length;
                          const maybeCount = eventRsvpRows.filter((row) => row.status === "maybe").length;
                          const notGoingCount = eventRsvpRows.filter((row) => row.status === "not_going").length;
                          const creatorName = memberMap[event.created_by]?.display_name || "Unknown";
                          return (
                            <div key={event.id} className="rounded-md border border-border/60 bg-card p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{event.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(event.starts_at).toLocaleString()}
                                    {event.ends_at ? ` - ${new Date(event.ends_at).toLocaleString()}` : ""}
                                  </p>
                                  {event.location && <p className="text-xs text-muted-foreground">Location: {event.location}</p>}
                                  {event.description && <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{event.description}</p>}
                                  <p className="text-[11px] text-muted-foreground mt-1">Created by {creatorName}</p>
                                </div>
                                <div className="text-[11px] text-muted-foreground text-right">
                                  <p>Going: {goingCount}</p>
                                  <p>Maybe: {maybeCount}</p>
                                  <p>Not going: {notGoingCount}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void upsertRsvp(event, "going")}
                                  disabled={rsvpSavingEventId === event.id}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    ownRsvp === "going" ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Going
                                </button>
                                <button
                                  onClick={() => void upsertRsvp(event, "maybe")}
                                  disabled={rsvpSavingEventId === event.id}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    ownRsvp === "maybe" ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Maybe
                                </button>
                                <button
                                  onClick={() => void upsertRsvp(event, "not_going")}
                                  disabled={rsvpSavingEventId === event.id}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    ownRsvp === "not_going" ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Not Going
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={showTimeoutAppealModal}
          onOpenChange={(open) => {
            setShowTimeoutAppealModal(open);
            if (!open) {
              setTimeoutAppealError(null);
              setTimeoutAppealReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Appeal Timeout</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <textarea
                value={timeoutAppealReason}
                onChange={(e) => setTimeoutAppealReason(e.target.value)}
                placeholder="Why should your timeout be reconsidered?"
                rows={5}
                className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm resize-y"
              />
              {timeoutAppealError && (
                <p className="text-sm text-destructive">{timeoutAppealError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowTimeoutAppealModal(false)}
                  disabled={submittingTimeoutAppeal}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleTimeoutAppeal()}
                  disabled={submittingTimeoutAppeal || !timeoutAppealReason.trim()}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {submittingTimeoutAppeal ? "Submitting..." : "Submit Appeal"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {showThreadPanel && (
        isMobile ? (
          <div className="fixed inset-0 z-50 bg-chat-area">
            <ThreadPanel
              parentMessage={threadMessage}
              onClose={() => { setShowThreadPanel(false); setThreadMessage(null); }}
              onOpenThread={openThread}
              onBackToList={() => setThreadMessage(null)}
              threadSummaries={threadSummaries}
              onThreadSeen={markThreadAsSeen}
              members={memberMap}
              mobileFullscreen
            />
          </div>
        ) : (
          <ThreadPanel
            parentMessage={threadMessage}
            onClose={() => { setShowThreadPanel(false); setThreadMessage(null); }}
            onOpenThread={openThread}
            onBackToList={() => setThreadMessage(null)}
            threadSummaries={threadSummaries}
            onThreadSeen={markThreadAsSeen}
            members={memberMap}
            desktopOverlay
          />
        )
      )}
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
    </div>
  );
};

export default ChatArea;
