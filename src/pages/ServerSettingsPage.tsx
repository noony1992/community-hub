import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Hash, MessageSquare, Plus, Search, Settings, Shield, Trash2, Users, Volume2, PanelLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useChatContext } from "@/context/ChatContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DialogListSkeleton, ServerSettingsSkeleton } from "@/components/skeletons/AppSkeletons";
import { getRoleNamePresentation, type RoleTextEffect, type RoleTextStyle } from "@/lib/roleAppearance";
import RoleBadges from "@/components/chat/RoleBadges";

interface MemberWithRole {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

interface ServerRole {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
  icon: string | null;
  username_color: string | null;
  username_style: RoleTextStyle;
  username_effect: RoleTextEffect;
}

interface TemporaryRoleGrantItem {
  id: string;
  user_id: string;
  role_id: string;
  granted_by: string | null;
  created_at: string;
  expires_at: string | null;
}

interface RolePermissionOverrideItem {
  id: string;
  role_id: string;
  scope_type: "group" | "channel";
  scope_id: string;
  allow_permissions: string[];
  deny_permissions: string[];
  created_at: string;
}

interface RoleTemplateItem {
  id: string;
  name: string;
  definition: {
    roles: Array<{
      name: string;
      color: string;
      position: number;
      permissions: string[];
      icon: string | null;
      username_color: string | null;
      username_style: RoleTextStyle;
      username_effect: RoleTextEffect;
    }>;
  };
  created_at: string;
  updated_at: string;
}

interface BanListItem {
  id: string;
  banned_user_id: string;
  banned_by: string | null;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  banned_user: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  banned_by_user: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

interface AuditLogItem {
  id: string;
  action:
    | "ban_user"
    | "temp_ban_user"
    | "unban_user"
    | "edit_member_role"
    | "delete_channel"
    | "edit_ban_length"
    | "timeout_user"
    | "clear_timeout"
    | "mute_user"
    | "unmute_user"
    | "warn_user"
    | "add_mod_note"
    | "automod_block"
    | "assign_escalation"
    | "update_escalation_status"
    | "file_appeal"
    | "approve_appeal"
    | "reject_appeal";
  actor_id: string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  target: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

interface AutoModSettings {
  regex_patterns: string[];
  block_all_links: boolean;
  blocked_domains: string[];
  toxicity_enabled: boolean;
  toxicity_threshold: number;
  toxicity_terms: string[];
}

interface EscalationItem {
  id: string;
  source_type: "automod" | "manual_report" | "appeal";
  source_ref_id: string | null;
  status: "open" | "in_review" | "resolved" | "dismissed";
  priority: "low" | "medium" | "high" | "critical";
  assigned_to: string | null;
  created_by: string | null;
  target_user_id: string | null;
  reason: string;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface AppealItem {
  id: string;
  user_id: string;
  punishment_type: "ban" | "timeout";
  punishment_ref_id: string | null;
  reason: string;
  status: "submitted" | "under_review" | "approved" | "rejected";
  assigned_to: string | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OnboardingFlowConfig {
  enabled: boolean;
  assign_role_on_complete: string | null;
}

interface OnboardingStepItem {
  id: string;
  server_id: string;
  position: number;
  step_type: "rules_acceptance" | "read_channel" | "custom_ack";
  title: string;
  description: string | null;
  required_channel_id: string | null;
  is_required: boolean;
}

const normalizeChannelName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

const ROLE_PERMISSION_OPTIONS = [
  { key: "mod_menu", label: "Mod Menu Access" },
  { key: "ban_users", label: "Ban Users" },
  { key: "kick_users", label: "Kick Users" },
  { key: "timeout_users", label: "Timeout Users" },
  { key: "mute_users", label: "Mute Users" },
  { key: "voice_kick_users", label: "Kick Voice Users" },
  { key: "voice_mute_users", label: "Mute Voice Users" },
  { key: "move_voice_users", label: "Move Voice Users" },
  { key: "pin_messages", label: "Pin Messages" },
  { key: "delete_messages", label: "Delete Messages" },
  { key: "manage_channels", label: "Manage Channels" },
  { key: "manage_invites", label: "Manage Invites" },
  { key: "events", label: "Events" },
] as const;

const AUTOMOD_REGEX_TEMPLATES = [
  {
    label: "Invite Links",
    pattern: "(?:discord\\.gg|discord(?:app)?\\.com/invite)/[a-zA-Z0-9-]+",
    description: "Blocks Discord invite links.",
  },
  {
    label: "URL Shorteners",
    pattern: "(?:bit\\.ly|tinyurl\\.com|t\\.co|goo\\.gl|rb\\.gy)/\\S+",
    description: "Blocks common short-link domains.",
  },
  {
    label: "Repeated Chars",
    pattern: "(.)\\1{9,}",
    description: "Catches spammy repeated characters (10+).",
  },
  {
    label: "All Caps Spam",
    pattern: "\\b[A-Z]{12,}\\b",
    description: "Flags long all-caps words.",
  },
  {
    label: "Crypto Wallet",
    pattern: "\\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\\b",
    description: "Catches common ETH/BTC wallet patterns.",
  },
  {
    label: "Telegram Handle",
    pattern: "(?:t\\.me/|@)[a-zA-Z0-9_]{4,}",
    description: "Flags Telegram handles/links often used in scams.",
  },
] as const;

const TOXICITY_PRESETS = [
  {
    label: "Lenient",
    threshold: 4,
    terms: [
      "kill yourself",
      "kys",
      "nazi",
      "slur",
      "retard",
    ],
    description: "Blocks only stronger repeated toxicity.",
  },
  {
    label: "Balanced",
    threshold: 2,
    terms: [
      "kill yourself",
      "kys",
      "nazi",
      "slur",
      "hate",
      "retard",
      "fag",
      "whore",
      "die",
    ],
    description: "Default mix for most communities.",
  },
  {
    label: "Strict",
    threshold: 1,
    terms: [
      "kill yourself",
      "kys",
      "nazi",
      "slur",
      "hate",
      "retard",
      "fag",
      "whore",
      "die",
      "stupid",
      "idiot",
      "moron",
    ],
    description: "Blocks on first match.",
  },
] as const;

const toDatetimeLocalValue = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

const formatDuration = (ms: number) => {
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const normalizeRoleName = (value: string) => value.trim().toLowerCase();

const ServerSettingsPage = () => {
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const { user } = useAuth();
  const {
    servers,
    channels,
    channelGroups,
    setActiveServer,
    refreshServers,
    refreshChannels,
    refreshChannelGroups,
  } = useChatContext();

  const [tab, setTab] = useState<"info" | "channels" | "roles" | "moderation">("info");
  const [serverName, setServerName] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "forum" | "voice">("text");
  const [newGroupName, setNewGroupName] = useState("");
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rolePermissionOverrides, setRolePermissionOverrides] = useState<RolePermissionOverrideItem[]>([]);
  const [loadingRoleOverrides, setLoadingRoleOverrides] = useState(false);
  const [overrideScopeType, setOverrideScopeType] = useState<"channel" | "group">("channel");
  const [overrideScopeId, setOverrideScopeId] = useState<string>("");
  const [overridePermissionKey, setOverridePermissionKey] = useState<string>(ROLE_PERMISSION_OPTIONS[0].key);
  const [overrideMode, setOverrideMode] = useState<"allow" | "deny" | "clear">("allow");
  const [savingRoleOverride, setSavingRoleOverride] = useState(false);
  const [deletingRoleOverrideId, setDeletingRoleOverrideId] = useState<string | null>(null);
  const [temporaryRoleGrants, setTemporaryRoleGrants] = useState<TemporaryRoleGrantItem[]>([]);
  const [loadingTemporaryRoleGrants, setLoadingTemporaryRoleGrants] = useState(false);
  const [grantMemberId, setGrantMemberId] = useState<string>("");
  const [grantRoleId, setGrantRoleId] = useState<string>("");
  const [grantExpiresAt, setGrantExpiresAt] = useState<string>("");
  const [savingTemporaryRoleGrant, setSavingTemporaryRoleGrant] = useState(false);
  const [deletingTemporaryRoleGrantId, setDeletingTemporaryRoleGrantId] = useState<string | null>(null);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplateItem[]>([]);
  const [loadingRoleTemplates, setLoadingRoleTemplates] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingRoleTemplate, setSavingRoleTemplate] = useState(false);
  const [deletingRoleTemplateId, setDeletingRoleTemplateId] = useState<string | null>(null);
  const [applyingRoleTemplateId, setApplyingRoleTemplateId] = useState<string | null>(null);
  const [templateImportJson, setTemplateImportJson] = useState("");
  const [exportedTemplateJson, setExportedTemplateJson] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#9CA3AF");
  const [newRoleIcon, setNewRoleIcon] = useState("");
  const [newRoleUsernameColor, setNewRoleUsernameColor] = useState("");
  const [newRoleUsernameStyle, setNewRoleUsernameStyle] = useState<RoleTextStyle>("normal");
  const [newRoleUsernameEffect, setNewRoleUsernameEffect] = useState<RoleTextEffect>("none");
  const [ownerGroupName, setOwnerGroupName] = useState("Owner");
  const [ownerRoleIcon, setOwnerRoleIcon] = useState("");
  const [ownerRoleColor, setOwnerRoleColor] = useState("#f59e0b");
  const [ownerRoleUsernameColor, setOwnerRoleUsernameColor] = useState("");
  const [ownerRoleUsernameStyle, setOwnerRoleUsernameStyle] = useState<RoleTextStyle>("bold");
  const [ownerRoleUsernameEffect, setOwnerRoleUsernameEffect] = useState<RoleTextEffect>("glow");
  const [memberSearch, setMemberSearch] = useState("");
  const [members, setMembers] = useState<MemberWithRole[]>([]);
  const [discoverable, setDiscoverable] = useState(true);
  const [discoverabilitySupported, setDiscoverabilitySupported] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [savingRoleAppearanceId, setSavingRoleAppearanceId] = useState<string | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditorTarget, setRoleEditorTarget] = useState<{ type: "owner" } | { type: "role"; id: string } | null>(null);
  const [roleAppearanceDraft, setRoleAppearanceDraft] = useState<{
    icon: string;
    usernameColor: string;
    usernameStyle: RoleTextStyle;
    usernameEffect: RoleTextEffect;
  }>({
    icon: "",
    usernameColor: "",
    usernameStyle: "normal",
    usernameEffect: "none",
  });
  const [updatingRolePermissionsId, setUpdatingRolePermissionsId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [reorderingRoleId, setReorderingRoleId] = useState<string | null>(null);
  const [savingOwnerGroup, setSavingOwnerGroup] = useState(false);
  const [bans, setBans] = useState<BanListItem[]>([]);
  const [loadingBans, setLoadingBans] = useState(false);
  const [unbanningBanId, setUnbanningBanId] = useState<string | null>(null);
  const [editingBanId, setEditingBanId] = useState<string | null>(null);
  const [editingBanExpiry, setEditingBanExpiry] = useState("");
  const [updatingBanId, setUpdatingBanId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [moderationSubtab, setModerationSubtab] = useState<"bans" | "automod" | "queue" | "appeals" | "audit">("bans");
  const [banSearch, setBanSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [automodSettings, setAutomodSettings] = useState<AutoModSettings>({
    regex_patterns: [],
    block_all_links: false,
    blocked_domains: [],
    toxicity_enabled: true,
    toxicity_threshold: 2,
    toxicity_terms: [],
  });
  const [automodRegexInput, setAutomodRegexInput] = useState("");
  const [automodDomainsInput, setAutomodDomainsInput] = useState("");
  const [automodToxicityInput, setAutomodToxicityInput] = useState("");
  const [loadingAutomod, setLoadingAutomod] = useState(false);
  const [savingAutomod, setSavingAutomod] = useState(false);
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loadingEscalations, setLoadingEscalations] = useState(false);
  const [updatingEscalationId, setUpdatingEscalationId] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [updatingAppealId, setUpdatingAppealId] = useState<string | null>(null);
  const [appealDecisionModalOpen, setAppealDecisionModalOpen] = useState(false);
  const [appealDecisionAppeal, setAppealDecisionAppeal] = useState<AppealItem | null>(null);
  const [appealDecisionStatus, setAppealDecisionStatus] = useState<"approved" | "rejected" | null>(null);
  const [appealDecisionNote, setAppealDecisionNote] = useState("");
  const [appealDecisionUnban, setAppealDecisionUnban] = useState(false);
  const [deletingServer, setDeletingServer] = useState(false);
  const [showDeleteServerConfirm, setShowDeleteServerConfirm] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [onboardingWelcomeTitle, setOnboardingWelcomeTitle] = useState("");
  const [onboardingWelcomeMessage, setOnboardingWelcomeMessage] = useState("");
  const [onboardingRulesText, setOnboardingRulesText] = useState("");
  const [onboardingFlow, setOnboardingFlow] = useState<OnboardingFlowConfig>({
    enabled: true,
    assign_role_on_complete: null,
  });
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStepItem[]>([]);
  const [loadingOnboardingBuilder, setLoadingOnboardingBuilder] = useState(false);
  const [savingOnboardingFlow, setSavingOnboardingFlow] = useState(false);
  const [creatingOnboardingStep, setCreatingOnboardingStep] = useState(false);
  const [updatingOnboardingStepId, setUpdatingOnboardingStepId] = useState<string | null>(null);
  const [deletingOnboardingStepId, setDeletingOnboardingStepId] = useState<string | null>(null);
  const [newOnboardingStepType, setNewOnboardingStepType] = useState<OnboardingStepItem["step_type"]>("custom_ack");
  const [newOnboardingStepTitle, setNewOnboardingStepTitle] = useState("");
  const [newOnboardingStepDescription, setNewOnboardingStepDescription] = useState("");
  const [newOnboardingStepChannelId, setNewOnboardingStepChannelId] = useState("");
  const [newOnboardingStepRequired, setNewOnboardingStepRequired] = useState(true);
  const [rolesSubtab, setRolesSubtab] = useState<"templates" | "manageUsers">("manageUsers");
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const server = useMemo(() => servers.find((s) => s.id === serverId), [servers, serverId]);
  const isOwner = !!user && !!server && server.owner_id === user.id;
  const currentMember = members.find((m) => m.id === user?.id);
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const roleByName = useMemo(() => new Map(roles.map((role) => [role.name.toLowerCase(), role])), [roles]);
  const activeAssignedRoleNamesByUser = useMemo(() => {
    const now = Date.now();
    const byUser = new Map<string, string[]>();
    temporaryRoleGrants
      .filter((grant) => !grant.expires_at || new Date(grant.expires_at).getTime() > now)
      .forEach((grant) => {
        const role = roleById.get(grant.role_id);
        if (!role) return;
        const current = byUser.get(grant.user_id) || [];
        current.push(role.name);
        byUser.set(grant.user_id, current);
      });
    return byUser;
  }, [temporaryRoleGrants, roleById]);
  const persistentAssignedRoleNamesByUser = useMemo(() => {
    const byUser = new Map<string, string[]>();
    temporaryRoleGrants
      .filter((grant) => !grant.expires_at)
      .forEach((grant) => {
        const role = roleById.get(grant.role_id);
        if (!role) return;
        const current = byUser.get(grant.user_id) || [];
        current.push(role.name);
        byUser.set(grant.user_id, current);
      });
    return byUser;
  }, [temporaryRoleGrants, roleById]);
  const sortRoleNamesByPriority = useCallback((roleNames: string[]) => {
    const deduped = Array.from(new Set(roleNames.map((name) => name.trim()).filter(Boolean)));
    return deduped
      .filter((name) => !!roleByName.get(normalizeRoleName(name)))
      .sort((a, b) => {
        const aPos = roleByName.get(normalizeRoleName(a))?.position ?? Number.NEGATIVE_INFINITY;
        const bPos = roleByName.get(normalizeRoleName(b))?.position ?? Number.NEGATIVE_INFINITY;
        return bPos - aPos;
      });
  }, [roleByName]);
  const getMemberAssignedRoleNames = useCallback((member: MemberWithRole) => {
    const extraRoles = persistentAssignedRoleNamesByUser.get(member.id) || [];
    return sortRoleNamesByPriority([member.role, ...extraRoles]);
  }, [persistentAssignedRoleNamesByUser, sortRoleNamesByPriority]);
  const currentRoleNames = useMemo(() => {
    if (!currentMember) return [];
    return sortRoleNamesByPriority([currentMember.role, ...(activeAssignedRoleNamesByUser.get(currentMember.id) || [])]);
  }, [activeAssignedRoleNamesByUser, currentMember, sortRoleNamesByPriority]);
  const currentRole = currentRoleNames
    .map((roleName) => roleByName.get(normalizeRoleName(roleName)))
    .find((role): role is ServerRole => !!role) || null;
  const currentPermissions = useMemo(() => {
    const next = new Set<string>();
    currentRoleNames.forEach((roleName) => {
      const role = roleByName.get(normalizeRoleName(roleName));
      role?.permissions.forEach((permission) => next.add(permission));
    });
    return next;
  }, [currentRoleNames, roleByName]);
  const hasManageChannelsPermission = currentPermissions.has("manage_channels");
  const moderationKeys = ["mod_menu", "ban_users", "kick_users", "timeout_users", "mute_users"];
  const hasModerationPermission = isOwner || moderationKeys.some((key) => currentPermissions.has(key));
  const hasBanPermission = isOwner || currentPermissions.has("ban_users");

  const logModerationAction = useCallback(
    async (
      action: AuditLogItem["action"],
      options?: {
        targetUserId?: string | null;
        metadata?: Record<string, unknown>;
      },
    ) => {
      if (!serverId || !user?.id) return;
      await supabase.from("moderation_audit_logs").insert({
        server_id: serverId,
        actor_id: user.id,
        target_user_id: options?.targetUserId ?? null,
        action,
        metadata: options?.metadata || {},
      });
    },
    [serverId, user?.id],
  );

  useEffect(() => {
    if (!serverId) return;
    setActiveServer(serverId);
  }, [serverId, setActiveServer]);

  useEffect(() => {
    if (server) {
      setServerName(server.name);
      setDiscoverable(server.is_discoverable);
      setOwnerGroupName(server.owner_group_name || "Owner");
      setOwnerRoleIcon(server.owner_role_icon || "");
      setOwnerRoleColor(server.owner_role_color || "#f59e0b");
      setOwnerRoleUsernameColor(server.owner_role_username_color || "");
      setOwnerRoleUsernameStyle(
        server.owner_role_username_style === "normal" ||
          server.owner_role_username_style === "italic" ||
          server.owner_role_username_style === "underline"
          ? server.owner_role_username_style
          : "bold",
      );
      setOwnerRoleUsernameEffect(
        server.owner_role_username_effect === "none" ||
          server.owner_role_username_effect === "shadow"
          ? server.owner_role_username_effect
          : "glow",
      );
      setOnboardingWelcomeTitle(server.onboarding_welcome_title || "Welcome!");
      setOnboardingWelcomeMessage(server.onboarding_welcome_message || "Please review and accept the server rules to continue.");
      setOnboardingRulesText(server.onboarding_rules_text || "Be respectful. No harassment. Follow server topic guidelines.");
    }
  }, [server]);

  useEffect(() => {
    if (!isOwner && tab === "info") {
      setTab(hasManageChannelsPermission ? "channels" : "moderation");
    }
  }, [isOwner, tab, hasManageChannelsPermission]);

  const loadOnboardingBuilder = useCallback(async () => {
    if (!serverId || !isOwner) return;
    setLoadingOnboardingBuilder(true);
    const [{ data: flowRow, error: flowError }, { data: stepRows, error: stepError }] = await Promise.all([
      (supabase as any)
        .from("server_onboarding_flows")
        .select("enabled, assign_role_on_complete")
        .eq("server_id", serverId)
        .maybeSingle(),
      (supabase as any)
        .from("server_onboarding_steps")
        .select("id, server_id, position, step_type, title, description, required_channel_id, is_required")
        .eq("server_id", serverId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (flowError) {
      setLoadingOnboardingBuilder(false);
      alert(`Failed to load onboarding flow: ${flowError.message}`);
      return;
    }
    if (stepError) {
      setLoadingOnboardingBuilder(false);
      alert(`Failed to load onboarding steps: ${stepError.message}`);
      return;
    }
    setOnboardingFlow({
      enabled: flowRow?.enabled ?? true,
      assign_role_on_complete: flowRow?.assign_role_on_complete || null,
    });
    setOnboardingSteps((stepRows || []) as OnboardingStepItem[]);
    setLoadingOnboardingBuilder(false);
  }, [isOwner, serverId]);

  const loadRoles = useCallback(async () => {
    if (!serverId) return;
    setRolesLoaded(false);
    const { data } = await supabase
      .from("server_roles")
      .select("id, name, color, position, permissions, icon, username_color, username_style, username_effect")
      .eq("server_id", serverId)
      .order("position", { ascending: false })
      .order("created_at", { ascending: true });
    const mapped = (data || []).map((role: {
      id: string;
      name: string;
      color: string;
      position: number;
      permissions: unknown;
      icon: string | null;
      username_color: string | null;
      username_style: string | null;
      username_effect: string | null;
    }) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: Array.isArray(role.permissions) ? role.permissions.filter((p: unknown): p is string => typeof p === "string") : [],
      icon: role.icon || null,
      username_color: role.username_color || null,
      username_style: role.username_style === "bold" || role.username_style === "italic" || role.username_style === "underline"
        ? role.username_style
        : "normal",
      username_effect: role.username_effect === "glow" || role.username_effect === "shadow"
        ? role.username_effect
        : "none",
    })) as ServerRole[];
    setRoles(mapped);
    setSelectedRoleId((prev) => prev || mapped[0]?.id || null);
    setRolesLoaded(true);
  }, [serverId]);

  const loadRolePermissionOverrides = useCallback(async () => {
    if (!serverId || !isOwner) return;
    setLoadingRoleOverrides(true);
    const { data, error } = await (supabase as any)
      .from("role_permission_overrides")
      .select("id, role_id, scope_type, scope_id, allow_permissions, deny_permissions, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    setLoadingRoleOverrides(false);
    if (error) {
      alert(`Failed to load role overrides: ${error.message}`);
      return;
    }
    const mapped = (data || []).map((row: {
      id: string;
      role_id: string;
      scope_type: "group" | "channel";
      scope_id: string;
      allow_permissions: unknown;
      deny_permissions: unknown;
      created_at: string;
    }) => ({
      id: row.id,
      role_id: row.role_id,
      scope_type: row.scope_type,
      scope_id: row.scope_id,
      allow_permissions: Array.isArray(row.allow_permissions)
        ? row.allow_permissions.filter((p: unknown): p is string => typeof p === "string")
        : [],
      deny_permissions: Array.isArray(row.deny_permissions)
        ? row.deny_permissions.filter((p: unknown): p is string => typeof p === "string")
        : [],
      created_at: row.created_at,
    })) as RolePermissionOverrideItem[];
    setRolePermissionOverrides(mapped);
  }, [isOwner, serverId]);

  const loadTemporaryRoleGrants = useCallback(async () => {
    if (!serverId || !isOwner) return;
    setLoadingTemporaryRoleGrants(true);
    const { data, error } = await (supabase as any)
      .from("server_temporary_role_grants")
      .select("id, user_id, role_id, granted_by, created_at, expires_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    setLoadingTemporaryRoleGrants(false);
    if (error) {
      alert(`Failed to load temporary role grants: ${error.message}`);
      return;
    }
    setTemporaryRoleGrants((data || []) as TemporaryRoleGrantItem[]);
  }, [isOwner, serverId]);

  const loadRoleTemplates = useCallback(async () => {
    if (!serverId || !isOwner) return;
    setLoadingRoleTemplates(true);
    const { data, error } = await (supabase as any)
      .from("server_role_templates")
      .select("id, name, definition, created_at, updated_at")
      .eq("server_id", serverId)
      .order("updated_at", { ascending: false });
    setLoadingRoleTemplates(false);
    if (error) {
      alert(`Failed to load role templates: ${error.message}`);
      return;
    }
    const mapped = (data || []).map((row: {
      id: string;
      name: string;
      definition: unknown;
      created_at: string;
      updated_at: string;
    }) => {
      const rawRoles = (row.definition as { roles?: unknown })?.roles;
      const parsedRoles = Array.isArray(rawRoles)
        ? rawRoles
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const role = entry as Record<string, unknown>;
              const roleName = typeof role.name === "string" ? role.name.trim() : "";
              if (!roleName) return null;
              return {
                name: roleName,
                color: typeof role.color === "string" ? role.color : "#9CA3AF",
                position: typeof role.position === "number" ? role.position : 0,
                permissions: Array.isArray(role.permissions)
                  ? role.permissions.filter((permission): permission is string => typeof permission === "string")
                  : [],
              };
            })
            .filter((entry): entry is { name: string; color: string; position: number; permissions: string[] } => !!entry)
        : [];
      return {
        id: row.id,
        name: row.name,
        definition: { roles: parsedRoles },
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies RoleTemplateItem;
    });
    setRoleTemplates(mapped);
  }, [isOwner, serverId]);

  useEffect(() => {
    if (!serverId) return;

    const loadMembers = async () => {
      const { data: memberships } = await supabase
        .from("server_members")
        .select("user_id, role")
        .eq("server_id", serverId);

      if (!memberships || memberships.length === 0) {
        setMembers([]);
        return;
      }

      const userIds = memberships.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);

      const profileById = new Map((profiles || []).map((p) => [p.id, p]));
      const merged = memberships
        .map((membership) => {
          const profile = profileById.get(membership.user_id);
          if (!profile) return null;
          return {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url || null,
            role: membership.role as string,
          };
        })
        .filter((member): member is MemberWithRole => !!member);

      setMembers(merged);
    };

    void loadRoles();
    void loadRolePermissionOverrides();
    void loadTemporaryRoleGrants();
    void loadRoleTemplates();
    loadMembers();
  }, [serverId, loadRolePermissionOverrides, loadRoleTemplates, loadRoles, loadTemporaryRoleGrants]);

  useEffect(() => {
    if (tab !== "info" || !isOwner) return;
    void loadOnboardingBuilder();
  }, [tab, isOwner, loadOnboardingBuilder]);

  useEffect(() => {
    if (!grantRoleId && roles.length > 0) {
      setGrantRoleId(roles[0].id);
    }
  }, [grantRoleId, roles]);

  useEffect(() => {
    const scopeOptions = overrideScopeType === "channel" ? channels : channelGroups;
    if (scopeOptions.length === 0) {
      if (overrideScopeId) setOverrideScopeId("");
      return;
    }
    if (!scopeOptions.some((scope) => scope.id === overrideScopeId)) {
      setOverrideScopeId(scopeOptions[0].id);
    }
  }, [channels, channelGroups, overrideScopeId, overrideScopeType]);

  const handleSaveInfo = async () => {
    const cleanName = serverName.trim();
    if (!cleanName) return;
    setSavingInfo(true);

    const { error: nameError } = await supabase
      .from("servers")
      .update({
        name: cleanName,
        onboarding_welcome_title: onboardingWelcomeTitle.trim() || "Welcome!",
        onboarding_welcome_message: onboardingWelcomeMessage.trim() || null,
        onboarding_rules_text: onboardingRulesText.trim() || null,
      })
      .eq("id", server.id);

    if (nameError) {
      alert(`Failed to save server name: ${nameError.message}`);
      setSavingInfo(false);
      return;
    }

    if (discoverabilitySupported && discoverable !== server.is_discoverable) {
      const { error: discoverError } = await supabase
        .from("servers")
        .update({ is_discoverable: discoverable })
        .eq("id", server.id);

      if (discoverError) {
        const msg = discoverError.message || "";
        if (msg.includes("is_discoverable") || msg.toLowerCase().includes("column")) {
          setDiscoverabilitySupported(false);
          alert("Discover setting is unavailable because the latest database migration is missing. Run your Supabase migrations and try again.");
        } else {
          alert(`Failed to update discover setting: ${discoverError.message}`);
        }
      }
    }

    await refreshServers();
    setSavingInfo(false);
  };

  const handleSaveOnboardingFlow = async () => {
    if (!serverId || !isOwner) return;
    setSavingOnboardingFlow(true);
    const roleName = onboardingFlow.assign_role_on_complete?.trim() || null;
    const { error } = await (supabase as any)
      .from("server_onboarding_flows")
      .upsert({
        server_id: serverId,
        enabled: onboardingFlow.enabled,
        assign_role_on_complete: roleName,
      });
    setSavingOnboardingFlow(false);
    if (error) {
      alert(`Failed to save onboarding flow: ${error.message}`);
      return;
    }
    setOnboardingFlow((prev) => ({ ...prev, assign_role_on_complete: roleName }));
    alert("Onboarding flow saved.");
  };

  const handleCreateOnboardingStep = async () => {
    if (!serverId || !isOwner) return;
    const cleanTitle = newOnboardingStepTitle.trim();
    if (!cleanTitle) return;
    if (newOnboardingStepType === "read_channel" && !newOnboardingStepChannelId) {
      alert("Select a channel for required read steps.");
      return;
    }
    setCreatingOnboardingStep(true);
    const nextPosition = (onboardingSteps[onboardingSteps.length - 1]?.position || 0) + 1;
    const { data, error } = await (supabase as any)
      .from("server_onboarding_steps")
      .insert({
        server_id: serverId,
        position: nextPosition,
        step_type: newOnboardingStepType,
        title: cleanTitle,
        description: newOnboardingStepDescription.trim() || null,
        required_channel_id: newOnboardingStepType === "read_channel" ? newOnboardingStepChannelId : null,
        is_required: newOnboardingStepRequired,
      })
      .select("id, server_id, position, step_type, title, description, required_channel_id, is_required")
      .single();
    setCreatingOnboardingStep(false);
    if (error || !data) {
      alert(`Failed to create onboarding step: ${error?.message || "Unknown error"}`);
      return;
    }
    setOnboardingSteps((prev) => [...prev, data as OnboardingStepItem].sort((a, b) => a.position - b.position));
    setNewOnboardingStepTitle("");
    setNewOnboardingStepDescription("");
    setNewOnboardingStepChannelId("");
    setNewOnboardingStepRequired(true);
    setNewOnboardingStepType("custom_ack");
  };

  const handleToggleOnboardingStepRequired = async (step: OnboardingStepItem, required: boolean) => {
    if (!serverId || !isOwner) return;
    setUpdatingOnboardingStepId(step.id);
    const { error } = await (supabase as any)
      .from("server_onboarding_steps")
      .update({ is_required: required })
      .eq("id", step.id)
      .eq("server_id", serverId);
    setUpdatingOnboardingStepId(null);
    if (error) {
      alert(`Failed to update step: ${error.message}`);
      return;
    }
    setOnboardingSteps((prev) => prev.map((item) => (item.id === step.id ? { ...item, is_required: required } : item)));
  };

  const handleDeleteOnboardingStep = async (stepId: string) => {
    if (!serverId || !isOwner) return;
    setDeletingOnboardingStepId(stepId);
    const { error } = await (supabase as any)
      .from("server_onboarding_steps")
      .delete()
      .eq("id", stepId)
      .eq("server_id", serverId);
    setDeletingOnboardingStepId(null);
    if (error) {
      alert(`Failed to delete step: ${error.message}`);
      return;
    }
    setOnboardingSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const handleMoveOnboardingStep = async (stepId: string, direction: "up" | "down") => {
    if (!serverId || !isOwner) return;
    const currentIndex = onboardingSteps.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) return;
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= onboardingSteps.length) return;

    const reordered = [...onboardingSteps];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const withPositions = reordered.map((step, index) => ({ ...step, position: index + 1 }));
    setOnboardingSteps(withPositions);
    setUpdatingOnboardingStepId(stepId);

    const updates = await Promise.all(
      withPositions.map((step) =>
        (supabase as any)
          .from("server_onboarding_steps")
          .update({ position: step.position })
          .eq("id", step.id)
          .eq("server_id", serverId),
      ),
    );
    setUpdatingOnboardingStepId(null);
    const failed = updates.find((result: any) => !!result.error);
    if (failed?.error) {
      alert(`Failed to reorder steps: ${failed.error.message}`);
      await loadOnboardingBuilder();
    }
  };

  const handleCreateChannel = async () => {
    const cleanName = normalizeChannelName(newChannelName);
    if (!cleanName) return;
    setSavingChannel(true);
    await supabase.from("channels").insert({
      server_id: server.id,
      name: cleanName,
      type: newChannelType,
    });
    setNewChannelName("");
    await refreshChannels();
    setSavingChannel(false);
  };

  const handleDeleteChannel = async (channelId: string) => {
    const deletedChannel = channels.find((c) => c.id === channelId);
    await supabase.from("channels").delete().eq("id", channelId);
    await logModerationAction("delete_channel", {
      metadata: {
        channel_id: channelId,
        channel_name: deletedChannel?.name || null,
      },
    });
    await refreshChannels();
  };

  const handleCreateGroup = async () => {
    const cleanName = newGroupName.trim();
    if (!cleanName) return;
    setSavingGroup(true);
    const maxPosition = channelGroups.reduce((max, g) => Math.max(max, g.position || 0), -1);
    await supabase.from("channel_groups").insert({
      server_id: server.id,
      name: cleanName,
      position: maxPosition + 1,
    });
    setNewGroupName("");
    await refreshChannelGroups();
    setSavingGroup(false);
  };

  const handleStartRenameGroup = (id: string, currentName: string) => {
    setRenamingGroupId(id);
    setRenameGroupValue(currentName);
  };

  const handleRenameGroup = async () => {
    if (!renamingGroupId || !renameGroupValue.trim()) return;
    await supabase
      .from("channel_groups")
      .update({ name: renameGroupValue.trim() })
      .eq("id", renamingGroupId)
      .eq("server_id", server.id);
    setRenamingGroupId(null);
    setRenameGroupValue("");
    await refreshChannelGroups();
  };

  const handleDeleteGroup = async (groupId: string) => {
    await supabase.from("channel_groups").delete().eq("id", groupId).eq("server_id", server.id);
    await refreshChannelGroups();
    await refreshChannels();
  };

  const handleAssignChannelGroup = async (channelId: string, groupId: string) => {
    await supabase
      .from("channels")
      .update({ group_id: groupId || null })
      .eq("id", channelId)
      .eq("server_id", server.id);
    await refreshChannels();
  };

  const handleMemberRolesChange = async (memberId: string, roleNames: string[]) => {
    if (!serverId || !user?.id) return;
    const sortedRoleNames = sortRoleNamesByPriority(roleNames);
    if (sortedRoleNames.length === 0) {
      alert("A member must have at least one role.");
      return;
    }
    const primaryRole = roleByName.get(normalizeRoleName(sortedRoleNames[0]));
    if (!primaryRole) {
      alert("Unable to resolve selected roles.");
      return;
    }
    const extraRoleIds = sortedRoleNames
      .slice(1)
      .map((roleName) => roleByName.get(normalizeRoleName(roleName))?.id)
      .filter((roleId): roleId is string => !!roleId);
    const existingPersistentGrants = temporaryRoleGrants.filter((grant) => grant.user_id === memberId && !grant.expires_at);
    const existingRoleIdSet = new Set(existingPersistentGrants.map((grant) => grant.role_id));
    const desiredRoleIdSet = new Set(extraRoleIds);
    const grantsToDelete = existingPersistentGrants.filter((grant) => !desiredRoleIdSet.has(grant.role_id));
    const grantsToInsert = extraRoleIds.filter((roleId) => !existingRoleIdSet.has(roleId));

    setUpdatingRoleUserId(memberId);
    const previousMember = members.find((m) => m.id === memberId) || null;
    const previousRoles = previousMember ? getMemberAssignedRoleNames(previousMember) : [];

    const { error: membershipError } = await supabase
      .from("server_members")
      .update({ role: primaryRole.name })
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (membershipError) {
      alert(`Failed to update roles: ${membershipError.message}`);
      setUpdatingRoleUserId(null);
      return;
    }

    if (grantsToDelete.length > 0) {
      const { error: deleteGrantError } = await (supabase as any)
        .from("server_temporary_role_grants")
        .delete()
        .in("id", grantsToDelete.map((grant) => grant.id));
      if (deleteGrantError) {
        alert(`Failed to update roles: ${deleteGrantError.message}`);
        setUpdatingRoleUserId(null);
        await loadTemporaryRoleGrants();
        return;
      }
    }

    let insertedGrants: TemporaryRoleGrantItem[] = [];
    if (grantsToInsert.length > 0) {
      const { data: insertedRows, error: insertGrantError } = await (supabase as any)
        .from("server_temporary_role_grants")
        .insert(
          grantsToInsert.map((roleId) => ({
            server_id: server.id,
            user_id: memberId,
            role_id: roleId,
            granted_by: user.id,
            expires_at: null,
          })),
        )
        .select("id, user_id, role_id, granted_by, created_at, expires_at");
      if (insertGrantError) {
        alert(`Failed to update roles: ${insertGrantError.message}`);
        setUpdatingRoleUserId(null);
        await loadTemporaryRoleGrants();
        return;
      }
      insertedGrants = (insertedRows || []) as TemporaryRoleGrantItem[];
    }

    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: primaryRole.name } : m)));
    setTemporaryRoleGrants((prev) => {
      const deletedIds = new Set(grantsToDelete.map((grant) => grant.id));
      const next = prev.filter((grant) => !deletedIds.has(grant.id));
      return [...next, ...insertedGrants];
    });

