-- Moderation toolkit: warnings, moderator notes, temporary bans UX support,
-- and auto-expiring punishments cleanup.

-- 1) Extend moderation audit action whitelist.
ALTER TABLE public.moderation_audit_logs
DROP CONSTRAINT IF EXISTS moderation_audit_logs_action_check;

ALTER TABLE public.moderation_audit_logs
ADD CONSTRAINT moderation_audit_logs_action_check
CHECK (
  action IN (
    'ban_user',
    'temp_ban_user',
    'unban_user',
    'edit_member_role',
    'delete_channel',
    'edit_ban_length',
    'timeout_user',
    'clear_timeout',
    'mute_user',
    'unmute_user',
    'warn_user',
    'add_mod_note'
  )
);

-- 2) Moderator notes per user.
CREATE TABLE IF NOT EXISTS public.user_moderation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(trim(note)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_moderation_notes_server_target_created
ON public.user_moderation_notes(server_id, target_user_id, created_at DESC);

ALTER TABLE public.user_moderation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with mod menu can view moderation notes"
ON public.user_moderation_notes
FOR SELECT
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users with mod menu can insert moderation notes"
ON public.user_moderation_notes
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'mod_menu')
  AND auth.uid() = author_id
);

-- 3) Warning records per user.
CREATE TABLE IF NOT EXISTS public.user_moderation_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  expires_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  cleared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  clear_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_moderation_warnings_server_target_created
ON public.user_moderation_warnings(server_id, target_user_id, created_at DESC);

ALTER TABLE public.user_moderation_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with mod menu can view moderation warnings"
ON public.user_moderation_warnings
FOR SELECT
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users with mod menu can insert moderation warnings"
ON public.user_moderation_warnings
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'mod_menu')
  AND auth.uid() = author_id
);

-- 4) Auto-expiry cleanup function for punishments.
CREATE OR REPLACE FUNCTION public.expire_moderation_punishments(_server_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_bans_count INTEGER := 0;
  expired_timeouts_count INTEGER := 0;
  expired_mutes_count INTEGER := 0;
  expired_warnings_count INTEGER := 0;
BEGIN
  DELETE FROM public.server_bans
  WHERE expires_at IS NOT NULL
    AND expires_at <= now()
    AND (_server_id IS NULL OR server_id = _server_id);
  GET DIAGNOSTICS expired_bans_count = ROW_COUNT;

  UPDATE public.server_members
  SET timed_out_until = NULL
  WHERE timed_out_until IS NOT NULL
    AND timed_out_until <= now()
    AND (_server_id IS NULL OR server_id = _server_id);
  GET DIAGNOSTICS expired_timeouts_count = ROW_COUNT;

  UPDATE public.server_members
  SET muted_until = NULL
  WHERE muted_until IS NOT NULL
    AND muted_until <= now()
    AND (_server_id IS NULL OR server_id = _server_id);
  GET DIAGNOSTICS expired_mutes_count = ROW_COUNT;

  UPDATE public.user_moderation_warnings
  SET cleared_at = now(),
      cleared_by = NULL,
      clear_reason = COALESCE(clear_reason, 'expired')
  WHERE cleared_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND (_server_id IS NULL OR server_id = _server_id);
  GET DIAGNOSTICS expired_warnings_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_bans', expired_bans_count,
    'expired_timeouts', expired_timeouts_count,
    'expired_mutes', expired_mutes_count,
    'expired_warnings', expired_warnings_count
  );
END;
$$;
