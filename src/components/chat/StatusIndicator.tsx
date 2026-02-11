interface StatusIndicatorProps {
  status: "online" | "idle" | "dnd" | "offline";
  className?: string;
  size?: "sm" | "md";
}

const statusColors: Record<string, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const StatusIndicator = ({ status, className = "", size = "sm" }: StatusIndicatorProps) => {
  const sizeClass = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div
      className={`${sizeClass} rounded-full border-2 border-server-bar ${statusColors[status]} ${className}`}
    />
  );
};

export default StatusIndicator;