    await logModerationAction("edit_member_role", {
      targetUserId: memberId,
      metadata: {
        previous_roles: previousRoles,
        next_roles: sortedRoleNames,
      },
    });
    setUpdatingRoleUserId(null);
  };

  const handleCreateRole = async () => {
    const cleanName = newRoleName.trim();
    if (!cleanName || creatingRole) return;
    setCreatingRole(true);
    const nextPosition = (roles[0]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("server_roles")
      .insert({
        server_id: server.id,
        name: cleanName,
        color: newRoleColor,
        position: nextPosition,
        permissions: [],
        icon: newRoleIcon.trim() || null,
        username_color: newRoleUsernameColor || null,
        username_style: newRoleUsernameStyle,
        username_effect: newRoleUsernameEffect,
      })
      .select("id, name, color, position, permissions, icon, username_color, username_style, username_effect")
      .single();
    setCreatingRole(false);
    if (error) {
      alert(`Failed to create role: ${error.message}`);
      return;
    }
    if (data) {
      const createdRole: ServerRole = {
        id: data.id,
        name: data.name,
        color: data.color,
        position: data.position,
        permissions: Array.isArray(data.permissions) ? data.permissions.filter((p): p is string => typeof p === "string") : [],
        icon: data.icon || null,
        username_color: data.username_color || null,
        username_style: data.username_style === "bold" || data.username_style === "italic" || data.username_style === "underline"
          ? data.username_style
          : "normal",
        username_effect: data.username_effect === "glow" || data.username_effect === "shadow"
          ? data.username_effect
          : "none",
      };
      setRoles((prev) => [createdRole, ...prev]);
      setSelectedRoleId(createdRole.id);
    }
    setNewRoleName("");
    setNewRoleIcon("");
    setNewRoleUsernameColor("");
    setNewRoleUsernameStyle("normal");
    setNewRoleUsernameEffect("none");
  };

  const handleDeleteRole = async (roleToDelete: ServerRole) => {
    if (deletingRoleId) return;
    const fallbackRole = roles.find((r) => r.id !== roleToDelete.id) || null;
    if (!fallbackRole) {
      alert("Create another role before deleting this one.");
      return;
    }

    setDeletingRoleId(roleToDelete.id);
    const { error: reassignError } = await supabase
      .from("server_members")
      .update({ role: fallbackRole.name })
      .eq("server_id", server.id)
      .eq("role", roleToDelete.name);
    if (reassignError) {
      alert(`Failed to reassign members: ${reassignError.message}`);
      setDeletingRoleId(null);
      return;
    }

    const { error: deleteError } = await supabase.from("server_roles").delete().eq("id", roleToDelete.id);
    setDeletingRoleId(null);
    if (deleteError) {
      alert(`Failed to delete role: ${deleteError.message}`);
      return;
    }

    setRoles((prev) => prev.filter((r) => r.id !== roleToDelete.id));
    setMembers((prev) => prev.map((m) => (m.role === roleToDelete.name ? { ...m, role: fallbackRole.name } : m)));
    setTemporaryRoleGrants((prev) => prev.filter((grant) => grant.role_id !== roleToDelete.id));
    if (selectedRoleId === roleToDelete.id) setSelectedRoleId(fallbackRole.id);
  };

  const handleToggleRolePermission = async (roleId: string, permissionKey: string) => {
    const currentRole = roles.find((r) => r.id === roleId);
    if (!currentRole) return;

    const nextPermissions = currentRole.permissions.includes(permissionKey)
      ? currentRole.permissions.filter((perm) => perm !== permissionKey)
      : [...currentRole.permissions, permissionKey];

    setUpdatingRolePermissionsId(roleId);
    const { error } = await supabase
      .from("server_roles")
      .update({ permissions: nextPermissions })
      .eq("id", roleId)
      .eq("server_id", server.id);
    setUpdatingRolePermissionsId(null);

    if (error) {
      alert(`Failed to update role permissions: ${error.message}`);
      return;
    }

    setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, permissions: nextPermissions } : role)));
  };

  const handleSaveRoleAppearance = async () => {
    const targetRoleId = roleEditorTarget?.type === "role" ? roleEditorTarget.id : selectedRole?.id;
    if (!targetRoleId || !serverId || savingRoleAppearanceId) return;
    setSavingRoleAppearanceId(targetRoleId);
    const nextIcon = roleAppearanceDraft.icon.trim() || null;
    const nextUsernameColor = roleAppearanceDraft.usernameColor || null;
    const { error } = await supabase
      .from("server_roles")
      .update({
        icon: nextIcon,
        username_color: nextUsernameColor,
        username_style: roleAppearanceDraft.usernameStyle,
        username_effect: roleAppearanceDraft.usernameEffect,
      })
      .eq("id", targetRoleId)
      .eq("server_id", serverId);
    setSavingRoleAppearanceId(null);
    if (error) {
      alert(`Failed to update role appearance: ${error.message}`);
      return;
    }
    setRoles((prev) =>
      prev.map((role) =>
        role.id === targetRoleId
          ? {
              ...role,
              icon: nextIcon,
              username_color: nextUsernameColor,
              username_style: roleAppearanceDraft.usernameStyle,
              username_effect: roleAppearanceDraft.usernameEffect,
            }
          : role,
      ),
    );
  };

  const handleMoveRole = async (roleId: string, direction: "up" | "down") => {
    if (reorderingRoleId) return;
    const currentIndex = roles.findIndex((role) => role.id === roleId);
    if (currentIndex === -1) return;
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= roles.length) return;

    const reordered = [...roles];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    const positioned = reordered.map((role, idx) => ({
      ...role,
      position: reordered.length - idx,
    }));

    setRoles(positioned);
    setReorderingRoleId(roleId);

    const updates = await Promise.all(
      positioned.map((role) =>
        supabase
          .from("server_roles")
          .update({ position: role.position })
          .eq("id", role.id)
          .eq("server_id", server.id),
      ),
    );

    setReorderingRoleId(null);

    const failed = updates.find((result) => !!result.error);
    if (failed?.error) {
      alert(`Failed to reorder roles: ${failed.error.message}`);
      await loadRoles();
    }
  };

  const handleApplyRoleOverride = async () => {
    if (!serverId || !user || !selectedRole || !overrideScopeId || savingRoleOverride) return;
    setSavingRoleOverride(true);
    const existingOverride = rolePermissionOverrides.find(
      (override) =>
        override.role_id === selectedRole.id &&
        override.scope_type === overrideScopeType &&
        override.scope_id === overrideScopeId,
    );

    const allowPermissions = new Set(existingOverride?.allow_permissions || []);
    const denyPermissions = new Set(existingOverride?.deny_permissions || []);

    if (overrideMode === "allow") {
      denyPermissions.delete(overridePermissionKey);
      allowPermissions.add(overridePermissionKey);
    } else if (overrideMode === "deny") {
      allowPermissions.delete(overridePermissionKey);
      denyPermissions.add(overridePermissionKey);
    } else {
      allowPermissions.delete(overridePermissionKey);
      denyPermissions.delete(overridePermissionKey);
    }

    if (allowPermissions.size === 0 && denyPermissions.size === 0) {
      if (existingOverride) {
        const { error } = await (supabase as any)
          .from("role_permission_overrides")
          .delete()
          .eq("id", existingOverride.id)
          .eq("server_id", serverId);
        setSavingRoleOverride(false);
        if (error) {
          alert(`Failed to clear override: ${error.message}`);
          return;
        }
      } else {
        setSavingRoleOverride(false);
      }
      await loadRolePermissionOverrides();
      return;
    }

    const payload = {
      server_id: serverId,
      role_id: selectedRole.id,
      scope_type: overrideScopeType,
      scope_id: overrideScopeId,
      allow_permissions: Array.from(allowPermissions),
      deny_permissions: Array.from(denyPermissions),
      created_by: user.id,
    };

    const { error } = await (supabase as any)
      .from("role_permission_overrides")
      .upsert(payload, { onConflict: "role_id,scope_type,scope_id" });
    setSavingRoleOverride(false);
    if (error) {
      alert(`Failed to save override: ${error.message}`);
      return;
    }
    await loadRolePermissionOverrides();
  };

  const handleDeleteRoleOverride = async (overrideId: string) => {
    if (!serverId || deletingRoleOverrideId) return;
    setDeletingRoleOverrideId(overrideId);
    const { error } = await (supabase as any)
      .from("role_permission_overrides")
      .delete()
      .eq("id", overrideId)
      .eq("server_id", serverId);
    setDeletingRoleOverrideId(null);
    if (error) {
      alert(`Failed to delete override: ${error.message}`);
      return;
    }
    await loadRolePermissionOverrides();
  };

  const handleGrantTemporaryRole = async () => {
    if (!serverId || !user || !grantMemberId || !grantRoleId || savingTemporaryRoleGrant) return;
    const expiresAtIso = grantExpiresAt
      ? new Date(`${grantExpiresAt}:00`).toISOString()
      : null;
    if (!expiresAtIso) {
      alert("Expiry is required for temporary grants.");
      return;
    }
    setSavingTemporaryRoleGrant(true);
    const { error } = await (supabase as any)
      .from("server_temporary_role_grants")
      .upsert(
        {
          server_id: serverId,
          user_id: grantMemberId,
          role_id: grantRoleId,
          granted_by: user.id,
          expires_at: expiresAtIso,
        },
        { onConflict: "server_id,user_id,role_id" },
      );
    setSavingTemporaryRoleGrant(false);
    if (error) {
      alert(`Failed to create temporary grant: ${error.message}`);
      return;
    }
    setGrantMemberId("");
    setGrantRoleId("");
    setGrantExpiresAt("");
    await loadTemporaryRoleGrants();
  };

  const handleRevokeTemporaryRole = async (grantId: string) => {
    if (!serverId || deletingTemporaryRoleGrantId) return;
    setDeletingTemporaryRoleGrantId(grantId);
    const { error } = await (supabase as any)
      .from("server_temporary_role_grants")
      .delete()
      .eq("id", grantId)
      .eq("server_id", serverId);
    setDeletingTemporaryRoleGrantId(null);
    if (error) {
      alert(`Failed to revoke temporary grant: ${error.message}`);
      return;
    }
    await loadTemporaryRoleGrants();
  };

  const handleSaveRoleTemplate = async () => {
    if (!serverId || !user || savingRoleTemplate) return;
    const fallbackName = `Template ${new Date().toLocaleString()}`;
    const cleanName = (templateName.trim() || fallbackName).slice(0, 80);
    const definition = {
      roles: [...roles]
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          name: role.name,
          color: role.color,
          position: role.position,
          permissions: [...role.permissions],
          icon: role.icon || null,
          username_color: role.username_color || null,
          username_style: role.username_style,
          username_effect: role.username_effect,
        })),
    };

    setSavingRoleTemplate(true);
    const existingTemplate = roleTemplates.find((template) => template.name.toLowerCase() === cleanName.toLowerCase()) || null;
    if (existingTemplate) {
      const { error } = await (supabase as any)
        .from("server_role_templates")
        .update({
          definition,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingTemplate.id)
        .eq("server_id", serverId);
      setSavingRoleTemplate(false);
      if (error) {
        alert(`Failed to update template: ${error.message}`);
        return;
      }
    } else {
      const { error } = await (supabase as any)
        .from("server_role_templates")
        .insert({
          server_id: serverId,
          name: cleanName,
          definition,
          created_by: user.id,
        });
      setSavingRoleTemplate(false);
      if (error) {
        alert(`Failed to save template: ${error.message}`);
        return;
      }
    }

    setTemplateName("");
    await loadRoleTemplates();
  };

  const handleDeleteRoleTemplate = async (templateId: string) => {
    if (!serverId || deletingRoleTemplateId) return;
    setDeletingRoleTemplateId(templateId);
    const { error } = await (supabase as any)
      .from("server_role_templates")
      .delete()
      .eq("id", templateId)
      .eq("server_id", serverId);
    setDeletingRoleTemplateId(null);
    if (error) {
      alert(`Failed to delete template: ${error.message}`);
      return;
    }
    await loadRoleTemplates();
  };

  const handleApplyRoleTemplate = async (template: RoleTemplateItem) => {
    if (!serverId || applyingRoleTemplateId) return;
    const templateRoles = template.definition.roles || [];
    if (templateRoles.length === 0) {
      alert("Template has no roles to apply.");
      return;
    }

    setApplyingRoleTemplateId(template.id);
    const existingByName = new Map(roles.map((role) => [role.name.toLowerCase(), role]));
    let failedMessage: string | null = null;

    for (const role of templateRoles) {
      const existing = existingByName.get(role.name.toLowerCase());
      if (existing) {
        const { error } = await supabase
          .from("server_roles")
          .update({
            color: role.color,
            position: role.position,
            permissions: role.permissions,
            icon: role.icon || null,
            username_color: role.username_color || null,
            username_style: role.username_style || "normal",
            username_effect: role.username_effect || "none",
          })
          .eq("id", existing.id)
          .eq("server_id", serverId);
        if (error) {
          failedMessage = `Failed to update role "${role.name}": ${error.message}`;
          break;
        }
      } else {
        const { error } = await supabase
          .from("server_roles")
          .insert({
            server_id: serverId,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions,
            icon: role.icon || null,
            username_color: role.username_color || null,
            username_style: role.username_style || "normal",
            username_effect: role.username_effect || "none",
          });
        if (error) {
          failedMessage = `Failed to create role "${role.name}": ${error.message}`;
          break;
        }
      }
    }

    setApplyingRoleTemplateId(null);
    if (failedMessage) {
      alert(failedMessage);
      return;
    }

    await loadRoles();
  };

  const handleExportRoleTemplate = async (template: RoleTemplateItem) => {
    const payload = JSON.stringify(
      {
        name: template.name,
        roles: template.definition.roles,
      },
      null,
      2,
    );
    setExportedTemplateJson(payload);
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload);
      } catch {
        // Ignore clipboard errors and keep payload in the export textarea.
      }
    }
  };

  const handleImportRoleTemplate = async () => {
    if (!serverId || !user || savingRoleTemplate) return;
    const raw = templateImportJson.trim();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      alert("Invalid JSON.");
      return;
    }

    const parsedObject = parsed as {
      name?: unknown;
      roles?: unknown;
    };
    const parsedRoles = Array.isArray(parsedObject.roles)
      ? parsedObject.roles
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const row = entry as Record<string, unknown>;
            const roleName = typeof row.name === "string" ? row.name.trim() : "";
            if (!roleName) return null;
            return {
              name: roleName,
              color: typeof row.color === "string" ? row.color : "#9CA3AF",
              position: typeof row.position === "number" ? row.position : 0,
              permissions: Array.isArray(row.permissions)
                ? row.permissions.filter((permission): permission is string => typeof permission === "string")
                : [],
              icon: typeof row.icon === "string" ? row.icon : null,
              username_color: typeof row.username_color === "string" ? row.username_color : null,
              username_style: row.username_style === "bold" || row.username_style === "italic" || row.username_style === "underline"
                ? row.username_style
                : "normal",
              username_effect: row.username_effect === "glow" || row.username_effect === "shadow"
                ? row.username_effect
                : "none",
            };
          })
          .filter((entry): entry is {
            name: string;
            color: string;
            position: number;
            permissions: string[];
            icon: string | null;
            username_color: string | null;
            username_style: RoleTextStyle;
            username_effect: RoleTextEffect;
          } => !!entry)
      : [];

    if (parsedRoles.length === 0) {
      alert("Template JSON must include a non-empty roles array.");
      return;
    }

    const importedTemplateName = typeof parsedObject.name === "string" && parsedObject.name.trim()
      ? parsedObject.name.trim().slice(0, 80)
      : `Imported ${new Date().toLocaleString()}`;

    setSavingRoleTemplate(true);
    const { error } = await (supabase as any)
      .from("server_role_templates")
      .insert({
        server_id: serverId,
        name: importedTemplateName,
        definition: { roles: parsedRoles },
        created_by: user.id,
      });
    setSavingRoleTemplate(false);
    if (error) {
      alert(`Failed to import template: ${error.message}`);
      return;
    }

    setTemplateImportJson("");
    await loadRoleTemplates();
  };

  const handleSaveOwnerGroupName = async () => {
    if (!server || savingOwnerGroup) return;
    const cleanName = ownerGroupName.trim();
    if (!cleanName) return;
    setSavingOwnerGroup(true);
    const ownerUsernameColor = ownerRoleUsernameColor || null;
    const { error } = await supabase
      .from("servers")
      .update({
        owner_group_name: cleanName,
        owner_role_icon: ownerRoleIcon.trim() || null,
        owner_role_color: ownerRoleColor,
        owner_role_username_color: ownerUsernameColor,
        owner_role_username_style: ownerRoleUsernameStyle,
        owner_role_username_effect: ownerRoleUsernameEffect,
      })
      .eq("id", server.id);
    setSavingOwnerGroup(false);
    if (error) {
      alert(`Failed to update owner group name: ${error.message}`);
      return;
    }
    await refreshServers();
  };

  const openOwnerRoleEditor = () => {
    setRoleEditorTarget({ type: "owner" });
    setRoleEditorOpen(true);
  };

  const openServerRoleEditor = (role: ServerRole) => {
    setSelectedRoleId(role.id);
    setRoleEditorTarget({ type: "role", id: role.id });
    setRoleEditorOpen(true);
  };

  const loadBans = useCallback(async () => {
    if (!serverId || !hasModerationPermission) return;
    setLoadingBans(true);
    await supabase.rpc("expire_moderation_punishments", { _server_id: serverId });
    const nowIso = new Date().toISOString();
    const { data: banRows, error: bansError } = await supabase
      .from("server_bans")
      .select("id, banned_user_id, banned_by, reason, expires_at, created_at")
      .eq("server_id", serverId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false });

    if (bansError) {
      setLoadingBans(false);
      alert(`Failed to load bans: ${bansError.message}`);
      return;
    }

    const profileIds = Array.from(
      new Set(
        (banRows || [])
          .flatMap((row) => [row.banned_user_id, row.banned_by])
          .filter((id): id is string => !!id),
      ),
    );

    const { data: profiles } = profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> };

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const mapped: BanListItem[] = (banRows || []).map((row) => ({
      id: row.id,
      banned_user_id: row.banned_user_id,
      banned_by: row.banned_by,
      reason: row.reason,
      expires_at: row.expires_at,
      created_at: row.created_at,
      banned_user: profileMap.get(row.banned_user_id) || null,
      banned_by_user: row.banned_by ? (profileMap.get(row.banned_by) || null) : null,
    }));

    setBans(mapped);
    setLoadingBans(false);
  }, [serverId, hasModerationPermission]);

  const loadAuditLogs = useCallback(async () => {
    if (!serverId || !hasModerationPermission) return;
    setLoadingAuditLogs(true);
    const { data: logs, error: logsError } = await supabase
      .from("moderation_audit_logs")
      .select("id, action, actor_id, target_user_id, metadata, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (logsError) {
      setLoadingAuditLogs(false);
      alert(`Failed to load audit log: ${logsError.message}`);
      return;
    }

    const profileIds = Array.from(
      new Set(
        (logs || [])
          .flatMap((row) => [row.actor_id, row.target_user_id])
          .filter((id): id is string => !!id),
      ),
    );

    const { data: profiles } = profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> };

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const mappedLogs: AuditLogItem[] = (logs || []).map((row) => ({
      id: row.id,
      action: row.action as AuditLogItem["action"],
      actor_id: row.actor_id,
      target_user_id: row.target_user_id,
      metadata: (row.metadata as Record<string, unknown>) || {},
      created_at: row.created_at,
      actor: profileMap.get(row.actor_id) || null,
      target: row.target_user_id ? (profileMap.get(row.target_user_id) || null) : null,
    }));

    setAuditLogs(mappedLogs);
    setLoadingAuditLogs(false);
  }, [serverId, hasModerationPermission]);

  const loadAutomodSettings = useCallback(async () => {
    if (!serverId || !hasModerationPermission) return;
    setLoadingAutomod(true);
    const { data, error } = await supabase
      .from("server_automod_rules")
      .select("regex_patterns, block_all_links, blocked_domains, toxicity_enabled, toxicity_threshold, toxicity_terms")
      .eq("server_id", serverId)
      .maybeSingle();
    if (error) {
      setLoadingAutomod(false);
      alert(`Failed to load AutoMod settings: ${error.message}`);
      return;
    }
    const next: AutoModSettings = {
      regex_patterns: data?.regex_patterns || [],
      block_all_links: !!data?.block_all_links,
      blocked_domains: data?.blocked_domains || [],
      toxicity_enabled: data?.toxicity_enabled ?? true,
      toxicity_threshold: data?.toxicity_threshold ?? 2,
      toxicity_terms: data?.toxicity_terms || [],
    };
    setAutomodSettings(next);
    setAutomodRegexInput(next.regex_patterns.join("\n"));
    setAutomodDomainsInput(next.blocked_domains.join("\n"));
    setAutomodToxicityInput(next.toxicity_terms.join("\n"));
    setLoadingAutomod(false);
  }, [serverId, hasModerationPermission]);

  const saveAutomodSettings = async () => {
    if (!serverId || !user?.id || !hasModerationPermission) return;
    setSavingAutomod(true);
    const payload: AutoModSettings = {
      regex_patterns: automodRegexInput.split("\n").map((v) => v.trim()).filter(Boolean),
      block_all_links: automodSettings.block_all_links,
      blocked_domains: automodDomainsInput.split("\n").map((v) => v.trim().toLowerCase()).filter(Boolean),
      toxicity_enabled: automodSettings.toxicity_enabled,
      toxicity_threshold: Math.max(1, Math.min(20, automodSettings.toxicity_threshold)),
      toxicity_terms: automodToxicityInput.split("\n").map((v) => v.trim().toLowerCase()).filter(Boolean),
    };
    const { error } = await supabase
      .from("server_automod_rules")
      .upsert({
        server_id: serverId,
        regex_patterns: payload.regex_patterns,
        block_all_links: payload.block_all_links,
        blocked_domains: payload.blocked_domains,
        toxicity_enabled: payload.toxicity_enabled,
        toxicity_threshold: payload.toxicity_threshold,
        toxicity_terms: payload.toxicity_terms,
        updated_by: user.id,
      });
    setSavingAutomod(false);
    if (error) {
      alert(`Failed to save AutoMod settings: ${error.message}`);
      return;
    }
    setAutomodSettings(payload);
    alert("AutoMod settings saved.");
  };

  const addRegexTemplate = (pattern: string) => {
    setAutomodRegexInput((prev) => {
      const normalized = prev.trim();
      if (!normalized) return pattern;
      const lines = normalized.split("\n").map((line) => line.trim());
      if (lines.includes(pattern)) return normalized;
      return `${normalized}\n${pattern}`;
    });
  };

  const applyToxicityPreset = (preset: (typeof TOXICITY_PRESETS)[number]) => {
    setAutomodSettings((prev) => ({
      ...prev,
      toxicity_enabled: true,
      toxicity_threshold: preset.threshold,
    }));
    setAutomodToxicityInput(preset.terms.join("\n"));
  };

  const loadEscalations = useCallback(async () => {
    if (!serverId || !hasModerationPermission) return;
    setLoadingEscalations(true);
    const { data, error } = await supabase
      .from("moderation_escalation_queue")
      .select("id, source_type, source_ref_id, status, priority, assigned_to, created_by, target_user_id, reason, context, created_at, updated_at, resolved_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) {
      setLoadingEscalations(false);
      alert(`Failed to load escalation queue: ${error.message}`);
      return;
    }
    setEscalations((data || []) as EscalationItem[]);
    setLoadingEscalations(false);
  }, [serverId, hasModerationPermission]);

  const loadAppeals = useCallback(async () => {
    if (!serverId || !hasModerationPermission) return;
    setLoadingAppeals(true);
    const { data, error } = await supabase
      .from("moderation_appeals")
      .select("id, user_id, punishment_type, punishment_ref_id, reason, status, assigned_to, decision_note, decided_by, decided_at, created_at, updated_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) {
      setLoadingAppeals(false);
      alert(`Failed to load appeals: ${error.message}`);
      return;
    }
    setAppeals((data || []) as AppealItem[]);
    setLoadingAppeals(false);
  }, [serverId, hasModerationPermission]);

  const handleEscalationUpdate = async (item: EscalationItem, patch: Partial<Pick<EscalationItem, "assigned_to" | "status">>) => {
    if (!serverId || !user?.id || !hasModerationPermission) return;
    setUpdatingEscalationId(item.id);
    const status = patch.status || item.status;
    const assignedTo = patch.assigned_to === undefined ? item.assigned_to : patch.assigned_to;
    const nextResolvedAt = status === "resolved" || status === "dismissed" ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("moderation_escalation_queue")
      .update({
        status,
        assigned_to: assignedTo,
        resolved_at: nextResolvedAt,
      })
      .eq("id", item.id)
      .eq("server_id", serverId);
    setUpdatingEscalationId(null);
    if (error) {
      alert(`Failed to update escalation: ${error.message}`);
      return;
    }
    if (patch.assigned_to !== undefined && patch.assigned_to !== item.assigned_to) {
      await logModerationAction("assign_escalation", {
        targetUserId: item.target_user_id,
        metadata: { escalation_id: item.id, assigned_to: patch.assigned_to || null, previous_assigned_to: item.assigned_to || null },
      });
    }
    if (patch.status && patch.status !== item.status) {
      await logModerationAction("update_escalation_status", {
        targetUserId: item.target_user_id,
        metadata: { escalation_id: item.id, status, previous_status: item.status },
      });
    }
    setEscalations((prev) => prev.map((entry) => (
      entry.id === item.id
        ? { ...entry, status, assigned_to: assignedTo, resolved_at: nextResolvedAt }
        : entry
    )));
  };

  const handleAppealDecision = async (appeal: AppealItem, status: "under_review" | "approved" | "rejected", note?: string) => {
    if (!serverId || !user?.id || !hasModerationPermission) return;
    setUpdatingAppealId(appeal.id);
    const payload = {
      status,
      assigned_to: appeal.assigned_to || user.id,
      decision_note: note === undefined ? appeal.decision_note : (note || null),
      decided_by: status === "approved" || status === "rejected" ? user.id : null,
      decided_at: status === "approved" || status === "rejected" ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("moderation_appeals")
      .update(payload)
      .eq("id", appeal.id)
      .eq("server_id", serverId);
    setUpdatingAppealId(null);
    if (error) {
      alert(`Failed to update appeal: ${error.message}`);
      return;
    }
    if (status === "approved" || status === "rejected") {
      await logModerationAction(status === "approved" ? "approve_appeal" : "reject_appeal", {
        targetUserId: appeal.user_id,
        metadata: { appeal_id: appeal.id, status, decision_note: payload.decision_note },
      });
    }
    setAppeals((prev) => prev.map((entry) => (entry.id === appeal.id ? { ...entry, ...payload } : entry)));
  };

  const openAppealDecisionModal = (appeal: AppealItem, status: "approved" | "rejected") => {
    setAppealDecisionAppeal(appeal);
    setAppealDecisionStatus(status);
    setAppealDecisionNote(appeal.decision_note || "");
    setAppealDecisionUnban(false);
    setAppealDecisionModalOpen(true);
  };

  const submitAppealDecision = async () => {
    if (!appealDecisionAppeal || !appealDecisionStatus || !serverId) return;
    if (appealDecisionStatus === "approved" && appealDecisionUnban) {
      if (!hasBanPermission) {
        alert("You do not have permission to unban users.");
        return;
      }
      const { data: removedBans, error: unbanError } = await supabase
        .from("server_bans")
        .delete()
        .eq("server_id", serverId)
        .eq("banned_user_id", appealDecisionAppeal.user_id)
        .select("id");
      if (unbanError) {
        alert(`Failed to unban user: ${unbanError.message}`);
        return;
      }
      if ((removedBans || []).length > 0) {
        await logModerationAction("unban_user", {
          targetUserId: appealDecisionAppeal.user_id,
          metadata: {
            source: "appeal_approval",
            appeal_id: appealDecisionAppeal.id,
            ban_id: removedBans?.[0]?.id || null,
          },
        });
      }
      setBans((prev) => prev.filter((ban) => ban.banned_user_id !== appealDecisionAppeal.user_id));
    }
    await handleAppealDecision(appealDecisionAppeal, appealDecisionStatus, appealDecisionNote);
    setAppealDecisionModalOpen(false);
    setAppealDecisionAppeal(null);
    setAppealDecisionStatus(null);
    setAppealDecisionNote("");
    setAppealDecisionUnban(false);
  };

  useEffect(() => {
    if (tab !== "moderation") return;
    void loadBans();
    void loadAuditLogs();
    void loadAutomodSettings();
    void loadEscalations();
    void loadAppeals();
  }, [tab, loadBans, loadAuditLogs, loadAutomodSettings, loadEscalations, loadAppeals]);

  const handleUnban = async (banId: string) => {
    if (!serverId || !hasBanPermission) return;
    const ban = bans.find((b) => b.id === banId);
    setUnbanningBanId(banId);
    const { error } = await supabase
      .from("server_bans")
      .delete()
      .eq("id", banId)
      .eq("server_id", serverId);
    setUnbanningBanId(null);
    if (error) {
      alert(`Failed to unban user: ${error.message}`);
      return;
    }
    await logModerationAction("unban_user", {
      targetUserId: ban?.banned_user_id || null,
      metadata: {
        ban_id: banId,
      },
    });
    setBans((prev) => prev.filter((b) => b.id !== banId));
  };

  const handleStartEditBan = (ban: BanListItem) => {
    setEditingBanId(ban.id);
    setEditingBanExpiry(toDatetimeLocalValue(ban.expires_at));
  };

  const handleSaveBanLength = async (banId: string) => {
    if (!serverId || !hasBanPermission) return;
    const existingBan = bans.find((b) => b.id === banId);
    setUpdatingBanId(banId);
    const expiresAtIso = editingBanExpiry
      ? new Date(editingBanExpiry).toISOString()
      : null;
    const { error } = await supabase
      .from("server_bans")
      .update({ expires_at: expiresAtIso })
      .eq("id", banId)
      .eq("server_id", serverId);
    setUpdatingBanId(null);
    if (error) {
      alert(`Failed to update ban length: ${error.message}`);
      return;
    }
    await logModerationAction("edit_ban_length", {
      targetUserId: existingBan?.banned_user_id || null,
      metadata: {
        ban_id: banId,
        previous_expires_at: existingBan?.expires_at || null,
        next_expires_at: expiresAtIso,
      },
    });
    setBans((prev) => prev.map((b) => (b.id === banId ? { ...b, expires_at: expiresAtIso } : b)));
    setEditingBanId(null);
    setEditingBanExpiry("");
  };

  const handleDeleteServerRequest = () => {
    if (!isOwner || deletingServer) return;
    setShowDeleteServerConfirm(true);
  };

  const handleDeleteServerConfirm = async () => {
    if (!isOwner || deletingServer) return;
    setDeletingServer(true);
    const { error } = await supabase.from("servers").delete().eq("id", server.id);
    setDeletingServer(false);

    if (error) {
      alert(`Failed to delete server: ${error.message}`);
      return;
    }

    await refreshServers();
    setShowDeleteServerConfirm(false);
    navigate("/");
  };

  const uploadServerAsset = async (file: File, type: "icon" | "banner") => {
    const extension = file.name.split(".").pop() || "png";
    const path = `${server.id}/${type}-${Date.now()}.${extension}`;
    let bucket = "server-assets";
    let { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);

    // Fallback for environments where server-assets RLS migration hasn't been applied yet.
    if (uploadError?.message?.toLowerCase().includes("row-level security")) {
      bucket = "chat-attachments";
      ({ error: uploadError } = await supabase.storage.from(bucket).upload(path, file));
    }

    if (uploadError) {
      alert(`Failed to upload ${type}: ${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const field = type === "icon" ? "icon_url" : "banner_url";
    const { error: updateError } = await supabase.from("servers").update({ [field]: data.publicUrl }).eq("id", server.id);
    if (updateError) {
      alert(`Failed to save ${type}: ${updateError.message}`);
      return;
    }

    await refreshServers();
  };

  const handleIconUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    await uploadServerAsset(file, "icon");
    setUploadingIcon(false);
    e.target.value = "";
  };

  const handleBannerUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    await uploadServerAsset(file, "banner");
    setUploadingBanner(false);
    e.target.value = "";
  };

  const clearAsset = async (field: "icon_url" | "banner_url") => {
    const { error } = await supabase.from("servers").update({ [field]: null }).eq("id", server.id);
    if (error) {
      alert(`Failed to remove ${field === "icon_url" ? "icon" : "banner"}: ${error.message}`);
      return;
    }
    await refreshServers();
  };

  const tabs = [
    ...(isOwner ? [{ id: "info" as const, label: "Server Info", icon: Settings }] : []),
    { id: "channels" as const, label: "Channels", icon: Hash },
    ...(hasModerationPermission ? [{ id: "moderation" as const, label: "Moderation", icon: Shield }] : []),
    ...(isOwner ? [{ id: "roles" as const, label: "Roles", icon: Users }] : []),
  ];

  const roleOptions = roles.map((role) => role.name);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;
  const ownerRoleStyleNormalized =
    server?.owner_role_username_style === "normal" ||
    server?.owner_role_username_style === "italic" ||
    server?.owner_role_username_style === "underline"
      ? server.owner_role_username_style
      : "bold";
  const ownerRoleEffectNormalized =
    server?.owner_role_username_effect === "none" ||
    server?.owner_role_username_effect === "shadow"
      ? server.owner_role_username_effect
      : "glow";
  const ownerConfigDirty = !!server && (
    ownerGroupName.trim() !== (server.owner_group_name || "Owner") ||
    (ownerRoleIcon.trim() || "") !== (server.owner_role_icon || "") ||
    ownerRoleColor !== (server.owner_role_color || "#f59e0b") ||
    (ownerRoleUsernameColor || "") !== (server.owner_role_username_color || "") ||
    ownerRoleUsernameStyle !== ownerRoleStyleNormalized ||
    ownerRoleUsernameEffect !== ownerRoleEffectNormalized
  );
  useEffect(() => {
    if (!selectedRole) {
      setRoleAppearanceDraft({
        icon: "",
        usernameColor: "",
        usernameStyle: "normal",
        usernameEffect: "none",
      });
      return;
    }
    setRoleAppearanceDraft({
      icon: selectedRole.icon || "",
      usernameColor: selectedRole.username_color || "",
      usernameStyle: selectedRole.username_style || "normal",
      usernameEffect: selectedRole.username_effect || "none",
    });
  }, [selectedRole]);
  const selectedRoleOverrides = selectedRole
    ? rolePermissionOverrides.filter((override) => override.role_id === selectedRole.id)
    : [];
  const roleEditorRole = roleEditorTarget?.type === "role"
    ? roles.find((role) => role.id === roleEditorTarget.id) || null
    : null;
  const overrideScopeOptions = overrideScopeType === "channel" ? channels : channelGroups;
  const serverOwnerId = server?.owner_id || null;
  const filteredMembers = members.filter((member) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    const assignedRoles = getMemberAssignedRoleNames(member).join(" ").toLowerCase();
    return (
      member.display_name.toLowerCase().includes(q) ||
      member.username.toLowerCase().includes(q) ||
      assignedRoles.includes(q)
    );
  });
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nonOwnerMembers = members.filter((member) => member.id !== serverOwnerId);
  const activeTemporaryRoleGrants = temporaryRoleGrants.filter(
    (grant) => !!grant.expires_at && new Date(grant.expires_at).getTime() > Date.now(),
  );
  const modAssignableMembers = useMemo(() => {
    return members.filter((member) => {
      if (serverOwnerId && member.id === serverOwnerId) return true;
      const memberRoleNames = sortRoleNamesByPriority([member.role, ...(activeAssignedRoleNamesByUser.get(member.id) || [])]);
      return memberRoleNames.some((roleName) => roleByName.get(normalizeRoleName(roleName))?.permissions?.includes("mod_menu"));
    });
  }, [activeAssignedRoleNamesByUser, members, roleByName, serverOwnerId, sortRoleNamesByPriority]);

  const getBanLengthLabel = (ban: BanListItem) => {
    if (!ban.expires_at) return "Permanent";
    const created = new Date(ban.created_at).getTime();
    const expires = new Date(ban.expires_at).getTime();
    return formatDuration(expires - created);
  };

  const getAuditActionLabel = (action: AuditLogItem["action"]) => {
    if (action === "ban_user") return "Banned User";
    if (action === "temp_ban_user") return "Temporarily Banned User";
    if (action === "unban_user") return "Unbanned User";
    if (action === "edit_member_role") return "Edited Member Role";
    if (action === "delete_channel") return "Deleted Channel";
    if (action === "edit_ban_length") return "Edited Ban Length";
    if (action === "timeout_user") return "Timed Out User";
    if (action === "clear_timeout") return "Cleared Timeout";
    if (action === "mute_user") return "Muted User";
    if (action === "unmute_user") return "Unmuted User";
    if (action === "warn_user") return "Warned User";
    if (action === "add_mod_note") return "Added Moderator Note";
    if (action === "automod_block") return "AutoMod Blocked Message";
    if (action === "assign_escalation") return "Assigned Escalation";
    if (action === "update_escalation_status") return "Updated Escalation Status";
    if (action === "file_appeal") return "Filed Appeal";
    if (action === "approve_appeal") return "Approved Appeal";
    if (action === "reject_appeal") return "Rejected Appeal";
    return action;
  };

  const filteredBans = bans.filter((ban) => {
    const q = banSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (ban.banned_user?.display_name || "").toLowerCase().includes(q) ||
      (ban.banned_user?.username || "").toLowerCase().includes(q) ||
      (ban.banned_by_user?.display_name || "").toLowerCase().includes(q) ||
      (ban.banned_by_user?.username || "").toLowerCase().includes(q) ||
      (ban.reason || "").toLowerCase().includes(q)
    );
  });

  const filteredAuditLogs = auditLogs.filter((entry) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      getAuditActionLabel(entry.action).toLowerCase().includes(q) ||
      (entry.actor?.display_name || "").toLowerCase().includes(q) ||
      (entry.actor?.username || "").toLowerCase().includes(q) ||
      (entry.target?.display_name || "").toLowerCase().includes(q) ||
      (entry.target?.username || "").toLowerCase().includes(q) ||
      JSON.stringify(entry.metadata || {}).toLowerCase().includes(q)
    );
  });

  if (!serverId) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-chat-area text-muted-foreground">
        Invalid server.
      </div>
    );
  }

  if (!server) {
    return <ServerSettingsSkeleton />;
  }

  if (!isOwner && rolesLoaded && !hasManageChannelsPermission && !hasModerationPermission) {
    return (
      <div className="min-h-[100dvh] bg-chat-area text-foreground flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-lg font-semibold">You do not have access to this page.</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Back to Server
        </button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-chat-area text-foreground flex">
      {!isMobile && (
        <div className="w-64 border-r border-border/50 bg-channel-bar p-4">
          <button
            onClick={() => navigate("/")}
            className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Server
          </button>
          <p className="px-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">Server Settings</p>
          <div className="space-y-1">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id)}
                className={`w-full text-left px-2 py-2 rounded-md text-sm flex items-center gap-2 ${
                  tab === entry.id
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                }`}
              >
                <entry.icon className="w-4 h-4" />
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-2 text-muted-foreground hover:text-foreground"
                title="Back to server"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-lg sm:text-xl font-semibold truncate">{server.name}</h1>
          </div>
          {isMobile && (
            <button
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-secondary px-2.5 py-2 text-secondary-foreground"
              title="Open settings tabs"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {tab === "info" && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Server Banner</label>
              <div className="h-32 rounded-md border border-border overflow-hidden bg-secondary/40 relative">
                {server.banner_url ? (
                  <img src={server.banner_url} alt={`${server.name} banner`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No banner set</div>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <label className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs cursor-pointer hover:opacity-90">
                  {uploadingBanner ? "Uploading..." : "Upload Banner"}
                  <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" disabled={uploadingBanner} />
                </label>
                {server.banner_url && (
                  <button
                    onClick={() => clearAsset("banner_url")}
                    className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs hover:bg-destructive/20"
                  >
                    Remove Banner
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Server Icon</label>
              <div className="w-20 h-20 rounded-2xl border border-border overflow-hidden bg-secondary/40">
                {server.icon_url ? (
                  <img src={server.icon_url} alt={`${server.name} icon`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                    {server.icon || server.name[0]}
                  </div>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <label className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs cursor-pointer hover:opacity-90">
                  {uploadingIcon ? "Uploading..." : "Upload Icon"}
                  <input type="file" accept="image/*" onChange={handleIconUpload} className="hidden" disabled={uploadingIcon} />
                </label>
                {server.icon_url && (
                  <button
                    onClick={() => clearAsset("icon_url")}
                    className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs hover:bg-destructive/20"
                  >
                    Remove Icon
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Server Name</label>
              <input
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Onboarding Welcome Title</label>
              <input
                value={onboardingWelcomeTitle}
                onChange={(e) => setOnboardingWelcomeTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Onboarding Welcome Message</label>
              <textarea
                value={onboardingWelcomeMessage}
                onChange={(e) => setOnboardingWelcomeMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Server Rules Text</label>
              <textarea
                value={onboardingRulesText}
                onChange={(e) => setOnboardingRulesText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
            </div>
            <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding Flow Builder</p>
                <button
                  onClick={() => void loadOnboardingBuilder()}
                  className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground"
                >
                  Refresh
                </button>
              </div>
              {loadingOnboardingBuilder && <DialogListSkeleton rows={4} />}
              {!loadingOnboardingBuilder && (
                <>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={onboardingFlow.enabled}
                      onChange={(e) => setOnboardingFlow((prev) => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded border-border"
                    />
                    Enable onboarding flow
                  </label>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">
                      Role Assigned On Completion
                    </label>
                    <select
                      value={onboardingFlow.assign_role_on_complete || ""}
                      onChange={(e) => setOnboardingFlow((prev) => ({ ...prev, assign_role_on_complete: e.target.value || null }))}
                      className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="">No role change</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.name}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => void handleSaveOnboardingFlow()}
                      disabled={savingOnboardingFlow}
                      className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    >
                      {savingOnboardingFlow ? "Saving..." : "Save Flow"}
                    </button>
                  </div>
                </>
              )}

              <div className="rounded-md border border-border/60 p-3 bg-background/70 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Add Step</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={newOnboardingStepType}
                    onChange={(e) => setNewOnboardingStepType(e.target.value as OnboardingStepItem["step_type"])}
                    className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                  >
                    <option value="custom_ack">Custom Acknowledgement</option>
                    <option value="rules_acceptance">Rules Acceptance</option>
                    <option value="read_channel">Required Channel Read</option>
                  </select>
                  {newOnboardingStepType === "read_channel" && (
                    <select
                      value={newOnboardingStepChannelId}
                      onChange={(e) => setNewOnboardingStepChannelId(e.target.value)}
                      className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="">Select channel</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>#{channel.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  value={newOnboardingStepTitle}
                  onChange={(e) => setNewOnboardingStepTitle(e.target.value)}
                  placeholder="Step title"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                />
                <textarea
                  value={newOnboardingStepDescription}
                  onChange={(e) => setNewOnboardingStepDescription(e.target.value)}
                  rows={2}
                  placeholder="Step description (optional)"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm resize-y"
                />
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={newOnboardingStepRequired}
                    onChange={(e) => setNewOnboardingStepRequired(e.target.checked)}
                    className="rounded border-border"
                  />
                  Required step
                </label>
                <div className="flex justify-end">
                  <button
                    onClick={() => void handleCreateOnboardingStep()}
                    disabled={creatingOnboardingStep || !newOnboardingStepTitle.trim()}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  >
                    {creatingOnboardingStep ? "Adding..." : "Add Step"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Steps</p>
                {onboardingSteps.length === 0 && <p className="text-sm text-muted-foreground">No onboarding steps yet.</p>}
                {onboardingSteps.map((step, idx) => (
                  <div key={step.id} className="rounded-md border border-border/60 bg-background/70 p-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {idx + 1}. {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {step.step_type === "rules_acceptance" && "Rules acceptance"}
                          {step.step_type === "read_channel" && `Read channel #${channels.find((c) => c.id === step.required_channel_id)?.name || "unknown"}`}
                          {step.step_type === "custom_ack" && "Custom acknowledgement"}
                          {step.is_required ? " • Required" : " • Optional"}
                        </p>
                        {step.description && (
                          <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">{step.description}</p>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => void handleMoveOnboardingStep(step.id, "up")}
                          disabled={idx === 0 || updatingOnboardingStepId === step.id}
                          className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          onClick={() => void handleMoveOnboardingStep(step.id, "down")}
                          disabled={idx === onboardingSteps.length - 1 || updatingOnboardingStepId === step.id}
                          className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          onClick={() => void handleDeleteOnboardingStep(step.id)}
                          disabled={deletingOnboardingStepId === step.id}
                          className="px-2 py-1 rounded bg-destructive/10 text-destructive text-xs disabled:opacity-50"
                        >
                          {deletingOnboardingStepId === step.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={step.is_required}
                        onChange={(e) => void handleToggleOnboardingStepRequired(step, e.target.checked)}
                        disabled={updatingOnboardingStepId === step.id}
                        className="rounded border-border"
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={discoverable}
                onChange={(e) => setDiscoverable(e.target.checked)}
                className="rounded border-border"
                disabled={!discoverabilitySupported}
              />
              Show this server on Discover
            </label>
            {!discoverabilitySupported && (
              <p className="text-xs text-muted-foreground">
                Discover toggle unavailable until latest DB migration is applied.
              </p>
            )}
            <button
              onClick={handleSaveInfo}
              disabled={!serverName.trim() || savingInfo}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {savingInfo ? "Saving..." : "Save Changes"}
            </button>

            <div className="pt-6 mt-2 border-t border-border">
              <p className="text-xs uppercase tracking-wide text-destructive mb-2">Danger Zone</p>
              <p className="text-sm text-muted-foreground mb-3">
                Permanently delete this server and all channels/messages.
              </p>
              <button
                onClick={handleDeleteServerRequest}
                disabled={deletingServer}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
              >
                {deletingServer ? "Deleting..." : "Delete Server"}
              </button>
            </div>
          </div>
        )}

        {tab === "channels" && (
          <div className="max-w-2xl space-y-4">
            <div className="rounded-md border border-border/60 p-3 bg-secondary/20">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Channel Groups</p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  placeholder="New group name"
                  className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || savingGroup}
                  className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  Add Group
                </button>
              </div>
              <div className="space-y-2">
                {channelGroups.map((group) => (
                  <div key={group.id} className="flex items-center gap-2 bg-background/70 rounded-md px-2 py-1.5 border border-border/60">
                    {renamingGroupId === group.id ? (
                      <>
                        <input
                          value={renameGroupValue}
                          onChange={(e) => setRenameGroupValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameGroup();
                            if (e.key === "Escape") setRenamingGroupId(null);
                          }}
                          className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm outline-none"
                          autoFocus
                        />
                        <button onClick={handleRenameGroup} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">Save</button>
                        <button onClick={() => setRenamingGroupId(null)} className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-foreground">{group.name}</span>
                        <button onClick={() => handleStartRenameGroup(group.id, group.name)} className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">Rename</button>
                        <button onClick={() => handleDeleteGroup(group.id)} className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">Delete</button>
                      </>
                    )}
                  </div>
                ))}
                {channelGroups.length === 0 && <p className="text-xs text-muted-foreground">No groups yet.</p>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                placeholder="New channel name"
                className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={newChannelType}
                onChange={(e) => setNewChannelType(e.target.value as "text" | "forum" | "voice")}
                className="px-2 py-2 rounded-md bg-background border border-border text-sm"
              >
                <option value="text">Text</option>
                <option value="forum">Forum</option>
                <option value="voice">Voice</option>
              </select>
              <button
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || savingChannel}
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                title="Create channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {channels.map((channel) => (
                <div key={channel.id} className="px-3 py-2 rounded-md bg-secondary/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {channel.type === "voice" ? (
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                    ) : channel.type === "forum" ? (
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Hash className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">{channel.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">({channel.type})</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <select
                      value={channel.group_id || ""}
                      onChange={(e) => handleAssignChannelGroup(channel.id, e.target.value)}
                      className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                      title="Assign group"
                    >
                      <option value="">No Group</option>
                      {channelGroups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteChannel(channel.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete channel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels yet.</p>}
            </div>
          </div>
        )}

        {tab === "roles" && (
          <div className="max-w-2xl space-y-4">

            <div className="rounded-md border border-border/60 p-3 bg-secondary/20">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Create Role</p>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleCreateRole()}
                  placeholder="Role name"
                  className="sm:col-span-2 px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  value={newRoleIcon}
                  onChange={(e) => setNewRoleIcon(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleCreateRole()}
                  placeholder="Icon (e.g. ★)"
                  className="px-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  type="color"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  className="h-10 w-12 rounded-md border border-border bg-background"
                  title="Role color"
                />
                <input
                  type="color"
                  value={newRoleUsernameColor || "#9ca3af"}
                  onChange={(e) => setNewRoleUsernameColor(e.target.value)}
                  className="h-10 w-12 rounded-md border border-border bg-background"
                  title="Username color"
                />
                <select
                  value={newRoleUsernameStyle}
                  onChange={(e) => setNewRoleUsernameStyle(e.target.value as RoleTextStyle)}
                  className="px-2 py-2 rounded-md bg-background border border-border text-sm"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="underline">Underline</option>
                </select>
                <select
                  value={newRoleUsernameEffect}
                  onChange={(e) => setNewRoleUsernameEffect(e.target.value as RoleTextEffect)}
                  className="px-2 py-2 rounded-md bg-background border border-border text-sm"
                >
                  <option value="none">No Effect</option>
                  <option value="glow">Glow</option>
                  <option value="shadow">Shadow</option>
                </select>
                <button
                  onClick={() => void handleCreateRole()}
                  disabled={!newRoleName.trim() || creatingRole}
                  className="sm:col-span-6 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  Add Role
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3 bg-secondary/20">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Existing Roles</p>
              <div className="space-y-2">
                <div className="w-full px-3 py-2 rounded-md border bg-background/70 border-border/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ownerRoleColor }} />
                    {ownerRoleIcon ? <span className="text-xs">{ownerRoleIcon}</span> : null}
                    <span className="text-sm">{ownerGroupName.trim() || "Owner"}</span>
                    <span className="text-xs text-muted-foreground">(Owner)</span>
                  </div>
                  <button
                    onClick={openOwnerRoleEditor}
                    className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground"
                  >
                    Edit
                  </button>
                </div>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={`w-full px-3 py-2 rounded-md border flex items-center justify-between ${
                      selectedRoleId === role.id
                        ? "bg-background border-primary/60"
                        : "bg-background/70 border-border/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setSelectedRoleId(role.id)}
                        className="flex items-center gap-2 text-sm hover:opacity-90"
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                        {role.icon ? <span className="text-xs">{role.icon}</span> : null}
                        <span>{role.name}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => openServerRoleEditor(role)}
                        className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleMoveRole(role.id, "up")}
                        disabled={reorderingRoleId !== null || roles[0]?.id === role.id}
                        className="p-1 rounded bg-secondary text-secondary-foreground disabled:opacity-40"
                        title="Move role up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleMoveRole(role.id, "down")}
                        disabled={reorderingRoleId !== null || roles[roles.length - 1]?.id === role.id}
                        className="p-1 rounded bg-secondary text-secondary-foreground disabled:opacity-40"
                        title="Move role down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeleteRole(role)}
                        disabled={deletingRoleId === role.id || reorderingRoleId !== null}
                        className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {roles.length === 0 && <p className="text-xs text-muted-foreground">No roles yet.</p>}
              </div>
            </div>


            {false && selectedRole && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Role Appearance: <span className="text-foreground normal-case">{selectedRole.name}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    Role Icon
                    <input
                      value={roleAppearanceDraft.icon}
                      onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, icon: e.target.value }))}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                      placeholder="e.g. ★"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Color
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={roleAppearanceDraft.usernameColor || selectedRole.color || "#9ca3af"}
                        onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameColor: e.target.value }))}
                        className="h-9 w-12 rounded-md border border-border bg-background"
                      />
                      <button
                        onClick={() => setRoleAppearanceDraft((prev) => ({ ...prev, usernameColor: "" }))}
                        className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs"
                      >
                        Use Role Color
                      </button>
                    </div>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Style
                    <select
                      value={roleAppearanceDraft.usernameStyle}
                      onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameStyle: e.target.value as RoleTextStyle }))}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                      <option value="underline">Underline</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Effect
                    <select
                      value={roleAppearanceDraft.usernameEffect}
                      onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameEffect: e.target.value as RoleTextEffect }))}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="none">No Effect</option>
                      <option value="glow">Glow</option>
                      <option value="shadow">Shadow</option>
                    </select>
                  </label>
                </div>
                <div className="rounded-md border border-border/60 bg-background/70 p-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">Preview</p>
                  <p
                    className={`text-sm ${getRoleNamePresentation({
                      role_color: selectedRole.color,
                      role_username_color: roleAppearanceDraft.usernameColor || null,
                      role_username_style: roleAppearanceDraft.usernameStyle,
                      role_username_effect: roleAppearanceDraft.usernameEffect,
                    }).className}`}
                    style={getRoleNamePresentation({
                      role_color: selectedRole.color,
                      role_username_color: roleAppearanceDraft.usernameColor || null,
                      role_username_style: roleAppearanceDraft.usernameStyle,
                      role_username_effect: roleAppearanceDraft.usernameEffect,
                    }).style}
                  >
                    {selectedRole.name} Username
                  </p>
                  <RoleBadges
                    className="mt-2"
                    badges={[{
                      id: selectedRole.id,
                      name: selectedRole.name,
                      color: selectedRole.color,
                      icon: roleAppearanceDraft.icon.trim() || null,
                      username_color: roleAppearanceDraft.usernameColor || null,
                      username_style: roleAppearanceDraft.usernameStyle,
                      username_effect: roleAppearanceDraft.usernameEffect,
                      position: selectedRole.position,
                    }]}
                  />
                </div>
                <button
                  onClick={() => void handleSaveRoleAppearance()}
                  disabled={savingRoleAppearanceId === selectedRole.id}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                >
                  {savingRoleAppearanceId === selectedRole.id ? "Saving..." : "Save Appearance"}
                </button>
              </div>
            )}

            {selectedRole && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Channel/Group Overrides: <span className="text-foreground normal-case">{selectedRole.name}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <select
                    value={overrideScopeType}
                    onChange={(e) => setOverrideScopeType(e.target.value as "channel" | "group")}
                    className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                  >
                    <option value="channel">Channel</option>
                    <option value="group">Group</option>
                  </select>
                  <select
                    value={overrideScopeId}
                    onChange={(e) => setOverrideScopeId(e.target.value)}
                    className="px-2 py-2 rounded-md bg-background border border-border text-xs sm:col-span-2"
                  >
                    <option value="">{overrideScopeType === "channel" ? "Select channel" : "Select group"}</option>
                    {overrideScopeOptions.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={overridePermissionKey}
                    onChange={(e) => setOverridePermissionKey(e.target.value)}
                    className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                  >
                    {ROLE_PERMISSION_OPTIONS.map((perm) => (
                      <option key={perm.key} value={perm.key}>{perm.label}</option>
                    ))}
                  </select>
                  <select
                    value={overrideMode}
                    onChange={(e) => setOverrideMode(e.target.value as "allow" | "deny" | "clear")}
                    className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                    <option value="clear">Clear</option>
                  </select>
                </div>
                <button
                  onClick={() => void handleApplyRoleOverride()}
                  disabled={savingRoleOverride || !overrideScopeId}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                >
                  {savingRoleOverride ? "Saving..." : "Apply Override"}
                </button>
                <div className="space-y-2">
                  {loadingRoleOverrides && (
                    <DialogListSkeleton rows={3} />
                  )}
                  {!loadingRoleOverrides && selectedRoleOverrides.length === 0 && (
                    <p className="text-xs text-muted-foreground">No overrides configured for this role.</p>
                  )}
                  {!loadingRoleOverrides && selectedRoleOverrides.map((override) => {
                    const scopeLabel = override.scope_type === "channel"
                      ? channels.find((channel) => channel.id === override.scope_id)?.name || "Unknown channel"
                      : channelGroups.find((group) => group.id === override.scope_id)?.name || "Unknown group";
                    return (
                      <div key={override.id} className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-foreground">
                            {override.scope_type === "channel" ? "#" : "Group: "}{scopeLabel}
                          </p>
                          <button
                            onClick={() => void handleDeleteRoleOverride(override.id)}
                            disabled={deletingRoleOverrideId === override.id}
                            className="px-2 py-0.5 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                        <p className="text-muted-foreground mt-1">
                          Allow: {override.allow_permissions.join(", ") || "none"}
                        </p>
                        <p className="text-muted-foreground">
                          Deny: {override.deny_permissions.join(", ") || "none"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Temporary Role Grants</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select
                  value={grantMemberId}
                  onChange={(e) => setGrantMemberId(e.target.value)}
                  className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                >
                  <option value="">Select member</option>
                  {nonOwnerMembers.map((member) => (
                    <option key={member.id} value={member.id}>{member.display_name}</option>
                  ))}
                </select>
                <select
                  value={grantRoleId}
                  onChange={(e) => setGrantRoleId(e.target.value)}
                  className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={grantExpiresAt}
                  onChange={(e) => setGrantExpiresAt(e.target.value)}
                  className="px-2 py-2 rounded-md bg-background border border-border text-xs"
                />
                <button
                  onClick={() => void handleGrantTemporaryRole()}
                  disabled={!grantMemberId || !grantRoleId || !grantExpiresAt || savingTemporaryRoleGrant}
                  className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                >
                  {savingTemporaryRoleGrant ? "Granting..." : "Grant Temporarily"}
                </button>
              </div>
              {loadingTemporaryRoleGrants && (
                <DialogListSkeleton rows={3} />
              )}
              {!loadingTemporaryRoleGrants && activeTemporaryRoleGrants.length === 0 && (
                <p className="text-xs text-muted-foreground">No active temporary grants.</p>
              )}
              {!loadingTemporaryRoleGrants && activeTemporaryRoleGrants.map((grant) => (
                <div key={grant.id} className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground truncate">
                      {(memberById.get(grant.user_id)?.display_name || grant.user_id)}
                      {" -> "}
                      {(roleById.get(grant.role_id)?.name || "Unknown role")}
                    </p>
                    <p className="text-muted-foreground">
                      Expires {grant.expires_at ? new Date(grant.expires_at).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleRevokeTemporaryRole(grant.id)}
                    disabled={deletingTemporaryRoleGrantId === grant.id}
                    className="px-2 py-0.5 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border/60 p-1 bg-secondary/20 inline-flex items-center gap-1">
              <button
                onClick={() => setRolesSubtab("manageUsers")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  rolesSubtab === "manageUsers"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Manage Users
              </button>
              <button
                onClick={() => setRolesSubtab("templates")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  rolesSubtab === "templates"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Templates
              </button>
            </div>

            {rolesSubtab === "templates" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Role Templates (Import / Export)</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name (optional)"
                    className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm"
                  />
                  <button
                    onClick={() => void handleSaveRoleTemplate()}
                    disabled={savingRoleTemplate}
                    className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                  >
                    {savingRoleTemplate ? "Saving..." : "Save Current Roles"}
                  </button>
                </div>
                {loadingRoleTemplates && (
                  <DialogListSkeleton rows={3} />
                )}
                {!loadingRoleTemplates && roleTemplates.length === 0 && (
                  <p className="text-xs text-muted-foreground">No templates yet.</p>
                )}
                {!loadingRoleTemplates && roleTemplates.map((template) => (
                  <div key={template.id} className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-foreground font-medium">{template.name}</p>
                      <p className="text-muted-foreground">{new Date(template.updated_at).toLocaleString()}</p>
                    </div>
                    <p className="text-muted-foreground">{template.definition.roles.length} roles</p>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => void handleApplyRoleTemplate(template)}
                        disabled={applyingRoleTemplateId === template.id}
                        className="px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                      >
                        {applyingRoleTemplateId === template.id ? "Applying..." : "Apply"}
                      </button>
                      <button
                        onClick={() => void handleExportRoleTemplate(template)}
                        className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground"
                      >
                        Export
                      </button>
                      <button
                        onClick={() => void handleDeleteRoleTemplate(template.id)}
                        disabled={deletingRoleTemplateId === template.id}
                        className="px-2 py-0.5 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                <textarea
                  value={templateImportJson}
                  onChange={(e) => setTemplateImportJson(e.target.value)}
                  rows={5}
                  placeholder='Import JSON, e.g. {"name":"Moderation Set","roles":[...]}'
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button
                  onClick={() => void handleImportRoleTemplate()}
                  disabled={!templateImportJson.trim() || savingRoleTemplate}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs disabled:opacity-50"
                >
                  Import Template JSON
                </button>
                <textarea
                  value={exportedTemplateJson}
                  onChange={(e) => setExportedTemplateJson(e.target.value)}
                  rows={5}
                  placeholder="Exported template JSON appears here"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
              </div>
            )}

            {rolesSubtab === "manageUsers" && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search users by name, username, or role"
                    className="w-full pl-8 pr-3 py-2 rounded-md bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                {filteredMembers.map((member) => {
                  const isServerOwner = member.id === server.owner_id;
                  const initials = member.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                  const assignedRoleNames = getMemberAssignedRoleNames(member);
                  const assignedBadges = assignedRoleNames
                    .map((roleName) => roleByName.get(normalizeRoleName(roleName)))
                    .filter((role): role is ServerRole => !!role)
                    .map((role) => ({
                      id: role.id,
                      name: role.name,
                      color: role.color,
                      icon: role.icon,
                      username_color: role.username_color,
                      username_style: role.username_style,
                      username_effect: role.username_effect,
                      position: role.position,
                    }));
                  const highestRole = assignedBadges[0] || null;
                  const highestRoleNameStyle = getRoleNamePresentation({
                    role_color: highestRole?.color || null,
                    role_username_color: highestRole?.username_color || null,
                    role_username_style: highestRole?.username_style || null,
                    role_username_effect: highestRole?.username_effect || null,
                  });
                  return (
                    <div key={member.id} className="px-3 py-2 rounded-md bg-secondary/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt={member.display_name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-foreground">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${highestRoleNameStyle.className}`.trim()} style={highestRoleNameStyle.style}>
                            {member.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">@{member.username}</p>
                          <RoleBadges badges={assignedBadges} className="mt-1" />
                        </div>
                      </div>
                      {isServerOwner ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Shield className="w-3 h-3" />
                          Owner
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {roleOptions.map((roleName) => {
                            const isSelected = assignedRoleNames.some((name) => normalizeRoleName(name) === normalizeRoleName(roleName));
                            return (
                              <button
                                key={`${member.id}-${roleName}`}
                                onClick={() => {
                                  const nextRoles = isSelected
                                    ? assignedRoleNames.filter((name) => normalizeRoleName(name) !== normalizeRoleName(roleName))
                                    : [...assignedRoleNames, roleName];
                                  void handleMemberRolesChange(member.id, nextRoles);
                                }}
                                disabled={updatingRoleUserId === member.id || (isSelected && assignedRoleNames.length <= 1)}
                                className={`px-2 py-1 rounded-md border text-[11px] ${
                                  isSelected
                                    ? "bg-background border-primary/50 text-foreground"
                                    : "bg-background/60 border-border text-muted-foreground"
                                } disabled:opacity-50`}
                              >
                                {roleName}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredMembers.length === 0 && <p className="text-sm text-muted-foreground">No users match your search.</p>}
              </div>
            )}
          </div>
        )}


        {tab === "moderation" && (
          <div className="max-w-6xl space-y-4">
            <div className="rounded-md border border-border/60 p-1 bg-secondary/20 inline-flex items-center gap-1">
              <button
                onClick={() => setModerationSubtab("bans")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  moderationSubtab === "bans"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Server Bans
              </button>
              <button
                onClick={() => setModerationSubtab("audit")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  moderationSubtab === "audit"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Audit Log
              </button>
              <button
                onClick={() => setModerationSubtab("automod")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  moderationSubtab === "automod"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                AutoMod
              </button>
              <button
                onClick={() => setModerationSubtab("queue")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  moderationSubtab === "queue"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Escalation Queue
              </button>
              <button
                onClick={() => setModerationSubtab("appeals")}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  moderationSubtab === "appeals"
                    ? "bg-background text-foreground border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Appeals
              </button>
            </div>

            {moderationSubtab === "bans" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20">
                <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Server Bans</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        value={banSearch}
                        onChange={(e) => setBanSearch(e.target.value)}
                        placeholder="Search bans..."
                        className="pl-7 pr-2 py-1.5 rounded-md bg-background border border-border text-xs w-52"
                      />
                    </div>
                    <button
                      onClick={() => void loadBans()}
                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {loadingBans && <DialogListSkeleton rows={4} />}
                {!loadingBans && bans.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active bans.</p>
                )}
                {!loadingBans && bans.length > 0 && filteredBans.length === 0 && (
                  <p className="text-sm text-muted-foreground">No bans match your search.</p>
                )}

                {!loadingBans && filteredBans.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Banned By</TableHead>
                          <TableHead>Length / Expiry</TableHead>
                          <TableHead>Banned On</TableHead>
                          <TableHead>Reason</TableHead>
                          {hasBanPermission && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBans.map((ban) => (
                          <Fragment key={ban.id}>
                            <TableRow>
                              <TableCell className="text-xs">
                                <p className="font-medium text-foreground">{ban.banned_user?.display_name || "Unknown User"}</p>
                                <p className="text-muted-foreground">@{ban.banned_user?.username || "unknown"}</p>
                              </TableCell>
                              <TableCell className="text-xs">
                                <p className="text-foreground">{ban.banned_by_user?.display_name || "Unknown moderator"}</p>
                                <p className="text-muted-foreground">
                                  {ban.banned_by_user?.username ? `@${ban.banned_by_user.username}` : "unknown"}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs">
                                <p>{getBanLengthLabel(ban)}</p>
                                <p className="text-muted-foreground">
                                  {ban.expires_at ? `Expires ${new Date(ban.expires_at).toLocaleString()}` : "Never expires"}
                                </p>
                              </TableCell>
                              <TableCell className="text-xs">{new Date(ban.created_at).toLocaleString()}</TableCell>
                              <TableCell className="text-xs max-w-[280px] break-words">
                                {ban.reason?.trim() ? ban.reason : "No reason provided"}
                              </TableCell>
                              {hasBanPermission && (
                                <TableCell className="text-right">
                                  <div className="inline-flex flex-wrap items-center gap-2 justify-end">
                                    <button
                                      onClick={() => handleStartEditBan(ban)}
                                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                                    >
                                      Edit Length
                                    </button>
                                    <button
                                      onClick={() => void handleUnban(ban.id)}
                                      disabled={unbanningBanId === ban.id}
                                      className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                                    >
                                      {unbanningBanId === ban.id ? "Unbanning..." : "Unban"}
                                    </button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                            {editingBanId === ban.id && hasBanPermission && (
                              <TableRow>
                                <TableCell colSpan={hasBanPermission ? 6 : 5}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="datetime-local"
                                      value={editingBanExpiry}
                                      onChange={(e) => setEditingBanExpiry(e.target.value)}
                                      className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                                    />
                                    <button
                                      onClick={() => void handleSaveBanLength(ban.id)}
                                      disabled={updatingBanId === ban.id}
                                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                                    >
                                      {updatingBanId === ban.id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => setEditingBanExpiry("")}
                                      disabled={updatingBanId === ban.id}
                                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
                                    >
                                      Set Permanent
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingBanId(null);
                                        setEditingBanExpiry("");
                                      }}
                                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {moderationSubtab === "automod" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">AutoMod Rules</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void loadAutomodSettings()}
                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={() => void saveAutomodSettings()}
                      disabled={savingAutomod}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {savingAutomod ? "Saving..." : "Save Rules"}
                    </button>
                  </div>
                </div>
                {loadingAutomod && <DialogListSkeleton rows={5} />}
                {!loadingAutomod && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-md border border-border/60 p-3 bg-background/70 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Regex Block Rules</p>
                      <textarea
                        value={automodRegexInput}
                        onChange={(e) => setAutomodRegexInput(e.target.value)}
                        rows={8}
                        placeholder={"One regex per line\nExample: (?i)free\\s+money"}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      />
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">Templates</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {AUTOMOD_REGEX_TEMPLATES.map((template) => (
                            <button
                              key={template.label}
                              type="button"
                              onClick={() => addRegexTemplate(template.pattern)}
                              className="text-left rounded border border-border/70 bg-secondary/40 px-2 py-1.5 hover:bg-secondary/70"
                              title={template.pattern}
                            >
                              <p className="text-xs font-medium text-foreground">{template.label}</p>
                              <p className="text-[11px] text-muted-foreground">{template.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 p-3 bg-background/70 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Link and Domain Filters</p>
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={automodSettings.block_all_links}
                          onChange={(e) => setAutomodSettings((prev) => ({ ...prev, block_all_links: e.target.checked }))}
                        />
                        Block all links
                      </label>
                      <textarea
                        value={automodDomainsInput}
                        onChange={(e) => setAutomodDomainsInput(e.target.value)}
                        rows={6}
                        placeholder={"One blocked domain per line\nExample: spam-site.com"}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="rounded-md border border-border/60 p-3 bg-background/70 space-y-2 lg:col-span-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={automodSettings.toxicity_enabled}
                            onChange={(e) => setAutomodSettings((prev) => ({ ...prev, toxicity_enabled: e.target.checked }))}
                          />
                          Enable toxicity checks
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Threshold
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={automodSettings.toxicity_threshold}
                            onChange={(e) => setAutomodSettings((prev) => ({ ...prev, toxicity_threshold: Number(e.target.value) || 1 }))}
                            className="ml-2 w-16 rounded-md border border-border bg-background px-2 py-1"
                          />
                        </label>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">Toxicity Presets</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {TOXICITY_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => applyToxicityPreset(preset)}
                              className="text-left rounded border border-border/70 bg-secondary/40 px-2 py-1.5 hover:bg-secondary/70"
                            >
                              <p className="text-xs font-medium text-foreground">{preset.label}</p>
                              <p className="text-[11px] text-muted-foreground">
                                threshold {preset.threshold} • {preset.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={automodToxicityInput}
                        onChange={(e) => setAutomodToxicityInput(e.target.value)}
                        rows={6}
                        placeholder={"One toxicity phrase per line"}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      />
                      <div className="rounded border border-border/60 bg-secondary/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                        Toxicity check uses phrase matching, not AI scoring. Each matched toxicity term adds 1 to score.
                        Message is blocked when score is greater than or equal to threshold.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {moderationSubtab === "queue" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Escalation Queue</p>
                  <button
                    onClick={() => void loadEscalations()}
                    className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                  >
                    Refresh
                  </button>
                </div>
                {loadingEscalations && <DialogListSkeleton rows={4} />}
                {!loadingEscalations && escalations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No escalation items.</p>
                )}
                {!loadingEscalations && escalations.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {escalations.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs uppercase">{item.source_type}</TableCell>
                            <TableCell className="text-xs max-w-[360px] break-words">{item.reason}</TableCell>
                            <TableCell className="text-xs uppercase">{item.priority}</TableCell>
                            <TableCell className="text-xs">
                              <select
                                value={item.status}
                                onChange={(e) => void handleEscalationUpdate(item, { status: e.target.value as EscalationItem["status"] })}
                                disabled={updatingEscalationId === item.id}
                                className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                              >
                                <option value="open">Open</option>
                                <option value="in_review">In Review</option>
                                <option value="resolved">Resolved</option>
                                <option value="dismissed">Dismissed</option>
                              </select>
                            </TableCell>
                            <TableCell className="text-xs">
                              <select
                                value={item.assigned_to || ""}
                                onChange={(e) => void handleEscalationUpdate(item, { assigned_to: e.target.value || null })}
                                disabled={updatingEscalationId === item.id}
                                className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                              >
                                <option value="">Unassigned</option>
                                {modAssignableMembers.map((member) => (
                                  <option key={member.id} value={member.id}>{member.display_name}</option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="text-xs">{new Date(item.created_at).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {moderationSubtab === "appeals" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Appeals</p>
                  <button
                    onClick={() => void loadAppeals()}
                    className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                  >
                    Refresh
                  </button>
                </div>
                {loadingAppeals && <DialogListSkeleton rows={4} />}
                {!loadingAppeals && appeals.length === 0 && (
                  <p className="text-sm text-muted-foreground">No appeals submitted.</p>
                )}
                {!loadingAppeals && appeals.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appeals.map((appeal) => (
                          <TableRow key={appeal.id}>
                            <TableCell className="text-xs">
                              {memberById.get(appeal.user_id)?.display_name || appeal.user_id}
                            </TableCell>
                            <TableCell className="text-xs uppercase">{appeal.punishment_type}</TableCell>
                            <TableCell className="text-xs uppercase">{appeal.status}</TableCell>
                            <TableCell className="text-xs max-w-[320px] break-words">{appeal.reason}</TableCell>
                            <TableCell className="text-xs">
                              {appeal.assigned_to ? (memberById.get(appeal.assigned_to)?.display_name || appeal.assigned_to) : "Unassigned"}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="inline-flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => void handleAppealDecision(appeal, "under_review")}
                                  disabled={updatingAppealId === appeal.id}
                                  className="px-2 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
                                >
                                  Review
                                </button>
                                <button
                                  onClick={() => openAppealDecisionModal(appeal, "approved")}
                                  disabled={updatingAppealId === appeal.id}
                                  className="px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => openAppealDecisionModal(appeal, "rejected")}
                                  disabled={updatingAppealId === appeal.id}
                                  className="px-2 py-1 rounded bg-destructive/10 text-destructive disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {moderationSubtab === "audit" && (
              <div className="rounded-md border border-border/60 p-3 bg-secondary/20">
                <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Audit Log</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        placeholder="Search audit log..."
                        className="pl-7 pr-2 py-1.5 rounded-md bg-background border border-border text-xs w-52"
                      />
                    </div>
                    <button
                      onClick={() => void loadAuditLogs()}
                      className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:opacity-90"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {loadingAuditLogs && <DialogListSkeleton rows={4} />}
                {!loadingAuditLogs && auditLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No moderation actions recorded yet.</p>
                )}
                {!loadingAuditLogs && auditLogs.length > 0 && filteredAuditLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No audit entries match your search.</p>
                )}

                {!loadingAuditLogs && filteredAuditLogs.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAuditLogs.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs font-medium">{getAuditActionLabel(entry.action)}</TableCell>
                            <TableCell className="text-xs">
                              <p>{entry.actor?.display_name || "Unknown user"}</p>
                              <p className="text-muted-foreground">
                                {entry.actor?.username ? `@${entry.actor.username}` : "unknown"}
                              </p>
                            </TableCell>
                            <TableCell className="text-xs">
                              {entry.target_user_id ? (
                                <>
                                  <p>{entry.target?.display_name || "Unknown user"}</p>
                                  <p className="text-muted-foreground">
                                    {entry.target?.username ? `@${entry.target.username}` : "unknown"}
                                  </p>
                                </>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{new Date(entry.created_at).toLocaleString()}</TableCell>
                            <TableCell className="text-xs max-w-[340px] break-words">{JSON.stringify(entry.metadata || {})}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <Dialog
          open={roleEditorOpen}
          onOpenChange={(open) => {
            setRoleEditorOpen(open);
            if (!open) setRoleEditorTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {roleEditorTarget?.type === "owner"
                  ? "Edit Owner Role"
                  : roleEditorRole
                    ? `Edit Role: ${roleEditorRole.name}`
                    : "Edit Role"}
              </DialogTitle>
            </DialogHeader>

            {roleEditorTarget?.type === "owner" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    Owner Role Name
                    <input
                      value={ownerGroupName}
                      onChange={(e) => setOwnerGroupName(e.target.value)}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                      placeholder="Owner"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Role Icon
                    <input
                      value={ownerRoleIcon}
                      onChange={(e) => setOwnerRoleIcon(e.target.value)}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                      placeholder="e.g. *"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Role Color
                    <input
                      type="color"
                      value={ownerRoleColor}
                      onChange={(e) => setOwnerRoleColor(e.target.value)}
                      className="mt-1 h-9 w-12 rounded-md border border-border bg-background"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Color
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={ownerRoleUsernameColor || ownerRoleColor}
                        onChange={(e) => setOwnerRoleUsernameColor(e.target.value)}
                        className="h-9 w-12 rounded-md border border-border bg-background"
                      />
                      <button
                        onClick={() => setOwnerRoleUsernameColor("")}
                        className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs"
                      >
                        Use Role Color
                      </button>
                    </div>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Style
                    <select
                      value={ownerRoleUsernameStyle}
                      onChange={(e) => setOwnerRoleUsernameStyle(e.target.value as RoleTextStyle)}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                      <option value="underline">Underline</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Username Effect
                    <select
                      value={ownerRoleUsernameEffect}
                      onChange={(e) => setOwnerRoleUsernameEffect(e.target.value as RoleTextEffect)}
                      className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                    >
                      <option value="none">No Effect</option>
                      <option value="glow">Glow</option>
                      <option value="shadow">Shadow</option>
                    </select>
                  </label>
                </div>
                <div className="rounded-md border border-border/60 bg-background/70 p-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">Preview</p>
                  <p
                    className={`text-sm ${getRoleNamePresentation({
                      role_color: ownerRoleColor,
                      role_username_color: ownerRoleUsernameColor || null,
                      role_username_style: ownerRoleUsernameStyle,
                      role_username_effect: ownerRoleUsernameEffect,
                    }).className}`}
                    style={getRoleNamePresentation({
                      role_color: ownerRoleColor,
                      role_username_color: ownerRoleUsernameColor || null,
                      role_username_style: ownerRoleUsernameStyle,
                      role_username_effect: ownerRoleUsernameEffect,
                    }).style}
                  >
                    {(ownerGroupName.trim() || "Owner")} Username
                  </p>
                  <RoleBadges
                    className="mt-2"
                    badges={[{
                      id: "owner",
                      name: ownerGroupName.trim() || "Owner",
                      color: ownerRoleColor,
                      icon: ownerRoleIcon.trim() || null,
                      username_color: ownerRoleUsernameColor || null,
                      username_style: ownerRoleUsernameStyle,
                      username_effect: ownerRoleUsernameEffect,
                      position: 9999,
                    }]}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => void handleSaveOwnerGroupName()}
                    disabled={savingOwnerGroup || !ownerGroupName.trim() || !ownerConfigDirty}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  >
                    {savingOwnerGroup ? "Saving..." : "Save Owner Role"}
                  </button>
                </div>
              </div>
            )}

            {roleEditorTarget?.type === "role" && roleEditorRole && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Role Permissions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ROLE_PERMISSION_OPTIONS.map((perm) => {
                      const enabled = roleEditorRole.permissions.includes(perm.key);
                      return (
                        <label key={perm.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background/70 border border-border/60 text-sm">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => void handleToggleRolePermission(roleEditorRole.id, perm.key)}
                            disabled={updatingRolePermissionsId === roleEditorRole.id}
                            className="rounded border-border"
                          />
                          <span>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Role Appearance</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">
                      Role Icon
                      <input
                        value={roleAppearanceDraft.icon}
                        onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, icon: e.target.value }))}
                        className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                        placeholder="e.g. *"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Username Color
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={roleAppearanceDraft.usernameColor || roleEditorRole.color || "#9ca3af"}
                          onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameColor: e.target.value }))}
                          className="h-9 w-12 rounded-md border border-border bg-background"
                        />
                        <button
                          onClick={() => setRoleAppearanceDraft((prev) => ({ ...prev, usernameColor: "" }))}
                          className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs"
                        >
                          Use Role Color
                        </button>
                      </div>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Username Style
                      <select
                        value={roleAppearanceDraft.usernameStyle}
                        onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameStyle: e.target.value as RoleTextStyle }))}
                        className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="underline">Underline</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Username Effect
                      <select
                        value={roleAppearanceDraft.usernameEffect}
                        onChange={(e) => setRoleAppearanceDraft((prev) => ({ ...prev, usernameEffect: e.target.value as RoleTextEffect }))}
                        className="mt-1 w-full px-2 py-2 rounded-md bg-background border border-border text-sm"
                      >
                        <option value="none">No Effect</option>
                        <option value="glow">Glow</option>
                        <option value="shadow">Shadow</option>
                      </select>
                    </label>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/70 p-2.5">
                    <p className="text-[11px] text-muted-foreground mb-1">Preview</p>
                    <p
                      className={`text-sm ${getRoleNamePresentation({
                        role_color: roleEditorRole.color,
                        role_username_color: roleAppearanceDraft.usernameColor || null,
                        role_username_style: roleAppearanceDraft.usernameStyle,
                        role_username_effect: roleAppearanceDraft.usernameEffect,
                      }).className}`}
                      style={getRoleNamePresentation({
                        role_color: roleEditorRole.color,
                        role_username_color: roleAppearanceDraft.usernameColor || null,
                        role_username_style: roleAppearanceDraft.usernameStyle,
                        role_username_effect: roleAppearanceDraft.usernameEffect,
                      }).style}
                    >
                      {roleEditorRole.name} Username
                    </p>
                    <RoleBadges
                      className="mt-2"
                      badges={[{
                        id: roleEditorRole.id,
                        name: roleEditorRole.name,
                        color: roleEditorRole.color,
                        icon: roleAppearanceDraft.icon.trim() || null,
                        username_color: roleAppearanceDraft.usernameColor || null,
                        username_style: roleAppearanceDraft.usernameStyle,
                        username_effect: roleAppearanceDraft.usernameEffect,
                        position: roleEditorRole.position,
                      }]}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => void handleSaveRoleAppearance()}
                      disabled={savingRoleAppearanceId === roleEditorRole.id}
                      className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    >
                      {savingRoleAppearanceId === roleEditorRole.id ? "Saving..." : "Save Appearance"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {roleEditorTarget?.type === "role" && !roleEditorRole && (
              <p className="text-sm text-muted-foreground">This role no longer exists.</p>
            )}
          </DialogContent>
        </Dialog>
        {isMobile && (
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
              <div className="h-full bg-channel-bar p-4">
                <button
                  onClick={() => {
                    navigate("/");
                    setMobileNavOpen(false);
                  }}
                  className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Server
                </button>
                <p className="px-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">Server Settings</p>
                <div className="space-y-1">
                  {tabs.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setTab(entry.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full text-left px-2 py-2 rounded-md text-sm flex items-center gap-2 ${
                        tab === entry.id
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
                      }`}
                    >
                      <entry.icon className="w-4 h-4" />
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}
        <AlertDialog open={showDeleteServerConfirm} onOpenChange={setShowDeleteServerConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete server?</AlertDialogTitle>
              <AlertDialogDescription>
                {`Delete "${server?.name || "this server"}"? This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingServer}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDeleteServerConfirm()}
                disabled={deletingServer}
              >
                {deletingServer ? "Deleting..." : "Delete Server"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog
          open={appealDecisionModalOpen}
          onOpenChange={(open) => {
            setAppealDecisionModalOpen(open);
            if (!open) {
              setAppealDecisionAppeal(null);
              setAppealDecisionStatus(null);
              setAppealDecisionNote("");
              setAppealDecisionUnban(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {appealDecisionStatus === "approved" ? "Approve Appeal" : "Reject Appeal"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Add an optional decision note for this appeal.
              </p>
              <textarea
                value={appealDecisionNote}
                onChange={(e) => setAppealDecisionNote(e.target.value)}
                rows={5}
                placeholder="Decision note (optional)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y"
              />
              {appealDecisionStatus === "approved" && (
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={appealDecisionUnban}
                    onChange={(e) => setAppealDecisionUnban(e.target.checked)}
                    disabled={!hasBanPermission}
                    className="rounded border-border"
                  />
                  Unban
                  {!hasBanPermission && (
                    <span className="text-xs text-muted-foreground">(Requires ban permission)</span>
                  )}
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAppealDecisionModalOpen(false)}
                  disabled={!!(appealDecisionAppeal && updatingAppealId === appealDecisionAppeal.id)}
                  className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submitAppealDecision()}
                  disabled={!!(appealDecisionAppeal && updatingAppealId === appealDecisionAppeal.id)}
                  className={`px-3 py-1.5 rounded-md text-sm disabled:opacity-50 ${
                    appealDecisionStatus === "approved"
                      ? "bg-primary text-primary-foreground"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {appealDecisionAppeal && updatingAppealId === appealDecisionAppeal.id
                    ? "Saving..."
                    : appealDecisionStatus === "approved"
                      ? "Approve Appeal"
                      : "Reject Appeal"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ServerSettingsPage;
