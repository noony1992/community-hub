import type { CSSProperties } from "react";

export type RoleTextStyle = "normal" | "bold" | "italic" | "underline";
export type RoleTextEffect = "none" | "glow" | "shadow";

export type RoleBadgeAppearance = {
  id?: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  username_color?: string | null;
  username_style?: string | null;
  username_effect?: string | null;
  position?: number | null;
};

export type RoleAwareUser = {
  role_color?: string | null;
  role_username_color?: string | null;
  role_username_style?: string | null;
  role_username_effect?: string | null;
};

const normalizeStyle = (value?: string | null): RoleTextStyle => {
  if (value === "bold" || value === "italic" || value === "underline") return value;
  return "normal";
};

const normalizeEffect = (value?: string | null): RoleTextEffect => {
  if (value === "glow" || value === "shadow") return value;
  return "none";
};

export const getRoleNamePresentation = (
  roleSource?: RoleAwareUser | null,
): { className: string; style: CSSProperties } => {
  const styleToken = normalizeStyle(roleSource?.role_username_style);
  const effectToken = normalizeEffect(roleSource?.role_username_effect);
  const color = roleSource?.role_username_color || roleSource?.role_color || undefined;

  const className = [
    styleToken === "bold" ? "font-bold" : "",
    styleToken === "italic" ? "italic" : "",
    styleToken === "underline" ? "underline underline-offset-2" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {};
  if (color) style.color = color;
  if (effectToken === "glow") {
    style.textShadow = `0 0 10px ${color || "rgba(255,255,255,0.45)"}`;
  } else if (effectToken === "shadow") {
    style.textShadow = "0 1px 3px rgba(0,0,0,0.45)";
  }

  return { className, style };
};

