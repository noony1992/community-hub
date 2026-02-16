import { useState, useEffect } from "react";
import { X, Settings, Hash, Trash2, Shield, Users, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChatContext } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";

interface ServerSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const ServerSettingsDialog = ({ open, onClose }: ServerSettingsDialogProps) => {
  const { user } = useAuth();
  const { activeServerId, servers, channels, members, refreshServers, refreshChannels } = useChatContext();
  const server = servers.find((s) => s.id === activeServerId);
  const isOwner = server?.owner_id === user?.id;

  const [tab, setTab] = useState<"overview" | "channels" | "members">("overview");
  const [serverName, setServerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState("text");

  useEffect(() => {
    if (server) setServerName(server.name);
  }, [server]);

  if (!open || !server) return null;

  const handleSaveServer = async () => {
    if (!serverName.trim() || !isOwner) return;
    setSaving(true);
    await supabase.from("servers").update({ name: serverName.trim() }).eq("id", server.id);
    await refreshServers();
    setSaving(false);
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!isOwner) return;
    await supabase.from("channels").delete().eq("id", channelId);
    await refreshChannels();
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !activeServerId) return;
    await supabase.from("channels").insert({ name: newChannelName.trim().toLowerCase().replace(/\s+/g, "-"), type: newChannelType, server_id: activeServerId });
    setNewChannelName("");
    await refreshChannels();
  };

  const handleKickMember = async (memberId: string) => {
    if (!isOwner || memberId === user?.id) return;
    await supabase.from("server_members").delete().eq("user_id", memberId).eq("server_id", server.id);
  };

  const handleDeleteServer = async () => {
    if (!isOwner) return;
    if (!confirm("Are you sure you want to delete this server? This cannot be undone.")) return;
    await supabase.from("servers").delete().eq("id", server.id);
    await refreshServers();
    onClose();
  };

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Settings },
    { id: "channels" as const, label: "Channels", icon: Hash },
    { id: "members" as const, label: "Members", icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="w-44 bg-secondary/50 p-3 space-y-1 shrink-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-2">Server Settings</h3>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                tab === t.id ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-chat-hover"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
          {isOwner && (
            <>
              <div className="h-px bg-border my-2" />
              <button
                onClick={handleDeleteServer}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Server
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">{tabs.find(t => t.id === tab)?.label}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Server Name</label>
                <input
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  disabled={!isOwner}
                  className="w-full px-3 py-2.5 rounded-md bg-background text-foreground border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Server Owner</label>
                <p className="text-sm text-foreground">{members.find(m => m.id === server.owner_id)?.display_name || "Unknown"}</p>
              </div>
              {isOwner && (
                <button
                  onClick={handleSaveServer}
                  disabled={saving || !serverName.trim()}
                  className="py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              )}
            </div>
          )}

          {tab === "channels" && (
            <div className="space-y-3">
              {isOwner && (
                <div className="flex gap-2 mb-4">
                  <input
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="New channel name"
                    className="flex-1 px-3 py-2 rounded-md bg-background text-foreground border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                  />
                  <select
                    value={newChannelType}
                    onChange={(e) => setNewChannelType(e.target.value)}
                    className="px-2 py-2 rounded-md bg-background text-foreground border border-border text-sm"
                  >
                    <option value="text">Text</option>
                    <option value="voice">Voice</option>
                  </select>
                  <button onClick={handleCreateChannel} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{ch.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">({ch.type})</span>
                  </div>
                  {isOwner && (
                    <button onClick={() => handleDeleteChannel(ch.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-2">
              {members.map((m) => {
                const initials = m.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-foreground"
                        style={{ backgroundColor: `hsl(${(m.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm text-foreground font-medium">{m.display_name}</p>
                        <p className="text-xs text-muted-foreground">@{m.username}</p>
                      </div>
                      {m.id === server.owner_id && (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <Shield className="w-3 h-3" /> Owner
                        </span>
                      )}
                    </div>
                    {isOwner && m.id !== user?.id && (
                      <button onClick={() => handleKickMember(m.id)} className="text-xs text-muted-foreground hover:text-destructive">
                        Kick
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServerSettingsDialog;
