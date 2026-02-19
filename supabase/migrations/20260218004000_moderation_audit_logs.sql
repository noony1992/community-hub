CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'ban_user',
      'unban_user',
      'edit_member_role',
      'delete_channel',
      'edit_ban_length'
    )
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_server_created
ON public.moderation_audit_logs(server_id, created_at DESC);

ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view moderation audit logs"
ON public.moderation_audit_logs
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Members can insert moderation audit logs for themselves"
ON public.moderation_audit_logs
FOR INSERT
WITH CHECK (
  public.is_server_member(auth.uid(), server_id)
  AND auth.uid() = actor_id
);
