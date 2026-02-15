import { useEffect, useRef } from "react";

interface MentionAutocompleteProps {
  query: string;
  members: { id: string; username: string; display_name: string }[];
  onSelect: (username: string) => void;
  visible: boolean;
}

const MentionAutocomplete = ({ query, members, onSelect, visible }: MentionAutocompleteProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const filtered = members.filter(
    (m) =>
      m.username.toLowerCase().includes(query.toLowerCase()) ||
      m.display_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  if (!visible || filtered.length === 0) return null;

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-1 w-64 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
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

export const renderContentWithMentions = (content: string, members: { username: string }[]) => {
  const mentionRegex = /@(\w+)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const username = match[1];
    const isMember = members.some((m) => m.username.toLowerCase() === username.toLowerCase());
    if (isMember) {
      parts.push(
        <span key={match.index} className="bg-primary/20 text-primary rounded px-0.5 font-medium">
          @{username}
        </span>
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.length > 0 ? parts : [content];
};
