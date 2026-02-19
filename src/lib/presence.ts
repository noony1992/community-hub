const PRESENCE_STALE_AFTER_MS = 45_000;

export const getEffectiveStatus = (
  status: string | null | undefined,
  updatedAt: string | null | undefined,
): "online" | "idle" | "dnd" | "offline" => {
  const normalized = (status || "offline") as "online" | "idle" | "dnd" | "offline";
  if (normalized === "offline") return "offline";
  if (!updatedAt) return normalized;

  const last = new Date(updatedAt).getTime();
  if (Number.isNaN(last)) return normalized;

  return Date.now() - last > PRESENCE_STALE_AFTER_MS ? "offline" : normalized;
};
