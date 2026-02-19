export type AuditLevel = "info" | "warn" | "error";

export type AuditLogEvent = {
  level: AuditLevel;
  scope: string;
  event: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

type AuditLogEntry = AuditLogEvent & {
  at: string;
};

const STORAGE_KEY = "community-hub:audit-log";
const MAX_ENTRIES = 200;

const writeToStorage = (entry: AuditLogEntry) => {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as AuditLogEntry[]) : [];
    const next = [...existing.slice(-MAX_ENTRIES + 1), entry];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort only; avoid breaking runtime behavior.
  }
};

export const auditLog = ({ level, scope, event, requestId, details }: AuditLogEvent) => {
  const entry: AuditLogEntry = {
    level,
    scope,
    event,
    requestId,
    details,
    at: new Date().toISOString(),
  };

  if (level === "error") {
    console.error("[audit]", entry);
  } else if (level === "warn") {
    console.warn("[audit]", entry);
  } else {
    console.info("[audit]", entry);
  }

  writeToStorage(entry);
};

