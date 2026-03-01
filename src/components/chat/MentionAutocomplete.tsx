import { useEffect, useRef } from "react";

interface MentionAutocompleteProps {
  query: string;
  members: { id: string; username: string; display_name: string }[];
  onSelect: (username: string) => void;
  visible: boolean;
  allowEveryone?: boolean;
}

const MentionAutocomplete = ({ query, members, onSelect, visible, allowEveryone = true }: MentionAutocompleteProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const queryLower = query.toLowerCase();
  const showEveryone = allowEveryone && (queryLower.length === 0 || "everyone".startsWith(queryLower));

  const filtered = members.filter(
    (m) =>
      m.username.toLowerCase().includes(queryLower) ||
      m.display_name.toLowerCase().includes(queryLower)
  ).slice(0, 6);

  if (!visible || (filtered.length === 0 && !showEveryone)) return null;

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-1 w-64 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
      {showEveryone && (
        <button
          onClick={() => onSelect("everyone")}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-chat-hover transition-colors text-left"
        >
          <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-semibold">
            @
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-foreground font-medium">@everyone</span>
            <span className="text-muted-foreground ml-1 text-xs">Notify all server members</span>
          </div>
        </button>
      )}
      {filtered.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.username)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-chat-hover transition-colors text-left"
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-foreground"
            style={{ backgroundColor: `hsl(${(m.id.charCodeAt(1) || 0) * 60 % 360}, 50%, 35%)` }}
          >
            {m.display_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-foreground font-medium">{m.display_name}</span>
            <span className="text-muted-foreground ml-1 text-xs">@{m.username}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default MentionAutocomplete;

type ChannelReference = {
  id: string;
  name: string;
  server_id?: string;
  type?: string;
};

type RenderContentOptions = {
  channels?: ChannelReference[];
  onChannelClick?: (channel: ChannelReference) => void;
  onMentionClick?: (username: string, anchorEl: HTMLElement) => void;
};

export const renderContentWithMentions = (
  content: string,
  members: { username: string }[],
  options?: RenderContentOptions,
) => {
  const tokenRegex = /[@#][A-Za-z0-9_-]+/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  const channels = options?.channels || [];

  while ((match = tokenRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    const prevChar = match.index > 0 ? content[match.index - 1] : "";
    const hasBoundary = match.index === 0 || !/[A-Za-z0-9_/-]/.test(prevChar);
    if (!hasBoundary) {
      parts.push(token);
      lastIndex = match.index + token.length;
      continue;
    }

    if (token.startsWith("@")) {
      const username = token.slice(1);
      const isMember = members.some((m) => m.username.toLowerCase() === username.toLowerCase());
      const isEveryone = username.toLowerCase() === "everyone";
      if (isMember || isEveryone) {
        if (isMember && options?.onMentionClick) {
          parts.push(
            <button
              key={match.index}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                options.onMentionClick?.(username, e.currentTarget);
              }}
              className="inline bg-primary/20 text-primary rounded px-0.5 font-medium hover:bg-primary/30 transition-colors"
              title={`View @${username}`}
            >
              @{username}
            </button>
          );
        } else {
          parts.push(
            <span key={match.index} className="bg-primary/20 text-primary rounded px-0.5 font-medium">
              @{username}
            </span>
          );
        }
      } else {
        parts.push(token);
      }
      lastIndex = match.index + token.length;
      continue;
    }

    const channelName = token.slice(1).toLowerCase();
    const channel =
      channels.find((c) => c.name.toLowerCase() === channelName && (c.type === "text" || c.type === "forum")) ||
      channels.find((c) => c.name.toLowerCase() === channelName);

    if (channel) {
      parts.push(
        <button
          key={match.index}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            options?.onChannelClick?.(channel);
          }}
          className="inline bg-primary/20 text-primary rounded px-0.5 font-medium hover:bg-primary/30 transition-colors"
          title={`Go to #${channel.name}`}
        >
          #{channel.name}
        </button>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.length > 0 ? parts : [content];
};
