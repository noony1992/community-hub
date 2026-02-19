-- Invite management enhancements:
-- - one-time invites (already represented via max_uses=1)
-- - role-limited invites via assigned_role
-- - invite revoke/revoke-all support via DELETE policy

ALTER TABLE public.invite_codes
ADD COLUMN IF NOT EXISTS assigned_role TEXT;

DROP POLICY IF EXISTS "Members can delete invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS "Users with invite permission can delete invite codes" ON public.invite_codes;
CREATE POLICY "Users with invite permission can delete invite codes"
ON public.invite_codes
FOR DELETE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_invites'));

-- Seed default invite-management capability for existing admin/mod roles.
UPDATE public.server_roles
SET permissions = CASE
  WHEN NOT (COALESCE(permissions, '[]'::jsonb) ? 'manage_invites')
    THEN COALESCE(permissions, '[]'::jsonb) || to_jsonb('manage_invites'::text)
  ELSE COALESCE(permissions, '[]'::jsonb)
END
WHERE lower(name) IN ('admin', 'moderator');
