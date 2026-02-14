import { useState } from "react";
import { useChatContext, type Message } from "@/context/ChatContext";
import { Search, X, Hash } from "lucide-react";
import { format } from "date-fns";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  message: Message;
  channel_name: string;
  server_name: string;
}

const SearchDialog = ({ open, onClose }: SearchDialogProps) => {
  const { searchMessages, setActiveChannel, servers, setActiveServer } = useChatContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await searchMessages(query);
    setResults(res);
    setLoading(false);
  };

  const handleResultClick = (result: SearchResult) => {
    // Navigate to the channel containing the message
    const server = servers.find(s => s.name === result.server_name);
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
        className="relative bg-card border border-border rounded-lg w-[520px] max-h-[60vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
            autoFocus
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
          )}
          {!loading && results.length === 0 && query && (
            <p className="text-sm text-muted-foreground text-center py-4">No results found</p>
          )}
          {!loading && !query && (
            <p className="text-sm text-muted-foreground text-center py-4">Type to search across all channels</p>
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
                <span>·</span>
                <span>{result.server_name}</span>
                <span>·</span>
                <span>{format(new Date(result.message.created_at), "MMM d, yyyy")}</span>
              </div>
              <p className="text-sm text-foreground line-clamp-2">{result.message.content}</p>
              {result.message.attachment_name && (
                <p className="text-xs text-primary mt-0.5">📎 {result.message.attachment_name}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchDialog;
