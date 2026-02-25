import type { RoleBadgeAppearance } from "@/lib/roleAppearance";

interface RoleBadgesProps {
  badges: RoleBadgeAppearance[];
  className?: string;
}

const RoleBadges = ({ badges, className }: RoleBadgesProps) => {
  if (!badges.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className || ""}`.trim()}>
      {badges.map((badge) => {
        const borderColor = badge.color || "hsl(var(--border))";
        const textColor = badge.color || "hsl(var(--foreground))";
        return (
          <span
            key={`${badge.id || badge.name}-${badge.position ?? "x"}`}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
            style={{ borderColor, color: textColor }}
          >
            {badge.icon ? <span className="leading-none">{badge.icon}</span> : null}
            <span>{badge.name}</span>
          </span>
        );
      })}
    </div>
  );
};

export default RoleBadges;

