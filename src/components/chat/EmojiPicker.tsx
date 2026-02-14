import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";

const EMOJI_LIST = [
  "👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥",
  "👀", "💯", "✅", "❌", "🙏", "👏", "🤔", "😍",
  "🚀", "💪", "⭐", "🎯", "💡", "🤝", "😎", "🥳",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  children?: React.ReactNode;
}

const EmojiPicker = ({ onSelect, children }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <button className="p-0.5 text-muted-foreground hover:text-foreground transition-colors">
            <Smile className="w-3.5 h-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" side="top" align="start">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); setOpen(false); }}
              className="w-7 h-7 flex items-center justify-center text-lg hover:bg-chat-hover rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
