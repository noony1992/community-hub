-- Add voice moderation permissions to built-in admin/moderator roles.
UPDATE public.server_roles
SET permissions = CASE
  WHEN COALESCE(permissions, '[]'::jsonb) ? 'voice_kick_users' THEN permissions
  ELSE COALESCE(permissions, '[]'::jsonb) || '["voice_kick_users"]'::jsonb
END
WHERE lower(name) IN ('admin', 'moderator');

UPDATE public.server_roles
SET permissions = CASE
  WHEN COALESCE(permissions, '[]'::jsonb) ? 'voice_mute_users' THEN permissions
  ELSE COALESCE(permissions, '[]'::jsonb) || '["voice_mute_users"]'::jsonb
END
WHERE lower(name) IN ('admin', 'moderator');

UPDATE public.server_roles
SET permissions = CASE
  WHEN COALESCE(permissions, '[]'::jsonb) ? 'move_voice_users' THEN permissions
  ELSE COALESCE(permissions, '[]'::jsonb) || '["move_voice_users"]'::jsonb
END
WHERE lower(name) IN ('admin', 'moderator');
