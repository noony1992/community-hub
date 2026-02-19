import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, Globe, MapPin, Save, UserRound, MessageSquare, UserPlus, Check, UserMinus, X, MoreVertical, Shield } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { isWithinQuietHours, type UserNotificationSettings } from "@/lib/notificationPreferences";
import UserModerationSidebar from "@/components/chat/UserModerationSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProfileRecord = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  status: string;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
};

type FriendshipStatus = "none" | "outgoing" | "incoming" | "friends";

type ServerRoleLabel = {
  name: string;
  color: string | null;
};

const ProfilePage = () => {
  const { user } = useAuth();
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    status: "online",
    bio: "",
    pronouns: "",
    location: "",
    website: "",
  });
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>("none");
  const [friendshipRowId, setFriendshipRowId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [serverRoleLabel, setServerRoleLabel] = useState<ServerRoleLabel | null>(null);
  const [showModeration, setShowModeration] = useState(false);
  const [canOpenModMenu, setCanOpenModMenu] = useState(false);

  const targetUserId = userId || user?.id || "";
  const isOwn = !!user && targetUserId === user.id;
  const contextServerId = searchParams.get("server");

  useEffect(() => {
    if (!targetUserId) return;
    const loadProfile = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, status, bio, pronouns, location, website, created_at")
        .eq("id", targetUserId)
        .maybeSingle();

      if (data) {
        const p = data as ProfileRecord;
        setProfile(p);
        setForm({
          display_name: p.display_name || "",
          status: p.status || "online",
          bio: p.bio || "",
          pronouns: p.pronouns || "",
          location: p.location || "",
          website: p.website || "",
        });
      }
      setLoading(false);
    };
    loadProfile();
  }, [targetUserId]);

  useEffect(() => {
    const loadFriendship = async () => {
      if (!user || !targetUserId || isOwn) {
        setFriendshipStatus("none");
        setFriendshipRowId(null);
        return;
      }

      const { data: outgoing } = await supabase
        .from("friendships")
        .select("id, status")
        .eq("requester_id", user.id)
        .eq("addressee_id", targetUserId)
        .maybeSingle();

      const { data: incoming } = await supabase
        .from("friendships")
        .select("id, status")
        .eq("requester_id", targetUserId)
        .eq("addressee_id", user.id)
        .maybeSingle();

      if (outgoing?.status === "accepted" || incoming?.status === "accepted") {
        setFriendshipStatus("friends");
        setFriendshipRowId(outgoing?.id || incoming?.id || null);
        return;
      }
      if (outgoing?.status === "pending") {
        setFriendshipStatus("outgoing");
        setFriendshipRowId(outgoing.id);
        return;
      }
      if (incoming?.status === "pending") {
        setFriendshipStatus("incoming");
        setFriendshipRowId(incoming.id);
        return;
      }

      setFriendshipStatus("none");
      setFriendshipRowId(null);
    };

    void loadFriendship();
  }, [isOwn, targetUserId, user]);

  useEffect(() => {
    const loadServerRole = async () => {
      if (!contextServerId || !targetUserId) {
        setServerRoleLabel(null);
        return;
      }

      const { data: membership } = await supabase
        .from("server_members")
        .select("role")
        .eq("server_id", contextServerId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!membership?.role) {
        setServerRoleLabel(null);
        return;
      }

      if (membership.role === "owner") {
        setServerRoleLabel({ name: "owner", color: "#f59e0b" });
        return;
      }

      const { data: role } = await supabase
        .from("server_roles")
        .select("name, color")
        .eq("server_id", contextServerId)
        .eq("name", membership.role)
        .maybeSingle();

      setServerRoleLabel({
        name: role?.name || membership.role,
        color: role?.color || null,
      });
    };

    void loadServerRole();
  }, [contextServerId, targetUserId]);

  useEffect(() => {
    const checkModMenuAccess = async () => {
      if (!user || !contextServerId || isOwn) {
        setCanOpenModMenu(false);
        return;
      }
      const { data } = await supabase.rpc("has_server_permission", {
        _server_id: contextServerId,
        _user_id: user.id,
        _permission: "mod_menu",
      });
      setCanOpenModMenu(!!data);
    };
    void checkModMenuAccess();
  }, [contextServerId, isOwn, user]);

  const initials = useMemo(() => (profile?.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(), [profile?.display_name]);

  const uploadAsset = async (file: File, type: "avatar" | "banner") => {
    if (!isOwn || !profile) return;
    const ext = file.name.split(".").pop() || "png";
    const path = `${profile.id}/${type}-${Date.now()}.${ext}`;

    let bucket = "profile-avatars";
    let { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
    if (uploadError) {
      bucket = "chat-attachments";
      ({ error: uploadError } = await supabase.storage.from(bucket).upload(path, file));
    }
    if (uploadError) {
      alert(`Failed to upload ${type}: ${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const field = type === "avatar" ? "avatar_url" : "banner_url";
    const { error: updateError } = await supabase.from("profiles").update({ [field]: data.publicUrl }).eq("id", profile.id);
    if (updateError) {
      alert(`Failed to save ${type}: ${updateError.message}`);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, [field]: data.publicUrl } : prev));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, type: "avatar" | "banner") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadAsset(file, type);
    setUploading(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!isOwn || !profile || !form.display_name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name.trim(),
        status: form.status,
        bio: form.bio.trim() || null,
        pronouns: form.pronouns.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
      })
      .eq("id", profile.id);

    if (error) {
      alert(`Failed to save profile: ${error.message}`);
      setSaving(false);
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            display_name: form.display_name.trim(),
            status: form.status,
            bio: form.bio.trim() || null,
            pronouns: form.pronouns.trim() || null,
            location: form.location.trim() || null,
            website: form.website.trim() || null,
          }
        : prev,
    );
    setSaving(false);
  };

  const handleDirectMessage = async () => {
    if (!user || !targetUserId || isOwn) return;
    setDmLoading(true);
    const { data: conversationId, error } = await supabase.rpc("start_direct_conversation", {
      _other_user_id: targetUserId,
    });
    setDmLoading(false);
    if (error || !conversationId) {
      alert(`Failed to open DM: ${error?.message || "Unknown error"}`);
      return;
    }
    navigate(`/?dm=${conversationId}`);
  };

  const handleAddFriend = async () => {
    if (!user || !targetUserId || isOwn) return;
    setFriendActionLoading(true);
    const { data: existingForward } = await supabase
      .from("friendships")
      .select("id, status")
      .eq("requester_id", user.id)
      .eq("addressee_id", targetUserId)
      .maybeSingle();
    const { data: existingBackward } = await supabase
      .from("friendships")
      .select("id, status")
      .eq("requester_id", targetUserId)
      .eq("addressee_id", user.id)
      .maybeSingle();

    if (existingForward?.id || existingBackward?.id) {
      setFriendActionLoading(false);
      return;
    }

    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: targetUserId,
      status: "pending",
    });
    setFriendActionLoading(false);
    if (error) {
      alert(`Failed to send request: ${error.message}`);
      return;
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const { data: recipientSettings } = await supabase
      .from("user_notification_settings")
      .select("user_id, mention_only, keyword_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!recipientSettings || !isWithinQuietHours(recipientSettings as UserNotificationSettings)) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: targetUserId,
        type: "friend_request",
        title: `${senderProfile?.display_name || "Someone"} sent you a friend request`,
        body: "Click to view their profile",
        link_user_id: user.id,
      });
      if (notificationError) {
        console.error("Failed to create friend request notification:", notificationError.message);
      }
    }

    setFriendshipStatus("outgoing");
  };

  const handleAcceptFriend = async () => {
    if (!friendshipRowId) return;
    setFriendActionLoading(true);
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipRowId);
    setFriendActionLoading(false);
    if (error) {
      alert(`Failed to accept request: ${error.message}`);
      return;
    }
    setFriendshipStatus("friends");
  };

  const handleRemoveOrCancelFriend = async () => {
    if (!user || !targetUserId) return;
    setFriendActionLoading(true);
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`);
    setFriendActionLoading(false);
    if (error) {
      alert(`Failed to update friendship: ${error.message}`);
      return;
    }
    setFriendshipStatus("none");
    setFriendshipRowId(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-chat-area flex items-center justify-center text-muted-foreground">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-chat-area flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Profile not found.</p>
        <button onClick={() => navigate("/")} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm">Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chat-area text-foreground">
      <div className="max-w-4xl mx-auto p-6">
        <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="relative">
            {!isOwn && canOpenModMenu && (
              <div className="absolute top-3 right-3 z-30">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded-md bg-black/40 text-white p-1.5 hover:bg-black/55">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setShowModeration(true)} className="flex items-center gap-2 cursor-pointer">
                      <Shield className="w-4 h-4" />
                      <span>Moderate User</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <div className="h-44 bg-secondary relative z-0">
              {profile.banner_url && <img src={profile.banner_url} alt="Profile banner" className="w-full h-full object-cover" />}
              {isOwn && (
                <label className="absolute top-3 right-3 px-3 py-1.5 rounded-md bg-black/60 text-white text-xs cursor-pointer">
                  {uploading ? "Uploading..." : "Change Banner"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileChange(e, "banner")} disabled={uploading} />
                </label>
              )}
            </div>

            <div className="absolute left-6 right-6 -bottom-10 z-20 flex items-end justify-between pointer-events-none">
              <div className="flex items-end gap-4 pointer-events-auto">
                <div className="w-20 h-20 rounded-full border-4 border-card overflow-hidden bg-secondary flex items-center justify-center text-xl font-bold shadow-md">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" /> : initials}
                </div>
                <div className="pb-1">
                  <h1 className="text-2xl font-bold text-foreground drop-shadow-sm">{profile.display_name}</h1>
                  <p className="text-muted-foreground">@{profile.username}</p>
                </div>
              </div>

              {isOwn && (
                <label className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs cursor-pointer pointer-events-auto">
                  {uploading ? "Uploading..." : "Change Avatar"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileChange(e, "avatar")} disabled={uploading} />
                </label>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 pt-14">
            {!isOwn && (
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void handleDirectMessage()}
                  disabled={dmLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  {dmLoading ? "Opening..." : "Message"}
                </button>

                {friendshipStatus === "none" && (
                  <button
                    onClick={() => void handleAddFriend()}
                    disabled={friendActionLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Friend
                  </button>
                )}

                {friendshipStatus === "outgoing" && (
                  <button
                    onClick={() => void handleRemoveOrCancelFriend()}
                    disabled={friendActionLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel Request
                  </button>
                )}

                {friendshipStatus === "incoming" && (
                  <>
                    <button
                      onClick={() => void handleAcceptFriend()}
                      disabled={friendActionLoading}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Accept Friend
                    </button>
                    <button
                      onClick={() => void handleRemoveOrCancelFriend()}
                      disabled={friendActionLoading}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Decline
                    </button>
                  </>
                )}

                {friendshipStatus === "friends" && (
                  <button
                    onClick={() => void handleRemoveOrCancelFriend()}
                    disabled={friendActionLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-50"
                  >
                    <UserMinus className="w-4 h-4" />
                    Remove Friend
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                {isOwn ? (
                  <>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1 block">Display Name</label>
                      <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm" />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1 block">Bio</label>
                      <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} rows={4} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm resize-none" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Pronouns" value={form.pronouns} onChange={(e) => setForm((f) => ({ ...f, pronouns: e.target.value }))} className="px-3 py-2 rounded-md bg-background border border-border text-sm" />
                      <input placeholder="Location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="px-3 py-2 rounded-md bg-background border border-border text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className="px-3 py-2 rounded-md bg-background border border-border text-sm" />
                      <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="px-3 py-2 rounded-md bg-background border border-border text-sm">
                        <option value="online">Online</option>
                        <option value="idle">Idle</option>
                        <option value="dnd">Do Not Disturb</option>
                        <option value="offline">Invisible</option>
                      </select>
                    </div>
                    <button onClick={handleSave} disabled={saving || uploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
                      <Save className="w-4 h-4" />
                      {saving ? "Saving..." : "Save Profile"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{profile.bio || "No bio yet."}</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                  <p className="capitalize">{isOwn ? form.status : profile.status}</p>
                </div>
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Pronouns</p>
                  <p>{isOwn ? form.pronouns || "Not set" : profile.pronouns || "Not set"}</p>
                </div>
                {serverRoleLabel && (
                  <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Server Role</p>
                    <span
                      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize"
                      style={{ borderColor: serverRoleLabel.color || "hsl(var(--border))", color: serverRoleLabel.color || "hsl(var(--foreground))" }}
                    >
                      {serverRoleLabel.name}
                    </span>
                  </div>
                )}
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>{isOwn ? form.location || "No location" : profile.location || "No location"}</span>
                </div>
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{isOwn ? form.website || "No website" : profile.website || "No website"}</span>
                </div>
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>Joined {format(new Date(profile.created_at), "MMM d, yyyy")}</span>
                </div>
                <div className="rounded-md bg-secondary/50 px-3 py-2 text-sm flex items-center gap-2">
                  <UserRound className="w-4 h-4 text-muted-foreground" />
                  <span>@{profile.username}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!isOwn && profile && (
        <UserModerationSidebar
          open={showModeration}
          onClose={() => setShowModeration(false)}
          serverId={contextServerId || undefined}
          user={{
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          }}
        />
      )}
    </div>
  );
};

export default ProfilePage;
