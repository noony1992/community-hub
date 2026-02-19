export type UserNotificationSettings = {
  user_id: string;
  mention_only: boolean;
  keyword_alerts: string[] | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
};

export type UserNotificationMute = {
  user_id: string;
  scope_type: "server" | "channel";
  scope_id: string;
};

const normalizeMinuteValue = (v: string) => {
  const [hh = "0", mm = "0"] = v.split(":");
  const h = Number.parseInt(hh, 10);
  const m = Number.parseInt(mm, 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export const isWithinQuietHours = (settings: UserNotificationSettings, now = new Date()) => {
  if (!settings.quiet_hours_enabled) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      timeZone: settings.quiet_hours_timezone || "UTC",
    }).formatToParts(now);
    const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMinutes = hour * 60 + minute;
    const startMinutes = normalizeMinuteValue(settings.quiet_hours_start);
    const endMinutes = normalizeMinuteValue(settings.quiet_hours_end);
    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } catch {
    return false;
  }
};

export const normalizeKeywords = (keywords: string[] | null | undefined) =>
  (keywords || []).map((k) => k.trim().toLowerCase()).filter((k) => !!k);

export const contentMatchesKeyword = (content: string, keywords: string[] | null | undefined) => {
  const normalizedContent = content.toLowerCase();
  return normalizeKeywords(keywords).some((k) => normalizedContent.includes(k));
};
