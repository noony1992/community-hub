import { useState } from "react";
import { useChatContext, type MessageSearchResult } from "@/context/ChatContext";
import { Search, X, Hash } from "lucide-react";
import { format } from "date-fns";
import { DialogListSkeleton } from "@/components/skeletons/AppSkeletons";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

const SearchDialog = ({ open, onClose }: SearchDialogProps) => {
  const { searchMessages, setActiveChannel, servers, setActiveServer } = useChatContext();
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [hasAttachment, setHasAttachment] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() && !userFilter.trim() && !channelFilter.trim() && !dateFilter && !hasAttachment && !pinnedOnly) return;
    setLoading(true);
    const res = await searchMessages(query, {
      user: userFilter,
      channel: channelFilter,
      date: dateFilter,
      hasAttachment,
      pinned: pinnedOnly,
    });
    setResults(res);
    setLoading(false);
  };

  const handleResultClick = (result: MessageSearchResult) => {
    const server = servers.find((s) => s.id === result.server_id);
    if (server) {
      setActiveServer(server.id);
      setTimeout(() => setActiveChannel(result.message.channel_id), 100);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-card border border-border rounded-lg w-[760px] max-w-[95vw] max-h-[72vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Global search text (supports has:attachment and pinned tokens)"
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
            autoFocus
          />
          <button
            onClick={handleSearch}
            className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium"
          >
            Search
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border/60 bg-secondary/20 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="User"
            className="px-2 py-1.5 rounded-md bg-background border border-border text-xs"
          />
          <input
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Channel"
            className="px-2 py-1.5 rounded-md bg-background border border-border text-xs"
          />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-background border border-border text-xs"
          />
          <label className="flex items-center gap-2 text-xs text-foreground px-2">
            <input
              type="checkbox"
              checked={hasAttachment}
              onChange={(e) => setHasAttachment(e.target.checked)}
              className="rounded border-border"
            />
            has:attachment
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground px-2">
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => setPinnedOnly(e.target.checked)}
              className="rounded border-border"
            />
            pinned
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="py-2">
              <DialogListSkeleton rows={4} />
            </div>
          )}
          {!loading && results.length === 0 && (query || userFilter || channelFilter || dateFilter || hasAttachment || pinnedOnly) && (
            <p className="text-sm text-muted-foreground text-center py-4">No results found</p>
          )}
          {!loading && !query && !userFilter && !channelFilter && !dateFilter && !hasAttachment && !pinnedOnly && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Search globally by text plus user/channel/date/attachment/pinned filters.
            </p>
          )}
          {results.map((result) => (
            <button
              key={result.message.id}
              onClick={() => handleResultClick(result)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-chat-hover transition-colors"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Hash className="w-3 h-3" />
                <span>{result.channel_name}</span>
                <span>•</span>
                <span>{result.server_name}</span>
                <span>•</span>
                <span>{result.author_name}</span>
                <span>•</span>
                <span>{format(new Date(result.message.created_at), "MMM d, yyyy")}</span>
              </div>
              <p className="text-sm text-foreground line-clamp-2">{result.message.content}</p>
              {result.message.attachment_name && (
                <p className="text-xs text-primary mt-0.5">Attachment: {result.message.attachment_name}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchDialog;
