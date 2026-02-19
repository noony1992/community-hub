-- Add "mod_menu" permission to legacy admin/moderator-style roles.
UPDATE public.server_roles
SET permissions = CASE
  WHEN COALESCE(permissions, '[]'::jsonb) ? 'mod_menu' THEN permissions
  ELSE COALESCE(permissions, '[]'::jsonb) || '["mod_menu"]'::jsonb
END
WHERE lower(name) IN ('admin', 'moderator');
